import { create } from 'zustand';

export interface GameLogEntry {
  id: string;
  type: 'player_joined' | 'player_left' | 'world_visit' | 'video_play' | 'portal_dropped'
    | 'notification' | 'screenshot' | 'error' | 'sdk_log';
  timestamp: number;
  rawTimestamp?: string;
  playerName?: string;
  worldName?: string;
  worldId?: string;
  instanceId?: string;
  videoUrl?: string;
  message?: string;
  details?: string;
}

export interface GameLogSession {
  id: string;
  startTime: number;
  endTime?: number;
  worldName?: string;
  worldId?: string;
  instanceId?: string;
  playerJoins: number;
  playerLeaves: number;
  entries: GameLogEntry[];
}

const LOG_PATTERNS = {
  playerJoined: /\[Behaviour\]\s+OnPlayerJoined\s+(.+)/,
  playerLeft: /\[Behaviour\]\s+OnPlayerLeft\s+(.+)/,
  enterWorld: /\[Behaviour\]\s+Entering Room:\s+(.+)/,
  joiningRoom: /\[Behaviour\]\s+Joining\s+(wrld_[a-f0-9-]+):(.*)/,
  videoPlay: /\[Video\s+Playback\]\s+(.+)/,
  videoUrl: /https?:\/\/[^\s"'<>]+/,
  portalDropped: /\[Behaviour\]\s+Portal\s+dropped/,
  screenshot: /\[VRC Camera\]\s+Took screenshot:\s+(.+)/,
  timestamp: /^(\d{4}\.\d{2}\.\d{2}\s+\d{2}:\d{2}:\d{2})\s+(.+)/,
  sdkLog: /\[UdonBehaviour\]\s+(.+)/,
};

let entryCounter = 0;

function parseLogLine(line: string): GameLogEntry | null {
  const tsMatch = line.match(LOG_PATTERNS.timestamp);
  let timestamp = Date.now();
  let content = line;
  let rawTimestamp: string | undefined;

  if (tsMatch) {
    rawTimestamp = tsMatch[1];
    content = tsMatch[2];
    const parsed = new Date(tsMatch[1].replace(/\./g, '-').replace(' ', 'T'));
    if (!isNaN(parsed.getTime())) timestamp = parsed.getTime();
  }

  const base = {
    id: `gl_${Date.now()}_${entryCounter++}`,
    timestamp,
    rawTimestamp,
  };

  let match: RegExpMatchArray | null;

  if ((match = content.match(LOG_PATTERNS.playerJoined))) {
    return { ...base, type: 'player_joined', playerName: match[1].trim() };
  }
  if ((match = content.match(LOG_PATTERNS.playerLeft))) {
    return { ...base, type: 'player_left', playerName: match[1].trim() };
  }
  if ((match = content.match(LOG_PATTERNS.enterWorld))) {
    return { ...base, type: 'world_visit', worldName: match[1].trim() };
  }
  if ((match = content.match(LOG_PATTERNS.joiningRoom))) {
    return { ...base, type: 'world_visit', worldId: match[1], instanceId: match[2] };
  }
  if ((match = content.match(LOG_PATTERNS.screenshot))) {
    return { ...base, type: 'screenshot', message: match[1].trim() };
  }
  if (LOG_PATTERNS.portalDropped.test(content)) {
    return { ...base, type: 'portal_dropped', message: 'Portal dropped' };
  }
  if ((match = content.match(LOG_PATTERNS.videoPlay))) {
    const urlMatch = content.match(LOG_PATTERNS.videoUrl);
    return {
      ...base,
      type: 'video_play',
      videoUrl: urlMatch ? urlMatch[0] : undefined,
      message: match[1].trim(),
    };
  }
  if ((match = content.match(LOG_PATTERNS.sdkLog))) {
    return { ...base, type: 'sdk_log', message: match[1].trim() };
  }

  return null;
}

function parseLogContent(content: string): GameLogEntry[] {
  const entries: GameLogEntry[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    if (!line.trim()) continue;
    const entry = parseLogLine(line);
    if (entry) entries.push(entry);
  }

  return entries;
}

function buildSessions(entries: GameLogEntry[]): GameLogSession[] {
  const sessions: GameLogSession[] = [];
  let current: GameLogSession | null = null;

  for (const entry of entries) {
    if (entry.type === 'world_visit') {
      if (current) {
        current.endTime = entry.timestamp;
      }
      current = {
        id: `session_${entry.timestamp}_${entryCounter++}`,
        startTime: entry.timestamp,
        worldName: entry.worldName,
        worldId: entry.worldId,
        instanceId: entry.instanceId,
        playerJoins: 0,
        playerLeaves: 0,
        entries: [entry],
      };
      sessions.push(current);
    } else if (current) {
      current.entries.push(entry);
      if (entry.type === 'player_joined') current.playerJoins++;
      if (entry.type === 'player_left') current.playerLeaves++;
    }
  }

  return sessions;
}

interface GameLogState {
  entries: GameLogEntry[];
  sessions: GameLogSession[];
  isLoading: boolean;
  logPath: string;
  lastReadPosition: number;
  autoRefresh: boolean;

  loadLogFromText: (text: string) => void;
  loadLogFromFile: (file: File) => Promise<void>;
  setLogPath: (path: string) => void;
  setAutoRefresh: (enabled: boolean) => void;
  clearLog: () => void;
  getVideoUrls: () => GameLogEntry[];
  getScreenshots: () => GameLogEntry[];
  getPlayerEvents: () => GameLogEntry[];
}

const LOGPATH_KEY = 'vrcstudio_logpath';

export const useGameLogStore = create<GameLogState>((set, get) => ({
  entries: [],
  sessions: [],
  isLoading: false,
  logPath: localStorage.getItem(LOGPATH_KEY) || '',
  lastReadPosition: 0,
  autoRefresh: false,

  loadLogFromText: (text) => {
    const entries = parseLogContent(text);
    const sessions = buildSessions(entries);
    set({ entries, sessions });
  },

  loadLogFromFile: async (file) => {
    set({ isLoading: true });
    try {
      const text = await file.text();
      const entries = parseLogContent(text);
      const sessions = buildSessions(entries);
      set({ entries, sessions, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  setLogPath: (path) => {
    localStorage.setItem(LOGPATH_KEY, path);
    set({ logPath: path });
  },

  setAutoRefresh: (enabled) => set({ autoRefresh: enabled }),

  clearLog: () => set({ entries: [], sessions: [] }),

  getVideoUrls: () => get().entries.filter(e => e.type === 'video_play' && e.videoUrl),

  getScreenshots: () => get().entries.filter(e => e.type === 'screenshot'),

  getPlayerEvents: () => get().entries.filter(e =>
    e.type === 'player_joined' || e.type === 'player_left'
  ),
}));
