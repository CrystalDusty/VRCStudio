import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // Window
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  quit: () => ipcRenderer.invoke('window:quit'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),

  // Settings sync
  setMinimizeToTray: (value: boolean) => ipcRenderer.invoke('settings:setMinimizeToTray', value),

  // Shell
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),

  // File system
  readFile: (path: string) => ipcRenderer.invoke('fs:readFile', path),
  listDir: (path: string) => ipcRenderer.invoke('fs:listDir', path),
  searchCacheForDataFiles: (avatarId?: string) => ipcRenderer.invoke('fs:searchCacheForDataFiles', avatarId),
  browseCacheFolder: () => ipcRenderer.invoke('fs:browseCacheFolder'),
  extractAvatarToDownloads: (cacheDataPath: string, avatarId: string) => ipcRenderer.invoke('fs:extractAvatarToDownloads', cacheDataPath, avatarId),
  getDiagnosticLog: () => ipcRenderer.invoke('fs:getDiagnosticLog'),
  getVRChatLogPath: () => ipcRenderer.invoke('fs:getVRChatLogPath'),
  getVRChatScreenshotPath: () => ipcRenderer.invoke('fs:getVRChatScreenshotPath'),

  // Avatar bundles
  getAvatarBundlePath: () => ipcRenderer.invoke('fs:getAvatarBundlePath'),
  downloadFile: (url: string, avatarId: string, onProgress?: (current: number, total: number) => void) => {
    if (onProgress) {
      ipcRenderer.on('fs:downloadFile:progress', (_event, current: number, total: number) => {
        onProgress(current, total);
      });
    }
    return ipcRenderer.invoke('fs:downloadFile', url, avatarId);
  },
  downloadFileNative: (url: string, avatarId: string) => ipcRenderer.invoke('fs:downloadFileNative', url, avatarId),
  extractBundle: (sourcePath: string, avatarId: string) => ipcRenderer.invoke('fs:extractBundle', sourcePath, avatarId),
  openBundleFolder: (folderPath: string) => ipcRenderer.invoke('fs:openBundleFolder', folderPath),
  launchAssetRipper: (bundlePath: string, avatarId?: string) => ipcRenderer.invoke('fs:launchAssetRipper', bundlePath, avatarId),
  deleteBundleData: (avatarId: string) => ipcRenderer.invoke('fs:deleteBundleData', avatarId),
  openFileDialog: (options: { title?: string; message?: string; filters?: any[] }) => ipcRenderer.invoke('fs:openFileDialog', options),

  // Persistent app data storage
  saveAppData: (key: string, data: string) => ipcRenderer.invoke('storage:saveAppData', key, data),
  loadAppData: (key: string) => ipcRenderer.invoke('storage:loadAppData', key),
  deleteAppData: (key: string) => ipcRenderer.invoke('storage:deleteAppData', key),
  clearAllAppData: () => ipcRenderer.invoke('storage:clearAllAppData'),

  // Notifications
  sendNotification: (opts: { title: string; body: string; icon?: string }) =>
    ipcRenderer.invoke('notification:send', opts),

  // Discord RPC
  discordInit: (clientId: string) => ipcRenderer.invoke('discord:init', clientId),
  discordDisconnect: () => ipcRenderer.invoke('discord:disconnect'),
  discordSetActivity: (activity: any) => ipcRenderer.invoke('discord:setActivity', activity),
  discordIsConnected: () => ipcRenderer.invoke('discord:isConnected'),

  // Auto-launch
  setAutoLaunch: (enabled: boolean) => ipcRenderer.invoke('autoLaunch:set', enabled),
  getAutoLaunch: () => ipcRenderer.invoke('autoLaunch:get'),

  // App info
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  getPlatform: () => ipcRenderer.invoke('app:getPlatform'),

  // VRChat API proxy
  vrchatRequest: (opts: {
    method: string;
    path: string;
    headers?: Record<string, string>;
    body?: string;
    cookies?: Record<string, string>;
  }) => ipcRenderer.invoke('vrchat:request', opts),
});
