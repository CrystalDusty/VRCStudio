# Tests

`npm test` — runs everything. `npm test games` — runs one suite by prefix.

There's no test framework here on purpose. The runner bundles the real modules
with esbuild and each suite is a plain Node script, so a suite can exercise the
Electron main process and the React renderer without either being mocked.

Two suites go further and slice their subject out of `electron/main.ts` at run
time (`osc`, `branch`). Copying that code would let a test keep passing while
the shipped version rots; slicing means the test fails loudly if the landmarks
it cuts between ever move.

## What each suite is defending

Every assertion here is a fault that actually shipped once.

| Suite | Guards against |
|---|---|
| `games` | A chatbox frame over 144 characters or 9 lines; a glyph the VRChat font lacks; a board row that isn't one text line wide. 64,000 fuzzed frames. |
| `layout` | Sprite-sheet grids that cut emoji into slivers, and VRChat's published 1024px / power-of-two sheet format. |
| `gif` | The GIF encoder, round-tripped through an independently written decoder. |
| `export` | Saving an animation with the wrong extension, or flattening it by default. |
| `media` | Telling an animated file from a still one by its bytes, since VRChat serves no extension. |
| `vet` | Sending Discord an image URL it can't fetch — the grey "?" box. |
| `osc` | Reporting a successful connection when the port is held by another app. |
| `liked` | A liked item being lost to Clear, to the history cap, or to a full disk. |
| `gestures` | The VR gesture controller firing on hold, or two hands claiming one button. |
| `branch` | The updater accepting a branch name that isn't safe in a URL or a path. |
| `guardian` | The VR-only theme leaking outside VR mode, or the other nine changing behaviour inside it. |

## Not included

Four more suites need a real browser (frame ordering out of a sprite sheet,
GIF and video encoding, the 146-sheet grid sweep). They need Playwright, which
isn't a dependency of this app, so they aren't wired into `npm test`.
