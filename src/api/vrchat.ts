import type {
  VRCInventoryItem,
  VRCInventoryItemType,
  VRCPrint,
  VRCInstanceDetail,
  VRCAPIConfig,
  VRCCurrentUser,
  VRCUser,
  VRCWorld,
  VRCAvatar,
  VRCInstance,
  VRCFavorite,
  VRCFavoriteGroup,
  VRCNotification,
} from '../types/vrchat';

const API_BASE = 'https://api.vrchat.cloud/api/1';
const API_KEY = 'JlE5Jldo5Jibn0215Oi0JXqlu4w';

// Only treat 401 responses with these exact session-related messages as a real session expiry.
// VRChat returns 401 with other messages for access-control reasons (age-gated/private content),
// and signing the user out in those cases is incorrect.
function isSessionExpiredMessage(msg: string): boolean {
  const m = (msg || '').toLowerCase();
  return m.includes('missing credentials')
    || m.includes('invalid username')
    || m.includes('not logged in')
    || m.includes('session has expired')
    || m.includes('cookie expired');
}

class VRChatAPI {
  private authCookie: string = '';
  private twoFactorAuth: string = '';
  onSessionExpired: (() => void) | null = null;

  private get isElectron(): boolean {
    return !!window.electronAPI?.vrchatRequest;
  }

