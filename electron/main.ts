import {
  app, BrowserWindow, ipcMain, shell, Tray, Menu,
  nativeImage, Notification, nativeTheme,
} from 'electron';
import path from 'path';
import fs from 'fs';
import https from 'https';
import crypto from 'crypto';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let discordRPC: any = null;
let rpcConnected = false;
let minimizeToTray = true;
let isQuitting = false;

const UNITY_BUNDLE_SIGNATURE = 'UnityFS';
const SOURCE_ENGINE_VERSION_PREFIX = '2022.3.22f2';
const TARGET_ENGINE_VERSION_PREFIX = '2022.3.22f1';

function readNullTerminatedString(buffer: Buffer, offset: number): { value: string; nextOffset: number } {
  let end = offset;
  while (end < buffer.length && buffer[end] !== 0) {
    end += 1;
  }
  return {
    value: buffer.toString('utf8', offset, end),
    nextOffset: end + 1,
  };
}

function patchUnityFsEngineVersion(bundleBytes: Buffer): { patchedBytes: Buffer; patched: boolean; originalVersion?: string; patchedVersion?: string } {
  const patchedBytes = Buffer.from(bundleBytes);
  const signature = readNullTerminatedString(patchedBytes, 0);

  if (signature.value !== UNITY_BUNDLE_SIGNATURE) {
    return { patchedBytes, patched: false };
  }

  const formatVersion = readNullTerminatedString(patchedBytes, signature.nextOffset);
  const playerVersion = readNullTerminatedString(patchedBytes, formatVersion.nextOffset);
  const engineVersionStartOffset = playerVersion.nextOffset;
  const engineVersion = readNullTerminatedString(patchedBytes, engineVersionStartOffset);
  const originalVersion = engineVersion.value;

  if (!originalVersion.startsWith(SOURCE_ENGINE_VERSION_PREFIX)) {
    return { patchedBytes, patched: false, originalVersion };
  }

  const replacementBytes = Buffer.from(TARGET_ENGINE_VERSION_PREFIX, 'utf8');
  const maxReplaceLength = Math.min(replacementBytes.length, originalVersion.length);
  replacementBytes.copy(patchedBytes, engineVersionStartOffset, 0, maxReplaceLength);

  const patchedVersion = patchedBytes.toString('utf8', engineVersionStartOffset, engineVersionStartOffset + originalVersion.length);
  return { patchedBytes, patched: true, originalVersion, patchedVersion };
}

// ─── Window ──────────────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#020617',
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

function createTray() {
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip('VRC Studio');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show VRC Studio',
      click: () => { mainWindow?.show(); mainWindow?.focus(); },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        tray?.destroy();
        tray = null;
        disconnectDiscordRPC();
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => { mainWindow?.show(); mainWindow?.focus(); });
}

// ─── Discord RPC ─────────────────────────────────────────────────────────────

async function initDiscordRPC(clientId: string) {
  try {
    const { Client } = await import('discord-rpc' as string);
    discordRPC = new Client({ transport: 'ipc' });

    discordRPC.on('ready', () => {
      rpcConnected = true;
      console.log('[Discord RPC] Connected');
    });

    discordRPC.on('disconnected', () => {
      rpcConnected = false;
      console.log('[Discord RPC] Disconnected');
    });

    discordRPC.login({ clientId }).catch((err: Error) => {
      console.warn('[Discord RPC] Login failed:', err.message);
    });
  } catch {
    console.warn('[Discord RPC] discord-rpc not installed, skipping');
  }
}

function disconnectDiscordRPC() {
  if (discordRPC) {
    try { discordRPC.destroy(); } catch {}
    discordRPC = null;
    rpcConnected = false;
  }
}

