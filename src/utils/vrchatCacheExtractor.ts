/**
 * VRChat Cache Extractor
 * Finds and extracts avatar bundles from local VRChat installation
 *
 * Cache structure:
 * C:\Users\{user}\AppData\LocalLow\VRChat\VRChat\Cache-WindowsPlayer\
 * └── {hash}/
 *     └── {hash}/
 *         ├── _data (the actual bundle file - 100+ MB)
 *         └── _info (metadata file)
 */

const isElectron = () => {
  return typeof window !== 'undefined' && !!(window as any).electronAPI;
};

/**
 * Search VRChat cache for avatar bundles
 * The _data files in cache ARE the unitypackage files
 */
export async function findAvatarBundleInCache(
  avatarId: string
): Promise<string | null> {
  if (!isElectron()) {
    return null;
  }

  try {
    const electronAPI = (window as any).electronAPI;
    let username = process.env.USERNAME || 'User';

    // Remove "avtr_" prefix if present
    const shortAvatarId = avatarId.replace('avtr_', '');

    console.log('[VRChatCache] Searching for avatar:', avatarId);
    console.log('[VRChatCache] Username:', username);

    // Main cache directory
    const cacheRoot = `C:\\Users\\${username}\\AppData\\LocalLow\\VRChat\\VRChat\\Cache-WindowsPlayer`;

    console.log('[VRChatCache] Searching cache root:', cacheRoot);

    try {
      // List all hash directories in cache
      const cacheListResult = await electronAPI.listDir(cacheRoot);
      const hashDirs = cacheListResult.success ? cacheListResult.entries : null;

      if (!hashDirs || hashDirs.length === 0) {
        console.log('[VRChatCache] Cache root empty or not found');
        return null;
      }

      console.log(`[VRChatCache] Found ${hashDirs.length} cache entries`);

      // Search through each hash directory
      for (const hashDir of hashDirs) {
        if (!hashDir.isDirectory) continue;

        const hashPath = `${cacheRoot}\\${hashDir.name}`;

        try {
          // List subdirectories in hash folder
          const subListResult = await electronAPI.listDir(hashPath);
          const subDirs = subListResult.success ? subListResult.entries : null;

          if (!subDirs) continue;

          for (const subDir of subDirs) {
            if (!subDir.isDirectory) continue;

            const bundlePath = `${hashPath}\\${subDir.name}`;

            try {
              // Look for _data file in this directory
              const filesResult = await electronAPI.listDir(bundlePath);
              const files = filesResult.success ? filesResult.entries : null;

              if (!files) continue;

              const dataFile = files.find(f => f.name === '_data');
              const infoFile = files.find(f => f.name === '_info');

              // Found a valid cache bundle
              if (dataFile && infoFile && !dataFile.isDirectory && !infoFile.isDirectory) {
                console.log('[VRChatCache] Found bundle at:', bundlePath);
                const bundleDataPath = `${bundlePath}\\_data`;
                console.log('[VRChatCache] Returning bundle path:', bundleDataPath);
                return bundleDataPath;
              }
            } catch (e) {
              // Skip this subdirectory
              continue;
            }
          }
        } catch (e) {
          // Skip this hash directory
          continue;
        }
      }

      console.log('[VRChatCache] No valid bundles found in cache');
      return null;
    } catch (cacheError) {
      console.error('[VRChatCache] Error reading cache root:', cacheError);
      return null;
    }
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
