// Persisted avatar log.
//
// instanceAvatarsStore is deliberately ephemeral — it holds who is wearing
// what right now and forgets everything on close. This store is the opposite:
// it watches that one and keeps the last N avatars per player on disk, so the
// history survives restarts.
//
// It is off unless the user turns it on (Settings → Avatar Log, or the panel
// on the Live Avatars page). Nothing is written while it's off, and turning it
// off does not silently keep collecting.

import { create } from 'zustand';
import { savePersistentData, loadPersistentData } from '../utils/persistentStorage';
import { useSettingsStore } from './settingsStore';
import { useInstanceAvatarsStore, type PlayerAvatar } from './instanceAvatarsStore';
import {
  recordAvatar, trim, groupByPlayer,
  type AvatarLogEntry, type PlayerLog,
} from '../utils/avatarHistory';

const STORAGE_KEY = 'vrcstudio_avatar_log';

function load(): AvatarLogEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Writes are debounced: a busy instance can fire a dozen switches a second
// while a perf block streams in, and JSON.stringify on every one of them is
// the sort of thing that makes an app feel slow for no visible reason.
let saveTimer: ReturnType<typeof setTimeout> | null = null;
function save(entries: AvatarLogEntry[]) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch {
      // Quota. Halve the log and try once more rather than losing all of it.
      const half = entries.slice(0, Math.floor(entries.length / 2));
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(half)); } catch { /* give up */ }
    }
    void savePersistentData('avatar_log', entries);
  }, 1500);
}

interface State {
  entries: AvatarLogEntry[];
  /** Bumped whenever the log is cleared, so panels can flash a confirmation. */
  clearedAt: number | null;

  record: (entry: AvatarLogEntry) => void;
  clearAll: () => void;
  clearPlayer: (playerName: string) => void;
  removeEntry: (entry: AvatarLogEntry) => void;
  /** Re-apply the per-player cap after the slider moves. */
  applyLimit: (keepPerPlayer: number) => void;
  grouped: () => PlayerLog[];
}

export const useAvatarHistoryStore = create<State>((set, get) => ({
  entries: load(),
  clearedAt: null,

  record: (entry) => {
    const { enabled, keepPerPlayer } = useSettingsStore.getState().settings.avatarLog;
    if (!enabled) return;
    const next = recordAvatar(get().entries, entry, keepPerPlayer);
    if (next === get().entries) return;
    save(next);
    set({ entries: next });
  },

  clearAll: () => {
    save([]);
    set({ entries: [], clearedAt: Date.now() });
  },

  clearPlayer: (playerName) => {
    const next = get().entries.filter(e => e.playerName !== playerName);
    if (next.length === get().entries.length) return;
    save(next);
    set({ entries: next });
  },

  removeEntry: (entry) => {
    const next = get().entries.filter(e => e !== entry);
    if (next.length === get().entries.length) return;
    save(next);
    set({ entries: next });
  },

  applyLimit: (keepPerPlayer) => {
    const next = trim(get().entries, keepPerPlayer);
    if (next.length === get().entries.length) return;
    save(next);
    set({ entries: next });
  },

  grouped: () => groupByPlayer(get().entries),
}));

/** Pull anything written by a previous install off disk on first run. */
export async function restoreAvatarLogFromDisk() {
  if (localStorage.getItem(STORAGE_KEY)) return;
  const persisted = await loadPersistentData<AvatarLogEntry[]>('avatar_log');
  if (!Array.isArray(persisted) || persisted.length === 0) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
  useAvatarHistoryStore.setState({ entries: persisted });
}

// ── Tracking ────────────────────────────────────────────────────────────

function toEntry(p: PlayerAvatar, worldName: string | undefined, at: number): AvatarLogEntry {
  return {
    playerName: p.playerName,
    userId: p.userId,
    avatarId: p.avatarId,
    avatarName: p.avatarName ?? p.vrcdbMatch?.name,
    authorName: p.vrcdbMatch?.authorName,
    thumbnailUrl: p.vrcdbMatch?.thumbnailImageUrl || p.vrcdbMatch?.imageUrl,
    rank: p.rank,
    stats: p.stats,
    worldName,
    firstSeenAt: p.lastAvatarChangeAt ?? p.seenAt ?? at,
    lastSeenAt: at,
  };
}

let unsubscribe: (() => void) | null = null;

/**
 * Start mirroring instanceAvatarsStore into the log.
 *
 * Every change to the live player map is offered to `record`, which decides
 * whether it's new. That's deliberately dumber than diffing here: the perf
 * stats and the avtrdb thumbnail land seconds *after* the switch line, and a
 * "only on change of avatar id" filter would log the avatar before any of the
 * interesting data existed and never go back for it.
 */
export function startAvatarLogTracking() {
  if (unsubscribe) return unsubscribe;

  unsubscribe = useInstanceAvatarsStore.subscribe((state, prev) => {
    const cfg = useSettingsStore.getState().settings.avatarLog;
    if (!cfg.enabled) return;
    if (state.byPlayer === prev.byPlayer) return;

    const at = Date.now();
    const worldName = state.instance.worldName;
    const record = useAvatarHistoryStore.getState().record;

    for (const name of Object.keys(state.byPlayer)) {
      const p = state.byPlayer[name];
      if (p === prev.byPlayer[name]) continue;
      if (p.isLocal && !cfg.includeSelf) continue;
      if (!p.avatarId && !p.avatarName) continue;
      record(toEntry(p, worldName, at));
    }
  });

  return unsubscribe;
}

export function stopAvatarLogTracking() {
  unsubscribe?.();
  unsubscribe = null;
}
