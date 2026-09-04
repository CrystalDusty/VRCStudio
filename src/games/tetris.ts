// Tetris, sized for a chatbox.
//
// 10x9 rather than 10x20. One board row per line of text is forced by the
// chatbox putting a gap between lines: packing two rows into a character cut
// every piece that crossed a line boundary in half. Nine lines is VRChat's
// ceiling, so nine rows is the well — a short one, but one you can read.
// The score rides on the end of the top row, where it costs no height.
//
// Proper rules, not an approximation — 7-bag randomiser so you can't get
// starved of an I-piece, wall kicks so rotating against a wall works, lock
// delay so a piece can be slid after it lands, and a hold slot.

import {
  drawBoard, statusLine, shuffled, DEFAULT_STYLE,
  type ChatboxGame, type GameStatus, type BoardStyle,
} from './core';

export const WIDTH = 10;
// Eight rows of playfield, not nine: the ninth line of the chatbox belongs to
// the status. It used to share the top row, and that made the top row wide
// enough to wrap.
export const HEIGHT = 8;

/** Each piece as its four rotations, listed as (x, y) offsets. */
const PIECES: Record<string, number[][][]> = {
  I: [[[0,1],[1,1],[2,1],[3,1]], [[2,0],[2,1],[2,2],[2,3]], [[0,2],[1,2],[2,2],[3,2]], [[1,0],[1,1],[1,2],[1,3]]],
  J: [[[0,0],[0,1],[1,1],[2,1]], [[1,0],[2,0],[1,1],[1,2]], [[0,1],[1,1],[2,1],[2,2]], [[1,0],[1,1],[0,2],[1,2]]],
  L: [[[2,0],[0,1],[1,1],[2,1]], [[1,0],[1,1],[1,2],[2,2]], [[0,1],[1,1],[2,1],[0,2]], [[0,0],[1,0],[1,1],[1,2]]],
  O: [[[1,0],[2,0],[1,1],[2,1]], [[1,0],[2,0],[1,1],[2,1]], [[1,0],[2,0],[1,1],[2,1]], [[1,0],[2,0],[1,1],[2,1]]],
  S: [[[1,0],[2,0],[0,1],[1,1]], [[1,0],[1,1],[2,1],[2,2]], [[1,1],[2,1],[0,2],[1,2]], [[0,0],[0,1],[1,1],[1,2]]],
  T: [[[1,0],[0,1],[1,1],[2,1]], [[1,0],[1,1],[2,1],[1,2]], [[0,1],[1,1],[2,1],[1,2]], [[1,0],[0,1],[1,1],[1,2]]],
  Z: [[[0,0],[1,0],[1,1],[2,1]], [[2,0],[1,1],[2,1],[1,2]], [[0,1],[1,1],[1,2],[2,2]], [[1,0],[0,1],[1,1],[0,2]]],
};
const PIECE_IDS = Object.keys(PIECES);

// Offsets tried when a rotation is blocked, in order. Enough to get off a wall
// or out of a floor without the full SRS table, which a 10-wide board doesn't
// really need.
const KICKS = [[0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, -1], [-1, -1], [1, -1]];

export interface TetrisState {
  board: number[][];            // 0 = empty, 1 = filled
  piece: string;
  rotation: number;
  x: number;
  y: number;
  bag: string[];
  next: string;
  hold: string | null;
  holdUsed: boolean;
  seed: number;
  score: number;
  lines: number;
  level: number;
  /** Ticks the piece has rested on something, for lock delay. */
  resting: number;
  /** Ticks since the game began, so gravity is a function of state alone. */
  ticks: number;
  over: boolean;
  paused: boolean;
  started: boolean;
}

const emptyBoard = () => Array.from({ length: HEIGHT }, () => new Array(WIDTH).fill(0));

function cells(piece: string, rotation: number, x: number, y: number): number[][] {
  return PIECES[piece][((rotation % 4) + 4) % 4].map(([dx, dy]) => [x + dx, y + dy]);
}

