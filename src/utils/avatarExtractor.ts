/**
 * Avatar Extractor - Extract avatar data and assets for download
 * Pulls avatar information, images, and builds a downloadable package
 */

import type { VRCAvatar } from '../types/vrchat';
import { findAvatarBundleInCache, extractBundleFromCache } from './vrchatCacheExtractor';
import { generateUnityImporterScript, generateSetupScript, generateReadme } from './unityImporter';

export interface AvatarAssets {
  avatarId: string;
  avatarName: string;
  authorName: string;
  description: string;
  imageUrl: string;
  thumbnailUrl: string;
  tags: string[];
  unityPackages: any[];
  metadata: {
    createdAt: string;
    updatedAt: string;
    releaseStatus: string;
    version: number;
  };
}

/**
 * Extract avatar data and assets into a downloadable format
 */
export async function extractAvatarData(avatar: VRCAvatar): Promise<AvatarAssets> {
  console.log('[AvatarExtractor] Extracting data for avatar:', avatar.name);

  return {
    avatarId: avatar.id,
    avatarName: avatar.name,
    authorName: avatar.authorName,
    description: avatar.description,
    imageUrl: avatar.imageUrl,
    thumbnailUrl: avatar.thumbnailImageUrl,
    tags: avatar.tags,
    unityPackages: avatar.unityPackages.map(pkg => ({
      id: pkg.id,
      platform: pkg.platform,
      unityVersion: pkg.unityVersion,
      unitySortNumber: pkg.unitySortNumber,
      assetVersion: pkg.assetVersion,
      created_at: pkg.created_at,
      unityPackageUrl: pkg.unityPackageUrl,
    })),
    metadata: {
      createdAt: avatar.created_at,
      updatedAt: avatar.updated_at,
      releaseStatus: avatar.releaseStatus,
      version: avatar.version,
    },
  };
}

/**
 * Create a downloadable JSON file with all avatar data and asset URLs
 */
