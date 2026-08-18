// Interactive TUI console — only mounted when the Hacker premium theme
// is active. Two halves:
//
//   1. Live feed (top) — automatic deltas from app state: route changes,
//      friend online/offline, instance joins, video plays, player counts.
//
//   2. Prompt (bottom) — clickable input. Type a command, press Enter,
//      see output. `help` lists everything. Up/Down arrows recall history.
//
// All state is in-memory; nothing persists across an app restart.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Terminal, X } from 'lucide-react';
import { useThemeStore, type BorderStyle, type ThemeConfig } from '../stores/themeStore';
import { useAuthStore } from '../stores/authStore';
import { useFriendStore } from '../stores/friendStore';
import { useInstanceHistoryStore } from '../stores/instanceHistoryStore';
import { useVideoPlayerStore } from '../stores/videoPlayerStore';
import { useInstanceAvatarsStore } from '../stores/instanceAvatarsStore';
import { useOSCStore } from '../stores/oscStore';
import api from '../api/vrchat';

type LineKind = 'route' | 'event' | 'comment' | 'input' | 'output' | 'error';
interface ConsoleLine {
  id: number;
  ts: Date;
  kind: LineKind;
  text: string;
}

interface CommandContext {
  print: (text: string | string[], kind?: LineKind) => void;
  clear: () => void;
  navigate: (path: string) => void;
}

interface Command {
  name: string;
  aliases?: string[];
  description: string;
  usage?: string;
  exec: (args: string[], ctx: CommandContext) => string | string[] | void | Promise<string | string[] | void>;
}

const MAX_LINES = 200;
const MAX_HISTORY = 50;
let lineCounter = 0;

function fmtTime(d: Date) {
  return d.toTimeString().slice(0, 8);
}

// ── Available routes for `cd` / `goto` ──────────────────────────────────
const ROUTES: Record<string, string> = {
  '/':                 'dashboard',
  '/search':           'search',
  '/friends':          'friends',
  '/friend-log':       'friend-log',
  '/worlds':           'worlds',
  '/groups':           'groups',
  '/favorites':        'favorites',
  '/notifications':    'notifications',
  '/instance-avatars': 'instance-avatars',
  '/instance-grabber': 'instance-grabber',
  '/osc':              'osc',
  '/avatar-editor':    'avatar-editor',
  '/activity':         'activity',
  '/friend-analytics': 'analytics',
  '/events':           'events',
  '/game-log':         'game-log',
  '/screenshots':      'screenshots',
  '/reports':          'reports',
  '/settings':         'settings',
};

const PREMIUM_THEMES: ThemeConfig['premiumTheme'][] = [
  'none', 'iridescent', 'holographic', 'aurora', 'cosmic', 'synthwave', 'asteroids', 'koi', 'hacker',
];
const BORDER_STYLES: BorderStyle[] = [
  'default', 'rainbow', 'neon', 'pulse', 'holographic', 'flame', 'shimmer', 'cyber',
];

