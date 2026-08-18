// A GIF89a encoder.
//
// Written here rather than pulled in as a dependency because it's the one
// format that makes a VRChat emoji shareable anywhere, and the app already
// ships no runtime image libraries.
//
// Deliberately DOM-free: it takes raw RGBA frames and returns bytes, so the
// same code runs under a test harness. Everything that needs a canvas lives in
// animation.ts.
//
// Choices worth knowing about:
//   • One global colour table for the whole file. Emoji use few colours, and a
//     shared table keeps the file small and the encoder simple.
//   • GIF alpha is one bit, not eight. Pixels below the alpha threshold become
//     the transparent index; the rest are made fully opaque. Soft edges get
//     hard — that's the format, not a bug, and it's why the original PNG
//     spritesheet is still offered.
//   • Disposal method 2 (restore to background) between frames, so a frame
//     with transparent areas doesn't smear the previous one through them.

export interface GifFrame {
  /** RGBA, width * height * 4. */
  data: Uint8ClampedArray;
  /** How long this frame is shown, in milliseconds. */
  delayMs: number;
}

export interface GifOptions {
  width: number;
  height: number;
  frames: GifFrame[];
  /** 0 = loop forever, which is what an emoji wants. */
  loopCount?: number;
  /** Alpha at or above this counts as opaque. */
  alphaThreshold?: number;
}

// ── Colour quantisation ─────────────────────────────────────────────────────

/** One distinct colour and how many pixels wear it. */
interface Swatch { r: number; g: number; b: number; n: number }

interface Box {
  swatches: Swatch[];
  rMin: number; rMax: number;
  gMin: number; gMax: number;
  bMin: number; bMax: number;
  total: number;
}

/**
 * Count the colours in every frame.
 *
 * Buckets at 6 bits per channel to bound memory on a large spritesheet, but
 * accumulates the exact RGB inside each bucket and reports the average. A flat
 * colour therefore comes back byte-exact — bucketing the *representative* was
 * enough to shift a solid #C81E5A to #CE1959, which is visible.
 */
function histogram(frames: GifFrame[], alphaThreshold: number): { swatches: Swatch[]; anyTransparent: boolean } {
  const BITS = 6;
  const SIDE = 1 << BITS;                 // 64 levels per channel
  const SHIFT = 8 - BITS;
  const counts = new Uint32Array(SIDE * SIDE * SIDE);
  const sums = new Float64Array(SIDE * SIDE * SIDE * 3);
  let anyTransparent = false;

  for (const frame of frames) {
    const px = frame.data;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] < alphaThreshold) { anyTransparent = true; continue; }
      const r = px[i], g = px[i + 1], b = px[i + 2];
      const k = ((r >> SHIFT) << (BITS * 2)) | ((g >> SHIFT) << BITS) | (b >> SHIFT);
      counts[k]++;
      sums[k * 3] += r; sums[k * 3 + 1] += g; sums[k * 3 + 2] += b;
    }
  }

  const swatches: Swatch[] = [];
  for (let k = 0; k < counts.length; k++) {
    const n = counts[k];
    if (n === 0) continue;
    swatches.push({
      r: Math.round(sums[k * 3] / n),
      g: Math.round(sums[k * 3 + 1] / n),
      b: Math.round(sums[k * 3 + 2] / n),
      n,
    });
  }
  return { swatches, anyTransparent };
}

function boundsOf(swatches: Swatch[]): Box {
  const box: Box = {
    swatches,
    rMin: 255, rMax: 0, gMin: 255, gMax: 0, bMin: 255, bMax: 0,
    total: 0,
  };
  for (const s of swatches) {
    if (s.r < box.rMin) box.rMin = s.r;
    if (s.r > box.rMax) box.rMax = s.r;
    if (s.g < box.gMin) box.gMin = s.g;
    if (s.g > box.gMax) box.gMax = s.g;
    if (s.b < box.bMin) box.bMin = s.b;
    if (s.b > box.bMax) box.bMax = s.b;
    box.total += s.n;
  }
  return box;
}

/**
 * Median cut, weighted by how often each colour actually appears.
 *
 * Weighting matters for emoji: a hundred pixels of outline black should not
 * lose its slot to three stray anti-aliasing colours. Fewer distinct colours
 * than slots means no cutting at all — they are used as they are.
 */
