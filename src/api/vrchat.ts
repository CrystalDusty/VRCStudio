import type {
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

class VRChatAPI {
  private authCookie: string = '';
  private twoFactorAuth: string = '';

  private get headers(): Record<string, string> {
    const h: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'VRCStudio/1.0.0',
    };
    if (this.authCookie) {
      let cookies = `auth=${this.authCookie}`;
      if (this.twoFactorAuth) cookies += `; twoFactorAuth=${this.twoFactorAuth}`;
      h['Cookie'] = cookies;
    }
    return h;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${API_BASE}${path}${path.includes('?') ? '&' : '?'}apiKey=${API_KEY}`;
    const res = await fetch(url, {
      ...options,
      headers: { ...this.headers, ...options.headers as Record<string, string> },
      credentials: 'include',
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
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
