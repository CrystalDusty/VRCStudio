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
  render(state: S, glyphs?: GlyphSet): string[];
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
 * The four glyphs a half-block board is drawn from: empty, top half, bottom
 * half, both.
 *
 * The empty one is the whole reason this is configurable. VRChat's chatbox
 * font is proportional, so a space is much narrower than a block — a row of
 * "  ██  " and a row of "██████" come out different lengths and the columns
 * stop lining up. Worse, it changes as the board changes, which is why it
 * looked fine one moment and skewed the next. Filling empty cells with a glyph
 * from the same Block Elements range gives every cell the same advance width.
 */
export interface GlyphSet {
  id: string;
  name: string;
  note: string;
  empty: string;
  upper: string;
  lower: string;
  full: string;
}

export const GLYPH_SETS: GlyphSet[] = [
  {
    id: 'shade', name: 'Shaded', note: 'Empty cells drawn with ░, same width as the blocks.',
    empty: '\u2591', upper: '\u2580', lower: '\u2584', full: '\u2588',
  },
  {
    id: 'mid', name: 'Mid shade', note: 'Heavier background if ░ is too faint to see.',
    empty: '\u2592', upper: '\u2580', lower: '\u2584', full: '\u2588',
  },
  {
    // Solid halves, not the thin two-dot rows a naive pick gives: dots 1,2,4,5
    // for the top, 3,6,7,8 for the bottom, all eight for a full cell.
    id: 'braille', name: 'Braille', note: 'One width by definition. Smaller, and denser.',
    empty: '\u2800', upper: '\u281B', lower: '\u28E4', full: '\u28FF',
  },
  {
    id: 'space', name: 'Spaces', note: "The old look. Only lines up if your font is monospaced.",
    empty: ' ', upper: '\u2580', lower: '\u2584', full: '\u2588',
  },
];

export const DEFAULT_GLYPHS = GLYPH_SETS[0];

export function glyphSetById(id: string): GlyphSet {
  return GLYPH_SETS.find(g => g.id === id) ?? DEFAULT_GLYPHS;
}

/**
 * Draw a pixel grid as half-block text.
 *
 * `grid[y][x]` is truthy where a pixel is lit. An odd height is padded with an
 * empty row, so callers don't have to think about it.
 */
export function drawPixels(
  grid: ArrayLike<ArrayLike<unknown>>,
  width: number,
  height: number,
  glyphs: GlyphSet = DEFAULT_GLYPHS,
): string[] {
  const table = [glyphs.empty, glyphs.upper, glyphs.lower, glyphs.full];
  const lines: string[] = [];
  for (let y = 0; y < height; y += 2) {
    let line = '';
    for (let x = 0; x < width; x++) {
      const top = grid[y]?.[x] ? 1 : 0;
      const bottom = grid[y + 1]?.[x] ? 2 : 0;
      line += table[top | bottom];
    }
    lines.push(line);
  }
  return lines;
}

/**
 * A line showing every glyph the games might use, for checking what a font
 * actually has. Anything that comes out as a box or a circle is missing — which
 * is how a neat little ▸ ended up on screen as a random-looking blob.
 */
export function fontTestMessage(): string {
  return [
    'VRC Studio font check',
    `blocks ${'\u2588\u2580\u2584'}  shade ${'\u2591\u2592\u2593'}`,
    `braille ${'\u2800\u281B\u28E4\u28FF'}`,
    'any box or circle = missing',
  ].join('\n');
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
