import { create } from 'zustand';

export interface InstanceHistoryEntry {
  id: string;
  worldId: string;
  instanceId: string;
  worldName: string;
  worldImage: string;
  instanceType: string;
  joinedAt: number;
  leftAt?: number;
}

const STORAGE_KEY = 'vrcstudio_instance_history';

function loadHistory(): InstanceHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(entries: InstanceHistoryEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, 100)));
}

interface InstanceHistoryState {
  history: InstanceHistoryEntry[];
  currentInstance: InstanceHistoryEntry | null;

  trackJoin: (entry: Omit<InstanceHistoryEntry, 'id' | 'joinedAt'>) => void;
  trackLeave: () => void;
  getRecent: (count?: number) => InstanceHistoryEntry[];
  clearHistory: () => void;
}

export const useInstanceHistoryStore = create<InstanceHistoryState>((set, get) => ({
  history: loadHistory(),
  currentInstance: null,

  trackJoin: (entry) => {
    // Leave current instance first
    get().trackLeave();

    const newEntry: InstanceHistoryEntry = {
      ...entry,
      id: `inst_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      joinedAt: Date.now(),
    };

    set({ currentInstance: newEntry });
    const updated = [newEntry, ...get().history];
    set({ history: updated });
    saveHistory(updated);
  },

  trackLeave: () => {
    const current = get().currentInstance;
    if (current) {
      const updated = get().history.map(h =>
        h.id === current.id ? { ...h, leftAt: Date.now() } : h
      );
      set({ history: updated, currentInstance: null });
      saveHistory(updated);
    }
  },

  getRecent: (count = 10) => get().history.slice(0, count),

  clearHistory: () => {
    set({ history: [], currentInstance: null });
    localStorage.removeItem(STORAGE_KEY);
  },
}));
