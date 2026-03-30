import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // Window
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),

  // Shell
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),

  // File system
  readFile: (path: string) => ipcRenderer.invoke('fs:readFile', path),
  listDir: (path: string) => ipcRenderer.invoke('fs:listDir', path),
  getVRChatLogPath: () => ipcRenderer.invoke('fs:getVRChatLogPath'),
  getVRChatScreenshotPath: () => ipcRenderer.invoke('fs:getVRChatScreenshotPath'),

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
