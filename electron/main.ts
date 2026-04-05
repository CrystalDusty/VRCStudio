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
import { spawn, exec } from 'child_process';

// Import decryption modules
import * as vrchatDecryption from './vrchatDecryption';
import * as vrchatMemoryExtractor from './vrchatMemoryExtractor';

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

    // CHECK FOR VRCHAT ENCRYPTION FIRST
    const encryptionCheck = isVRChatEncrypted(buffer);
    if (encryptionCheck.encrypted) {
      logDiagnostic(`⚠ ENCRYPTION DETECTED: ${encryptionCheck.reason}`);
      return {
        success: false,
        encrypted: true,
        error: `This cache file is ENCRYPTED by VRChat.\n\n` +
          `Since April 2025, VRChat encrypts all cached avatars client-side to prevent extraction.\n\n` +
          `WORKAROUND OPTIONS:\n` +
          `1. Use the "Download via API" button instead - downloads directly from VRChat servers (unencrypted)\n` +
          `2. If you own this avatar, export it from Unity using the VRChat SDK\n` +
          `3. Contact the avatar creator for the original files\n\n` +
          `Technical: ${encryptionCheck.reason}`,
        logFile: logFile
      };
    }

    const integrity = validateUnityFsIntegrity(buffer);
    if (!integrity.valid) {
      const msg = `Cache bundle failed integrity check: ${integrity.reason}`;
      logDiagnostic(`ERROR: ${msg}`);
      throw new Error(`${msg} Please reload the avatar in VRChat and try again (cache file may be partial/corrupt).`);
    }

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

    // CRITICAL: Patch the Unity version BEFORE packaging
    // This ensures the .vrca inside the unitypackage has the correct version
    logDiagnostic('Patching Unity version in bundle...');
    const patchResult = patchUnityVersionInBuffer(rawBundleBuffer);
    rawBundleBuffer = patchResult.patched;
    logDiagnostic(`Version patched: ${patchResult.originalVersion} -> ${patchResult.patchedVersion}`);

    // Also create a standalone pre-patched .vrca file for direct use
    const patchedVrcaPath = path.join(downloadsPath, `${avatarId}.vrca`);
    fs.writeFileSync(patchedVrcaPath, rawBundleBuffer);
    logDiagnostic(`✓ Pre-patched .vrca saved: ${patchedVrcaPath}`);

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
      vrcaPath: patchedVrcaPath,
      size: outputStats.size,
      format: detectedFormat,
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

function scoreCacheBundleCandidate(bundlePath: string, avatarId?: string, packageId?: string): number {
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

  if (!avatarId && !packageId) return score;

  const dir = path.dirname(bundlePath);
  const siblingCandidates = ['__info', '__metadata', '_info', 'info', '__data'];

  for (const fileName of siblingCandidates) {
    const filePath = path.join(dir, fileName);
    if (!fs.existsSync(filePath)) continue;
    try {
      const raw = fs.readFileSync(filePath);
      const textUtf8 = raw.toString('utf8');
      const textUtf16 = raw.toString('utf16le');
      const hasAvatarId = !!avatarId && (textUtf8.includes(avatarId) || textUtf16.includes(avatarId));
      const hasPackageId = !!packageId && (textUtf8.includes(packageId) || textUtf16.includes(packageId));

      if (hasAvatarId) {
        score += 1000;
      }
      if (hasPackageId) {
        score += 1400;
      }
      if (
        textUtf8.includes('/avatar/') || textUtf8.includes('avatar') || textUtf8.includes('avtr_') ||
        textUtf16.includes('/avatar/') || textUtf16.includes('avatar') || textUtf16.includes('avtr_')
      ) {
        score += 25;
      }
      break;
    } catch {
      // likely binary; skip
    }
  }

  // Weak fallback heuristics
  if (avatarId && bundlePath.includes(avatarId)) score += 200;
  if (packageId && bundlePath.includes(packageId)) score += 300;

  return score;
}

function normalizeUnityFsBuffer(input: Buffer): Buffer | null {
  let data = input;

  // Gzip-wrapped cache artifact
  if (data.length > 2 && data[0] === 0x1f && data[1] === 0x8b) {
    try {
      data = zlib.gunzipSync(data);
    } catch {
      return null;
    }
  }

  // Find UnityFS marker
  const marker = Buffer.from('UnityFS', 'utf8');
  const idx = data.indexOf(marker);
  if (idx < 0) return null;

  if (idx > 0) {
    data = data.subarray(idx);
  }

  return data;
}

function validateUnityFsIntegrity(input: Buffer): { valid: boolean; reason?: string } {
  const data = normalizeUnityFsBuffer(input);
  if (!data) {
    return { valid: false, reason: 'Not a readable UnityFS buffer (or gzip wrapper failed).' };
  }

  // UnityFS header layout:
  // "UnityFS\0"(8) + formatVersion(4) + playerVersion\0 + engineVersion\0 + fileSize(8) + ...
  let offset = 12;
  while (offset < data.length && data[offset] !== 0) offset++;
  offset++;
  while (offset < data.length && data[offset] !== 0) offset++;
  offset++;

  if (offset + 8 > data.length) {
    return { valid: false, reason: 'Header truncated before declared bundle size.' };
  }

  const declaredFileSize = Number(data.readBigUInt64BE(offset));
  if (!Number.isFinite(declaredFileSize) || declaredFileSize <= 0) {
    return { valid: false, reason: 'Invalid declared UnityFS file size in header.' };
  }

  if (declaredFileSize > data.length) {
    return {
      valid: false,
      reason: `Truncated UnityFS data: declared ${declaredFileSize} bytes, actual ${data.length} bytes.`,
    };
  }

  // Strong mismatch can indicate extra wrapper/padding mismatch from cache.
  if (data.length - declaredFileSize > 64 * 1024) {
    return {
      valid: false,
      reason: `Unexpected trailing data: declared ${declaredFileSize} bytes, actual ${data.length} bytes.`,
    };
  }

  return { valid: true };
}

// Target Unity version for VRChat Creator Companion compatibility
const TARGET_UNITY_VERSION = '2022.3.22f1';

/**
 * Check if a buffer contains encrypted VRChat cache data.
 * VRChat encrypts cache files client-side since April 2025.
 * Encrypted files have:
 * - Valid UnityFS header (not encrypted)
 * - But data blocks fail LZ4 decompression
 */
