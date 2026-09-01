import assert from 'node:assert/strict';
import {
  guessSpriteLayout, rankSpriteLayouts, cellAspect, frameOrder,
  vrchatGridSide, vrchatSpriteLayout, VRC_SHEET_SIZE,
} from './build/animation.mjs';

let pass = 0;
const ok = n => { pass++; console.log('  ✓', n); };

const aspectOf = l => cellAspect(l);

console.log('guessSpriteLayout');
{
  // The regression that made a downloaded emoji unusable: on a 1024×1024 sheet
  // only power-of-two row counts divide evenly, so demanding whole-pixel
  // division left 16×2 — 64×512 cells — as the best survivor for 17–48 frames.
  const worst = [];
  for (let n = 2; n <= 64; n++) {
    const l = guessSpriteLayout(1024, 1024, n);
    const a = aspectOf(l);
    // 2:1 is the worst a legitimate packing can be — five frames, say, cannot
    // fill a square sheet with square cells without an empty row. What must
    // never come back is the 8:1 and 16:1 the old rule produced.
    if (a > 2.01) worst.push(`${n} frames -> ${l.columns}x${l.rows} (${a.toFixed(1)}:1)`);
  }
  assert.deepEqual(worst, [], `slivers remain:\n  ${worst.join('\n  ')}`);
  ok('no frame count from 2 to 64 produces a sliver on a square sheet');
}
{
  const l = guessSpriteLayout(1024, 1024, 24);
  assert.ok(aspectOf(l) < 1.05, `24 frames gave ${l.columns}x${l.rows}`);
  assert.ok(l.columns * (l.rows - 1) < 24, 'no grid may have an entirely empty last row');
  assert.ok(l.columns * l.rows >= 24, 'the grid has to hold every frame');
  ok(`24 frames on a square sheet is ${l.columns}×${l.rows}, not the old 16×2 sliver`);
}
{
  // The counts that do divide evenly must still land on the obvious answer.
  for (const [n, c] of [[4, 2], [16, 4], [64, 8]]) {
    const l = guessSpriteLayout(1024, 1024, n);
    assert.equal(l.columns, c, `${n} frames`);
    assert.equal(l.rows, c);
    assert.equal(l.frameWidth, 1024 / c);
  }
  ok('perfect squares still resolve exactly (2×2, 4×4, 8×8)');
}
{
  const l = guessSpriteLayout(800, 100, 8);
  assert.deepEqual([l.columns, l.rows, l.frameWidth, l.frameHeight], [8, 1, 100, 100]);
  ok('a wide strip is one row of square cells');
}
{
  const l = guessSpriteLayout(128, 1024, 8);
  assert.deepEqual([l.columns, l.rows, l.frameWidth, l.frameHeight], [1, 8, 128, 128]);
  ok('a tall strip is one column of square cells');
}
{
  const l = guessSpriteLayout(768, 512, 6);
  assert.deepEqual([l.columns, l.rows, l.frameWidth, l.frameHeight], [3, 2, 256, 256]);
  ok('a 3:2 sheet of 6 frames is 3×2');
}
{
  // Cells that can't be whole pixels are fine as long as they're square.
  const l = guessSpriteLayout(1000, 1000, 9);
  assert.deepEqual([l.columns, l.rows], [3, 3]);
  assert.ok(aspectOf(l) < 1.01);
  ok('a sheet that divides into fractions still gets the right grid');
}
{
  const l = guessSpriteLayout(300, 200, 1);
  assert.deepEqual([l.columns, l.rows, l.frameWidth, l.frameHeight], [1, 1, 300, 200]);
  ok('a single frame is the whole image');
}
{
  // A sheet may be a fixed grid with the spare cells left blank, so those
  // layouts have to be proposable. Banning wholly-empty rows once made 55 of
  // the 63 possible fixed-8x8 layouts unreachable — no amount of measurement
  // can find an answer that was never a candidate.
  const unreachable = [];
  for (let n = 2; n <= 64; n++) {
    for (const [cols, rows] of [[8, 8], [4, 4], [6, 6], [2, 2]]) {
      if (n > cols * rows) continue;
      if (!rankSpriteLayouts(128 * cols, 128 * rows, n).some(l => l.columns === cols && l.rows === rows)) {
        unreachable.push(`${n} frames in ${cols}x${rows}`);
      }
    }
  }
  assert.deepEqual(unreachable, [], `not proposable: ${unreachable.slice(0, 8).join(', ')}`);
  ok('fixed grids with blank padding cells are all proposable');
}
{
  const ranked = rankSpriteLayouts(1024, 1024, 24);
  assert.ok(ranked.length > 3, 'a shortlist needs alternatives to choose from');
  assert.ok(aspectOf(ranked[0]) <= aspectOf(ranked[1]) + 0.001, 'ranked squarest-first');
  ok('candidates come back ranked, so the pixels can pick among them');
}

console.log("\nVRChat's published sheet format");
{
  // The documented mapping: a 1024x1024 sheet, square frames, grid side the
  // next power of two that holds them. 4 frames at 512px, 16 at 256px, 64 at
  // 128px. This is the format itself — not something to deduce.
  assert.equal(VRC_SHEET_SIZE, 1024);
  for (const [n, side] of [[1,1],[2,2],[3,2],[4,2],[5,4],[9,4],[16,4],[17,8],[24,8],[36,8],[64,8]]) {
    assert.equal(vrchatGridSide(n), side, `${n} frames`);
  }
  ok('grid side steps 1 → 2 → 4 → 8 at 1, 4, 16 and 64 frames');
}
{
  for (const [n, cell] of [[4, 512], [16, 256], [64, 128]]) {
    const l = vrchatSpriteLayout(1024, 1024, n);
    assert.ok(l, `${n} frames should resolve`);
    assert.equal(l.frameWidth, cell, `${n} frames`);
    assert.equal(l.frameHeight, cell);
  }
  ok('4 frames are 512px, 16 are 256px, 64 are 128px');
}
{
  // The case that started this: 24 frames sit in an 8x8 grid with 40 blanks,
  // NOT a snug 5x5. Every earlier version assumed a tight fit and cut frames
  // apart — first into 16x2 slivers, then into 5x5 crops.
  const l = vrchatSpriteLayout(1024, 1024, 24);
  assert.deepEqual([l.columns, l.rows], [8, 8]);
  assert.equal(l.frameWidth, 128);
  assert.equal(l.columns * l.rows - 24, 40, 'the spare cells are simply blank');
  ok('24 frames are an 8x8 grid of 128px frames with 40 cells left blank');
}
{
  // A resized copy of the same sheet still resolves — the rule is proportional.
  const l = vrchatSpriteLayout(512, 512, 24);
  assert.deepEqual([l.columns, l.rows], [8, 8]);
  assert.equal(l.frameWidth, 64);
  ok('a downscaled sheet resolves to the same grid');
}
{
  assert.equal(vrchatSpriteLayout(1024, 512, 16), null, 'not square, not VRChat format');
  assert.equal(vrchatSpriteLayout(1024, 1024, 65), null, 'past the 64-frame limit');
  ok('sheets that are not the published shape fall through to measurement');
}

console.log('\nframeOrder');
assert.deepEqual(frameOrder(4, 'linear'), [0, 1, 2, 3]);
ok('linear plays straight through');
assert.deepEqual(frameOrder(4, 'pingpong'), [0, 1, 2, 3, 2, 1]);
ok('pingpong runs back without repeating either end');
assert.deepEqual(frameOrder(2, 'pingpong'), [0, 1]);
ok('two frames have no pingpong to do');

console.log(`\n${pass} cases passed`);
