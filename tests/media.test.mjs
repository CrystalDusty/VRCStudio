import assert from 'node:assert/strict';
import http from 'node:http';
import { sniffImage, probePresenceImage, inspectImage, fetchBuffer } from './build/media.mjs';

let pass = 0;
const ok = (name, fn) => { fn(); pass++; console.log('  ✓', name); };

// ── Builders for real file headers ─────────────────────────────────────────
function gif(frames) {
  const parts = [Buffer.from('GIF89a', 'latin1')];
  const dims = Buffer.alloc(7);
  dims.writeUInt16LE(64, 0); dims.writeUInt16LE(48, 2);
  parts.push(dims);
  for (let i = 0; i < frames; i++) {
    // Graphic Control Extension, then a stub image descriptor.
    parts.push(Buffer.from([0x21, 0xf9, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00]));
    parts.push(Buffer.from([0x2c, 0, 0, 0, 0, 64, 0, 48, 0, 0]));
  }
  parts.push(Buffer.from([0x3b]));
  return Buffer.concat(parts);
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  return Buffer.concat([len, Buffer.from(type, 'latin1'), data, Buffer.alloc(4)]);
}
function png({ apng = false, frames = 3 } = {}) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(128, 0); ihdr.writeUInt32BE(96, 4);
  const chunks = [sig, pngChunk('IHDR', ihdr)];
  if (apng) {
    const actl = Buffer.alloc(8);
    actl.writeUInt32BE(frames, 0); actl.writeUInt32BE(0, 4);
    chunks.push(pngChunk('acTL', actl));
  }
  chunks.push(pngChunk('IDAT', Buffer.alloc(16)));
  return Buffer.concat(chunks);
}

function webp({ animated = false } = {}) {
  if (!animated) {
    const body = Buffer.concat([Buffer.from('WEBP', 'latin1'), Buffer.from('VP8 ', 'latin1'), Buffer.alloc(16)]);
    const riff = Buffer.alloc(8);
    riff.write('RIFF', 0, 'latin1'); riff.writeUInt32LE(body.length, 4);
    return Buffer.concat([riff, body]);
  }
  const vp8x = Buffer.alloc(18);
  vp8x.write('VP8X', 0, 'latin1');
  vp8x.writeUInt32LE(10, 4);
  vp8x[8] = 0x02;                       // ANIM flag
  vp8x[12] = 99; vp8x[13] = 0; vp8x[14] = 0;   // width-1  = 99  → 100
  vp8x[15] = 49; vp8x[16] = 0; vp8x[17] = 0;   // height-1 = 49  → 50
  const anmf = Buffer.concat([Buffer.from('ANMF', 'latin1'), Buffer.alloc(8), Buffer.from('ANMF', 'latin1'), Buffer.alloc(8)]);
  const body = Buffer.concat([Buffer.from('WEBP', 'latin1'), vp8x, anmf]);
  const riff = Buffer.alloc(8);
  riff.write('RIFF', 0, 'latin1'); riff.writeUInt32LE(body.length, 4);
  return Buffer.concat([riff, body]);
}

console.log('sniffImage');
ok('a one-frame GIF is not called animated', () => {
  const i = sniffImage(gif(1));
  assert.equal(i.format, 'gif');
  assert.equal(i.animated, false);
  assert.equal(i.width, 64);
  assert.equal(i.height, 48);
  assert.equal(i.extension, 'gif');
});
ok('a multi-frame GIF is', () => {
  const i = sniffImage(gif(7));
  assert.equal(i.format, 'gif');
  assert.equal(i.animated, true);
});
ok('a plain PNG is still', () => {
  const i = sniffImage(png());
  assert.equal(i.format, 'png');
  assert.equal(i.animated, false);
  assert.equal(i.width, 128);
  assert.equal(i.height, 96);
});
ok('an APNG reports its frame count', () => {
  const i = sniffImage(png({ apng: true, frames: 12 }));
  assert.equal(i.format, 'apng');
  assert.equal(i.animated, true);
  assert.equal(i.frameCount, 12);
  // Still saved as .png — an APNG is a PNG.
  assert.equal(i.extension, 'png');
});
ok('a lossy WebP is still', () => {
  const i = sniffImage(webp());
  assert.equal(i.format, 'webp');
  assert.equal(i.animated, false);
});
ok('an animated WebP is caught by the VP8X flag', () => {
  const i = sniffImage(webp({ animated: true }));
  assert.equal(i.format, 'webp');
  assert.equal(i.animated, true);
  assert.equal(i.width, 100);
  assert.equal(i.height, 50);
  assert.equal(i.frameCount, 2);
});
ok('JPEG', () => {
  const i = sniffImage(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20)]));
  assert.equal(i.format, 'jpeg');
  assert.equal(i.animated, false);
  assert.equal(i.extension, 'jpg');
});
ok('an AVIF sequence is animated, a plain AVIF is not', () => {
  const mk = brand => Buffer.concat([Buffer.alloc(4), Buffer.from('ftyp' + brand, 'latin1'), Buffer.alloc(16)]);
  assert.equal(sniffImage(mk('avis')).animated, true);
  assert.equal(sniffImage(mk('avif')).animated, false);
});
ok('garbage is unknown, never animated', () => {
  const i = sniffImage(Buffer.from('this is not an image at all', 'latin1'));
  assert.equal(i.format, 'unknown');
  assert.equal(i.animated, false);
});

