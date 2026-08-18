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
    | 'friend_avatar' | 'friend_add' | 'friend_remove' | 'world_visit'
    | 'group_update' | 'instance_queue';
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
    alwaysOnTop: boolean;
    launchOnStartup: boolean;
    confirmClose: boolean;
    checkForUpdates: boolean;
    hardwareAcceleration: boolean;
  };
  notifications: {
    friendOnline: boolean;
    friendOffline: boolean;
    friendLocation: boolean;
    friendStatus: boolean;
    invites: boolean;
    sound: boolean;
    desktopNotifications: boolean;
    notificationDuration: number;
    dndEnabled: boolean;
    dndStart: string;
    dndEnd: string;
    groupUpdates: boolean;
  };
  polling: {
    friendsInterval: number;
    worldInterval: number;
    notificationsInterval: number;
    feedInterval: number;
  };
  display: {
    compactMode: boolean;
    showOfflineFriends: boolean;
    timeFormat: '12h' | '24h';
    friendsSortBy: 'name' | 'status' | 'trust';
    groupByStatus: boolean;
    showTrustBadges: boolean;
    showBioPreview: boolean;
    showAvatarInList: boolean;
  };
  privacy: {
    showOnlineStatus: boolean;
    showCurrentWorld: boolean;
    allowFriendRequests: boolean;
    showLastSeen: boolean;
  };
  performance: {
    enableAnimations: boolean;
    imageQuality: 'low' | 'medium' | 'high';
    backgroundSync: boolean;
    prefetchImages: boolean;
    virtualizeListsThreshold: number;
  };
  profile: {
    nickname: string;
    greetingEnabled: boolean;
    showWeather: boolean;
  };
}

export type ViolationCategory =
  | 'harassment'
  | 'hate_speech'
  | 'nsfw_content'
  | 'cheating'
  | 'impersonation'
  | 'spam'
  | 'self_harm'
  | 'doxxing'
  | 'group_misuse'
  | 'group_harassment';

export type ReportStatus = 'filed' | 'actioned' | 'potential_action' | 'dismissed';

export interface FiledReport {
  id: string;
  reportType: 'player' | 'group';
  targetId: string;
  targetName: string;
  targetImageUrl?: string;
  violationCategory: ViolationCategory;
  violationSubtype?: string;
  hasEvidence: boolean;
  evidenceType?: 'screenshot' | 'video' | 'both';
  worldId?: string;
  worldName?: string;
  instanceId?: string;
  incidentTime: number;
  reportTime: number;
  generatedText: string;
  /** Preset scenario the wording came from, when one was picked. */
  scenarioId?: string;
  /** The reporter's own description of the incident, in their words. */
  userStatement?: string;
  status: ReportStatus;
  actionedAt?: number;
  actionNotificationId?: string;
  userNotes?: string;
  witnesses?: string;
}

// ─── Inventory / prints / instances ───────────────────────────────────────
//
// Shapes taken from the community OpenAPI spec (vrchat SDK 2.22.8, Aug 2026).
// Everything optional that we don't strictly need, so a field VRChat renames
// degrades to "missing" rather than breaking a page.

export type VRCInventoryItemType =
  | 'bundle' | 'droneskin' | 'emoji' | 'portalskin' | 'prop' | 'sticker' | 'warpeffect';

export interface VRCInventoryItem {
  id: string;
  name: string;
  description?: string;
  itemType: VRCInventoryItemType;
  itemTypeLabel?: string;
  imageUrl?: string;
  holderId?: string;
  templateId?: string;
  collections?: string[];
  tags?: string[];
  flags?: string[];
  isArchived?: boolean;
  isSeen?: boolean;
  quantifiable?: boolean;
  expiryDate?: string | null;
  created_at?: string;
  updated_at?: string;
  metadata?: Record<string, unknown>;
}

export interface VRCPrint {
  id: string;
  authorId: string;
  authorName: string;
  note?: string;
  worldId?: string;
  worldName?: string;
  createdAt?: string;
  timestamp?: string;
  ownerId?: string;
  files?: {
    fileId?: string;
    /** Direct image URL, e.g. https://api.vrchat.cloud/api/1/file/file_x/1/file */
    image?: string;
  };
}

/** The instance fields our own VRCInstance type was missing. */
export interface VRCInstanceDetail {
  id?: string;
  instanceId?: string;
  worldId?: string;
  name?: string;
  displayName?: string;
  type?: string;
  ownerId?: string;
  region?: string;
  photonRegion?: string;
  capacity?: number;
  recommendedCapacity?: number;
  n_users?: number;
  userCount?: number;
  full?: boolean;
  hasCapacityForYou?: boolean;
  queueEnabled?: boolean;
  queueSize?: number;
  closedAt?: string | null;
  hardClose?: boolean;
  ageGate?: boolean;
  roleRestricted?: boolean;
  strict?: boolean;
  active?: boolean;
  canRequestInvite?: boolean;
  platforms?: Record<string, number>;
  shortName?: string;
  secureName?: string;
  groupAccessType?: string;
  tags?: string[];
  world?: VRCWorld;
}

/** GET /config — VRChat's own live constants. */
export interface VRCAPIConfig {
  /** Report categories keyed by content type, e.g. reportOptions.user.<category>. */
  reportOptions?: Record<string, Record<string, unknown>>;
  /** Human descriptions for the above. */
  reportCategories?: Record<string, { text?: string; tooltip?: string; description?: string }>;
  reportReasons?: Record<string, unknown>;
  [key: string]: unknown;
}
