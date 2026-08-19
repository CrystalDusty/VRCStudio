// 2048. Numbers rather than pixels, because the whole point is reading them.

import { fit, randomInt, type ChatboxGame, type GameStatus } from './core';

const SIZE = 4;

export interface G2048State {
  grid: number[][];
  seed: number;
  score: number;
  best: number;
  over: boolean;
  won: boolean;
  paused: boolean;
  /** True when the last press changed nothing, so the UI can say so. */
  stuck: boolean;
}

function emptyCells(grid: number[][]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (grid[y][x] === 0) out.push([y, x]);
  return out;
}

function addTile(grid: number[][], seed: number): { grid: number[][]; seed: number } {
  const free = emptyCells(grid);
  if (free.length === 0) return { grid, seed };
  const pick = randomInt(seed, free.length);
  const four = randomInt(pick.seed, 10);
  const [y, x] = free[pick.value];
  const next = grid.map(row => [...row]);
  next[y][x] = four.value === 0 ? 4 : 2;      // one in ten is a 4
  return { grid: next, seed: four.seed };
}

/** Slide and merge one row to the left. Returns the row and points scored. */
function collapse(row: number[]): { row: number[]; gained: number } {
  const tiles = row.filter(v => v !== 0);
  const out: number[] = [];
  let gained = 0;
  for (let i = 0; i < tiles.length; i++) {
    // Each tile merges at most once per move — the classic rule.
    if (i + 1 < tiles.length && tiles[i] === tiles[i + 1]) {
      const merged = tiles[i] * 2;
      out.push(merged);
      gained += merged;
      i++;
    } else {
      out.push(tiles[i]);
    }
  }
  while (out.length < SIZE) out.push(0);
  return { row: out, gained };
}

const rotate = (grid: number[][]): number[][] =>
  grid[0].map((_, x) => grid.map(row => row[x]).reverse());

/** Rotate so every direction reuses the left-slide, then rotate back. */
function slide(grid: number[][], turns: number): { grid: number[][]; gained: number; moved: boolean } {
  let work = grid.map(row => [...row]);
  for (let i = 0; i < turns; i++) work = rotate(work);

  let gained = 0;
  const collapsed = work.map(row => {
    const r = collapse(row);
    gained += r.gained;
    return r.row;
  });

  let back = collapsed;
  for (let i = 0; i < (4 - turns) % 4; i++) back = rotate(back);

  const moved = JSON.stringify(back) !== JSON.stringify(grid);
  return { grid: back, gained, moved };
}

function canMove(grid: number[][]): boolean {
  if (emptyCells(grid).length > 0) return true;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (x + 1 < SIZE && grid[y][x] === grid[y][x + 1]) return true;
      if (y + 1 < SIZE && grid[y][x] === grid[y + 1][x]) return true;
    }
  }
  return false;
}

function fresh(seed: number, best = 0): G2048State {
  const blank = Array.from({ length: SIZE }, () => new Array(SIZE).fill(0));
  const one = addTile(blank, seed);
  const two = addTile(one.grid, one.seed);
  return { grid: two.grid, seed: two.seed, score: 0, best, over: false, won: false, paused: false, stuck: false };
}

const TURNS: Record<string, number> = { left: 0, up: 1, right: 2, down: 3 };

export const g2048: ChatboxGame<G2048State> = {
  id: '2048',
  name: '2048',
  blurb: 'Slide to merge. Only moves that change something spend a turn.',
  controls: { left: 'slide left', right: 'slide right', up: 'slide up', down: 'slide down', start: 'restart' },
  tickMs: 0,   // nothing happens on its own

  create: seed => fresh(seed),

  tick: state => state,

  press(state, button) {
    if (button === 'start') return fresh(state.seed, Math.max(state.best, state.score));
    if (state.over || state.paused) return state;
    const turns = TURNS[button];
    if (turns === undefined) return state;

    const result = slide(state.grid, turns);
    // A move that changes nothing must not spawn a tile, or you could shake a
    // full board into a new one.
    if (!result.moved) return { ...state, stuck: true };

    const spawned = addTile(result.grid, state.seed);
    const score = state.score + result.gained;
    return {
      ...state,
      grid: spawned.grid,
      seed: spawned.seed,
      score,
      best: Math.max(state.best, score),
      won: state.won || result.grid.some(row => row.some(v => v >= 2048)),
      over: !canMove(spawned.grid),
      stuck: false,
    };
  },

  render(state) {
    const cell = (v: number) => (v === 0 ? '   ·' : String(v).padStart(4));
    const lines = state.grid.map(row => row.map(cell).join(''));
    lines.push(fit(state.over ? `GAME OVER ${state.score}` : `${state.score}`, 16));
    return lines;
  },

  status(state): GameStatus {
    return {
      score: state.score,
      label: state.over ? 'No moves left' : state.won ? 'You made 2048' : state.stuck ? 'Nothing moved that way' : `best ${state.best}`,
      over: state.over,
      paused: state.paused,
    };
  },
};
