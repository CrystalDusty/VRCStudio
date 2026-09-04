// Snake on a 12x9 field.
//
// One row per line of text, because the chatbox puts a gap between lines and
// anything that packs two rows into a character gets sliced through the middle.
// Nine lines is VRChat's ceiling. Fourteen columns fit until the score line
// grew — "0 len 3 walls" pushed a frame to 148 — so twelve, which leaves room
// for a four-figure score and the walls flag. The score rides on the top row.

import {
  drawBoard, statusLine, randomInt, DEFAULT_STYLE,
  type ChatboxGame, type GameStatus, type BoardStyle,
} from './core';

export const WIDTH = 12;
// Eight rows, with the ninth chatbox line kept for the status — see tetris.ts.
export const HEIGHT = 8;

type Point = { x: number; y: number };

export interface SnakeState {
  snake: Point[];               // head first
  dir: Point;
  /** Applied on the next tick, so two turns in one tick can't reverse you. */
  pending: Point;
  food: Point;
  seed: number;
  score: number;
  over: boolean;
  paused: boolean;
  wrap: boolean;
}

const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y;

/** A free cell, chosen without ever looping forever on a nearly-full board. */
function placeFood(snake: Point[], seed: number): { food: Point; seed: number } {
  const free: Point[] = [];
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      if (!snake.some(s => s.x === x && s.y === y)) free.push({ x, y });
    }
  }
  if (free.length === 0) return { food: { x: -1, y: -1 }, seed };   // board full: you won
  const r = randomInt(seed, free.length);
  return { food: free[r.value], seed: r.seed };
}

function fresh(seed: number): SnakeState {
  const snake: Point[] = [
    { x: 5, y: 4 }, { x: 4, y: 4 }, { x: 3, y: 4 },
  ];
  const placed = placeFood(snake, seed);
  return {
    snake,
    dir: { x: 1, y: 0 },
    pending: { x: 1, y: 0 },
    food: placed.food,
    seed: placed.seed,
    score: 0,
    over: false,
    paused: false,
    wrap: true,
  };
}

export const snake: ChatboxGame<SnakeState> = {
  id: 'snake',
  name: 'Snake',
  blurb: 'Wraps at the edges. Turning back on yourself is refused, not fatal.',
  controls: {
    left: 'turn left', right: 'turn right', up: 'turn up', down: 'turn down',
    a: 'toggle wrap', start: 'restart', pause: 'pause',
  },
  tickMs: 400,

  create: seed => fresh(seed),

  tick(state) {
    if (state.over || state.paused) return state;

    const dir = state.pending;
    const head = state.snake[0];
    let nx = head.x + dir.x;
    let ny = head.y + dir.y;

    if (state.wrap) {
      nx = (nx + WIDTH) % WIDTH;
      ny = (ny + HEIGHT) % HEIGHT;
    } else if (nx < 0 || nx >= WIDTH || ny < 0 || ny >= HEIGHT) {
      return { ...state, dir, over: true };
    }

    const next: Point = { x: nx, y: ny };
    const eating = same(next, state.food);
    // The tail vacates this tick, so moving into it is legal — except when
    // eating, because then the tail stays put.
    const body = eating ? state.snake : state.snake.slice(0, -1);
    if (body.some(s => same(s, next))) return { ...state, dir, over: true };

    const grown = [next, ...body];
    if (!eating) return { ...state, dir, snake: grown };

    const placed = placeFood(grown, state.seed);
    return { ...state, dir, snake: grown, food: placed.food, seed: placed.seed, score: state.score + 10 };
  },

  press(state, button) {
    if (button === 'start') return fresh(state.seed);
    if (state.over) return state;
    if (button === 'pause') return { ...state, paused: !state.paused };
    if (button === 'a') return { ...state, wrap: !state.wrap };
    if (state.paused) return state;

    const want: Record<string, Point> = {
      left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
      up: { x: 0, y: -1 }, down: { x: 0, y: 1 },
    };
    const dir = want[button];
    if (!dir) return state;
    // A 180 is a fat-finger, not a move — refuse it rather than ending the run.
    if (state.snake.length > 1 && dir.x === -state.dir.x && dir.y === -state.dir.y) return state;
    return { ...state, pending: dir };
  },

  render(state, style: BoardStyle = DEFAULT_STYLE) {
    const grid = Array.from({ length: HEIGHT }, () => new Array(WIDTH).fill(0));
    if (state.food.x >= 0) grid[state.food.y][state.food.x] = 1;
    for (const s of state.snake) grid[s.y][s.x] = 1;
    const hud = state.over
      ? `over ${state.score}`
      : `${state.score} len ${state.snake.length}${state.wrap ? '' : ' wall'}`;
    // Status under the board, matching 2048 and Minesweeper: the board is
    // then always anchored at the top of the box, and if a line ever does
    // wrap it is the last one rather than the one everything hangs off.
    return [...drawBoard(grid, WIDTH, HEIGHT, style), statusLine(hud, WIDTH)];
  },

  status(state): GameStatus {
    return {
      score: state.score,
      label: state.over ? 'Game over' : `length ${state.snake.length}${state.wrap ? '' : ' · walls on'}`,
      over: state.over,
      paused: state.paused,
    };
  },
};
