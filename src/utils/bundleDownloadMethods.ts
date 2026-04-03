/**
 * Multiple methods to obtain avatar bundles
 * Falls back through options if one fails
 */

import type { VRCAvatar } from '../types/vrchat';

const isElectron = () => {
  return typeof window !== 'undefined' && !!(window as any).electronAPI;
};

/**
 * Method 1: Check VRChat's local cache for already-downloaded avatars
 * VRChat downloads and caches avatars in AppData
 */
export async function tryVRChatCache(
  avatarId: string,
  avatarName: string
): Promise<{ success: boolean; path?: string; error?: string }> {
  if (!isElectron()) {
    return { success: false, error: 'Not in Electron environment' };
  }

  try {
    const electronAPI = (window as any).electronAPI;

    // VRChat cache locations (Windows)
    const cacheLocations = [
      `C:\\Users\\${process.env.USERNAME}\\AppData\\LocalLow\\VRChat\\VRChat\\Cache-WebGL`,
      `C:\\Users\\${process.env.USERNAME}\\AppData\\LocalLow\\VRChat\\VRChat\\Cache`,
      `C:\\Users\\${process.env.USERNAME}\\AppData\\LocalLow\\VRChat\\VRChat\\file_${avatarId}`,
    ];

    console.log('[BundleDownload] Checking VRChat cache for avatar:', avatarId);

    for (const cachePath of cacheLocations) {
      try {
        const files = await electronAPI.listDir(cachePath);
        console.log(`[BundleDownload] Cache location: ${cachePath}`);
        console.log(`[BundleDownload] Found files:`, files);

        // Look for .unitypackage or related files
        if (files && files.length > 0) {
          // Try to find and copy the avatar bundle
          const bundleFile = files.find((f: any) =>
            f.name?.includes(avatarId) || f.name?.endsWith('.unitypackage')
          );

          if (bundleFile) {
            console.log(`[BundleDownload] Found avatar bundle in cache:`, bundleFile.name);
            // File found in cache - would need to copy it
            return {
              success: true,
              path: `${cachePath}\\${bundleFile.name}`,
            };
          }
        }
      } catch (e) {
        // Cache location doesn't exist, try next
        console.log(`[BundleDownload] Cache not found at: ${cachePath}`);
      }
    }

    return {
      success: false,
      error: 'Avatar not found in VRChat cache',
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to check cache',
    };
  }
}

/**
 * Method 2: File picker - Let user select manually downloaded bundle
 */
export async function promptForManualFile(
  avatarName: string
): Promise<{ success: boolean; path?: string; error?: string }> {
  if (!isElectron()) {
    return { success: false, error: 'Not in Electron environment' };
  }

  try {
    const electronAPI = (window as any).electronAPI;

    // Check if dialog API is available
    if (!electronAPI.openFileDialog) {
      return {
        success: false,
        error: 'File picker not available',
      };
    }

    console.log('[BundleDownload] Opening file picker for:', avatarName);

    const result = await electronAPI.openFileDialog({
      title: `Select ${avatarName} Avatar Bundle`,
      message: 'Select the .unitypackage file you downloaded from VRChat',
      filters: [
        { name: 'Unity Packages', extensions: ['unitypackage'] },
        { name: 'ZIP Archives', extensions: ['zip'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });

    if (result.filePath) {
      console.log('[BundleDownload] File selected:', result.filePath);
      return {
        success: true,
        path: result.filePath,
      };
    }

    return {
      success: false,
      error: 'No file selected',
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to open file picker',
    };
  }
}

/**
 * Method 3: API authenticated download (with session cookies)
 */
export async function downloadViaAuthenticatedAPI(
  url: string,
  avatarId: string,
  onProgress?: (current: number, total: number) => void
): Promise<{ success: boolean; path?: string; error?: string }> {
  if (!isElectron()) {
    return { success: false, error: 'Not in Electron environment' };
  }

  try {
    const electronAPI = (window as any).electronAPI;

    console.log('[BundleDownload] Attempting authenticated API download');

    // Set up progress listener
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
      const bundlePath = await electronAPI.downloadFile(url, avatarId);

      if (unsubscribe) unsubscribe();

      console.log('[BundleDownload] API download successful');
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
      error: error instanceof Error ? error.message : 'API download failed',
    };
  }
}

/**
 * Master function: Try all methods in fallback order
 */
export async function downloadBundleWithFallback(
  avatar: VRCAvatar,
  packageUrl: string,
  onProgress?: (current: number, total: number) => void,
  onMethodAttempt?: (method: string) => void
): Promise<{ success: boolean; path?: string; error?: string; method?: string }> {
  console.log('[BundleDownload] Starting download with fallback chain');

  // Method 1: Check VRChat cache
  console.log('[BundleDownload] Method 1: Checking VRChat cache...');
  onMethodAttempt?.('checking VRChat cache');
  const cacheResult = await tryVRChatCache(avatar.id, avatar.name);
  if (cacheResult.success && cacheResult.path) {
    console.log('[BundleDownload] ✓ Success via cache');
    return { ...cacheResult, method: 'cache' };
  }
  console.log('[BundleDownload] ✗ Cache failed:', cacheResult.error);

  // Method 2: File picker
  console.log('[BundleDownload] Method 2: Prompting for manual file...');
  onMethodAttempt?.('prompting for manual file selection');
  const manualResult = await promptForManualFile(avatar.name);
  if (manualResult.success && manualResult.path) {
    console.log('[BundleDownload] ✓ Success via manual selection');
    return { ...manualResult, method: 'manual' };
  }
  console.log('[BundleDownload] ✗ Manual selection failed:', manualResult.error);

  // All methods failed
  console.log('[BundleDownload] ✗ Both download methods failed');
  return {
    success: false,
    error: 'Bundle not found in VRChat cache. Please download the avatar bundle manually from vrchat.com and select it using the file picker.',
    method: 'none',
  };
}
