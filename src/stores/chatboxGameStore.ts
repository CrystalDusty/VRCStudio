// Running a game in the VRChat chatbox.
//
// Two halves: turning what VRChat sends us into button presses, and getting
// frames back out without tripping the chatbox rate limit.
//
// The controller is avatar gestures, because they're the only input VRChat
// hands an OSC app that works on every avatar with no setup — GestureLeft and
// GestureRight are built-in parameters, sent to us on every change. Four
// gestures on each hand gives a d-pad and four buttons, which is a NES.

import { create } from 'zustand';
import { useOSCStore } from './oscStore';
import { GAMES, gameById, composeFrame, type Button, type ChatboxGame } from '../games';

/** VRChat's gesture values. 0 is a relaxed hand and means "no button". */
export const GESTURE_NAMES = [
  'idle', 'fist', 'open hand', 'point', 'peace', "rock'n'roll", 'gun', 'thumbs up',
] as const;

/**
 * Which gesture on which hand is which button.
 *
 * Left hand steers, right hand acts — the same shape as a controller, so it
 * reads the same in every game. Rock'n'roll, gun and thumbs-up are left
 * unmapped on purpose: they're the gestures people make by accident.
 */
export const LEFT_GESTURE_BUTTONS: Record<number, Button> = {
  1: 'left', 2: 'right', 3: 'up', 4: 'down',
};
export const RIGHT_GESTURE_BUTTONS: Record<number, Button> = {
  1: 'a', 2: 'b', 3: 'start', 4: 'pause',
};

export const KEY_BUTTONS: Record<string, Button> = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
  a: 'left', d: 'right', w: 'up', s: 'down',
  ' ': 'a', z: 'a', x: 'b', Enter: 'start', p: 'pause',
};

/**
 * The buttons a gesture change should fire.
 *
 * Edge-triggered: a button fires when the hand *enters* a mapped gesture, not
 * for as long as it's held. Holding a fist would otherwise fire "left" on
 * every frame, which is unplayable.
 */
export function gestureToButtons(hand: 'left' | 'right', from: number, to: number): Button[] {
  if (from === to) return [];
  const map = hand === 'left' ? LEFT_GESTURE_BUTTONS : RIGHT_GESTURE_BUTTONS;
  const button = map[to];
  return button ? [button] : [];
}

/** Directions repeat while held; actions never do. */
const REPEATABLE: Button[] = ['left', 'right', 'up', 'down'];

interface GameState {
  gameId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  state: any;
  running: boolean;
  /** How often a frame is sent, in ms. */
  frameMs: number;
  useGestures: boolean;
  useKeyboard: boolean;
  /** Play here without touching VRChat. */
  previewOnly: boolean;
  lastFrame: string;
  framesSent: number;
  /** What the hands are doing right now, for the on-screen controller. */
  gestures: { left: number; right: number };

  selectGame: (id: string) => void;
  start: () => void;
  stop: () => void;
  press: (button: Button) => void;
  setFrameMs: (ms: number) => void;
  setOption: (patch: Partial<Pick<GameState, 'useGestures' | 'useKeyboard' | 'previewOnly'>>) => void;
}

let tickTimer: ReturnType<typeof setInterval> | null = null;
let frameTimer: ReturnType<typeof setInterval> | null = null;
let repeatTimer: ReturnType<typeof setTimeout> | null = null;
let heldButton: Button | null = null;

function currentGame(id: string): ChatboxGame<unknown> {
  return gameById(id) as ChatboxGame<unknown>;
}

export const useChatboxGameStore = create<GameState>((set, get) => ({
  gameId: GAMES[0].id,
  state: GAMES[0].create(Date.now() & 0xffff),
  running: false,
  frameMs: 400,
  useGestures: true,
  useKeyboard: true,
  previewOnly: false,
  lastFrame: '',
  framesSent: 0,
  gestures: { left: 0, right: 0 },

  selectGame: (id) => {
    const game = currentGame(id);
    stopLoops();
    set({ gameId: id, state: game.create(Date.now() & 0xffff), running: false, lastFrame: '' });
  },

  start: () => {
    const { gameId } = get();
    const game = currentGame(gameId);
    set({ state: game.create(Date.now() & 0xffff), running: true, framesSent: 0, lastFrame: '' });
    startLoops();
    sendFrame(true);
  },

  stop: () => {
    stopLoops();
    set({ running: false });
    // Leave the chatbox empty rather than a frozen board nobody can play.
    const osc = useOSCStore.getState();
    if (osc.connected && !get().previewOnly) {
      osc.send('/chatbox/input', [
        { type: 's', value: '' }, { type: 'T', value: true }, { type: 'F', value: false },
      ]).catch(() => {});
    }
  },

  press: (button) => {
    const { gameId, state, running } = get();
    if (!running) return;
    const game = currentGame(gameId);
    set({ state: game.press(state, button) });
    sendFrame();
  },

  setFrameMs: (ms) => {
    set({ frameMs: Math.max(200, Math.min(2000, Math.round(ms))) });
    if (get().running) { stopLoops(); startLoops(); }
  },

  setOption: (patch) => set(patch),
}));