function isVRChatEncrypted(buffer: Buffer): { encrypted: boolean; reason: string } {
  // Must start with UnityFS
  if (buffer.slice(0, 7).toString('utf8') !== 'UnityFS') {
    return { encrypted: false, reason: 'Not a UnityFS file' };
  }
  
  // Parse header to find data region
  let offset = 12;
  while (offset < buffer.length && buffer[offset] !== 0) offset++;
  offset++;
  while (offset < buffer.length && buffer[offset] !== 0) offset++;
  offset++;
  
  // Skip bundle size (8), compressed block info size (4), uncompressed (4)
  offset += 8 + 4 + 4;
  
  // Read flags
  const flags = buffer.readUInt32BE(offset);
  const blockInfoAtEnd = !!(flags & 0x80);
  offset += 4;
  
  // Data starts here (if block info is at end)
  if (!blockInfoAtEnd) {
    return { encrypted: false, reason: 'Block info not at end - unusual format' };
  }
  
  // Read first data bytes
  const firstDataBytes = buffer.slice(offset, offset + 64);
  
  // Check entropy - encrypted data has very high entropy (all 256 byte values appear)
  const byteSet = new Set<number>();
  for (let i = offset; i < Math.min(offset + 10000, buffer.length); i++) {
    byteSet.add(buffer[i]);
  }
  
  // If we see nearly all 256 byte values in first 10KB, it's likely encrypted
  if (byteSet.size > 250) {
    // Try LZ4 decompression on what should be the first block
    try {
      // This would need actual LZ4 library - for now just check entropy
      return { 
        encrypted: true, 
        reason: `High entropy (${byteSet.size}/256 unique bytes in 10KB) suggests encryption. VRChat encrypts cache files since April 2025.`
      };
    } catch {
      return { encrypted: true, reason: 'Data blocks appear encrypted (LZ4 decompression fails)' };
    }
  }
  
  return { encrypted: false, reason: 'Data appears unencrypted' };
}

/**
 * Patch the Unity version in a raw UnityFS bundle buffer.
 * This completely replaces VRChat's custom version (e.g., 2022.3.22f2-DWR)
 * with the public Unity version (2022.3.22f1) that Creator Companion uses.
 * 
 * The key insight is that VRChat's "-DWR" suffix must be COMPLETELY REMOVED,
 * not preserved, because Unity's version check rejects any non-standard suffix.
 */
function patchUnityVersionInBuffer(input: Buffer): { patched: Buffer; originalVersion: string; patchedVersion: string } {
  let data = Buffer.from(input); // Create a copy to avoid mutating input
  
  // Handle gzip-wrapped data
  let wasGzipped = false;
  if (data.length > 2 && data[0] === 0x1f && data[1] === 0x8b) {
    wasGzipped = true;
    try {
      data = zlib.gunzipSync(data);
      logDiagnostic(`[VersionPatch] Decompressed gzip, size: ${data.length} bytes`);
    } catch (err: any) {
      logDiagnostic(`[VersionPatch] Gzip decompression failed: ${err.message}`);
      return { patched: input, originalVersion: 'unknown', patchedVersion: 'unchanged' };
    }
  }
  
  // Find UnityFS marker
  const marker = Buffer.from('UnityFS', 'utf8');
  const unityFsOffset = data.indexOf(marker);
  if (unityFsOffset < 0) {
    logDiagnostic('[VersionPatch] UnityFS marker not found');
    return { patched: input, originalVersion: 'unknown', patchedVersion: 'unchanged' };
  }
  
  // Trim leading bytes if any
  if (unityFsOffset > 0) {
    data = data.subarray(unityFsOffset);
    logDiagnostic(`[VersionPatch] Trimmed ${unityFsOffset} leading bytes`);
  }
  
  // Parse header: "UnityFS\0" (8) + format_version (4) + player_version\0 + engine_version\0
  let offset = 12; // Skip "UnityFS\0" + format version
  
  // Skip player version (null-terminated)
  while (offset < data.length && data[offset] !== 0) offset++;
  offset++; // skip null terminator
  
  // Read engine version bounds
  const engineVerStart = offset;
  while (offset < data.length && data[offset] !== 0) offset++;
  const engineVerEnd = offset;
  
  const originalVersion = data.subarray(engineVerStart, engineVerEnd).toString('utf8');
  const originalFieldLen = engineVerEnd - engineVerStart;
  
  logDiagnostic(`[VersionPatch] Original version: "${originalVersion}" (${originalFieldLen} bytes)`);
  
  // Build the patched version - use EXACT target version, NO suffix
  const targetBytes = Buffer.from(TARGET_UNITY_VERSION, 'utf8');
  
  // Clear the entire version field with nulls first
  for (let i = engineVerStart; i < engineVerEnd; i++) {
    data[i] = 0;
  }
  
  // Write the new version (it will be null-padded to original length)
  const copyLen = Math.min(targetBytes.length, originalFieldLen);
  targetBytes.copy(data, engineVerStart, 0, copyLen);
  
  // Also patch ALL occurrences of the original version string in the bundle
  // This catches version strings in serialized metadata
  const originalVersionBytes = Buffer.from(originalVersion, 'utf8');
  let replacementCount = 0;
  const maxReplacements = 50; // Safety limit
  
  let searchStart = engineVerEnd + 1;
  while (searchStart <= data.length - originalVersionBytes.length && replacementCount < maxReplacements) {
    const foundIdx = data.indexOf(originalVersionBytes, searchStart);
    if (foundIdx < 0) break;
    
    // Clear and write target version
    for (let i = 0; i < originalVersionBytes.length; i++) {
      data[foundIdx + i] = 0;
    }
    const patchLen = Math.min(targetBytes.length, originalVersionBytes.length);
    targetBytes.copy(data, foundIdx, 0, patchLen);
    
    replacementCount++;
    searchStart = foundIdx + originalVersionBytes.length;
  }
  
  logDiagnostic(`[VersionPatch] Patched ${replacementCount + 1} version occurrences`);
  logDiagnostic(`[VersionPatch] Patched version: "${TARGET_UNITY_VERSION}"`);
  
  // Re-gzip if it was originally gzipped
  if (wasGzipped) {
    try {
      data = zlib.gzipSync(data);
      logDiagnostic(`[VersionPatch] Re-compressed to gzip, size: ${data.length} bytes`);
    } catch (err: any) {
      logDiagnostic(`[VersionPatch] Re-compression failed: ${err.message}`);
    }
  }
  
  return {
    patched: data,
    originalVersion,
    patchedVersion: TARGET_UNITY_VERSION
  };
}

