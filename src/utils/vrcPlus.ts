import type { VRCUser, VRCCurrentUser } from '../types/vrchat';

/**
 * Detects if a user has VRC+ subscription
 * VRC+ is indicated by special userIcon values or specific tags
 */
export function isVrcPlus(user: VRCUser | VRCCurrentUser | null | undefined): boolean {
  if (!user) return false;

  // Check userIcon field for VRC+ indicators
  // VRC+ users may have "twoFactorAuth" combined with other indicators
  const userIcon = user.userIcon || '';

  // Check tags for VRC+ indicators
  const tags = user.tags || [];
  const hasVrcPlusTag = tags.some(tag =>
    tag.toLowerCase().includes('vrc_plus') ||
    tag.toLowerCase().includes('vrcplus') ||
    tag.toLowerCase() === 'system_vrc_plus'
  );

  // VRC+ users typically have elevated trust ranks and special features
  // The userIcon field may contain patterns specific to VRC+ (commonly has checkmark or special badge)
  const hasVrcPlusIcon = userIcon && (
    userIcon.includes('vrc_plus') ||
    userIcon.includes('vrcplus') ||
    userIcon.includes('checkmark')
  );

  return hasVrcPlusTag || hasVrcPlusIcon;
}

/**
 * Get favorite slots count based on VRC+ status and trust rank
 * Base users: 5 slots
 * VRC+ users: 10 slots per type (world, avatar, friend)
 */
export function getFavoriteSlotsCount(isVrcPlus: boolean): number {
  return isVrcPlus ? 10 : 5;
}

/**
 * Get avatar favorite slots count based on VRC+ status
 * This applies to avatar favorites specifically
 */
export function getAvatarFavoriteSlotsCount(isVrcPlus: boolean): number {
  return isVrcPlus ? 10 : 5;
}
