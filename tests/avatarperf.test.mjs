// The performance ranker.
//
// The point of this module is that it names the *offender*, so the fault that
// matters is picking the wrong one — or picking one when the avatar is fine.
// The thresholds themselves are VRChat's published PC table, so a change to
// one of these numbers is a change to what the app tells the user is
// acceptable, and it should be deliberate.

import assert from 'node:assert/strict';

const {
  rankForValue, analyzeStats, summarize, normalizeApiRank, platformRanks,
  PC_LIMITS, RANK_ORDER, RANK_COLORS, RANK_BAR,
} = await import('./build/avatarperf.mjs');

let pass = 0;
const ok = n => { pass++; console.log('  ✓', n); };
const limit = key => PC_LIMITS.find(l => l.key === key);

console.log('rank boundaries');

// Off-by-one at a boundary is the classic failure here: VRChat's limits are
// inclusive upper bounds, so exactly 32,000 triangles is still Excellent.
const tris = limit('triangles');
assert.equal(rankForValue(tris, 0), 'Excellent');
assert.equal(rankForValue(tris, 32_000), 'Excellent');
assert.equal(rankForValue(tris, 32_001), 'Good');
assert.equal(rankForValue(tris, 70_000), 'Good');
assert.equal(rankForValue(tris, 70_001), 'Very Poor');
ok('triangle thresholds are inclusive, and skip straight to Very Poor past 70k');

const lights = limit('lights');
assert.equal(rankForValue(lights, 0), 'Excellent');
assert.equal(rankForValue(lights, 1), 'Poor');
assert.equal(rankForValue(lights, 2), 'Very Poor');
ok('one realtime light is Poor, two is Very Poor');

const particles = limit('particles');
assert.equal(rankForValue(particles, 0), 'Excellent');
assert.equal(rankForValue(particles, 1), 'Good');
ok('a single particle system costs you Excellent');

for (const l of PC_LIMITS) {
  const t = l.thresholds;
  assert.equal(t.length, 4, `${l.key} needs four thresholds`);
  for (let i = 1; i < t.length; i++) {
    assert.ok(t[i] >= t[i - 1], `${l.key} thresholds must not decrease: ${t}`);
  }
  assert.ok(l.advice && l.advice.length > 10, `${l.key} needs advice worth reading`);
  assert.ok(l.noun && l.noun === l.noun.trim(), `${l.key} needs a mid-sentence noun`);
}
ok('every limit is monotonic and carries advice');

console.log('analysis');

assert.deepEqual(analyzeStats(undefined), { rows: [], worst: [], computed: null });
assert.deepEqual(analyzeStats({}), { rows: [], worst: [], computed: null });
ok('no stats analyses to nothing rather than throwing');

const good = analyzeStats({ triangles: 20_000, materials: 2, lights: 0, particles: 0 });
assert.equal(good.computed, 'Excellent');
assert.deepEqual(good.worst, [], 'an Excellent avatar has no offender to name');
assert.equal(summarize(good), null);
ok('a clean avatar is Excellent with nothing to blame');

// The whole feature: one expensive stat drags the whole rank down, and that
// is the one the UI must lead with.
const oneBad = analyzeStats({ triangles: 20_000, materials: 2, lights: 3 });
assert.equal(oneBad.computed, 'Very Poor');
assert.deepEqual(oneBad.worst.map(r => r.key), ['lights']);
assert.match(summarize(oneBad), /^3 realtime lights$/);
assert.equal(oneBad.rows[0].key, 'lights', 'the offender sorts first');
ok('the worst single stat sets the rank and leads the list');

const twoBad = analyzeStats({ triangles: 200_000, lights: 5, materials: 2 });
assert.equal(twoBad.computed, 'Very Poor');
assert.deepEqual(twoBad.worst.map(r => r.key).sort(), ['lights', 'triangles']);
assert.match(summarize(twoBad), /triangles/);
assert.match(summarize(twoBad), /realtime lights/);
ok('a tie names both offenders');

const three = analyzeStats({ triangles: 200_000, lights: 5, particles: 30, physBones: 99 });
assert.ok(three.worst.length >= 3);
assert.match(summarize(three), / and \d+ more$/);
ok('more than two offenders collapses to "and N more"');

// nextLimit is what the UI prints as "get under X to reach <better rank>", so
// it has to be the bound for the rank one step better, not this one's.
const mats = analyzeStats({ materials: 20 });
assert.equal(mats.rows[0].rank, 'Poor');
assert.equal(mats.rows[0].nextLimit, 16, 'Poor → Medium means 16 material slots');
assert.equal(mats.rows[0].nextRank, 'Medium');
ok('nextLimit points at the next rank up');