// Search for _data files (avatar bundles) in VRChat cache
ipcMain.handle('fs:searchCacheForDataFiles', async (_e, avatarId?: string, packageId?: string) => {
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
            const fileBuffer = fs.readFileSync(fullPath);
            const integrity = validateUnityFsIntegrity(fileBuffer);
            if (!integrity.valid) {
              console.log(`[SearchCache] ⚠ Skipping invalid bundle candidate: ${fullPath} (${integrity.reason})`);
              continue;
            }
            const score = scoreCacheBundleCandidate(fullPath, avatarId, packageId);
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

    let ranked = foundPaths
      .map(p => ({ path: p, score: scoreCacheBundleCandidate(p, avatarId, packageId) }))
      .sort((a, b) => b.score - a.score);

    // If we found strong metadata matches for avatar/package, only return those.
    if (avatarId || packageId) {
      const strongThreshold = packageId ? 1300 : 900;
      const strongMatches = ranked.filter(r => r.score >= strongThreshold);
      if (strongMatches.length > 0) {
        ranked = strongMatches;
      }
    }

    console.log(`[SearchCache] Search complete. Scanned ${scannedDirs} dirs, found ${foundPaths.length} bundle(s)`);
    if ((avatarId || packageId) && ranked.length > 0) {
      console.log(`[SearchCache] Top match for avatar=${avatarId || 'n/a'} package=${packageId || 'n/a'}: ${ranked[0].path} (score=${ranked[0].score})`);
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
using System.Collections.Generic;

/// <summary>
/// VRC Studio - AssetBundle Loader v2.0
/// Bundle was built with Unity ${bundleUnityVersion}
///
/// Uses advanced in-memory version patching to bypass Unity's strict version check.
/// VRChat builds bundles with a custom Unity fork (e.g., 2022.3.22f2-DWR) that
/// doesn't match any public release. We completely replace the version string
/// with the exact public Unity version (2022.3.22f1) to ensure compatibility.
/// </summary>
public class VRCStudioBundleLoader : EditorWindow
{
    // Target Unity version for VRChat Creator Companion
    private const string TARGET_UNITY_VERSION = "2022.3.22f1";
    
    /// <summary>
    /// Reads the .vrca file, patches the Unity version in the header to match
    /// the current editor, then loads via AssetBundle.LoadFromMemory().
    /// This bypasses the "wrong version or build target" error.
    /// </summary>
    static AssetBundle LoadBundleWithVersionPatch(string bundlePath)
    {
        byte[] data = File.ReadAllBytes(bundlePath);
        Debug.Log("[VRC Studio] Read " + data.Length + " bytes from: " + bundlePath);

        // If this is gzip-wrapped data, decompress first
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

        // Find UnityFS marker - some cache files have leading bytes
        int unityFsOffset = FindUnityFSMarker(data);
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

        // Parse and patch the version in the header
        string originalVersion;
        data = PatchUnityVersion(data, out originalVersion);
        
        Debug.Log("[VRC Studio] Original bundle version: " + originalVersion);
        Debug.Log("[VRC Studio] Your Unity version: " + Application.unityVersion);
        Debug.Log("[VRC Studio] Target patch version: " + TARGET_UNITY_VERSION);

        // Try multiple loading strategies
        AssetBundle bundle = TryLoadBundle(data, bundlePath);

        if (bundle != null)
        {
            Debug.Log("[VRC Studio] Bundle loaded successfully!");
        }
        else
        {
            Debug.LogError("[VRC Studio] All loading attempts failed.");
            Debug.LogError("[VRC Studio] Current build target: " + EditorUserBuildSettings.activeBuildTarget);
            Debug.LogError("[VRC Studio] Make sure: File > Build Settings > PC, Mac & Linux Standalone");
        }

        return bundle;
    }
    
    static int FindUnityFSMarker(byte[] data)
    {
        byte[] marker = Encoding.UTF8.GetBytes("UnityFS");
        for (int i = 0; i <= data.Length - marker.Length; i++)
        {
            bool found = true;
            for (int j = 0; j < marker.Length; j++)
            {
                if (data[i + j] != marker[j])
                {
                    found = false;
                    break;
                }
            }
            if (found) return i;
        }
        return -1;
    }
    
    /// <summary>
    /// Patches the Unity version in the bundle header.
    /// CRITICAL: We must completely replace the version string (including any -DWR suffix)
    /// with the exact public Unity version, padded with null bytes to maintain field length.
    /// </summary>
    static byte[] PatchUnityVersion(byte[] data, out string originalVersion)
    {
        // UnityFS header format:
        // "UnityFS\\0" (8 bytes) + format_version (4 bytes big-endian) + 
        // player_version\\0 (null-terminated) + engine_version\\0 (null-terminated) + ...
        
        int offset = 12; // Skip "UnityFS\\0" + format version
        
        // Skip player version (null-terminated string like "5.x.x")
        while (offset < data.Length && data[offset] != 0) offset++;
        offset++; // skip null terminator
        
        // Read engine version bounds
        int engineVerStart = offset;
        while (offset < data.Length && data[offset] != 0) offset++;
        int engineVerEnd = offset; // position of null terminator
        
        originalVersion = Encoding.UTF8.GetString(data, engineVerStart, engineVerEnd - engineVerStart);
        int originalFieldLen = engineVerEnd - engineVerStart;
        
        // Build the patched version - use EXACT target version, no suffix
        byte[] targetBytes = Encoding.UTF8.GetBytes(TARGET_UNITY_VERSION);
        
        // Create patched data - we need to handle length differences carefully
        // If target is shorter, pad with nulls. If longer (shouldn't happen), truncate.
        if (targetBytes.Length <= originalFieldLen)
        {
            // Clear the entire field first (fill with nulls)
            for (int i = engineVerStart; i < engineVerEnd; i++)
            {
                data[i] = 0;
            }
            // Write the new version
            System.Array.Copy(targetBytes, 0, data, engineVerStart, targetBytes.Length);
        }
        else
        {
            // Version is longer - need to rebuild the header (rare case)
            // For now, truncate to fit
            System.Array.Copy(targetBytes, 0, data, engineVerStart, originalFieldLen);
        }
        
        // Also patch ALL occurrences of the original version string throughout the bundle
        // This handles serialized metadata that may also contain the version
        data = PatchAllVersionOccurrences(data, originalVersion, TARGET_UNITY_VERSION);
        
        string patchedVersion = Encoding.UTF8.GetString(data, engineVerStart, 
            System.Math.Min(targetBytes.Length, originalFieldLen));
        Debug.Log("[VRC Studio] Header patched: " + originalVersion + " -> " + patchedVersion);
        
        return data;
    }
    
    /// <summary>
    /// Finds and replaces all occurrences of the original version string.
    /// Uses safe replacement that maintains byte alignment.
    /// </summary>
    static byte[] PatchAllVersionOccurrences(byte[] data, string originalVersion, string targetVersion)
    {
        if (string.IsNullOrEmpty(originalVersion) || originalVersion == targetVersion)
            return data;
            
        byte[] originalBytes = Encoding.UTF8.GetBytes(originalVersion);
        byte[] targetBytes = Encoding.UTF8.GetBytes(targetVersion);
        
        List<int> positions = new List<int>();
        
        // Find all occurrences
        for (int i = 0; i <= data.Length - originalBytes.Length; i++)
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
                positions.Add(i);
                i += originalBytes.Length - 1; // Skip past this match
            }
        }
        
        Debug.Log("[VRC Studio] Found " + positions.Count + " version string occurrences to patch");
        
        // Replace each occurrence
        foreach (int pos in positions)
        {
            // Clear the original field
            for (int i = 0; i < originalBytes.Length; i++)
            {
                data[pos + i] = 0;
            }
            // Write target version (may be shorter, which is fine - null padded)
            int copyLen = System.Math.Min(targetBytes.Length, originalBytes.Length);
            System.Array.Copy(targetBytes, 0, data, pos, copyLen);
        }
        
        return data;
    }
    
    /// <summary>
    /// Tries multiple methods to load the bundle.
    /// </summary>
    static AssetBundle TryLoadBundle(byte[] data, string originalPath)
    {
        AssetBundle bundle = null;
        
        // Method 1: Direct memory load
        Debug.Log("[VRC Studio] Trying LoadFromMemory...");
        bundle = AssetBundle.LoadFromMemory(data);
        if (bundle != null)
        {
            Debug.Log("[VRC Studio] LoadFromMemory succeeded!");
            return bundle;
        }
        
        // Method 2: Write to temp file and load from there
        Debug.Log("[VRC Studio] Memory load failed, trying temp file...");
        try
        {
            string tempDir = Path.Combine(Path.GetTempPath(), "VRCStudio");
            if (!Directory.Exists(tempDir))
                Directory.CreateDirectory(tempDir);
                
            string tempPath = Path.Combine(tempDir, "patched_" + Path.GetFileName(originalPath));
            File.WriteAllBytes(tempPath, data);
            Debug.Log("[VRC Studio] Wrote patched bundle to: " + tempPath);
            
            bundle = AssetBundle.LoadFromFile(tempPath);
            if (bundle != null)
            {
                Debug.Log("[VRC Studio] LoadFromFile succeeded!");
                return bundle;
            }
        }
        catch (System.Exception e)
        {
            Debug.LogWarning("[VRC Studio] Temp file method failed: " + e.Message);
        }
        
        // Method 3: Try async load as last resort
        Debug.Log("[VRC Studio] Sync loads failed, this bundle may require special handling.");
        
        return null;
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

  // --- Recovery assets: include raw cache siblings as .bytes so users always
  // have importable files in Unity even when bundle decompression is unsupported.
  const recoveryAssets: Array<{ guid: string; pathname: Buffer; asset: Buffer; meta: Buffer }> = [];
  try {
    const sourceName = path.basename(sourcePath).toLowerCase();
    if (sourceName === '_data') {
      const sourceDir = path.dirname(sourcePath);
      const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const fullPath = path.join(sourceDir, entry.name);
        const bytes = fs.readFileSync(fullPath);
        const recoveryGuid = crypto.randomBytes(16).toString('hex');
        const recoveryPathname = Buffer.from(`Assets/VRCStudioRaw/${avatarId}/${entry.name}.bytes`);
        const recoveryMeta = Buffer.from(
          `fileFormatVersion: 2\nguid: ${recoveryGuid}\nDefaultImporter:\n  userData:\n  assetBundleName:\n  assetBundleVariant:\n`
        );
        recoveryAssets.push({
          guid: recoveryGuid,
          pathname: recoveryPathname,
          asset: bytes,
          meta: recoveryMeta,
        });
      }
      logDiagnostic(`[UnityPackage] Added ${recoveryAssets.length} recovery cache file(s) as .bytes assets`);
    }
  } catch (err) {
    logDiagnostic(`[UnityPackage] Recovery asset packaging skipped: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }

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

  // --- Recovery files entries ---
  for (const rec of recoveryAssets) {
    parts.push(buildTarHeader(rec.guid, 0, true));

    parts.push(buildTarHeader(`${rec.guid}/pathname`, rec.pathname.length, false));
    parts.push(rec.pathname);
    parts.push(tarPad(rec.pathname.length));

    parts.push(buildTarHeader(`${rec.guid}/asset`, rec.asset.length, false));
    parts.push(rec.asset);
    parts.push(tarPad(rec.asset.length));

    parts.push(buildTarHeader(`${rec.guid}/asset.meta`, rec.meta.length, false));
    parts.push(rec.meta);
    parts.push(tarPad(rec.meta.length));
  }

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
      // CRITICAL: Patch version BEFORE packaging
      console.log('[Bundle] Reading and patching raw bundle...');
      logDiagnostic('[ExtractBundle] Reading raw bundle for version patching');
      
      let rawBuffer = fs.readFileSync(sourcePath);
      const patchResult = patchUnityVersionInBuffer(rawBuffer);
      rawBuffer = patchResult.patched;
      
      console.log(`[Bundle] Version patched: ${patchResult.originalVersion} -> ${patchResult.patchedVersion}`);
      logDiagnostic(`[ExtractBundle] Version patched: ${patchResult.originalVersion} -> ${patchResult.patchedVersion}`);
      
      // Write patched bundle to temp file
      const tempPatchedPath = path.join(bundleDir, `${avatarId}-patched.tmp`);
      fs.writeFileSync(tempPatchedPath, rawBuffer);
      
      // Also save a standalone .vrca for direct use
      const vrcaPath = path.join(bundleDir, `${avatarId}.vrca`);
      fs.writeFileSync(vrcaPath, rawBuffer);
      console.log(`[Bundle] Pre-patched .vrca saved: ${vrcaPath}`);
      
      console.log('[Bundle] Wrapping patched bundle in .unitypackage tar.gz format...');
      logDiagnostic('[ExtractBundle] Creating .unitypackage from patched bundle');
      
      try {
        await createUnityPackage(tempPatchedPath, avatarId, outputPath);
      } finally {
        if (fs.existsSync(tempPatchedPath)) {
          fs.unlinkSync(tempPatchedPath);
        }
      }
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

// Manual version patching utility - allows users to patch any .vrca file
ipcMain.handle('fs:patchVrcaVersion', async (_e, inputPath: string, outputPath?: string) => {
  try {
    logDiagnostic(`\n========== MANUAL VERSION PATCH ==========`);
    logDiagnostic(`Input: ${inputPath}`);
    
    if (!fs.existsSync(inputPath)) {
      return { success: false, error: `File not found: ${inputPath}` };
    }
    
    const inputBuffer = fs.readFileSync(inputPath);
    logDiagnostic(`Input size: ${inputBuffer.length} bytes`);
    
    const patchResult = patchUnityVersionInBuffer(inputBuffer);
    
    // Determine output path
    const finalOutputPath = outputPath || inputPath.replace(/\.vrca$/i, '_patched.vrca');
    fs.writeFileSync(finalOutputPath, patchResult.patched);
    
    logDiagnostic(`Output: ${finalOutputPath}`);
    logDiagnostic(`Version: ${patchResult.originalVersion} -> ${patchResult.patchedVersion}`);
    logDiagnostic(`========== PATCH COMPLETE ==========\n`);
    
    return {
      success: true,
      outputPath: finalOutputPath,
      originalVersion: patchResult.originalVersion,
      patchedVersion: patchResult.patchedVersion,
      size: patchResult.patched.length
    };
  } catch (err: any) {
    logDiagnostic(`PATCH FAILED: ${err.message}`);
    return { success: false, error: err.message };
  }
});

// Bundle analysis utility - provides detailed info about a bundle file
ipcMain.handle('fs:analyzeBundle', async (_e, bundlePath: string) => {
  try {
    if (!fs.existsSync(bundlePath)) {
      return { success: false, error: `File not found: ${bundlePath}` };
    }
    
    const stats = fs.statSync(bundlePath);
    let buffer = fs.readFileSync(bundlePath);
    
    const result: any = {
      success: true,
      path: bundlePath,
      size: stats.size,
      sizeFormatted: `${(stats.size / 1024 / 1024).toFixed(2)} MB`,
      format: 'UNKNOWN',
      isGzipped: false,
      isUnityFS: false,
      unityVersion: null,
      playerVersion: null,
      recommendation: ''
    };
    
    // Check for gzip
    if (buffer.length > 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
      result.isGzipped = true;
      result.format = 'GZIP_COMPRESSED';
      try {
        buffer = zlib.gunzipSync(buffer);
        result.decompressedSize = buffer.length;
      } catch {
        result.recommendation = 'File appears gzip compressed but failed to decompress.';
        return result;
      }
    }
    
    // Check for UnityFS
    const header = buffer.slice(0, 7).toString('utf8');
    if (header === 'UnityFS') {
      result.isUnityFS = true;
      result.format = result.isGzipped ? 'GZIP_WRAPPED_UNITYFS' : 'UNITYFS_BUNDLE';
      
      // Parse version strings
      let offset = 12;
      // Read player version
      let playerVer = '';
      while (offset < buffer.length && buffer[offset] !== 0) {
        playerVer += String.fromCharCode(buffer[offset]);
        offset++;
      }
      offset++;
      
      // Read engine version
      let engineVer = '';
      while (offset < buffer.length && buffer[offset] !== 0) {
        engineVer += String.fromCharCode(buffer[offset]);
        offset++;
      }
      
      result.playerVersion = playerVer;
      result.unityVersion = engineVer;
      
      // Check for encryption
      const encryptionCheck = isVRChatEncrypted(buffer);
      result.isEncrypted = encryptionCheck.encrypted;
      if (encryptionCheck.encrypted) {
        result.encryptionReason = encryptionCheck.reason;
        result.recommendation = `⚠️ ENCRYPTED: ${encryptionCheck.reason}\n\n` +
          `VRChat encrypts cache files since April 2025. Use "Download via API" to get unencrypted data.`;
      }
      // Check if patching is needed
      else if (engineVer.includes('-DWR') || engineVer.includes('f2')) {
        result.needsPatching = true;
        result.recommendation = `This bundle was built with Unity ${engineVer} (VRChat custom). ` +
          `It needs version patching to work with Unity ${TARGET_UNITY_VERSION}. ` +
          `Use patchVrcaVersion() to fix.`;
      } else if (engineVer === TARGET_UNITY_VERSION) {
        result.needsPatching = false;
        result.recommendation = 'Bundle version matches target Unity version. Should load without issues.';
      } else {
        result.needsPatching = true;
        result.recommendation = `Bundle Unity version (${engineVer}) differs from target (${TARGET_UNITY_VERSION}). May need patching.`;
      }
    } else if (buffer[0] === 0x50 && buffer[1] === 0x4b) {
      result.format = 'ZIP_ARCHIVE';
      result.recommendation = 'This appears to be a ZIP file, not a Unity bundle.';
    } else {
      result.recommendation = 'Unknown file format. Not a standard Unity bundle.';
    }
    
    return result;
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

// Check if a bundle file is encrypted
ipcMain.handle('fs:checkBundleEncryption', async (_e, bundlePath: string) => {
  try {
    if (!fs.existsSync(bundlePath)) {
      return { success: false, error: 'File not found' };
    }
    
    const buffer = fs.readFileSync(bundlePath);
    const result = isVRChatEncrypted(buffer);
    
    return {
      success: true,
      encrypted: result.encrypted,
      reason: result.reason,
      fileSize: buffer.length
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

// Download directly from VRChat API (bypasses encrypted cache)
// This should give UNENCRYPTED data since encryption happens client-side after download
ipcMain.handle('fs:downloadFromVRChatAPI', async (_e, avatarId: string, packageId: string) => {
  try {
    logDiagnostic('\n========== DIRECT API DOWNLOAD ==========');
    logDiagnostic(`Avatar ID: ${avatarId}`);
    logDiagnostic(`Package ID: ${packageId}`);
    
    // Construct the VRChat file API URL
    const downloadUrl = `https://api.vrchat.cloud/api/1/file/file_${packageId}/file`;
    logDiagnostic(`Download URL: ${downloadUrl}`);
    
    // Get cookies from the session
    const cookies = await mainWindow?.webContents.session.cookies.get({
      url: 'https://api.vrchat.cloud',
    }) || [];
    
    const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    logDiagnostic(`Auth cookies: ${cookies.length} found`);
    
    if (cookies.length === 0) {
      return {
        success: false,
        error: 'Not logged in to VRChat. Please log in first to download avatars.'
      };
    }
    
    // Download to temp file first
    const downloadsPath = app.getPath('downloads');
    const tempPath = path.join(downloadsPath, `${avatarId}_api_download.tmp`);
    const outputPath = path.join(downloadsPath, `${avatarId}.vrca`);
    
    return new Promise((resolve) => {
      const file = fs.createWriteStream(tempPath);
      
      const request = https.get(downloadUrl, {
        headers: {
          'Cookie': cookieString,
          'User-Agent': 'VRCStudio/1.0.0',
        },
        timeout: 120000, // 2 minute timeout for large files
      }, (response) => {
        logDiagnostic(`Response status: ${response.statusCode}`);
        logDiagnostic(`Content-Type: ${response.headers['content-type']}`);
        logDiagnostic(`Content-Length: ${response.headers['content-length']}`);
        
        // Check for redirects or errors
        if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400) {
          const redirectUrl = response.headers.location;
          logDiagnostic(`Redirect to: ${redirectUrl}`);
          // Follow redirect
          file.close();
          fs.unlinkSync(tempPath);
          // Would need to implement redirect following here
          resolve({
            success: false,
            error: `Redirect response (${response.statusCode}). VRChat API may require different authentication.`
          });
          return;
        }
        
        if (response.statusCode && response.statusCode >= 400) {
          file.close();
          fs.unlinkSync(tempPath);
          resolve({
            success: false,
            error: `API returned error ${response.statusCode}: ${response.statusMessage}. ` +
              `This avatar may not be downloadable or you may not have permission.`
          });
          return;
        }
        
        // Check content type
        const contentType = response.headers['content-type'] || '';
        if (contentType.includes('application/json')) {
          let errorData = '';
          response.on('data', chunk => errorData += chunk);
          response.on('end', () => {
            file.close();
            fs.unlinkSync(tempPath);
            try {
              const error = JSON.parse(errorData);
              resolve({
                success: false,
                error: `API Error: ${error.error?.message || JSON.stringify(error)}`
              });
            } catch {
              resolve({
                success: false,
                error: `API returned error: ${errorData.substring(0, 200)}`
              });
            }
          });
          return;
        }
        
        let downloadedBytes = 0;
        const totalBytes = parseInt(response.headers['content-length'] || '0', 10);
        
        response.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          if (downloadedBytes % (1024 * 1024) < chunk.length) {
            logDiagnostic(`Downloaded: ${(downloadedBytes / 1024 / 1024).toFixed(1)} MB`);
          }
        });
        
        response.pipe(file);
        
        file.on('finish', async () => {
          file.close();
          
          logDiagnostic(`Download complete: ${downloadedBytes} bytes`);
          
          // Verify the downloaded file
          if (downloadedBytes < 1000) {
            fs.unlinkSync(tempPath);
            resolve({
              success: false,
              error: 'Downloaded file is too small - likely an error response'
            });
            return;
          }
          
          // Read and check if it's encrypted
          const downloadedBuffer = fs.readFileSync(tempPath);
          const encCheck = isVRChatEncrypted(downloadedBuffer);
          
          if (encCheck.encrypted) {
            logDiagnostic(`WARNING: Downloaded file appears encrypted: ${encCheck.reason}`);
            // Still save it but warn the user
          }
          
          // Check if it's a valid UnityFS
          const header = downloadedBuffer.slice(0, 7).toString('utf8');
          if (header !== 'UnityFS') {
            logDiagnostic(`WARNING: Downloaded file doesn't start with UnityFS header`);
            logDiagnostic(`Header: ${downloadedBuffer.slice(0, 16).toString('hex')}`);
          }
          
          // Patch version if needed
          const patchResult = patchUnityVersionInBuffer(downloadedBuffer);
          fs.writeFileSync(outputPath, patchResult.patched);
          fs.unlinkSync(tempPath);
          
          logDiagnostic(`Saved to: ${outputPath}`);
          logDiagnostic(`Version: ${patchResult.originalVersion} -> ${patchResult.patchedVersion}`);
          logDiagnostic(`========== DOWNLOAD SUCCESS ==========\n`);
          
          // Also create a .unitypackage
          const unityPackagePath = path.join(downloadsPath, `${avatarId}.unitypackage`);
          const tempPatchedPath = path.join(downloadsPath, `${avatarId}_patched.tmp`);
          fs.writeFileSync(tempPatchedPath, patchResult.patched);
          
          try {
            await createUnityPackage(tempPatchedPath, avatarId, unityPackagePath);
            logDiagnostic(`Created .unitypackage: ${unityPackagePath}`);
          } catch (pkgErr: any) {
            logDiagnostic(`Warning: Failed to create .unitypackage: ${pkgErr.message}`);
          } finally {
            if (fs.existsSync(tempPatchedPath)) {
              fs.unlinkSync(tempPatchedPath);
            }
          }
          
          resolve({
            success: true,
            vrcaPath: outputPath,
            unityPackagePath: unityPackagePath,
            size: patchResult.patched.length,
            originalVersion: patchResult.originalVersion,
            patchedVersion: patchResult.patchedVersion,
            wasEncrypted: encCheck.encrypted,
            encryptionNote: encCheck.encrypted ? encCheck.reason : undefined
          });
        });
      });
      
      request.on('error', (err) => {
        logDiagnostic(`Download error: ${err.message}`);
        file.close();
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        resolve({
          success: false,
          error: `Download failed: ${err.message}`
        });
      });
      
      request.on('timeout', () => {
        logDiagnostic('Download timeout');
        request.destroy();
        file.close();
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        resolve({
          success: false,
          error: 'Download timeout - file may be too large or server is slow'
        });
      });
    });
  } catch (err: any) {
    logDiagnostic(`DOWNLOAD FAILED: ${err.message}`);
    return { success: false, error: err.message };
  }
});