  private get headers(): Record<string, string> {
    const h: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'DoNotPetMe/1.0.0',
    };
    if (this.authCookie) {
      let cookies = `auth=${this.authCookie}`;
      if (this.twoFactorAuth) cookies += `; twoFactorAuth=${this.twoFactorAuth}`;
      h['Cookie'] = cookies;
    }
    return h;
  }

  /**
   * Exposed for callers that need to make arbitrary authenticated
   * requests to /api/1/*. Path is appended after /api/1 — pass e.g.
   * '/users/usr_xxx', not '/api/1/users/usr_xxx'.
   */
  async rawRequest<T = any>(path: string, options: RequestInit = {}): Promise<T> {
    return this.request<T>(path, options);
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const separator = path.includes('?') ? '&' : '?';
    const fullPath = `${path}${separator}apiKey=${API_KEY}`;

    if (this.isElectron) {
      return this.electronRequest<T>(fullPath, options);
    }
    return this.browserRequest<T>(fullPath, options);
  }

  private async electronRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
    const cookies: Record<string, string> = {};
    if (this.authCookie) cookies['auth'] = this.authCookie;
    if (this.twoFactorAuth) cookies['twoFactorAuth'] = this.twoFactorAuth;

    const extraHeaders: Record<string, string> = {};
    if (options.headers) {
      const h = options.headers as Record<string, string>;
      for (const [k, v] of Object.entries(h)) {
        if (k.toLowerCase() !== 'content-type' && k.toLowerCase() !== 'user-agent') {
          extraHeaders[k] = v;
        }
      }
    }

    const res = await window.electronAPI!.vrchatRequest({
      method: (options.method || 'GET').toUpperCase(),
      path: `/api/1${path}`,
      headers: Object.keys(extraHeaders).length > 0 ? extraHeaders : undefined,
      body: options.body as string | undefined,
      cookies,
    });

    // Capture cookies from the response
    if (res.cookies.auth) this.authCookie = res.cookies.auth;
    if (res.cookies.twoFactorAuth) this.twoFactorAuth = res.cookies.twoFactorAuth;

    if (!res.ok) {
      const msg = res.data?.error?.message || `API request failed: ${res.status}`;
      if (res.status === 401 && isSessionExpiredMessage(msg)) {
        this.onSessionExpired?.();
      }
      throw new APIError(msg, res.status, res.data);
    }

    return res.data as T;
  }

  private async browserRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${API_BASE}${path}`;
    const res = await fetch(url, {
      ...options,
      headers: { ...this.headers, ...options.headers as Record<string, string> },
      credentials: 'include',
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const msg401 = body?.error?.message || '';
      if (res.status === 401 && isSessionExpiredMessage(msg401)) {
        this.onSessionExpired?.();
      }
      throw new APIError(
        body?.error?.message || `API request failed: ${res.status}`,
        res.status,
        body
      );
    }

    const setCookies = res.headers.get('set-cookie') || '';
    const authMatch = setCookies.match(/auth=([^;]+)/);
    if (authMatch) this.authCookie = authMatch[1];
    const tfaMatch = setCookies.match(/twoFactorAuth=([^;]+)/);
    if (tfaMatch) this.twoFactorAuth = tfaMatch[1];

    return res.json();
  }

  setAuth(authCookie: string, twoFactorAuth?: string) {
    this.authCookie = authCookie;
    if (twoFactorAuth) this.twoFactorAuth = twoFactorAuth;
  }

  getAuthCookies() {
    return { auth: this.authCookie, twoFactorAuth: this.twoFactorAuth };
  }

  clearAuth() {
    this.authCookie = '';
    this.twoFactorAuth = '';
  }

  // --- Auth ---

  async login(username: string, password: string): Promise<VRCCurrentUser> {
    const encoded = btoa(`${username}:${password}`);
    const res = await this.request<VRCCurrentUser>('/auth/user', {
      headers: { 'Authorization': `Basic ${encoded}` },
    });
    return res;
  }

  async verify2FA(code: string, method: 'totp' | 'emailotp' = 'totp'): Promise<boolean> {
    const endpoint = method === 'totp' ? '/auth/twofactorauth/totp/verify' : '/auth/twofactorauth/emailotp/verify';
    const res = await this.request<{ verified: boolean }>(endpoint, {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
    return res.verified;
  }

  async getCurrentUser(): Promise<VRCCurrentUser> {
    return this.request<VRCCurrentUser>('/auth/user');
  }

  async logout(): Promise<void> {
    await this.request('/logout', { method: 'PUT' });
    this.clearAuth();
  }

  // --- Friends ---

  async getFriends(offset = 0, count = 50, offline = false): Promise<VRCUser[]> {
    return this.request<VRCUser[]>(
      `/auth/user/friends?offset=${offset}&n=${count}&offline=${offline}`
    );
  }

  async getAllOnlineFriends(): Promise<VRCUser[]> {
    const all: VRCUser[] = [];
    let offset = 0;
    const batchSize = 100;
    while (true) {
      const batch = await this.getFriends(offset, batchSize, false);
      all.push(...batch);
      if (batch.length < batchSize) break;
      offset += batchSize;
    }
    return all;
  }

  async getAllOfflineFriends(): Promise<VRCUser[]> {
    const all: VRCUser[] = [];
    let offset = 0;
    const batchSize = 100;
    while (true) {
      const batch = await this.getFriends(offset, batchSize, true);
      all.push(...batch);
      if (batch.length < batchSize) break;
      offset += batchSize;
    }
    return all;
  }

  async sendFriendRequest(userId: string): Promise<void> {
    await this.request(`/user/${userId}/friendRequest`, { method: 'POST' });
  }

  async unfriend(userId: string): Promise<void> {
    await this.request(`/auth/user/friends/${userId}`, { method: 'DELETE' });
  }

  // --- Users ---

  async getUser(userId: string): Promise<VRCUser> {
    return this.request<VRCUser>(`/users/${userId}`);
  }

  async searchUsers(query: string, count = 20, offset = 0): Promise<VRCUser[]> {
    return this.request<VRCUser[]>(
      `/users?search=${encodeURIComponent(query)}&n=${count}&offset=${offset}`
    );
  }

  async getUserNote(userId: string): Promise<{ note: string }> {
    const user = await this.getUser(userId);
    return { note: user.note || '' };
  }

  async setUserNote(userId: string, note: string): Promise<void> {
    await this.request(`/userNotes`, {
      method: 'POST',
      body: JSON.stringify({ targetUserId: userId, note }),
    });
  }

  // --- Worlds ---

  async getWorld(worldId: string): Promise<VRCWorld> {
    return this.request<VRCWorld>(`/worlds/${worldId}`);
  }

  async searchWorlds(params: {
    query?: string;
    featured?: boolean;
    sort?: 'popularity' | 'heat' | 'trust' | 'shuffle' | 'favorites' | 'reportScore'
      | 'reportCount' | 'publicationDate' | 'labsPublicationDate' | 'created' | 'updated'
      | 'order' | 'relevance' | 'magic' | 'random';
    order?: 'ascending' | 'descending';
    count?: number;
    offset?: number;
    tag?: string;
    releaseStatus?: string;
  }): Promise<VRCWorld[]> {
    const qs = new URLSearchParams();
    if (params.query) qs.set('search', params.query);
    if (params.featured !== undefined) qs.set('featured', String(params.featured));
    if (params.sort) qs.set('sort', params.sort);
    if (params.order) qs.set('order', params.order);
    if (params.count) qs.set('n', String(params.count));
    if (params.offset) qs.set('offset', String(params.offset));
    if (params.tag) qs.set('tag', params.tag);
    return this.request<VRCWorld[]>(`/worlds?${qs.toString()}`);
  }

  async getActiveWorlds(count = 20, offset = 0): Promise<VRCWorld[]> {
    return this.request<VRCWorld[]>(`/worlds/active?n=${count}&offset=${offset}`);
  }

  async getRecentWorlds(count = 20, offset = 0): Promise<VRCWorld[]> {
    return this.request<VRCWorld[]>(`/worlds/recent?n=${count}&offset=${offset}`);
  }

  async getFavoriteWorlds(count = 20, offset = 0): Promise<VRCWorld[]> {
    return this.request<VRCWorld[]>(`/worlds/favorites?n=${count}&offset=${offset}`);
  }

  // --- Instances ---

  async getInstance(worldId: string, instanceId: string): Promise<VRCInstance> {
    return this.request<VRCInstance>(`/instances/${worldId}:${instanceId}`);
  }

  async selfInvite(worldId: string, instanceId: string): Promise<void> {
    await this.request(`/invite/myself/to/${worldId}:${instanceId}`, {
      method: 'POST',
    });
  }

  // --- Avatars ---

  async getAvatar(avatarId: string): Promise<VRCAvatar> {
    return this.request<VRCAvatar>(`/avatars/${avatarId}`);
  }

  async searchAvatars(params: {
    query?: string;
    featured?: boolean;
    sort?: string;
    order?: string;
    count?: number;
    offset?: number;
    tag?: string;
    releaseStatus?: string;
  }): Promise<VRCAvatar[]> {
    const qs = new URLSearchParams();
    if (params.query) qs.set('search', params.query);
    if (params.featured !== undefined) qs.set('featured', String(params.featured));
    if (params.sort) qs.set('sort', params.sort);
    if (params.count) qs.set('n', String(params.count));
    if (params.offset) qs.set('offset', String(params.offset));
    if (params.tag) qs.set('tag', params.tag);
    return this.request<VRCAvatar[]>(`/avatars?${qs.toString()}`);
  }

  async getOwnAvatars(count = 50, offset = 0): Promise<VRCAvatar[]> {
    return this.request<VRCAvatar[]>(`/avatars?user=me&n=${count}&offset=${offset}`);
  }

  async selectAvatar(avatarId: string): Promise<VRCCurrentUser> {
    return this.request<VRCCurrentUser>(`/avatars/${avatarId}/select`, {
      method: 'PUT',
    });
  }

  // --- Favorites ---

  async getFavorites(type: 'world' | 'friend' | 'avatar', count = 50, offset = 0): Promise<VRCFavorite[]> {
    return this.request<VRCFavorite[]>(
      `/favorites?type=${type}&n=${count}&offset=${offset}`
    );
  }

  async addFavorite(type: 'world' | 'friend' | 'avatar', favoriteId: string, tags: string[]): Promise<VRCFavorite> {
    return this.request<VRCFavorite>('/favorites', {
      method: 'POST',
      body: JSON.stringify({ type, favoriteId, tags }),
    });
  }

  async removeFavorite(favoriteId: string): Promise<void> {
    await this.request(`/favorites/${favoriteId}`, { method: 'DELETE' });
  }

  async getFavoriteGroups(type: 'world' | 'friend' | 'avatar'): Promise<VRCFavoriteGroup[]> {
    return this.request<VRCFavoriteGroup[]>(`/favorite/groups?type=${type}`);
  }

  // --- Notifications ---

  async getNotifications(type?: string, sent = false): Promise<VRCNotification[]> {
    let url = '/auth/user/notifications?';
    if (type) url += `type=${type}&`;
    if (sent) url += 'sent=true&';
    return this.request<VRCNotification[]>(url);
  }

  async markNotificationRead(notificationId: string): Promise<void> {
    await this.request(`/auth/user/notifications/${notificationId}/see`, {
      method: 'PUT',
    });
  }

  async clearAllNotifications(): Promise<void> {
    await this.request('/auth/user/notifications/clear', { method: 'PUT' });
  }

  // --- Invites ---

  async inviteUser(userId: string, worldId: string, instanceId: string, message?: string): Promise<void> {
    await this.request(`/invite/${userId}`, {
      method: 'POST',
      body: JSON.stringify({
        instanceId: `${worldId}:${instanceId}`,
        ...(message ? { message } : {}),
      }),
    });
  }

  // --- Mutual Friends ---

  async getMutualFriends(userId: string): Promise<VRCUser[]> {
    return this.request<VRCUser[]>(`/users/${userId}/mutuals/friends`);
  }

  // --- Groups ---

  async getUserGroups(userId: string): Promise<any[]> {
    return this.request<any[]>(`/users/${userId}/groups`);
  }

  async getGroup(groupId: string): Promise<any> {
    return this.request<any>(`/groups/${groupId}?includeRoles=true`);
  }

  async getGroupInstances(groupId: string): Promise<any[]> {
    return this.request<any[]>(`/groups/${groupId}/instances`);
  }

  async getGroupAnnouncement(groupId: string): Promise<any> {
    return this.request<any>(`/groups/${groupId}/announcement`);
  }

  async getGroupPosts(groupId: string, count = 10): Promise<{ posts: any[] }> {
    return this.request<{ posts: any[] }>(`/groups/${groupId}/posts?n=${count}`);
  }

  async getRepresentedGroup(userId: string): Promise<any> {
    return this.request<any>(`/users/${userId}/groups/represented`);
  }

  async setRepresentedGroup(groupId: string): Promise<void> {
    await this.request(`/groups/${groupId}/represent`, {
      method: 'PUT',
    });
  }

  // ── Inventory (emoji / stickers / props / skins) ──────────────────────
  //
  // This is where VRChat actually keeps the things the Instance Grabber has
  // been guessing at from log text. Every item carries an `itemType`, so a
  // sync here replaces keyword-sniffing with the real classification.

  async getInventory(params: {
    n?: number;
    offset?: number;
    itemType?: VRCInventoryItemType;
    order?: 'ascending' | 'descending';
    /** Archived items are hidden from the in-game UI but still owned. */
    isArchived?: boolean;
  } = {}): Promise<VRCInventoryItem[]> {
    const q = new URLSearchParams();
    q.set('n', String(params.n ?? 100));
    if (params.offset) q.set('offset', String(params.offset));
    if (params.itemType) q.set('itemType', params.itemType);
    if (params.order) q.set('order', params.order);
    if (params.isArchived !== undefined) q.set('isArchived', String(params.isArchived));
    const res = await this.request<any>(`/inventory?${q.toString()}`);
    // The endpoint has returned both a bare array and { data: [...] }.
    return Array.isArray(res) ? res : (res?.data ?? res?.items ?? []);
  }

  async getInventoryCollections(): Promise<any[]> {
    const res = await this.request<any>('/inventory/collections');
    return Array.isArray(res) ? res : (res?.data ?? []);
  }

  async getInventoryItem(inventoryItemId: string): Promise<VRCInventoryItem> {
    return this.request<VRCInventoryItem>(`/inventory/${inventoryItemId}`);
  }

  // ── Prints ────────────────────────────────────────────────────────────

  async getUserPrints(userId: string): Promise<VRCPrint[]> {
    const res = await this.request<any>(`/prints/user/${userId}`);
    return Array.isArray(res) ? res : (res?.data ?? []);
  }

  async getPrint(printId: string): Promise<VRCPrint> {
    return this.request<VRCPrint>(`/prints/${printId}`);
  }

  // ── Instances ─────────────────────────────────────────────────────────

  /** Live detail for one instance: occupancy, queue, age gate, closure. */
  async getInstanceDetail(worldId: string, instanceId: string): Promise<VRCInstanceDetail> {
    return this.request<VRCInstanceDetail>(`/instances/${worldId}:${instanceId}`);
  }

  /** Resolve a portal's short name (the code on a portal) to an instance. */
  async getInstanceByShortName(shortName: string): Promise<VRCInstanceDetail> {
    return this.request<VRCInstanceDetail>(`/instances/s/${encodeURIComponent(shortName)}`);
  }

  // ── Moderation reports ────────────────────────────────────────────────

  /**
   * Files a report with VRChat directly. Categories are not ours to invent —
   * they're the keys of `reportOptions` in GET /config, fetched below.
   */
  async submitModerationReport(payload: {
    category: string;
    reason: string;
    contentType: 'user' | 'world' | 'avatar' | 'group' | 'print' | 'emoji' | 'sticker';
    contentId: string;
  }): Promise<any> {
    return this.request<any>('/moderationReports', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async getModerationReports(): Promise<any[]> {
    const res = await this.request<any>('/moderationReports');
    return Array.isArray(res) ? res : (res?.results ?? res?.data ?? []);
  }

  // ── Config ────────────────────────────────────────────────────────────

  /** VRChat's own live constants — report categories, limits, URLs. */
  async getConfig(): Promise<VRCAPIConfig> {
    return this.request<VRCAPIConfig>('/config');
  }

  /** Live concurrent online user count. */
  async getVisits(): Promise<number> {
    const res = await this.request<any>('/visits');
    return typeof res === 'number' ? res : Number(res?.visits ?? res?.count ?? 0);
  }

  // ── Social extras ─────────────────────────────────────────────────────

  async getMutualGroups(userId: string): Promise<any[]> {
    const res = await this.request<any>(`/users/${userId}/mutuals/groups`);
    return Array.isArray(res) ? res : (res?.data ?? []);
  }

  /** VRChat's poke. Costs nothing and is a genuinely nice social action. */
  async boopUser(userId: string, emojiId?: string): Promise<void> {
    await this.request(`/users/${userId}/boop`, {
      method: 'POST',
      body: JSON.stringify(emojiId ? { emojiId } : {}),
    });
  }

  /** Every private note in one call, instead of one call per person. */
  async getAllUserNotes(n = 100, offset = 0): Promise<Array<{ id: string; targetUserId: string; note: string }>> {
    const res = await this.request<any>(`/userNotes?n=${n}&offset=${offset}`);
    return Array.isArray(res) ? res : (res?.data ?? []);
  }

  /** Your block/mute list, so the UI can flag people you've moderated. */
  async getPlayerModerations(type?: 'block' | 'mute' | 'unmute' | 'hideAvatar'): Promise<Array<{
    id: string; type: string; targetUserId: string; targetDisplayName: string; created: string;
  }>> {
    const res = await this.request<any>(`/auth/user/playermoderations${type ? `?type=${type}` : ''}`);
    return Array.isArray(res) ? res : (res?.data ?? []);
  }

  async unPlayerModerate(moderated: string, type: string): Promise<void> {
    await this.request('/auth/user/unplayermoderate', {
      method: 'PUT',
      body: JSON.stringify({ moderated, type }),
    });
  }

  // ── Notifications (fuller lifecycle) ──────────────────────────────────

  async respondToNotification(notificationId: string, responseType: string, responseData = ''): Promise<any> {
    return this.request<any>(`/notifications/${notificationId}/respond`, {
      method: 'POST',
      body: JSON.stringify({ responseType, responseData }),
    });
  }

  async acceptFriendRequest(notificationId: string): Promise<void> {
    await this.request(`/auth/user/notifications/${notificationId}/accept`, { method: 'PUT' });
  }

  async hideNotification(notificationId: string): Promise<void> {
    await this.request(`/auth/user/notifications/${notificationId}/hide`, { method: 'PUT' });
  }

  async markNotificationSeen(notificationId: string): Promise<void> {
    await this.request(`/notifications/${notificationId}/see`, { method: 'PUT' });
  }

  // ── Calendar (real VRChat group events) ───────────────────────────────

  async getCalendarFollowing(n = 30): Promise<any[]> {
    const res = await this.request<any>(`/calendar/following?n=${n}`);
    return Array.isArray(res) ? res : (res?.results ?? res?.data ?? []);
  }

  async getCalendarFeatured(n = 30): Promise<any[]> {
    const res = await this.request<any>(`/calendar/featured?n=${n}`);
    return Array.isArray(res) ? res : (res?.results ?? res?.data ?? []);
  }

  async searchCalendar(query: string, n = 30): Promise<any[]> {
    const res = await this.request<any>(`/calendar/search?query=${encodeURIComponent(query)}&n=${n}`);
    return Array.isArray(res) ? res : (res?.results ?? res?.data ?? []);
  }

  // --- Status update (used by sidebar preset) ---

  async updateStatus(userId: string, status: string, statusDescription: string): Promise<void> {
    await this.request(`/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify({ status, statusDescription }),
    });
  }
}

export class APIError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: unknown
  ) {
    super(message);
    this.name = 'APIError';
  }
}

export const api = new VRChatAPI();
export default api;
