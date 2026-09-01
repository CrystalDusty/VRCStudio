import assert from 'node:assert/strict';
import { exportExtension, buildFilename, DEFAULT_EXPORT } from './build/imageExport.mjs';

let pass = 0;
const ok = n => { pass++; console.log('  ✓', n); };

console.log('exportExtension');
assert.equal(exportExtension({ ...DEFAULT_EXPORT, format: 'png' }), 'png');
assert.equal(exportExtension({ ...DEFAULT_EXPORT, format: 'jpeg' }), 'jpg');
assert.equal(exportExtension({ ...DEFAULT_EXPORT, format: 'webp' }), 'webp');
ok('canvas formats keep their usual extensions');

assert.equal(exportExtension({ ...DEFAULT_EXPORT, format: 'original' }, 'gif'), 'gif');
assert.equal(exportExtension({ ...DEFAULT_EXPORT, format: 'original' }, 'webp'), 'webp');
// An APNG is still a .png file.
assert.equal(exportExtension({ ...DEFAULT_EXPORT, format: 'original' }, 'png'), 'png');
ok('original uses the extension the bytes call for');

assert.equal(exportExtension({ ...DEFAULT_EXPORT, format: 'original' }), 'png');
ok('original with nothing sniffed yet falls back to .png rather than no extension');

console.log('\nbuildFilename');
assert.equal(
  buildFilename('{kind} {id}', { kind: 'emoji', id: 'file_abc123' }, 'gif'),
  'emoji file_abc123.gif',
);
ok('an animated emoji lands on disk as a .gif');

assert.equal(DEFAULT_EXPORT.animatedMode, 'gif');
ok('anything that moves is rebuilt as a GIF by default — flattening has to be asked for');
assert.equal(DEFAULT_EXPORT.videoExtension, 'webm');
ok('video defaults to WebM, the container every Chromium build can write');

console.log(`\n${pass} cases passed`);
