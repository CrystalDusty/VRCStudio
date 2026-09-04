import assert from 'node:assert/strict';
import { GAMES, ALL_BUTTONS, frameFits, composeFrame, CHATBOX_MAX_CHARS, CHATBOX_MAX_LINES,
         BOARD_STYLES, boardStyleById, alignmentTestMessage, glyphTestMessage,
         DEFAULT_STYLE, KNOWN_MISSING_IN_VRCHAT,
         tetris, snake, g2048, minesweeper } from './build/games.mjs';

let pass = 0;
const ok = n => { pass++; console.log('  ✓', n); };

// ── The invariant that matters most: whatever you do, for however long, the
//    game must never throw and must never render something VRChat will cut off.
console.log('every game, fuzzed');
{
  let totalFrames = 0;
  let worstChars = 0, worstLines = 0;
  const failures = [];

  for (const game of GAMES) {
    for (let seed = 0; seed < 40; seed++) {
      let state = game.create(seed * 7919);
      let rng = seed + 1;
      const rand = n => { rng = (rng * 1103515245 + 12345) & 0x7fffffff; return rng % n; };

      for (let step = 0; step < 400; step++) {
        try {
          if (rand(3) === 0) state = game.tick(state);
          else state = game.press(state, ALL_BUTTONS[rand(ALL_BUTTONS.length)]);
          const lines = game.render(state);
          const frame = composeFrame(lines);
          totalFrames++;
          worstChars = Math.max(worstChars, frame.length);
          worstLines = Math.max(worstLines, lines.length);
          if (!frameFits(lines)) {
            failures.push(`${game.id} seed ${seed} step ${step}: ${lines.length} lines, ${frame.length} chars`);
          }
          const st = game.status(state);
          if (typeof st.score !== 'number' || Number.isNaN(st.score)) {
            failures.push(`${game.id} seed ${seed} step ${step}: score is ${st.score}`);
          }
        } catch (err) {
          failures.push(`${game.id} seed ${seed} step ${step} threw: ${err.message}`);
          break;
        }
      }
    }
  }
  assert.deepEqual(failures.slice(0, 5), [], failures.slice(0, 5).join('\n  '));
  ok(`${totalFrames.toLocaleString()} frames across 4 games: no throws, worst frame ${worstChars}/${CHATBOX_MAX_CHARS} chars, ${worstLines}/${CHATBOX_MAX_LINES} lines`);
}

// ── Nothing may reach the chatbox that VRChat's font might not have.
//    A tidy ▸ in the Tetris score line came out as a hollow circle in game and
//    read as a random blob. Only ASCII plus the chosen board glyphs are safe.
console.log('\nglyph safety');
{
  const offenders = new Map();
  for (const set of BOARD_STYLES) {
    const glyphs = boardStyleById(set.id);
    const allowed = new Set([glyphs.empty, glyphs.filled, '\n']);
    for (const game of GAMES) {
      for (let seed = 0; seed < 12; seed++) {
        let state = game.create(seed * 31);
        for (let step = 0; step < 120; step++) {
          state = step % 3 === 0 ? game.tick(state) : game.press(state, ALL_BUTTONS[step % ALL_BUTTONS.length]);
          for (const ch of composeFrame(game.render(state, glyphs))) {
            const code = ch.codePointAt(0);
            const printableAscii = code >= 0x20 && code <= 0x7e;
            if (!printableAscii && !allowed.has(ch)) {
              offenders.set(`${game.id}/${set.id}`, `${ch} U+${code.toString(16).toUpperCase().padStart(4, '0')}`);
            }
          }
        }
      }
    }
  }
  assert.deepEqual([...offenders], [],
    [...offenders].map(([k, v]) => `${k}: ${v}`).join('\n  '));
  ok('no frame contains anything but ASCII and the chosen board glyphs');
}

