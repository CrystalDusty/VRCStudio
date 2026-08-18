// Turning a VRChat animation back into something you can actually save.
//
// The thing that makes this necessary: VRChat animated emoji are NOT animated
// image files. They're a single PNG sprite sheet — a grid of frames — plus two
// numbers stored on the file record: `frames` (2–64) and `framesOverTime`
// (fps). VRChat's client cuts the grid up and plays it. Download the file and
// you get the contact sheet, which is why "save the original" wasn't the
// answer for emoji even though it is for a real GIF.
//
// So: reconstruct the frames (from the grid, or by decoding a genuinely
// animated file), then re-encode to something that moves — GIF for anywhere
// that takes an image, WebM/MP4 for anywhere that takes a video.

import { encodeGif, type GifFrame } from './gif';

/** How a sprite sheet is cut up. */
export interface SpriteLayout {
  columns: number;
  rows: number;
  /** Frames actually used; the tail of the last row may be padding. */
  count: number;
  /** The sheet these cells were measured against — slicing needs it exactly. */
  sheetWidth: number;
  sheetHeight: number;
  /** Cell size, rounded for display. Slicing uses exact fractional bounds. */
  frameWidth: number;
  frameHeight: number;
}

export type LoopStyle = 'linear' | 'pingpong';

export interface AnimationSpec {
  frameCount: number;
  fps: number;
  loopStyle: LoopStyle;
}

/** VRChat's documented range for an animated image. Anything else isn't a sheet. */
export const MIN_SPRITE_FRAMES = 2;
export const MAX_SPRITE_FRAMES = 64;

function layoutFor(width: number, height: number, count: number, columns: number, rows: number): SpriteLayout {
  return {
    columns, rows, count,
    sheetWidth: width, sheetHeight: height,
    frameWidth: Math.round(width / columns),
    frameHeight: Math.round(height / rows),
  };
}

/** How far from square this layout's cells are. 1 means square. */
export function cellAspect(layout: SpriteLayout): number {
  const w = layout.sheetWidth / layout.columns;
  const h = layout.sheetHeight / layout.rows;
  if (w <= 0 || h <= 0) return Infinity;
  return Math.max(w, h) / Math.min(w, h);
}

/**
 * Rank the plausible grids for a sheet of `count` frames.
 *
 * The prior that matters is that emoji frames are square, so the grid's shape
 * has to match the sheet's shape. Everything else follows from that: least
 * wasted cells next, and dividing the sheet into whole pixels only as a
 * tiebreak.
 *
 * Requiring whole-pixel division as a *rule* is what broke this. On a
 * 1024×1024 sheet only power-of-two row counts divide evenly, so for 17–48
 * frames every near-square grid was rejected and the best survivor was
 * something like 16×2 — 64×512 cells, which is why a downloaded emoji came out
 * as an unusable sliver.
 */
export function rankSpriteLayouts(width: number, height: number, count: number): SpriteLayout[] {
  const candidates: Array<{ layout: SpriteLayout; score: number }> = [];
  // Rows are enumerated independently of columns rather than derived as
  // ceil(count/columns), because a sheet may carry padding cells in its last
  // row — but only there. A grid whose final row is entirely empty isn't a
  // packing anyone produces, and excluding those removed every wrong answer in
  // a sweep of low frame counts, where a padded grid could otherwise look
  // plausible by covering only part of the sheet.
  for (let columns = 1; columns <= count; columns++) {
    for (let rows = 1; rows <= count; rows++) {
      const cells = columns * rows;
      if (cells < count) continue;
      if (columns * (rows - 1) >= count) continue;
      const layout = layoutFor(width, height, count, columns, rows);
      const aspect = cellAspect(layout);
      const whole = width % columns === 0 && height % rows === 0 ? 0 : 1;
      // Squareness dominates: a couple of blank cells or a fractional edge is
      // a rounding detail next to a frame eight times taller than it is wide.
      candidates.push({ layout, score: (aspect - 1) * 100 + (cells - count) * 2 + whole * 0.25 });
    }
  }
  return candidates.sort((a, b) => a.score - b.score).map(c => c.layout);
}

/**
 * The most likely grid for a sheet of `count` frames, from geometry alone.
 *
 * A deduction, not something VRChat publishes — which is why the modal plays
 * the result and lets it be corrected, and why `chooseSpriteLayout` checks it
 * against the actual pixels when it can.
 */
export function guessSpriteLayout(width: number, height: number, count: number): SpriteLayout {
  if (count <= 1 || width <= 0 || height <= 0) {
    return {
      columns: 1, rows: 1, count: Math.max(1, count),
      sheetWidth: width, sheetHeight: height,
      frameWidth: width, frameHeight: height,
    };
  }
  return rankSpriteLayouts(width, height, count)[0];
}

