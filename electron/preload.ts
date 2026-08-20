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
  setAlwaysOnTop: (value: boolean) => ipcRenderer.invoke('window:setAlwaysOnTop', value),

  // Shell
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),

  // File system
  listDir: (path: string) => ipcRenderer.invoke('fs:listDir', path),
  getVRChatLogPath: () => ipcRenderer.invoke('fs:getVRChatLogPath'),
  getVRChatScreenshotPath: () => ipcRenderer.invoke('fs:getVRChatScreenshotPath'),

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
  discordStatus: () => ipcRenderer.invoke('discord:status'),

  // Auto-launch
  setAutoLaunch: (enabled: boolean) => ipcRenderer.invoke('autoLaunch:set', enabled),
  getAutoLaunch: () => ipcRenderer.invoke('autoLaunch:get'),

  // App info
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  getPlatform: () => ipcRenderer.invoke('app:getPlatform'),

  // Audio visualizer / media detection
  getDesktopSources: () => ipcRenderer.invoke('audio:getDesktopSources'),
  detectMedia: () => ipcRenderer.invoke('audio:detectMedia'),

  // VRChat API proxy
  vrchatRequest: (opts: {
    method: string;
    path: string;
    headers?: Record<string, string>;
    body?: string;
    cookies?: Record<string, string>;
  }) => ipcRenderer.invoke('vrchat:request', opts),

  // Generic outbound GET (routes through main process, sends User-Agent: VRCX)
  httpGet: (url: string, headers?: Record<string, string>) =>
    ipcRenderer.invoke('http:get', url, headers),
  httpGetBinary: (url: string, headers?: Record<string, string>) =>
    ipcRenderer.invoke('http:getBinary', url, headers),
  inspectImage: (url: string) => ipcRenderer.invoke('image:inspect', url),
  probePublicImage: (url: string) => ipcRenderer.invoke('image:probePublic', url),

  // OSC (VRChat)
  oscStart: (opts?: { sendHost?: string; sendPort?: number; recvPort?: number }) =>
    ipcRenderer.invoke('osc:start', opts || {}),
  oscStop: () => ipcRenderer.invoke('osc:stop'),
  oscStatus: () => ipcRenderer.invoke('osc:status'),
  oscProbePort: (port: number) => ipcRenderer.invoke('osc:probePort', port),
  oscSend: (address: string, args?: any[]) => ipcRenderer.invoke('osc:send', address, args || []),
  oscGetCachedParams: () => ipcRenderer.invoke('osc:getCachedParams'),
  oscClearCache: () => ipcRenderer.invoke('osc:clearCache'),
  onOscMessage: (cb: (msg: { address: string; args: any[] }) => void) => {
    const handler = (_e: any, msg: any) => cb(msg);
    ipcRenderer.on('osc:message', handler);
    return () => ipcRenderer.removeListener('osc:message', handler);
  },
  onOscStatus: (cb: (status: any) => void) => {
    const handler = (_e: any, status: any) => cb(status);
    ipcRenderer.on('osc:status', handler);
    return () => ipcRenderer.removeListener('osc:status', handler);
  },

  // Tray quick-status events (from right-click menu)
  onTraySetStatus: (cb: (status: string) => void) => {
    const handler = (_e: any, status: string) => cb(status);
    ipcRenderer.on('tray:setStatus', handler);
    return () => ipcRenderer.removeListener('tray:setStatus', handler);
  },

  // VRChat log tailing (for live video-player tracking, etc.)
  logStartTailing: () => ipcRenderer.invoke('log:startTailing'),
  logStopTailing:  () => ipcRenderer.invoke('log:stopTailing'),
  logReadBacklog:  (maxLines?: number) => ipcRenderer.invoke('log:readBacklog', maxLines),
  logStatus:       () => ipcRenderer.invoke('log:status'),
  onVRChatLogLines: (cb: (lines: string[]) => void) => {
    const handler = (_e: any, lines: string[]) => cb(lines);
    ipcRenderer.on('vrchat:logLines', handler);
    return () => ipcRenderer.removeListener('vrchat:logLines', handler);
  },
  onVRChatLogStatus: (cb: (status: { active: boolean; path?: string; reason?: string }) => void) => {
    const handler = (_e: any, status: any) => cb(status);
    ipcRenderer.on('vrchat:logStatus', handler);
    return () => ipcRenderer.removeListener('vrchat:logStatus', handler);
  },

  // Auto-updater (source-tree updates from GitHub)
  updateGetCurrentCommit: () => ipcRenderer.invoke('update:getCurrentCommit'),
  updateGetBranch: () => ipcRenderer.invoke('update:getBranch'),
  updateSetBranch: (branch: string) => ipcRenderer.invoke('update:setBranch', branch),
  updateCheck: () => ipcRenderer.invoke('update:check'),
  updateDownloadAndApply: () => ipcRenderer.invoke('update:downloadAndApply'),
  updateGetLastApplied: () => ipcRenderer.invoke('update:getLastApplied'),
  onUpdateProgress: (cb: (msg: { stage: string; received: number; total: number }) => void) => {
    const handler = (_e: any, msg: any) => cb(msg);
    ipcRenderer.on('update:progress', handler);
    return () => ipcRenderer.removeListener('update:progress', handler);
  },

  // Discord bot
  botStart:        (token: string) => ipcRenderer.invoke('bot:start', token),
  botStop:         () => ipcRenderer.invoke('bot:stop'),
  botStatus:       () => ipcRenderer.invoke('bot:status'),
  botSyncState:    (snapshot: any) => ipcRenderer.invoke('bot:syncState', snapshot),
  botActionResult: (payload: { id: string; ok: boolean; error?: string; data?: any }) =>
    ipcRenderer.invoke('bot:actionResult', payload),
  onBotExecuteAction: (cb: (payload: { id: string; action: string; payload: any }) => void) => {
    const handler = (_e: any, p: any) => cb(p);
    ipcRenderer.on('bot:executeAction', handler);
    return () => ipcRenderer.removeListener('bot:executeAction', handler);
  },
});