// ── Exactly one board row per line, every row the same width, and nothing but
//    the two board characters in it. The chatbox puts a gap between lines, so a
//    renderer that packs two rows into a character slices every piece that
//    crosses a line boundary — the shapes came out unrecognisable.
{
  const problems = [];
  for (const set of BOARD_STYLES) {
    if (set.id === 'space' || set.id === 'ascii') continue;   // opt-outs, may not align
    const style = boardStyleById(set.id);
    const family = new Set([style.empty, style.filled]);
    for (const [game, height] of [[tetris, 8], [snake, 8]]) {
      let state = game.create(7);
      for (let step = 0; step < 200; step++) {
        state = step % 2 === 0 ? game.tick(state) : game.press(state, ALL_BUTTONS[step % 6]);
        const lines = game.render(state, style);
        const board = lines.filter(l => [...l].every(c => family.has(c)));
        if (board.length !== height) problems.push(`${game.id}/${set.id}: ${board.length} board rows, want ${height}`);
        const widths = new Set(board.map(l => [...l].length));
        if (widths.size !== 1) problems.push(`${game.id}/${set.id}: rows of ${[...widths]} characters`);
      }
    }
  }
  assert.deepEqual(problems.slice(0, 4), [], problems.slice(0, 4).join('\n  '));
  ok('one row per line, every row the same width, nothing but board characters in it');
}

// ── The status gets its own line, it is always the last one, and it is never
//    wider than the board.
//
//    The score used to ride on the end of the top row, because text to the
//    right of a board can't shift its columns. It can do something worse: the
//    chatbox wraps. A row of blocks plus a score was wider than the box, so
//    VRChat broke the line, centred the remainder on a line of its own, and
//    pushed the board down — it appeared to start, stop, and restart two lines
//    lower.
//
//    Measuring in characters is deliberately pessimistic. The font is
//    proportional and a digit is appreciably narrower than a block, so a
//    status no longer than the board's *character* width is roughly half its
//    visual width. The board is then the only thing deciding how wide the box
//    gets, and the box never reflows.
{
  const problems = [];
  const drawn = new Set(['tetris', 'snake']);   // the games that use drawBoard
  for (const set of BOARD_STYLES) {
    const style = boardStyleById(set.id);
    for (const game of GAMES) {
      for (let seed = 0; seed < 8; seed++) {
        let state = game.create(seed * 977);
        for (let step = 0; step < 150; step++) {
          state = step % 3 === 0 ? game.tick(state) : game.press(state, ALL_BUTTONS[step % ALL_BUTTONS.length]);
          const lines = game.render(state, style);
          const board = lines.slice(0, -1);
          const status = lines[lines.length - 1] ?? '';
          const boardWidth = Math.max(0, ...board.map(l => [...l].length));

          if ([...status].length > boardWidth) {
            problems.push(`${game.id}/${set.id}: status "${status}" is ${[...status].length} chars, board is ${boardWidth}`);
          }
          if (drawn.has(game.id)) {
            if (status.includes(style.filled)) {
              problems.push(`${game.id}/${set.id}: a board block leaked into the status "${status}"`);
            }
            for (const row of board) {
              if ([...row].length !== boardWidth) {
                problems.push(`${game.id}/${set.id}: row "${row}" is ${[...row].length} of ${boardWidth}`);
              }
            }
          }
        }
      }
    }
  }
  assert.deepEqual(problems.slice(0, 4), [], problems.slice(0, 4).join('\n  '));
  ok('the status is the last line, on its own, and never wider than the board');
}

{
  for (const set of BOARD_STYLES) {
    const test = alignmentTestMessage(boardStyleById(set.id));
    assert.ok(test.split('\n').length <= CHATBOX_MAX_LINES, `${set.id} font test is too many lines`);
    assert.ok(test.length <= CHATBOX_MAX_CHARS, `${set.id} font test is ${test.length} chars`);
  }
  // The test messages live under the same rule as the games: the widest line
  // must be a board line. A wrapped header in an alignment test reads as the
  // fault it is supposed to be diagnosing.
  for (const set of BOARD_STYLES) {
    const lines = alignmentTestMessage(boardStyleById(set.id)).split('\n');
    const widest = Math.max(...lines.slice(0, -1).map(l => [...l].length));
    assert.ok([...lines[lines.length - 1]].length <= widest,
      `${set.id}: the alignment test's label is wider than the rectangle`);
  }
  {
    const lines = glyphTestMessage().split('\n');
    const widest = Math.max(...lines.slice(1).map(l => [...l].length));
    assert.ok([...lines[0]].length <= widest,
      `the all-styles test header is ${lines[0].length} chars, rows are ${widest}`);
  }

  const all = glyphTestMessage();
  assert.ok(all.split('\n').length <= CHATBOX_MAX_LINES,
    `the all-styles test is ${all.split('\n').length} lines`);
  assert.ok(all.length <= CHATBOX_MAX_CHARS, `the all-styles test is ${all.length} chars`);
  ok('both font tests fit in the chatbox, for every style');

  // The point of the all-styles test is that the number in the chatbox is the
  // number on the button. Off-by-one there sends someone to the wrong style.
  const rows = glyphTestMessage().split('\n').slice(1);
  assert.equal(rows.length, BOARD_STYLES.length, 'every style needs a row');
  BOARD_STYLES.forEach((set, i) => {
    assert.ok(rows[i].startsWith(`${i + 1} `), `row ${i} is labelled "${rows[i].slice(0, 4)}"`);
    assert.ok(rows[i].includes(set.filled), `row ${i} doesn't show ${set.id}'s block`);
  });
  ok('the numbers in the chatbox match the order of the style buttons');
}

