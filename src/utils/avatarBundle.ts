import { useAvatarBundleStore, AvatarBundleMetadata } from '../stores/avatarBundleStore';
import type { VRCAvatar } from '../types/vrchat';

// Check if running in Electron environment
const isElectron = () => {
  return typeof window !== 'undefined' && !!(window as any).electronAPI;
};

/**
 * Download an avatar bundle from VRChat
 */
export async function downloadAvatarBundle(
  avatar: VRCAvatar,
  selectedPackageId: string,
  onProgress?: (current: number, total: number) => void
): Promise<{ success: boolean; path?: string; error?: string }> {
  if (!isElectron()) {
    return {
      success: false,
      error: 'Bundle download only available in Electron app',
    };
  }

  try {
    // For now, we would need to construct the download URL from VRChat API
    // In a real implementation, this would use the package's asset URL
    const bundleUrl = `https://api.vrchat.cloud/file/file_${selectedPackageId}/file`;

    const electronAPI = (window as any).electronAPI;

    // Set up progress listener if callback provided
    let unsubscribe: (() => void) | null = null;
    if (onProgress && (window as any).ipcRenderer) {
      const listener = (_event: any, current: number, total: number) => {
        onProgress(current, total);
      };
      (window as any).ipcRenderer.on('fs:downloadFile:progress', listener);
      unsubscribe = () => {
        (window as any).ipcRenderer.removeListener('fs:downloadFile:progress', listener);
      };
    }

    try {
      const bundlePath = await electronAPI.downloadFile(bundleUrl, avatar.id);

      if (unsubscribe) unsubscribe();

      return {
        success: true,
        path: bundlePath,
      };
    } finally {
      if (unsubscribe) unsubscribe();
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to download bundle',
    };
  }
}

/**
 * Extract a downloaded avatar bundle
 */
export async function extractAvatarBundle(
  bundlePath: string,
  avatarId: string
): Promise<{ success: boolean; extractedPath?: string; error?: string }> {
  if (!isElectron()) {
    return {
      success: false,
      error: 'Bundle extraction only available in Electron app',
    };
  }

  try {
    const electronAPI = (window as any).electronAPI;
    const store = useAvatarBundleStore.getState();

    store.setExtracting(avatarId, true);

    const extractedPath = await electronAPI.extractBundle(bundlePath, avatarId);

    store.setExtracting(avatarId, false);

    return {
      success: true,
      extractedPath,
    };
  } catch (error) {
    useAvatarBundleStore.getState().setExtracting(avatarId, false);

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to extract bundle',
    };
  }
}

/**
 * Open extracted bundle folder in file explorer
 */
export async function openBundleFolder(avatarId: string): Promise<void> {
  if (!isElectron()) {
    throw new Error('Bundle folder open only available in Electron app');
  }

  try {
    const bundle = useAvatarBundleStore.getState().getBundle(avatarId);
    if (!bundle) {
      throw new Error('Bundle not found');
    }

    const electronAPI = (window as any).electronAPI;
    await electronAPI.openBundleFolder(bundle.bundlePath);
  } catch (error) {
    throw error instanceof Error ? error : new Error('Failed to open bundle folder');
  }
}

/**
 * Delete downloaded bundle locally
 */
export async function deleteBundleLocally(avatarId: string): Promise<{ success: boolean; error?: string }> {
  if (!isElectron()) {
    return {
      success: false,
      error: 'Bundle deletion only available in Electron app',
    };
  }

  try {
    const electronAPI = (window as any).electronAPI;
    await electronAPI.deleteBundleData(avatarId);

    useAvatarBundleStore.getState().removeBundle(avatarId);

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete bundle',
    };
  }
}

/**
 * Get all stored bundles
 */
export function getStoredBundles(): AvatarBundleMetadata[] {
  return useAvatarBundleStore.getState().getAllBundles();
}

/**
 * Check if a bundle is already downloaded
 */
export function isBundleDownloaded(avatarId: string): boolean {
  return useAvatarBundleStore.getState().getBundle(avatarId) !== undefined;
}

/**
 * Add bundle to store after successful download
 */
export function addBundleToStore(
  avatarId: string,
  avatarName: string,
  platform: string,
  bundlePath: string,
  bundleSize: number,
  unityVersion: string,
  packageId: string
): void {
  const store = useAvatarBundleStore.getState();
  store.addBundle({
    avatarId,
    avatarName,
    platform,
    downloadedAt: new Date().toISOString(),
    bundlePath,
    bundleSize,
    unityVersion,
    packageId,
  });
}