/** The frame order for a loop style — pingpong runs back down without repeating the ends. */
export function frameOrder(count: number, loopStyle: LoopStyle): number[] {
  const forward = Array.from({ length: count }, (_, i) => i);
  if (loopStyle !== 'pingpong' || count < 3) return forward;
  return [...forward, ...forward.slice(1, -1).reverse()];
}

// ── Getting frames out ──────────────────────────────────────────────────────

export interface ExtractedFrames {
  frames: ImageData[];
  width: number;
  height: number;
  /** Per-frame duration in ms, same length as `frames`. */
  delays: number[];
  source: 'spritesheet' | 'decoded';
}

function context(width: number, height: number): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not get a 2D canvas');
  return ctx;
}

/**
 * Where cell `index` sits on the sheet.
 *
 * Boundaries are computed from exact fractions and rounded per edge, so a grid
 * that doesn't divide the sheet into whole pixels stays aligned instead of
 * drifting a pixel further off with every column.
 */
function cellRect(layout: SpriteLayout, index: number) {
  const col = index % layout.columns;
  const row = Math.floor(index / layout.columns);
  const x0 = Math.round((col * layout.sheetWidth) / layout.columns);
  const x1 = Math.round(((col + 1) * layout.sheetWidth) / layout.columns);
  const y0 = Math.round((row * layout.sheetHeight) / layout.rows);
  const y1 = Math.round(((row + 1) * layout.sheetHeight) / layout.rows);
  return { x: x0, y: y0, width: Math.max(1, x1 - x0), height: Math.max(1, y1 - y0) };
}

/**
 * Check a candidate grid against the pixels.
 *
 * Consecutive frames of an animation look like each other; consecutive slices
 * of a sheet cut on the wrong grid don't. Comparing thumbnails of each cell to
 * the next gives a number that's low when the grid is right and high when it
 * isn't — a measurement, where the geometry above is only a prior.
 *
 * Returns the mean per-channel difference between neighbouring cells, 0–255.
 */
export function gridCoherence(image: CanvasImageSource, layout: SpriteLayout): number {
  const N = 12;   // thumbnail size; enough shape, cheap enough to do per candidate
  const ctx = context(N, N);
  const thumbs: Uint8ClampedArray[] = [];
  for (let i = 0; i < layout.count; i++) {
    const r = cellRect(layout, i);
    ctx.clearRect(0, 0, N, N);
    ctx.drawImage(image, r.x, r.y, r.width, r.height, 0, 0, N, N);
    thumbs.push(ctx.getImageData(0, 0, N, N).data);
  }
  if (thumbs.length < 2) return 0;

  let total = 0;
  let samples = 0;
  for (let i = 1; i < thumbs.length; i++) {
    const a = thumbs[i - 1], b = thumbs[i];
    for (let p = 0; p < a.length; p += 4) {
      // Compare premultiplied colour so a transparent pixel doesn't register
      // as a wild colour difference against an opaque one.
      const aa = a[p + 3] / 255, ba = b[p + 3] / 255;
      total += Math.abs(a[p] * aa - b[p] * ba)
             + Math.abs(a[p + 1] * aa - b[p + 1] * ba)
             + Math.abs(a[p + 2] * aa - b[p + 2] * ba)
             + Math.abs(a[p + 3] - b[p + 3]);
      samples += 4;
    }
  }
  return samples === 0 ? 0 : total / samples;
}

/**
 * Pick the grid, using the image itself to settle it.
 *
 * Geometry alone is not enough: a sheet genuinely packed 6×4 has 1.5:1 cells,
 * and a squarest-cells-win rule picks 5×5 over it every time. So geometry only
 * draws up a shortlist, and the pixels choose — measuring, for each candidate,
 * how well one frame flows into the next.
 *
 * Measured across sheets packed 6×4, 5×5 and 4×6, the true grid always scored
 * the most coherent, but by as little as 9%. So the rule is simply "most
 * coherent wins", with geometry breaking ties among candidates that are within
 * a few percent of each other.
 *
 * The shortlist is deliberately generous — a real grid can sit as deep as 30th
 * by geometry (61 frames packed 12×6) — and is trimmed only of shapes no emoji
 * sheet would have.
 */
