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
    // Find the selected package to get its download URL
    const selectedPackage = avatar.unityPackages?.find(p => p.id === selectedPackageId);
    if (!selectedPackage) {
      return {
        success: false,
        error: 'Selected package not found',
      };
    }

    // Use the package's direct download URL if available, otherwise construct it
    const bundleUrl = selectedPackage.unityPackageUrl ||
                      `https://api.vrchat.cloud/file/file_${selectedPackageId}/file`;

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
 * Returns the path to the extracted bundle contents
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
    if (!electronAPI?.extractBundle) {
      throw new Error('Extract bundle API not available');
    }

    const store = useAvatarBundleStore.getState();
    store.setExtracting(avatarId, true);

    // Extract returns the path to the extracted directory
    const extractedPath = await electronAPI.extractBundle(bundlePath, avatarId);

    store.setExtracting(avatarId, false);

    if (!extractedPath) {
      throw new Error('No extraction path returned from Electron');
    }

    return {
      success: true,
      extractedPath,
    };
  } catch (error) {
    useAvatarBundleStore.getState().setExtracting(avatarId, false);

    const errorMessage = error instanceof Error
      ? error.message
      : 'Failed to extract bundle. Make sure the downloaded file is a valid .unitypackage';

    return {
      success: false,
      error: errorMessage,
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
