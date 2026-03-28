import { create } from 'zustand';
import api from '../api/vrchat';
import type { VRCFavorite, VRCFavoriteGroup } from '../types/vrchat';

interface FavoriteState {
  worldFavorites: VRCFavorite[];
  friendFavorites: VRCFavorite[];
  avatarFavorites: VRCFavorite[];
  favoriteGroups: Record<string, VRCFavoriteGroup[]>;
  isLoading: boolean;

  fetchFavorites: (type: 'world' | 'friend' | 'avatar') => Promise<void>;
  fetchAllFavorites: () => Promise<void>;
  fetchFavoriteGroups: (type: 'world' | 'friend' | 'avatar') => Promise<void>;
  addFavorite: (type: 'world' | 'friend' | 'avatar', favoriteId: string, tags: string[]) => Promise<void>;
  removeFavorite: (favoriteId: string, type: 'world' | 'friend' | 'avatar') => Promise<void>;
  isFavorite: (favoriteId: string) => boolean;
}

export const useFavoriteStore = create<FavoriteState>((set, get) => ({
  worldFavorites: [],
  friendFavorites: [],
  avatarFavorites: [],
  favoriteGroups: {},
  isLoading: false,

  fetchFavorites: async (type) => {
    try {
      const favorites = await api.getFavorites(type, 100);
      switch (type) {
        case 'world':
          set({ worldFavorites: favorites });
          break;
        case 'friend':
          set({ friendFavorites: favorites });
          break;
        case 'avatar':
          set({ avatarFavorites: favorites });
          break;
      }
    } catch (err) {
      console.error(`Failed to fetch ${type} favorites:`, err);
    }
  },

  fetchAllFavorites: async () => {
    set({ isLoading: true });
    await Promise.all([
      get().fetchFavorites('world'),
      get().fetchFavorites('friend'),
      get().fetchFavorites('avatar'),
    ]);
    set({ isLoading: false });
  },

  fetchFavoriteGroups: async (type) => {
    try {
      const groups = await api.getFavoriteGroups(type);
      set((state) => ({
        favoriteGroups: { ...state.favoriteGroups, [type]: groups },
      }));
    } catch {}
  },

  addFavorite: async (type, favoriteId, tags) => {
    try {
      const fav = await api.addFavorite(type, favoriteId, tags);
      switch (type) {
        case 'world':
          set((s) => ({ worldFavorites: [...s.worldFavorites, fav] }));
          break;
        case 'friend':
          set((s) => ({ friendFavorites: [...s.friendFavorites, fav] }));
          break;
        case 'avatar':
          set((s) => ({ avatarFavorites: [...s.avatarFavorites, fav] }));
          break;
      }
    } catch (err) {
      console.error('Failed to add favorite:', err);
    }
  },

  removeFavorite: async (favoriteId, type) => {
    try {
      const favList = type === 'world' ? get().worldFavorites
        : type === 'friend' ? get().friendFavorites
        : get().avatarFavorites;
      const fav = favList.find(f => f.favoriteId === favoriteId);
      if (fav) {
        await api.removeFavorite(fav.id);
        const filter = (list: VRCFavorite[]) => list.filter(f => f.favoriteId !== favoriteId);
        switch (type) {
          case 'world':
            set((s) => ({ worldFavorites: filter(s.worldFavorites) }));
            break;
          case 'friend':
            set((s) => ({ friendFavorites: filter(s.friendFavorites) }));
            break;
          case 'avatar':
            set((s) => ({ avatarFavorites: filter(s.avatarFavorites) }));
            break;
        }
      }
    } catch (err) {
      console.error('Failed to remove favorite:', err);
    }
  },

  isFavorite: (favoriteId) => {
    const { worldFavorites, friendFavorites, avatarFavorites } = get();
    return [...worldFavorites, ...friendFavorites, ...avatarFavorites]
      .some(f => f.favoriteId === favoriteId);
  },
}));
