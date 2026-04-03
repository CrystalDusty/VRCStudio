export type UserStatus = 'join me' | 'active' | 'ask me' | 'busy' | 'offline';
export type UserState = 'online' | 'active' | 'offline';
export type TrustRank = 'visitor' | 'new' | 'user' | 'known' | 'trusted' | 'veteran' | 'legend';

export interface VRCUser {
  id: string;
  displayName: string;
  username?: string;
  bio: string;
  bioLinks: string[];
  currentAvatarImageUrl: string;
  currentAvatarThumbnailImageUrl: string;
  profilePicOverride: string;
  userIcon: string;
  status: UserStatus;
  statusDescription: string;
  state: UserState;
  tags: string[];
  friendKey: string;
  last_login: string;
  last_activity: string;
  last_platform: string;
  date_joined: string;
  isFriend: boolean;
  location: string;
  worldId?: string;
  instanceId?: string;
  travelingToLocation?: string;
  note?: string;
}

export interface VRCCurrentUser extends VRCUser {
  email?: string;
  emailVerified: boolean;
  friends: string[];
  onlineFriends: string[];
  activeFriends: string[];
  offlineFriends: string[];
  homeLocation: string;
  twoFactorAuthEnabled: boolean;
  currentAvatar: string;
  currentAvatarAssetUrl: string;
  allowAvatarCopying: boolean;
}

export interface VRCWorld {
  id: string;
  name: string;
  description: string;
  authorId: string;
  authorName: string;
  imageUrl: string;
  thumbnailImageUrl: string;
  capacity: number;
  recommendedCapacity: number;
  tags: string[];
  releaseStatus: string;
  visits: number;
  favorites: number;
  popularity: number;
  heat: number;
  occupants: number;
  publicOccupants: number;
  privateOccupants: number;
  instances?: [string, number][];
  created_at: string;
  updated_at: string;
  labsPublicationDate: string;
  publicationDate: string;
  version: number;
  organization: string;
  unityPackages: VRCUnityPackage[];
}

export interface VRCUnityPackage {
  id: string;
  platform: string;
  unityVersion: string;
  unitySortNumber: number;
  assetVersion: number;
  created_at: string;
  unityPackageUrl?: string;
}

export interface VRCAvatar {
  id: string;
  name: string;
  description: string;
  authorId: string;
  authorName: string;
  imageUrl: string;
  thumbnailImageUrl: string;
  tags: string[];
  releaseStatus: string;
  version: number;
  featured: boolean;
  created_at: string;
  updated_at: string;
  unityPackages: VRCUnityPackage[];
}

export interface VRCInstance {
  id: string;
  instanceId: string;
  worldId: string;
  name: string;
  type: InstanceType;
  region: InstanceRegion;
  ownerId?: string;
  capacity: number;
  recommendedCapacity: number;
  n_users: number;
  userCount: number;
  world?: VRCWorld;
  users?: VRCUser[];
  shortName?: string;
  platforms: Record<string, number>;
  photonRegion: string;
}

export type InstanceType = 'public' | 'hidden' | 'friends' | 'private' | 'group';
export type InstanceRegion = 'us' | 'use' | 'eu' | 'jp';

export interface VRCFavorite {
  id: string;
  type: 'world' | 'friend' | 'avatar';
  favoriteId: string;
  tags: string[];
}

export interface VRCFavoriteGroup {
  id: string;
  ownerId: string;
  ownerDisplayName: string;
  name: string;
  displayName: string;
  type: 'world' | 'friend' | 'avatar';
  visibility: string;
  tags: string[];
}

export interface VRCNotification {
  id: string;
  senderUserId: string;
  senderUsername: string;
  type: string;
  message: string;
  details: Record<string, unknown>;
  created_at: string;
  seen: boolean;
}

export interface VRCGroup {
  id: string;
  name: string;
  shortCode: string;
  discriminator: string;
  description: string;
  iconUrl: string;
  bannerUrl: string;
  memberCount: number;
  ownerId: string;
  rules: string;
  tags: string[];
}

export interface FeedEvent {
  id: string;
  type: 'friend_online' | 'friend_offline' | 'friend_location' | 'friend_status'
    | 'friend_avatar' | 'friend_add' | 'friend_remove' | 'world_visit';
  userId?: string;
  userName?: string;
  userAvatar?: string;
  worldId?: string;
  worldName?: string;
  worldImage?: string;
  instanceId?: string;
  details?: string;
  previousValue?: string;
  newValue?: string;
  timestamp: number;
}

export interface FriendNote {
  userId: string;
  note: string;
  tags: string[];
  color?: string;
  updatedAt: number;
}

export interface WorldVisit {
  worldId: string;
  worldName: string;
  worldImage: string;
  instanceId: string;
  joinedAt: number;
  leftAt?: number;
  playerCount?: number;
}

export interface AppSettings {
  general: {
    startMinimized: boolean;
    minimizeToTray: boolean;
    launchOnStartup: boolean;
  };
  notifications: {
    friendOnline: boolean;
    friendOffline: boolean;
    friendLocation: boolean;
    friendStatus: boolean;
    invites: boolean;
    sound: boolean;
  };
  polling: {
    friendsInterval: number;
    worldInterval: number;
  };
  display: {
    compactMode: boolean;
    showOfflineFriends: boolean;
    timeFormat: '12h' | '24h';
  };
}
