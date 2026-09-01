// The avatar log.
//
// The two faults worth guarding here both come from the same place: the log
// is fed by re-readable data. Refreshing replays every switch VRChat wrote,
// and the perf stats for one switch arrive in pieces over several seconds. So
// "the same avatar seen again" must update an entry, never add one, and the
// per-player cap must hold no matter how many times that happens.

import assert from 'node:assert/strict';

const {
  recordAvatar, trim, groupByPlayer, sameAvatar, clampKeep,
  KEEP_MIN, KEEP_MAX, KEEP_DEFAULT, TOTAL_MAX,
} = await import('./build/avatarlog.mjs');

let pass = 0;
const ok = n => { pass++; console.log('  ✓', n); };

let clock = 1_000_000;
const entry = (playerName, avatar, extra = {}) => ({
  playerName,
  ...(avatar.startsWith('avtr_') ? { avatarId: avatar } : { avatarName: avatar }),
  firstSeenAt: clock,
  lastSeenAt: clock += 1000,
  ...extra,
});

console.log('identity');

assert.equal(sameAvatar({ avatarId: 'avtr_a' }, { avatarId: 'avtr_a' }), true);
assert.equal(sameAvatar({ avatarId: 'avtr_a' }, { avatarId: 'avtr_b' }), false);
assert.equal(sameAvatar({ avatarName: 'Shibe' }, { avatarName: 'Shibe' }), true);
// Ids beat names: two uploads can share a name, and conflating them would put
// one person's avatar under another's id.
assert.equal(sameAvatar({ avatarId: 'avtr_a', avatarName: 'Shibe' },
                        { avatarId: 'avtr_b', avatarName: 'Shibe' }), false);
assert.equal(sameAvatar({ avatarId: 'avtr_a' }, { avatarName: 'Shibe' }), false);
ok('ids decide when both sides have one, names only when neither does');

console.log('recording');

let log = [];
log = recordAvatar(log, entry('Nyx', 'Shibe'), 5);
assert.equal(log.length, 1);
log = recordAvatar(log, entry('Nyx', 'Fox'), 5);
assert.equal(log.length, 2);
assert.equal(log[0].avatarName, 'Fox', 'newest first');
ok('each new avatar is prepended');

// This is the Refresh button: the same switch line replayed. Without the
// dedupe the log doubles every time the user hits Refresh.
const before = log;
log = recordAvatar(log, entry('Nyx', 'Fox'), 5);
assert.equal(log.length, 2, 'a repeat sighting must not add a row');
assert.notEqual(log, before, 'but it does refresh lastSeenAt');
assert.ok(log[0].lastSeenAt > before[0].lastSeenAt);
ok('re-seeing an avatar updates the entry instead of duplicating it');

// Stats stream in after the switch, so a later sighting has to be able to
// fill them in — that was the reason for merging rather than ignoring.
log = recordAvatar(log, entry('Nyx', 'Fox', { rank: 'Poor', stats: { triangles: 90_000 } }), 5);
assert.equal(log.length, 2);
assert.equal(log[0].rank, 'Poor');
assert.equal(log[0].stats.triangles, 90_000);
log = recordAvatar(log, entry('Nyx', 'Fox', { stats: { materials: 12 } }), 5);
assert.equal(log[0].stats.triangles, 90_000, 'earlier stats survive');
assert.equal(log[0].stats.materials, 12, 'later stats are merged in');
assert.equal(log[0].rank, 'Poor', 'rank is not lost when the next batch omits it');
ok('performance data arriving late is merged into the existing entry');

// The store skips its write when the reference is unchanged, so an identical
// re-record must return the same array or every log line costs a save.
const identical = recordAvatar(log, { ...log[0] }, 5);
assert.equal(identical, log, 'nothing new means no new array');
ok('a sighting with nothing new returns the same array');

assert.equal(recordAvatar(log, entry('', 'Shibe'), 5), log);
assert.equal(recordAvatar(log, { playerName: 'Nyx', firstSeenAt: 1, lastSeenAt: 1 }, 5), log);
ok('entries with no player or no avatar are dropped');

console.log('the cap');

log = [];
for (let i = 0; i < 20; i++) log = recordAvatar(log, entry('Nyx', `avatar ${i}`), 5);
assert.equal(log.length, 5);
assert.deepEqual(log.map(e => e.avatarName), ['avatar 19', 'avatar 18', 'avatar 17', 'avatar 16', 'avatar 15']);
ok('the newest N per player are kept and the rest fall off');

// The cap is per player, not global — one chatty player must not evict
// everyone else's history.
log = [];
for (let i = 0; i < 10; i++) log = recordAvatar(log, entry('Nyx', `n${i}`), 3);
log = recordAvatar(log, entry('Kit', 'k0'), 3);
for (let i = 0; i < 10; i++) log = recordAvatar(log, entry('Nyx', `m${i}`), 3);
assert.equal(log.filter(e => e.playerName === 'Nyx').length, 3);
assert.equal(log.filter(e => e.playerName === 'Kit').length, 1, "Kit's entry survived");
ok('the cap is per player, not a shared budget');

// Dragging the slider down has to prune what's already stored, which is what
// trim() does on its own.
const trimmed = trim(log, 1);
assert.equal(trimmed.filter(e => e.playerName === 'Nyx').length, 1);
assert.equal(trimmed[0].playerName, 'Nyx', 'newest kept');
ok('lowering the limit prunes the existing log');

assert.equal(clampKeep(0), KEEP_MIN);
assert.equal(clampKeep(-5), KEEP_MIN);
assert.equal(clampKeep(9999), KEEP_MAX);
assert.equal(clampKeep(NaN), KEEP_DEFAULT);
assert.equal(clampKeep(undefined), KEEP_DEFAULT);
assert.equal(clampKeep(7.4), 7);
ok('a nonsense limit falls back instead of emptying or exploding the log');

// A long session with a very high per-player cap still must not grow without
// bound — TOTAL_MAX is the backstop that keeps localStorage writable.
let big = [];
for (let p = 0; p < 60; p++) {
  for (let i = 0; i < KEEP_MAX; i++) big = recordAvatar(big, entry(`p${p}`, `a${p}-${i}`), KEEP_MAX);
}
assert.ok(big.length <= TOTAL_MAX, `log grew to ${big.length}, past the ${TOTAL_MAX} ceiling`);
ok('the whole log has a ceiling however high the per-player limit goes');

console.log('grouping');

const groups = groupByPlayer(log);
assert.deepEqual(groups.map(g => g.playerName).sort(), ['Kit', 'Nyx']);
const nyx = groups.find(g => g.playerName === 'Nyx');
assert.equal(nyx.entries.length, 3);
assert.equal(nyx.lastSeenAt, Math.max(...nyx.entries.map(e => e.lastSeenAt)));
assert.ok(groups[0].lastSeenAt >= groups[1].lastSeenAt, 'most recent player first');
ok('grouping keeps players in most-recent order');

assert.deepEqual(groupByPlayer([]), []);
ok('an empty log groups to nothing');

console.log(`\n  ${pass} passed`);
