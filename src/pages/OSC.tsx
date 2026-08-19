import { useState, useEffect, useRef } from 'react';
import {
  MessageSquare, Send, Power, AlertCircle, Trash2, Clock, Sparkles,
  Repeat, Plus, X, ChevronDown, ChevronRight, Check, Copy, Wand2,
  History, Pencil, Settings as SettingsIcon, Gamepad2, Sliders, Plug,
} from 'lucide-react';
import GamesPanel from '../components/osc/GamesPanel';
import ParametersPanel from '../components/osc/ParametersPanel';
import ConnectionPanel from '../components/osc/ConnectionPanel';
import { useOSCStore, composeChatboxStatus } from '../stores/oscStore';

type Send = (address: string, args?: any[]) => Promise<void>;

const CHATBOX_MAX = 144;

/** Send a string to VRChat's in-world chatbox bubble. */
function sendToChatbox(send: Send, text: string, silent = true) {
  return send('/chatbox/input', [
    { type: 's', value: text.slice(0, CHATBOX_MAX) },
    { type: 'T', value: true },                    // bypass keyboard — send immediately
    { type: silent ? 'F' : 'T', value: !silent },  // notification SFX
  ]);
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function OSCPage() {
  const { connected, config, lastError, start, stop, send, refreshStatus } = useOSCStore();
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>('chatbox');

  // Reconcile with the main process on mount: OSC may already be running from
  // auto-start or an earlier visit, and the page used to show "Disconnected"
  // regardless until someone pressed the button.
  useEffect(() => {
    refreshStatus();
    if (config.autoStart && !connected) {
      start().then(r => { if (!r.ok && r.error) setError(r.error); });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = async () => {
    setError(null);
    try {
      if (connected) {
        await stop();
      } else {
        // start() reports failures by returning them, not by throwing — a bind
        // that loses a race with another OSC app is an outcome, not a crash.
        const res = await start();
        if (!res.ok) setError(res.error ?? 'Could not start OSC');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4 animate-fade-in">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MessageSquare size={22} className="text-accent-400" /> OSC
          </h1>
          <p className="text-xs text-surface-500 mt-1">
            Chatbox, live avatar parameters and playable games &middot; sending to <span className="text-surface-400">{config.sendHost}:{config.sendPort}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs ${
            connected ? 'bg-green-500/15 text-green-400' : 'bg-surface-800 text-surface-500'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-400 animate-pulse' : 'bg-surface-600'}`} />
            {connected ? 'Connected' : 'Disconnected'}
          </span>
          <button
            onClick={toggle}
            className={`text-sm flex items-center gap-1.5 ${connected ? 'btn-secondary' : 'btn-primary'}`}
          >
            <Power size={14} />
            {connected ? 'Stop' : 'Start'}
          </button>
        </div>
      </div>

      {(error || lastError) && (
        <div className="glass-panel-solid border border-rose-500/30 bg-rose-500/10 p-3 rounded-lg flex items-start gap-2">
          <AlertCircle size={16} className="text-rose-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-xs text-rose-400">{error || lastError}</p>
            <button onClick={() => setTab('connection')} className="text-[11px] text-rose-300 hover:underline mt-1">
              Open connection diagnostics
            </button>
          </div>
        </div>
      )}

      {!window.electronAPI && (
        <div className="glass-panel-solid border border-amber-500/30 bg-amber-500/10 p-3 rounded-lg flex items-start gap-2">
          <AlertCircle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-400">OSC requires the desktop app — running in a browser, sending will not work.</p>
        </div>
      )}

      {!connected && window.electronAPI && (
        <div className="glass-panel-solid border border-surface-700 p-3 rounded-lg flex items-start gap-2">
          <Power size={15} className="text-surface-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-surface-400">
            OSC is stopped. Hit <strong className="text-surface-300">Start</strong> above, and make sure OSC is enabled in VRChat
            (<span className="text-surface-300">Action Menu → Options → OSC → Enabled</span>).
          </p>
        </div>
      )}

      <div className="glass-panel-solid p-1.5 flex items-center gap-1 flex-wrap">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`text-xs px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 transition-colors ${
              tab === t.id ? 'bg-accent-500/15 text-accent-300' : 'text-surface-400 hover:text-surface-200'
            }`}
          >
            <t.icon size={13} /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'chatbox' && (
        <>
          <ComposeCard connected={connected} send={send} />
          <QuickPhrases connected={connected} send={send} />
          <LiveStatusCard connected={connected} />
          <DecoratorCard connected={connected} send={send} />
        </>
      )}
      {tab === 'games' && <GamesPanel connected={connected} />}
      {tab === 'parameters' && <ParametersPanel connected={connected} />}
      {tab === 'connection' && <ConnectionPanel />}
    </div>
  );
}

const TABS = [
  { id: 'chatbox' as const, label: 'Chatbox', icon: MessageSquare },
  { id: 'games' as const, label: 'Games', icon: Gamepad2 },
  { id: 'parameters' as const, label: 'Parameters', icon: Sliders },
  { id: 'connection' as const, label: 'Connection', icon: Plug },
];
type TabId = (typeof TABS)[number]['id'];

// ─── Shared ──────────────────────────────────────────────────────────────────

function Switch({ checked, onChange, disabled }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${
        checked ? 'bg-accent-500' : 'bg-surface-700'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
        checked ? 'translate-x-4' : ''
      }`} />
    </button>
  );
}

function CardHeader({ icon: Icon, title, hint, right }: {
  icon: typeof Clock;
  title: string;
  hint?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <Icon size={15} className="text-accent-400 flex-shrink-0" />
        <span className="text-sm font-semibold">{title}</span>
        {hint && <span className="text-[11px] text-surface-500 truncate hidden sm:inline">{hint}</span>}
      </div>
      {right}
    </div>
  );
}

// ─── Compose ─────────────────────────────────────────────────────────────────

const RECENT_KEY = 'vrcstudio_osc_recent';

function loadRecent(): string[] {
  try { const r = localStorage.getItem(RECENT_KEY); if (r) return JSON.parse(r); } catch {}
  return [];
}
function saveRecent(v: string[]) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(v)); } catch {}
}

function ComposeCard({ connected, send }: { connected: boolean; send: Send }) {
  const [text, setText] = useState('');
  const [silent, setSilent] = useState(true);
  const [showTyping, setShowTyping] = useState(false);
  const [recent, setRecent] = useState<string[]>(loadRecent);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pushRecent = (msg: string) => {
    setRecent(prev => {
      const next = [msg, ...prev.filter(m => m !== msg)].slice(0, 8);
      saveRecent(next);
      return next;
    });
  };

  const sendMsg = async () => {
    const t = text.trim();
    if (!connected || !t) return;
    await sendToChatbox(send, t, silent);
    pushRecent(t);
    setText('');
  };

  const onChange = (v: string) => {
    setText(v);
    if (showTyping && connected) {
      send('/chatbox/typing', [{ type: 'T', value: true }]);
      if (typingTimer.current) clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => {
        send('/chatbox/typing', [{ type: 'F', value: false }]);
      }, 1500);
    }
  };

  const clearChatbox = async () => {
    if (!connected) return;
    await send('/chatbox/input', [
      { type: 's', value: '' },
      { type: 'T', value: true },
      { type: 'F', value: false },
    ]);
  };

  return (
    <div className="glass-panel-solid p-5 space-y-3">
      <CardHeader icon={MessageSquare} title="Compose" hint="goes straight to your chat bubble" />

      <div className="flex gap-2">
        <input
          type="text"
          value={text}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); } }}
          maxLength={CHATBOX_MAX}
          placeholder={`Type a message... (max ${CHATBOX_MAX} chars)`}
          className="flex-1 bg-surface-900 border border-surface-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent-500"
          disabled={!connected}
        />
        <button onClick={sendMsg} disabled={!connected || !text.trim()} className="btn-primary text-sm flex items-center gap-1.5">
          <Send size={14} /> Send
        </button>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3 text-xs">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-surface-400 cursor-pointer">
            <input type="checkbox" checked={silent} onChange={e => setSilent(e.target.checked)} className="accent-accent-500" />
            Silent (no SFX)
          </label>
          <label className="flex items-center gap-2 text-surface-400 cursor-pointer">
            <input type="checkbox" checked={showTyping} onChange={e => setShowTyping(e.target.checked)} className="accent-accent-500" />
            Typing indicator
          </label>
        </div>
        <span className="text-surface-500 tabular-nums">{text.length} / {CHATBOX_MAX}</span>
        <button onClick={clearChatbox} disabled={!connected} className="btn-ghost text-xs flex items-center gap-1">
          <Trash2 size={11} /> Clear chatbox
        </button>
      </div>

      {recent.length > 0 && (
        <div className="border-t border-surface-800 pt-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold text-surface-500 uppercase tracking-wider flex items-center gap-1">
              <History size={11} /> Recent
            </span>
            <button
              onClick={() => { setRecent([]); saveRecent([]); }}
              className="text-[10px] text-surface-600 hover:text-surface-400"
            >
              clear
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {recent.map((r, i) => (
              <button
                key={i}
                onClick={() => setText(r)}
                title="Click to load into the box"
                className="px-2.5 py-1 text-xs bg-surface-800 hover:bg-surface-700 rounded transition-colors max-w-[220px] truncate"
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Quick phrases ───────────────────────────────────────────────────────────

const PHRASES_KEY = 'vrcstudio_osc_quick_phrases';
const DEFAULT_PHRASES = [
  '👋 Hi!', 'AFK', 'BRB', 'gn ✨', 'ty! 💜', 'lol', 'omw',
  '(ノ◕ヮ◕)ノ*:･ﾟ✧', 'ヽ(•‿•)ノ', '(´｡• ᵕ •｡`)', '♪~ ᕕ(ᐛ)ᕗ', '( ˘ ³˘)♥',
];

function loadPhrases(): string[] {
  try { const r = localStorage.getItem(PHRASES_KEY); if (r) return JSON.parse(r); } catch {}
  return DEFAULT_PHRASES;
}
function savePhrases(v: string[]) {
  try { localStorage.setItem(PHRASES_KEY, JSON.stringify(v)); } catch {}
}

function QuickPhrases({ connected, send }: { connected: boolean; send: Send }) {
  const [phrases, setPhrases] = useState<string[]>(loadPhrases);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const update = (next: string[]) => { setPhrases(next); savePhrases(next); };

  const add = () => {
    const t = draft.trim();
    if (!t || phrases.includes(t)) { setDraft(''); return; }
    update([...phrases, t]);
    setDraft('');
  };

  return (
    <div className="glass-panel-solid p-5 space-y-3">
      <CardHeader
        icon={Sparkles}
        title="Quick phrases"
        hint={editing ? 'tap × to remove' : 'one tap to send'}
        right={
          <button
            onClick={() => setEditing(e => !e)}
            className={`text-xs flex items-center gap-1 px-2 py-1 rounded transition-colors ${
              editing ? 'bg-accent-500/15 text-accent-400' : 'btn-ghost'
            }`}
          >
            <Pencil size={11} /> {editing ? 'Done' : 'Edit'}
          </button>
        }
      />

      <div className="flex flex-wrap gap-1.5">
        {phrases.map((p, i) => (
          <div key={i} className="flex items-center">
            <button
              onClick={() => { if (connected && !editing) sendToChatbox(send, p); }}
              disabled={!connected && !editing}
              className={`px-2.5 py-1 text-xs bg-surface-800 rounded transition-colors ${
                editing ? 'rounded-r-none' : 'hover:bg-surface-700'
              } ${!connected && !editing ? 'opacity-50' : ''}`}
            >
              {p}
            </button>
            {editing && (
              <button
                onClick={() => update(phrases.filter((_, j) => j !== i))}
                className="px-1.5 py-1 bg-rose-500/15 text-rose-400 hover:bg-rose-500/25 rounded-r transition-colors"
              >
                <X size={12} />
              </button>
            )}
          </div>
        ))}
        {phrases.length === 0 && <span className="text-xs text-surface-600">No phrases — add some below.</span>}
      </div>

      {editing && (
        <div className="flex gap-2 pt-1">
          <input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
            maxLength={CHATBOX_MAX}
            placeholder="New phrase or emoji..."
            className="flex-1 bg-surface-900 border border-surface-700 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent-500"
          />
          <button onClick={add} disabled={!draft.trim()} className="btn-secondary text-sm flex items-center gap-1">
            <Plus size={13} /> Add
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Live status ─────────────────────────────────────────────────────────────

function LiveStatusCard({ connected }: { connected: boolean }) {
  const cb = useOSCStore(s => s.chatboxStatus);
  const setChatboxStatus = useOSCStore(s => s.setChatboxStatus);

  // Tick once a second so the preview clock — and message rotation — stay live.
  const [, forceTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => forceTick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const interval = Math.max(3, cb.intervalSec);
  const previewIndex = Math.floor(Date.now() / 1000 / interval);
  const preview = composeChatboxStatus(cb, previewIndex);
  const msgCount = cb.messages.filter(m => m.trim()).length;

  return (
    <div className="glass-panel-solid p-5 space-y-3">
      <CardHeader
        icon={Clock}
        title="Live status"
        hint="auto-updates on a timer"
        right={
          <div className="flex items-center gap-2">
            {cb.enabled && (
              <span className="text-[10px] text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded-full">
                every {cb.intervalSec}s
              </span>
            )}
            <Switch checked={cb.enabled} onChange={v => setChatboxStatus({ enabled: v })} />
          </div>
        }
      />
      <p className="text-[11px] text-surface-500">
        Keeps your chatbox fed with a live clock, the date, your session uptime, or a rotating
        message list. Runs the whole time VRC Studio is open — even on other pages.
      </p>

      <div className="bg-surface-900 border border-surface-800 rounded-lg px-3 py-2">
        <div className="text-[10px] text-surface-500 uppercase tracking-wider mb-0.5">Preview</div>
        <div className="text-sm text-surface-100 break-words min-h-[1.25rem]">
          {preview || <span className="text-surface-600">(nothing enabled)</span>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        <label className="flex items-center gap-2 text-xs text-surface-300 cursor-pointer">
          <input type="checkbox" checked={cb.showClock} onChange={e => setChatboxStatus({ showClock: e.target.checked })} className="accent-accent-500" />
          Clock
        </label>
        <label className={`flex items-center gap-2 text-xs cursor-pointer ${cb.showClock ? 'text-surface-300' : 'text-surface-600'}`}>
          <input type="checkbox" checked={cb.clock24h} disabled={!cb.showClock} onChange={e => setChatboxStatus({ clock24h: e.target.checked })} className="accent-accent-500" />
          24-hour time
        </label>
        <label className="flex items-center gap-2 text-xs text-surface-300 cursor-pointer">
          <input type="checkbox" checked={cb.showDate} onChange={e => setChatboxStatus({ showDate: e.target.checked })} className="accent-accent-500" />
          Date
        </label>
        <label className="flex items-center gap-2 text-xs text-surface-300 cursor-pointer">
          <input type="checkbox" checked={cb.showUptime} onChange={e => setChatboxStatus({ showUptime: e.target.checked })} className="accent-accent-500" />
          Session uptime
        </label>
      </div>

      <div className="border-t border-surface-800 pt-3 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-surface-300 flex items-center gap-1.5">
            <Repeat size={12} className="text-accent-400" />
            Rotate through a message list
          </span>
          <Switch checked={cb.rotateMessages} onChange={v => setChatboxStatus({ rotateMessages: v })} />
        </div>

        {cb.rotateMessages ? (
          <div>
            <textarea
              value={cb.messages.join('\n')}
              onChange={e => setChatboxStatus({ messages: e.target.value.split('\n') })}
              rows={4}
              placeholder={'One message per line...\nHello there!\nHaving a great day ✨\nask me anything'}
              className="w-full bg-surface-900 border border-surface-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent-500 resize-y"
            />
            <p className="text-[10px] text-surface-600 mt-1">
              {msgCount} message{msgCount !== 1 ? 's' : ''} — one shows each cycle, then it loops.
            </p>
          </div>
        ) : (
          <input
            value={cb.customText}
            onChange={e => setChatboxStatus({ customText: e.target.value })}
            maxLength={80}
            placeholder="Custom message (optional)"
            className="w-full bg-surface-900 border border-surface-700 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent-500"
          />
        )}

        <label className="flex items-center gap-1.5 text-xs text-surface-400 w-fit">
          Update every
          <input
            type="number" min={3} max={60}
            value={cb.intervalSec}
            onChange={e => setChatboxStatus({ intervalSec: parseInt(e.target.value, 10) || 5 })}
            className="w-14 bg-surface-900 border border-surface-700 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-accent-500"
          />
          seconds
        </label>
      </div>

      {cb.enabled && !connected && (
        <p className="text-[11px] text-amber-400">OSC is stopped — status will start sending once you connect.</p>
      )}
    </div>
  );
}

// ─── Decorator ───────────────────────────────────────────────────────────────

const FRAMES: { id: string; label: string; wrap: (t: string) => string }[] = [
  { id: 'none',    label: 'Plain',  wrap: t => t },
  { id: 'star',    label: '★ ★',    wrap: t => `★ ${t} ★` },
  { id: 'sparkle', label: '✦ ✦',    wrap: t => `✦ ${t} ✦` },
  { id: 'heart',   label: '♡ ♡',    wrap: t => `♡ ${t} ♡` },
  { id: 'flower',  label: '✿ ✿',    wrap: t => `✿ ${t} ✿` },
  { id: 'cute',    label: '✧･ﾟ',    wrap: t => `✧･ﾟ: ${t} :･ﾟ✧` },
  { id: 'bracket', label: '「 」',   wrap: t => `「 ${t} 」` },
  { id: 'bracket2',label: '『 』',   wrap: t => `『 ${t} 』` },
  { id: 'angle',   label: '≪ ≫',    wrap: t => `≪ ${t} ≫` },
  { id: 'arrow',   label: '▸ ◂',    wrap: t => `▸ ${t} ◂` },
  { id: 'wave',    label: '～ ～',   wrap: t => `～${t}～` },
  { id: 'dot',     label: '·· ··',  wrap: t => `·· ${t} ··` },
];

function DecoratorCard({ connected, send }: { connected: boolean; send: Send }) {
  const [text, setText] = useState('');
  const [frameId, setFrameId] = useState('star');
  const [spaced, setSpaced] = useState(false);
  const [copied, setCopied] = useState(false);

  const frame = FRAMES.find(f => f.id === frameId) || FRAMES[0];
  const inner = spaced ? [...text].join(' ') : text;
  const full = text ? frame.wrap(inner) : '';
  const decorated = full.slice(0, CHATBOX_MAX);
  const trimmed = full.length > CHATBOX_MAX;

  const copy = () => {
    if (!decorated) return;
    navigator.clipboard.writeText(decorated);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="glass-panel-solid p-5 space-y-3">
      <CardHeader icon={Wand2} title="Text decorator" hint="dress a message up before sending" />

      <input
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Type something to decorate..."
        className="w-full bg-surface-900 border border-surface-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent-500"
      />

      <div className="flex flex-wrap gap-1.5">
        {FRAMES.map(f => (
          <button
            key={f.id}
            onClick={() => setFrameId(f.id)}
            className={`px-2.5 py-1 text-xs rounded transition-colors ${
              f.id === frameId ? 'bg-accent-500/20 text-accent-300 ring-1 ring-accent-500/40' : 'bg-surface-800 hover:bg-surface-700 text-surface-300'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <label className="flex items-center gap-2 text-xs text-surface-400 cursor-pointer w-fit">
        <input type="checkbox" checked={spaced} onChange={e => setSpaced(e.target.checked)} className="accent-accent-500" />
        S p a c e d   o u t
      </label>

      <div className="bg-surface-900 border border-surface-800 rounded-lg px-3 py-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-surface-500 uppercase tracking-wider">Preview</span>
          <span className={`text-[10px] tabular-nums ${trimmed ? 'text-amber-400' : 'text-surface-600'}`}>
            {decorated.length} / {CHATBOX_MAX}{trimmed ? ' (trimmed)' : ''}
          </span>
        </div>
        <div className="text-sm text-surface-100 break-words min-h-[1.25rem] mt-0.5">
          {decorated || <span className="text-surface-600">(empty)</span>}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => { if (connected && decorated) sendToChatbox(send, decorated); }}
          disabled={!connected || !decorated}
          className="btn-primary text-sm flex items-center gap-1.5 flex-1 justify-center"
        >
          <Send size={14} /> Send
        </button>
        <button
          onClick={copy}
          disabled={!decorated}
          className={`text-sm flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors flex-1 justify-center ${
            copied ? 'bg-green-500/15 text-green-400' : 'bg-surface-800 text-surface-300 hover:bg-surface-700'
          }`}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

// ─── Connection ──────────────────────────────────────────────────────────────

