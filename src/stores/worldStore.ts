import { create } from 'zustand';
import api from '../api/vrchat';
import type { VRCWorld, VRCInstance } from '../types/vrchat';

interface WorldState {
  searchResults: VRCWorld[];
  activeWorlds: VRCWorld[];
  recentWorlds: VRCWorld[];
  favoriteWorlds: VRCWorld[];
  worldCache: Record<string, VRCWorld>;
  instanceCache: Record<string, VRCInstance>;
  isLoading: boolean;
  searchQuery: string;

  searchWorlds: (query: string) => Promise<void>;
  fetchActiveWorlds: () => Promise<void>;
  fetchRecentWorlds: () => Promise<void>;
  fetchFavoriteWorlds: () => Promise<void>;
  getWorld: (worldId: string) => Promise<VRCWorld>;
  getInstance: (worldId: string, instanceId: string) => Promise<VRCInstance>;
  setSearchQuery: (query: string) => void;
}

export const useWorldStore = create<WorldState>((set, get) => ({
  searchResults: [],
  activeWorlds: [],
  recentWorlds: [],
  favoriteWorlds: [],
  worldCache: {},
  instanceCache: {},
  isLoading: false,
  searchQuery: '',

  searchWorlds: async (query) => {
    set({ isLoading: true, searchQuery: query });
    try {
      const results = await api.searchWorlds({ query, count: 30, sort: 'relevance' });
      const cache = { ...get().worldCache };
      results.forEach(w => { cache[w.id] = w; });
      set({ searchResults: results, worldCache: cache, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  fetchActiveWorlds: async () => {
    set({ isLoading: true });
    try {
      const worlds = await api.getActiveWorlds(30);
      const cache = { ...get().worldCache };
      worlds.forEach(w => { cache[w.id] = w; });
      set({ activeWorlds: worlds, worldCache: cache, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  fetchRecentWorlds: async () => {
    try {
      const worlds = await api.getRecentWorlds(30);
      const cache = { ...get().worldCache };
      worlds.forEach(w => { cache[w.id] = w; });
      set({ recentWorlds: worlds, worldCache: cache });
    } catch {}
  },

  fetchFavoriteWorlds: async () => {
    try {
      const worlds = await api.getFavoriteWorlds(50);
      const cache = { ...get().worldCache };
      worlds.forEach(w => { cache[w.id] = w; });
      set({ favoriteWorlds: worlds, worldCache: cache });
    } catch {}
  },

  getWorld: async (worldId) => {
    const cached = get().worldCache[worldId];
    if (cached) return cached;

    const world = await api.getWorld(worldId);
    set((state) => ({
      worldCache: { ...state.worldCache, [worldId]: world },
    }));
    return world;
  },

  getInstance: async (worldId, instanceId) => {
    const key = `${worldId}:${instanceId}`;
    const cached = get().instanceCache[key];
    if (cached) return cached;

    const instance = await api.getInstance(worldId, instanceId);
    set((state) => ({
      instanceCache: { ...state.instanceCache, [key]: instance },
    }));
    return instance;
  },

  setSearchQuery: (query) => set({ searchQuery: query }),
}));
