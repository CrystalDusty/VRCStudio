/**
 * VRChat Cache Extractor
 * Finds and extracts avatar bundles from local VRChat installation
 */

const isElectron = () => {
  return typeof window !== 'undefined' && !!(window as any).electronAPI;
};

/**
 * Find VRChat installation directory
 */
export async function findVRChatInstallation(): Promise<string | null> {
  if (!isElectron()) {
    return null;
  }

  try {
    const electronAPI = (window as any).electronAPI;

    // Common VRChat installation paths on Windows
    const commonPaths = [
      'C:\\Program Files\\VRChat\\VRChat.exe',
      'C:\\Program Files (x86)\\VRChat\\VRChat.exe',
      'C:\\SteamLibrary\\steamapps\\common\\VRChat\\VRChat.exe',
      'D:\\SteamLibrary\\steamapps\\common\\VRChat\\VRChat.exe',
    ];

    // Check each path
    for (const exePath of commonPaths) {
      const dir = exePath.substring(0, exePath.lastIndexOf('\\'));
      try {
        const files = await electronAPI.listDir(dir);
        if (files && files.length > 0) {
          console.log('[VRChatCache] Found VRChat installation at:', dir);
          return dir;
        }
      } catch (e) {
        // Path doesn't exist, try next
      }
    }

    console.log('[VRChatCache] VRChat installation not found');
    return null;
  } catch (error) {
    console.error('[VRChatCache] Error finding installation:', error);
    return null;
  }
}

/**
 * Find avatar bundle in VRChat cache
 */
export async function findAvatarBundleInCache(
  avatarId: string
): Promise<string | null> {
  if (!isElectron()) {
    return null;
  }

  try {
    const electronAPI = (window as any).electronAPI;
    const username = (window as any).electronAPI?.username || process.env.USERNAME || 'User';

    // VRChat cache locations
    const cachePaths = [
      `C:\\Users\\${username}\\AppData\\LocalLow\\VRChat\\VRChat\\Cache-WebGL`,
      `C:\\Users\\${username}\\AppData\\LocalLow\\VRChat\\VRChat\\Cache`,
      `C:\\Users\\${username}\\AppData\\LocalLow\\VRChat\\VRChat\\file_${avatarId}`,
    ];

    console.log('[VRChatCache] Searching for avatar:', avatarId);

    for (const cachePath of cachePaths) {
      try {
        const files = await electronAPI.listDir(cachePath);

        if (files && files.length > 0) {
          console.log(`[VRChatCache] Checking path: ${cachePath}`);

          // Look for avatar bundle files
          for (const file of files) {
            if (
              file.name &&
              (file.name.includes(avatarId) ||
                file.name.endsWith('.unitypackage') ||
                file.name.includes('bundle'))
            ) {
              const fullPath = `${cachePath}\\${file.name}`;
              console.log('[VRChatCache] Found potential avatar file:', fullPath);
              return fullPath;
            }
          }
        }
      } catch (e) {
        // Path doesn't exist, continue
        console.log(`[VRChatCache] Cache path not found: ${cachePath}`);
      }
    }

    console.log('[VRChatCache] Avatar not found in cache');
    return null;
  } catch (error) {
    console.error('[VRChatCache] Error searching cache:', error);
    return null;
  }
}

/**
 * Extract avatar bundle from cache and return blob
 */
export async function extractBundleFromCache(
  bundlePath: string
): Promise<{ success: boolean; blob?: Blob; error?: string }> {
  try {
    console.log('[VRChatCache] Reading bundle from:', bundlePath);

    // Use fetch to read the file as blob
    const response = await fetch(`file:///${bundlePath.replace(/\\/g, '/')}`);

    if (!response.ok) {
      throw new Error(`Failed to read file: ${response.statusText}`);
    }

    const blob = await response.blob();
    console.log('[VRChatCache] Bundle read successfully, size:', blob.size);

    return {
      success: true,
      blob,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[VRChatCache] Error reading bundle:', errorMsg);
    return {
      success: false,
      error: errorMsg,
    };
  }
}

/**
 * Check if avatar has a cached bundle in VRChat
 */
export async function hasAvatarInCache(avatarId: string): Promise<boolean> {
  const bundlePath = await findAvatarBundleInCache(avatarId);
  return bundlePath !== null;
}

/**
 * Get bundle file info from cache
 */
export async function getAvatarBundleInfo(
  avatarId: string
): Promise<{ found: boolean; size?: number; path?: string; error?: string }> {
  try {
    const bundlePath = await findAvatarBundleInCache(avatarId);

    if (!bundlePath) {
      return {
        found: false,
        error: 'Avatar not found in VRChat cache',
      };
    }

    if (!isElectron()) {
      return {
        found: false,
        error: 'Not in Electron environment',
      };
    }

    // Try to get file size
    try {
      const electronAPI = (window as any).electronAPI;
      const files = await electronAPI.listDir(bundlePath.substring(0, bundlePath.lastIndexOf('\\')));

      const file = files?.find((f: any) => `${bundlePath.substring(0, bundlePath.lastIndexOf('\\')).replace(/\\/g, '/')}/${f.name}` === bundlePath.replace(/\\/g, '/'));

      if (file) {
        return {
          found: true,
          path: bundlePath,
          size: file.size,
        };
      }
    } catch (e) {
      // Couldn't get size, but bundle exists
    }

    return {
      found: true,
      path: bundlePath,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    return {
      found: false,
      error: errorMsg,
    };
  }
}
