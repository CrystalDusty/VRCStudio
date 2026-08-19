// Every game the chatbox console knows about.

import type { ChatboxGame } from './core';
import { tetris } from './tetris';
import { snake } from './snake';
import { g2048 } from './g2048';
import { minesweeper } from './minesweeper';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const GAMES: Array<ChatboxGame<any>> = [tetris, snake, g2048, minesweeper];

export function gameById(id: string) {
  return GAMES.find(g => g.id === id) ?? GAMES[0];
}

export * from './core';
export { tetris, snake, g2048, minesweeper };
