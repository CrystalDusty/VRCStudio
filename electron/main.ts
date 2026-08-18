import {
  app, BrowserWindow, ipcMain, shell, Tray, Menu,
  nativeImage, Notification, nativeTheme, desktopCapturer,
} from 'electron';
import path from 'path';
import fs from 'fs';
import https from 'https';
import http from 'http';
import { spawn } from 'child_process';
import * as discordBot from './discord-bot';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let discordRPC: any = null;
let rpcConnected = false;
let minimizeToTray = true;
let isQuitting = false;

// ─── Single-instance lock ─────────────────────────────────────────────────────
//
// Without this, double-clicking setup.bat or the app shortcut while a previous
// instance is still alive (very common with our minimize-to-tray behaviour)
// spawns a second Electron process. Both processes fight over the same
// Chromium user-data directory, and the loser logs "Unable to move the cache:
// Access is denied" / "Gpu Cache Creation failed" before crashing. Single-
// instance lock makes the second launch focus the existing window instead.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  });
}

// Belt-and-braces: skip the GPU shader disk cache entirely. Even with the
// single-instance lock, some users see "Access is denied" on the GPU cache
// when files from a previous Administrator-elevated run got locked down.
// Disabling the disk cache costs us a small first-frame compile-shader hit
// and avoids the whole class of permission errors.
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');

// ─── OSC (VRChat) ──────────────────────────────────────────────────────────
// VRChat OSC convention: app sends to 127.0.0.1:9000, listens on 127.0.0.1:9001
type OSCArg = { type: string; value: any } | string | number | boolean;
let oscPort: any = null;
let oscEnabled = false;
let oscSendHost = '127.0.0.1';
let oscSendPort = 9000;
let oscRecvPort = 9001;
const oscParamCache: Record<string, any> = {};

async function startOSC(opts: { sendHost?: string; sendPort?: number; recvPort?: number } = {}) {
  if (opts.sendHost) oscSendHost = opts.sendHost;
  if (opts.sendPort) oscSendPort = opts.sendPort;
  if (opts.recvPort) oscRecvPort = opts.recvPort;

  if (oscPort) {
    try { oscPort.close(); } catch {}
    oscPort = null;
  }

  try {
    const osc: any = await import('osc');
    oscPort = new osc.UDPPort({
      localAddress: '0.0.0.0',
      localPort: oscRecvPort,
      remoteAddress: oscSendHost,
      remotePort: oscSendPort,
      metadata: true,
    });

    oscPort.on('ready', () => {
      oscEnabled = true;
      console.log(`[OSC] Listening on :${oscRecvPort}, sending to ${oscSendHost}:${oscSendPort}`);
      mainWindow?.webContents.send('osc:status', { connected: true, sendHost: oscSendHost, sendPort: oscSendPort, recvPort: oscRecvPort });
    });

    oscPort.on('message', (msg: { address: string; args: any[] }) => {
      // Cache parameter values for /avatar/parameters/* paths
      if (msg.address?.startsWith('/avatar/parameters/')) {
        const value = Array.isArray(msg.args) && msg.args.length > 0
          ? (msg.args[0]?.value ?? msg.args[0])
          : null;
        oscParamCache[msg.address] = value;
      }
      mainWindow?.webContents.send('osc:message', {
        address: msg.address,
        args: (msg.args || []).map((a: any) => a?.value ?? a),
      });
    });

    oscPort.on('error', (err: any) => {
      console.warn('[OSC] error:', err?.message || err);
      mainWindow?.webContents.send('osc:status', { connected: false, error: err?.message || String(err) });
    });

    oscPort.open();
    return { ok: true };
  } catch (err: any) {
    console.warn('[OSC] failed to start:', err?.message || err);
    oscEnabled = false;
    return { ok: false, error: err?.message || String(err) };
  }
}

function stopOSC() {
  if (oscPort) {
    try { oscPort.close(); } catch {}
    oscPort = null;
  }
  oscEnabled = false;
  mainWindow?.webContents.send('osc:status', { connected: false });
}

