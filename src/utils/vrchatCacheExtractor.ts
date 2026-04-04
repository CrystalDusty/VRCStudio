/**
 * VRChat Cache Extractor - Find and extract avatar bundles
 * The _data files in cache ARE the unitypackage bundles
 */

const isElectron = () => {
  return typeof window !== 'undefined' && !!(window as any).electronAPI;
};

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

    console.log('\n========== STARTING CACHE SEARCH ==========');
    console.log('[VRChatCache] Avatar ID:', avatarId);

    // Use the main process to search - it's much faster and more reliable
    console.log('[VRChatCache] Calling main process to search cache...');
    const searchResult = await electronAPI.searchCacheForDataFiles();

    if (!searchResult.success) {
      console.error('[VRChatCache] ✗ Search failed:', searchResult.error);
      return null;
    }

    const bundles = searchResult.bundles || [];
    console.log(`[VRChatCache] Search complete. Scanned ${searchResult.scannedDirs} directories, found ${bundles.length} bundle(s)`);

    if (bundles.length === 0) {
      console.log('[VRChatCache] ✗ No bundles found in cache');
      console.log('[VRChatCache] Note: Avatar must be loaded in VRChat at least once to be cached');
      return null;
    }

    // Return the first bundle found
    console.log('[VRChatCache] ✓ Returning first bundle found');
    console.log('[VRChatCache] Bundle path:', bundles[0]);
    return bundles[0];
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