function medianCut(swatches: Swatch[], maxColors: number): number[][] {
  if (swatches.length === 0) return [[0, 0, 0]];
  if (swatches.length <= maxColors) return swatches.map(s => [s.r, s.g, s.b]);

  const boxes: Box[] = [boundsOf(swatches)];
  while (boxes.length < maxColors) {
    // Split whatever box covers the widest span of colour and still can split.
    let target = -1;
    let widest = 0;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (b.swatches.length < 2) continue;
      const span = Math.max(b.rMax - b.rMin, b.gMax - b.gMin, b.bMax - b.bMin);
      if (span > widest) { widest = span; target = i; }
    }
    if (target === -1) break;

    const box = boxes[target];
    const rSpan = box.rMax - box.rMin, gSpan = box.gMax - box.gMin, bSpan = box.bMax - box.bMin;
    const channel: keyof Swatch = rSpan >= gSpan && rSpan >= bSpan ? 'r' : gSpan >= bSpan ? 'g' : 'b';

    const order = [...box.swatches].sort((a, b) => a[channel] - b[channel]);

    // Cut at the weighted median so both halves carry similar pixel counts.
    const half = box.total / 2;
    let running = 0;
    let cut = 0;
    for (; cut < order.length - 1; cut++) {
      running += order[cut].n;
      if (running >= half) break;
    }
    const left = order.slice(0, cut + 1);
    const right = order.slice(cut + 1);
    if (left.length === 0 || right.length === 0) break;

    boxes.splice(target, 1, boundsOf(left), boundsOf(right));
  }

  return boxes.map(box => {
    let r = 0, g = 0, b = 0, n = 0;
    for (const s of box.swatches) {
      r += s.r * s.n; g += s.g * s.n; b += s.b * s.n; n += s.n;
    }
    return n === 0 ? [0, 0, 0] : [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
  });
}

// ── LZW ─────────────────────────────────────────────────────────────────────

class BitWriter {
  private bytes: number[] = [];
  private cur = 0;
  private bits = 0;

  write(code: number, size: number) {
    // GIF packs codes least-significant bit first.
    this.cur |= code << this.bits;
    this.bits += size;
    while (this.bits >= 8) {
      this.bytes.push(this.cur & 0xff);
      this.cur >>= 8;
      this.bits -= 8;
    }
  }

  finish(): number[] {
    if (this.bits > 0) this.bytes.push(this.cur & 0xff);
    this.cur = 0; this.bits = 0;
    return this.bytes;
  }
}

/** LZW-compress one frame's indices into GIF sub-blocks. */
export function lzwEncode(indices: Uint8Array, minCodeSize: number): number[] {
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;
  const writer = new BitWriter();

  let dict = new Map<number, number>();
  let next = clearCode + 2;
  let codeSize = minCodeSize + 1;

  const resetDict = () => {
    dict = new Map();
    next = clearCode + 2;
    codeSize = minCodeSize + 1;
  };

  writer.write(clearCode, codeSize);
  resetDict();

  let prefix = indices.length > 0 ? indices[0] : -1;
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const combined = (prefix << 8) | k;
    const found = dict.get(combined);
    if (found !== undefined) {
      prefix = found;
      continue;
    }
    writer.write(prefix, codeSize);
    if (next < 4096) {
      dict.set(combined, next++);
      // The code width grows the moment the next code needs the extra bit.
      if (next - 1 === (1 << codeSize) && codeSize < 12) codeSize++;
    } else {
      writer.write(clearCode, codeSize);
      resetDict();
    }
    prefix = k;
  }
  if (prefix !== -1) writer.write(prefix, codeSize);
  writer.write(eoiCode, codeSize);

  const raw = writer.finish();

  // Data is carried in sub-blocks of at most 255 bytes, each length-prefixed.
  const out: number[] = [];
  for (let i = 0; i < raw.length; i += 255) {
    const chunk = raw.slice(i, i + 255);
    out.push(chunk.length, ...chunk);
  }
  out.push(0);
  return out;
}

// ── Encoder ─────────────────────────────────────────────────────────────────

