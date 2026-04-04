import {
  app, BrowserWindow, ipcMain, shell, Tray, Menu, dialog,
  nativeImage, Notification, nativeTheme,
} from 'electron';
import path from 'path';
import fs from 'fs';
import https from 'https';
import crypto from 'crypto';
import zlib from 'zlib';
import { promisify } from 'util';

// Initialize logging EARLY - use a simpler path
let logFile: string;

// Set up logging before anything else
function initializeLogging() {
  try {
    // Try to use user data path
    let logsDir = path.join(app.getPath('userData'), 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    logFile = path.join(logsDir, 'vrc-studio-diagnostic.log');
  } catch (err) {
    // Fallback to temp directory
    try {
      const tempDir = require('os').tmpdir();
      logFile = path.join(tempDir, 'vrc-studio-diagnostic.log');
    } catch {
      // Last resort - use relative path
      logFile = './vrc-studio-diagnostic.log';
    }
  }

  logDiagnostic('=== VRC Studio Starting ===');
  logDiagnostic(`Log file: ${logFile}`);
  logDiagnostic(`Platform: ${process.platform}`);
  logDiagnostic(`App version: ${app.getVersion()}`);
}

function logDiagnostic(message: string) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  console.log(logMessage);

  // Also log to a file if possible
  try {
    if (logFile) {
      fs.appendFileSync(logFile, logMessage);
    }
  } catch (err) {
    console.error('Failed to write to log file:', err);
  }
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let discordRPC: any = null;
let rpcConnected = false;
let minimizeToTray = true;
let isQuitting = false;

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
ipcMain.handle('fs:readFile', async (_e, filePath: string, autoDecompress: boolean = true) => {
  try {
    // Read as binary data (Buffer), then convert to base64 for transfer
    let buffer = fs.readFileSync(filePath);

    console.log(`[ReadFile] File size: ${buffer.length} bytes`);
    const header = buffer.slice(0, 8).toString('hex');
    console.log(`[ReadFile] File header: ${header}`);

    // Check if the file is gzip-compressed and decompress if requested
    if (autoDecompress && buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
      console.log(`[ReadFile] Detected GZIP compression (1f 8b), decompressing...`);
      const zlib = require('zlib');
      try {
        const decompressed = zlib.gunzipSync(buffer);
        console.log(`[ReadFile] ✓ Decompressed to ${decompressed.length} bytes`);
        buffer = decompressed;
      } catch (decompressErr: any) {
        console.error(`[ReadFile] ✗ Decompression failed:`, decompressErr.message);
        // Keep original buffer if decompression fails
      }
    }

    const base64Data = buffer.toString('base64');
    console.log(`[ReadFile] Returning ${buffer.length} bytes as base64`);
    return { success: true, content: base64Data, size: buffer.length };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

// Extract avatar bundle directly from cache and save to Downloads
ipcMain.handle('fs:extractAvatarToDownloads', async (_e, cacheDataPath: string, avatarId: string) => {
  try {
    logDiagnostic('\n========== AVATAR EXTRACTION START ==========');
    logDiagnostic(`Cache file: ${cacheDataPath}`);
    logDiagnostic(`Avatar ID: ${avatarId}`);

    // Verify cache file exists
    if (!fs.existsSync(cacheDataPath)) {
      const errorMsg = `Cache file not found: ${cacheDataPath}`;
      logDiagnostic(`ERROR: ${errorMsg}`);
      throw new Error(errorMsg);
    }

    const cacheStats = fs.statSync(cacheDataPath);
    logDiagnostic(`File size: ${cacheStats.size} bytes (${(cacheStats.size / 1024 / 1024).toFixed(2)} MB)`);

    // Read the entire file
    const buffer = fs.readFileSync(cacheDataPath);
    logDiagnostic(`Read successful: ${buffer.length} bytes`);

    // Analyze header
    const hexHeader = buffer.slice(0, 16).toString('hex');
    const asciiHeader = buffer.slice(0, 6).toString('utf8');
    logDiagnostic(`Header (hex): ${hexHeader}`);
    logDiagnostic(`Header (ascii): "${asciiHeader}"`);

    // Detect format - save as .unitypackage by default
    let detectedFormat = 'UNKNOWN';
    if (buffer[0] === 0x1f && buffer[1] === 0x8b) {
      detectedFormat = 'GZIP_COMPRESSED';
      logDiagnostic('✓ Detected: GZIP compression');
    } else if (asciiHeader === 'UnityFS') {
      detectedFormat = 'UNITYFS_BUNDLE';
      logDiagnostic('✓ Detected: Raw UnityFS bundle');
    } else if (buffer[0] === 0x50 && buffer[1] === 0x4b) {
      detectedFormat = 'ZIP_UNITYPACKAGE';
      logDiagnostic('✓ Detected: ZIP (.unitypackage)');
    } else {
      logDiagnostic(`⚠ Unknown format, treating as raw data`);
    }

    // Get Downloads folder
    const downloadsPath = app.getPath('downloads');
    const outputPath = path.join(downloadsPath, `${avatarId}.unitypackage`);

    // Decompress gzip if needed to get the raw bundle data
    let rawBundleBuffer = buffer;
    if (detectedFormat === 'GZIP_COMPRESSED') {
      logDiagnostic('Decompressing gzip to get raw bundle...');
      try {
        rawBundleBuffer = zlib.gunzipSync(buffer);
        logDiagnostic(`Decompressed: ${rawBundleBuffer.length} bytes`);
        const innerHeader = rawBundleBuffer.slice(0, 7).toString('utf8');
        logDiagnostic(`Inner format: "${innerHeader}"`);
      } catch (decompErr: any) {
        logDiagnostic(`Decompression failed: ${decompErr.message}, using raw buffer`);
      }
    }

    // Always wrap in a proper .unitypackage tar.gz
    logDiagnostic(`Creating .unitypackage tar.gz...`);
    const tempRawPath = path.join(downloadsPath, `${avatarId}-raw.tmp`);
    fs.writeFileSync(tempRawPath, rawBundleBuffer);

    try {
      await createUnityPackage(tempRawPath, avatarId, outputPath);
    } finally {
      if (fs.existsSync(tempRawPath)) {
        fs.unlinkSync(tempRawPath);
      }
    }

    // Verify
    if (!fs.existsSync(outputPath)) {
      throw new Error('File write failed - file does not exist after write');
    }

    const outputStats = fs.statSync(outputPath);
    logDiagnostic(`✓ .unitypackage created: ${outputStats.size} bytes`);

    logDiagnostic(`Format detected: ${detectedFormat}`);
    logDiagnostic(`========== EXTRACTION SUCCESS ==========\n`);

    return {
      success: true,
      path: outputPath,
      size: outputStats.size,
      format: detectedFormat,
      logFile: logFile
    };
  } catch (err: any) {
    logDiagnostic(`✗ FAILED: ${err.message}`);
    logDiagnostic(`========== EXTRACTION FAILED ==========\n`);
    return {
      success: false,
      error: err.message,
      logFile: logFile
    };
  }
});

ipcMain.handle('fs:getDiagnosticLog', async () => {
  try {
    if (!fs.existsSync(logFile)) {
      return { success: false, error: 'No diagnostic log found' };
    }

    const content = fs.readFileSync(logFile, 'utf8');
    return { success: true, logFile, content };
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

// Open cache folder browser
ipcMain.handle('fs:browseCacheFolder', async (_e) => {
  try {
    const homeDir = app.getPath('home');
    const cacheRoot = path.join(homeDir, 'AppData', 'LocalLow', 'VRChat', 'VRChat', 'Cache-WindowsPlayer');

    // Open file dialog to let user select a file
    const result = await dialog.showOpenDialog({
      title: 'Select _data file from VRChat cache',
      defaultPath: fs.existsSync(cacheRoot) ? cacheRoot : homeDir,
      filters: [
        { name: 'Data Files', extensions: ['_data', '*'] }
      ],
      properties: ['openFile']
    });

    if (result.canceled) {
      return { success: false, error: 'Canceled' };
    }

    const selectedPath = result.filePaths[0];

    // Verify it's a file
    if (!fs.statSync(selectedPath).isFile()) {
      return { success: false, error: 'Selected item is not a file' };
    }

    console.log(`[BrowseCache] User selected: ${selectedPath}`);
    return { success: true, path: selectedPath };
  } catch (err: any) {
    console.error(`[BrowseCache] Error:`, err.message);
    return { success: false, error: err.message };
  }
});

function scoreCacheBundleCandidate(bundlePath: string, avatarId?: string): number {
  let score = 0;

  try {
    const stat = fs.statSync(bundlePath);
    // Favor realistic avatar bundle sizes and more recent files.
    if (stat.size > 5 * 1024 * 1024) score += 20;
    if (stat.size > 20 * 1024 * 1024) score += 20;
    score += Math.min(20, Math.floor((Date.now() - stat.mtimeMs) / (1000 * 60 * 10)) * -1 + 20);
  } catch {
    // ignore stat issues
  }

  if (!avatarId) return score;

  const dir = path.dirname(bundlePath);
  const siblingCandidates = ['__info', '__metadata', '_info', 'info', '__data'];

  for (const fileName of siblingCandidates) {
    const filePath = path.join(dir, fileName);
    if (!fs.existsSync(filePath)) continue;
    try {
      const text = fs.readFileSync(filePath, { encoding: 'utf8' });
      if (text.includes(avatarId)) {
        score += 1000;
      }
      if (text.includes('/avatar/') || text.includes('avatar') || text.includes('avtr_')) {
        score += 25;
      }
      break;
    } catch {
      // likely binary; skip
    }
  }

  // Weak fallback heuristics
  if (bundlePath.includes(avatarId)) score += 200;

  return score;
}

// Search for _data files (avatar bundles) in VRChat cache
ipcMain.handle('fs:searchCacheForDataFiles', async (_e, avatarId?: string) => {
  try {
    if (process.platform !== 'win32') {
      return { success: false, error: 'Only supported on Windows' };
    }

    const cacheRoot = path.join(app.getPath('home'), 'AppData', 'LocalLow', 'VRChat', 'VRChat', 'Cache-WindowsPlayer');

    console.log(`[SearchCache] Starting search in: ${cacheRoot}`);

    // Verify cache root exists
    if (!fs.existsSync(cacheRoot)) {
      console.log(`[SearchCache] Cache root doesn't exist: ${cacheRoot}`);
      return { success: false, error: 'Cache directory not found' };
    }

    const foundPaths: string[] = [];
    const queue: string[] = [cacheRoot];
    const visited = new Set<string>();
    let scannedDirs = 0;
    const maxDirs = 5000; // Prevent infinite loops
    const maxDepth = 12;

    // BFS search for _data files
    while (queue.length > 0) {
      if (scannedDirs >= maxDirs) {
        console.log(`[SearchCache] Reached max directory limit`);
        break;
      }

      const dirPath = queue.shift()!;
      if (visited.has(dirPath)) continue;
      visited.add(dirPath);
      scannedDirs++;

      const depth = dirPath.split(path.sep).length - cacheRoot.split(path.sep).length;
      if (depth > maxDepth) continue;

      try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);

          // Check for _data file
          if (entry.name === '_data' && entry.isFile()) {
            const stat = fs.statSync(fullPath);
            const score = scoreCacheBundleCandidate(fullPath, avatarId);
            console.log(`[SearchCache] ✓ FOUND BUNDLE: ${fullPath} (${stat.size} bytes, score=${score})`);
            foundPaths.push(fullPath);
          }

          // Queue directories
          if (entry.isDirectory()) {
            queue.push(fullPath);
          }
        }

        if (scannedDirs % 100 === 0) {
          console.log(`[SearchCache] Scanned ${scannedDirs} directories, found ${foundPaths.length} bundles so far...`);
        }
      } catch (err) {
        // Skip directories we can't read
        if (!(err instanceof Error && err.message.includes('EACCES'))) {
          console.log(`[SearchCache] Error reading ${dirPath}:`, (err as any).message);
        }
      }
    }

    const ranked = foundPaths
      .map(p => ({ path: p, score: scoreCacheBundleCandidate(p, avatarId) }))
      .sort((a, b) => b.score - a.score);

    console.log(`[SearchCache] Search complete. Scanned ${scannedDirs} dirs, found ${foundPaths.length} bundle(s)`);
    if (avatarId && ranked.length > 0) {
      console.log(`[SearchCache] Top match for ${avatarId}: ${ranked[0].path} (score=${ranked[0].score})`);
    }

    return {
      success: true,
      bundles: ranked.map(r => r.path),
      scoredBundles: ranked.slice(0, 10),
      scannedDirs,
    };
  } catch (err: any) {
    console.error(`[SearchCache] Fatal error:`, err.message);
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

  console.log(`[Download] Starting download from: ${url}`);

  const bundleDir = path.join(app.getPath('userData'), 'AvatarBundles', avatarId);
  console.log(`[Download] Bundle directory: ${bundleDir}`);

  // Ensure directory exists with robust error handling
  try {
    if (!fs.existsSync(bundleDir)) {
      fs.mkdirSync(bundleDir, { recursive: true });
      console.log(`[Download] Created directory: ${bundleDir}`);
    }
  } catch (mkdirError) {
    const errorMsg = mkdirError instanceof Error ? mkdirError.message : 'Unknown error';
    console.error(`[Download] Failed to create directory: ${errorMsg}`);
    throw new Error(`Cannot create bundle directory: ${errorMsg}`);
  }

  // Extract filename more intelligently
  let fileName: string;
  try {
    // Remove query parameters
    const urlWithoutQuery = url.split('?')[0];
    const pathParts = urlWithoutQuery.split('/');
    const lastPart = pathParts[pathParts.length - 1];

    // Check if last part looks like a real filename (has an extension)
    if (lastPart && lastPart.includes('.')) {
      fileName = lastPart;
    } else {
      // Use default filename for API endpoints
      fileName = `avatar-${avatarId}.unitypackage`;
    }

    // Sanitize filename to prevent path traversal
    fileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  } catch (err) {
    fileName = `avatar-${avatarId}.unitypackage`;
  }

  const bundlePath = path.join(bundleDir, fileName);
  const tempBundlePath = bundlePath + '.tmp';
  console.log(`[Download] Target path: ${bundlePath}`);
  console.log(`[Download] Temp path: ${tempBundlePath}`);

  return new Promise(async (resolve, reject) => {
    let file: fs.WriteStream;

    // Attempt to create write stream with error handling
    try {
      file = fs.createWriteStream(tempBundlePath);
    } catch (streamError) {
      const errorMsg = streamError instanceof Error ? streamError.message : 'Unknown error';
      console.error(`[Download] Failed to create write stream: ${errorMsg}`);
      reject(new Error(`Cannot write to bundle file: ${errorMsg}`));
      return;
    }

    try {
      // Get cookies from the session to authenticate the request
      const cookies = await mainWindow?.webContents.session.cookies.get({
        url: 'https://api.vrchat.cloud',
      }) || [];

      const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');
      console.log(`[Download] Found ${cookies.length} cookies for authentication`);

      // Build headers with authentication
      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      };

      if (cookieString) {
        headers['Cookie'] = cookieString;
      }

      console.log(`[Download] Using ${cookieString ? 'authenticated' : 'unauthenticated'} request`);

      const request = https.get(url, { headers, timeout: 30000 }, (response) => {
      console.log(`[Download] Response status: ${response.statusCode}`);
      console.log(`[Download] Content-Type: ${response.headers['content-type']}`);

      // Check for HTTP errors
      if (response.statusCode && response.statusCode >= 400) {
        fs.unlink(tempBundlePath, () => {});
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
        return;
      }

      // Check for JSON error responses (API errors)
      const contentType = response.headers['content-type'] || '';
      if (contentType.includes('application/json')) {
        let errorData = '';
        response.on('data', (chunk) => {
          errorData += chunk.toString();
        });
        response.on('end', () => {
          fs.unlink(tempBundlePath, () => {});
          try {
            const error = JSON.parse(errorData);
            reject(new Error(`API Error: ${error.error || error.message || JSON.stringify(error)}`));
          } catch {
            reject(new Error(`API returned JSON instead of file: ${errorData.substring(0, 200)}`));
          }
        });
        return;
      }

      const totalSize = parseInt(response.headers['content-length'] || '0', 10);
      let downloadedSize = 0;

      console.log(`[Download] Total size: ${totalSize} bytes`);

      response.on('data', (chunk) => {
        downloadedSize += chunk.length;
        if (totalSize > 0) {
          event.sender.send('fs:downloadFile:progress', downloadedSize, totalSize);
        }
      });

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        console.log(`[Download] Completed. File size: ${downloadedSize} bytes`);

        // Verify file isn't too small (likely an error)
        if (downloadedSize < 1000) {
          console.warn(`[Download] File is very small (${downloadedSize} bytes), may be an error response`);
          fs.unlink(tempBundlePath, () => {});
          reject(new Error('Downloaded file is suspiciously small - may be an error response'));
          return;
        }

        // Rename temp file to final destination
        try {
          fs.renameSync(tempBundlePath, bundlePath);
          console.log(`[Download] Renamed temp file to: ${bundlePath}`);
          resolve(bundlePath);
        } catch (renameError) {
          const errorMsg = renameError instanceof Error ? renameError.message : 'Unknown error';
          console.error(`[Download] Failed to rename file: ${errorMsg}`);
          fs.unlink(tempBundlePath, () => {});
          reject(new Error(`Failed to finalize download: ${errorMsg}`));
        }
      });

      file.on('error', (err) => {
        console.error(`[Download] File write error: ${err.message}`);
        console.error(`[Download] File write error code: ${(err as any).code}`);
        console.error(`[Download] File write error errno: ${(err as any).errno}`);
        fs.unlink(tempBundlePath, () => {}); // Delete the temp file on error
        reject(new Error(`File write error (${(err as any).code}): ${err.message}`));
      });
    });

    request.on('error', (err) => {
      console.error(`[Download] Request error: ${err.message}`);
      fs.unlink(tempBundlePath, () => {}); // Delete the temp file on error
      reject(err);
    });

    request.on('timeout', () => {
      console.error('[Download] Request timeout');
      request.destroy();
      fs.unlink(tempBundlePath, () => {}); // Delete the temp file on timeout
      reject(new Error('Download timeout - file is too large or server is slow'));
    });
    } catch (cookieError) {
      console.error(`[Download] Cookie/request setup error: ${cookieError instanceof Error ? cookieError.message : 'Unknown error'}`);
      fs.unlink(tempBundlePath, () => {});
      reject(new Error(`Failed to set up authenticated request: ${cookieError instanceof Error ? cookieError.message : 'Unknown error'}`));
    }
  });
});

// Native Electron download using session (more reliable for auth)
ipcMain.handle('fs:downloadFileNative', async (event, url: string, avatarId: string) => {
  if (process.platform !== 'win32') {
    throw new Error('Avatar downloads only supported on Windows');
  }

  console.log(`[NativeDownload] Starting native download from: ${url}`);

  const bundleDir = path.join(app.getPath('userData'), 'AvatarBundles', avatarId);
  console.log(`[NativeDownload] Bundle directory: ${bundleDir}`);

  // Ensure directory exists
  try {
    if (!fs.existsSync(bundleDir)) {
      fs.mkdirSync(bundleDir, { recursive: true });
      console.log(`[NativeDownload] Created directory: ${bundleDir}`);
    }
  } catch (mkdirError) {
    const errorMsg = mkdirError instanceof Error ? mkdirError.message : 'Unknown error';
    console.error(`[NativeDownload] Failed to create directory: ${errorMsg}`);
    throw new Error(`Cannot create bundle directory: ${errorMsg}`);
  }

  // Extract filename
  let fileName: string;
  try {
    const urlWithoutQuery = url.split('?')[0];
    const pathParts = urlWithoutQuery.split('/');
    const lastPart = pathParts[pathParts.length - 1];

    if (lastPart && lastPart.includes('.')) {
      fileName = lastPart;
    } else {
      fileName = `avatar-${avatarId}.unitypackage`;
    }

    fileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  } catch (err) {
    fileName = `avatar-${avatarId}.unitypackage`;
  }

  const bundlePath = path.join(bundleDir, fileName);
  console.log(`[NativeDownload] Target path: ${bundlePath}`);

  return new Promise((resolve, reject) => {
    if (!mainWindow) {
      reject(new Error('Main window not available'));
      return;
    }

    // Use Electron's native download which respects cookies and session
    console.log(`[NativeDownload] Using Electron session download`);

    mainWindow.webContents.downloadURL(url);

    // Listen for download completion
    const handleDownloadUpdated = (downloadItem: any) => {
      const downloadPath = downloadItem.getFilename();

      console.log(`[NativeDownload] Download item path: ${downloadPath}`);
      console.log(`[NativeDownload] Download state: ${downloadItem.getState()}`);

      if (downloadItem.getState() === 'completed') {
        console.log(`[NativeDownload] Download completed from ${downloadPath}`);

        // Move downloaded file to our bundle directory
        try {
          const srcPath = downloadItem.getSavePath();
          if (srcPath && fs.existsSync(srcPath)) {
            // Copy instead of move to avoid conflicts
            fs.copyFileSync(srcPath, bundlePath);
            console.log(`[NativeDownload] Copied file to: ${bundlePath}`);
            mainWindow?.webContents.session.removeListener('will-download', handleDownloadUpdated);
            resolve(bundlePath);
          } else {
            reject(new Error(`Downloaded file not found at: ${srcPath}`));
          }
        } catch (copyError) {
          const errorMsg = copyError instanceof Error ? copyError.message : 'Unknown error';
          console.error(`[NativeDownload] Failed to copy file: ${errorMsg}`);
          mainWindow?.webContents.session.removeListener('will-download', handleDownloadUpdated);
          reject(new Error(`Failed to save downloaded file: ${errorMsg}`));
        }
      } else if (downloadItem.getState() === 'cancelled' || downloadItem.getState() === 'interrupted') {
        console.error(`[NativeDownload] Download ${downloadItem.getState()}`);
        mainWindow?.webContents.session.removeListener('will-download', handleDownloadUpdated);
        reject(new Error(`Download ${downloadItem.getState()}`));
      }
    };

    mainWindow.webContents.session.on('will-download', (event, downloadItem) => {
      console.log(`[NativeDownload] Download starting: ${downloadItem.getFilename()}`);

      // Set the save path to a temp location
      const tempPath = path.join(bundleDir, `temp-${Date.now()}.unitypackage`);
      downloadItem.setSavePath(tempPath);

      downloadItem.on('done', (event, state) => {
        console.log(`[NativeDownload] Download done with state: ${state}`);

        if (state === 'completed') {
          try {
            fs.copyFileSync(tempPath, bundlePath);
            fs.unlinkSync(tempPath);
            console.log(`[NativeDownload] File saved to: ${bundlePath}`);
            resolve(bundlePath);
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Unknown error';
            console.error(`[NativeDownload] Failed to finalize: ${errorMsg}`);
            reject(new Error(`Failed to save file: ${errorMsg}`));
          }
        } else {
          reject(new Error(`Download failed with state: ${state}`));
        }
      });
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      reject(new Error('Download timeout after 5 minutes'));
    }, 5 * 60 * 1000);
  });
});

/**
 * Build a GNU tar header (512 bytes) for a single entry.
 * Uses the old-style GNU/ustar format that Unity's importer can read.
 */
function buildTarHeader(fileName: string, fileSize: number, isDir: boolean): Buffer {
  const header = Buffer.alloc(512, 0);
  const mtime = Math.floor(Date.now() / 1000);

  // name (0, 100) - use forward slashes, must end with / for dirs
  const name = isDir ? fileName + '/' : fileName;
  header.write(name, 0, Math.min(name.length, 100), 'utf8');

  // mode (100, 8) - octal, null-terminated
  header.write(isDir ? '0000755' : '0000644', 100, 7, 'utf8');
  header[107] = 0;

  // uid (108, 8)
  header.write('0001750', 108, 7, 'utf8');
  header[115] = 0;

  // gid (116, 8)
  header.write('0001750', 116, 7, 'utf8');
  header[123] = 0;

  // size (124, 12) - octal, null-terminated
  const sizeStr = fileSize.toString(8).padStart(11, '0');
  header.write(sizeStr, 124, 11, 'utf8');
  header[135] = 0;

  // mtime (136, 12) - octal, null-terminated
  const mtimeStr = mtime.toString(8).padStart(11, '0');
  header.write(mtimeStr, 136, 11, 'utf8');
  header[147] = 0;

  // typeflag (156, 1) - '5' for directory, '0' for regular file
  header[156] = isDir ? 0x35 : 0x30;

  // magic (257, 6) - "ustar\0" for POSIX/GNU
  header.write('ustar', 257, 5, 'utf8');
  header[262] = 0;

  // version (263, 2) - "00"
  header.write('00', 263, 2, 'utf8');

  // uname (265, 32)
  header.write('root', 265, 4, 'utf8');

  // gname (297, 32)
  header.write('root', 297, 4, 'utf8');

  // Compute checksum: sum of all bytes with checksum field treated as spaces
  // First fill checksum field (148-155) with spaces for calculation
  for (let i = 148; i < 156; i++) header[i] = 0x20;
  let checksum = 0;
  for (let i = 0; i < 512; i++) checksum += header[i];
  // Write checksum as 6-digit octal + null + space
  const csStr = checksum.toString(8).padStart(6, '0');
  header.write(csStr, 148, 6, 'utf8');
  header[154] = 0;
  header[155] = 0x20;

  return header;
}

/**
 * Pad data to a 512-byte boundary for tar format.
 */
function tarPad(dataLength: number): Buffer {
  const remainder = dataLength % 512;
  if (remainder === 0) return Buffer.alloc(0);
  return Buffer.alloc(512 - remainder, 0);
}

/**
 * Create a valid .unitypackage (tar.gz) from a raw AssetBundle file.
 * Uses manual GNU tar construction for maximum Unity compatibility.
 *
 * Includes:
 *   - The raw AssetBundle as Assets/Avatar/<id>.vrca
 *   - A Unity Editor script that loads and extracts assets from the bundle
 */
async function createUnityPackage(sourcePath: string, avatarId: string, outputPath: string): Promise<void> {
  const bundleGuid = crypto.randomBytes(16).toString('hex');
  const scriptGuid = crypto.randomBytes(16).toString('hex');
  logDiagnostic(`[UnityPackage] Bundle GUID: ${bundleGuid}`);
  logDiagnostic(`[UnityPackage] Script GUID: ${scriptGuid}`);

  // Read the source asset bundle
  const assetData = fs.readFileSync(sourcePath);
  logDiagnostic(`[UnityPackage] Asset size: ${assetData.length} bytes`);

  // --- Asset 1: The raw bundle file ---
  const bundlePathname = Buffer.from(`Assets/Avatar/${avatarId}.vrca`);
  const bundleMeta = Buffer.from(
    `fileFormatVersion: 2\nguid: ${bundleGuid}\nDefaultImporter:\n  userData:\n  assetBundleName:\n  assetBundleVariant:\n`
  );

  // --- Asset 2: Unity Editor script to load the AssetBundle ---
  const safeAvatarId = avatarId.replace(/[^a-zA-Z0-9_]/g, '_');

  // Read the bundle header to extract the Unity version it was built with
  const bundleHeader = fs.readFileSync(sourcePath, { encoding: null });
  let bundleUnityVersion = 'unknown';
  // UnityFS header: "UnityFS\0" + 4 bytes version + version string + engine string
  if (bundleHeader.slice(0, 7).toString('utf8') === 'UnityFS') {
    // Skip "UnityFS\0" (8 bytes) + 4 bytes (format version)
    // Then read null-terminated strings: player version, then engine version
    let offset = 12;
    // Skip player version string
    while (offset < bundleHeader.length && bundleHeader[offset] !== 0) offset++;
    offset++; // skip null
    // Read engine version string
    let engineVer = '';
    while (offset < bundleHeader.length && bundleHeader[offset] !== 0) {
      engineVer += String.fromCharCode(bundleHeader[offset]);
      offset++;
    }
    if (engineVer) bundleUnityVersion = engineVer;
  }
  logDiagnostic(`[UnityPackage] Bundle built with Unity: ${bundleUnityVersion}`);

  const editorScript = Buffer.from(`using UnityEngine;
using UnityEditor;
using System.IO;
using System.Text;
using System.IO.Compression;

/// <summary>
/// VRC Studio - AssetBundle Loader
/// Bundle was built with Unity ${bundleUnityVersion}
///
/// Uses in-memory version patching to bypass Unity's strict version check.
/// VRChat builds bundles with a custom Unity fork that doesn't match
/// any public release, so we patch the version header before loading.
/// </summary>
public class VRCStudioBundleLoader : EditorWindow
{
    /// <summary>
    /// Reads the .vrca file, patches the Unity version in the header to match
    /// the current editor, then loads via AssetBundle.LoadFromMemory().
    /// This bypasses the "wrong version or build target" error.
    /// </summary>
    static AssetBundle LoadBundleWithVersionPatch(string bundlePath)
    {
        // Fast path: attempt unmodified load first
        AssetBundle directBundle = AssetBundle.LoadFromFile(bundlePath);
        if (directBundle != null)
        {
            Debug.Log("[VRC Studio] Bundle loaded directly without patch.");
            return directBundle;
        }

        byte[] data = File.ReadAllBytes(bundlePath);
        Debug.Log("[VRC Studio] Read " + data.Length + " bytes from: " + bundlePath);

        // If this is gzip-wrapped data, try to decompress first.
        if (data.Length > 2 && data[0] == 0x1f && data[1] == 0x8b)
        {
            try
            {
                using (MemoryStream input = new MemoryStream(data))
                using (GZipStream gzip = new GZipStream(input, CompressionMode.Decompress))
                using (MemoryStream output = new MemoryStream())
                {
                    gzip.CopyTo(output);
                    data = output.ToArray();
                    Debug.Log("[VRC Studio] Decompressed gzip wrapper, new size: " + data.Length + " bytes");
                }
            }
            catch (System.Exception e)
            {
                Debug.LogWarning("[VRC Studio] Gzip decompress attempt failed: " + e.Message);
            }
        }

        // Verify it's a UnityFS bundle. Some cache files can have leading bytes,
        // so search for UnityFS marker and trim to that offset when found.
        int unityFsOffset = -1;
        for (int i = 0; i <= data.Length - 7; i++)
        {
            if (data[i] == (byte)'U' && data[i + 1] == (byte)'n' && data[i + 2] == (byte)'i' &&
                data[i + 3] == (byte)'t' && data[i + 4] == (byte)'y' && data[i + 5] == (byte)'F' &&
                data[i + 6] == (byte)'S')
            {
                unityFsOffset = i;
                break;
            }
        }

        if (unityFsOffset < 0)
        {
            Debug.LogError("[VRC Studio] Could not find UnityFS marker in bundle bytes.");
            return null;
        }

        if (unityFsOffset > 0)
        {
            byte[] trimmed = new byte[data.Length - unityFsOffset];
            System.Array.Copy(data, unityFsOffset, trimmed, 0, trimmed.Length);
            data = trimmed;
            Debug.Log("[VRC Studio] Trimmed " + unityFsOffset + " leading bytes before UnityFS header.");
        }

        // Parse the header to find the engine version string
        // Format: "UnityFS\\0" (8) + uint32 format (4) + playerVer\\0 + engineVer\\0
        int offset = 12;

        // Skip player version (null-terminated)
        while (offset < data.Length && data[offset] != 0) offset++;
        offset++; // skip null terminator

        // Read the engine version string
        int engineVerStart = offset;
        while (offset < data.Length && data[offset] != 0) offset++;
        int engineVerEnd = offset; // position of the null terminator

        string originalVersion = Encoding.UTF8.GetString(data, engineVerStart, engineVerEnd - engineVerStart);
        int versionFieldLen = engineVerEnd - engineVerStart; // length WITHOUT null

        Debug.Log("[VRC Studio] Original bundle version: " + originalVersion);
        Debug.Log("[VRC Studio] Your Unity version: " + Application.unityVersion);

        // VRChat bundles often report 2022.3.22f2-* while Creator Companion supports 2022.3.22f1.
        // Force that exact base version and preserve any custom suffix (e.g. "-DWR")
        // so header length/structure remains stable.
        string patchBaseVersion = "2022.3.22f1";
        string targetVersion = patchBaseVersion;
        int dashIndex = originalVersion.IndexOf('-');
        if (dashIndex >= 0 && dashIndex < originalVersion.Length - 1)
        {
            targetVersion = patchBaseVersion + originalVersion.Substring(dashIndex);
        }

        Debug.Log("[VRC Studio] Target patch version: " + targetVersion);

        // Overwrite only the START of the engine version and leave any remaining
        // original suffix bytes intact. Never write null padding here.
        byte[] verBytes = Encoding.UTF8.GetBytes(targetVersion);
        int copyLen = System.Math.Min(verBytes.Length, versionFieldLen);
        System.Array.Copy(verBytes, 0, data, engineVerStart, copyLen);

        string patchedVersion = Encoding.UTF8.GetString(data, engineVerStart, versionFieldLen).TrimEnd('\\0');
        Debug.Log("[VRC Studio] Patched version: " + patchedVersion);

        // Also patch any additional exact header/version occurrences we can find
        // without changing total byte lengths.
        if (!string.IsNullOrEmpty(originalVersion) && originalVersion != targetVersion)
        {
            byte[] originalBytes = Encoding.UTF8.GetBytes(originalVersion);
            int maxReplacements = 8;
            int replacements = 0;
            for (int i = 0; i <= data.Length - originalBytes.Length && replacements < maxReplacements; i++)
            {
                bool match = true;
                for (int j = 0; j < originalBytes.Length; j++)
                {
                    if (data[i + j] != originalBytes[j])
                    {
                        match = false;
                        break;
                    }
                }

                if (match)
                {
                    int replaceLen = System.Math.Min(verBytes.Length, originalBytes.Length);
                    System.Array.Copy(verBytes, 0, data, i, replaceLen);
                    replacements++;
                    i += originalBytes.Length - 1;
                }
            }
            Debug.Log("[VRC Studio] Additional version string replacements: " + replacements);
        }

        // Try loading from patched memory first
        AssetBundle bundle = AssetBundle.LoadFromMemory(data);
        if (bundle == null)
        {
            // Fallback: write patched bytes to a temp bundle and load from file path.
            // Some Unity versions handle large bundles more reliably via file IO APIs.
            try
            {
                string tempPath = Path.Combine(Path.GetTempPath(),
                    "vrcstudio_patched_" + Path.GetFileName(bundlePath));
                File.WriteAllBytes(tempPath, data);
                Debug.Log("[VRC Studio] Memory load failed, retrying from temp file: " + tempPath);
                bundle = AssetBundle.LoadFromFile(tempPath);
            }
            catch (System.Exception e)
            {
                Debug.LogWarning("[VRC Studio] Temp file fallback failed: " + e.Message);
            }
        }

        if (bundle != null)
        {
            Debug.Log("[VRC Studio] Bundle loaded successfully with version patch!");
        }
        else
        {
            Debug.LogError("[VRC Studio] Bundle still failed to load after version patch.");
            Debug.LogError("[VRC Studio] This may be a build target issue. Current target: " +
                EditorUserBuildSettings.activeBuildTarget);
        }

        return bundle;
    }

    [MenuItem("VRC Studio/Load Avatar Into Scene")]
    static void LoadIntoScene()
    {
        string bundlePath = FindBundleFile();
        if (string.IsNullOrEmpty(bundlePath))
        {
            EditorUtility.DisplayDialog("VRC Studio",
                "Could not find .vrca bundle file.\\nMake sure it was imported correctly.", "OK");
            return;
        }

        AssetBundle bundle = LoadBundleWithVersionPatch(bundlePath);
        if (bundle == null)
        {
            string bundleInfo = ReadBundleInfo(bundlePath);
            EditorUtility.DisplayDialog("VRC Studio - Load Failed",
                "Failed to load AssetBundle even after version patching.\\n\\n"
                + bundleInfo + "\\n\\n"
                + "Make sure your build target is PC Standalone:\\n"
                + "File > Build Settings > PC, Mac & Linux Standalone\\n\\n"
                + "If this still fails, try AssetRipper:\\n"
                + "github.com/AssetRipper/AssetRipper", "OK");
            return;
        }

        // Try to load the main avatar prefab
        GameObject[] prefabs = bundle.LoadAllAssets<GameObject>();
        if (prefabs.Length > 0)
        {
            foreach (GameObject prefab in prefabs)
            {
                GameObject instance = Instantiate(prefab);
                instance.name = prefab.name;
                Undo.RegisterCreatedObjectUndo(instance, "Load VRC Avatar");
                Selection.activeGameObject = instance;
                Debug.Log("[VRC Studio] Loaded avatar: " + prefab.name);
            }
            EditorUtility.DisplayDialog("VRC Studio",
                "Avatar loaded into scene!\\nCheck the Hierarchy window.", "OK");
        }
        else
        {
            Object[] allAssets = bundle.LoadAllAssets();
            string assetList = "Found " + allAssets.Length + " assets:\\n";
            foreach (Object a in allAssets)
                assetList += "  - " + a.name + " (" + a.GetType().Name + ")\\n";

            EditorUtility.DisplayDialog("VRC Studio",
                "No GameObjects found, but found other assets:\\n\\n" + assetList, "OK");
        }

        bundle.Unload(false);
    }

    [MenuItem("VRC Studio/Extract All Assets From Bundle")]
    static void ExtractAll()
    {
        string bundlePath = FindBundleFile();
        if (string.IsNullOrEmpty(bundlePath))
        {
            EditorUtility.DisplayDialog("VRC Studio",
                "Could not find .vrca bundle file.", "OK");
            return;
        }

        AssetBundle bundle = LoadBundleWithVersionPatch(bundlePath);
        if (bundle == null)
        {
            string bundleInfo = ReadBundleInfo(bundlePath);
            EditorUtility.DisplayDialog("VRC Studio - Load Failed",
                "Failed to load AssetBundle.\\n\\n" + bundleInfo + "\\n\\n"
                + "Try AssetRipper instead:\\nhttps://github.com/AssetRipper/AssetRipper", "OK");
            return;
        }

        string outputDir = "Assets/VRCStudio_Extracted";
        if (!Directory.Exists(outputDir))
            Directory.CreateDirectory(outputDir);

        Object[] allAssets = bundle.LoadAllAssets();
        int count = 0;

        foreach (Object asset in allAssets)
        {
            try
            {
                string safeName = asset.name.Replace("/", "_").Replace("\\\\", "_");
                if (string.IsNullOrEmpty(safeName)) safeName = "asset_" + count;

                if (asset is GameObject go)
                {
                    string path = outputDir + "/" + safeName + ".prefab";
                    PrefabUtility.SaveAsPrefabAsset(Instantiate(go), path);
                    count++;
                }
                else if (asset is Texture2D tex)
                {
                    byte[] png = tex.EncodeToPNG();
                    if (png != null)
                    {
                        File.WriteAllBytes(outputDir + "/" + safeName + ".png", png);
                        count++;
                    }
                }
                else if (asset is Mesh || asset is Material || asset is AnimationClip ||
                         asset is RuntimeAnimatorController || asset is Avatar)
                {
                    Object copy = Instantiate(asset);
                    copy.name = asset.name;
                    AssetDatabase.CreateAsset(copy, outputDir + "/" + safeName + ".asset");
                    count++;
                }

                Debug.Log("[VRC Studio] Extracted: " + asset.name + " (" + asset.GetType().Name + ")");
            }
            catch (System.Exception e)
            {
                Debug.LogWarning("[VRC Studio] Failed to extract " + asset.name + ": " + e.Message);
            }
        }

        bundle.Unload(false);
        AssetDatabase.Refresh();

        EditorUtility.DisplayDialog("VRC Studio",
            "Extracted " + count + " of " + allAssets.Length + " assets to:\\n" + outputDir, "OK");

        Object folder = AssetDatabase.LoadAssetAtPath<Object>(outputDir);
        if (folder != null) Selection.activeObject = folder;
    }

    [MenuItem("VRC Studio/Show Bundle Info")]
    static void ShowInfo()
    {
        string bundlePath = FindBundleFile();
        if (string.IsNullOrEmpty(bundlePath))
        {
            EditorUtility.DisplayDialog("VRC Studio", "No .vrca file found.", "OK");
            return;
        }

        string info = ReadBundleInfo(bundlePath);
        info += "\\n\\nYour Unity: " + Application.unityVersion;
        info += "\\nYour Platform: " + EditorUserBuildSettings.activeBuildTarget;
        info += "\\n\\nBundle built with: ${bundleUnityVersion}";
        info += "\\nBundle platform: Windows (StandaloneWindows64)";
        info += "\\n\\nThe loader will auto-patch the version when loading.";

        EditorUtility.DisplayDialog("VRC Studio - Bundle Info", info, "OK");
    }

    static string ReadBundleInfo(string filePath)
    {
        try
        {
            using (FileStream fs = new FileStream(filePath, FileMode.Open, FileAccess.Read))
            {
                byte[] header = new byte[64];
                fs.Read(header, 0, header.Length);

                StringBuilder sb = new StringBuilder();
                sb.AppendLine("File: " + Path.GetFileName(filePath));
                sb.AppendLine("Size: " + (new FileInfo(filePath).Length / 1024 / 1024) + " MB");

                // Check for UnityFS magic
                string magic = Encoding.UTF8.GetString(header, 0, 7);
                if (magic == "UnityFS")
                {
                    sb.AppendLine("Format: UnityFS AssetBundle");
                    // Read version strings (null-terminated after offset 12)
                    int offset = 12;
                    string playerVer = "";
                    while (offset < header.Length && header[offset] != 0)
                        playerVer += (char)header[offset++];
                    offset++;
                    string engineVer = "";
                    while (offset < header.Length && header[offset] != 0)
                        engineVer += (char)header[offset++];
                    sb.AppendLine("Player version: " + playerVer);
                    sb.AppendLine("Engine version: " + engineVer);
                }
                else
                {
                    sb.AppendLine("Format: Unknown (not UnityFS)");
                    sb.AppendLine("Header hex: " + System.BitConverter.ToString(header, 0, 16));
                }
                return sb.ToString();
            }
        }
        catch (System.Exception e)
        {
            return "Error reading bundle: " + e.Message;
        }
    }

    static string FindBundleFile()
    {
        // Search for .vrca files in Assets/Avatar
        string[] guids = AssetDatabase.FindAssets("", new[] { "Assets/Avatar" });
        foreach (string guid in guids)
        {
            string p = AssetDatabase.GUIDToAssetPath(guid);
            if (p.EndsWith(".vrca")) return Path.GetFullPath(p);
        }

        // Fallback: search entire Assets folder
        string[] files = Directory.GetFiles(Application.dataPath, "*.vrca", SearchOption.AllDirectories);
        if (files.Length > 0) return files[0];

        return null;
    }
}
`);

  const scriptPathname = Buffer.from(`Assets/Editor/VRCStudioBundleLoader.cs`);
  const scriptMeta = Buffer.from(
    `fileFormatVersion: 2\nguid: ${scriptGuid}\nMonoImporter:\n  serializedVersion: 2\n  defaultReferences: []\n  executionOrder: 0\n  icon: {instanceID: 0}\n  userData:\n  assetBundleName:\n  assetBundleVariant:\n`
  );

  // Build tar archive in memory
  const parts: Buffer[] = [];

  // --- Bundle asset entry ---
  parts.push(buildTarHeader(bundleGuid, 0, true));

  parts.push(buildTarHeader(`${bundleGuid}/pathname`, bundlePathname.length, false));
  parts.push(bundlePathname);
  parts.push(tarPad(bundlePathname.length));

  parts.push(buildTarHeader(`${bundleGuid}/asset`, assetData.length, false));
  parts.push(assetData);
  parts.push(tarPad(assetData.length));

  parts.push(buildTarHeader(`${bundleGuid}/asset.meta`, bundleMeta.length, false));
  parts.push(bundleMeta);
  parts.push(tarPad(bundleMeta.length));

  // --- Editor script entry ---
  parts.push(buildTarHeader(scriptGuid, 0, true));

  parts.push(buildTarHeader(`${scriptGuid}/pathname`, scriptPathname.length, false));
  parts.push(scriptPathname);
  parts.push(tarPad(scriptPathname.length));

  parts.push(buildTarHeader(`${scriptGuid}/asset`, editorScript.length, false));
  parts.push(editorScript);
  parts.push(tarPad(editorScript.length));

  parts.push(buildTarHeader(`${scriptGuid}/asset.meta`, scriptMeta.length, false));
  parts.push(scriptMeta);
  parts.push(tarPad(scriptMeta.length));

  // End-of-archive marker (two 512-byte zero blocks)
  parts.push(Buffer.alloc(1024, 0));

  const tarData = Buffer.concat(parts);
  logDiagnostic(`[UnityPackage] Tar size: ${tarData.length} bytes`);

  // Gzip compress
  const gzipAsync = promisify(zlib.gzip);
  const gzippedData = await gzipAsync(tarData, { level: 6 });
  logDiagnostic(`[UnityPackage] Gzipped size: ${gzippedData.length} bytes`);

  // Write final .unitypackage
  fs.writeFileSync(outputPath, gzippedData);

  // Verify the output starts with gzip magic bytes
  const verify = Buffer.alloc(2);
  const fd = fs.openSync(outputPath, 'r');
  fs.readSync(fd, verify, 0, 2, 0);
  fs.closeSync(fd);
  logDiagnostic(`[UnityPackage] Output magic: ${verify.toString('hex')} (expect 1f8b for gzip)`);
  logDiagnostic(`[UnityPackage] Created: ${outputPath} (${gzippedData.length} bytes)`);
}

// Detect file format by reading magic bytes (file signature)
function detectFileFormat(filePath: string): string {
  try {
    const buffer = Buffer.alloc(16);
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buffer, 0, 16);
    fs.closeSync(fd);

    // Magic bytes detection
    // ZIP: 50 4B 03 04 or 50 4B 05 06 or 50 4B 07 08
    if (buffer[0] === 0x50 && buffer[1] === 0x4b) {
      return 'ZIP';
    }
    // TAR.GZ: 1F 8B (gzip magic)
    if (buffer[0] === 0x1f && buffer[1] === 0x8b) {
      return 'TAR.GZ';
    }
    // TAR (ustar): 75 73 74 61 72 at offset 257
    if (buffer.toString('ascii', 257, 262) === 'ustar') {
      return 'TAR';
    }
    // 7z: 37 7A BC AF 27 1C
    if (buffer[0] === 0x37 && buffer[1] === 0x7a) {
      return '7z';
    }
    // GZIP only (not TAR): 1F 8B but check if it's compressed data
    if (buffer[0] === 0x1f && buffer[1] === 0x8b) {
      return 'GZIP';
    }

    // Unknown format - return hex dump for debugging
    const hexDump = buffer.toString('hex');
    return `UNKNOWN (${hexDump})`;
  } catch (error) {
    return `ERROR_DETECTING_FORMAT: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}

ipcMain.handle('fs:extractBundle', async (_e, sourcePath: string, avatarId: string) => {
  if (process.platform !== 'win32') {
    throw new Error('Avatar extraction only supported on Windows');
  }

  try {
    // Validate file exists and is readable
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Bundle file not found at ${sourcePath}`);
    }

    const stats = fs.statSync(sourcePath);
    if (stats.size === 0) {
      throw new Error('Downloaded bundle file is empty. The download may have failed.');
    }

    // Detect actual file format
    const detectedFormat = detectFileFormat(sourcePath);
    console.log(`[Bundle] Detected format: ${detectedFormat}, File size: ${stats.size} bytes`);
    logDiagnostic(`[ExtractBundle] Format: ${detectedFormat}, Size: ${stats.size} bytes`);

    const bundleDir = path.join(app.getPath('userData'), 'AvatarBundles', avatarId);
    fs.mkdirSync(bundleDir, { recursive: true });

    // Create a proper .unitypackage (tar.gz with GUID structure)
    const outputPath = path.join(bundleDir, `${avatarId}.unitypackage`);

    if (detectedFormat.includes('TAR.GZ') || detectedFormat.includes('GZIP')) {
      // Already looks like a valid tar.gz - could be a real .unitypackage, save as-is
      console.log('[Bundle] File is already gzip/tar.gz, saving directly as .unitypackage');
      logDiagnostic('[ExtractBundle] Already tar.gz, copying directly');
      fs.copyFileSync(sourcePath, outputPath);
    } else {
      // Raw UnityFS bundle, ZIP, or unknown - wrap in proper .unitypackage
      console.log('[Bundle] Wrapping raw bundle in .unitypackage tar.gz format...');
      logDiagnostic('[ExtractBundle] Creating .unitypackage from raw bundle');
      await createUnityPackage(sourcePath, avatarId, outputPath);
    }

    const outputSize = fs.statSync(outputPath).size;
    console.log(`[Bundle] .unitypackage created: ${outputPath} (${outputSize} bytes)`);
    logDiagnostic(`[ExtractBundle] Success: ${outputPath} (${outputSize} bytes)`);

    return outputPath;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Bundle] Error:', errorMsg);
    logDiagnostic(`[ExtractBundle] FAILED: ${errorMsg}`);
    throw new Error(`Failed to create .unitypackage: ${errorMsg}`);
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

ipcMain.handle('fs:openFileDialog', async (_e, options: any) => {
  if (!mainWindow) {
    throw new Error('Main window not available');
  }

  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: options.title || 'Select File',
      message: options.message,
      filters: options.filters || [{ name: 'All Files', extensions: ['*'] }],
      properties: ['openFile'],
    });

    return result;
  } catch (error) {
    throw new Error(`Failed to open file dialog: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
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
  initializeLogging();
  logDiagnostic('App ready - creating window');
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
