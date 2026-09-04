// The shape every chatbox game takes.
//
// Games are pure: `create`, `press` and `tick` return new state, `render`
// turns state into lines of text. Nothing here touches OSC, the DOM or a
// clock. That's deliberate — it's the only way to play a game ten thousand
// times in a test and know it never throws, never renders past VRChat's
// limits and never lands in an impossible state.

/** VRChat's chatbox: 144 characters, at most 9 lines, newlines allowed. */
export const CHATBOX_MAX_CHARS = 144;
export const CHATBOX_MAX_LINES = 9;

/**
 * The buttons a game can receive.
 *
 * Four directions and four actions, because that's what maps cleanly onto two
 * hands of VRChat gestures — and onto a keyboard for anyone at a desk.
 */
export type Button = 'left' | 'right' | 'up' | 'down' | 'a' | 'b' | 'start' | 'pause';

export const ALL_BUTTONS: Button[] = ['left', 'right', 'up', 'down', 'a', 'b', 'start', 'pause'];

export interface GameStatus {
  score: number;
  /** Shown under the board. Keep it short — it shares the 144. */
  label: string;
  over: boolean;
  paused: boolean;
}

export interface ChatboxGame<S> {
  id: string;
  name: string;
  /** One line, shown in the picker. */
  blurb: string;
  /** What each button does, for the on-screen control map. */
  controls: Partial<Record<Button, string>>;
  /** Milliseconds between `tick` calls. Games that only move on input use 0. */
  tickMs: number;

  create(seed: number): S;
  /** Advance by one tick. Must be a no-op when paused or over. */
  tick(state: S): S;
  /** Handle a button. Must be a no-op when over, except for `start`. */
  press(state: S, button: Button): S;
  render(state: S, style?: BoardStyle): string[];
  status(state: S): GameStatus;
}

// ── Deterministic randomness ────────────────────────────────────────────────
//
// Games carry their own RNG state so a seed replays exactly. Tests rely on
// that: a failure found by fuzzing can be reproduced from its seed.

export function nextRandom(seed: number): { seed: number; value: number } {
  // mulberry32 — small, fast, and good enough for a falling block.
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { seed: t | 0, value };
}

export function randomInt(seed: number, maxExclusive: number): { seed: number; value: number } {
  const r = nextRandom(seed);
  return { seed: r.seed, value: Math.floor(r.value * maxExclusive) % Math.max(1, maxExclusive) };
}

/** Fisher–Yates using the seeded RNG, so shuffles replay too. */
export function shuffled<T>(items: T[], seed: number): { seed: number; items: T[] } {
  const out = [...items];
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    const r = randomInt(s, i + 1);
    s = r.seed;
    [out[i], out[r.value]] = [out[r.value], out[i]];
  }
  return { seed: s, items: out };
}

// ── Drawing ─────────────────────────────────────────────────────────────────
//
// Half-block characters give two vertical pixels per character, which is the
// best resolution-per-character trade the chatbox allows: a 10x16 playfield
// becomes 10 characters across and 8 lines down, leaving a line for the score
// inside the nine-line limit. Braille packs tighter but is far harder to read
// at chatbox size.

/**
 * How a board of cells is turned into text.
 *
 * Four things about VRChat's chatbox force this design, and each one was found
 * the hard way, in this order:
 *
 *   1. The font is proportional, so a space is much narrower than a block. A
 *      board that mixes them changes width as it changes contents, and the
 *      columns drift.
 *   2. Shade characters fix the width but read as bright diagonal hatching,
 *      which has little contrast against a solid block.
 *   3. **Lines have leading.** Characters like ▀ and ▄ are designed to tile
 *      edge to edge vertically, and in the chatbox they cannot — there is a gap
 *      between every line. Packing two board rows into one character therefore
 *      cuts every piece that spans a line boundary in half, which is what made
 *      the shapes unrecognisable. So: exactly one board row per line of text.
 *   4. **The font's coverage is narrow.** Braille settles (1) and (2) by
 *      construction — every glyph in the range is one width and U+2800 is a
 *      true blank — so it was the default, and it was wrong: VRChat has no
 *      Braille Patterns block, and every cell of every board came out as the
 *      missing-glyph circle. A style that is perfect on paper and absent from
 *      the font renders a board of ○.
 *
 * Hence the ordering below: styles the chatbox is known to draw come first,
 * and the default is one of those. Which glyphs a given VRChat build actually
 * has is not knowable from here, so `glyphTestMessage` puts every style in the
 * chatbox at once and lets the user pick by looking — one round trip instead
 * of one per style.
 */
export interface BoardStyle {
  id: string;
  name: string;
  note: string;
  filled: string;
  empty: string;
}

export const BOARD_STYLES: BoardStyle[] = [
  {
    id: 'blocks', name: 'Blocks', filled: '\u2588', empty: '\u2591',
    note: 'Full blocks on light shading. Block Elements are one width, and the chatbox draws them.',
  },
  {
    id: 'mid', name: 'Mid shade', filled: '\u2588', empty: '\u2592',
    note: 'The same, with a heavier background if the light shading is too faint to see.',
  },
  {
    id: 'space', name: 'Spaces', filled: '\u2588', empty: ' ',
    note: 'The most contrast there is, but a space is narrower than a block, so rows drift.',
  },
  {
    // The last resort that can both render and line up: full-width forms are
    // one width by definition, and CJK coverage is the one thing a chatbox
    // that supports Japanese is certain to have.
    id: 'wide', name: 'Full width', filled: '\uFF38', empty: '\u3000',
    note: 'Full-width characters — certain to line up, but twice as wide, so the board may wrap.',
  },
  {
    id: 'ascii', name: 'ASCII', filled: '#', empty: '.',
    note: 'Certain to render anywhere, not certain to line up. Use it if nothing else draws.',
  },
  {
    id: 'braille', name: 'Braille', filled: '\u28FF', empty: '\u2800',
    note: 'One width and a true blank — but VRChat has no Braille glyphs, so this draws circles.',
  },
];