export function chooseSpriteLayout(
  image: CanvasImageSource,
  width: number,
  height: number,
  count: number,
): SpriteLayout {
  if (count <= 1) return guessSpriteLayout(width, height, count);
  const ranked = rankSpriteLayouts(width, height, count);
  if (ranked.length === 0) return guessSpriteLayout(width, height, count);

  // Cells more than 3:1 aren't frames of anything, and dropping them keeps the
  // measurement cheap.
  const plausible = ranked.filter(l => cellAspect(l) <= 3);
  const shortlist = (plausible.length > 0 ? plausible : ranked).slice(0, 48);
  if (shortlist.length === 1) return shortlist[0];

  // Coherence compares each frame to the next, so a handful of frames means a
  // handful of comparisons and a noisy number — noisy enough to have picked a
  // 3:1 strip over a 2×2 for a three-frame sheet. Below this, geometry decides,
  // and with so few candidates geometry is reliable there anyway.
  if (count < 7) return shortlist[0];

  try {
    const scored = shortlist.map((layout, rank) => ({
      layout, rank, coherence: gridCoherence(image, layout),
    }));
    const best = scored.reduce((a, b) => (b.coherence < a.coherence ? b : a));
    // Anything this close is the same answer as far as the pixels are
    // concerned — let the geometry decide between them.
    const tied = scored.filter(c => c.coherence <= best.coherence * 1.05);
    return tied.reduce((a, b) => (b.rank < a.rank ? b : a)).layout;
  } catch {
    // No canvas to measure with — the geometric answer still stands.
    return ranked[0];
  }
}

/** Cut a sprite sheet into frames, in play order. */
export function framesFromSpriteSheet(
  image: CanvasImageSource,
  layout: SpriteLayout,
  spec: AnimationSpec,
): ExtractedFrames {
  const w = Math.max(1, layout.frameWidth);
  const h = Math.max(1, layout.frameHeight);
  const ctx = context(w, h);
  const cells: ImageData[] = [];
  for (let i = 0; i < layout.count; i++) {
    const r = cellRect(layout, i);
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(image, r.x, r.y, r.width, r.height, 0, 0, w, h);
    cells.push(ctx.getImageData(0, 0, w, h));
  }

  const order = frameOrder(layout.count, spec.loopStyle);
  const delay = Math.max(10, Math.round(1000 / Math.max(1, spec.fps)));
  return {
    frames: order.map(i => cells[i]),
    delays: order.map(() => delay),
    width: w,
    height: h,
    source: 'spritesheet',
  };
}

/** Minimal shape of the WebCodecs ImageDecoder we rely on. */
type ImageDecoderCtor = new (init: { data: ArrayBuffer | Uint8Array; type: string }) => {
  completed: Promise<void>;
  tracks: { ready: Promise<void>; selectedTrack?: { frameCount: number } };
  decode(opts: { frameIndex: number }): Promise<{ image: VideoFrame }>;
  close(): void;
};

/**
 * Pull the frames out of a genuinely animated file (GIF, APNG, animated WebP).
 *
 * Uses WebCodecs' ImageDecoder, which Chromium has and which understands every
 * animated format we can detect. Returns null when it isn't available or the
 * file turns out to hold a single frame, so callers can fall back rather than
 * present an empty animation.
 */
export async function framesFromAnimatedFile(
  blob: Blob,
  mimeType: string,
): Promise<ExtractedFrames | null> {
  const Decoder = (globalThis as unknown as { ImageDecoder?: ImageDecoderCtor }).ImageDecoder;
  if (!Decoder) return null;

  try {
    const buffer = await blob.arrayBuffer();
    const dec = new Decoder({ data: buffer, type: mimeType });
    await dec.tracks.ready;
    const total = dec.tracks.selectedTrack?.frameCount ?? 0;
    if (total < 2) { dec.close(); return null; }

    const frames: ImageData[] = [];
    const delays: number[] = [];
    let width = 0;
    let height = 0;
    let ctx: CanvasRenderingContext2D | null = null;

    for (let i = 0; i < total; i++) {
      const { image } = await dec.decode({ frameIndex: i });
      if (!ctx) {
        width = image.displayWidth;
        height = image.displayHeight;
        ctx = context(width, height);
      }
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(image as unknown as CanvasImageSource, 0, 0);
      frames.push(ctx.getImageData(0, 0, width, height));
      // duration is in microseconds; a file that omits it gets a sane default.
      delays.push(image.duration ? Math.max(10, Math.round(image.duration / 1000)) : 100);
      image.close();
    }
    dec.close();
    return { frames, delays, width, height, source: 'decoded' };
  } catch {
    // A format ImageDecoder won't take, or a truncated file. The caller has a
    // sprite-sheet path and an "original" path; neither needs an exception.
    return null;
  }
}

// ── Re-encoding ─────────────────────────────────────────────────────────────

export interface RenderOptions {
  /** Scale applied to every frame. 1 = native. */
  scale?: number;
  /** Flatten onto this colour. Required for video, which has no alpha. */
  background?: string | null;
}