// Triangles have no Medium or Poor band at all: 70,000 is the top of Good and
// anything above it is Very Poor. Reading the "next" rank off RANK_ORDER told
// the user that getting under 70k would earn them Poor, which is three ranks
// short of the truth.
const heavyTris = analyzeStats({ triangles: 214_300 }).rows[0];
assert.equal(heavyTris.rank, 'Very Poor');
assert.equal(heavyTris.nextLimit, 70_000);
assert.equal(heavyTris.nextRank, 'Good', 'under 70k triangles is Good, not Poor');
ok('a stat that skips ranks names the rank it actually reaches');

for (const row of analyzeStats({
  triangles: 214_300, materials: 40, skinnedMeshes: 30, meshes: 40, bones: 900,
  physBones: 90, dynamicBones: 90, animators: 90, particles: 90, lights: 9,
  audioSources: 90,
}).rows) {
  assert.ok(row.nextLimit != null && row.nextRank, `${row.key} should have a way up`);
  assert.ok(
    RANK_ORDER.indexOf(row.nextRank) < RANK_ORDER.indexOf(row.rank),
    `${row.key}: "next" rank ${row.nextRank} is not better than ${row.rank}`,
  );
  assert.ok(row.nextLimit < row.value, `${row.key}: the target is not below the value`);
}
ok('every "get under X" target is genuinely an improvement');

const excellentRow = analyzeStats({ materials: 1 }).rows[0];
assert.equal(excellentRow.rank, 'Excellent');
assert.equal(excellentRow.nextLimit, null, 'nothing is better than Excellent');
assert.equal(excellentRow.nextRank, null);
ok('an Excellent stat has no next limit');

// fill drives the bar width, so it must stay inside 0..1 however silly the
// number is — a 40x-over avatar should read as a full bar, not overflow it.
for (const value of [0, 1, 70_000, 3_000_000]) {
  const row = analyzeStats({ triangles: value }).rows[0];
  assert.ok(row.fill >= 0 && row.fill <= 1, `fill out of range for ${value}: ${row.fill}`);
}
ok('bar fill is clamped to 0–1 at any value');

console.log('API ratings');

assert.equal(normalizeApiRank('VeryPoor'), 'Very Poor');
assert.equal(normalizeApiRank('very poor'), 'Very Poor');
assert.equal(normalizeApiRank('Very_Poor'), 'Very Poor');
assert.equal(normalizeApiRank('Excellent'), 'Excellent');
assert.equal(normalizeApiRank('None'), null, '"None" means unrated, not a rank');
assert.equal(normalizeApiRank(undefined), null);
assert.equal(normalizeApiRank(''), null);
ok('VRChat\'s API spellings all map onto the log\'s');

assert.deepEqual(platformRanks(undefined), []);
assert.deepEqual(platformRanks([]), []);
assert.deepEqual(platformRanks([{ platform: 'android' }]), [], 'unrated packages are not ranks');
ok('missing package data yields no rows rather than a bogus rank');

const ranks = platformRanks([
  { platform: 'android', performanceRating: 'Medium' },
  { platform: 'standalonewindows', performanceRating: 'Good' },
]);
assert.deepEqual(ranks.map(r => r.label), ['PC', 'Quest'], 'PC is listed first');
assert.equal(ranks[0].rank, 'Good');
assert.equal(ranks[1].rank, 'Medium');
ok('platforms are rated separately, PC first');

// An older build still sitting on the avatar is one some clients download, so
// the worse of the two is the honest number to show.
const stale = platformRanks([
  { platform: 'standalonewindows', performanceRating: 'Excellent' },
  { platform: 'standalonewindows', performanceRating: 'Poor' },
]);
assert.equal(stale.length, 1);
assert.equal(stale[0].rank, 'Poor');
ok('two builds for one platform report the worse rating');

console.log('palette');

for (const rank of RANK_ORDER) {
  assert.ok(RANK_COLORS[rank], `no colour for ${rank}`);
  assert.ok(RANK_BAR[rank], `no bar colour for ${rank}`);
}
assert.equal(RANK_ORDER.length, 5);
assert.equal(RANK_ORDER[0], 'Excellent');
assert.equal(RANK_ORDER[4], 'Very Poor');
ok('every rank has a colour, best first');

console.log(`\n  ${pass} passed`);