// ── Commands ────────────────────────────────────────────────────────────
const COMMANDS: Command[] = [
  {
    name: 'help',
    aliases: ['?', 'commands'],
    description: 'List all available commands',
    exec: () => {
      const rows = COMMANDS.map(c => {
        const aliases = c.aliases?.length ? ` (${c.aliases.join(', ')})` : '';
        const usage = c.usage ? `  ${c.usage}` : '';
        return `  ${c.name.padEnd(12)}${usage.padEnd(28)} ${c.description}${aliases}`;
      });
      return [
        '// Type a command and press Enter. Use Up/Down for history.',
        '',
        ...rows,
      ];
    },
  },

  {
    name: 'clear',
    aliases: ['cls'],
    description: 'Clear the console',
    exec: (_, ctx) => { ctx.clear(); },
  },

  {
    name: 'cd',
    aliases: ['goto', 'nav'],
    description: 'Navigate to a route',
    usage: '<route>',
    exec: (args, ctx) => {
      if (args.length === 0) return '> usage: cd <route>   (try `routes`)';
      const target = args[0].startsWith('/') ? args[0] : `/${args[0]}`;
      if (!(target in ROUTES)) return `! unknown route: ${target}    (try \`routes\`)`;
      ctx.navigate(target);
      return `> router.navigate('${target}')`;
    },
  },

  {
    name: 'routes',
    description: 'List all known routes',
    exec: () => {
      const rows = Object.entries(ROUTES).map(([k, v]) => `  ${k.padEnd(22)} → ${v}`);
      return ['// available routes:', ...rows];
    },
  },

  {
    name: 'whoami',
    aliases: ['me'],
    description: 'Show current user info',
    exec: () => {
      const u = useAuthStore.getState().user;
      if (!u) return '! not logged in';
      return [
        `user.displayName  = '${u.displayName}'`,
        `user.id           = '${u.id}'`,
        `user.status       = '${u.status ?? 'unknown'}'`,
        `user.trustRank    = '${(u as any).$trustLevel ?? '—'}'`,
        `user.location     = '${u.location ?? '—'}'`,
      ];
    },
  },

  {
    name: 'friends',
    description: 'Online friends count + list',
    exec: () => {
      const f = useFriendStore.getState().onlineFriends;
      if (f.length === 0) return '// 0 friends online';
      const head = `// ${f.length} friends online`;
      const list = f.slice(0, 25).map(x => `  ${x.statusDescription ? '*' : ' '} ${x.displayName}  [${x.status}]`);
      const tail = f.length > 25 ? [`  … and ${f.length - 25} more`] : [];
      return [head, ...list, ...tail];
    },
  },

  {
    name: 'instance',
    aliases: ['where'],
    description: 'Show current instance info',
    exec: () => {
      const cur = useInstanceHistoryStore.getState().currentInstance;
      if (!cur) return '// not currently in any instance';
      return [
        `instance.worldName   = '${cur.worldName}'`,
        `instance.worldId     = '${cur.worldId}'`,
        `instance.instanceId  = '${cur.instanceId}'`,
        `instance.type        = '${cur.instanceType}'`,
        `instance.joinedAt    = ${new Date(cur.joinedAt).toLocaleTimeString()}`,
      ];
    },
  },

  {
    name: 'players',
    description: 'List players in current instance',
    exec: () => {
      const by = useInstanceAvatarsStore.getState().byPlayer;
      const names = Object.keys(by);
      if (names.length === 0) return '// no players tracked yet';
      const head = `// ${names.length} players`;
      const rows = names.slice(0, 30).map(n => {
        const p = by[n];
        return `  ${p.rank ? `[${p.rank.charAt(0)}]` : '[ ]'} ${n}${p.avatarName ? `  // ${p.avatarName}` : ''}`;
      });
      const tail = names.length > 30 ? [`  … and ${names.length - 30} more`] : [];
      return [head, ...rows, ...tail];
    },
  },

  {
    name: 'videos',
    description: 'Recent video URLs played',
    exec: () => {
      const recent = useVideoPlayerStore.getState().getRecent(10);
      if (recent.length === 0) return '// no videos in history';
      return ['// last 10 videos:', ...recent.map(v => `  ${fmtTime(new Date(v.timestamp))}  ${v.label || v.url}`)];
    },
  },

  {
    name: 'theme',
    description: 'Switch premium theme',
    usage: '<name>',
    exec: (args) => {
      if (args.length === 0) {
        return [`! usage: theme <${PREMIUM_THEMES.join('|')}>`, `> current: ${useThemeStore.getState().theme.premiumTheme}`];
      }
      const target = args[0].toLowerCase() as ThemeConfig['premiumTheme'];
      if (!PREMIUM_THEMES.includes(target)) {
        return `! unknown theme: ${target}    available: ${PREMIUM_THEMES.join(', ')}`;
      }
      useThemeStore.getState().setPremiumTheme(target);
      return `> theme.set('${target}')`;
    },
  },

  {
    name: 'border',
    description: 'Switch animated border style',
    usage: '<style>',
    exec: (args) => {
      if (args.length === 0) {
        return [`! usage: border <${BORDER_STYLES.join('|')}>`, `> current: ${useThemeStore.getState().theme.borderStyle}`];
      }
      const target = args[0].toLowerCase() as BorderStyle;
      if (!BORDER_STYLES.includes(target)) {
        return `! unknown border style: ${target}    available: ${BORDER_STYLES.join(', ')}`;
      }
      useThemeStore.getState().setBorderStyle(target);
      return `> theme.border.set('${target}')`;
    },
  },

  {
    name: 'wear',
    description: 'Wear an avatar by ID',
    usage: '<avtr_id>',
    exec: async (args) => {
      const id = args[0];
      if (!id?.startsWith('avtr_')) return '! usage: wear avtr_xxxxxxxx-...';
      try {
        await api.selectAvatar(id);
        return `> api.selectAvatar('${id}') OK`;
      } catch (e: any) {
        return `! avatar swap failed: ${e?.message ?? e}`;
      }
    },
  },

  {
    name: 'say',
    aliases: ['chatbox', 'msg'],
    description: 'Send a message to the VRChat chatbox via OSC',
    usage: '<text…>',
    exec: async (args) => {
      const text = args.join(' ').trim();
      if (!text) return '! usage: say <text>';
      if (text.length > 144) return `! message too long (${text.length} > 144)`;
      try {
        await useOSCStore.getState().send('/chatbox/input', [text, true, false]);
        return `> osc.send('/chatbox/input', '${text}')`;
      } catch (e: any) {
        return `! osc send failed: ${e?.message ?? e}    (is OSC running?)`;
      }
    },
  },

  {
    name: 'osc',
    description: 'Send a raw OSC packet',
    usage: '<address> [args…]',
    exec: async (args) => {
      const [address, ...rest] = args;
      if (!address?.startsWith('/')) return '! usage: osc /address [arg1 arg2 ...]';
      const parsed = rest.map(a => {
        if (a === 'true') return true;
        if (a === 'false') return false;
        if (/^-?\d+\.\d+$/.test(a)) return parseFloat(a);
        if (/^-?\d+$/.test(a)) return parseInt(a, 10);
        return a;
      });
      try {
        await useOSCStore.getState().send(address, parsed);
        return `> osc.send('${address}', [${parsed.map(p => JSON.stringify(p)).join(', ')}])`;
      } catch (e: any) {
        return `! osc send failed: ${e?.message ?? e}`;
      }
    },
  },

  {
    name: 'status',
    description: 'Change VRChat online status',
    usage: '<active|join me|ask me|busy> [message]',
    exec: async (args) => {
      const validStatus = ['active', 'join me', 'ask me', 'busy'];
      // Multi-word status needs special handling — check first 1 or 2 tokens.
      let status = args[0];
      let msgStart = 1;
      if (args.length >= 2 && validStatus.includes(`${args[0]} ${args[1]}`)) {
        status = `${args[0]} ${args[1]}`;
        msgStart = 2;
      }
      if (!validStatus.includes(status)) {
        return `! invalid status. allowed: ${validStatus.map(s => `"${s}"`).join(', ')}`;
      }
      const msg = args.slice(msgStart).join(' ') || '';
      const u = useAuthStore.getState().user;
      if (!u?.id) return '! not logged in';
      try {
        await api.updateStatus(u.id, status, msg);
        await useAuthStore.getState().refreshUser();
        return `> user.setStatus('${status}'${msg ? `, '${msg}'` : ''})`;
      } catch (e: any) {
        return `! status update failed: ${e?.message ?? e}`;
      }
    },
  },

  {
    name: 'tail',
    description: 'Show VRChat log-tail status',
    exec: () => {
      const s = useVideoPlayerStore.getState();
      return [
        `tail.active = ${s.tailingActive}`,
        `tail.path   = ${s.tailingPath ?? '—'}`,
      ];
    },
  },

  {
    name: 'echo',
    description: 'Echo text back',
    usage: '<text…>',
    exec: (args) => args.join(' '),
  },

  {
    name: 'date',
    description: 'Show current date/time',
    exec: () => `Date.now() = ${new Date().toString()}`,
  },

  {
    name: 'history',
    description: 'List your command history',
    exec: () => {
      const hist = (window as any).__hackerHistory as string[] | undefined;
      if (!hist || hist.length === 0) return '// history empty';
      return hist.map((h, i) => `  ${(i + 1).toString().padStart(3)}  ${h}`);
    },
  },

  {
    name: 'logout',
    aliases: ['signout'],
    description: 'Sign out',
    exec: () => {
      useAuthStore.getState().logout();
      return '> auth.logout()';
    },
  },

  {
    name: 'exit',
    aliases: ['quit'],
    description: 'Close VRC Studio',
    exec: () => {
      window.electronAPI?.quit?.();
      return '> process.exit(0)';
    },
  },

  // `made` matches `made`, `made by`, `madeby`, `author`. The argument
  // tokens after `made` (like `by`) are ignored — the command just prints
  // its ASCII signature.
  {
    name: 'made',
    aliases: ['madeby', 'author'],
    description: 'Who made this',
    exec: () => [
      ' ____        _   _       _   ',
      '|  _ \\  ___ | \\ | | ___ | |_ ',
      '| | | |/ _ \\|  \\| |/ _ \\| __|',
      '| |_| | (_) | |\\  | (_) | |_ ',
      '|____/ \\___/|_| \\_|\\___/ \\__|',
      ' ____       _   __  __      ',
      '|  _ \\ ___ | |_|  \\/  | ___ ',
      '| |_) / _ \\| __| |\\/| |/ _ \\',
      '|  __/  __/| |_| |  | |  __/',
      '|_|   \\___| \\__|_|  |_|\\___|',
    ],
  },
];

