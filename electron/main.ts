import {
  app, BrowserWindow, ipcMain, shell, Tray, Menu, dialog,
  nativeImage, Notification, nativeTheme,
} from 'electron';
import path from 'path';
import fs from 'fs';
import https from 'https';
import tar from 'tar';
import crypto from 'crypto';
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

const UNITY_BUNDLE_SIGNATURE = 'UnityFS';
// VRChat uses custom Unity builds - we patch to the public VCC Unity version
const TARGET_UNITY_VERSION = '2022.3.22f1';
// Known VRChat Unity versions that need patching
const VRCHAT_UNITY_VERSIONS = [
  '2022.3.22f2',  // Most common VRChat version
  '2022.3.22f3',
  '2022.3.6f1',
  '2019.4.31f1',
  '2019.4.40f1',
];

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

function writeNullTerminatedString(buffer: Buffer, offset: number, value: string, maxLength: number): number {
  const bytes = Buffer.from(value, 'utf8');
  const writeLength = Math.min(bytes.length, maxLength - 1); // Leave room for null terminator
  bytes.copy(buffer, offset, 0, writeLength);
  // Null-terminate and pad remaining space with nulls
  for (let i = writeLength; i < maxLength; i++) {
    buffer[offset + i] = 0;
  }
  return offset + maxLength;
}

/**
 * Comprehensive Unity version patching for VRChat bundles
 * Patches the engine version in UnityFS header to make it loadable in public Unity
 */
function patchUnityFsEngineVersion(bundleBytes: Buffer, forceVersion?: string): { 
  patchedBytes: Buffer; 
  patched: boolean; 
  originalVersion?: string; 
  patchedVersion?: string;
  details?: string;
} {
  const patchedBytes = Buffer.from(bundleBytes);
  const targetVersion = forceVersion || TARGET_UNITY_VERSION;
  
  // Check for UnityFS signature
  const signature = readNullTerminatedString(patchedBytes, 0);
  if (signature.value !== UNITY_BUNDLE_SIGNATURE) {
    logDiagnostic(`[VersionPatch] Not a UnityFS bundle (signature: ${signature.value})`);
    return { patchedBytes, patched: false, details: `Not a UnityFS bundle (got: ${signature.value})` };
  }

  // Parse UnityFS header structure:
  // [signature]\0[format_version]\0[player_version]\0[engine_version]\0...
  const formatVersion = readNullTerminatedString(patchedBytes, signature.nextOffset);
  const playerVersion = readNullTerminatedString(patchedBytes, formatVersion.nextOffset);
  const engineVersionStartOffset = playerVersion.nextOffset;
  const engineVersion = readNullTerminatedString(patchedBytes, engineVersionStartOffset);
  const originalVersion = engineVersion.value;
  const originalVersionLength = engineVersion.nextOffset - engineVersionStartOffset; // includes null terminator

  logDiagnostic(`[VersionPatch] UnityFS Header Analysis:`);
  logDiagnostic(`  Signature: ${signature.value}`);
  logDiagnostic(`  Format Version: ${formatVersion.value}`);
  logDiagnostic(`  Player Version: ${playerVersion.value}`);
  logDiagnostic(`  Engine Version: ${originalVersion} (at offset ${engineVersionStartOffset}, length ${originalVersionLength})`);

  // Check if this version needs patching
  const needsPatching = VRCHAT_UNITY_VERSIONS.some(v => originalVersion.startsWith(v.split('f')[0])) ||
                        originalVersion !== targetVersion;
  
  if (!needsPatching) {
    logDiagnostic(`[VersionPatch] Version already compatible: ${originalVersion}`);
    return { patchedBytes, patched: false, originalVersion, details: 'Already compatible' };
  }

  // Perform the patch - write the target version
  logDiagnostic(`[VersionPatch] Patching: ${originalVersion} -> ${targetVersion}`);
  
  // Write the new version string, ensuring we don't exceed original length
  const targetBytes = Buffer.from(targetVersion, 'utf8');
  if (targetBytes.length >= originalVersionLength) {
    logDiagnostic(`[VersionPatch] WARNING: Target version too long, truncating`);
  }
  
  // Clear the original version area and write new version
  for (let i = 0; i < originalVersionLength - 1; i++) {
    patchedBytes[engineVersionStartOffset + i] = i < targetBytes.length ? targetBytes[i] : 0;
  }
  // Ensure null terminator
  patchedBytes[engineVersionStartOffset + originalVersionLength - 1] = 0;

  // Verify the patch
  const verifyVersion = readNullTerminatedString(patchedBytes, engineVersionStartOffset);
  logDiagnostic(`[VersionPatch] Verification: ${verifyVersion.value}`);

  return { 
    patchedBytes, 
    patched: true, 
    originalVersion, 
    patchedVersion: verifyVersion.value,
    details: `Patched from ${originalVersion} to ${verifyVersion.value}`
  };
}

