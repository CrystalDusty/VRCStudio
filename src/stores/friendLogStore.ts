import { create } from 'zustand';

export interface FriendLogEntry {
  id: string;
  type: 'added' | 'removed' | 'name_change' | 'status_change';
  userId: string;
  displayName: string;
  avatarUrl?: string;
  details?: string;
  previousValue?: string;
  newValue?: string;
  timestamp: number;
}

const STORAGE_KEY = 'vrcstudio_friend_log';
const MAX_ENTRIES = 2000;

function loadLog(): FriendLogEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLog(entries: FriendLogEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
}

interface FriendLogState {
  entries: FriendLogEntry[];
  addEntry: (entry: Omit<FriendLogEntry, 'id' | 'timestamp'>) => void;
  clearLog: () => void;
  getEntriesForUser: (userId: string) => FriendLogEntry[];
  getEntriesByType: (type: FriendLogEntry['type']) => FriendLogEntry[];
}

let counter = 0;

export const useFriendLogStore = create<FriendLogState>((set, get) => ({
  entries: loadLog(),

  addEntry: (entry) => {
    const newEntry: FriendLogEntry = {
      ...entry,
      id: `fl_${Date.now()}_${counter++}`,
      timestamp: Date.now(),
    };
    const entries = [newEntry, ...get().entries].slice(0, MAX_ENTRIES);
    saveLog(entries);
    set({ entries });
  },

  clearLog: () => {
    saveLog([]);
    set({ entries: [] });
  },

  getEntriesForUser: (userId) => get().entries.filter(e => e.userId === userId),

  getEntriesByType: (type) => get().entries.filter(e => e.type === type),
}));
