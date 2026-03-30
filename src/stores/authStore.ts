import { create } from 'zustand';
import api, { APIError } from '../api/vrchat';
import type { VRCCurrentUser } from '../types/vrchat';

interface AuthState {
  user: VRCCurrentUser | null;
  isLoggedIn: boolean;
  isLoading: boolean;
  needs2FA: boolean;
  twoFactorMethod: 'totp' | 'emailotp';
  error: string | null;

  login: (username: string, password: string) => Promise<void>;
  verify2FA: (code: string) => Promise<void>;
  restoreSession: () => Promise<void>;
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

const STORAGE_KEY = 'vrcstudio_auth';

function saveAuth(auth: string, tfa?: string) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ auth, tfa }));
  } catch {}
}

function loadAuth(): { auth: string; tfa?: string } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function clearStoredAuth() {
  localStorage.removeItem(STORAGE_KEY);
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoggedIn: false,
  isLoading: false,
  needs2FA: false,
  twoFactorMethod: 'totp',
  error: null,

  login: async (username, password) => {
    set({ isLoading: true, error: null, needs2FA: false });
    try {
      const result = await api.login(username, password);
      const resultAny = result as any;

      // VRChat returns { requiresTwoFactorAuth: ["totp", "emailOtp"] } when 2FA is needed
      if (resultAny.requiresTwoFactorAuth && Array.isArray(resultAny.requiresTwoFactorAuth)) {
        const methods: string[] = resultAny.requiresTwoFactorAuth;
        const method = methods.includes('totp') ? 'totp' : 'emailotp';
        const cookies = api.getAuthCookies();
        saveAuth(cookies.auth, cookies.twoFactorAuth);
        set({ needs2FA: true, twoFactorMethod: method, isLoading: false });
        return;
      }

      // Also check tags for 2FA (fallback)
      if (result.tags?.includes('system_twoFactorAuthEnabled')) {
        const method = result.tags.includes('system_twoFactorAuthEnabledTotp') ? 'totp' : 'emailotp';
        const cookies = api.getAuthCookies();
        saveAuth(cookies.auth, cookies.twoFactorAuth);
        set({ needs2FA: true, twoFactorMethod: method, isLoading: false });
        return;
      }

      const cookies = api.getAuthCookies();
      saveAuth(cookies.auth, cookies.twoFactorAuth);
      set({ user: result, isLoggedIn: true, isLoading: false, needs2FA: false });
    } catch (err) {
      const msg = err instanceof APIError
        ? err.message
        : 'Login failed. Please check your credentials.';
      set({ error: msg, isLoading: false });
    }
  },

  verify2FA: async (code) => {
    set({ isLoading: true, error: null });
    try {
      const method = get().twoFactorMethod;
      await api.verify2FA(code, method);
      const user = await api.getCurrentUser();
      const cookies = api.getAuthCookies();
      saveAuth(cookies.auth, cookies.twoFactorAuth);
      set({ user, isLoggedIn: true, isLoading: false, needs2FA: false });
    } catch (err) {
      const msg = err instanceof APIError ? err.message : 'Invalid 2FA code.';
      set({ error: msg, isLoading: false });
    }
  },

  restoreSession: async () => {
    const stored = loadAuth();
    if (!stored?.auth) return;

    set({ isLoading: true });
    api.setAuth(stored.auth, stored.tfa);

    try {
      const user = await api.getCurrentUser();
      const cookies = api.getAuthCookies();
      saveAuth(cookies.auth, cookies.twoFactorAuth);
      set({ user, isLoggedIn: true, isLoading: false });
    } catch {
      clearStoredAuth();
      api.clearAuth();
      set({ isLoading: false });
    }
  },

  refreshUser: async () => {
    try {
      const user = await api.getCurrentUser();
      set({ user });
    } catch {}
  },

  logout: async () => {
    try {
      await api.logout();
    } catch {} finally {
      clearStoredAuth();
      api.clearAuth();
      set({ user: null, isLoggedIn: false, needs2FA: false, error: null });
    }
  },

  clearError: () => set({ error: null }),
}));
