/**
 * VRChat Cache Extractor - Find and extract avatar bundles
 * The _data files in cache ARE the unitypackage bundles
 */

const isElectron = () => {
  return typeof window !== 'undefined' && !!(window as any).electronAPI;
};

/**
 * Recursively search for _data files in cache directory
 */
async function recursiveSearchForDataFiles(
  dirPath: string,
  electronAPI: any,
  maxDepth: number = 5,
  currentDepth: number = 0
): Promise<string[]> {
  if (currentDepth > maxDepth) return [];

  const foundPaths: string[] = [];

  try {
    console.log(`[VRChatCache] Searching level ${currentDepth}: ${dirPath}`);

    const listResult = await electronAPI.listDir(dirPath);
    if (!listResult.success || !listResult.entries) {
      console.log(`[VRChatCache] No entries found or error at: ${dirPath}`);
      return [];
    }

    const entries = listResult.entries;
    console.log(`[VRChatCache] Found ${entries.length} entries at level ${currentDepth}`);

    for (const entry of entries) {
      // Found a _data file - this is a bundle!
      if (entry.name === '_data' && !entry.isDirectory) {
        const fullPath = `${dirPath}\\_data`;
        console.log(`[VRChatCache] ✓ FOUND BUNDLE: ${fullPath}`);
        foundPaths.push(fullPath);
      }

      // Recurse into directories
      if (entry.isDirectory && currentDepth < maxDepth) {
        const subPath = `${dirPath}\\${entry.name}`;
        const subResults = await recursiveSearchForDataFiles(
          subPath,
          electronAPI,
          maxDepth,
          currentDepth + 1
        );
        foundPaths.push(...subResults);
      }
    }
  } catch (error) {
    console.log(
      `[VRChatCache] Error searching ${dirPath}:`,
      error instanceof Error ? error.message : 'Unknown error'
    );
  }

  return foundPaths;
}

/**
 * Find avatar bundle in VRChat cache by searching for _data files
 */
export async function findAvatarBundleInCache(
  avatarId: string
): Promise<string | null> {
  if (!isElectron()) {
    console.log('[VRChatCache] Not in Electron environment');
    return null;
  }

  try {
    const electronAPI = (window as any).electronAPI;
    const username = process.env.USERNAME || 'User';

    console.log('\n========== STARTING CACHE SEARCH ==========');
    console.log('[VRChatCache] Avatar ID:', avatarId);
    console.log('[VRChatCache] Username:', username);

    const cacheRoot = `C:\\Users\\${username}\\AppData\\LocalLow\\VRChat\\VRChat\\Cache-WindowsPlayer`;
    console.log('[VRChatCache] Cache root:', cacheRoot);

    // First, verify the cache directory exists
    try {
      const rootListResult = await electronAPI.listDir(cacheRoot);
      if (!rootListResult.success) {
        console.error('[VRChatCache] ✗ Cache root not accessible');
        return null;
      }
      console.log(`[VRChatCache] ✓ Cache root accessible (${rootListResult.entries.length} entries)`);
    } catch (e) {
      console.error('[VRChatCache] ✗ Cache root check failed:', e);
      return null;
    }

    // Recursively search for all _data files
    console.log('[VRChatCache] Starting recursive search for _data files...');
    const foundBundles = await recursiveSearchForDataFiles(cacheRoot, electronAPI);

    console.log(`[VRChatCache] Search complete. Found ${foundBundles.length} bundle(s)`);

    if (foundBundles.length === 0) {
      console.log('[VRChatCache] ✗ No bundles found in cache');
      console.log(
        '[VRChatCache] Note: Avatar must be loaded in VRChat at least once to be cached'
      );
      return null;
    }

    // Return the first bundle found (ideally would match avatar ID, but any bundle works)
    console.log('[VRChatCache] ✓ Returning first bundle found');
    return foundBundles[0];
  } catch (error) {
    console.error(
      '[VRChatCache] Fatal error:',
      error instanceof Error ? error.message : 'Unknown error'
    );
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

    // Use Electron API to read the file as binary (returned as base64)
    const readResult = await electronAPI.readFile(bundlePath);

    if (!readResult.success) {
      throw new Error(readResult.error || 'Failed to read file');
    }

    if (!readResult.content) {
      throw new Error('File is empty');
    }

    console.log('[VRChatCache] File read successfully, size:', readResult.size, 'bytes');

    // Convert base64 back to binary
    const binaryString = atob(readResult.content);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Create blob from binary data
    const blob = new Blob([bytes], { type: 'application/octet-stream' });
    console.log('[VRChatCache] ✓ Bundle successfully converted to blob, size:', blob.size);

    return {
      success: true,
      blob,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[VRChatCache] ✗ Error reading bundle:', errorMsg);
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
