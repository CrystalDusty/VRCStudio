import assert from 'node:assert/strict';
const store = new Map();
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k,v) => store.set(k,v), removeItem: k => store.delete(k) };
globalThis.window = { electronAPI: undefined };
const { gestureToButtons, LEFT_GESTURE_BUTTONS, RIGHT_GESTURE_BUTTONS, KEY_BUTTONS } = await import('./build/gamestore.mjs');

let pass = 0; const ok = n => { pass++; console.log('  ✓', n); };
console.log('gesture controller');

// Edge-triggered: entering a gesture fires once, holding it fires nothing more.
assert.deepEqual(gestureToButtons('left', 0, 1), ['left']);
assert.deepEqual(gestureToButtons('left', 1, 1), [], 'holding a gesture re-fired');
ok('a button fires when the hand enters a gesture, not while it is held');

// Relaxing the hand is not a button.
assert.deepEqual(gestureToButtons('left', 1, 0), []);
assert.deepEqual(gestureToButtons('right', 3, 0), []);
ok('relaxing the hand fires nothing');

// Moving straight between two gestures fires the new one.
assert.deepEqual(gestureToButtons('left', 1, 2), ['right']);
ok('going straight from one gesture to another fires the new button');

// The gestures people make by accident are deliberately unmapped.
for (const g of [5, 6, 7]) {
  assert.deepEqual(gestureToButtons('left', 0, g), [], `gesture ${g} should be unmapped`);
  assert.deepEqual(gestureToButtons('right', 0, g), [], `gesture ${g} should be unmapped`);
}
ok("rock'n'roll, gun and thumbs-up are left unmapped");

// Left steers, right acts — and no button is claimed by both hands.
const left = Object.values(LEFT_GESTURE_BUTTONS);
const right = Object.values(RIGHT_GESTURE_BUTTONS);
assert.deepEqual(left, ['left', 'right', 'up', 'down']);
assert.deepEqual(right, ['a', 'b', 'start', 'pause']);
assert.equal(new Set([...left, ...right]).size, 8, 'a button is mapped on both hands');
ok('left hand steers, right hand acts, nothing overlaps');

// Every key maps to a real button, and the arrows are all covered.
const buttons = new Set([...left, ...right]);
for (const [key, b] of Object.entries(KEY_BUTTONS)) {
  assert.ok(buttons.has(b), `key ${key} maps to unknown button ${b}`);
}
for (const k of ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter',' ']) {
  assert.ok(KEY_BUTTONS[k], `no keyboard binding for ${k}`);
}
ok('every keyboard binding points at a real button');

console.log(`\n${pass} cases passed`);
