/// <reference types="vite/client" />

interface ElectronAPI {
  minimize: () => Promise<void>;
  maximize: () => Promise<void>;
  close: () => Promise<void>;
  quit: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  setMinimizeToTray: (value: boolean) => Promise<void>;
  openExternal: (url: string) => Promise<void>;
  readFile: (path: string) => Promise<{ success: boolean; content?: string; error?: string }>;
  listDir: (path: string) => Promise<{ success: boolean; entries?: Array<{ name: string; isDirectory: boolean; path: string }>; error?: string }>;
  searchCacheForDataFiles: (avatarId?: string) => Promise<{ success: boolean; bundles?: string[]; scannedDirs?: number; error?: string }>;
  getVRChatLogPath: () => Promise<string>;
  getVRChatScreenshotPath: () => Promise<string>;
  sendNotification: (opts: { title: string; body: string; icon?: string }) => Promise<void>;
  discordInit: (clientId: string) => Promise<void>;
  discordDisconnect: () => Promise<void>;
  discordSetActivity: (activity: any) => Promise<void>;
  discordIsConnected: () => Promise<boolean>;
  setAutoLaunch: (enabled: boolean) => Promise<void>;
  getAutoLaunch: () => Promise<boolean>;
  getVersion: () => Promise<string>;
  getPlatform: () => Promise<string>;
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
}

interface Window {
  electronAPI?: ElectronAPI;
}