// ── Live server tests ──────────────────────────────────────────────────────
const animated = gif(5);
const server = http.createServer((req, res) => {
  if (req.url === '/private') {
    res.writeHead(401, { 'content-type': 'application/json' });
    return res.end('{"error":"Missing Credentials"}');
  }
  if (req.url === '/html') {
    res.writeHead(200, { 'content-type': 'text/html' });
    return res.end('<html>nope</html>');
  }
  if (req.url === '/redirect') {
    res.writeHead(302, { location: '/emoji' });
    return res.end();
  }
  if (req.url === '/emoji') {
    // Deliberately no extension and a useless content-type, the way VRChat
    // serves /api/1/file/<id>/1/file.
    res.writeHead(200, { 'content-type': 'application/octet-stream' });
    return res.end(animated);
  }
  res.writeHead(404); res.end();
});

await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

console.log('\ninspectImage (over HTTP, no extension, generic content-type)');
{
  const i = await inspectImage(`${base}/emoji`);
  assert.equal(i.ok, true);
  assert.equal(i.format, 'gif');
  assert.equal(i.animated, true);
  pass++; console.log('  ✓ identifies an animated GIF from bytes alone');

  const bad = await inspectImage(`${base}/private`);
  assert.equal(bad.ok, false);
  assert.equal(bad.animated, false);
  pass++; console.log('  ✓ a 401 is reported, not guessed at');
}

console.log('\nprobePresenceImage (the "?" box check)');
{
  const good = await probePresenceImage(`${base}/emoji`);
  assert.equal(good.ok, true);
  assert.equal(good.reason, undefined);
  pass++; console.log('  ✓ a publicly readable image passes');

  const gated = await probePresenceImage(`${base}/private`);
  assert.equal(gated.ok, false);
  assert.match(gated.reason, /without a login/);
  assert.match(gated.reason, /401/);
  pass++; console.log('  ✓ an auth-gated image fails with a reason a human can read');

  const html = await probePresenceImage(`${base}/html`);
  assert.equal(html.ok, false);
  assert.match(html.reason, /not an image|text\/html/);
  pass++; console.log('  ✓ a 200 that is not an image still fails');

  const redirected = await probePresenceImage(`${base}/redirect`);
  assert.equal(redirected.ok, true);
  assert.equal(redirected.finalUrl, `${base}/emoji`);
  pass++; console.log('  ✓ redirects resolve, and the resolved URL is what we would send');

  // Second call must be served from cache — same object identity of values.
  const again = await probePresenceImage(`${base}/emoji`);
  assert.equal(again.at, good.at);
  pass++; console.log('  ✓ results are cached rather than refetched every push');
}

console.log('\nfetchBuffer byte cap');
{
  const r = await fetchBuffer(`${base}/emoji`, { maxBytes: 8 });
  assert.equal(r.ok, true);
  assert.ok(r.buffer.length <= 8, `got ${r.buffer.length} bytes`);
  pass++; console.log('  ✓ stops at the cap instead of pulling the whole file');
}

server.close();
console.log(`\n${pass} assertions passed`);