function sendOSC(address: string, args: OSCArg[] = []) {
  if (!oscPort || !oscEnabled) return { ok: false, error: 'OSC not started' };
  try {
    const formatted = args.map(a => {
      if (typeof a === 'object' && a !== null && 'type' in a) return a;
      if (typeof a === 'string') return { type: 's', value: a };
      if (typeof a === 'boolean') return { type: a ? 'T' : 'F', value: a };
      if (Number.isInteger(a)) return { type: 'i', value: a };
      return { type: 'f', value: a };
    });
    oscPort.send({ address, args: formatted });
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

// ─── Window ──────────────────────────────────────────────────────────────────

function createWindow() {
  const windowIconPath = path.join(__dirname, '..', 'public', 'icon.png');
  const windowIcon = fs.existsSync(windowIconPath) ? nativeImage.createFromPath(windowIconPath) : undefined;

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#020617',
    icon: windowIcon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
    },
    show: false,
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => mainWindow?.show());

  mainWindow.on('close', (e) => {
    if (!isQuitting && minimizeToTray && tray) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

function loadTrayIcon(): Electron.NativeImage {
  const iconPath = path.join(__dirname, '..', 'public', 'tray-icon.png');
  const fallbackPath = path.join(__dirname, '..', 'public', 'icon.png');
  for (const p of [iconPath, fallbackPath]) {
    if (fs.existsSync(p)) {
      const img = nativeImage.createFromPath(p);
      if (!img.isEmpty()) {
        // Resize for tray (16x16 on win/linux, 22x22 on mac retina handles itself)
        return process.platform === 'darwin' ? img.resize({ width: 18, height: 18 }) : img.resize({ width: 16, height: 16 });
      }
    }
  }
  return nativeImage.createEmpty();
}

function buildTrayMenu(): Electron.Menu {
  const setStatus = (status: string) => {
    mainWindow?.webContents.send('tray:setStatus', status);
    if (!mainWindow?.isVisible()) {
      // Window may be hidden; status update still goes through via IPC.
    }
  };

  return Menu.buildFromTemplate([
    {
      label: 'Show VRC Studio',
      click: () => { mainWindow?.show(); mainWindow?.focus(); },
    },
    { type: 'separator' },
    {
      label: 'Set Status',
      submenu: [
        { label: '🟢  Join Me',  click: () => setStatus('join me') },
        { label: '🔵  Online',   click: () => setStatus('active') },
        { label: '🟡  Ask Me',   click: () => setStatus('ask me') },
        { label: '🔴  Do Not Disturb', click: () => setStatus('busy') },
        { type: 'separator' },
        { label: '⚪  Offline (invisible)', click: () => setStatus('offline') },
      ],
    },
    {
      label: 'OSC Quick Actions',
      submenu: [
        { label: 'Toggle Mute',  click: () => sendOSC('/input/Voice', [{ type: 'i', value: 0 }]) },
        { label: 'Jump',         click: () => { sendOSC('/input/Jump', [{ type: 'i', value: 1 }]); setTimeout(() => sendOSC('/input/Jump', [{ type: 'i', value: 0 }]), 100); } },
        { type: 'separator' },
        { label: 'Send "AFK" to chatbox', click: () => sendOSC('/chatbox/input', [{ type: 's', value: 'AFK' }, { type: 'T', value: true }, { type: 'F', value: false }]) },
        { label: 'Clear chatbox',         click: () => sendOSC('/chatbox/input', [{ type: 's', value: '' }, { type: 'T', value: true }, { type: 'F', value: false }]) },
      ],
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        tray?.destroy();
        tray = null;
        disconnectDiscordRPC();
        stopOSC();
        app.quit();
      },
    },
  ]);
}

function createTray() {
  tray = new Tray(loadTrayIcon());
  tray.setToolTip('VRC Studio');
  tray.setContextMenu(buildTrayMenu());
  tray.on('double-click', () => { mainWindow?.show(); mainWindow?.focus(); });
  tray.on('click', () => {
    if (process.platform === 'win32') { mainWindow?.show(); mainWindow?.focus(); }
  });
}

// ─── Discord RPC ─────────────────────────────────────────────────────────────

type DiscordActivityPayload = {
  details?: string;
  state?: string;
  largeImageKey?: string;
  largeImageText?: string;
  smallImageKey?: string;
  smallImageText?: string;
  startTimestamp?: number;
  instance?: boolean;
  /** Up to two link buttons on the presence card. */
  buttons?: Array<{ label: string; url: string }>;
};

let pendingActivity: DiscordActivityPayload | null = null;
let rpcClientId: string | null = null;
let rpcLastError: string | null = null;
let rpcLastPushAt: number | null = null;
let rpcLastPushOk = false;
/** True when Discord refused our image URLs and we fell back to text-only. */
let rpcDroppedImages = false;

async function initDiscordRPC(clientId: string) {
  // Require a non-empty, plausible clientId (Discord app IDs are 17-19 digits)
  if (!clientId || clientId.length < 10) {
    rpcLastError = 'No Application ID set';
    console.warn('[Discord RPC] No valid clientId provided — skipping init');
    return;
  }

  // Already live on this exact ID — tearing the socket down and rebuilding it
  // drops the activity we just set. The renderer polls its config every few
  // seconds, so without this guard we reconnected forever and never settled.
  if (discordRPC && rpcConnected && rpcClientId === clientId) return;

  // Disconnect any existing session first
  disconnectDiscordRPC();
  rpcClientId = clientId;
  rpcLastError = null;
  rpcDroppedImages = false;
  try {
    const { Client } = await import('discord-rpc');
    discordRPC = new Client({ transport: 'ipc' });

    discordRPC.on('ready', () => {
      rpcConnected = true;
      rpcLastError = null;
      console.log('[Discord RPC] Connected as', (discordRPC as any).user?.username);
      // Flush any activity that was set while we were still connecting
      if (pendingActivity) {
        const a = pendingActivity;
        pendingActivity = null;
        applyActivity(a);
      }
    });

    discordRPC.on('disconnected', () => {
      rpcConnected = false;
      rpcLastError = 'Discord closed the connection';
      console.log('[Discord RPC] Disconnected');
    });

    await discordRPC.login({ clientId });
    console.log('[Discord RPC] login() resolved, awaiting ready event…');
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    // The two failures worth telling the user apart.
    rpcLastError = /could not connect|ENOENT|ECONNREFUSED/i.test(msg)
      ? 'Could not reach Discord — is the desktop app running? (the browser version has no local socket)'
      : /invalid client|unauthor/i.test(msg)
        ? 'Discord rejected the Application ID — check it was copied in full'
        : msg;
    console.warn('[Discord RPC] Failed to connect:', msg);
    discordRPC = null;
    rpcConnected = false;
  }
}

function disconnectDiscordRPC() {
  if (discordRPC) {
    try { discordRPC.destroy(); } catch {}
    discordRPC = null;
    rpcConnected = false;
    pendingActivity = null;
  }
}

function applyActivity(activity: DiscordActivityPayload, allowImages = true) {
  if (!discordRPC) return;

  // Image keys are the fragile part. Discord expects an asset key uploaded to
  // the application, and depending on the client build it may or may not
  // accept a plain https:// URL. When it doesn't, it rejects the WHOLE
  // SET_ACTIVITY — so a bad image URL means no presence at all, which looks
  // exactly like "I pasted my App ID and nothing happened". If a push with
  // images is refused we immediately retry without them, so the text presence
  // always lands.
  const withImages = allowImages && !rpcDroppedImages;
  const payload = {
    details: activity.details,
    state: activity.state,
    largeImageKey: withImages ? activity.largeImageKey : undefined,
    largeImageText: withImages ? activity.largeImageText : undefined,
    smallImageKey: withImages ? activity.smallImageKey : undefined,
    smallImageText: withImages ? activity.smallImageText : undefined,
    startTimestamp: activity.startTimestamp,
    instance: activity.instance ?? false,
    // Discord accepts at most two, each needing a label and an https URL.
    buttons: withImages
      ? activity.buttons?.filter(b => b?.label && /^https:\/\//.test(b.url)).slice(0, 2)
      : undefined,
  };

  console.log('[Discord RPC] setActivity', JSON.stringify({
    details: payload.details,
    state: payload.state,
    largeImageKey: payload.largeImageKey ? `${payload.largeImageKey.slice(0, 60)}…` : undefined,
    startTimestamp: payload.startTimestamp,
  }));

  Promise.resolve(discordRPC.setActivity(payload))
    .then(() => {
      rpcLastPushAt = Date.now();
      rpcLastPushOk = true;
      rpcLastError = null;
    })
    .catch((err: any) => {
      const msg = err?.message ?? String(err);
      console.warn('[Discord RPC] setActivity rejected:', msg);
      const hadImages = !!(payload.largeImageKey || payload.smallImageKey || payload.buttons?.length);
      if (hadImages) {
        rpcDroppedImages = true;
        rpcLastError = `Discord refused the presence images (${msg}) — retrying without them`;
        applyActivity(activity, false);
        return;
      }
      rpcLastPushAt = Date.now();
      rpcLastPushOk = false;
      rpcLastError = msg;
    });
}

function setDiscordActivity(activity: DiscordActivityPayload) {
  // If not yet connected, hold the most recent activity and push when ready.
  if (!rpcConnected || !discordRPC) {
    pendingActivity = activity;
    console.log('[Discord RPC] Not connected yet — queuing activity for ready event');
    return;
  }
  applyActivity(activity);
}

// ─── IPC Handlers ────────────────────────────────────────────────────────────

// Window controls
ipcMain.handle('window:minimize', () => mainWindow?.minimize());
ipcMain.handle('window:maximize', () => {
  mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize();
});
ipcMain.handle('window:close', () => mainWindow?.close());
ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false);
ipcMain.handle('window:quit', () => {
  isQuitting = true;
  disconnectDiscordRPC();
  app.quit();
});

// Settings sync from renderer
ipcMain.handle('settings:setMinimizeToTray', (_e, value: boolean) => {
  minimizeToTray = value;
});

ipcMain.handle('window:setAlwaysOnTop', (_e, value: boolean) => {
  mainWindow?.setAlwaysOnTop(value, 'normal');
});

// Shell
ipcMain.handle('shell:openExternal', (_e, url: string) => shell.openExternal(url));

// File system
ipcMain.handle('fs:listDir', async (_e, dirPath: string) => {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    return {
      success: true,
      entries: entries.map(e => ({
        name: e.name,
        isDirectory: e.isDirectory(),
        path: path.join(dirPath, e.name),
      })),
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

// Every place VRChat may keep its logs, in priority order. We probe all of
// them because installs vary a lot: Steam vs standalone, Proton prefixes,
// OneDrive-redirected home folders, custom Steam library roots.
function vrchatLogDirCandidates(): string[] {
  const home = app.getPath('home');
  const list: string[] = [];

  if (process.platform === 'win32') {
    list.push(path.join(home, 'AppData', 'LocalLow', 'VRChat', 'VRChat'));
    // OneDrive "Known Folder Move" relocates the profile; LocalLow normally
    // stays put, but USERPROFILE can differ from Electron's home.
    if (process.env.USERPROFILE && process.env.USERPROFILE !== home) {
      list.push(path.join(process.env.USERPROFILE, 'AppData', 'LocalLow', 'VRChat', 'VRChat'));
    }
    if (process.env.LOCALAPPDATA) {
      list.push(path.join(path.dirname(process.env.LOCALAPPDATA), 'LocalLow', 'VRChat', 'VRChat'));
    }
  } else if (process.platform === 'darwin') {
    list.push(path.join(home, 'Library', 'Logs', 'VRChat'));
    list.push(path.join(home, 'Library', 'Application Support', 'com.vrchat.VRChat'));
  } else {
    // Linux: VRChat runs under Proton, so the log lives inside the prefix.
    // Steam libraries can live anywhere — probe the common roots.
    const prefixes = [
      path.join(home, '.steam', 'steam'),
      path.join(home, '.local', 'share', 'Steam'),
      path.join(home, '.var', 'app', 'com.valvesoftware.Steam', '.local', 'share', 'Steam'),
    ];
    for (const root of prefixes) {
      list.push(path.join(
        root, 'steamapps', 'compatdata', '438100', 'pfx', 'drive_c', 'users',
        'steamuser', 'AppData', 'LocalLow', 'VRChat', 'VRChat',
      ));
    }
  }

  // De-dupe while preserving order.
  return list.filter((p, i) => list.indexOf(p) === i);
}

/** First candidate directory that actually exists, else the primary one. */
function vrchatLogDir(): string {
  const candidates = vrchatLogDirCandidates();
  return candidates.find(d => { try { return fs.existsSync(d); } catch { return false; } }) ?? candidates[0];
}

ipcMain.handle('fs:getVRChatLogPath', () => vrchatLogDir());

// ─── VRChat log tail (live) ──────────────────────────────────────────────
//
// We tail the most recent output_log_*.txt file in VRChat's log directory and
// stream new lines to the renderer. The renderer parses video URLs, joins,
// world transitions, etc. from those lines and pins them to the current
// instance. Cheap: fs.watch + size-delta read, no full re-parse on every
// poll.

let logTailWatcher: fs.FSWatcher | null = null;
let logTailFilePath: string | null = null;
let logTailPosition = 0;
let logTailDebounce: NodeJS.Timeout | null = null;
let logTailLeftover = '';
// fs.watch misses appends on plenty of setups (network drives, Proton
// prefixes, some Windows AV filter drivers). A cheap stat-poll runs
// alongside it so we never depend on the watcher firing.
let logTailPoll: NodeJS.Timeout | null = null;
// VRChat may not be running when the app starts, and every VRChat session
// creates a NEW output_log file. This interval notices both.
let logTailRescan: NodeJS.Timeout | null = null;
// True between log:startTailing and log:stopTailing — keeps the rescan loop
// hunting for a log file even when none exists yet.
let logTailWanted = false;

const LOG_POLL_MS = 1500;
const LOG_RESCAN_MS = 5000;
/** Never read more than this in one go (a fresh attach on a huge file). */
const LOG_MAX_CATCHUP_BYTES = 4 * 1024 * 1024;

function listVRChatLogFiles(): Array<{ full: string; name: string; mtime: number; size: number }> {
  const out: Array<{ full: string; name: string; mtime: number; size: number }> = [];
  for (const dir of vrchatLogDirCandidates()) {
    try {
      if (!fs.existsSync(dir)) continue;
      for (const name of fs.readdirSync(dir)) {
        // VRChat names them output_log_<date>.txt. Older/modded builds have
        // used "Player.log" too, so accept that as a fallback.
        const isLog = (name.startsWith('output_log_') && name.endsWith('.txt')) ||
                      name === 'Player.log' || name === 'output_log.txt';
        if (!isLog) continue;
        const full = path.join(dir, name);
        try {
          const st = fs.statSync(full);
          if (!st.isFile()) continue;
          out.push({ full, name, mtime: st.mtimeMs, size: st.size });
        } catch {}
      }
    } catch {}
  }
  return out.sort((a, b) => b.mtime - a.mtime);
}

function findLatestVRChatLogFile(): string | null {
  const files = listVRChatLogFiles();
  return files.length > 0 ? files[0].full : null;
}

function sendLogStatus(extra: Record<string, unknown> = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    mainWindow.webContents.send('vrchat:logStatus', {
      active: !!logTailFilePath,
      path: logTailFilePath ?? undefined,
      ...extra,
    });
  } catch {}
}

function readNewLogLines() {
  if (!logTailFilePath || !mainWindow || mainWindow.isDestroyed()) return;
  try {
    const stat = fs.statSync(logTailFilePath);
    // File rotated / truncated → start over from 0
    if (stat.size < logTailPosition) {
      logTailPosition = 0;
      logTailLeftover = '';
    }
    if (stat.size === logTailPosition) return;

    let from = logTailPosition;
    let length = stat.size - from;
    if (length > LOG_MAX_CATCHUP_BYTES) {
      // Jump forward — we'd rather skip ancient history than freeze the UI.
      from = stat.size - LOG_MAX_CATCHUP_BYTES;
      length = LOG_MAX_CATCHUP_BYTES;
      logTailLeftover = '';
    }

    const fd = fs.openSync(logTailFilePath, 'r');
    const buffer = Buffer.alloc(length);
    try {
      fs.readSync(fd, buffer, 0, length, from);
    } finally {
      fs.closeSync(fd);
    }
    logTailPosition = stat.size;

    const text = logTailLeftover + buffer.toString('utf-8');
    const lines = text.split(/\r?\n/);
    // Last fragment may be a partial line — hold it until next read
    logTailLeftover = lines.pop() ?? '';
    const clean = lines.filter(l => l.length > 0);
    if (clean.length > 0) {
      mainWindow.webContents.send('vrchat:logLines', clean);
    }
  } catch (err) {
    console.error('[Log tail] read error:', err);
  }
}

/**
 * Point the tail at `file`. `fromStart` replays the file from the beginning
 * (used when VRChat starts a fresh session while we're running, so the
 * renderer sees the joins it would otherwise have missed).
 */
function attachTail(file: string, fromStart: boolean) {
  if (logTailWatcher) {
    try { logTailWatcher.close(); } catch {}
    logTailWatcher = null;
  }

  logTailFilePath = file;
  logTailLeftover = '';
  try {
    const size = fs.statSync(file).size;
    logTailPosition = fromStart ? Math.max(0, size - LOG_MAX_CATCHUP_BYTES) : size;
  } catch {
    logTailPosition = 0;
  }

  try {
    logTailWatcher = fs.watch(file, () => {
      if (logTailDebounce) clearTimeout(logTailDebounce);
      logTailDebounce = setTimeout(readNewLogLines, 150);
    });
  } catch (err) {
    // Not fatal — the stat-poll below still delivers lines.
    console.warn('[Log tail] fs.watch failed, falling back to polling:', err);
  }

  if (!logTailPoll) logTailPoll = setInterval(readNewLogLines, LOG_POLL_MS);
  if (fromStart) readNewLogLines();
}

/**
 * Runs while tailing is wanted: picks up the log file when VRChat launches
 * after us, and follows the rotation when VRChat starts a new session.
 */
function rescanForNewerLog() {
  if (!logTailWanted) return;
  const latest = findLatestVRChatLogFile();
  if (!latest) return;
  if (latest === logTailFilePath) return;

  const hadFile = !!logTailFilePath;
  // A file we've never tailed: replay it so the current instance's joins
  // land even though we weren't watching when they were written.
  attachTail(latest, true);
  sendLogStatus({ reason: hadFile ? 'rotated' : 'found' });
}

function startLogTail(): { success: boolean; path?: string; error?: string; waiting?: boolean } {
  logTailWanted = true;
  if (!logTailRescan) logTailRescan = setInterval(rescanForNewerLog, LOG_RESCAN_MS);

  const latest = findLatestVRChatLogFile();
  if (!latest) {
    // Not an error the user needs to act on — VRChat simply hasn't run yet.
    // The rescan loop keeps looking and pushes vrchat:logStatus when found.
    return {
      success: false,
      waiting: true,
      error: `No VRChat log file found in ${vrchatLogDir()}`,
    };
  }

  // Already tailing this exact file (StrictMode remount, second call) —
  // leave the position alone so we don't replay or skip lines.
  if (logTailFilePath === latest && logTailWatcher) {
    return { success: true, path: latest };
  }

  attachTail(latest, false);
  return { success: true, path: latest };
}

function stopLogTail() {
  logTailWanted = false;
  if (logTailWatcher) {
    try { logTailWatcher.close(); } catch {}
    logTailWatcher = null;
  }
  if (logTailDebounce) {
    clearTimeout(logTailDebounce);
    logTailDebounce = null;
  }
  if (logTailPoll) {
    clearInterval(logTailPoll);
    logTailPoll = null;
  }
  if (logTailRescan) {
    clearInterval(logTailRescan);
    logTailRescan = null;
  }
  logTailFilePath = null;
  logTailPosition = 0;
  logTailLeftover = '';
}

/** Read the last `maxLines` lines of a log without loading the whole file. */
function readLogTailLines(file: string, maxLines: number): string[] {
  const stat = fs.statSync(file);
  // ~200 bytes/line in VRChat logs; grab generously, capped at 24 MB.
  const window = Math.min(stat.size, Math.min(24 * 1024 * 1024, Math.max(1024 * 1024, maxLines * 400)));
  const from = stat.size - window;
  const buffer = Buffer.alloc(window);
  const fd = fs.openSync(file, 'r');
  try {
    fs.readSync(fd, buffer, 0, window, from);
  } finally {
    fs.closeSync(fd);
  }
  const lines = buffer.toString('utf-8').split(/\r?\n/);
  // The first line is probably truncated when we didn't start at byte 0.
  if (from > 0) lines.shift();
  return lines.filter(l => l.length > 0).slice(-maxLines);
}

ipcMain.handle('log:startTailing', () => startLogTail());
ipcMain.handle('log:stopTailing', () => { stopLogTail(); return { success: true }; });
ipcMain.handle('log:readBacklog', (_e, maxLines: number = 6000) => {
  const safeMax = Math.max(100, Math.min(100_000, Number(maxLines) || 6000));
  const target = logTailFilePath ?? findLatestVRChatLogFile();
  if (!target) return { success: false, error: `No log file in ${vrchatLogDir()}` };
  try {
    return { success: true, lines: readLogTailLines(target, safeMax), path: target };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

// Diagnostics for the Live Avatars refresh button: what we're tailing, which
// directory we looked in, and which log files we can see.
ipcMain.handle('log:status', () => {
  const files = listVRChatLogFiles();
  const dir = vrchatLogDir();
  let size: number | undefined;
  try { if (logTailFilePath) size = fs.statSync(logTailFilePath).size; } catch {}
  return {
    success: true,
    active: !!logTailFilePath,
    watching: logTailWanted,
    path: logTailFilePath ?? undefined,
    position: logTailPosition,
    size,
    dir,
    searchedDirs: vrchatLogDirCandidates(),
    files: files.slice(0, 10).map(f => ({ name: f.name, size: f.size, mtime: f.mtime })),
  };
});

ipcMain.handle('fs:getVRChatScreenshotPath', () => {
  const platform = process.platform;
  if (platform === 'win32') {
    return path.join(app.getPath('pictures'), 'VRChat');
  } else if (platform === 'darwin') {
    return path.join(app.getPath('home'), 'Pictures', 'VRChat');
  }
  return path.join(app.getPath('home'), 'Pictures', 'VRChat');
});

// ─── Persistent App Data Storage ─────────────────────────────────────────────

const getAppDataPath = (fileName: string) => {
  const appDataDir = path.join(app.getPath('userData'), 'AppData');
  if (!fs.existsSync(appDataDir)) {
    fs.mkdirSync(appDataDir, { recursive: true });
  }
  return path.join(appDataDir, `${fileName}.json`);
};

ipcMain.handle('storage:saveAppData', async (_e, key: string, data: string) => {
  try {
    const filePath = getAppDataPath(key);
    fs.writeFileSync(filePath, data, 'utf-8');
    return { success: true };
  } catch (error) {
    throw new Error(`Failed to save app data: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

ipcMain.handle('storage:loadAppData', async (_e, key: string) => {
  try {
    const filePath = getAppDataPath(key);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const data = fs.readFileSync(filePath, 'utf-8');
    return data;
  } catch (error) {
    throw new Error(`Failed to load app data: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

ipcMain.handle('storage:deleteAppData', async (_e, key: string) => {
  try {
    const filePath = getAppDataPath(key);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return { success: true };
  } catch (error) {
    throw new Error(`Failed to delete app data: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

ipcMain.handle('storage:clearAllAppData', async (_e) => {
  try {
    const appDataDir = path.join(app.getPath('userData'), 'AppData');
    if (fs.existsSync(appDataDir)) {
      fs.rmSync(appDataDir, { recursive: true, force: true });
    }
    return { success: true };
  } catch (error) {
    throw new Error(`Failed to clear app data: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

// Desktop notifications (Electron native)
ipcMain.handle('notification:send', (_e, opts: { title: string; body: string; icon?: string }) => {
  if (Notification.isSupported()) {
    const n = new Notification({
      title: opts.title,
      body: opts.body,
      silent: false,
    });
    n.on('click', () => { mainWindow?.show(); mainWindow?.focus(); });
    n.show();
  }
});

// Discord RPC
ipcMain.handle('discord:init', (_e, clientId: string) => initDiscordRPC(clientId));
ipcMain.handle('discord:disconnect', () => disconnectDiscordRPC());
ipcMain.handle('discord:setActivity', (_e, activity: Parameters<typeof setDiscordActivity>[0]) => setDiscordActivity(activity));
ipcMain.handle('discord:isConnected', () => rpcConnected);
ipcMain.handle('discord:status', () => ({
  connected: rpcConnected,
  clientId: rpcClientId,
  lastError: rpcLastError,
  lastPushAt: rpcLastPushAt,
  lastPushOk: rpcLastPushOk,
  imagesDropped: rpcDroppedImages,
}));

// Auto-launch
ipcMain.handle('autoLaunch:set', (_e, enabled: boolean) => {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    name: 'VRC Studio',
    path: process.execPath,
  });
});
ipcMain.handle('autoLaunch:get', () => app.getLoginItemSettings().openAtLogin);

// App info
ipcMain.handle('app:getVersion', () => app.getVersion());
ipcMain.handle('app:getPlatform', () => process.platform);

// Audio visualizer / media detection
// Returns desktop sources (windows + screens) so the renderer can request
// system-audio capture via getUserMedia({ chromeMediaSource: 'desktop' }).
ipcMain.handle('audio:getDesktopSources', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['window', 'screen'],
      thumbnailSize: { width: 0, height: 0 },
    });
    return sources.map(s => ({ id: s.id, name: s.name }));
  } catch (err) {
    return [];
  }
});

// Detects whether Spotify or YouTube is currently playing by scanning
// window titles. Returns a small object the renderer can react to.
ipcMain.handle('audio:detectMedia', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['window'],
      thumbnailSize: { width: 0, height: 0 },
    });
    const titles = sources.map(s => s.name);

    // Spotify: title becomes "Track - Artist" while playing, "Spotify Free"/"Spotify Premium" when idle
    const spotifyTitle = titles.find(t =>
      /^Spotify(?:\s|$)/i.test(t) === false &&
      titles.some(x => /Spotify/i.test(x)) &&
      / - /.test(t) &&
      !/^Spotify (Free|Premium)$/i.test(t)
    );
    // Heuristic: any window owned by Spotify with a "X - Y" track title
    const spotifyPlaying = titles.find(t => / - /.test(t) && /Spotify/i.test(t));

    // YouTube: browser tab title pattern "Video Title - YouTube — Browser"
    const youtubePlaying = titles.find(t => /\sYouTube\b/i.test(t) || /\)\s*-\s*YouTube/i.test(t));

    if (spotifyPlaying || spotifyTitle) {
      const t = spotifyPlaying || spotifyTitle!;
      return { active: true, source: 'spotify' as const, title: t.replace(/\s*[—-]\s*Spotify.*$/i, '').trim() };
    }
    if (youtubePlaying) {
      return { active: true, source: 'youtube' as const, title: youtubePlaying.replace(/\s*-\s*YouTube.*$/i, '').trim() };
    }
    return { active: false, source: null, title: null };
  } catch {
    return { active: false, source: null, title: null };
  }
});


// ─── OSC IPC ─────────────────────────────────────────────────────────────────

ipcMain.handle('osc:start', (_e, opts: { sendHost?: string; sendPort?: number; recvPort?: number } = {}) => {
  return startOSC(opts);
});
ipcMain.handle('osc:stop', () => { stopOSC(); return { ok: true }; });
ipcMain.handle('osc:status', () => ({
  connected: oscEnabled,
  sendHost: oscSendHost,
  sendPort: oscSendPort,
  recvPort: oscRecvPort,
}));
ipcMain.handle('osc:send', (_e, address: string, args: OSCArg[] = []) => sendOSC(address, args));
ipcMain.handle('osc:getCachedParams', () => ({ ...oscParamCache }));
ipcMain.handle('osc:clearCache', () => { for (const k of Object.keys(oscParamCache)) delete oscParamCache[k]; return { ok: true }; });

// ─── VRChat API Proxy ────────────────────────────────────────────────────────

ipcMain.handle('vrchat:request', async (_e, opts: {
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: string;
  cookies?: Record<string, string>;
}) => {
  return new Promise((resolve) => {
    const url = new URL(`https://api.vrchat.cloud${opts.path}`);

    const cookieParts: string[] = [];
    if (opts.cookies) {
      for (const [k, v] of Object.entries(opts.cookies)) {
        if (v) cookieParts.push(`${k}=${v}`);
      }
    }

    const reqHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'VRCStudio/1.0.0 (https://github.com/DoNotPetMe/VRCStudio; vrcstudio@proton.me)',
      ...(opts.headers || {}),
    };
    if (cookieParts.length > 0) {
      reqHeaders['Cookie'] = cookieParts.join('; ');
    }

    const req = https.request(
      {
        hostname: url.hostname,
        port: 443,
        path: url.pathname + url.search,
        method: opts.method || 'GET',
        headers: reqHeaders,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const bodyStr = Buffer.concat(chunks).toString('utf-8');

          const setCookieHeaders = res.headers['set-cookie'] || [];
          const responseCookies: Record<string, string> = {};
          for (const sc of setCookieHeaders) {
            const authMatch = sc.match(/^auth=([^;]+)/);
            if (authMatch) responseCookies['auth'] = authMatch[1];
            const tfaMatch = sc.match(/^twoFactorAuth=([^;]+)/);
            if (tfaMatch) responseCookies['twoFactorAuth'] = tfaMatch[1];
          }

          let json: any = null;
          try {
            json = JSON.parse(bodyStr);
          } catch {}

          resolve({
            ok: res.statusCode! >= 200 && res.statusCode! < 300,
            status: res.statusCode,
            data: json,
            cookies: responseCookies,
          });
        });
      }
    );

    req.on('error', (err) => {
      resolve({
        ok: false,
        status: 0,
        data: { error: { message: err.message } },
        cookies: {},
      });
    });

    if (opts.body) {
      req.write(opts.body);
    }
    req.end();
  });
});

// Generic outbound GET — used for third-party APIs (VRCDB, etc.)
// Runs in main process so we can set any User-Agent header.
// Follows up to 3 redirects.
ipcMain.handle('http:get', async (_e, url: string, headers?: Record<string, string>) => {
  const doRequest = (targetUrl: string, hops = 0): Promise<any> => new Promise((resolve) => {
    let parsed: URL;
    try { parsed = new URL(targetUrl); } catch {
      return resolve({ ok: false, status: 0, data: null, raw: 'Invalid URL', url: targetUrl });
    }

    const finalHeaders: Record<string, string> = {
      'User-Agent': 'VRCX',
      'Accept': 'application/json, text/plain, */*',
      ...headers,
    };

    const req = https.request(
      {
        hostname: parsed.hostname,
        port: parsed.port ? Number(parsed.port) : 443,
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers: finalHeaders,
      },
      (res) => {
        // Follow redirects
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && hops < 3) {
          const next = new URL(res.headers.location, parsed).toString();
          res.resume();
          return resolve(doRequest(next, hops + 1));
        }

        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf-8');
          let data: any = null;
          try { data = JSON.parse(raw); } catch {}
          const ok = res.statusCode! >= 200 && res.statusCode! < 300;
          if (!ok) {
            console.warn(`[http:get] ${targetUrl} → ${res.statusCode}: ${raw.slice(0, 200)}`);
          }
          resolve({ ok, status: res.statusCode, data, raw, url: targetUrl, headers: res.headers });
        });
      }
    );
    req.on('error', (err) => {
      console.warn(`[http:get] ${targetUrl} failed:`, err.message);
      resolve({ ok: false, status: 0, data: null, raw: err.message, url: targetUrl });
    });
    req.setTimeout(15000, () => {
      req.destroy(new Error('Request timeout'));
    });
    req.end();
  });

  return doRequest(url);
});

