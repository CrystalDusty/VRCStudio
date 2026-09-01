import assert from 'node:assert/strict';
// The theme store touches the DOM and localStorage at import time; stub both.
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.document = {
  documentElement: { classList: { add() {}, remove() {}, toggle() {} }, style: { setProperty() {} } },
  body: { style: {} },
};
globalThis.window = { electronAPI: undefined };
const { visiblePremiumTheme } = await import('./build/themestore.mjs');

let pass = 0; const ok = n => { pass++; console.log('  ✓', n); };
console.log('Guardian is a VR-only theme');

// The point of the whole feature.
assert.equal(visiblePremiumTheme('guardian', true), 'guardian');
assert.equal(visiblePremiumTheme('guardian', false), 'none');
ok('shows in VR mode, and nowhere else');

// Leaving VR must not silently erase the choice — turning VR back on brings it
// back, rather than dumping the user on "Off".
assert.equal(visiblePremiumTheme('guardian', false), 'none');
assert.equal(visiblePremiumTheme('guardian', true), 'guardian');
ok('the selection survives a trip out of VR mode and back');

// Every other theme is untouched by VR mode either way.
for (const t of ['iridescent', 'holographic', 'aurora', 'cosmic', 'synthwave', 'asteroids', 'koi', 'hacker']) {
  assert.equal(visiblePremiumTheme(t, true), t, `${t} in VR`);
  assert.equal(visiblePremiumTheme(t, false), t, `${t} outside VR`);
}
ok('the other eight themes are unaffected by VR mode');

assert.equal(visiblePremiumTheme('none', true), 'none');
assert.equal(visiblePremiumTheme(undefined, true), 'none');
assert.equal(visiblePremiumTheme(undefined, undefined), 'none');
ok('no theme, or a missing setting, stays off');

console.log(`\n${pass} cases passed`);
