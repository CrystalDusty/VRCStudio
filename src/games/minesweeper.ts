// Minesweeper, 8x8 with 10 mines, driven by a cursor because a chatbox has no
// pointer. Eight rows plus a status line is exactly VRChat's nine.

import { fit, randomInt, type ChatboxGame, type GameStatus } from './core';

const SIZE = 8;
const MINES = 10;

export interface MineState {
  mines: boolean[][];
  revealed: boolean[][];
  flags: boolean[][];
  cx: number;
  cy: number;
  seed: number;
  /** Mines are laid on the first reveal, so the opening move is never fatal. */
  laid: boolean;
  over: boolean;
  won: boolean;
  paused: boolean;
  moves: number;
}

const blank = <T,>(v: T) => Array.from({ length: SIZE }, () => new Array(SIZE).fill(v) as T[]);

function layMines(seed: number, safeX: number, safeY: number): { mines: boolean[][]; seed: number } {
  const mines = blank(false);
  let s = seed;
  let placed = 0;
  while (placed < MINES) {
    const rx = randomInt(s, SIZE); s = rx.seed;
    const ry = randomInt(s, SIZE); s = ry.seed;
    const x = rx.value, y = ry.value;
    if (mines[y][x]) continue;
    // Keep the first click and its neighbours clear, so it always opens up.
    if (Math.abs(x - safeX) <= 1 && Math.abs(y - safeY) <= 1) continue;
    mines[y][x] = true;
    placed++;
  }
  return { mines, seed: s };
}

function neighbours(x: number, y: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && nx < SIZE && ny >= 0 && ny < SIZE) out.push([nx, ny]);
    }
  }
  return out;
}

export function countAround(mines: boolean[][], x: number, y: number): number {
  return neighbours(x, y).filter(([nx, ny]) => mines[ny][nx]).length;
}

/** Reveal, opening out across empty ground. Iterative — a recursive flood fill
 *  on a full board is a stack overflow waiting to happen. */
function reveal(state: MineState, x: number, y: number): MineState {
  if (state.revealed[y][x] || state.flags[y][x]) return state;

  let { mines, seed, laid } = state;
  if (!laid) {
    const laidOut = layMines(seed, x, y);
    mines = laidOut.mines;
    seed = laidOut.seed;
    laid = true;
  }

  const revealed = state.revealed.map(row => [...row]);
  if (mines[y][x]) {
    // Show the whole field, the way every minesweeper does.
    for (let ry = 0; ry < SIZE; ry++) for (let rx = 0; rx < SIZE; rx++) if (mines[ry][rx]) revealed[ry][rx] = true;
    revealed[y][x] = true;
    return { ...state, mines, seed, laid, revealed, over: true, moves: state.moves + 1 };
  }

  const queue: Array<[number, number]> = [[x, y]];
  while (queue.length > 0) {
    const [qx, qy] = queue.pop()!;
    if (revealed[qy][qx] || state.flags[qy][qx]) continue;
    revealed[qy][qx] = true;
    if (countAround(mines, qx, qy) === 0) {
      for (const [nx, ny] of neighbours(qx, qy)) if (!revealed[ny][nx]) queue.push([nx, ny]);
    }
  }

  const hidden = revealed.flat().filter(v => !v).length;
  return {
    ...state, mines, seed, laid, revealed,
    won: hidden === MINES,
    over: hidden === MINES,
    moves: state.moves + 1,
  };
}

function fresh(seed: number): MineState {
  return {
    mines: blank(false),
    revealed: blank(false),
    flags: blank(false),
    cx: 3, cy: 3,
    seed,
    laid: false,
    over: false,
    won: false,
    paused: false,
    moves: 0,
  };
}

export const minesweeper: ChatboxGame<MineState> = {
  id: 'minesweeper',
  name: 'Minesweeper',
  blurb: '8×8, 10 mines. The first square you open is always safe.',
  controls: {
    left: 'cursor left', right: 'cursor right', up: 'cursor up', down: 'cursor down',
    a: 'reveal', b: 'flag', start: 'restart',
  },
  tickMs: 0,

  create: seed => fresh(seed),

  tick: state => state,

  press(state, button) {
    if (button === 'start') return fresh(state.seed + 1);
    if (state.over) return state;
    switch (button) {
      case 'left':  return { ...state, cx: (state.cx + SIZE - 1) % SIZE };
      case 'right': return { ...state, cx: (state.cx + 1) % SIZE };
      case 'up':    return { ...state, cy: (state.cy + SIZE - 1) % SIZE };
      case 'down':  return { ...state, cy: (state.cy + 1) % SIZE };
      case 'a':     return reveal(state, state.cx, state.cy);
      case 'b': {
        if (state.revealed[state.cy][state.cx]) return state;
        const flags = state.flags.map(row => [...row]);
        flags[state.cy][state.cx] = !flags[state.cy][state.cx];
        return { ...state, flags };
      }
      default: return state;
    }
  },

  render(state) {
    const DIGITS = ['·', '1', '2', '3', '4', '5', '6', '7', '8'];
    const lines: string[] = [];
    for (let y = 0; y < SIZE; y++) {
      let line = '';
      for (let x = 0; x < SIZE; x++) {
        const here = x === state.cx && y === state.cy;
        let ch: string;
        if (state.flags[y][x] && !state.revealed[y][x]) ch = '⚑';
        else if (!state.revealed[y][x]) ch = '▓';
        else if (state.mines[y][x]) ch = '✳';
        else ch = DIGITS[countAround(state.mines, x, y)];
        // The cursor has to be visible without a pointer, so it sits after the
        // cell it points at. Every cell is two characters so the columns stay
        // square; the trailing space is trimmed because a full 8x8 board with
        // a status line came to exactly 144 characters — legal, but with no
        // room left for the next change to the status text.
        line += ch + (here ? '<' : ' ');
      }
      lines.push(line.replace(/ +$/, ''));
    }
    const flagged = state.flags.flat().filter(Boolean).length;
    lines.push(state.won ? 'CLEARED' : state.over ? 'BOOM' : `mines ${MINES - flagged}`);
    return lines;
  },

  status(state): GameStatus {
    const flagged = state.flags.flat().filter(Boolean).length;
    return {
      score: state.revealed.flat().filter(Boolean).length,
      label: state.won ? 'Cleared it' : state.over ? 'Hit a mine' : `${MINES - flagged} mines unflagged`,
      over: state.over,
      paused: false,
    };
  },
};