// Binary fetch — used by the Gallery to pull image bytes into the renderer.
//
// Two reasons this can't be a plain <img> + canvas in the renderer:
//   1. VRChat's file CDN sends no CORS headers, so drawing one onto a canvas
//      taints it and toBlob() throws — no export, no border cropping.
//   2. Some file endpoints need the session cookie, which lives here.
// Returning base64 lets the renderer build a same-origin blob URL instead.
ipcMain.handle('http:getBinary', async (_e, url: string, headers?: Record<string, string>) => {
  const MAX_BYTES = 32 * 1024 * 1024;

  const doRequest = (targetUrl: string, hops = 0): Promise<any> => new Promise((resolve) => {
    let parsed: URL;
    try { parsed = new URL(targetUrl); } catch {
      return resolve({ ok: false, status: 0, error: 'Invalid URL' });
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return resolve({ ok: false, status: 0, error: 'Unsupported protocol' });
    }

    const finalHeaders: Record<string, string> = {
      'User-Agent': 'VRCX',
      'Accept': 'image/*,*/*',
      ...headers,
    };

    const mod = parsed.protocol === 'http:' ? http : https;
    const req = mod.request(
      {
        hostname: parsed.hostname,
        port: parsed.port ? Number(parsed.port) : (parsed.protocol === 'http:' ? 80 : 443),
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers: finalHeaders,
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && hops < 4) {
          const next = new URL(res.headers.location, parsed).toString();
          res.resume();
          return resolve(doRequest(next, hops + 1));
        }

        const chunks: Buffer[] = [];
        let size = 0;
        let aborted = false;
        res.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_BYTES) {
            aborted = true;
            req.destroy();
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () => {
          if (aborted) return resolve({ ok: false, status: res.statusCode, error: 'File too large' });
          const ok = res.statusCode! >= 200 && res.statusCode! < 300;
          resolve({
            ok,
            status: res.statusCode,
            contentType: String(res.headers['content-type'] ?? ''),
            base64: ok ? Buffer.concat(chunks).toString('base64') : undefined,
            error: ok ? undefined : `HTTP ${res.statusCode}`,
          });
        });
      },
    );
    req.on('error', err => resolve({ ok: false, status: 0, error: err.message }));
    req.setTimeout(20000, () => req.destroy(new Error('Request timeout')));
    req.end();
  });

  return doRequest(url);
});