function collides(board: number[][], piece: string, rotation: number, x: number, y: number): boolean {
  for (const [cx, cy] of cells(piece, rotation, x, y)) {
    if (cx < 0 || cx >= WIDTH || cy >= HEIGHT) return true;
    // Above the ceiling is allowed while spawning, but not a filled cell.
    if (cy >= 0 && board[cy][cx]) return true;
  }
  return false;
}

/** Pull the next piece, refilling the bag when it runs dry. */
function drawFromBag(state: { bag: string[]; seed: number }): { piece: string; bag: string[]; seed: number } {
  let { bag, seed } = state;
  if (bag.length === 0) {
    const s = shuffled(PIECE_IDS, seed);
    seed = s.seed;
    bag = s.items;
  }
  const [piece, ...rest] = bag;
  return { piece, bag: rest, seed };
}

function spawn(state: TetrisState, piece: string): TetrisState {
  const x = Math.floor(WIDTH / 2) - 2;
  const y = -1;
  const drawn = drawFromBag(state);
  const next: TetrisState = {
    ...state,
    piece,
    rotation: 0,
    x,
    y,
    resting: 0,
    holdUsed: false,
    next: drawn.piece,
    bag: drawn.bag,
    seed: drawn.seed,
  };
  // No room for the new piece: that's the game.
  if (collides(next.board, piece, 0, x, y)) return { ...next, over: true };
  return next;
}

function lockPiece(state: TetrisState): TetrisState {
  const board = state.board.map(row => [...row]);
  for (const [cx, cy] of cells(state.piece, state.rotation, state.x, state.y)) {
    if (cy < 0) return { ...state, over: true };   // locked out above the ceiling
    board[cy][cx] = 1;
  }

  const kept = board.filter(row => row.some(c => !c));
  const cleared = HEIGHT - kept.length;
  while (kept.length < HEIGHT) kept.unshift(new Array(WIDTH).fill(0));

  // Standard-ish scoring: a tetris is worth far more than four singles.
  const lineScore = [0, 40, 100, 300, 1200][cleared] ?? 1200;
  const lines = state.lines + cleared;
  const withBoard: TetrisState = {
    ...state,
    board: kept,
    score: state.score + lineScore * (state.level + 1),
    lines,
    level: Math.floor(lines / 10),
  };
  return spawn(withBoard, state.next);
}

function moved(state: TetrisState, dx: number, dy: number): TetrisState {
  if (collides(state.board, state.piece, state.rotation, state.x + dx, state.y + dy)) return state;
  return { ...state, x: state.x + dx, y: state.y + dy, resting: 0 };
}

function rotated(state: TetrisState, dir: number): TetrisState {
  const rotation = (((state.rotation + dir) % 4) + 4) % 4;
  for (const [kx, ky] of KICKS) {
    if (!collides(state.board, state.piece, rotation, state.x + kx, state.y + ky)) {
      return { ...state, rotation, x: state.x + kx, y: state.y + ky, resting: 0 };
    }
  }
  return state;   // genuinely nowhere to turn
}

function hardDrop(state: TetrisState): TetrisState {
  let dropped = state;
  let distance = 0;
  while (!collides(dropped.board, dropped.piece, dropped.rotation, dropped.x, dropped.y + 1)) {
    dropped = { ...dropped, y: dropped.y + 1 };
    distance++;
  }
  return lockPiece({ ...dropped, score: dropped.score + distance * 2 });
}

function swapHold(state: TetrisState): TetrisState {
  if (state.holdUsed) return state;              // once per piece, or it's a free reroll
  const current = state.piece;
  if (state.hold === null) {
    const spawned = spawn(state, state.next);
    return { ...spawned, hold: current, holdUsed: true };
  }
  const x = Math.floor(WIDTH / 2) - 2;
  if (collides(state.board, state.hold, 0, x, -1)) return state;
  return { ...state, piece: state.hold, hold: current, rotation: 0, x, y: -1, resting: 0, holdUsed: true };
}

