// The avatar log: which avatars each player has worn, kept across sessions.
//
// instanceAvatarsStore only ever holds the avatar someone is wearing *right
// now* — a swap overwrites the previous one and it's gone. This keeps the
// last N per player instead, so "what was that avatar they had on ten minutes
// ago" has an answer.
//
// All of the interesting logic is here rather than in the store so it can be
// tested without a browser: the store is a thin persistence wrapper over
// `recordAvatar`.

import type { AvatarStats, PerfRank } from '../stores/instanceAvatarsStore';

export interface AvatarLogEntry {
  playerName: string;
  userId?: string;
  avatarId?: string;
  avatarName?: string;
  authorName?: string;
  thumbnailUrl?: string;
  rank?: PerfRank;
  stats?: AvatarStats;
  /** World this was spotted in, for context when reading the log later. */
  worldName?: string;
  firstSeenAt: number;
  lastSeenAt: number;
}

/** How many avatars per player the slider can be set to. */
export const KEEP_MIN = 1;
export const KEEP_MAX = 50;
export const KEEP_DEFAULT = 5;

/** Hard ceiling on the whole log, so an all-night session can't grow forever. */
export const TOTAL_MAX = 2000;

export function clampKeep(n: number): number {
  if (!Number.isFinite(n)) return KEEP_DEFAULT;
  return Math.min(KEEP_MAX, Math.max(KEEP_MIN, Math.round(n)));
}

/**
 * Are these two log entries the same avatar?
 *
 * Ids win when both have one. Falling back to names is deliberate: the log
 * often names an avatar long before anything hands us its id, and treating
 * those as different avatars would log the same one twice.
 */
export function sameAvatar(
  a: Pick<AvatarLogEntry, 'avatarId' | 'avatarName'>,
  b: Pick<AvatarLogEntry, 'avatarId' | 'avatarName'>,
): boolean {
  if (a.avatarId && b.avatarId) return a.avatarId === b.avatarId;
  if (a.avatarName && b.avatarName) return a.avatarName === b.avatarName;
  // One side has only an id and the other only a name — not comparable.
  return false;
}

/** Fill in blanks from a later sighting without overwriting what we knew. */
function merge(existing: AvatarLogEntry, incoming: AvatarLogEntry): AvatarLogEntry {
  return {
    ...existing,
    userId: existing.userId ?? incoming.userId,
    avatarId: existing.avatarId ?? incoming.avatarId,
    avatarName: existing.avatarName ?? incoming.avatarName,
    authorName: existing.authorName ?? incoming.authorName,
    thumbnailUrl: existing.thumbnailUrl ?? incoming.thumbnailUrl,
    // Performance data *does* overwrite: stats arrive in pieces as VRChat
    // writes the block out, so the newer read is the more complete one.
    rank: incoming.rank ?? existing.rank,
    stats: (incoming.stats || existing.stats)
      ? { ...(existing.stats ?? {}), ...(incoming.stats ?? {}) }
      : undefined,
    worldName: incoming.worldName ?? existing.worldName,
    firstSeenAt: Math.min(existing.firstSeenAt, incoming.firstSeenAt),
    lastSeenAt: Math.max(existing.lastSeenAt, incoming.lastSeenAt),
  };
}

/**
 * Add a sighting to the log, newest first.
 *
 * Re-seeing an avatar a player already has logged updates that entry rather
 * than adding a second one — which matters more than it sounds, because
 * re-reading the log (the Refresh button, or a reconnect) replays every
 * switch it can see and would otherwise duplicate the lot.
 *
 * Returns the same array reference when nothing changed, so a store can skip
 * the write and React can skip the render.
 */
export function recordAvatar(
  log: AvatarLogEntry[],
  entry: AvatarLogEntry,
  keepPerPlayer: number,
): AvatarLogEntry[] {
  if (!entry.playerName) return log;
  if (!entry.avatarId && !entry.avatarName) return log;

  const keep = clampKeep(keepPerPlayer);
  const at = log.findIndex(e => e.playerName === entry.playerName && sameAvatar(e, entry));

  let next: AvatarLogEntry[];
  if (at >= 0) {
    const merged = merge(log[at], entry);
    // Nothing new in this sighting — don't churn the store.
    if (isSame(log[at], merged)) return log;
    next = [...log];
    next.splice(at, 1);
    next.unshift(merged);
  } else {
    next = [entry, ...log];
  }

  return trim(next, keep);
}

/** Enforce the per-player cap (newest kept) and the global ceiling. */
export function trim(log: AvatarLogEntry[], keepPerPlayer: number): AvatarLogEntry[] {
  const keep = clampKeep(keepPerPlayer);
  const seen = new Map<string, number>();
  const out: AvatarLogEntry[] = [];
  // `log` is newest-first, so the first `keep` we meet for a player are the
  // ones to keep.
  for (const e of log) {
    const n = seen.get(e.playerName) ?? 0;
    if (n >= keep) continue;
    seen.set(e.playerName, n + 1);
    out.push(e);
    if (out.length >= TOTAL_MAX) break;
  }
  return out;
}

function isSame(a: AvatarLogEntry, b: AvatarLogEntry): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Newest-first, grouped by player, for the log panel. */
export interface PlayerLog {
  playerName: string;
  userId?: string;
  entries: AvatarLogEntry[];
  lastSeenAt: number;
}

export function groupByPlayer(log: AvatarLogEntry[]): PlayerLog[] {
  const groups = new Map<string, PlayerLog>();
  for (const e of log) {
    const g = groups.get(e.playerName);
    if (g) {
      g.entries.push(e);
      g.userId ??= e.userId;
      g.lastSeenAt = Math.max(g.lastSeenAt, e.lastSeenAt);
    } else {
      groups.set(e.playerName, {
        playerName: e.playerName,
        userId: e.userId,
        entries: [e],
        lastSeenAt: e.lastSeenAt,
      });
    }
  }
  return [...groups.values()].sort((a, b) => b.lastSeenAt - a.lastSeenAt);
}