// ─── Auto-updater ─────────────────────────────────────────────────────────────
//
// The app is run from source (npm start), not as a packaged installer, so we
// can't use electron-updater. Instead we treat the GitHub branch as the
// source of truth: check the latest commit, fetch the zip, hand off to a
// helper script that waits for the app to exit, overlays the new files, runs
// npm install, and relaunches.

const UPDATE_REPO = 'DoNotPetMe/VRCStudio';
const UPDATE_BRANCH = 'claude/vrchat-companion-app-e7eJL';
const INSTALL_ROOT = path.resolve(__dirname, '..');
const VERSION_FILE = path.join(INSTALL_ROOT, '.vrcstudio-version.json');

// Resolve the locally-installed commit SHA. Three sources tried in order:
//   1. .vrcstudio-version.json (written after a successful update)
//   2. .git/refs/heads/<branch> (if user cloned via git)
//   3. .git/HEAD → resolve the symbolic ref
function readCurrentCommit(): { sha: string | null; source: string } {
  try {
    if (fs.existsSync(VERSION_FILE)) {
      const v = JSON.parse(fs.readFileSync(VERSION_FILE, 'utf-8'));
      if (v?.commit) return { sha: v.commit, source: 'version-file' };
    }
  } catch {}

  try {
    const branchRefPath = path.join(INSTALL_ROOT, '.git', 'refs', 'heads', ...UPDATE_BRANCH.split('/'));
    if (fs.existsSync(branchRefPath)) {
      const sha = fs.readFileSync(branchRefPath, 'utf-8').trim();
      if (sha) return { sha, source: 'git-branch-ref' };
    }
  } catch {}

  try {
    const headPath = path.join(INSTALL_ROOT, '.git', 'HEAD');
    if (fs.existsSync(headPath)) {
      const head = fs.readFileSync(headPath, 'utf-8').trim();
      if (head.startsWith('ref:')) {
        const refPath = path.join(INSTALL_ROOT, '.git', head.replace(/^ref:\s*/, ''));
        if (fs.existsSync(refPath)) {
          const sha = fs.readFileSync(refPath, 'utf-8').trim();
          if (sha) return { sha, source: 'git-head' };
        }
      } else if (/^[a-f0-9]{40}$/.test(head)) {
        return { sha: head, source: 'git-detached' };
      }
    }
  } catch {}

  return { sha: null, source: 'unknown' };
}