function setDiscordActivity(activity: {
  details?: string;
  state?: string;
  largeImageKey?: string;
  largeImageText?: string;
  smallImageKey?: string;
  smallImageText?: string;
  startTimestamp?: number;
  instance?: boolean;
}) {
  if (!rpcConnected || !discordRPC) return;
  try {
    discordRPC.setActivity({
      ...activity,
      instance: activity.instance ?? false,
    });
  } catch (err) {
    console.warn('[Discord RPC] setActivity failed:', err);
  }
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

// Shell
ipcMain.handle('shell:openExternal', (_e, url: string) => shell.openExternal(url));

// File system
ipcMain.handle('fs:readFile', async (_e, filePath: string) => {
  try {
    return { success: true, content: fs.readFileSync(filePath, 'utf-8') };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

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

ipcMain.handle('fs:getVRChatLogPath', () => {
  const platform = process.platform;
  if (platform === 'win32') {
    return path.join(app.getPath('home'), 'AppData', 'LocalLow', 'VRChat', 'VRChat');
  } else if (platform === 'darwin') {
    return path.join(app.getPath('home'), 'Library', 'Logs', 'VRChat');
  } else {
    return path.join(app.getPath('home'), '.steam', 'steam', 'steamapps', 'compatdata', '438100', 'pfx', 'drive_c', 'users', 'steamuser', 'AppData', 'LocalLow', 'VRChat', 'VRChat');
  }
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

// Avatar bundle operations (Windows only)
ipcMain.handle('fs:getAvatarBundlePath', () => {
  if (process.platform !== 'win32') {
    throw new Error('Avatar bundles only supported on Windows');
  }
  return path.join(app.getPath('userData'), 'AvatarBundles');
});

ipcMain.handle('fs:downloadFile', async (event, url: string, avatarId: string) => {
  if (process.platform !== 'win32') {
    throw new Error('Avatar downloads only supported on Windows');
  }

  const bundleDir = path.join(app.getPath('userData'), 'AvatarBundles', avatarId);
  if (!fs.existsSync(bundleDir)) {
    fs.mkdirSync(bundleDir, { recursive: true });
  }

  const fileName = `${avatarId}.vrca`;
  const bundlePath = path.join(bundleDir, fileName);
  console.log('[Bundle] Downloading to:', bundlePath);

  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(bundlePath);
    const request = https.get(url, { timeout: 30000 }, (response) => {
      const totalSize = parseInt(response.headers['content-length'] || '0', 10);
      let downloadedSize = 0;

      response.on('data', (chunk) => {
        downloadedSize += chunk.length;
        if (totalSize > 0) {
          event.sender.send('fs:downloadFile:progress', downloadedSize, totalSize);
        }
      });

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        resolve(bundlePath);
      });

      file.on('error', (err) => {
        fs.unlink(bundlePath, () => {}); // Delete the file on error
        reject(err);
      });
    });

    request.on('error', (err) => {
      fs.unlink(bundlePath, () => {}); // Delete the file on error
      reject(err);
    });

    request.on('timeout', () => {
      request.destroy();
      fs.unlink(bundlePath, () => {}); // Delete the file on timeout
      reject(new Error('Download timeout'));
    });
  });
});

ipcMain.handle('fs:extractBundle', async (_e, sourcePath: string, avatarId: string) => {
  if (process.platform !== 'win32') {
    throw new Error('Avatar extraction only supported on Windows');
  }

  try {
    console.log('[Bundle] Creating .unitypackage from AssetBundle:', sourcePath);

    // Validate source file exists and has content
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Source bundle not found: ${sourcePath}`);
    }
    const stats = fs.statSync(sourcePath);
    console.log(`[Bundle] Source file size: ${stats.size} bytes`);
    if (stats.size === 0) {
      throw new Error('Downloaded bundle file is empty');
    }

    // Log first bytes for format diagnostics
    const headerBuf = Buffer.alloc(16);
    const fd = fs.openSync(sourcePath, 'r');
    fs.readSync(fd, headerBuf, 0, 16, 0);
    fs.closeSync(fd);
    console.log('[Bundle] File header (hex):', headerBuf.toString('hex'));
    console.log('[Bundle] File header (ascii):', headerBuf.toString('ascii').replace(/[^\x20-\x7E]/g, '.'));

    const bundleDir = path.join(app.getPath('userData'), 'AvatarBundles', avatarId);
    const guid = crypto.randomBytes(16).toString('hex');
    const stagingDir = path.join(bundleDir, 'staging');
    const guidDir = path.join(stagingDir, guid);

    // Create staging structure
    fs.mkdirSync(guidDir, { recursive: true });
    console.log('[Bundle] Staging directory created:', guidDir);

    // Write pathname file
    const pathname = `Assets/Avatar/${avatarId}.vrca`;
    fs.writeFileSync(path.join(guidDir, 'pathname'), pathname + '\n');
    console.log('[Bundle] Pathname:', pathname);

    // Read full .vrca into memory and patch UnityFS engine version in-memory.
    // We only overwrite the version prefix and leave any existing suffix bytes intact
    // to preserve byte length and keep header offsets unchanged.
    const originalBundleBytes = fs.readFileSync(sourcePath);
    const patchResult = patchUnityFsEngineVersion(originalBundleBytes);
    if (patchResult.patched) {
      console.log('[Bundle] Engine version patched in-memory:', `${patchResult.originalVersion} -> ${patchResult.patchedVersion}`);
    } else {
      console.log('[Bundle] Engine version patch skipped (no matching UnityFS header/version found)');
    }

    // Write patched bytes to staging asset. Source file on disk is never modified.
    fs.writeFileSync(path.join(guidDir, 'asset'), patchResult.patchedBytes);
    console.log('[Bundle] Patched asset written to staging');

    // Write minimal Unity .meta file
    const metaContent = [
      'fileFormatVersion: 2',
      `guid: ${guid}`,
      'NativeFormatImporter:',
      '  userData:',
      '  assetBundleName:',
      '  assetBundleVariant:',
      '',
    ].join('\n');
    fs.writeFileSync(path.join(guidDir, 'asset.meta'), metaContent);

    // Create tar.gz (.unitypackage)
    const outputPath = path.join(bundleDir, `${avatarId}.unitypackage`);
    const tar = await import('tar');
    await tar.create(
      { gzip: true, file: outputPath, cwd: stagingDir },
      [guid],
    );

    console.log('[Bundle] .unitypackage created:', outputPath);
    console.log('[Bundle] Output size:', fs.statSync(outputPath).size, 'bytes');

    // Clean up staging directory
    fs.rmSync(stagingDir, { recursive: true, force: true });
    console.log('[Bundle] Staging cleaned up');

    return outputPath;
  } catch (error) {
    console.error('[Bundle] Failed to create .unitypackage:', error);
    throw new Error(`Failed to create .unitypackage: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

ipcMain.handle('fs:openBundleFolder', async (_e, folderPath: string) => {
  if (process.platform !== 'win32') {
    throw new Error('Bundle folder open only supported on Windows');
  }

  try {
    if (!fs.existsSync(folderPath)) {
      throw new Error('Path does not exist');
    }
    const stat = fs.statSync(folderPath);
    if (stat.isFile()) {
      // Open Explorer with the file selected
      shell.showItemInFolder(folderPath);
    } else {
      shell.openPath(folderPath);
    }
  } catch (error) {
    throw new Error(`Failed to open folder: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

ipcMain.handle('fs:deleteBundleData', async (_e, avatarId: string) => {
  if (process.platform !== 'win32') {
    throw new Error('Bundle deletion only supported on Windows');
  }

  const bundleDir = path.join(app.getPath('userData'), 'AvatarBundles', avatarId);
  if (fs.existsSync(bundleDir)) {
    fs.rmSync(bundleDir, { recursive: true, force: true });
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
      'User-Agent': 'VRCStudio/1.0.0',
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

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow();
  createTray();
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
});
