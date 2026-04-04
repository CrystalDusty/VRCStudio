import {
  app, BrowserWindow, ipcMain, shell, Tray, Menu, dialog,
  nativeImage, Notification, nativeTheme,
} from 'electron';
import path from 'path';
import fs from 'fs';
import https from 'https';
import tar from 'tar';

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
    console.log(`\n[ExtractToDownloads] ========== EXTRACTING BUNDLE ==========`);
    console.log(`[ExtractToDownloads] Source: ${cacheDataPath}`);

    // Verify cache file exists
    if (!fs.existsSync(cacheDataPath)) {
      throw new Error(`Cache file not found: ${cacheDataPath}`);
    }

    const cacheStats = fs.statSync(cacheDataPath);
    console.log(`[ExtractToDownloads] Source file size: ${cacheStats.size} bytes`);

    // Read first bytes to detect format
    const buffer = fs.readFileSync(cacheDataPath);
    const header = buffer.slice(0, 32).toString('hex');
    console.log(`[ExtractToDownloads] File header (first 32 bytes hex): ${header}`);

    // Detect file format
    let fileFormat = 'UNKNOWN';
    let isGzipped = false;
    let isUnityBundle = false;

    if (buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
      fileFormat = 'GZIP';
      isGzipped = true;
      console.log(`[ExtractToDownloads] ✓ Detected: GZIP (1f 8b)`);
    } else if (buffer.length >= 6 && buffer.toString('utf8', 0, 6) === 'UnityFS') {
      fileFormat = 'UNITY_BUNDLE';
      isUnityBundle = true;
      console.log(`[ExtractToDownloads] ✓ Detected: Unity AssetBundle`);
    } else if (buffer.length >= 4 && buffer.toString('utf8', 0, 2) === 'PK') {
      fileFormat = 'ZIP';
      console.log(`[ExtractToDownloads] ✓ Detected: ZIP (unitypackage)`);
    } else {
      console.log(`[ExtractToDownloads] ⚠ Unknown format, treating as raw data`);
    }

    // Get Downloads folder
    const downloadsPath = app.getPath('downloads');
    let outputPath: string;
    let finalBuffer = buffer;

    // Handle based on format
    if (isGzipped) {
      console.log(`[ExtractToDownloads] Attempting to decompress GZIP...`);
      const zlib = require('zlib');
      try {
        const decompressed = zlib.gunzipSync(buffer);
        console.log(`[ExtractToDownloads] ✓ GZIP decompression successful!`);
        console.log(`[ExtractToDownloads] Decompressed size: ${decompressed.length} bytes`);

        // Check decompressed format
        const decompHeader = decompressed.slice(0, 6).toString('utf8', 0, 6);
        if (decompHeader === 'UnityFS') {
          console.log(`[ExtractToDownloads] ✓ Decompressed to UnityFS bundle`);
          outputPath = path.join(downloadsPath, `${avatarId}.unitypackage`);
          finalBuffer = decompressed;
        } else {
          console.log(`[ExtractToDownloads] Decompressed data format: ${decompHeader || 'binary'}`);
          outputPath = path.join(downloadsPath, `${avatarId}.unitypackage`);
          finalBuffer = decompressed;
        }
      } catch (err: any) {
        console.error(`[ExtractToDownloads] ✗ GZIP decompression failed:`, err.message);
        outputPath = path.join(downloadsPath, `${avatarId}.bundle`);
        finalBuffer = buffer;
      }
    } else if (isUnityBundle) {
      console.log(`[ExtractToDownloads] Using Unity Bundle directly (no decompression needed)`);
      outputPath = path.join(downloadsPath, `${avatarId}.unitypackage`);
      finalBuffer = buffer;
    } else {
      console.log(`[ExtractToDownloads] Saving as raw bundle data`);
      outputPath = path.join(downloadsPath, `${avatarId}.bundle`);
      finalBuffer = buffer;
    }

    console.log(`[ExtractToDownloads] Target: ${outputPath}`);

    // Save the file
    fs.writeFileSync(outputPath, finalBuffer);

    const outputStats = fs.statSync(outputPath);
    console.log(`[ExtractToDownloads] ✓ File saved successfully`);
    console.log(`[ExtractToDownloads] Output file size: ${outputStats.size} bytes`);
    console.log(`[ExtractToDownloads] Output path: ${outputPath}`);

    if (outputStats.size === 0) {
      throw new Error('Output file is empty');
    }

    console.log(`[ExtractToDownloads] ========== EXTRACTION COMPLETE ==========\n`);
    return { success: true, path: outputPath, size: outputStats.size };
  } catch (err: any) {
    console.error(`[ExtractToDownloads] ✗ EXTRACTION FAILED:`, err.message);
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

// Search for _data files (avatar bundles) in VRChat cache
ipcMain.handle('fs:searchCacheForDataFiles', async (_e) => {
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
            console.log(`[SearchCache] ✓ FOUND BUNDLE: ${fullPath} (${stat.size} bytes)`);
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

    console.log(`[SearchCache] Search complete. Scanned ${scannedDirs} dirs, found ${foundPaths.length} bundle(s)`);

    return {
      success: true,
      bundles: foundPaths,
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

    const extractDir = path.join(app.getPath('userData'), 'AvatarBundles', avatarId, 'extracted');
    if (fs.existsSync(extractDir)) {
      fs.rmSync(extractDir, { recursive: true, force: true });
    }
    fs.mkdirSync(extractDir, { recursive: true });

    let extractionSuccess = false;
    let lastError: Error | null = null;

    // Try different extraction methods based on detected format
    if (detectedFormat.includes('ZIP')) {
      try {
        console.log('[Bundle] Attempting ZIP extraction...');
        const AdmZip = await import('adm-zip').then(m => m.default);
        const zip = new AdmZip(sourcePath);
        zip.extractAllTo(extractDir, true);
        extractionSuccess = true;
        console.log('[Bundle] ZIP extraction successful');
      } catch (zipError) {
        lastError = zipError instanceof Error ? zipError : new Error(String(zipError));
        console.log('[Bundle] ZIP extraction failed:', lastError.message);
      }
    }

    // Try TAR.GZ extraction
    if (!extractionSuccess && (detectedFormat.includes('TAR.GZ') || detectedFormat.includes('GZIP'))) {
      try {
        console.log('[Bundle] Attempting TAR.GZ extraction...');
        await tar.x({
          file: sourcePath,
          cwd: extractDir,
          gzip: true,
          strip: 1,
        });
        extractionSuccess = true;
        console.log('[Bundle] TAR.GZ extraction successful');
      } catch (tarError) {
        lastError = tarError instanceof Error ? tarError : new Error(String(tarError));
        console.log('[Bundle] TAR.GZ extraction failed:', lastError.message);
      }
    }

    // Try plain TAR extraction
    if (!extractionSuccess && detectedFormat.includes('TAR')) {
      try {
        console.log('[Bundle] Attempting TAR extraction...');
        await tar.x({
          file: sourcePath,
          cwd: extractDir,
          strip: 1,
        });
        extractionSuccess = true;
        console.log('[Bundle] TAR extraction successful');
      } catch (tarError) {
        lastError = tarError instanceof Error ? tarError : new Error(String(tarError));
        console.log('[Bundle] TAR extraction failed:', lastError.message);
      }
    }

    // If detected format failed, try all formats as fallback
    if (!extractionSuccess) {
      console.log('[Bundle] Trying all extraction methods as fallback...');

      // Try TAR without gzip
      try {
        console.log('[Bundle] Fallback: Attempting TAR extraction...');
        await tar.x({
          file: sourcePath,
          cwd: extractDir,
          strict: false, // Be lenient with TAR format
        });
        extractionSuccess = true;
        console.log('[Bundle] Fallback TAR extraction successful');
      } catch (e) {
        console.log('[Bundle] Fallback TAR failed');
      }

      // Try TAR with gzip
      if (!extractionSuccess) {
        try {
          console.log('[Bundle] Fallback: Attempting TAR.GZ extraction...');
          await tar.x({
            file: sourcePath,
            cwd: extractDir,
            gzip: true,
            strict: false,
          });
          extractionSuccess = true;
          console.log('[Bundle] Fallback TAR.GZ extraction successful');
        } catch (e) {
          console.log('[Bundle] Fallback TAR.GZ failed');
        }
      }

      // Try ZIP as last resort
      if (!extractionSuccess) {
        try {
          console.log('[Bundle] Fallback: Attempting ZIP extraction...');
          const AdmZip = await import('adm-zip').then(m => m.default);
          const zip = new AdmZip(sourcePath);
          zip.extractAllTo(extractDir, true);
          extractionSuccess = true;
          console.log('[Bundle] Fallback ZIP extraction successful');
        } catch (e) {
          console.log('[Bundle] Fallback ZIP failed');
        }
      }
    }

    // Check if extraction was successful
    if (!extractionSuccess) {
      const errorMsg = lastError?.message || 'Unknown extraction error';
      throw new Error(
        `Failed to extract bundle: Could not extract file. ` +
        `Detected format: ${detectedFormat}. ` +
        `File size: ${stats.size} bytes. ` +
        `Error: ${errorMsg}`
      );
    }

    // Verify extraction was successful
    const extractedFiles = fs.readdirSync(extractDir);
    if (extractedFiles.length === 0) {
      throw new Error(
        'Bundle extracted but no files found. The bundle may be corrupted or in an unexpected format.'
      );
    }

    console.log(`[Bundle] Extraction complete. Extracted ${extractedFiles.length} items.`);
    return extractDir;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Bundle] Extraction error:', errorMsg);
    throw new Error(`Failed to extract bundle: ${errorMsg}`);
  }
});

ipcMain.handle('fs:openBundleFolder', async (_e, folderPath: string) => {
  if (process.platform !== 'win32') {
    throw new Error('Bundle folder open only supported on Windows');
  }

  try {
    if (!fs.existsSync(folderPath)) {
      throw new Error('Folder does not exist');
    }
    shell.openPath(folderPath);
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