export function encodeGif(opts: GifOptions): Uint8Array {
  const { width, height, frames } = opts;
  if (width <= 0 || height <= 0) throw new Error('GIF needs a non-zero size');
  if (frames.length === 0) throw new Error('GIF needs at least one frame');
  const alphaThreshold = opts.alphaThreshold ?? 128;
  const loopCount = opts.loopCount ?? 0;

  // One colour count across every frame — the colour table is shared.
  const { swatches, anyTransparent } = histogram(frames, alphaThreshold);

  const maxColors = anyTransparent ? 255 : 256;
  const palette = medianCut(swatches, maxColors);
  const transparentIndex = anyTransparent ? palette.length : -1;
  const entries = anyTransparent ? palette.length + 1 : palette.length;

  // The colour table size must be a power of two, at least 2.
  let tableBits = 1;
  while ((1 << tableBits) < entries) tableBits++;
  const tableSize = 1 << tableBits;

  // Nearest-colour lookup. Exact matches are resolved first so a colour that
  // made it into the table verbatim is never nudged onto a neighbour; anything
  // else falls back to a cache keyed per 5:5:5 bucket, so each distinct colour
  // is matched once rather than once per pixel.
  const exact = new Map<number, number>();
  palette.forEach((c, i) => {
    const k = (c[0] << 16) | (c[1] << 8) | c[2];
    if (!exact.has(k)) exact.set(k, i);
  });
  const cache = new Int16Array(32768).fill(-1);
  const nearest = (r: number, g: number, b: number): number => {
    const hitExact = exact.get((r << 16) | (g << 8) | b);
    if (hitExact !== undefined) return hitExact;
    const k = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const hit = cache[k];
    if (hit !== -1) return hit;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < palette.length; i++) {
      const dr = r - palette[i][0], dg = g - palette[i][1], db = b - palette[i][2];
      const d = dr * dr + dg * dg + db * db;
      if (d < bestDist) { bestDist = d; best = i; }
    }
    cache[k] = best;
    return best;
  };

  const out: number[] = [];
  const byte = (v: number) => out.push(v & 0xff);
  const short = (v: number) => { out.push(v & 0xff); out.push((v >> 8) & 0xff); };
  const str = (s: string) => { for (const ch of s) out.push(ch.charCodeAt(0)); };

  // Header + logical screen descriptor
  str('GIF89a');
  short(width);
  short(height);
  byte(0x80 | ((tableBits - 1) & 0x07));   // global table present, size
  byte(0);                                  // background colour index
  byte(0);                                  // pixel aspect ratio

  // Global colour table, padded out to the power-of-two size
  for (let i = 0; i < tableSize; i++) {
    const c = i < palette.length ? palette[i] : [0, 0, 0];
    byte(c[0]); byte(c[1]); byte(c[2]);
  }

  // NETSCAPE2.0 application extension — the only way to say "loop"
  if (frames.length > 1) {
    byte(0x21); byte(0xff); byte(11);
    str('NETSCAPE2.0');
    byte(3); byte(1); short(loopCount);
    byte(0);
  }

  const minCodeSize = Math.max(2, tableBits);
  for (const frame of frames) {
    // Graphic control extension: delay, transparency, disposal.
    // GIF delays are in hundredths of a second; 0 makes some viewers race, so
    // never go below one tick.
    const delay = Math.max(1, Math.round(frame.delayMs / 10));
    byte(0x21); byte(0xf9); byte(4);
    byte((2 << 2) | (transparentIndex >= 0 ? 1 : 0));   // disposal 2 + transparency flag
    short(delay);
    byte(transparentIndex >= 0 ? transparentIndex : 0);
    byte(0);

    // Image descriptor — full frame, no local table.
    byte(0x2c);
    short(0); short(0); short(width); short(height);
    byte(0);

    const px = frame.data;
    const indices = new Uint8Array(width * height);
    for (let p = 0, i = 0; p < indices.length; p++, i += 4) {
      indices[p] = px[i + 3] < alphaThreshold && transparentIndex >= 0
        ? transparentIndex
        : nearest(px[i], px[i + 1], px[i + 2]);
    }

    byte(minCodeSize);
    out.push(...lzwEncode(indices, minCodeSize));
  }

  byte(0x3b);   // trailer
  return new Uint8Array(out);
}
