/**
 * Direct download using the unityPackageUrl from VRChat API
 * This is the most straightforward approach - use the URL VRChat provides directly
 */

import type { VRCAvatar } from '../types/vrchat';

/**
 * Download avatar bundle using the direct URL from VRChat API
 * The VRChat API returns unityPackageUrl for each package
 */
export async function downloadBundleDirectly(
  avatar: VRCAvatar,
  selectedPackageId: string,
  onProgress?: (current: number, total: number) => void
): Promise<{ success: boolean; path?: string; error?: string }> {
  if (typeof window === 'undefined' || !(window as any).electronAPI) {
    return { success: false, error: 'Not in Electron environment' };
  }

  try {
    const electronAPI = (window as any).electronAPI;

    // Find the selected package
    const selectedPackage = avatar.unityPackages?.find(p => p.id === selectedPackageId);
    if (!selectedPackage) {
      return { success: false, error: 'Package not found' };
    }

    // The VRChat API should provide the direct download URL
    const downloadUrl = selectedPackage.unityPackageUrl;

    if (!downloadUrl) {
      return {
        success: false,
        error: `No download URL available. Package: ${selectedPackageId}\nThis avatar may not have a bundle available for download.`,
      };
    }

    console.log('[DirectDownload] Using URL from API:', downloadUrl);
    console.log('[DirectDownload] Avatar:', avatar.name, 'Package:', selectedPackageId);

    // Use native download which respects all cookies and auth
    const bundlePath = await electronAPI.downloadFileNative(downloadUrl, avatar.id);

    console.log('[DirectDownload] Successfully downloaded to:', bundlePath);

    return {
      success: true,
      path: bundlePath,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[DirectDownload] Failed:', errorMsg);
    return {
      success: false,
      error: `Download failed: ${errorMsg}`,
    };
  }
}