// ── The default board style has to be one VRChat can actually draw.
//    Braille was the default for a while: one width by construction and a true
//    blank, perfect on paper — and absent from VRChat's chatbox font, so every
//    cell of every board arrived as the missing-glyph circle. A style being
//    theoretically ideal is worth nothing if the font hasn't got it.
{
  assert.ok(!KNOWN_MISSING_IN_VRCHAT.includes(DEFAULT_STYLE.id),
    `the default style is ${DEFAULT_STYLE.id}, which VRChat can't draw`);
  assert.equal(BOARD_STYLES[0].id, DEFAULT_STYLE.id, 'the default should be the first choice offered');
  // Anything flagged as missing must still be a real style, or the picker and
  // the migration are pointing at nothing.
  for (const id of KNOWN_MISSING_IN_VRCHAT) {
    assert.ok(BOARD_STYLES.some(s => s.id === id), `${id} is flagged missing but isn't a style`);
  }
  ok('the default is a style VRChat is known to draw');

  for (const set of BOARD_STYLES) {
    assert.notEqual(set.filled, set.empty, `${set.id}: a filled cell looks like an empty one`);
    assert.equal([...set.filled].length, 1, `${set.id}: filled must be one character`);
    assert.equal([...set.empty].length, 1, `${set.id}: empty must be one character`);
    assert.ok(set.note && set.note.length > 20, `${set.id} needs a note explaining the trade`);
  }
  ok('every style is two distinct single characters with the trade-off written down');
}

// ── Determinism: same seed, same inputs, same game. Without this a bug found
//    by fuzzing can't be reproduced.
console.log('\ndeterminism');
{
  for (const game of GAMES) {
    const play = () => {
      let s = game.create(12345);
      for (let i = 0; i < 200; i++) {
        s = i % 3 === 0 ? game.tick(s) : game.press(s, ALL_BUTTONS[i % ALL_BUTTONS.length]);
      }
      return JSON.stringify(game.render(s)) + '|' + game.status(s).score;
    };
    assert.equal(play(), play(), `${game.id} is not deterministic`);
  }
  ok('all four replay identically from the same seed');
}