function fresh(seed: number): TetrisState {
  const first = drawFromBag({ bag: [], seed });
  const second = drawFromBag({ bag: first.bag, seed: first.seed });
  const base: TetrisState = {
    board: emptyBoard(),
    piece: first.piece,
    rotation: 0,
    x: Math.floor(WIDTH / 2) - 2,
    y: -1,
    bag: second.bag,
    next: second.piece,
    hold: null,
    holdUsed: false,
    seed: second.seed,
    score: 0,
    lines: 0,
    level: 0,
    resting: 0,
    ticks: 0,
    over: false,
    paused: false,
    started: true,
  };
  return base;
}

/** Ticks between gravity steps, so higher levels fall faster. */
function gravityEvery(level: number): number {
  return Math.max(1, 6 - Math.min(5, level));
}

export const tetris: ChatboxGame<TetrisState> = {
  id: 'tetris',
  name: 'Tetris',
  blurb: '7-bag randomiser, wall kicks, hold slot and lock delay.',
  controls: {
    left: 'move left', right: 'move right', down: 'soft drop', up: 'rotate',
    a: 'rotate', b: 'hard drop', start: 'restart', pause: 'hold piece',
  },
  tickMs: 450,

  create: seed => fresh(seed),

  tick(state) {
    if (state.over || state.paused) return state;
    // The counter lives in the state, not in a module variable: two games in
    // one session would otherwise share a gravity clock, and a replay from a
    // seed wouldn't reproduce.
    const ticks = state.ticks + 1;
    if (ticks % gravityEvery(state.level) !== 0) return { ...state, ticks };

    if (!collides(state.board, state.piece, state.rotation, state.x, state.y + 1)) {
      return { ...state, ticks, y: state.y + 1, resting: 0 };
    }
    // Resting on something: give one tick of grace so a piece can still be
    // slid into a gap, then lock it.
    if (state.resting >= 1) return { ...lockPiece(state), ticks };
    return { ...state, ticks, resting: state.resting + 1 };
  },

  press(state, button) {
    if (button === 'start') return fresh(state.seed);
    if (state.over) return state;
    if (button === 'pause') return swapHold(state);
    if (state.paused) return state;
    switch (button) {
      case 'left':  return moved(state, -1, 0);
      case 'right': return moved(state, 1, 0);
      case 'down': {
        const next = moved(state, 0, 1);
        // A soft drop that can't move means "lock it now".
        return next === state ? lockPiece(state) : { ...next, score: next.score + 1 };
      }
      case 'up':
      case 'a':     return rotated(state, 1);
      case 'b':     return hardDrop(state);
      default:      return state;
    }
  },

  render(state, style: BoardStyle = DEFAULT_STYLE) {
    const grid = state.board.map(row => [...row]);
    if (!state.over) {
      for (const [cx, cy] of cells(state.piece, state.rotation, state.x, state.y)) {
        if (cy >= 0 && cy < HEIGHT && cx >= 0 && cx < WIDTH) grid[cy][cx] = 1;
      }
    }
    // Plain ASCII only. A tidy ▸ here rendered as a hollow circle in VRChat —
    // its chatbox font simply doesn't have that character — so the score line
    // read as a random blob followed by a stray letter.
    //
    // It has to fit the board's width in characters, so "next" is a bare
    // letter and the score comes last: if anything is trimmed at an
    // implausible score, losing a digit beats losing the next piece.
    const hud = state.over
      ? `over ${state.score}`
      : `${state.next} ${state.lines}L ${state.score}`;
    // Status under the board, matching 2048 and Minesweeper: the board is
    // then always anchored at the top of the box, and if a line ever does
    // wrap it is the last one rather than the one everything hangs off.
    return [...drawBoard(grid, WIDTH, HEIGHT, style), statusLine(hud, WIDTH)];
  },

  status(state): GameStatus {
    return {
      score: state.score,
      label: state.over ? 'Game over' : `${state.lines} lines · level ${state.level + 1}`,
      over: state.over,
      paused: state.paused,
    };
  },
};
