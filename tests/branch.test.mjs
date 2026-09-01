import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readUpdateBranch, writeUpdateBranch, DEFAULT_UPDATE_BRANCH } from './build/branch.mjs';

let pass = 0; const ok = n => { pass++; console.log('  ✓', n); };
console.log('update branch');

assert.equal(readUpdateBranch(), DEFAULT_UPDATE_BRANCH);
ok('with nothing set, updates follow the default branch');

let r = writeUpdateBranch('claude/api-integrations-testing');
assert.equal(r.ok, true, r.error);
assert.equal(readUpdateBranch(), 'claude/api-integrations-testing');
ok('a branch can be pointed at the one being tested, and it sticks');

r = writeUpdateBranch('  refs/heads/feature/x  ');
assert.equal(r.ok, true, r.error);
assert.equal(readUpdateBranch(), 'feature/x');
ok('a pasted refs/heads/ prefix and stray spaces are tidied away');

// The name goes into a URL and a file path, so it has to be checked.
for (const bad of ['../../etc/passwd', 'a b', 'branch;rm -rf /', '', '   ', 'x'.repeat(300), 'a/../b']) {
  const before = readUpdateBranch();
  const res = writeUpdateBranch(bad);
  assert.equal(res.ok, false, `accepted ${JSON.stringify(bad)}`);
  assert.equal(readUpdateBranch(), before, `${JSON.stringify(bad)} changed the stored branch`);
}
ok('path traversal, spaces, shell characters and empties are all refused');

assert.equal(writeUpdateBranch('main').ok, true);
assert.equal(readUpdateBranch(), 'main');
ok('an ordinary branch name still works');

fs.rmSync(new URL('./build/.vrcstudio-branch', import.meta.url), { force: true });
console.log(`\n${pass} cases passed`);