// Minimal GitHub API GET with the User-Agent header GitHub requires.
function githubGet<T = any>(apiPath: string): Promise<{ ok: boolean; status: number; data: T | string }> {
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.github.com',
      path: apiPath,
      method: 'GET',
      headers: {
        'User-Agent': 'VRCStudio-Updater/1.0',
        'Accept': 'application/vnd.github+json',
      },
    }, (res) => {
      let buf = '';
      res.on('data', (chunk) => buf += chunk);
      res.on('end', () => {
        const status = res.statusCode ?? 0;
        const ok = status >= 200 && status < 300;
        try { resolve({ ok, status, data: JSON.parse(buf) }); }
        catch { resolve({ ok, status, data: buf }); }
      });
    });
    req.on('error', () => resolve({ ok: false, status: 0, data: 'network error' }));
    req.end();
  });
}

ipcMain.handle('update:getCurrentCommit', () => readCurrentCommit());

ipcMain.handle('update:check', async () => {
  const local = readCurrentCommit();

  // Latest commit on the branch
  const branch = await githubGet<any>(`/repos/${UPDATE_REPO}/branches/${encodeURIComponent(UPDATE_BRANCH)}`);
  if (!branch.ok) {
    return { ok: false, error: `Couldn't reach GitHub (${branch.status})` };
  }
  const latestSha: string = (branch.data as any).commit?.sha;
  const latestCommit = (branch.data as any).commit?.commit;

  // No local commit known? Treat as 'up to date is unknown, latest is X'.
  if (!local.sha) {
    return {
      ok: true,
      currentCommit: null,
      latestCommit: latestSha,
      behind: 0,
      upToDate: false,
      unknown: true,
      latestMessage: latestCommit?.message ?? null,
      latestDate: latestCommit?.author?.date ?? null,
      commits: [],
    };
  }

  if (local.sha === latestSha) {
    return {
      ok: true,
      currentCommit: local.sha,
      latestCommit: latestSha,
      behind: 0,
      upToDate: true,
      commits: [],
    };
  }

  // Get the commits between local and latest
  const compare = await githubGet<any>(`/repos/${UPDATE_REPO}/compare/${local.sha}...${latestSha}`);
  if (!compare.ok) {
    return {
      ok: true,
      currentCommit: local.sha,
      latestCommit: latestSha,
      behind: -1,
      upToDate: false,
      commits: [],
    };
  }

  const commits = ((compare.data as any).commits ?? []).map((c: any) => ({
    sha: c.sha,
    shortSha: c.sha.slice(0, 7),
    message: c.commit?.message?.split('\n')[0] ?? '',
    author: c.commit?.author?.name ?? '',
    date: c.commit?.author?.date ?? '',
    url: c.html_url ?? '',
  }));

  return {
    ok: true,
    currentCommit: local.sha,
    latestCommit: latestSha,
    behind: commits.length,
    upToDate: false,
    commits,
  };
});