// ==================== DECRYPTION IPC HANDLERS ====================

// Check if a bundle is encrypted
ipcMain.handle('decrypt:checkEncryption', async (_e, bundlePath: string) => {
  try {
    if (!fs.existsSync(bundlePath)) {
      return { success: false, error: 'File not found' };
    }
    
    const data = fs.readFileSync(bundlePath);
    const result = vrchatDecryption.detectEncryption(data);
    
    return {
      success: true,
      encrypted: result.encrypted,
      keyId: result.keyId,
      reason: result.reason
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

// Check if VRChat is running
ipcMain.handle('decrypt:isVRChatRunning', async () => {
  const running = await vrchatMemoryExtractor.isVRChatRunning();
  return { running };
});

// Extract keys from VRChat memory
ipcMain.handle('decrypt:extractKeys', async (_e, testFilePath?: string) => {
  try {
    logDiagnostic('\n========== KEY EXTRACTION START ==========');
    
    const result = await vrchatMemoryExtractor.extractKeysFromVRChat(testFilePath);
    
    if (result.success && result.keys) {
      logDiagnostic(`Extracted ${result.keys.length} potential keys`);
    } else {
      logDiagnostic(`Key extraction failed: ${result.error}`);
    }
    
    logDiagnostic('========== KEY EXTRACTION END ==========\n');
    
    return result;
  } catch (err: any) {
    logDiagnostic(`KEY EXTRACTION ERROR: ${err.message}`);
    return { success: false, error: err.message };
  }
});

// Decrypt a bundle using stored keys
ipcMain.handle('decrypt:decryptBundle', async (_e, bundlePath: string, outputPath?: string) => {
  try {
    logDiagnostic('\n========== BUNDLE DECRYPTION START ==========');
    logDiagnostic(`Input: ${bundlePath}`);
    
    const result = await vrchatDecryption.decryptBundle(bundlePath, outputPath);
    
    if (result.success) {
      logDiagnostic(`Decryption successful: ${result.outputPath}`);
      logDiagnostic(`Key used: ${result.keyUsed}`);
    } else {
      logDiagnostic(`Decryption failed: ${result.error}`);
    }
    
    logDiagnostic('========== BUNDLE DECRYPTION END ==========\n');
    
    return result;
  } catch (err: any) {
    logDiagnostic(`DECRYPTION ERROR: ${err.message}`);
    return { success: false, error: err.message };
  }
});

// Get stored decryption keys
ipcMain.handle('decrypt:getStoredKeys', async () => {
  try {
    const keys = vrchatDecryption.loadStoredKeys();
    return {
      success: true,
      keys: keys.map(k => ({
        keyId: k.keyId,
        keyPreview: k.key.slice(0, 4).toString('hex') + '...',
        extractedAt: k.extractedAt,
        source: k.source,
        platform: k.platform
      }))
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

// Manually add a decryption key
ipcMain.handle('decrypt:addKey', async (_e, keyHex: string, keyId?: string) => {
  try {
    const keyBuffer = Buffer.from(keyHex, 'hex');
    
    if (keyBuffer.length !== 16 && keyBuffer.length !== 32) {
      return { success: false, error: 'Key must be 16 bytes (AES-128) or 32 bytes (AES-256)' };
    }
    
    vrchatDecryption.storeKey({
      keyId: keyId || '1019',
      key: keyBuffer,
      extractedAt: Date.now(),
      source: 'manual',
      platform: 'windows'
    });
    
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

// Full decryption pipeline: extract keys + decrypt
ipcMain.handle('decrypt:fullPipeline', async (_e, bundlePath: string) => {
  try {
    logDiagnostic('\n========== FULL DECRYPTION PIPELINE ==========');
    logDiagnostic(`Target file: ${bundlePath}`);
    
    // Step 1: Check if file is encrypted
    const data = fs.readFileSync(bundlePath);
    const encCheck = vrchatDecryption.detectEncryption(data);
    
    if (!encCheck.encrypted) {
      // File is not encrypted - just patch version and return
      logDiagnostic('File is not encrypted, applying version patch only');
      const patchResult = patchUnityVersionInBuffer(data);
      
      const outputPath = bundlePath.replace(/\.(vrca|_data)$/i, '_patched.vrca');
      fs.writeFileSync(outputPath, patchResult.patched);
      
      return {
        success: true,
        encrypted: false,
        outputPath,
        message: 'File was not encrypted. Version patched successfully.'
      };
    }
    
    logDiagnostic(`File is encrypted with key ID: ${encCheck.keyId}`);
    
    // Step 2: Check for stored keys
    let storedKeys = vrchatDecryption.loadStoredKeys();
    
    if (storedKeys.length === 0) {
      // Step 3: Try to extract keys from VRChat
      logDiagnostic('No stored keys, attempting extraction from VRChat...');
      
      const isRunning = await vrchatMemoryExtractor.isVRChatRunning();
      if (!isRunning) {
        return {
          success: false,
          encrypted: true,
          needsVRChat: true,
          error: 'VRChat is not running',
          instructions: `This file is ENCRYPTED by VRChat.\n\nTo decrypt it:\n1. Start VRChat and log in\n2. Load any avatar (to trigger key loading)\n3. Keep VRChat running\n4. Click "Extract Keys" button\n5. Then try decrypting again\n\nNote: Requires Administrator privileges. EAC may block key extraction.`
        };
      }
      
      // Extract keys
      const extractResult = await vrchatMemoryExtractor.extractKeysFromVRChat(bundlePath);
      
      if (!extractResult.success) {
        return {
          success: false,
          encrypted: true,
          error: extractResult.error,
          instructions: extractResult.instructions
        };
      }
      
      // Reload stored keys
      storedKeys = vrchatDecryption.loadStoredKeys();
    }
    
    // Step 4: Attempt decryption
    logDiagnostic(`Attempting decryption with ${storedKeys.length} stored keys...`);
    const decryptResult = await vrchatDecryption.decryptBundle(bundlePath);
    
    if (decryptResult.success) {
      // Step 5: Patch version on decrypted file
      const decryptedData = fs.readFileSync(decryptResult.outputPath!);
      const patchResult = patchUnityVersionInBuffer(decryptedData);
      fs.writeFileSync(decryptResult.outputPath!, patchResult.patched);
      
      logDiagnostic('Decryption and version patching complete!');
      
      return {
        success: true,
        encrypted: true,
        decrypted: true,
        outputPath: decryptResult.outputPath,
        keyUsed: decryptResult.keyUsed,
        versionPatched: {
          from: patchResult.originalVersion,
          to: patchResult.patchedVersion
        }
      };
    }
    
    return {
      success: false,
      encrypted: true,
      error: decryptResult.error,
      instructions: 'Stored keys could not decrypt this file. The key may have been rotated. Try extracting fresh keys while VRChat is running.'
    };
    
  } catch (err: any) {
    logDiagnostic(`PIPELINE ERROR: ${err.message}`);
    return { success: false, error: err.message };
  }
});


ipcMain.handle('fs:launchAssetRipper', async (_e, bundlePath: string, avatarId?: string) => {
  if (process.platform !== 'win32') {
    return { success: false, error: 'AssetRipper launcher currently supports Windows only.' };
  }

  try {
    if (!bundlePath || !fs.existsSync(bundlePath)) {
      return { success: false, error: 'Bundle path is missing or does not exist.' };
    }

    // AssetRipper should consume the raw UnityFS bundle (.vrca/_data), not .unitypackage.
    // If a .unitypackage is provided, extract the embedded .vrca first.
    let ripperInputPath = bundlePath;

    // FINAL fallback mode: when a raw VRChat cache `_data` file is selected,
    // feed AssetRipper the entire containing cache folder so it can resolve
    // sidecar metadata/files instead of a single extracted blob.
    if (path.basename(bundlePath).toLowerCase() === '_data') {
      ripperInputPath = path.dirname(bundlePath);
    }

    if (bundlePath.toLowerCase().endsWith('.unitypackage')) {
      try {
        const gz = fs.readFileSync(bundlePath);
        const tar = zlib.gunzipSync(gz);
        let offset = 0;
        let pendingPathname: string | null = null;
        let extracted = false;

        while (offset + 512 <= tar.length) {
          const header = tar.subarray(offset, offset + 512);
          offset += 512;

          // End-of-archive block
          if (header.every(b => b === 0)) break;

          const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '');
          const sizeOct = header.subarray(124, 136).toString('utf8').replace(/\0.*$/, '').trim();
          const size = parseInt(sizeOct || '0', 8) || 0;

          const fileData = tar.subarray(offset, offset + size);
          const padded = Math.ceil(size / 512) * 512;
          offset += padded;

          if (name.endsWith('/pathname')) {
            pendingPathname = fileData.toString('utf8').replace(/\0.*$/, '');
            continue;
          }

          if (name.endsWith('/asset') && pendingPathname && pendingPathname.toLowerCase().endsWith('.vrca')) {
            const tempDir = path.join(app.getPath('temp'), 'VRCStudio-AssetRipper');
            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
            const outPath = path.join(tempDir, `${avatarId || path.basename(bundlePath, '.unitypackage')}.vrca`);
            fs.writeFileSync(outPath, fileData);
            ripperInputPath = outPath;
            extracted = true;
            break;
          }
        }

        if (!extracted) {
          return { success: false, error: 'Could not find embedded .vrca inside .unitypackage for AssetRipper.' };
        }
      } catch (e) {
        return { success: false, error: `Failed to extract .vrca from unitypackage: ${e instanceof Error ? e.message : 'Unknown error'}` };
      }
    }

    const localAppData = process.env.LOCALAPPDATA || path.join(app.getPath('home'), 'AppData', 'Local');
    const userDataTools = path.join(app.getPath('userData'), 'tools');
    const candidates = [
      path.join(userDataTools, 'AssetRipper', 'AssetRipper.CLI.exe'),
      path.join(userDataTools, 'AssetRipper', 'AssetRipper.GUI.Free.exe'),
      path.join(localAppData, 'AssetRipper', 'AssetRipper.CLI.exe'),
      path.join(localAppData, 'AssetRipper', 'AssetRipper.GUI.Free.exe'),
      path.join('C:\\', 'Program Files', 'AssetRipper', 'AssetRipper.CLI.exe'),
      path.join('C:\\', 'Program Files', 'AssetRipper', 'AssetRipper.GUI.Free.exe'),
    ];

    let ripperExe = candidates.find(p => fs.existsSync(p));

    if (!ripperExe) {
      if (!mainWindow) return { success: false, error: 'Main window unavailable for picker dialog.' };
      const pick = await dialog.showOpenDialog(mainWindow, {
        title: 'Locate AssetRipper executable',
        properties: ['openFile'],
        filters: [{ name: 'Executables', extensions: ['exe'] }],
      });
      if (pick.canceled || pick.filePaths.length === 0) {
        return { success: false, error: 'No AssetRipper executable selected.' };
      }
      ripperExe = pick.filePaths[0];
    }

    const startViaShell = (exePath: string, args: string[] = []) => {
      // Use `start` through cmd to mirror Explorer launch behavior.
      // This is more reliable for SmartScreen/UAC-prompted executables.
      const quotedExe = `"${exePath}"`;
      const quotedArgs = args.map(a => `"${a}"`).join(' ');
      const cmdLine = `${quotedExe}${quotedArgs ? ` ${quotedArgs}` : ''}`;
      const child = spawn('cmd.exe', ['/c', 'start', '', cmdLine], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });
      child.unref();
    };

    const lower = ripperExe.toLowerCase();
    if (lower.includes('cli')) {
      const outputDir = path.join(app.getPath('downloads'), 'VRCStudio-AssetRipper', avatarId || `bundle-${Date.now()}`);
      if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

      // Launch with shell semantics for better SmartScreen/UAC compatibility.
      startViaShell(ripperExe, [ripperInputPath, outputDir]);

      return {
        success: true,
        message: `Launched AssetRipper CLI.\nInput: ${ripperInputPath}\nOutput: ${outputDir}`,
        outputDir,
        executable: ripperExe,
      };
    }

    // GUI fallback - launch through shell/start so users can approve SmartScreen prompts.
    // Then pass the selected bundle path as an argument when supported by that build.
    startViaShell(ripperExe, [ripperInputPath]);

    return {
      success: true,
      message: `Launched AssetRipper GUI for: ${path.basename(ripperInputPath)}.\nIf SmartScreen appears, click More info > Run anyway.`,
      executable: ripperExe,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to launch AssetRipper: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
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
