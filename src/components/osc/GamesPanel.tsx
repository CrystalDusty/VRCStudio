// Playable games, rendered into the VRChat chatbox.

import { useEffect, useRef } from 'react';
import { Gamepad2, Play, Square, Monitor, Hand, Keyboard } from 'lucide-react';
import {
  useChatboxGameStore, handleKeyForGame,
  LEFT_GESTURE_BUTTONS, RIGHT_GESTURE_BUTTONS, GESTURE_NAMES,
} from '../../stores/chatboxGameStore';
import {
  GAMES, gameById, composeFrame, boardStyleById, BOARD_STYLES,
  KNOWN_MISSING_IN_VRCHAT, CHATBOX_MAX_CHARS, type Button,
} from '../../games';

const BUTTON_LABEL: Record<Button, string> = {
  left: '←', right: '→', up: '↑', down: '↓',
  a: 'A', b: 'B', start: 'Start', pause: 'Pause',
};

export default function GamesPanel({ connected }: { connected: boolean }) {
  const {
    gameId, state, running, frameMs, useGestures, useKeyboard, previewOnly,
    framesSent, gestures, styleId, selectGame, start, stop, press, setFrameMs,
    setOption, setStyleId, sendAlignmentTest, sendGlyphTest,
  } = useChatboxGameStore();

  const game = gameById(gameId);
  const style = boardStyleById(styleId);
  const lines = game.render(state, style);
  const frame = composeFrame(lines);
  const status = game.status(state);
  const boardRef = useRef<HTMLDivElement>(null);

  // Keyboard play only while this panel is on screen and focused-ish, and only
  // when it would otherwise do nothing — never steal typing from an input.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (handleKeyForGame(e.key)) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Stop the loop if the panel goes away, so a game can't keep writing to the
  // chatbox from a page nobody is looking at.
  useEffect(() => () => { if (useChatboxGameStore.getState().running) useChatboxGameStore.getState().stop(); }, []);

  return (
    <div className="space-y-3">
      <div className="glass-panel-solid p-3">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Gamepad2 size={15} className="text-accent-400" /> Chatbox games
          </h2>
          <div className="flex items-center gap-2">
            {running ? (
              <button onClick={stop} className="btn-secondary text-xs inline-flex items-center gap-1.5">
                <Square size={12} /> Stop
              </button>
            ) : (
              <button
                onClick={start}
                disabled={!connected && !previewOnly}
                className="btn-primary text-xs inline-flex items-center gap-1.5 disabled:opacity-40"
                title={!connected && !previewOnly ? 'Start OSC first, or switch on preview only' : undefined}
              >
                <Play size={12} /> Play
              </button>
            )}
          </div>
        </div>

        <div className="grid gap-1.5 sm:grid-cols-2">
          {GAMES.map(g => (
            <button
              key={g.id}
              onClick={() => selectGame(g.id)}
              className={`text-left px-2.5 py-2 rounded-lg border transition-colors ${
                g.id === gameId
                  ? 'border-accent-500 bg-accent-500/10'
                  : 'border-surface-700 hover:border-surface-600'
              }`}
            >
              <div className="text-xs font-semibold">{g.name}</div>
              <div className="text-[10px] text-surface-500 leading-snug">{g.blurb}</div>
            </button>
          ))}
        </div>
      </div>

      {/* The preview is the frame, character for character — what you see here
          is the string that goes to VRChat. */}
      <div className="glass-panel-solid p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-surface-500">
            Chatbox preview
          </span>
          <span className="text-[10px] text-surface-600 tabular-nums">
            {frame.length}/{CHATBOX_MAX_CHARS} chars · {lines.length}/9 lines
            {running && ` · ${framesSent} frames sent`}
          </span>
        </div>
        {/* Loose line spacing on purpose: VRChat's chatbox puts a gap between
            lines, and a preview packed tight would hide the very thing that
            made the old half-block boards unreadable. */}
        <div
          ref={boardRef}
          className="rounded-lg bg-black/50 border border-surface-800 p-3 font-mono text-[13px] leading-[1.7] whitespace-pre text-surface-100 overflow-x-auto"
        >
          {frame || ' '}
        </div>
        <p className="text-[11px] text-surface-400 mt-2">
          {status.over ? 'Game over — press Start' : status.label}
          {status.score > 0 && <span className="text-surface-500"> · score {status.score}</span>}
        </p>

        {/* Board style sits here, under the board, because this preview cannot
            be trusted on its own: it renders in your desktop font, which has
            glyphs VRChat's chatbox font does not. A board that looks perfect
            in this box can arrive as a grid of circles — that is exactly what
            the old Braille default did. The chatbox is the only real preview,
            hence the two test buttons. */}
        <div className="mt-3 pt-3 border-t border-surface-800 space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-wider text-surface-500">
              Board style
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={sendGlyphTest}
                disabled={!connected}
                className="text-[11px] px-2 py-1 rounded-lg bg-accent-600/20 text-accent-300 hover:bg-accent-600/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title={connected ? 'Show all styles in your chatbox at once' : 'Start OSC first'}
              >
                Test all in chatbox
              </button>
              <button
                onClick={sendAlignmentTest}
                disabled={!connected}
                className="btn-ghost text-[11px] disabled:opacity-40 disabled:cursor-not-allowed"
                title={connected ? 'Draw a rectangle in the selected style' : 'Start OSC first'}
              >
                Test this one
              </button>
            </div>
          </div>

          <div className="flex gap-1.5 flex-wrap">
            {BOARD_STYLES.map((s, i) => {
              const missing = KNOWN_MISSING_IN_VRCHAT.includes(s.id);
              return (
                <button
                  key={s.id}
                  onClick={() => setStyleId(s.id)}
                  title={s.note}
                  className={`text-[11px] px-2 py-1 rounded-lg border transition-colors flex items-center gap-1.5 ${
                    s.id === styleId
                      ? 'border-accent-500 bg-accent-500/10 text-accent-300'
                      : 'border-surface-700 text-surface-400 hover:border-surface-600'
                  }`}
                >
                  <span className="text-surface-600 tabular-nums">{i + 1}</span>
                  {s.name}
                  <span className="font-mono text-surface-500">{s.filled}{s.empty}</span>
                  {missing && <span className="text-[9px] text-amber-400/80">n/a</span>}
                </button>
              );
            })}
          </div>

          <p className="text-[10px] text-surface-600 leading-snug">
            <span className="text-surface-500">{style.note}</span>{' '}
            <strong className="text-surface-400">Test all in chatbox</strong> prints one numbered
            row per style: pick the number whose bar is solid and whose background is flat.
            Circles or empty boxes mean your VRChat build has no glyph for that style —
            Braille is marked n/a for exactly that reason.
          </p>
        </div>
      </div>

      {/* On-screen controller: also the control map, so nobody has to guess. */}
      <div className="glass-panel-solid p-3 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <HandMap
            hand="Left hand"
            live={gestures.left}
            map={LEFT_GESTURE_BUTTONS}
            game={game}
            onPress={press}
            running={running}
          />
          <HandMap
            hand="Right hand"
            live={gestures.right}
            map={RIGHT_GESTURE_BUTTONS}
            game={game}
            onPress={press}
            running={running}
          />
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-2 border-t border-surface-800">
          <Toggle
            icon={Hand} label="Gesture control"
            checked={useGestures} onChange={v => setOption({ useGestures: v })}
          />
          <Toggle
            icon={Keyboard} label="Keyboard (arrows, Z/X, Enter)"
            checked={useKeyboard} onChange={v => setOption({ useKeyboard: v })}
          />
          <Toggle
            icon={Monitor} label="Preview only — don't send to VRChat"
            checked={previewOnly} onChange={v => setOption({ previewOnly: v })}
          />
        </div>

        <label className="block">
          <span className="text-[10px] text-surface-500">
            Frame rate — one chatbox message every {frameMs}ms
          </span>
          <input
            type="range" min={200} max={2000} step={50}
            value={frameMs}
            onChange={e => setFrameMs(Number(e.target.value))}
            className="w-full accent-accent-500"
          />
          <span className="text-[10px] text-surface-600">
            Identical frames are never re-sent, so a turn-based game costs nothing while you think.
            Faster is smoother; if VRChat starts dropping messages, slow it down.
          </span>
        </label>
      </div>
    </div>
  );
}