// Download the source zip for the current branch to a temp file and report
// progress as we go.
function downloadFile(url: string, dest: string, onProgress?: (received: number, total: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const doRequest = (target: string) => {
      const u = new URL(target);
      const req = https.request({
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: 'GET',
        headers: { 'User-Agent': 'VRCStudio-Updater/1.0' },
      }, (res) => {
        // Follow redirects (GitHub zip downloads always redirect to codeload.github.com)
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          doRequest(res.headers.location.startsWith('http')
            ? res.headers.location
            : `https://${u.hostname}${res.headers.location}`);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Download failed: HTTP ${res.statusCode}`));
          return;
        }
        const total = parseInt(res.headers['content-length'] ?? '0', 10);
        let received = 0;
        const out = fs.createWriteStream(dest);
        res.on('data', (chunk) => {
          received += chunk.length;
          onProgress?.(received, total);
        });
        res.pipe(out);
        out.on('finish', () => out.close(() => resolve()));
        out.on('error', (err) => { try { fs.unlinkSync(dest); } catch {} reject(err); });
      });
      req.on('error', reject);
      req.end();
    };
    doRequest(url);
  });
}

ipcMain.handle('update:downloadAndApply', async (_e) => {
  // Packaged .exe builds can't self-update via the source-tree mechanism
  // (the source isn't around — everything's inside an asar archive). Point
  // the user at GitHub so they can re-download and re-build instead.
  if (app.isPackaged) {
    return {
      ok: false,
      error: 'This is a packaged build. Re-download the source from GitHub and run Start Here.bat again to update.',
    };
  }

  try {
    const zipUrl = `https://github.com/${UPDATE_REPO}/archive/refs/heads/${UPDATE_BRANCH}.zip`;
    const zipPath = path.join(app.getPath('temp'), `vrcstudio-update-${Date.now()}.zip`);

    if (mainWindow) mainWindow.webContents.send('update:progress', { stage: 'downloading', received: 0, total: 0 });
    await downloadFile(zipUrl, zipPath, (received, total) => {
      if (mainWindow) mainWindow.webContents.send('update:progress', { stage: 'downloading', received, total });
    });
    if (mainWindow) mainWindow.webContents.send('update:progress', { stage: 'preparing', received: 100, total: 100 });

    // The helper script lives alongside setup.bat in the install root.
    const helperPath = path.join(INSTALL_ROOT, 'update-helper.bat');
    if (!fs.existsSync(helperPath)) {
      throw new Error(`update-helper.bat not found at ${helperPath}`);
    }

    // Spawn the helper detached so it survives our quit. Args: zip path,
    // install dir, our PID, the branch ref for the post-update version
    // marker.
    const branchInfo = await githubGet<any>(`/repos/${UPDATE_REPO}/branches/${encodeURIComponent(UPDATE_BRANCH)}`);
    const latestSha = (branchInfo.data as any)?.commit?.sha ?? '';

    const child = spawn('cmd.exe', ['/c', 'start', '', helperPath, zipPath, INSTALL_ROOT, String(process.pid), latestSha], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    });
    child.unref();

    if (mainWindow) mainWindow.webContents.send('update:progress', { stage: 'restarting', received: 100, total: 100 });

    // Give the helper a moment to start, then exit so it can take over.
    setTimeout(() => {
      isQuitting = true;
      app.quit();
    }, 600);

    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err) };
  }
});

