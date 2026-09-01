import assert from 'node:assert/strict';
import { encodeGif } from './build/gif.mjs';
import { sniffImage } from './build/media.mjs';

let pass = 0;
const ok = n => { pass++; console.log('  ✓', n); };

// ── An independent GIF reader, so the test proves the bytes decode rather
//    than merely that the encoder is self-consistent. ──────────────────────
function decodeGif(bytes) {
  let p = 0;
  const u8 = () => bytes[p++];
  const u16 = () => { const v = bytes[p] | (bytes[p + 1] << 8); p += 2; return v; };
  const sig = String.fromCharCode(...bytes.slice(0, 6));
  assert.equal(sig, 'GIF89a');
  p = 6;
  const width = u16(), height = u16();
  const packed = u8();
  u8(); u8();
  const gctSize = 1 << ((packed & 7) + 1);
  const gct = [];
  for (let i = 0; i < gctSize; i++) gct.push([u8(), u8(), u8()]);

  const frames = [];
  let loopCount = null;
  let gce = null;

  const readSubBlocks = () => {
    const parts = [];
    for (;;) {
      const len = u8();
      if (len === 0) break;
      parts.push(bytes.slice(p, p + len));
      p += len;
    }
    return Buffer.concat(parts.map(Buffer.from));
  };

  for (;;) {
    const marker = u8();
    if (marker === 0x3b) break;
    if (marker === 0x21) {
      const label = u8();
      if (label === 0xf9) {
        assert.equal(u8(), 4);
        const flags = u8();
        const delay = u16();
        const tIndex = u8();
        u8();
        gce = { disposal: (flags >> 2) & 7, transparent: (flags & 1) ? tIndex : -1, delay };
      } else if (label === 0xff) {
        const len = u8();
        const name = String.fromCharCode(...bytes.slice(p, p + len));
        p += len;
        const data = readSubBlocks();
        if (name === 'NETSCAPE2.0') loopCount = data[1] | (data[2] << 8);
      } else {
        readSubBlocks();
      }
      continue;
    }
    assert.equal(marker, 0x2c, `unexpected block 0x${marker.toString(16)}`);
    const fx = u16(), fy = u16(), fw = u16(), fh = u16();
    const imgPacked = u8();
    assert.equal(imgPacked & 0x80, 0, 'no local colour table expected');
    const minCodeSize = u8();
    const data = readSubBlocks();

    // LZW decode
    const clear = 1 << minCodeSize, eoi = clear + 1;
    let codeSize = minCodeSize + 1;
    let dict = [];
    const resetDict = () => {
      dict = [];
      for (let i = 0; i < clear; i++) dict[i] = [i];
      dict[clear] = []; dict[eoi] = [];
      codeSize = minCodeSize + 1;
    };
    resetDict();
    const indices = [];
    let bitPos = 0;
    let prev = null;
    const readCode = () => {
      let v = 0;
      for (let i = 0; i < codeSize; i++) {
        const b = data[bitPos >> 3];
        if (b === undefined) return eoi;
        v |= ((b >> (bitPos & 7)) & 1) << i;
        bitPos++;
      }
      return v;
    };
    for (;;) {
      const code = readCode();
      if (code === eoi) break;
      if (code === clear) { resetDict(); prev = null; continue; }
      let entry;
      if (code < dict.length && dict[code] !== undefined) entry = dict[code];
      else if (prev) entry = [...prev, prev[0]];
      else throw new Error('bad LZW stream');
      indices.push(...entry);
      if (prev) {
        dict.push([...prev, entry[0]]);
        if (dict.length === (1 << codeSize) && codeSize < 12) codeSize++;
      }
      prev = entry;
    }

    const rgba = new Uint8ClampedArray(fw * fh * 4);
    for (let i = 0; i < fw * fh; i++) {
      const idx = indices[i] ?? 0;
      if (gce && idx === gce.transparent) continue;
      const c = gct[idx];
      rgba[i * 4] = c[0]; rgba[i * 4 + 1] = c[1]; rgba[i * 4 + 2] = c[2]; rgba[i * 4 + 3] = 255;
    }
    frames.push({ x: fx, y: fy, width: fw, height: fh, rgba, ...gce, pixelCount: indices.length });
  }
  return { width, height, gct, frames, loopCount };
}

// ── Builders ────────────────────────────────────────────────────────────────
function solid(w, h, [r, g, b, a = 255]) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = r; data[i * 4 + 1] = g; data[i * 4 + 2] = b; data[i * 4 + 3] = a;
  }
  return data;
}

console.log('encodeGif');

