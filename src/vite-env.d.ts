/// <reference types="vite/client" />

interface ElectronAPI {
  minimize: () => Promise<void>;
  maximize: () => Promise<void>;
  close: () => Promise<void>;
  quit: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  setMinimizeToTray: (value: boolean) => Promise<void>;
  setAlwaysOnTop: (value: boolean) => Promise<void>;
  openExternal: (url: string) => Promise<void>;
  readFile: (path: string) => Promise<{ success: boolean; content?: string; error?: string }>;
  listDir: (path: string) => Promise<{ success: boolean; entries?: Array<{ name: string; isDirectory: boolean; path: string }>; error?: string }>;
  getVRChatLogPath: () => Promise<string>;
  getVRChatScreenshotPath: () => Promise<string>;
  sendNotification: (opts: { title: string; body: string; icon?: string }) => Promise<void>;
  discordInit: (clientId: string) => Promise<void>;
  discordDisconnect: () => Promise<void>;
  discordSetActivity: (activity: any) => Promise<void>;
  discordIsConnected: () => Promise<boolean>;
  discordStatus: () => Promise<{
    connected: boolean;
    clientId: string | null;
    lastError: string | null;
    lastPushAt: number | null;
    lastPushOk: boolean;
    imagesDropped: boolean;
    /** Why an image slot was dropped before sending, if any. */
    imageIssues: string[];
    probes: Array<{
      url: string;
      ok: boolean;
      status: number;
      finalUrl?: string;
      contentType?: string;
      reason?: string;
      at: number;
    }>;
  }>;
  setAutoLaunch: (enabled: boolean) => Promise<void>;
  getAutoLaunch: () => Promise<boolean>;
  getVersion: () => Promise<string>;
  getPlatform: () => Promise<string>;
  getDesktopSources: () => Promise<Array<{ id: string; name: string }>>;
  detectMedia: () => Promise<{
    active: boolean;
    source: 'spotify' | 'youtube' | null;
    title: string | null;
    /**
     * Only ever 'music' or 'unknown'. Window titles can prove a music player
     * is playing a track; they cannot prove anything else about audio.
     */
    kind: 'music' | 'unknown';
    /** Which app it came from, for display. */
    app: string | null;
  }>;
  vrchatRequest: (opts: {
    method: string;
    path: string;
    headers?: Record<string, string>;
    body?: string;
    cookies?: Record<string, string>;
  }) => Promise<{
    ok: boolean;
    status: number;
    data: any;
    cookies: Record<string, string>;
  }>;
  httpGet: (url: string, headers?: Record<string, string>) => Promise<{
    ok: boolean;
    status: number;
    data: any;
    raw: string;
  }>;
  httpGetBinary: (url: string, headers?: Record<string, string>) => Promise<{
    ok: boolean;
    status: number;
    contentType?: string;
    base64?: string;
    error?: string;
  }>;

  /**
   * Identify an image from its bytes — VRChat's file URLs carry no extension,
   * so this is the only way to know a GIF/APNG/animated WebP from a still.
   */
  inspectImage: (url: string) => Promise<{
    ok: boolean;
    status: number;
    error?: string;
    format: 'gif' | 'png' | 'apng' | 'webp' | 'jpeg' | 'avif' | 'bmp' | 'svg' | 'unknown';
    animated: boolean;
    frameCount?: number;
    width?: number;
    height?: number;
    extension: string;
    mimeType: string;
  }>;
  /** Can a third party (i.e. Discord's media proxy) load this image URL? */
  probePublicImage: (url: string) => Promise<{
    url: string;
    ok: boolean;
    status: number;
    finalUrl?: string;
    contentType?: string;
    reason?: string;
    at: number;
  }>;

  // Persistent app data
  saveAppData: (key: string, data: string) => Promise<{ success: boolean }>;
  loadAppData: (key: string) => Promise<string | null>;
  deleteAppData: (key: string) => Promise<{ success: boolean }>;
  clearAllAppData: () => Promise<{ success: boolean }>;

  // OSC
  oscStart: (opts?: { sendHost?: string; sendPort?: number; recvPort?: number }) =>
    Promise<{ ok: boolean; error?: string; status?: OSCStatus }>;
  oscStop: () => Promise<{ ok: boolean }>;
  oscStatus: () => Promise<OSCStatus>;
  /** Is this UDP port free? Answers "something else already has it". */
  oscProbePort: (port: number) => Promise<{ free: boolean; error?: string }>;
  oscSend: (address: string, args?: any[]) => Promise<{ ok: boolean; error?: string }>;
  oscGetCachedParams: () => Promise<Record<string, any>>;
  oscClearCache: () => Promise<{ ok: boolean }>;
  onOscMessage: (cb: (msg: { address: string; args: any[] }) => void) => () => void;
  onOscStatus: (cb: (status: OSCStatus) => void) => () => void;

  // Tray quick-status
  onTraySetStatus: (cb: (status: string) => void) => () => void;

  // VRChat log tailing
  logStartTailing: () => Promise<{ success: boolean; path?: string; error?: string; waiting?: boolean }>;
  logStopTailing: () => Promise<{ success: boolean }>;
  logReadBacklog: (maxLines?: number) => Promise<{ success: boolean; lines?: string[]; path?: string; error?: string }>;
  logStatus: () => Promise<{
    success: boolean;
    active: boolean;
    watching: boolean;
    path?: string;
    position?: number;
    size?: number;
    dir: string;
    searchedDirs: string[];
    files: Array<{ name: string; size: number; mtime: number }>;
  }>;
  onVRChatLogLines: (cb: (lines: string[]) => void) => () => void;
  onVRChatLogStatus: (cb: (status: { active: boolean; path?: string; reason?: string }) => void) => () => void;

  // Auto-updater (source-tree updates from GitHub)
  updateGetCurrentCommit: () => Promise<{ sha: string | null; source: string }>;
  updateCheck: () => Promise<{
    ok: boolean;
    error?: string;
    currentCommit: string | null;
    latestCommit: string;
    behind: number;
    upToDate: boolean;
    unknown?: boolean;
    latestMessage?: string | null;
    latestDate?: string | null;
    commits: Array<{
      sha: string;
      shortSha: string;
      message: string;
      author: string;
      date: string;
      url: string;
    }>;
  }>;
  updateDownloadAndApply: () => Promise<{ ok: boolean; error?: string }>;
  updateGetLastApplied: () => Promise<{ commit: string; appliedAt: string } | null>;
  onUpdateProgress: (cb: (msg: { stage: string; received: number; total: number }) => void) => () => void;

  // Discord bot
  botStart: (token: string) => Promise<{ ok: boolean; error?: string }>;
  botStop: () => Promise<{ ok: boolean }>;
  botStatus: () => Promise<{
    connected: boolean;
    botTag: string | null;
    guildCount: number;
    ping: number | null;
    lastError: string | null;
    connectedAt: number | null;
  }>;
  botSyncState: (snapshot: any) => Promise<{ ok: boolean }>;
  botActionResult: (payload: { id: string; ok: boolean; error?: string; data?: any }) => Promise<{ ok: boolean }>;
  onBotExecuteAction: (cb: (payload: { id: string; action: string; payload: any }) => void) => () => void;
}

/** Everything the OSC panel needs to explain itself without the console. */
interface OSCStatus {
  connected: boolean;
  sendHost: string;
  sendPort: number;
  recvPort: number;
  lastError: string | null;
  boundAt: number | null;
  lastMessageAt: number | null;
  packetsIn: number;
  packetsOut: number;
}

interface Window {
  electronAPI?: ElectronAPI;
}