// Helper for the post-update boot: if the version file was just written
// (within the last 5 minutes) the renderer can show a "you're now on
// commit X" banner.
ipcMain.handle('update:getLastApplied', () => {
  try {
    if (!fs.existsSync(VERSION_FILE)) return null;
    return JSON.parse(fs.readFileSync(VERSION_FILE, 'utf-8'));
  } catch {
    return null;
  }
});

// ─── Discord bot bridge ───────────────────────────────────────────────────────
//
// All the bot-specific logic lives in electron/discord-bot.ts. Here we just
// wire its IPC surface and keep its mainWindow ref in sync.

ipcMain.handle('bot:start', async (_e, token: string) => {
  return discordBot.startBot(token);
});

ipcMain.handle('bot:stop', async () => {
  await discordBot.stopBot();
  return { ok: true };
});

ipcMain.handle('bot:status', () => discordBot.getStatus());

ipcMain.handle('bot:syncState', (_e, snapshot: any) => {
  discordBot.updateSnapshot(snapshot ?? {});
  return { ok: true };
});

// Renderer reports back the result of a bot:executeAction event.
ipcMain.handle('bot:actionResult', (_e, payload: { id: string; ok: boolean; error?: string; data?: any }) => {
  discordBot.resolveAction(payload.id, { ok: payload.ok, error: payload.error, data: payload.data });
  return { ok: true };
});

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  // Stale GPU caches from a previous (crashed or elevated) run sometimes
  // sit there locked. Try to clear them once before we open windows — if
  // it fails we silently move on, the disable-gpu-shader-disk-cache flag
  // above keeps us functional either way.
  try {
    const gpuCache = path.join(app.getPath('userData'), 'GPUCache');
    if (fs.existsSync(gpuCache)) {
      fs.rmSync(gpuCache, { recursive: true, force: true });
    }
  } catch {}

  createWindow();
  createTray();
  // Discord bot needs the window ref to dispatch bot:executeAction events
  // back to the renderer.
  discordBot.setMainWindow(mainWindow);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    disconnectDiscordRPC();
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('before-quit', () => {
  isQuitting = true;
  disconnectDiscordRPC();
  stopOSC();
  discordBot.stopBot().catch(() => {});
});
