import { create } from 'zustand';
import type { UserStatus } from '../types/vrchat';

export interface StatusPreset {
  id: string;
  name: string;
  status: UserStatus;
  statusDescription: string;
}

const STORAGE_KEY = 'vrcstudio_status_presets';

function loadPresets(): StatusPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : defaultPresets;
  } catch {
    return defaultPresets;
  }
}

const defaultPresets: StatusPreset[] = [
  { id: 'p1', name: 'Available', status: 'join me', statusDescription: 'Come join me!' },
  { id: 'p2', name: 'Chilling', status: 'active', statusDescription: 'Just vibing' },
  { id: 'p3', name: 'AFK', status: 'busy', statusDescription: 'Away from keyboard' },
  { id: 'p4', name: 'Recording', status: 'ask me', statusDescription: 'Recording, please ask before joining' },
];

interface StatusPresetState {
  presets: StatusPreset[];
  addPreset: (preset: Omit<StatusPreset, 'id'>) => void;
  removePreset: (id: string) => void;
  updatePreset: (id: string, updates: Partial<StatusPreset>) => void;
  reorderPresets: (presets: StatusPreset[]) => void;
}

function savePresets(presets: StatusPreset[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}

export const useStatusPresetStore = create<StatusPresetState>((set, get) => ({
  presets: loadPresets(),

  addPreset: (preset) => {
    const newPreset = { ...preset, id: `p_${Date.now()}` };
    const presets = [...get().presets, newPreset];
    savePresets(presets);
    set({ presets });
  },

  removePreset: (id) => {
    const presets = get().presets.filter(p => p.id !== id);
    savePresets(presets);
    set({ presets });
  },

  updatePreset: (id, updates) => {
    const presets = get().presets.map(p => p.id === id ? { ...p, ...updates } : p);
    savePresets(presets);
    set({ presets });
  },

  reorderPresets: (presets) => {
    savePresets(presets);
    set({ presets });
  },
}));
