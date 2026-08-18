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
  frameWidth: number;
  frameHeight: number;
}

export type LoopStyle = 'linear' | 'pingpong';

export interface AnimationSpec {
  frameCount: number;
  fps: number;
  loopStyle: LoopStyle;
}

/**
 * Work out the grid for a sheet of `count` frames.
 *
 * VRChat doesn't publish the packing, so this reasons from what a sheet must
 * be: an exact grid whose cells are the same shape as each other. Candidates
 * that don't divide the image evenly are rejected outright, and among the rest
 * the squarest cell wins — a 1024×1024 sheet of 16 frames is 4×4, not 16×1.
 *
 * It's a deduction, not a fact, which is why the modal shows the result
 * playing and lets it be overridden.
 */
export function guessSpriteLayout(width: number, height: number, count: number): SpriteLayout {
  if (count <= 1) {
    return { columns: 1, rows: 1, count: 1, frameWidth: width, frameHeight: height };
  }

  let best: SpriteLayout | null = null;
  let bestScore = Infinity;
  for (let columns = 1; columns <= count; columns++) {
    const rows = Math.ceil(count / columns);
    if (width % columns !== 0 || height % rows !== 0) continue;
    const frameWidth = width / columns;
    const frameHeight = height / rows;
    // Squarest cells first; then the least wasted space in the grid.
    const score = Math.abs(frameWidth - frameHeight) * 100 + (columns * rows - count);
    if (score < bestScore) {
      bestScore = score;
      best = { columns, rows, count, frameWidth, frameHeight };
    }
  }

  if (best) return best;
  // Nothing divides evenly — fall back to a single row so the frames are at
  // least in the right order, rather than pretending we know better.
  const frameWidth = Math.floor(width / count) || width;
  return { columns: count, rows: 1, count, frameWidth, frameHeight: height };
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

/** Cut a sprite sheet into frames, in play order. */
export function framesFromSpriteSheet(
  image: CanvasImageSource,
  layout: SpriteLayout,
  spec: AnimationSpec,
): ExtractedFrames {
  const { frameWidth: w, frameHeight: h, columns } = layout;
  const ctx = context(w, h);
  const cells: ImageData[] = [];
  for (let i = 0; i < layout.count; i++) {
    const cx = (i % columns) * w;
    const cy = Math.floor(i / columns) * h;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(image, cx, cy, w, h, 0, 0, w, h);
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