// ── Tetris rules ──
console.log('\nTetris');
{
  const drop = s => tetris.press(s, 'b');
  let s = tetris.create(1);
  const first = s.piece;
  assert.ok(first && s.next && s.next !== undefined, 'a piece and a preview from the start');
  ok('starts with a piece and a preview');

  // 7-bag: every seven pieces contain each shape exactly once. The board is
  // wiped between drops so the run doesn't top out and start repeating the
  // same piece — which is what a stalled game looks like, not a bag fault.
  {
    let st = tetris.create(99);
    const seen = [st.piece];
    for (let i = 0; i < 20; i++) {
      st = drop(st);
      st = { ...st, board: st.board.map(r => r.map(() => 0)), over: false };
      seen.push(st.piece);
    }
    const firstSeven = seen.slice(0, 7);
    assert.equal(new Set(firstSeven).size, 7, `bag repeated: ${firstSeven.join('')}`);
    const secondSeven = seen.slice(7, 14);
    assert.equal(new Set(secondSeven).size, 7, `second bag repeated: ${secondSeven.join('')}`);
    ok('the 7-bag gives each piece exactly once per bag');
  }

  // A hard drop must land the piece, not leave it floating.
  {
    let st = tetris.create(5);
    const before = st.board.flat().filter(Boolean).length;
    st = drop(st);
    const after = st.board.flat().filter(Boolean).length;
    assert.equal(after, before + 4, `expected 4 new cells, got ${after - before}`);
    ok('a hard drop locks exactly four cells into the board');
  }

  // Filling a row must clear it and pay for it.
  {
    let st = tetris.create(3);
    // Hand-build a board with one row missing a single cell, then drop into it.
    const board = st.board.map(r => [...r]);
    // Read the floor off the board rather than naming it: the playfield lost a
    // row when the status moved onto a line of its own, and a hardcoded 8 here
    // failed as a crash rather than as the assertion it was meant to be.
    const floor = board.length - 1;
    for (let x = 0; x < board[floor].length; x++) if (x !== 4) board[floor][x] = 1;
    st = { ...st, board, piece: 'I', rotation: 1, x: 2, y: 0, score: 0, lines: 0 };
    // Rotation 1 of I is a vertical bar in column x+2 — drop it into the gap.
    st = drop(st);
    assert.equal(st.lines, 1, `cleared ${st.lines} lines`);
    assert.ok(st.score > 0, 'a line clear should score');
    assert.ok(st.board[floor].some(c => !c), 'the completed row should be gone');
    ok('completing a row clears it and scores');
  }

  // Rotating against the left wall must kick, not refuse.
  {
    let st = tetris.create(11);
    st = { ...st, piece: 'I', rotation: 1, x: -2, y: 4 };
    const turned = tetris.press(st, 'a');
    assert.notEqual(turned.rotation, st.rotation, 'rotation against the wall was refused');
    ok('rotating against a wall kicks the piece clear');
  }

  // Hold swaps once per piece, not repeatedly.
  {
    let st = tetris.create(7);
    const a = st.piece;
    st = tetris.press(st, 'pause');
    assert.equal(st.hold, a, 'hold should now contain the first piece');
    const held = st.hold;
    st = tetris.press(st, 'pause');
    assert.equal(st.hold, held, 'hold swapped twice for one piece');
    ok('hold works once per piece');
  }

  // Stacking to the ceiling ends the game rather than corrupting the board.
  {
    let st = tetris.create(2);
    for (let i = 0; i < 200 && !st.over; i++) st = drop(st);
    assert.equal(st.over, true, 'the board never topped out');
    // Shape, not size: the playfield height is a layout decision that has
    // already changed once, and pinning the number here only breaks the test.
    const start = tetris.create(2);
    assert.equal(st.board.length, start.board.length);
    assert.ok(st.board.every(r => r.length === start.board[0].length), 'board shape survived');
    ok('stacking to the top ends the game with the board intact');
  }
}

// ── Snake rules ──
console.log('\nSnake');
{
  let s = snake.create(4);
  const turned = snake.press(s, 'left');       // moving right, so this is a 180
  const after = snake.tick(turned);
  assert.equal(after.over, false, 'a refused 180 killed the snake');
  ok('reversing into yourself is refused, not fatal');

  // Two turns inside one tick must not compose into a reversal.
  {
    let st = snake.create(9);                  // heading right
    st = snake.press(st, 'up');
    st = snake.press(st, 'left');              // legal only relative to "up"
    const moved = snake.tick(st);
    assert.equal(moved.over, false, 'double-turn produced a self-collision');
    ok('two turns in one tick cannot fold the snake back on itself');
  }

  // Eating grows the snake and moves the food off the snake.
  {
    let st = snake.create(21);
    st = { ...st, food: { x: st.snake[0].x + 1, y: st.snake[0].y } };
    const len = st.snake.length;
    st = snake.tick(st);
    assert.equal(st.snake.length, len + 1, 'eating did not grow the snake');
    assert.ok(!st.snake.some(p => p.x === st.food.x && p.y === st.food.y), 'food spawned inside the snake');
    ok('eating grows the snake and the next food lands on free ground');
  }

  // Walls mode actually ends the game.
  {
    let st = snake.create(3);
    st = { ...st, wrap: false, snake: [{ x: 11, y: 5 }], dir: { x: 1, y: 0 }, pending: { x: 1, y: 0 } };
    st = snake.tick(st);
    assert.equal(st.over, true, 'walked through the wall');
    ok('with walls on, the edge is fatal');
  }

  // Wrap mode crosses the edge instead.
  {
    let st = snake.create(3);
    st = { ...st, wrap: true, snake: [{ x: 11, y: 5 }], dir: { x: 1, y: 0 }, pending: { x: 1, y: 0 } };
    st = snake.tick(st);
    assert.equal(st.over, false);
    assert.equal(st.snake[0].x, 0, 'did not wrap to the far side');
    ok('with wrap on, the edge carries you round');
  }
}