const COMMAND_MAP = (() => {
  const m = new Map<string, Command>();
  for (const c of COMMANDS) {
    m.set(c.name, c);
    for (const a of c.aliases ?? []) m.set(a, c);
  }
  return m;
})();

// ── Component ──────────────────────────────────────────────────────────
export default function HackerConsole() {
  const isHacker = useThemeStore(s => s.theme.premiumTheme === 'hacker');
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);
  const onlineFriends = useFriendStore(s => s.onlineFriends);
  const currentInstance = useInstanceHistoryStore(s => s.currentInstance);
  const currentVideo = useVideoPlayerStore(s => s.current);
  const livePlayerCount = useInstanceAvatarsStore(s => Object.keys(s.byPlayer).length);

  const [lines, setLines] = useState<ConsoleLine[]>(() => [
    { id: lineCounter++, ts: new Date(), kind: 'comment', text: '// VRCStudio TUI shell — type `help` for commands' },
  ]);
  const [collapsed, setCollapsed] = useState(false);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const lastRoute = useRef<string | null>(null);
  const lastOnlineNames = useRef<Set<string>>(new Set());
  const lastInstanceId = useRef<string | null>(null);
  const lastVideoUrl = useRef<string | null>(null);
  const lastPlayerCount = useRef<number>(0);

  const push = useCallback((line: Omit<ConsoleLine, 'id' | 'ts'>) => {
    setLines(prev => {
      const next = [...prev, { ...line, id: lineCounter++, ts: new Date() }];
      return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
    });
  }, []);

  const clear = useCallback(() => {
    setLines([{ id: lineCounter++, ts: new Date(), kind: 'comment', text: '// cleared' }]);
  }, []);

  // Command context — passed to every command's exec()
  const ctx: CommandContext = useMemo(() => ({
    print: (text, kind = 'output') => {
      if (Array.isArray(text)) text.forEach(t => push({ kind, text: t }));
      else push({ kind, text });
    },
    clear,
    navigate: (path) => navigate(path),
  }), [push, clear, navigate]);

  const runCommand = useCallback(async (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;

    // Echo the input
    push({ kind: 'input', text: `$ ${trimmed}` });

    // Update history
    setHistory(prev => {
      const next = [...prev, trimmed].slice(-MAX_HISTORY);
      (window as any).__hackerHistory = next;
      return next;
    });
    setHistoryIndex(null);

    // Tokenize: respect quoted strings so `say "hello world"` works
    const tokens: string[] = [];
    let buf = '';
    let quoting: '"' | "'" | null = null;
    for (const ch of trimmed) {
      if (quoting) {
        if (ch === quoting) { quoting = null; tokens.push(buf); buf = ''; }
        else buf += ch;
      } else if (ch === '"' || ch === "'") {
        if (buf) { tokens.push(buf); buf = ''; }
        quoting = ch as '"' | "'";
      } else if (ch === ' ') {
        if (buf) { tokens.push(buf); buf = ''; }
      } else {
        buf += ch;
      }
    }
    if (buf) tokens.push(buf);
    if (tokens.length === 0) return;

    const cmd = COMMAND_MAP.get(tokens[0].toLowerCase());
    if (!cmd) {
      push({ kind: 'error', text: `! command not found: ${tokens[0]}   (try \`help\`)` });
      return;
    }

    try {
      const result = await cmd.exec(tokens.slice(1), ctx);
      if (Array.isArray(result)) result.forEach(t => push({ kind: 'output', text: t }));
      else if (typeof result === 'string') push({ kind: 'output', text: result });
    } catch (e: any) {
      push({ kind: 'error', text: `! ${e?.message ?? String(e)}` });
    }
  }, [push, ctx]);

  // ── Input keyboard handling ──
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const v = input;
      setInput('');
      void runCommand(v);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length === 0) return;
      const idx = historyIndex == null ? history.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(idx);
      setInput(history[idx]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex == null) return;
      const idx = historyIndex + 1;
      if (idx >= history.length) {
        setHistoryIndex(null);
        setInput('');
      } else {
        setHistoryIndex(idx);
        setInput(history[idx]);
      }
    } else if (e.key === 'Tab') {
      // Cheap tab completion for the command name only.
      e.preventDefault();
      const partial = input.trim().toLowerCase();
      if (!partial.includes(' ')) {
        const candidates = COMMANDS.map(c => c.name).filter(n => n.startsWith(partial));
        if (candidates.length === 1) setInput(candidates[0] + ' ');
        else if (candidates.length > 1) push({ kind: 'comment', text: `// ${candidates.join('  ')}` });
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setInput('');
      setHistoryIndex(null);
    }
  };

  // ── Live deltas (unchanged from before) ──
  useEffect(() => {
    if (!isHacker) return;
    if (lastRoute.current === location.pathname) return;
    lastRoute.current = location.pathname;
    push({ kind: 'route', text: `> router.navigate('${location.pathname}')` });
  }, [location.pathname, isHacker, push]);

  useEffect(() => {
    if (!isHacker) return;
    const current = new Set(onlineFriends.map(f => f.displayName));
    const prev = lastOnlineNames.current;
    for (const name of current) {
      if (!prev.has(name)) push({ kind: 'event', text: `+ friend.online: ${name}` });
    }
    for (const name of prev) {
      if (!current.has(name)) push({ kind: 'event', text: `- friend.offline: ${name}` });
    }
    lastOnlineNames.current = current;
  }, [onlineFriends, isHacker, push]);

  useEffect(() => {
    if (!isHacker) return;
    const id = currentInstance?.id ?? null;
    if (id === lastInstanceId.current) return;
    lastInstanceId.current = id;
    if (currentInstance) {
      push({ kind: 'event', text: `> instance.join('${currentInstance.worldName || currentInstance.worldId}')` });
    } else {
      push({ kind: 'comment', text: '// instance.leave()' });
    }
  }, [currentInstance?.id, isHacker, push]);

  useEffect(() => {
    if (!isHacker) return;
    const url = currentVideo?.url ?? null;
    if (url === lastVideoUrl.current) return;
    lastVideoUrl.current = url;
    if (currentVideo) {
      push({ kind: 'event', text: `> videoPlayer.load('${currentVideo.label ?? currentVideo.url}')` });
    }
  }, [currentVideo?.url, isHacker, push]);

  useEffect(() => {
    if (!isHacker) return;
    const prev = lastPlayerCount.current;
    if (livePlayerCount !== prev) {
      lastPlayerCount.current = livePlayerCount;
      if (prev !== 0 || livePlayerCount !== 0) {
        push({ kind: 'comment', text: `// instance.players.length = ${livePlayerCount}` });
      }
    }
  }, [livePlayerCount, isHacker, push]);

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [lines.length]);

  const statusLine = useMemo(() => {
    const parts = [
      user?.displayName ? `user: ${user.displayName}` : 'user: null',
      `online: ${onlineFriends.length}`,
      `route: ${location.pathname}`,
    ];
    return parts.join(' | ');
  }, [user?.displayName, onlineFriends.length, location.pathname]);

  // Focus input when console expands or is clicked anywhere in the body.
  useEffect(() => {
    if (isHacker && !collapsed) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isHacker, collapsed]);

  if (!isHacker) return null;

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        style={{
          position: 'fixed', right: 16, bottom: 16, zIndex: 9000,
          background: 'rgba(0, 5, 2, 0.92)',
          border: '1px solid rgba(0, 255, 100, 0.4)',
          color: 'rgb(120, 255, 160)',
          fontFamily: '"JetBrains Mono", "Consolas", monospace',
          fontSize: 11,
          padding: '4px 10px',
          display: 'flex', alignItems: 'center', gap: 6,
          cursor: 'pointer',
          boxShadow: '0 0 14px rgba(0, 255, 100, 0.18)',
        }}
        title="Open console"
      >
        <Terminal size={11} />
        $_
      </button>
    );
  }

  return (
    <div className="hacker-console" onClick={() => inputRef.current?.focus()}>
      <div className="hacker-console-header">
        <span>
          <Terminal size={10} style={{ display: 'inline', verticalAlign: -1, marginRight: 6 }} />
          vrcstudio.sh — interactive
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); setCollapsed(true); }}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'rgb(120, 255, 160)',
            cursor: 'pointer',
            padding: 0,
            display: 'flex',
          }}
          title="Hide"
        >
          <X size={11} />
        </button>
      </div>

      <div className="hacker-console-body" ref={bodyRef}>
        {lines.map(line => (
          <div key={line.id} className="hacker-console-row">
            <span className="hacker-console-time">{fmtTime(line.ts)}</span>
            <span className={`hacker-console-${line.kind}`}>{line.text}</span>
          </div>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const v = input;
          setInput('');
          void runCommand(v);
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 8px',
          borderTop: '1px solid rgba(0, 255, 100, 0.3)',
          background: 'rgba(0, 255, 100, 0.04)',
        }}
      >
        <span style={{ color: 'rgb(120, 255, 160)', fontSize: 11 }}>$</span>
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          autoComplete="off"
          placeholder="type `help` for commands"
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'rgb(120, 255, 160)',
            fontFamily: 'inherit',
            fontSize: 11,
            caretColor: 'rgb(0, 255, 100)',
          }}
        />
      </form>

      <div style={{
        padding: '3px 8px',
        borderTop: '1px solid rgba(0, 255, 100, 0.25)',
        fontSize: 9.5,
        color: 'rgba(120, 255, 160, 0.55)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}>
        {statusLine}
      </div>
    </div>
  );
}