/** Resize / flatten frames before encoding. Returns the originals when there's nothing to do. */
export function prepareFrames(
  extracted: ExtractedFrames,
  opts: RenderOptions = {},
): { frames: ImageData[]; width: number; height: number } {
  const scale = Math.max(0.05, opts.scale ?? 1);
  const bg = opts.background ?? null;
  if (scale === 1 && !bg) {
    return { frames: extracted.frames, width: extracted.width, height: extracted.height };
  }

  const width = Math.max(1, Math.round(extracted.width * scale));
  const height = Math.max(1, Math.round(extracted.height * scale));
  const src = context(extracted.width, extracted.height);
  const dst = context(width, height);
  dst.imageSmoothingQuality = 'high';

  const frames = extracted.frames.map(frame => {
    src.putImageData(frame, 0, 0);
    dst.clearRect(0, 0, width, height);
    if (bg) {
      dst.fillStyle = bg;
      dst.fillRect(0, 0, width, height);
    }
    dst.drawImage(src.canvas, 0, 0, extracted.width, extracted.height, 0, 0, width, height);
    return dst.getImageData(0, 0, width, height);
  });

  return { frames, width, height };
}

/** Encode extracted frames as an animated GIF. */
export function toGif(extracted: ExtractedFrames, opts: RenderOptions = {}): Blob {
  const { frames, width, height } = prepareFrames(extracted, opts);
  const gifFrames: GifFrame[] = frames.map((f, i) => ({
    data: f.data,
    delayMs: extracted.delays[i] ?? 100,
  }));
  const bytes = encodeGif({ width, height, frames: gifFrames, loopCount: 0 });
  return new Blob([bytes.buffer as ArrayBuffer], { type: 'image/gif' });
}

export interface VideoFormat {
  /** What to hand MediaRecorder. */
  mimeType: string;
  /** File extension. */
  extension: string;
  label: string;
}

const VIDEO_CANDIDATES: VideoFormat[] = [
  { mimeType: 'video/mp4;codecs=avc1.42E01E', extension: 'mp4', label: 'MP4' },
  { mimeType: 'video/mp4', extension: 'mp4', label: 'MP4' },
  { mimeType: 'video/webm;codecs=vp9', extension: 'webm', label: 'WebM' },
  { mimeType: 'video/webm;codecs=vp8', extension: 'webm', label: 'WebM' },
  { mimeType: 'video/webm', extension: 'webm', label: 'WebM' },
];

/**
 * Which video containers this build can actually write.
 *
 * Chromium only gained MP4 recording recently, so MP4 is offered when it works
 * and simply absent when it doesn't — better than a button that fails.
 */
export function supportedVideoFormats(): VideoFormat[] {
  if (typeof MediaRecorder === 'undefined') return [];
  const out: VideoFormat[] = [];
  for (const c of VIDEO_CANDIDATES) {
    if (out.some(o => o.extension === c.extension)) continue;
    try {
      if (MediaRecorder.isTypeSupported(c.mimeType)) out.push(c);
    } catch { /* isTypeSupported can throw on odd strings */ }
  }
  return out;
}

export interface VideoOptions extends RenderOptions {
  fps: number;
  /** Repeat the sequence until it's at least this long, so it isn't a blink. */
  minDurationMs?: number;
}

/**
 * Encode frames to video via MediaRecorder.
 *
 * captureStream(0) means no automatic frame capture — we push each frame with
 * requestFrame() so the timing comes from the animation rather than from how
 * fast this machine happens to be. Recording runs in real time, so a two
 * second clip takes two seconds.
 *
 * Video has no alpha here, so transparent pixels are flattened onto the chosen
 * background before recording. That's a property of the container, and the
 * reason GIF is offered alongside.
 */
export async function toVideo(
  extracted: ExtractedFrames,
  format: VideoFormat,
  opts: VideoOptions,
): Promise<Blob> {
  if (typeof MediaRecorder === 'undefined') throw new Error('This build cannot record video');

  const { frames, width, height } = prepareFrames(extracted, {
    ...opts,
    background: opts.background ?? '#000000',
  });
  if (frames.length === 0) throw new Error('Nothing to encode');

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get a 2D canvas');

  const stream = canvas.captureStream(0);
  const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
  const recorder = new MediaRecorder(stream, { mimeType: format.mimeType });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

  const done = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: format.mimeType.split(';')[0] }));
    recorder.onerror = () => reject(new Error('Recording failed'));
  });

  const perFrame = extracted.delays.map(d => Math.max(20, d));
  const cycle = perFrame.reduce((a, b) => a + b, 0);
  const loops = Math.max(1, Math.ceil((opts.minDurationMs ?? 2000) / Math.max(1, cycle)));

  recorder.start();
  try {
    for (let loop = 0; loop < loops; loop++) {
      for (let i = 0; i < frames.length; i++) {
        ctx.putImageData(frames[i], 0, 0);
        track.requestFrame();
        await new Promise(r => setTimeout(r, perFrame[i]));
      }
    }
  } finally {
    // One extra beat so the final frame lands in the stream before we stop.
    await new Promise(r => setTimeout(r, 60));
    recorder.stop();
    track.stop();
  }
  return done;
}