// ── 2048 rules ──
console.log('\n2048');
{
  // The classic merge rules: one merge per tile per move, and [2,2,2,2] is two
  // fours rather than one eight.
  const rowOf = (...v) => [v.concat([0,0,0,0]).slice(0,4)].concat([[0,0,0,0],[0,0,0,0],[0,0,0,0]]);
  let st = g2048.create(1);
  st = { ...st, grid: [[2,2,2,2],[0,0,0,0],[0,0,0,0],[0,0,0,0]] };
  const left = g2048.press(st, 'left');
  assert.deepEqual(left.grid[0].slice(0, 2), [4, 4], `got ${left.grid[0]}`);
  ok('[2,2,2,2] slides to [4,4], not [8]');

  {
    let s2 = g2048.create(2);
    s2 = { ...s2, grid: [[4,2,2,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]] };
    const r = g2048.press(s2, 'left');
    assert.deepEqual(r.grid[0].slice(0, 2), [4, 4], `got ${r.grid[0]}`);
    ok('a merge does not cascade into the tile beside it');
  }

  // A move that changes nothing must not spawn a tile.
  {
    let s3 = g2048.create(3);
    s3 = { ...s3, grid: [[2,4,8,16],[0,0,0,0],[0,0,0,0],[0,0,0,0]] };
    const before = s3.grid.flat().filter(Boolean).length;
    const r = g2048.press(s3, 'left');
    assert.equal(r.grid.flat().filter(Boolean).length, before, 'a dead move spawned a tile');
    assert.equal(r.stuck, true);
    ok('a move that changes nothing spawns nothing');
  }

  // A full, unmergeable board is game over.
  {
    let s4 = g2048.create(4);
    s4 = { ...s4, grid: [[2,4,2,4],[4,2,4,2],[2,4,2,4],[4,2,4,2]] };
    const r = g2048.press(s4, 'left');
    assert.equal(r.stuck, true, 'checkerboard should be immovable');
    ok('a checkerboard board is correctly immovable');
  }

  // Scoring equals the sum of merged values.
  {
    let s5 = g2048.create(5);
    s5 = { ...s5, grid: [[8,8,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]], score: 0 };
    const r = g2048.press(s5, 'left');
    assert.equal(r.score, 16, `scored ${r.score}`);
    ok('merging two 8s scores 16');
  }
}

// ── Minesweeper rules ──
console.log('\nMinesweeper');
{
  // The first reveal is always safe, for every seed.
  {
    let bad = 0;
    for (let seed = 0; seed < 200; seed++) {
      let st = minesweeper.create(seed);
      st = minesweeper.press(st, 'a');
      if (st.over && !st.won) bad++;
    }
    assert.equal(bad, 0, `${bad}/200 seeds died on the first click`);
    ok('the opening reveal is safe across 200 seeds');
  }

  // Exactly ten mines, always.
  {
    for (let seed = 0; seed < 50; seed++) {
      let st = minesweeper.create(seed);
      st = minesweeper.press(st, 'a');
      assert.equal(st.mines.flat().filter(Boolean).length, 10, `seed ${seed}`);
    }
    ok('every board has exactly 10 mines');
  }

  // Flags block reveals, so you can't fat-finger a square you marked.
  {
    let st = minesweeper.create(8);
    st = minesweeper.press(st, 'b');            // flag under the cursor
    const flagged = st.flags[st.cy][st.cx];
    assert.equal(flagged, true);
    st = minesweeper.press(st, 'a');            // try to reveal it
    assert.equal(st.revealed[st.cy][st.cx], false, 'a flagged cell was revealed');
    ok('a flagged square refuses to be revealed');
  }

  // Clearing everything but the mines wins.
  {
    let st = minesweeper.create(15);
    st = minesweeper.press(st, 'a');
    for (let y = 0; y < 8 && !st.over; y++) {
      for (let x = 0; x < 8 && !st.over; x++) {
        if (st.mines[y][x]) continue;
        st = { ...st, cx: x, cy: y };
        st = minesweeper.press(st, 'a');
      }
    }
    assert.equal(st.won, true, 'revealing every safe square did not win');
    ok('revealing every safe square wins');
  }

  // The cursor wraps rather than falling off the board.
  {
    let st = minesweeper.create(1);
    for (let i = 0; i < 20; i++) st = minesweeper.press(st, 'left');
    assert.ok(st.cx >= 0 && st.cx < 8, `cursor at ${st.cx}`);
    for (let i = 0; i < 20; i++) st = minesweeper.press(st, 'down');
    assert.ok(st.cy >= 0 && st.cy < 8, `cursor at ${st.cy}`);
    ok('the cursor wraps and stays on the board');
  }
}

console.log(`\n${pass} cases passed`);
