// The regression net.
//
// These suites exist because this project keeps re-breaking the same things:
// the emoji sprite grid took four attempts, the chatbox board three, and each
// time the fix was real but nothing stopped the next change from undoing it.
// Every assertion here is a fault that actually shipped once.
//
// The source is TypeScript spread across an Electron main process and a React
// renderer, neither of which runs under plain Node. So rather than mock any of
// it, the runner bundles the real modules with esbuild and the tests import
// those — including two slices taken out of electron/main.ts at run time, so a
// test can never drift from the code that ships.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const build = path.join(here, 'build');

const esbuild = path.join(root, 'node_modules', '.bin', 'esbuild');

/** Bundle one source module so a test can import the real thing. */
function bundle(entry, out, extra = []) {
  execFileSync(esbuild, [
    path.join(root, entry),
    '--bundle', '--platform=node', '--format=esm',
    `--outfile=${path.join(build, out)}`,
    '--log-level=error',
    ...extra,
  ], { stdio: 'inherit' });
}

/**
 * Cut a region out of electron/main.ts and make it importable.
 *
 * Copying the code would let the test pass while the shipped version rots, so
 * the region is sliced at run time between two landmarks that are themselves
 * part of the file's structure.
 */
function sliceFromMain(startMark, endMark, prelude, exports, out, extra = []) {
  const src = readFileSync(path.join(root, 'electron/main.ts'), 'utf-8');
  const start = src.indexOf(startMark);
  const end = src.indexOf(endMark);
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`Could not slice ${out} out of electron/main.ts — the landmarks moved.\n` +
      `  start: ${JSON.stringify(startMark)} ${start === -1 ? 'NOT FOUND' : 'ok'}\n` +
      `  end:   ${JSON.stringify(endMark)} ${end === -1 ? 'NOT FOUND' : 'ok'}`);
  }
  const tmp = path.join(build, out.replace('.mjs', '.src.ts'));
  writeFileSync(tmp, prelude + src.slice(start, end) + exports, 'utf-8');
  execFileSync(esbuild, [
    tmp, '--bundle', '--platform=node', '--format=esm',
    `--outfile=${path.join(build, out)}`, '--log-level=error', ...extra,
  ], { stdio: 'inherit' });
}

rmSync(build, { recursive: true, force: true });
mkdirSync(build, { recursive: true });

// ── Renderer modules ──
bundle('src/utils/gif.ts', 'gif.mjs');
bundle('src/utils/animation.ts', 'animation.mjs');
bundle('src/utils/imageExport.ts', 'imageExport.mjs');
bundle('src/games/index.ts', 'games.mjs');
bundle('src/stores/grabberStore.ts', 'grabber.mjs');
bundle('src/stores/chatboxGameStore.ts', 'gamestore.mjs');
bundle('src/stores/themeStore.ts', 'themestore.mjs');
bundle('src/utils/avatarPerformance.ts', 'avatarperf.mjs');
bundle('src/utils/avatarHistory.ts', 'avatarlog.mjs');

// ── Electron main ──
bundle('electron/media.ts', 'media.mjs', ['--external:http', '--external:https']);

sliceFromMain(
  '// VRChat OSC convention:', '// ─── Window ─────',
  '// Sliced out of electron/main.ts at test time, with the Electron window\n' +
  '// stubbed, so this can never drift from what ships.\n' +
  'const mainWindow = { webContents: { send: () => {} } } as any;\n\n',
  '\nexport { startOSC, stopOSC, sendOSC, probeUdpPort, oscStatus as status };\n',
  'oscmain.mjs', ['--external:osc', '--external:dgram'],
);

sliceFromMain(
  'function readUpdateBranch()', '// Resolve the locally-installed commit SHA',
  '// Sliced out of electron/main.ts at test time so it cannot drift.\n' +
  'import fs from "node:fs";\n' +
  'import { fileURLToPath } from "node:url";\n' +
  'import path from "node:path";\n' +
  'const UPDATE_BRANCH_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), ".vrcstudio-branch");\n' +
  "const DEFAULT_UPDATE_BRANCH = 'claude/api-integrations-testing';\n",
  '\nexport { readUpdateBranch, writeUpdateBranch, DEFAULT_UPDATE_BRANCH };\n',
  'branch.mjs', ['--external:node:fs', '--external:node:url', '--external:node:path'],
);

// ── Run ──
const only = process.argv[2];
const suites = readdirSync(here)
  .filter(f => f.endsWith('.test.mjs'))
  .filter(f => !only || f.startsWith(only))
  .sort();

let failed = 0;
for (const suite of suites) {
  process.stdout.write(`\n\x1b[1m${suite.replace('.test.mjs', '')}\x1b[0m\n`);
  try {
    execFileSync(process.execPath, [path.join(here, suite)], { stdio: 'inherit' });
  } catch {
    failed++;
  }
}

console.log(failed === 0
  ? `\n\x1b[32m✓ all ${suites.length} suites passed\x1b[0m`
  : `\n\x1b[31m✗ ${failed} of ${suites.length} suites failed\x1b[0m`);
process.exit(failed === 0 ? 0 : 1);
