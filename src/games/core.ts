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
 * Three things about VRChat's chatbox force this design, and I got the first
 * two right before understanding the third:
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
 *      the shapes unrecognisable.
 *
 * So: exactly one board row per line of text. The gaps then fall between rows
 * instead of through them, which reads as a grid rather than as damage. It
 * costs board height — nine lines is the hard ceiling — and that is the real
 * price of drawing a game in a text box.
 *
 * Braille is the default because it settles (1) and (2) by construction: every
 * glyph in the range is one width, and U+2800 is a true blank, so the
 * background is dark and the blocks are bright.
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
    id: 'braille', name: 'Braille', filled: '\u28FF', empty: '\u2800',
    note: 'Solid blocks on a dark background, every character the same width by definition.',
  },
  {
    id: 'blocks', name: 'Blocks', filled: '\u2588', empty: '\u2591',
    note: 'Full blocks on light shading. Same width, but the shading can read as noise.',
  },
  {
    id: 'mid', name: 'Mid shade', filled: '\u2588', empty: '\u2592',
    note: 'Heavier background if the light shading is too faint to see.',
  },
  {
    id: 'space', name: 'Spaces', filled: '\u2588', empty: ' ',
    note: 'The most contrast, but only lines up where the font is monospaced.',
  },
  {
    id: 'ascii', name: 'ASCII', filled: '#', empty: '.',
    note: 'Last resort: certain to render anywhere, not certain to line up.',
  },
];

export const DEFAULT_STYLE = BOARD_STYLES[0];

export function boardStyleById(id: string): BoardStyle {
  return BOARD_STYLES.find(s => s.id === id) ?? DEFAULT_STYLE;
}

/**
 * Draw a grid of cells, one row per line.
 *
 * `cells[y][x]` is truthy where a cell is filled. `suffix` is appended to the
 * first line, past the board — text to the right of a row can't shift the
 * columns, so that's a free place to put the score without spending a line.
 */
export function drawBoard(
  cells: ArrayLike<ArrayLike<unknown>>,
  width: number,
  height: number,
  style: BoardStyle = DEFAULT_STYLE,
  suffix = '',
): string[] {
  const lines: string[] = [];
  for (let y = 0; y < height; y++) {
    let line = '';
    for (let x = 0; x < width; x++) line += cells[y]?.[x] ? style.filled : style.empty;
    lines.push(y === 0 && suffix ? `${line} ${suffix}` : line);
  }
  return lines;
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
  return [`${style.name}: sides straight?`, ...drawBoard(cells, W, H, style)].join('\n');
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
