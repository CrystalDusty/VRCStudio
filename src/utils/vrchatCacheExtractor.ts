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

    // Get username from environment - try multiple ways
    let username = process.env.USERNAME || 'User';

    // Remove "avtr_" prefix to get just the ID for searching
    const shortAvatarId = avatarId.replace('avtr_', '');

    console.log('[VRChatCache] Searching for avatar:', avatarId, '(short ID:', shortAvatarId, ')');
    console.log('[VRChatCache] Username:', username);

    // VRChat cache locations - try many possible locations
    const cachePaths = [
      `C:\\Users\\${username}\\AppData\\LocalLow\\VRChat\\VRChat\\Cache-WebGL`,
      `C:\\Users\\${username}\\AppData\\LocalLow\\VRChat\\VRChat\\Cache`,
      `C:\\Users\\${username}\\AppData\\LocalLow\\VRChat\\VRChat\\Avatars`,
      `C:\\Users\\${username}\\AppData\\LocalLow\\VRChat\\VRChat\\file_${avatarId}`,
      `C:\\Users\\${username}\\AppData\\LocalLow\\VRChat\\VRChat\\${avatarId}`,
    ];

    for (const cachePath of cachePaths) {
      try {
        console.log(`[VRChatCache] Checking: ${cachePath}`);
        const files = await electronAPI.listDir(cachePath);

        if (files && files.length > 0) {
          console.log(`[VRChatCache] Found ${files.length} files in ${cachePath}`);

          // Look for avatar bundle files - check for various patterns
          for (const file of files) {
            if (!file.name) continue;

            const matches =
              file.name.includes(avatarId) ||
              file.name.includes(shortAvatarId) ||
              file.name.endsWith('.unitypackage') ||
              file.name.includes('bundle') ||
              file.name.startsWith('file_');

            if (matches) {
              const fullPath = `${cachePath}\\${file.name}`;
              console.log('[VRChatCache] Found potential bundle:', file.name, `(${file.size} bytes)`);

              // Verify file size is reasonable (at least 100KB for a bundle)
              if (file.size && file.size > 100000) {
                console.log('[VRChatCache] File size OK, returning path');
                return fullPath;
              } else if (file.size) {
                console.log('[VRChatCache] File too small:', file.size, 'bytes');
              }
            }
          }
        }
      } catch (e) {
        // Path doesn't exist, continue
        console.log(`[VRChatCache] Path not accessible: ${cachePath}`);
      }
    }

    console.log('[VRChatCache] Avatar not found in any cache location');
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
  if (!isElectron()) {
    return { success: false, error: 'Not in Electron environment' };
  }

  try {
    console.log('[VRChatCache] Reading bundle from:', bundlePath);

    const electronAPI = (window as any).electronAPI;

    // Use Electron API to read the file
    const fileData = await electronAPI.readFile(bundlePath);

    if (!fileData) {
      throw new Error('File is empty');
    }

    // Convert to blob
    const blob = new Blob([fileData], { type: 'application/octet-stream' });
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