// 1. Three flat colours round-trip exactly.
{
  const W = 8, H = 6;
  const colours = [[255, 0, 0], [0, 255, 0], [0, 0, 255]];
  const bytes = encodeGif({
    width: W, height: H,
    frames: colours.map(c => ({ data: solid(W, H, c), delayMs: 125 })),
  });

  const info = sniffImage(Buffer.from(bytes));
  assert.equal(info.format, 'gif');
  assert.equal(info.animated, true, 'three frames must read back as animated');
  assert.equal(info.width, W);
  assert.equal(info.height, H);
  ok('the output is a GIF that our own sniffer calls animated');

  const g = decodeGif(bytes);
  assert.equal(g.frames.length, 3);
  assert.equal(g.loopCount, 0, 'emoji should loop forever');
  g.frames.forEach((f, i) => {
    assert.equal(f.pixelCount, W * H, `frame ${i} decoded ${f.pixelCount} pixels`);
    assert.equal(f.delay, 13, 'delay rounds to hundredths of a second');
    const [r, gr, b] = colours[i];
    for (let px = 0; px < W * H; px++) {
      assert.deepEqual(
        [f.rgba[px * 4], f.rgba[px * 4 + 1], f.rgba[px * 4 + 2]], [r, gr, b],
        `frame ${i} pixel ${px}`,
      );
    }
  });
  ok('every frame decodes back to the exact colour it was given');
}

// 2. Transparency survives as a transparent index.
{
  const W = 4, H = 4;
  const data = solid(W, H, [200, 30, 90]);
  for (let i = 0; i < 8; i++) data[i * 4 + 3] = 0;      // top half fully clear
  const bytes = encodeGif({ width: W, height: H, frames: [{ data, delayMs: 100 }] });
  const g = decodeGif(bytes);
  assert.equal(g.frames.length, 1);
  assert.ok(g.frames[0].transparent >= 0, 'a transparent index should be declared');
  for (let i = 0; i < 8; i++) assert.equal(g.frames[0].rgba[i * 4 + 3], 0, `pixel ${i} should stay clear`);
  for (let i = 8; i < 16; i++) {
    assert.equal(g.frames[0].rgba[i * 4 + 3], 255);
    assert.deepEqual([g.frames[0].rgba[i * 4], g.frames[0].rgba[i * 4 + 1], g.frames[0].rgba[i * 4 + 2]], [200, 30, 90]);
  }
  ok('transparent pixels stay transparent, opaque ones keep their colour');
}

// 3. More than 256 colours are quantised, not corrupted.
{
  const W = 64, H = 64;   // 4096 pixels, every one a different colour
  const data = new Uint8ClampedArray(W * H * 4);
  const seen = new Set();
  for (let i = 0; i < W * H; i++) {
    const x = i % W, y = (i / W) | 0;
    data[i * 4] = x * 4;
    data[i * 4 + 1] = y * 4;
    data[i * 4 + 2] = ((x + y) * 2) & 255;
    data[i * 4 + 3] = 255;
    seen.add((data[i * 4] << 16) | (data[i * 4 + 1] << 8) | data[i * 4 + 2]);
  }
  assert.ok(seen.size > 256, `test needs to exceed the palette: ${seen.size} colours`);
  const bytes = encodeGif({ width: W, height: H, frames: [{ data, delayMs: 50 }] });
  const g = decodeGif(bytes);
  assert.equal(g.frames[0].pixelCount, W * H, 'every pixel must be present');
  assert.ok(g.gct.length <= 256);
  // Quantisation error should be visually small, not arbitrary.
  let worst = 0;
  for (let i = 0; i < W * H; i++) {
    const d = Math.max(
      Math.abs(g.frames[0].rgba[i * 4] - data[i * 4]),
      Math.abs(g.frames[0].rgba[i * 4 + 1] - data[i * 4 + 1]),
      Math.abs(g.frames[0].rgba[i * 4 + 2] - data[i * 4 + 2]),
    );
    if (d > worst) worst = d;
  }
  assert.ok(worst <= 40, `worst channel error was ${worst}`);
  ok(`${seen.size} colours quantise into 256 with at most ${worst}/255 channel error`);
}

// 4. A long run exercises code-width growth and the 255-byte sub-block split.
{
  const W = 120, H = 120;
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const band = Math.floor(i / W) % 5;
    data[i * 4] = band * 50; data[i * 4 + 1] = 255 - band * 40; data[i * 4 + 2] = band * 20;
    data[i * 4 + 3] = 255;
  }
  const bytes = encodeGif({ width: W, height: H, frames: [{ data, delayMs: 100 }] });
  const g = decodeGif(bytes);
  assert.equal(g.frames[0].pixelCount, W * H);
  for (let i = 0; i < W * H; i++) {
    const band = Math.floor(i / W) % 5;
    assert.deepEqual(
      [g.frames[0].rgba[i * 4], g.frames[0].rgba[i * 4 + 1], g.frames[0].rgba[i * 4 + 2]],
      [band * 50, 255 - band * 40, band * 20],
      `pixel ${i}`,
    );
  }
  ok('14,400 pixels across multi-byte sub-blocks decode byte-exact');
}

// 5. A single frame gets no loop extension — it isn't an animation.
{
  const bytes = encodeGif({ width: 2, height: 2, frames: [{ data: solid(2, 2, [1, 2, 3]), delayMs: 100 }] });
  assert.equal(decodeGif(bytes).loopCount, null);
  assert.equal(sniffImage(Buffer.from(bytes)).animated, false);
  ok('a one-frame GIF is not dressed up as an animation');
}

console.log(`\n${pass} cases passed`);