function HandMap({ hand, live, map, game, onPress, running }: {
  hand: string;
  live: number;
  map: Record<number, Button>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  game: any;
  onPress: (b: Button) => void;
  running: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-surface-500">{hand}</span>
        <span className={`text-[10px] ${live > 0 ? 'text-accent-300' : 'text-surface-600'}`}>
          {GESTURE_NAMES[live] ?? live}
        </span>
      </div>
      <div className="space-y-1">
        {Object.entries(map).map(([gesture, button]) => {
          const g = Number(gesture);
          const active = live === g;
          return (
            <button
              key={gesture}
              onClick={() => onPress(button)}
              disabled={!running}
              className={`w-full flex items-center gap-2 px-2 py-1 rounded border text-[11px] transition-colors disabled:opacity-50 ${
                active ? 'border-accent-500 bg-accent-500/15 text-accent-200' : 'border-surface-700 text-surface-400 hover:border-surface-600'
              }`}
            >
              <span className="w-24 text-left text-surface-500">{GESTURE_NAMES[g]}</span>
              <span className="w-10 font-bold">{BUTTON_LABEL[button]}</span>
              <span className="truncate text-surface-500">{game.controls[button] ?? '—'}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Toggle({ icon: Icon, label, checked, onChange }: {
  icon: typeof Hand; label: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`text-[11px] inline-flex items-center gap-1.5 px-2 py-1 rounded border transition-colors ${
        checked ? 'border-accent-500/60 bg-accent-500/10 text-accent-300' : 'border-surface-700 text-surface-500'
      }`}
    >
      <Icon size={12} /> {label}
    </button>
  );
}