export async function createAvatarPackage(avatar: VRCAvatar): Promise<{
  success: boolean;
  data?: string;
  error?: string;
}> {
  try {
    const avatarData = await extractAvatarData(avatar);

    // Create a comprehensive package with all downloadable asset URLs
    const packageData = {
      format: 'vrc-studio-avatar-v1',
      timestamp: new Date().toISOString(),
      avatar: avatarData,
      downloadLinks: {
        avatarImage: avatar.imageUrl,
        avatarThumbnail: avatar.thumbnailImageUrl,
      },
      instructions: {
        title: `How to use ${avatar.name}`,
        steps: [
          '1. Download the avatar image and thumbnail',
          '2. If a bundle is available, download the .unitypackage for your platform',
          '3. Import the package into Unity',
          '4. Use the avatar in VRChat',
        ],
      },
    };

    // Convert to JSON string
    const jsonData = JSON.stringify(packageData, null, 2);

    console.log('[AvatarExtractor] Package created successfully');

    return {
      success: true,
      data: jsonData,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[AvatarExtractor] Package creation failed:', errorMsg);
    return {
      success: false,
      error: errorMsg,
    };
  }
}

/**
 * Download avatar image as blob
 */
export async function downloadAvatarImage(
  imageUrl: string,
  fileName: string
): Promise<{ success: boolean; blob?: Blob; error?: string }> {
  try {
    console.log('[AvatarExtractor] Downloading image from:', imageUrl);

    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const blob = await response.blob();
    console.log('[AvatarExtractor] Image downloaded, size:', blob.size);

    return {
      success: true,
      blob,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[AvatarExtractor] Image download failed:', errorMsg);
    return {
      success: false,
      error: errorMsg,
    };
  }
}

/**
 * Create downloadable avatar package (metadata + images + bundle + importer)
 */
export async function generateDownloadablePackage(
  avatar: VRCAvatar,
  cacheFilePath?: string | null
): Promise<{ success: boolean; files?: File[]; error?: string }> {
  try {
    const files: File[] = [];

    // 1. Create metadata JSON
    const packageResult = await createAvatarPackage(avatar);
    if (!packageResult.success || !packageResult.data) {
      throw new Error('Failed to create package metadata');
    }

    const jsonBlob = new Blob([packageResult.data], { type: 'application/json' });
    files.push(new File([jsonBlob], `metadata.json`, { type: 'application/json' }));

    // 2. Download avatar image
    if (avatar.imageUrl) {
      const imageResult = await downloadAvatarImage(avatar.imageUrl, `${avatar.id}-image.png`);
      if (imageResult.success && imageResult.blob) {
        files.push(new File([imageResult.blob], `${avatar.id}-image.png`, { type: 'image/png' }));
      }
    }

    // 3. Download avatar thumbnail
    if (avatar.thumbnailImageUrl) {
      const thumbResult = await downloadAvatarImage(avatar.thumbnailImageUrl, `${avatar.id}-thumbnail.png`);
      if (thumbResult.success && thumbResult.blob) {
        files.push(new File([thumbResult.blob], `${avatar.id}-thumbnail.png`, { type: 'image/png' }));
      }
    }

    // 4. Get avatar bundle - either from user selection or auto search
    let bundleToUse: string | null = null;

    if (cacheFilePath) {
      console.log('[AvatarExtractor] Using user-selected cache file:', cacheFilePath);
      bundleToUse = cacheFilePath;
    } else {
      console.log('[AvatarExtractor] Searching for avatar bundle in VRChat cache...');
      bundleToUse = await findAvatarBundleInCache(avatar.id);
    }

    if (bundleToUse) {
      console.log('[AvatarExtractor] Using bundle at:', bundleToUse);

      try {
        const electronAPI = (window as any).electronAPI;

        // Read the _data file and include it as .unitypackage in the download
        console.log('[AvatarExtractor] Reading bundle file...');
        const readResult = await electronAPI.readFile(bundleToUse);

        if (readResult.success && readResult.content) {
          console.log('[AvatarExtractor] ✓ Bundle read successfully, size:', readResult.size, 'bytes');

          // Convert base64 back to binary blob
          const binaryString = atob(readResult.content);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }

          const bundleBlob = new Blob([bytes], { type: 'application/octet-stream' });
          files.push(new File([bundleBlob], `${avatar.id}.unitypackage`, { type: 'application/octet-stream' }));

          console.log('[AvatarExtractor] ✓ Bundle added to download package');
        } else {
          console.error('[AvatarExtractor] ✗ Failed to read bundle:', readResult.error);
        }
      } catch (bundleError) {
        console.error('[AvatarExtractor] Error during bundle processing:', bundleError);
      }
    } else {
      console.log('[AvatarExtractor] Bundle not found in cache');
    }

    // 5. Generate Unity importer script
    const importerScript = generateUnityImporterScript(avatar.id, avatar.name);
    const importerBlob = new Blob([importerScript], { type: 'text/plain' });
    files.push(new File([importerBlob], `Editor/${avatar.name}Importer.cs`, { type: 'text/plain' }));

    // 6. Generate setup script
    const setupScript = generateSetupScript();
    const setupBlob = new Blob([setupScript], { type: 'text/plain' });
    files.push(new File([setupBlob], `Editor/VRCStudioSetup.cs`, { type: 'text/plain' }));

    // 7. Generate README
    const readme = generateReadme(avatar.name, avatar.id, avatar.authorName);
    const readmeBlob = new Blob([readme], { type: 'text/plain' });
    files.push(new File([readmeBlob], `README.md`, { type: 'text/plain' }));

    console.log('[AvatarExtractor] Package generated with', files.length, 'files');

    return {
      success: true,
      files,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[AvatarExtractor] Package generation failed:', errorMsg);
    return {
      success: false,
      error: errorMsg,
    };
  }
}

/**
 * Browse for cache file manually
 */
export async function browseCacheFile(): Promise<{
  success: boolean;
  path?: string;
  error?: string;
}> {
  if (typeof window === 'undefined' || !(window as any).electronAPI) {
    return { success: false, error: 'Not in Electron environment' };
  }

  try {
    const electronAPI = (window as any).electronAPI;
    const result = await electronAPI.browseCacheFolder();

    if (!result.success) {
      return { success: false, error: result.error };
    }

    return { success: true, path: result.path };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMsg };
  }
}

/**
 * Trigger browser download of extracted avatar data
 */
export async function downloadAvatarExtract(avatar: VRCAvatar, cacheFilePath?: string | null): Promise<{
  success: boolean;
  bundleFound?: boolean;
  error?: string;
}> {
  try {
    // Create downloadable package
    const packageResult = await generateDownloadablePackage(avatar, cacheFilePath);
    if (!packageResult.success || !packageResult.files) {
      throw new Error(packageResult.error || 'Failed to generate package');
    }

    // Check if bundle was included
    const bundleFound = packageResult.files.some(f => f.name.endsWith('.unitypackage'));

    // Download each file
    for (const file of packageResult.files) {
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      // Small delay between downloads
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log('[AvatarExtractor] Download completed');

    if (!bundleFound) {
      console.log('[AvatarExtractor] Bundle not found in cache');
      return {
        success: true,
        bundleFound: false,
        error:
          'Avatar bundle not found in VRChat cache. ' +
          'You can manually add it: ' +
          '1) Download avatar in VRChat or copy from cache ' +
          '2) Place .unitypackage in the extracted folder ' +
          '3) Use the Unity importer script to import',
      };
    }

    return {
      success: true,
      bundleFound: true,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[AvatarExtractor] Download failed:', errorMsg);
    return {
      success: false,
      bundleFound: false,
      error: errorMsg,
    };
  }
}
