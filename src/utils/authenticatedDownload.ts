/**
 * Authenticated download for avatar bundles using VRChat session
 * Uses the user's existing auth to download bundles directly from VRChat
 */

import { useAuthStore } from '../stores/authStore';

/**
 * Download avatar bundle using authenticated session
 * This downloads directly from VRChat's file endpoint using the user's cookies
 */
export async function downloadBundleAuthenticated(
  avatarId: string,
  packageId: string,
  onProgress?: (current: number, total: number) => void
): Promise<{ success: boolean; path?: string; error?: string }> {
  if (typeof window === 'undefined' || !(window as any).electronAPI) {
    return { success: false, error: 'Not in Electron environment' };
  }

  try {
    const electronAPI = (window as any).electronAPI;

    // Get user from auth store to verify we're logged in
    const user = useAuthStore.getState().user;
    if (!user) {
      return { success: false, error: 'Not logged in - cannot download bundle' };
    }

    console.log('[AuthDownload] Downloading bundle for avatar:', avatarId, 'package:', packageId);

    // Construct the bundle download URL
    // VRChat serves bundles from the file endpoint with proper auth
    const downloadUrl = `https://api.vrchat.cloud/file/file_${packageId}/file`;

    console.log('[AuthDownload] Download URL:', downloadUrl);

    // Use Electron's native download which respects session cookies
    // This is more reliable than manual HTTPS requests
    const bundlePath = await electronAPI.downloadFileNative(downloadUrl, avatarId);

    console.log('[AuthDownload] Successfully downloaded to:', bundlePath);

    return {
      success: true,
      path: bundlePath,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[AuthDownload] Failed:', errorMsg);
    return {
      success: false,
      error: `Authenticated download failed: ${errorMsg}`,
    };
  }
}

/**
 * Get the authenticated session cookies for manual API requests
 */
export function getAuthHeaders(): Record<string, string> {
  try {
    const user = useAuthStore.getState().user;
    if (!user) {
      return {};
    }

    return {
      'Content-Type': 'application/json',
      'User-Agent': 'VRC Studio',
    };
  } catch {
    return {};
  }
}
