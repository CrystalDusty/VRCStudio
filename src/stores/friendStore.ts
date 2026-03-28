import { create } from 'zustand';
import api from '../api/vrchat';
import type { VRCUser, FriendNote } from '../types/vrchat';
import { useFeedStore } from './feedStore';

interface FriendState {
  onlineFriends: VRCUser[];
  offlineFriends: VRCUser[];
  isLoading: boolean;
  lastUpdated: number | null;
  notes: Record<string, FriendNote>;
  previousLocations: Record<string, string>;

  fetchOnlineFriends: () => Promise<void>;
  fetchOfflineFriends: () => Promise<void>;
  fetchAllFriends: () => Promise<void>;
  setNote: (userId: string, note: string, tags?: string[], color?: string) => void;
  getNote: (userId: string) => FriendNote | undefined;
  getFriend: (userId: string) => VRCUser | undefined;
}

const NOTES_KEY = 'vrcstudio_friend_notes';

function loadNotes(): Record<string, FriendNote> {
  try {
    const raw = localStorage.getItem(NOTES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveNotes(notes: Record<string, FriendNote>) {
  localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
}

export const useFriendStore = create<FriendState>((set, get) => ({
  onlineFriends: [],
  offlineFriends: [],
  isLoading: false,
  lastUpdated: null,
  notes: loadNotes(),
  previousLocations: {},

  fetchOnlineFriends: async () => {
    try {
      const friends = await api.getAllOnlineFriends();
      const oldFriends = get().onlineFriends;
      const prevLocations = get().previousLocations;
      const feed = useFeedStore.getState();

      const oldMap = new Map(oldFriends.map(f => [f.id, f]));

      for (const friend of friends) {
        const old = oldMap.get(friend.id);
        if (!old) {
          feed.addEvent({
            type: 'friend_online',
            userId: friend.id,
            userName: friend.displayName,
            userAvatar: friend.currentAvatarThumbnailImageUrl,
            details: friend.statusDescription,
          });
        } else if (old.location !== friend.location && friend.location !== 'private' && friend.location) {
          feed.addEvent({
            type: 'friend_location',
            userId: friend.id,
            userName: friend.displayName,
            userAvatar: friend.currentAvatarThumbnailImageUrl,
            worldId: friend.location?.split(':')[0],
            details: `Moved to a new instance`,
            previousValue: prevLocations[friend.id],
            newValue: friend.location,
          });
        }

        if (old && old.status !== friend.status) {
          feed.addEvent({
            type: 'friend_status',
            userId: friend.id,
            userName: friend.displayName,
            userAvatar: friend.currentAvatarThumbnailImageUrl,
            previousValue: old.status,
            newValue: friend.status,
          });
        }
      }

      for (const old of oldFriends) {
        if (!friends.find(f => f.id === old.id)) {
          feed.addEvent({
            type: 'friend_offline',
            userId: old.id,
            userName: old.displayName,
            userAvatar: old.currentAvatarThumbnailImageUrl,
          });
        }
      }

      const newPrevLocations: Record<string, string> = {};
      for (const f of friends) {
        if (f.location) newPrevLocations[f.id] = f.location;
      }

      set({
        onlineFriends: friends,
        lastUpdated: Date.now(),
        previousLocations: newPrevLocations,
      });
    } catch (err) {
      console.error('Failed to fetch online friends:', err);
    }
  },

  fetchOfflineFriends: async () => {
    try {
      const friends = await api.getAllOfflineFriends();
      set({ offlineFriends: friends });
    } catch (err) {
      console.error('Failed to fetch offline friends:', err);
    }
  },

  fetchAllFriends: async () => {
    set({ isLoading: true });
    await Promise.all([
      get().fetchOnlineFriends(),
      get().fetchOfflineFriends(),
    ]);
    set({ isLoading: false });
  },

  setNote: (userId, note, tags = [], color) => {
    const notes = { ...get().notes };
    notes[userId] = { userId, note, tags, color, updatedAt: Date.now() };
    saveNotes(notes);
    set({ notes });
  },

  getNote: (userId) => get().notes[userId],

  getFriend: (userId) => {
    return get().onlineFriends.find(f => f.id === userId)
      || get().offlineFriends.find(f => f.id === userId);
  },
}));