// ── Loops ───────────────────────────────────────────────────────────────────

function startLoops() {
  stopLoops();
  const { gameId, frameMs } = useChatboxGameStore.getState();
  const game = currentGame(gameId);

  if (game.tickMs > 0) {
    tickTimer = setInterval(() => {
      const s = useChatboxGameStore.getState();
      if (!s.running) return;
      useChatboxGameStore.setState({ state: game.tick(s.state) });
      sendFrame();
    }, game.tickMs);
  }

  // Frames go out on their own clock rather than on every change: a burst of
  // inputs would otherwise become a burst of chatbox messages.
  frameTimer = setInterval(() => sendFrame(), frameMs);
}

function stopLoops() {
  if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
  if (frameTimer) { clearInterval(frameTimer); frameTimer = null; }
  if (repeatTimer) { clearTimeout(repeatTimer); repeatTimer = null; }
  heldButton = null;
}

let lastSentAt = 0;

/** Send the current board, unless it's unchanged or too soon. */
function sendFrame(force = false) {
  const s = useChatboxGameStore.getState();
  if (!s.running) return;
  const game = currentGame(s.gameId);
  const frame = composeFrame(game.render(s.state));

  // An identical frame is worth nothing and still costs a message — turn-based
  // games would otherwise send the same board twice a second forever.
  if (!force && frame === s.lastFrame) return;
  const now = Date.now();
  if (!force && now - lastSentAt < s.frameMs * 0.9) return;

  lastSentAt = now;
  useChatboxGameStore.setState({ lastFrame: frame, framesSent: s.framesSent + 1 });

  if (s.previewOnly) return;
  const osc = useOSCStore.getState();
  if (!osc.connected) return;
  osc.send('/chatbox/input', [
    { type: 's', value: frame },
    { type: 'T', value: true },    // straight to the bubble, no keyboard
    { type: 'F', value: false },   // and no notification ping every frame
  ]).catch(() => {});
}

// ── Input ───────────────────────────────────────────────────────────────────

/** Hold-to-repeat for directions, so you can slide a piece across. */
function beginRepeat(button: Button) {
  if (repeatTimer) clearTimeout(repeatTimer);
  if (!REPEATABLE.includes(button)) return;
  heldButton = button;
  repeatTimer = setTimeout(function again() {
    if (heldButton !== button) return;
    useChatboxGameStore.getState().press(button);
    repeatTimer = setTimeout(again, 180);
  }, 380);
}

function endRepeat() {
  heldButton = null;
  if (repeatTimer) { clearTimeout(repeatTimer); repeatTimer = null; }
}

/**
 * Feed an incoming OSC message to the game.
 *
 * Exported so the OSC store can call it without the games knowing anything
 * about OSC, and so it can be tested directly.
 */
export function handleOscForGame(address: string, value: unknown) {
  const store = useChatboxGameStore.getState();
  const hand = address === '/avatar/parameters/GestureLeft' ? 'left'
    : address === '/avatar/parameters/GestureRight' ? 'right'
    : null;
  if (!hand) return;

  const next = typeof value === 'number' ? Math.round(value) : 0;
  const prev = store.gestures[hand];
  if (prev === next) return;
  useChatboxGameStore.setState({ gestures: { ...store.gestures, [hand]: next } });

  if (!store.running || !store.useGestures) return;
  const buttons = gestureToButtons(hand, prev, next);
  if (buttons.length === 0) {
    // Hand relaxed — stop any repeat it started.
    if (next === 0) endRepeat();
    return;
  }
  for (const b of buttons) {
    store.press(b);
    beginRepeat(b);
  }
}

/** Keyboard input, wired up by the games panel while it's on screen. */
export function handleKeyForGame(key: string): boolean {
  const store = useChatboxGameStore.getState();
  if (!store.running || !store.useKeyboard) return false;
  const button = KEY_BUTTONS[key] ?? KEY_BUTTONS[key.toLowerCase()];
  if (!button) return false;
  store.press(button);
  return true;
}
