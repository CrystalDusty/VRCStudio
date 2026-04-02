import type { VRCUser } from '../types/vrchat';

/**
 * Returns the best available profile image for a VRChat user.
 * Priority: profilePicOverride (VRC+ custom) > userIcon > currentAvatarThumbnailImageUrl
 */
export function getBestAvatarUrl(user: Pick<VRCUser, 'profilePicOverride' | 'userIcon' | 'currentAvatarThumbnailImageUrl'>): string {
  return user.profilePicOverride || user.userIcon || user.currentAvatarThumbnailImageUrl || '';
}
