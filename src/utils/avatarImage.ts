/**
 * Avatar Image Utility
 * Handles avatar image selection with VRC+ and platform-specific logic
 */

import type { VRCUser, VRCCurrentUser, VRCAvatar } from '../types/vrchat';

/**
 * Get the best avatar image URL for a user
 * Priority: VRC+ custom > User icon > Current avatar thumbnail > Fallback
 */
export function getBestUserAvatarUrl(
  user: Pick<VRCUser, 'profilePicOverride' | 'userIcon' | 'currentAvatarThumbnailImageUrl'> | null
): string {
  if (!user) return '';

  // VRC+ custom profile picture
  if (user.profilePicOverride) return user.profilePicOverride;

  // User-selected avatar thumbnail
  if (user.userIcon) return user.userIcon;

  // Current avatar thumbnail
  if (user.currentAvatarThumbnailImageUrl) return user.currentAvatarThumbnailImageUrl;

  return '';
}

/**
 * Check if user has VRC+ subscription
 */
export function hasVRCPlus(user: VRCCurrentUser | VRCUser | null): boolean {
  if (!user) return false;
  return user.tags?.includes('system_vrcplus_active') || false;
}

/**
 * Get avatar image with fallback
 * For public/favorite avatars
 */
export function getAvatarImageUrl(
  avatar: Pick<VRCAvatar, 'thumbnailImageUrl' | 'imageUrl'> | null,
  options?: { preferThumbnail?: boolean }
): string {
  if (!avatar) return '';

  // Prefer thumbnail for better performance
  if (options?.preferThumbnail !== false && avatar.thumbnailImageUrl) {
    return avatar.thumbnailImageUrl;
  }

  return avatar.imageUrl || avatar.thumbnailImageUrl || '';
}

/**
 * Get current user's avatar image with VRC+ support
 */
export function getCurrentUserAvatarUrl(user: VRCCurrentUser | null): string {
  if (!user) return '';

  // If user has VRC+, show their custom profile pic
  if (hasVRCPlus(user) && user.profilePicOverride) {
    return user.profilePicOverride;
  }

  // Otherwise show their current avatar
  return user.currentAvatarThumbnailImageUrl || user.currentAvatarImageUrl || '';
}

/**
 * Preload image with promise
 * Useful for avoiding broken images
 */
export function preloadImage(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

/**
 * Get fallback avatar image (when image fails to load)
 * Returns a data URL for a simple placeholder
 */
export function getFallbackAvatarUrl(): string {
  // Simple grey circle placeholder (SVG data URL)
  return 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"%3E%3Crect width="100" height="100" fill="%23888"%3E%3C/rect%3E%3Ccircle cx="50" cy="35" r="15" fill="%23aaa"/%3E%3Cellipse cx="50" cy="70" rx="25" ry="20" fill="%23aaa"/%3E%3C/svg%3E';
}