export const DEFAULT_STYLE = BOARD_STYLES[0];

/**
 * Styles this app has seen VRChat fail to draw.
 *
 * Kept as choices rather than deleted — font coverage is a property of the
 * build the player is running, not a constant — but never the default, and
 * flagged in the picker.
 */
export const KNOWN_MISSING_IN_VRCHAT = ['braille'];

export function boardStyleById(id: string): BoardStyle {
  return BOARD_STYLES.find(s => s.id === id) ?? DEFAULT_STYLE;
}

/**
 * Draw a grid of cells, one row per line and nothing else on those lines.
 *
 * `cells[y][x]` is truthy where a cell is filled.
 *
 * The score used to ride along on the end of the first row, on the theory that
 * text to the right of a board row can't shift its columns and was therefore
 * free. It isn't free: **the chatbox wraps.** A row of blocks plus a score is
 * wider than the box, so VRChat broke the line, centred the remainder on a
 * line of its own, and pushed the whole board down — the board appeared to
 * start, stop, and restart two lines lower. A board line now carries the board
 * and nothing else, and the status gets its own line via `statusLine`.
 */
export function drawBoard(
  cells: ArrayLike<ArrayLike<unknown>>,
  width: number,
  height: number,
  style: BoardStyle = DEFAULT_STYLE,
): string[] {
  const lines: string[] = [];
  for (let y = 0; y < height; y++) {
    let line = '';
    for (let x = 0; x < width; x++) line += cells[y]?.[x] ? style.filled : style.empty;
    lines.push(line);
  }
  return lines;
}

/**
 * The status line above a board, clamped so it cannot be the line that wraps.
 *
 * The budget is the board's width in *characters*, which is deliberately
 * pessimistic: the chatbox font is proportional, and a digit or a letter is
 * appreciably narrower than a block, so a status of `width` characters is
 * around half the visual width of a board row. That leaves the board as the
 * only thing that decides how wide the chatbox gets, which is the property
 * worth having — the box then sizes itself once and never reflows.
 *
 * Overflow is trimmed from the right, so games put the field they can most
 * afford to lose last.
 */
export function statusLine(text: string, width: number): string {
  return text.length <= width ? text : text.slice(0, width).trimEnd();
}

/**
 * Put every style in the chatbox at once, numbered.
 *
 * This is the first thing to do on a new machine. Whether a glyph exists is a
 * fact about the player's VRChat build that this app cannot read, and testing
 * one style per message means a trip to the headset for each. One message with
 * all of them costs a single look: the row that shows a solid bar against a
 * flat background is the style to pick, and the numbers match the picker.
 */
export function glyphTestMessage(): string {
  const RUN = 5;
  const rows = BOARD_STYLES.map((style, i) =>
    `${i + 1} ${style.filled.repeat(RUN)}${style.empty.repeat(RUN)}`);
  // The header has to be shorter than a row or it becomes the line that wraps,
  // which is the very failure this message exists to help diagnose. The panel
  // next to the button carries the full explanation; this only has to label.
  return ['pick one:', ...rows].join('\n');
}

/**
 * A message for checking a style against the real chatbox font.
 *
 * It draws a rectangle. Straight sides and square corners mean this style lines
 * up in your font; an edge that wanders means its blank is a different width
 * from its block. Boxes or circles mean the characters aren't in the font.
 */
export function alignmentTestMessage(style: BoardStyle = DEFAULT_STYLE): string {
  const W = 12, H = 6;
  const cells: boolean[][] = [];
  for (let y = 0; y < H; y++) {
    cells.push(Array.from({ length: W }, (_, x) =>
      y === 0 || y === H - 1 || x === 0 || x === W - 1));
  }
  // Label under the rectangle and no wider than it, for the same reason the
  // games put their status last: a long line makes the chatbox wrap, and a
  // wrapped line in an alignment test is indistinguishable from a real fault.
  const n = BOARD_STYLES.findIndex(s => s.id === style.id) + 1;
  return [...drawBoard(cells, W, H, style), statusLine(`${n} ${style.name}`, W)].join('\n');
}

/** Pad or trim a line to an exact width, so a board never looks ragged. */
export function fit(text: string, width: number): string {
  return text.length >= width ? text.slice(0, width) : text + ' '.repeat(width - text.length);
}

/**
 * What actually gets sent, and whether it fits.
 *
 * A game that renders past either limit is a bug, not a display quirk: VRChat
 * silently truncates, so it would show a board with its bottom row missing.
 */
export function composeFrame(lines: string[]): string {
  return lines.join('\n');
}

export function frameFits(lines: string[]): boolean {
  return lines.length <= CHATBOX_MAX_LINES
    && composeFrame(lines).length <= CHATBOX_MAX_CHARS;
}
