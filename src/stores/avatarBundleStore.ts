import { create } from 'zustand';

export interface AvatarBundleMetadata {
  avatarId: string;
  avatarName: string;
  platform: string;
  downloadedAt: string;
  bundlePath: string;
  bundleSize: number;
  unityVersion: string;
  packageId: string;
}

interface AvatarBundleState {
  bundles: Record<string, AvatarBundleMetadata>;
  downloadProgress: Record<string, { current: number; total: number }>;
  extracting: Record<string, boolean>;

  // Actions
  addBundle: (metadata: AvatarBundleMetadata) => void;
  removeBundle: (avatarId: string) => void;
  getBundle: (avatarId: string) => AvatarBundleMetadata | undefined;
  getAllBundles: () => AvatarBundleMetadata[];

  setDownloadProgress: (avatarId: string, current: number, total: number) => void;
  clearDownloadProgress: (avatarId: string) => void;

  setExtracting: (avatarId: string, isExtracting: boolean) => void;
}

const STORAGE_KEY = 'vrcstudio_avatar_bundles';

function loadBundles(): Record<string, AvatarBundleMetadata> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveBundles(bundles: Record<string, AvatarBundleMetadata>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bundles));
  } catch {
    console.error('Failed to save avatar bundle metadata');
  }
}

export const useAvatarBundleStore = create<AvatarBundleState>((set, get) => ({
  bundles: loadBundles(),
  downloadProgress: {},
  extracting: {},

  addBundle: (metadata: AvatarBundleMetadata) => {
    set(state => {
      const newBundles = {
        ...state.bundles,
        [metadata.avatarId]: metadata,
      };
      saveBundles(newBundles);
      return { bundles: newBundles };
    });
  },

  removeBundle: (avatarId: string) => {
    set(state => {
      const newBundles = { ...state.bundles };
      delete newBundles[avatarId];
      saveBundles(newBundles);
      return { bundles: newBundles };
    });
  },

  getBundle: (avatarId: string) => {
    return get().bundles[avatarId];
  },

  getAllBundles: () => {
    return Object.values(get().bundles);
  },

  setDownloadProgress: (avatarId: string, current: number, total: number) => {
    set(state => ({
      downloadProgress: {
        ...state.downloadProgress,
        [avatarId]: { current, total },
      },
    }));
  },

  clearDownloadProgress: (avatarId: string) => {
    set(state => {
      const newProgress = { ...state.downloadProgress };
      delete newProgress[avatarId];
      return { downloadProgress: newProgress };
    });
  },

  setExtracting: (avatarId: string, isExtracting: boolean) => {
    set(state => ({
      extracting: {
        ...state.extracting,
        [avatarId]: isExtracting,
      },
    }));
  },
}));