/**
 * Decompress gzip data if needed, returning raw UnityFS bundle
 */
function decompressIfNeeded(buffer: Buffer): { data: Buffer; wasCompressed: boolean } {
  // Check for GZIP magic bytes (1f 8b)
  if (buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
    logDiagnostic(`[Decompress] Detected GZIP compression, decompressing...`);
    const zlib = require('zlib');
    try {
      const decompressed = zlib.gunzipSync(buffer);
      logDiagnostic(`[Decompress] Decompressed: ${buffer.length} -> ${decompressed.length} bytes`);
      return { data: decompressed, wasCompressed: true };
    } catch (err: any) {
      logDiagnostic(`[Decompress] Decompression failed: ${err.message}`);
      return { data: buffer, wasCompressed: false };
    }
  }
  return { data: buffer, wasCompressed: false };
}

/**
 * Compress data with gzip
 */
function compressGzip(buffer: Buffer): Buffer {
  const zlib = require('zlib');
  return zlib.gzipSync(buffer);
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
// Now with comprehensive version patching for Unity compatibility
ipcMain.handle('fs:extractAvatarToDownloads', async (_e, cacheDataPath: string, avatarId: string, options?: { patchVersion?: boolean; outputFormat?: 'vrca' | 'unitypackage' }) => {
  try {
    const patchVersion = options?.patchVersion !== false; // Default to true
    const outputFormat = options?.outputFormat || 'vrca'; // Default to .vrca for direct Unity loading
    
    logDiagnostic('\n========== AVATAR EXTRACTION START ==========');
    logDiagnostic(`Cache file: ${cacheDataPath}`);
    logDiagnostic(`Avatar ID: ${avatarId}`);
    logDiagnostic(`Version patching: ${patchVersion ? 'ENABLED' : 'DISABLED'}`);
    logDiagnostic(`Output format: ${outputFormat}`);

    // Verify cache file exists
    if (!fs.existsSync(cacheDataPath)) {
      const errorMsg = `Cache file not found: ${cacheDataPath}`;
      logDiagnostic(`ERROR: ${errorMsg}`);
      throw new Error(errorMsg);
    }

    const cacheStats = fs.statSync(cacheDataPath);
    logDiagnostic(`File size: ${cacheStats.size} bytes (${(cacheStats.size / 1024 / 1024).toFixed(2)} MB)`);

    // Read the entire file
    let buffer = fs.readFileSync(cacheDataPath);
    logDiagnostic(`Read successful: ${buffer.length} bytes`);

    // Analyze header
    const hexHeader = buffer.slice(0, 16).toString('hex');
    let asciiHeader = buffer.slice(0, 7).toString('utf8');
    logDiagnostic(`Header (hex): ${hexHeader}`);
    logDiagnostic(`Header (ascii): "${asciiHeader}"`);

    // Detect format and decompress if needed
    let detectedFormat = 'UNKNOWN';
    let wasCompressed = false;
    
    if (buffer[0] === 0x1f && buffer[1] === 0x8b) {
      detectedFormat = 'GZIP_COMPRESSED';
      logDiagnostic('✓ Detected: GZIP compression - decompressing...');
      const decompResult = decompressIfNeeded(buffer);
      buffer = decompResult.data;
      wasCompressed = decompResult.wasCompressed;
      asciiHeader = buffer.slice(0, 7).toString('utf8');
      logDiagnostic(`After decompression - Header: "${asciiHeader}"`);
    }
    
    if (asciiHeader === 'UnityFS') {
      detectedFormat = wasCompressed ? 'GZIP_WRAPPED_UNITYFS' : 'UNITYFS_BUNDLE';
      logDiagnostic(`✓ Detected: UnityFS bundle ${wasCompressed ? '(was gzip compressed)' : '(raw)'}`);
    } else if (buffer[0] === 0x50 && buffer[1] === 0x4b) {
      detectedFormat = 'ZIP_ARCHIVE';
      logDiagnostic('✓ Detected: ZIP archive');
    } else {
      logDiagnostic(`⚠ Unknown format after processing, treating as raw data`);
    }

    // Apply version patching if enabled and it's a UnityFS bundle
    let patchResult: { patched: boolean; originalVersion?: string; patchedVersion?: string; details?: string } = { patched: false };
    if (patchVersion && (detectedFormat === 'UNITYFS_BUNDLE' || detectedFormat === 'GZIP_WRAPPED_UNITYFS')) {
      logDiagnostic(`\n--- Applying Version Patch ---`);
      patchResult = patchUnityFsEngineVersion(buffer);
      if (patchResult.patched) {
        buffer = patchResult.patchedBytes;
        logDiagnostic(`✓ Version patched: ${patchResult.originalVersion} -> ${patchResult.patchedVersion}`);
      } else {
        logDiagnostic(`ℹ No patch needed: ${patchResult.details || patchResult.originalVersion || 'unknown reason'}`);
      }
    }

    // Get Downloads folder
    const downloadsPath = app.getPath('downloads');
    let outputPath: string;
    let finalBuffer = buffer;

    if (outputFormat === 'vrca') {
      // Save as .vrca (raw Unity AssetBundle) - ready to load directly in Unity
      outputPath = path.join(downloadsPath, `${avatarId}.vrca`);
      logDiagnostic(`\nSaving as .vrca (Unity AssetBundle)...`);
      fs.writeFileSync(outputPath, finalBuffer);
    } else {
      // Save as .unitypackage (tar.gz with proper structure)
      outputPath = path.join(downloadsPath, `${avatarId}.unitypackage`);
      logDiagnostic(`\nCreating .unitypackage...`);

      // Save patched bundle to temp file
      const tempRawPath = path.join(downloadsPath, `${avatarId}-raw.tmp`);
      fs.writeFileSync(tempRawPath, finalBuffer);

      try {
        await createUnityPackage(tempRawPath, avatarId, outputPath);
      } finally {
        // Clean up temp file
        if (fs.existsSync(tempRawPath)) {
          fs.unlinkSync(tempRawPath);
        }
      }
    }

    // Verify output
    if (!fs.existsSync(outputPath)) {
      throw new Error('File write failed - file does not exist after write');
    }

    const outputStats = fs.statSync(outputPath);
    logDiagnostic(`✓ Output created: ${outputPath}`);
    logDiagnostic(`  Size: ${outputStats.size} bytes (${(outputStats.size / 1024 / 1024).toFixed(2)} MB)`);
    logDiagnostic(`  Format: ${outputFormat.toUpperCase()}`);
    logDiagnostic(`========== EXTRACTION SUCCESS ==========\n`);

    return {
      success: true,
      path: outputPath,
      size: outputStats.size,
      format: detectedFormat,
      outputFormat: outputFormat,
      versionPatched: patchResult.patched,
      originalVersion: patchResult.originalVersion,
      patchedVersion: patchResult.patchedVersion,
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

// Save avatar as .vrca file (patched Unity AssetBundle ready to load)
ipcMain.handle('fs:saveAvatarAsVRCA', async (_e, sourcePath: string, avatarId: string, avatarName?: string) => {
  try {
    logDiagnostic('\n========== SAVE AS VRCA START ==========');
    logDiagnostic(`Source: ${sourcePath}`);
    logDiagnostic(`Avatar ID: ${avatarId}`);

    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Source file not found: ${sourcePath}`);
    }

    // Read the source file
    let buffer = fs.readFileSync(sourcePath);
    logDiagnostic(`Read ${buffer.length} bytes`);

    // Decompress if needed
    const decompResult = decompressIfNeeded(buffer);
    buffer = decompResult.data;
    
    // Verify it's a UnityFS bundle
    const header = buffer.slice(0, 7).toString('utf8');
    if (header !== 'UnityFS') {
      throw new Error(`Not a valid Unity AssetBundle (header: ${header})`);
    }

    // Apply version patching
    logDiagnostic(`Applying version patch...`);
    const patchResult = patchUnityFsEngineVersion(buffer);
    if (patchResult.patched) {
      buffer = patchResult.patchedBytes;
      logDiagnostic(`✓ Patched: ${patchResult.originalVersion} -> ${patchResult.patchedVersion}`);
    } else {
      logDiagnostic(`ℹ ${patchResult.details || 'No patch needed'}`);
    }

    // Save to Downloads
    const downloadsPath = app.getPath('downloads');
    const safeName = (avatarName || avatarId).replace(/[^a-zA-Z0-9_-]/g, '_');
    const outputPath = path.join(downloadsPath, `${safeName}.vrca`);
    
    fs.writeFileSync(outputPath, buffer);
    
    const outputStats = fs.statSync(outputPath);
    logDiagnostic(`✓ Saved: ${outputPath} (${outputStats.size} bytes)`);
    logDiagnostic(`========== SAVE AS VRCA SUCCESS ==========\n`);

    return {
      success: true,
      path: outputPath,
      size: outputStats.size,
      versionPatched: patchResult.patched,
      originalVersion: patchResult.originalVersion,
      patchedVersion: patchResult.patchedVersion
    };
  } catch (err: any) {
    logDiagnostic(`✗ FAILED: ${err.message}`);
    return { success: false, error: err.message };
  }
});

// Analyze a bundle file and return version info
ipcMain.handle('fs:analyzeBundleVersion', async (_e, filePath: string) => {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error('File not found');
    }

    let buffer = fs.readFileSync(filePath);
    
    // Decompress if needed
    const decompResult = decompressIfNeeded(buffer);
    buffer = decompResult.data;
    
    const header = buffer.slice(0, 7).toString('utf8');
    if (header !== 'UnityFS') {
      return {
        success: true,
        isUnityBundle: false,
        format: 'UNKNOWN',
        header: buffer.slice(0, 16).toString('hex')
      };
    }

    // Parse UnityFS header
    const signature = readNullTerminatedString(buffer, 0);
    const formatVersion = readNullTerminatedString(buffer, signature.nextOffset);
    const playerVersion = readNullTerminatedString(buffer, formatVersion.nextOffset);
    const engineVersion = readNullTerminatedString(buffer, playerVersion.nextOffset);

    return {
      success: true,
      isUnityBundle: true,
      format: 'UnityFS',
      formatVersion: formatVersion.value,
      playerVersion: playerVersion.value,
      engineVersion: engineVersion.value,
      needsPatching: engineVersion.value !== TARGET_UNITY_VERSION,
      wasCompressed: decompResult.wasCompressed
    };
  } catch (err: any) {
    return { success: false, error: err.message };
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

/**
 * Create a valid .unitypackage (tar.gz) from a raw AssetBundle file.
 * A .unitypackage is a tar.gz containing: <GUID>/asset, <GUID>/pathname, <GUID>/asset.meta
 */
async function createUnityPackage(sourcePath: string, avatarId: string, outputPath: string): Promise<void> {
  const guid = crypto.randomBytes(16).toString('hex');
  const stagingDir = path.join(path.dirname(outputPath), `staging-${Date.now()}`);
  const guidDir = path.join(stagingDir, guid);

  try {
    // Create staging structure
    fs.mkdirSync(guidDir, { recursive: true });
    logDiagnostic(`[UnityPackage] Staging dir: ${guidDir}`);

    // Write pathname file (tells Unity where to place the asset)
    const pathname = `Assets/Avatar/${avatarId}.vrca`;
    fs.writeFileSync(path.join(guidDir, 'pathname'), pathname + '\n');
    logDiagnostic(`[UnityPackage] Pathname: ${pathname}`);

    // Copy the raw bundle as "asset"
    fs.copyFileSync(sourcePath, path.join(guidDir, 'asset'));
    const assetSize = fs.statSync(path.join(guidDir, 'asset')).size;
    logDiagnostic(`[UnityPackage] Asset copied: ${assetSize} bytes`);

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

    // Create tar.gz archive
    await tar.create(
      { gzip: true, file: outputPath, cwd: stagingDir },
      [guid],
    );

    const outputSize = fs.statSync(outputPath).size;
    logDiagnostic(`[UnityPackage] Created: ${outputPath} (${outputSize} bytes)`);
  } finally {
    // Clean up staging directory
    if (fs.existsSync(stagingDir)) {
      fs.rmSync(stagingDir, { recursive: true, force: true });
      logDiagnostic(`[UnityPackage] Staging cleaned up`);
    }
  }
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

ipcMain.handle('fs:extractBundle', async (_e, sourcePath: string, avatarId: string, options?: { patchVersion?: boolean; outputFormat?: 'vrca' | 'unitypackage' }) => {
  if (process.platform !== 'win32') {
    throw new Error('Avatar extraction only supported on Windows');
  }

  const patchVersion = options?.patchVersion !== false; // Default to true
  const outputFormat = options?.outputFormat || 'vrca'; // Default to .vrca

  try {
    // Validate file exists and is readable
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Bundle file not found at ${sourcePath}`);
    }

    const stats = fs.statSync(sourcePath);
    if (stats.size === 0) {
      throw new Error('Downloaded bundle file is empty. The download may have failed.');
    }

    // Read and process the file
    let buffer = fs.readFileSync(sourcePath);
    logDiagnostic(`[ExtractBundle] Read ${buffer.length} bytes from ${sourcePath}`);

    // Detect actual file format and decompress if needed
    const detectedFormat = detectFileFormat(sourcePath);
    console.log(`[Bundle] Detected format: ${detectedFormat}, File size: ${stats.size} bytes`);
    logDiagnostic(`[ExtractBundle] Format: ${detectedFormat}, Size: ${stats.size} bytes`);

    // Decompress if gzipped
    const decompResult = decompressIfNeeded(buffer);
    buffer = decompResult.data;

    // Apply version patching if it's a UnityFS bundle
    let patchResult: { patched: boolean; originalVersion?: string; patchedVersion?: string } = { patched: false };
    const header = buffer.slice(0, 7).toString('utf8');
    
    if (patchVersion && header === 'UnityFS') {
      logDiagnostic(`[ExtractBundle] Applying version patch...`);
      const result = patchUnityFsEngineVersion(buffer);
      patchResult = { patched: result.patched, originalVersion: result.originalVersion, patchedVersion: result.patchedVersion };
      if (result.patched) {
        buffer = result.patchedBytes;
        logDiagnostic(`[ExtractBundle] ✓ Patched: ${result.originalVersion} -> ${result.patchedVersion}`);
      } else {
        logDiagnostic(`[ExtractBundle] ℹ ${result.details || 'No patch needed'}`);
      }
    }

    const bundleDir = path.join(app.getPath('userData'), 'AvatarBundles', avatarId);
    fs.mkdirSync(bundleDir, { recursive: true });

    let outputPath: string;

    if (outputFormat === 'vrca') {
      // Save as .vrca (raw patched bundle)
      outputPath = path.join(bundleDir, `${avatarId}.vrca`);
      logDiagnostic(`[ExtractBundle] Saving as .vrca...`);
      fs.writeFileSync(outputPath, buffer);
    } else {
      // Create a proper .unitypackage (tar.gz with GUID structure)
      outputPath = path.join(bundleDir, `${avatarId}.unitypackage`);

      // Save patched buffer to temp file
      const tempPath = path.join(bundleDir, `${avatarId}-temp.bundle`);
      fs.writeFileSync(tempPath, buffer);

      try {
        logDiagnostic('[ExtractBundle] Creating .unitypackage from patched bundle');
        await createUnityPackage(tempPath, avatarId, outputPath);
      } finally {
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
      }
    }

    const outputSize = fs.statSync(outputPath).size;
    console.log(`[Bundle] Output created: ${outputPath} (${outputSize} bytes)`);
    logDiagnostic(`[ExtractBundle] Success: ${outputPath} (${outputSize} bytes)`);

    return {
      path: outputPath,
      size: outputSize,
      format: outputFormat,
      versionPatched: patchResult.patched,
      originalVersion: patchResult.originalVersion,
      patchedVersion: patchResult.patchedVersion
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Bundle] Error:', errorMsg);
    logDiagnostic(`[ExtractBundle] FAILED: ${errorMsg}`);
    throw new Error(`Failed to create output file: ${errorMsg}`);
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
