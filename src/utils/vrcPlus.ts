/**
 * VRC+ Detection utility
 * Detects if a user has VRC+ subscription based on various indicators
 */

import type { VRCUser, VRCCurrentUser } from '../types/vrchat';

/**
 * Check if a user has VRC+ subscription
 * VRC+ is indicated by:
 * 1. Special userIcon URL containing "vrc_plus" or similar
 * 2. Tags containing VRC+ indicators
 * 3. Profile status or other markers
 */
export function isVrcPlus(user: VRCUser | VRCCurrentUser | null | undefined): boolean {
  if (!user) return false;

  // Check userIcon for VRC+ indicator
  // VRC+ users have a special icon that may contain specific markers
  if (user.userIcon && typeof user.userIcon === 'string') {
    // Check for known VRC+ icon patterns
    if (
      user.userIcon.includes('vrc_plus') ||
      user.userIcon.includes('vrcplus') ||
      user.userIcon.includes('vrc+') ||
      user.userIcon.includes('premium')
    ) {
      return true;
    }
  }

  // Check tags for VRC+ indicators
  if (user.tags && Array.isArray(user.tags)) {
    for (const tag of user.tags) {
      if (
        tag === 'system_vrc_plus' ||
        tag === 'system_vrcplus' ||
        tag === 'vrc_plus' ||
        tag.toLowerCase().includes('vrc_plus') ||
        tag.toLowerCase().includes('vrcplus')
      ) {
        return true;
      }
    }
  }

  // Check if profilePicOverride exists and has specific pattern
  // VRC+ users often have special profile pic handling
  if ((user as VRCCurrentUser).profilePicOverride) {
    // This is a basic check; adjust based on actual API behavior
    return true;
  }

  return false;
}

/**
 * Get the number of favorite slots available for a user
 * Non-VRC+ users have 4 favorite slots per category
 * VRC+ users have more favorite slots (typically 8-10)
 */
export function getFavoriteSlotsCount(user: VRCUser | VRCCurrentUser | null | undefined, category: 'avatar' | 'world' | 'group'): number {
  const hasVrcPlus = isVrcPlus(user);

  // Standard favorite slots
  const baseFavorites = 4;

  // VRC+ bonus slots
  const vrcPlusBonusPerCategory = 6; // Total 10 per category with VRC+

  return hasVrcPlus ? (baseFavorites + vrcPlusBonusPerCategory) : baseFavorites;
}

/**
 * Get display name for VRC+ subscription status
 */
export function getVrcPlusStatusText(user: VRCUser | VRCCurrentUser | null | undefined): string {
  return isVrcPlus(user) ? 'VRC+ Member' : 'Free Account';
}
