import assert from 'node:assert/strict';
// The store touches localStorage and the VRChat API at import time; stub both.
const store = new Map();
globalThis.localStorage = {
  getItem: k => store.get(k) ?? null,
  setItem: (k, v) => store.set(k, v),
  removeItem: k => store.delete(k),
};
globalThis.window = { electronAPI: undefined };

const { useGrabberStore } = await import('./build/grabber.mjs');

let pass = 0;
const ok = n => { pass++; console.log('  ✓', n); };
const wait = () => new Promise(r => setTimeout(r, 1400));  // persistence is debounced by 1200ms

const item = (id, extra = {}) => ({
  id, kind: 'emoji', url: `https://x/${id}`, source: 'log',
  firstSeenAt: Date.now(), lastSeenAt: Date.now(), seenCount: 1, ...extra,
});

console.log('liked items');

const s = () => useGrabberStore.getState();

s().addItems([item('a'), item('b'), item('c')]);
s().toggleLiked('b');
assert.equal(s().items.b.liked, true);
assert.equal(s().items.a.liked, undefined);
ok('liking one item leaves the others alone');

s().clear();
assert.deepEqual(Object.keys(s().items), ['b'], `kept ${Object.keys(s().items)}`);
assert.equal(s().items.b.liked, true);
ok('Clear forgets everything except the liked one');

s().toggleLiked('b');
assert.equal(s().items.b.liked, false);
s().clear();
assert.deepEqual(Object.keys(s().items), []);
ok('un-liking it puts it back in reach of Clear');

// Liking must not be a slower way of losing something: the 2000-item cap
// trims by recency, and a liked item has to be exempt from that too.
{
  s().clear();
  const bulk = [];
  for (let i = 0; i < 2100; i++) {
    bulk.push(item(`bulk${i}`, { lastSeenAt: 1_000_000 + i }));
  }
  // One old, easily-trimmed item, liked.
  bulk.push(item('treasure', { lastSeenAt: 1, liked: true }));
  s().addItems(bulk);
  await wait();

  const persisted = JSON.parse(localStorage.getItem('vrcstudio_grabber')).items;
  const keys = Object.keys(persisted);
  assert.ok(keys.length <= 2000, `stored ${keys.length}`);
  assert.ok(persisted.treasure, 'the liked item was trimmed away');
  assert.equal(persisted.treasure.liked, true);
  ok(`a liked item survives trimming even as the oldest of ${bulk.length}`);
}

// And liking survives a reload, since it is written through.
{
  s().clear();
  s().addItems([item('keeper')]);
  s().toggleLiked('keeper');
  await wait();
  const persisted = JSON.parse(localStorage.getItem('vrcstudio_grabber')).items;
  assert.equal(persisted.keeper.liked, true);
  ok('the like is written to storage, so it is still there next launch');
}

// Storage full: the fallback halves the history, and must halve it the same
// way — liked items are what's left standing, not the first casualties.
{
  s().clear();
  const bulk = [];
  for (let i = 0; i < 20; i++) bulk.push(item(`fill${i}`, { lastSeenAt: 2_000_000 + i }));
  bulk.push(item('precious', { lastSeenAt: 1, liked: true }));
  s().addItems(bulk);

  let attempt = 0;
  const realSet = localStorage.setItem;
  localStorage.setItem = (k, v) => {
    if (attempt++ === 0) throw new Error('QuotaExceededError');
    realSet.call(localStorage, k, v);
  };
  s().toggleLiked('fill0');   // triggers a save
  s().toggleLiked('fill0');
  await wait();
  localStorage.setItem = realSet;

  const persisted = JSON.parse(localStorage.getItem('vrcstudio_grabber')).items;
  assert.ok(attempt >= 2, 'the fallback path should have run');
  assert.ok(persisted.precious, 'the liked item was dropped when storage filled up');
  ok('a liked item survives the storage-full fallback too');
}

console.log(`\n${pass} cases passed`);
