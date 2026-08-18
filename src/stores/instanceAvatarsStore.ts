// Tracks which avatar every player in the current instance is wearing,
// plus performance stats parsed from VRChat's [AvatarPerformance] blocks.
//
// IMPORTANT: This store is *deliberately ephemeral*. No localStorage, no
// persistent app data — the user asked for this explicitly. Closing the
// app wipes everything. Switching instances also wipes the player map.
//
// ── What VRChat actually writes ────────────────────────────────────────
// The log lines we care about (as of current VRChat builds) look like:
//
//   2024.05.01 21:14:07 Log        -  [Behaviour] Joining wrld_xxx:4711~region(use)
//   2024.05.01 21:14:09 Log        -  [Behaviour] Entering Room: The Black Cat
//   2024.05.01 21:14:12 Log        -  [Behaviour] OnPlayerJoined Nyx (usr_xxx)
//   2024.05.01 21:14:13 Log        -  [Behaviour] Switching Nyx to avatar Shibe Deluxe
//   2024.05.01 21:14:14 Log        -  [AvatarPerformance] Avatar Stats for Avatar 'Shibe Deluxe'
//                                     ---- Avatar Performance Ratings ----
//                                     Overall Performance: Medium
//                                     Polygons: 68,301
//
// The critical detail: "Switching <player> to avatar <X>" gives the avatar's
// NAME, not its avtr_ id — the old parser only accepted `avtr_…` there, so
// it matched nothing and the page stayed empty. We now key on the name,
// pick up ids opportunistically wherever VRChat does log one, and resolve
// the rest through avtrdb by name.

import { create } from 'zustand';
import { vrcdb } from '../api/vrcdb';
import type { VRCDBAvatar } from '../api/vrcdb';

export type PerfRank = 'Excellent' | 'Good' | 'Medium' | 'Poor' | 'Very Poor';

export interface AvatarStats {
  triangles?: number;
  materials?: number;
  meshes?: number;
  skinnedMeshes?: number;
  dynamicBones?: number;
  physBones?: number;
  particles?: number;
  audioSources?: number;
  drawCalls?: number;
  bones?: number;
  lights?: number;
  animators?: number;
}

export interface PlayerAvatar {
  playerName: string;
  userId?: string;
  /** True for the logged-in user's own player entry. */
  isLocal?: boolean;
  avatarId?: string;
  avatarName?: string;     // from the "Switching … to avatar X" line
  rank?: PerfRank;
  stats?: AvatarStats;
  /** Result of vrcdb lookup: undefined = not looked up, null = looked up & no match, object = match. */
  vrcdbMatch?: VRCDBAvatar | null;
  vrcdbLooking?: boolean;  // in-flight
  /** The avatar id came from an avtrdb name search, not from the log. */
  idFromNameSearch?: boolean;
  seenAt: number;
  lastAvatarChangeAt?: number;
}

interface CurrentInstance {
  worldId?: string;
  worldName?: string;
  instanceId?: string;
}

interface State {
  byPlayer: Record<string, PlayerAvatar>;
  instance: CurrentInstance;
  lastResetAt: number;

  // ── Diagnostics (drives the panel's status line) ──
  /** Total log lines fed through the parser this session. */
  linesSeen: number;
  /** Lines the parser recognised as something it cares about. */
  eventsParsed: number;
  /** Wall-clock of the last recognised event. */
  lastEventAt?: number;
  /** Path of the log file the last refresh read from. */
  logPath?: string;
  /** Populated when a refresh could not read the log. */
  logError?: string;
  refreshing: boolean;

  setInstanceContext: (ctx: CurrentInstance) => void;
  ingestLines: (lines: string[]) => void;
  lookupOnVrcdb: (playerName: string) => Promise<void>;
  refreshFromLog: () => Promise<{ ok: boolean; players: number; lines: number; error?: string }>;
  resetForInstance: () => void;
  removePlayer: (playerName: string) => void;
}

// ── Regex patterns ──────────────────────────────────────────────────────

// "2024.05.01 21:14:07 Log        -  <body>" (level word is optional, some
// builds and crash-dump lines omit it).
const TIMESTAMP_RE = /^(\d{4}\.\d{2}\.\d{2}\s+\d{2}:\d{2}:\d{2})\s+\w+\s+-\s+(.*)$/;
const TIMESTAMP_RE_SIMPLE = /^(\d{4}\.\d{2}\.\d{2}\s+\d{2}:\d{2}:\d{2})\s+(.*)$/;

// Player joined / left. VRChat appends "(usr_…)" on newer builds only.
const PLAYER_JOINED_RE = /\[Behaviour\]\s+OnPlayerJoined\s+(.+)/;
const PLAYER_LEFT_RE   = /\[Behaviour\]\s+OnPlayerLeft\s+(.+)/;
// Older builds logged this instead of OnPlayerLeft.
const PLAYER_UNREG_RE  = /\[Behaviour\]\s+Unregistering\s+(.+)/;
// [Behaviour] Initialized PlayerAPI "Nyx" is local
const PLAYER_API_RE    = /\[Behaviour\]\s+Initialized PlayerAPI\s+"(.+?)"\s+is\s+(local|remote)/i;

// Room transitions.
const JOINING_ROOM_RE  = /\[Behaviour\]\s+Joining\s+(wrld_[a-zA-Z0-9-]+):([^\s~]+)/;
const ENTERING_ROOM_RE = /\[Behaviour\]\s+Entering Room:\s+(.+)/;
const LEFT_ROOM_RE     = /\[Behaviour\]\s+OnLeftRoom/;

// Any avatar id appearing anywhere on a line.
const AVATAR_ID_RE = /avtr_[0-9a-fA-F-]{8,}/;

// "[Behaviour] Switching <player> to avatar <avatar>" and its historical
// spellings. Handled by prefix/suffix slicing rather than a regex because
// display names may themselves contain " to avatar ".
const SWITCH_PREFIXES = [
  '[Behaviour] Switching ',
  '[AvatarManager] Switching ',
  '[AvatarManagement] Switching ',
];
const SWITCH_INFIX = ' to avatar ';

// [AvatarLoader] Begin loading avatar avtr_xxx for <player>
const AVATAR_LOADER_RE = /\[Avatar(?:Loader|Manager)\]\s+Begin\s+loading\s+avatar\s+(avtr_[0-9a-fA-F-]+)\s+for\s+(.+)/i;
// [Behaviour] OnAvatarInstantiated <player> avtr_xxx  (rare, id-bearing)
const AVATAR_INSTANTIATED_RE = /\[Behaviour\]\s+OnAvatarInstantiated\s+(.+?)\s+(avtr_[0-9a-fA-F-]+)/i;

// [AvatarPerformance] Avatar Stats for Avatar 'NAME'
const PERF_BLOCK_START_RE = /\[AvatarPerformance\]\s+Avatar Stats for Avatar\s+['"](.+?)['"]/i;
// "Overall Performance: Medium" (current) / "Performance Rating: Medium" (older)
const PERF_RANK_RE = /(?:Overall Performance|Performance Rating|Overall Rating)\s*:\s*(Excellent|Good|Medium|Poor|Very Poor)/i;
// Stat lines, e.g. "  Polygons: 68,301", "Stats Total: Material Count: 4",
// "Skinned Mesh Renderers: 2 - Good".
const PERF_STAT_RE = /^(?:Stats\s+Total:\s+)?([A-Za-z][A-Za-z ()/-]*?)\s*:\s*([\d,]+)/;

// Maps the human label in [AvatarPerformance] to our AvatarStats key.
function statKeyFor(label: string): keyof AvatarStats | null {
  const k = label.toLowerCase().trim();
  if (k.includes('triangle') || k.includes('polygon')) return 'triangles';
  if (k.includes('material')) return 'materials';
  if (k.includes('skinned mesh')) return 'skinnedMeshes';
  if (k.includes('mesh')) return 'meshes';
  if (k.includes('dynamic bone')) return 'dynamicBones';
  if (k.includes('physbone') || k.includes('phys bone')) return 'physBones';
  if (k.includes('particle')) return 'particles';
  if (k.includes('audio source')) return 'audioSources';
  if (k.includes('draw call')) return 'drawCalls';
  if (k.includes('bone')) return 'bones';
  if (k.includes('light')) return 'lights';
  if (k.includes('animator')) return 'animators';
  return null;
}

function parseTs(line: string): { body: string; ts: number; timestamped: boolean } {
  let m = line.match(TIMESTAMP_RE);
  if (!m) m = line.match(TIMESTAMP_RE_SIMPLE);
  if (m) {
    const ts = new Date(m[1].replace(/\./g, '-').replace(' ', 'T')).getTime();
    return { body: m[2].trim(), ts: isNaN(ts) ? Date.now() : ts, timestamped: true };
  }
  return { body: line.trim(), ts: Date.now(), timestamped: false };
}

/** Strips the trailing "(usr_…)" VRChat appends to display names. */
function splitPlayerRef(raw: string): { name: string; userId?: string } {
  const m = raw.trim().match(/^(.*?)\s*\((usr_[0-9a-fA-F-]+)\)\s*$/);
  if (m) return { name: m[1].trim(), userId: m[2] };
  return { name: raw.trim() };
}

function isAvatarId(s: string): boolean {
  return /^avtr_[0-9a-fA-F-]{8,}$/.test(s.trim());
}

function normalizeRank(raw: string): PerfRank {
  const k = raw.trim().toLowerCase();
  if (k.startsWith('very')) return 'Very Poor';
  if (k === 'poor') return 'Poor';
  if (k === 'medium') return 'Medium';
  if (k === 'good') return 'Good';
  return 'Excellent';
}

/**
 * Does this log line name `player`? Requires a non-word character on both
 * sides so a short display name can't match inside a URL or an id.
 */
function mentionsPlayer(line: string, player: string): boolean {
  if (player.length < 4) return false;
  const at = line.indexOf(player);
  if (at < 0) return false;
  const before = at === 0 ? ' ' : line[at - 1];
  const after = line[at + player.length] ?? ' ';
  return !/[\w-]/.test(before) && !/[\w-]/.test(after);
}

// ── Performance block state machine ─────────────────────────────────────
//
// A perf block is one timestamped header line followed by a run of
// *untimestamped* continuation lines. We keep the block open while those
// continuation lines arrive and apply what we have after every update, so
// a block split across two tail batches still lands.

interface PendingPerf {
  avatarName: string;
  stats: AvatarStats;
  rank?: PerfRank;
  at: number;
}

let pendingPerf: PendingPerf | null = null;

// ── The store ───────────────────────────────────────────────────────────

const emptyDiagnostics = {
  linesSeen: 0,
  eventsParsed: 0,
  lastEventAt: undefined as number | undefined,
};

export const useInstanceAvatarsStore = create<State>((set, get) => ({
  byPlayer: {},
  instance: {},
  lastResetAt: Date.now(),
  refreshing: false,
  ...emptyDiagnostics,

  setInstanceContext: (ctx) => {
    const prev = get().instance;
    // If we genuinely changed instance, wipe the player map.
    const changed = (ctx.worldId && prev.worldId !== ctx.worldId) ||
                    (ctx.instanceId && prev.instanceId !== ctx.instanceId);
    if (changed) {
      set({ instance: { ...prev, ...ctx }, byPlayer: {}, lastResetAt: Date.now() });
      pendingPerf = null;
    } else {
      set({ instance: { ...prev, ...ctx } });
    }
  },

  resetForInstance: () => {
    set({ byPlayer: {}, lastResetAt: Date.now() });
    pendingPerf = null;
  },

  removePlayer: (playerName) => {
    const map = { ...get().byPlayer };
    delete map[playerName];
    set({ byPlayer: map });
  },

  ingestLines: (lines) => {
    const map = { ...get().byPlayer };
    let instance = get().instance;
    let changed = false;
    let events = 0;
    let lastEventAt = get().lastEventAt;

    /** Merge a finished/updated perf block into whoever is wearing it. */
    const applyPerf = (perf: PendingPerf) => {
      let hit = false;
      for (const k of Object.keys(map)) {
        const p = map[k];
        if (p.avatarName !== perf.avatarName) continue;
        map[k] = {
          ...p,
          rank: perf.rank ?? p.rank,
          stats: { ...(p.stats ?? {}), ...perf.stats },
        };
        hit = true;
        changed = true;
      }
      if (hit) return;

      // No name match (VRChat sometimes logs the perf block before the
      // switch line): attach to the most recent avatar swap that has no
      // stats yet, within a sane window.
      let best: string | null = null;
      let bestAt = 0;
      for (const k of Object.keys(map)) {
        const p = map[k];
        if (p.rank != null || !p.lastAvatarChangeAt) continue;
        if (perf.at - p.lastAvatarChangeAt > 60_000) continue;
        if (p.lastAvatarChangeAt > bestAt) { bestAt = p.lastAvatarChangeAt; best = k; }
      }
      if (best) {
        map[best] = {
          ...map[best],
          avatarName: map[best].avatarName ?? perf.avatarName,
          rank: perf.rank ?? map[best].rank,
          stats: { ...(map[best].stats ?? {}), ...perf.stats },
        };
        changed = true;
      }
    };

    /** Record a player wearing an avatar (by name, id, or both). */
    const setAvatar = (playerName: string, avatar: { id?: string; name?: string }, ts: number) => {
      const name = playerName.trim();
      if (!name) return;
      const existing = map[name];
      // "Same avatar" when the ids match, or the names match, or we're
      // simply learning the id of the avatar we already knew by name —
      // none of those may throw away the perf stats we already parsed.
      const sameAvatar =
        (!!avatar.id && existing?.avatarId === avatar.id) ||
        (!!avatar.name && !!existing?.avatarName && existing.avatarName === avatar.name) ||
        (!!avatar.id && !avatar.name && !!existing && !existing.avatarId);

      map[name] = {
        ...(existing ?? { playerName: name, seenAt: ts }),
        playerName: name,
        avatarId: avatar.id ?? (sameAvatar ? existing?.avatarId : undefined),
        avatarName: avatar.name ?? (sameAvatar ? existing?.avatarName : undefined),
        lastAvatarChangeAt: ts,
        // Anything derived from the previous avatar is stale on a swap.
        vrcdbMatch: sameAvatar ? existing?.vrcdbMatch : undefined,
        vrcdbLooking: sameAvatar ? existing?.vrcdbLooking : false,
        idFromNameSearch: sameAvatar ? existing?.idFromNameSearch : undefined,
        rank: sameAvatar ? existing?.rank : undefined,
        stats: sameAvatar ? existing?.stats : undefined,
      };
      changed = true;
    };

    for (const raw of lines) {
      if (!raw) continue;
      const { body, ts, timestamped } = parseTs(raw);

      // ── Open perf block ──
      // Continuation lines are normally untimestamped, but some builds stamp
      // every line, so we also accept stamped lines that carry no [Tag].
      if (pendingPerf) {
        const rankM = body.match(PERF_RANK_RE);
        if (rankM) {
          pendingPerf.rank = normalizeRank(rankM[1]);
          applyPerf(pendingPerf);
          events++;
          lastEventAt = ts;
          continue;
        }
        if (!timestamped || !body.startsWith('[')) {
          const statM = body.match(PERF_STAT_RE);
          if (statM) {
            const key = statKeyFor(statM[1]);
            const value = parseInt(statM[2].replace(/,/g, ''), 10);
            if (key && !isNaN(value)) {
              pendingPerf.stats[key] = value;
              applyPerf(pendingPerf);
            }
          }
          // Decorative separators ("---- Avatar Performance ----") land here.
          continue;
        }
        // A new tagged line ends the block; fall through and handle it.
        pendingPerf = null;
      }

      // ── World transitions ──
      let m = body.match(JOINING_ROOM_RE);
      if (m) {
        const worldId = m[1];
        const instanceId = m[2];
        if (instance.worldId !== worldId || instance.instanceId !== instanceId) {
          for (const k of Object.keys(map)) delete map[k];
          instance = { worldId, instanceId, worldName: undefined };
          changed = true;
        }
        events++;
        lastEventAt = ts;
        continue;
      }
      m = body.match(ENTERING_ROOM_RE);
      if (m) {
        instance = { ...instance, worldName: m[1].trim() };
        changed = true;
        events++;
        lastEventAt = ts;
        continue;
      }
      if (LEFT_ROOM_RE.test(body)) {
        for (const k of Object.keys(map)) delete map[k];
        changed = true;
        events++;
        lastEventAt = ts;
        continue;
      }

      // ── Player joined ──
      m = body.match(PLAYER_JOINED_RE);
      if (m) {
        const { name, userId } = splitPlayerRef(m[1]);
        if (name) {
          map[name] = { ...(map[name] ?? { playerName: name, seenAt: ts }), playerName: name, userId: userId ?? map[name]?.userId };
          changed = true;
          events++;
          lastEventAt = ts;
        }
        continue;
      }

      // ── Player left ──
      m = body.match(PLAYER_LEFT_RE) ?? body.match(PLAYER_UNREG_RE);
      if (m) {
        const { name } = splitPlayerRef(m[1]);
        if (name && map[name]) {
          delete map[name];
          changed = true;
          events++;
          lastEventAt = ts;
        }
        continue;
      }

      // ── PlayerAPI init (tells us which entry is us) ──
      m = body.match(PLAYER_API_RE);
      if (m) {
        const name = m[1].trim();
        map[name] = {
          ...(map[name] ?? { playerName: name, seenAt: ts }),
          playerName: name,
          isLocal: m[2].toLowerCase() === 'local',
        };
        changed = true;
        events++;
        lastEventAt = ts;
        continue;
      }

      // ── Avatar switch: "Switching <player> to avatar <name-or-id>" ──
      const prefix = SWITCH_PREFIXES.find(p => body.startsWith(p));
      if (prefix) {
        const idx = body.lastIndexOf(SWITCH_INFIX);
        if (idx > prefix.length - 1) {
          let playerPart = body.slice(prefix.length, idx).trim();
          const avatarPart = body.slice(idx + SWITCH_INFIX.length).trim();
          // Some builds write "Switching Nyx (usr_…) to avatar X".
          const { name: playerName } = splitPlayerRef(playerPart);
          const idInLine = avatarPart.match(AVATAR_ID_RE)?.[0];
          if (playerName && avatarPart) {
            setAvatar(
              playerName,
              isAvatarId(avatarPart)
                ? { id: avatarPart }
                : { name: avatarPart.replace(/\s*\(avtr_[0-9a-fA-F-]+\)\s*$/, '').trim(), id: idInLine },
              ts,
            );
            events++;
            lastEventAt = ts;
            continue;
          }
        }
      }

      // ── Id-bearing avatar lines ──
      m = body.match(AVATAR_LOADER_RE);
      if (m) {
        const { name } = splitPlayerRef(m[2]);
        setAvatar(name, { id: m[1] }, ts);
        events++;
        lastEventAt = ts;
        continue;
      }
      m = body.match(AVATAR_INSTANTIATED_RE);
      if (m) {
        const { name } = splitPlayerRef(m[1]);
        setAvatar(name, { id: m[2] }, ts);
        events++;
        lastEventAt = ts;
        continue;
      }

      // ── Performance block header ──
      m = body.match(PERF_BLOCK_START_RE);
      if (m) {
        pendingPerf = { avatarName: m[1].trim(), stats: {}, at: ts };
        events++;
        lastEventAt = ts;
        continue;
      }

      // ── Fallback: a line naming a known player *and* an avatar id ──
      // VRChat's exact wording moves around between builds; this catches
      // the id whatever the surrounding sentence looks like.
      const looseId = body.match(AVATAR_ID_RE)?.[0];
      if (looseId) {
        // Longest name first so "Nyx" doesn't win over "Nyx Prime".
        const names = Object.keys(map).sort((a, b) => b.length - a.length);
        const owner = names.find(n => mentionsPlayer(body, n));
        if (owner && map[owner].avatarId !== looseId) {
          setAvatar(owner, { id: looseId, name: map[owner].avatarName }, ts);
          events++;
          lastEventAt = ts;
        }
      }
    }

    set(s => ({
      byPlayer: changed ? map : s.byPlayer,
      instance,
      linesSeen: s.linesSeen + lines.length,
      eventsParsed: s.eventsParsed + events,
      lastEventAt,
    }));
  },

  /**
   * Resolve a player's avatar against avtrdb — by id when the log gave us
   * one, otherwise by name search. The result carries the thumbnail and,
   * for name matches, the avatar id that makes "Wear" possible.
   */
  lookupOnVrcdb: async (playerName) => {
    const p = get().byPlayer[playerName];
    if (!p) return;
    if (p.vrcdbLooking || p.vrcdbMatch !== undefined) return;
    if (!p.avatarId && !p.avatarName) return;

    const key = p.avatarId ?? `name:${p.avatarName}`;
    if (inFlight.has(key)) return;
    inFlight.add(key);

    const markLooking = (looking: boolean) => {
      const next = { ...get().byPlayer };
      for (const k of Object.keys(next)) {
        if (sameAvatar(next[k], p)) next[k] = { ...next[k], vrcdbLooking: looking };
      }
      set({ byPlayer: next });
    };

    const apply = (match: VRCDBAvatar | null, fromName: boolean) => {
      const next = { ...get().byPlayer };
      for (const k of Object.keys(next)) {
        if (!sameAvatar(next[k], p)) continue;
        next[k] = {
          ...next[k],
          vrcdbMatch: match,
          vrcdbLooking: false,
          avatarId: next[k].avatarId ?? match?.id,
          avatarName: next[k].avatarName ?? match?.name,
          idFromNameSearch: !next[k].avatarId && !!match?.id ? fromName : next[k].idFromNameSearch,
        };
      }
      set({ byPlayer: next });
    };

    const cached = lookupCache.get(key);
    if (cached !== undefined) {
      apply(cached, !p.avatarId);
      inFlight.delete(key);
      return;
    }

    markLooking(true);
    try {
      let match: VRCDBAvatar | null = null;
      if (p.avatarId) {
        const results = await vrcdb.getById(p.avatarId);
        // Exact id only. The old `?? results[0]` fallback meant that whenever
        // the provider answered with something unrelated we showed a
        // stranger's avatar picture next to the right avatar name. No
        // thumbnail beats the wrong thumbnail.
        match = results.find(r => r.id === p.avatarId) ?? null;
      } else if (p.avatarName) {
        const results = await vrcdb.search(p.avatarName, 25);
        const wanted = p.avatarName.toLowerCase();
        match = results.find(r => r.name?.toLowerCase() === wanted) ?? null;
      }
      lookupCache.set(key, match);
      apply(match, !p.avatarId);
    } catch {
      // Network/provider failure — record "no match" so we don't hammer it,
      // but leave it out of the cache so a refresh can retry.
      apply(null, !p.avatarId);
    } finally {
      inFlight.delete(key);
    }
  },

  /**
   * Re-read VRChat's log from disk and rebuild the player list. Also
   * re-attaches the tail, so this recovers from "VRChat was started after
   * VRC Studio" and from a log rotation we somehow missed.
   */
  refreshFromLog: async () => {
    if (get().refreshing) return { ok: false, players: 0, lines: 0, error: 'Already refreshing' };
    set({ refreshing: true, logError: undefined });

    const api = window.electronAPI;
    if (!api?.logReadBacklog) {
      set({ refreshing: false, logError: 'Log access is only available in the desktop app' });
      return { ok: false, players: 0, lines: 0, error: 'Log access is only available in the desktop app' };
    }

    try {
      // Re-attach the tail first so we don't miss lines written while we read.
      const started = await api.logStartTailing?.();
      const backlog = await api.logReadBacklog(12_000);

      if (!backlog?.success || !backlog.lines) {
        const error = backlog?.error ?? started?.error ?? 'Could not read VRChat log';
        set({ refreshing: false, logError: error });
        return { ok: false, players: 0, lines: 0, error };
      }

      // Rebuild from scratch: replaying the tail of the log re-derives the
      // whole instance, so stale players can't linger.
      pendingPerf = null;
      set({ byPlayer: {}, lastResetAt: Date.now(), ...emptyDiagnostics });

      // Only replay from the most recent room join — everything before it
      // belongs to an instance we already left.
      const lines = sliceToCurrentInstance(backlog.lines);
      get().ingestLines(lines);

      set({
        refreshing: false,
        logPath: backlog.path ?? started?.path,
        logError: undefined,
      });

      // Re-resolve avatars for whoever we found.
      for (const name of Object.keys(get().byPlayer)) {
        void get().lookupOnVrcdb(name);
      }

      return { ok: true, players: Object.keys(get().byPlayer).length, lines: lines.length };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      set({ refreshing: false, logError: error });
      return { ok: false, players: 0, lines: 0, error };
    }
  },
}));

// Two players count as wearing "the same avatar" when the ids match, or —
// when no id is known — when the avatar names match.
function sameAvatar(a: PlayerAvatar, b: PlayerAvatar): boolean {
  if (a.avatarId && b.avatarId) return a.avatarId === b.avatarId;
  if (!a.avatarId && !b.avatarId) return !!a.avatarName && a.avatarName === b.avatarName;
  return false;
}

/** avatarId | `name:<avatarName>` → avtrdb result (null = no match). */
const lookupCache = new Map<string, VRCDBAvatar | null>();
const inFlight = new Set<string>();

/**
 * Trim a backlog down to the lines belonging to the instance the user is in
 * right now, i.e. everything after the last "Joining wrld_…". Falls back to
 * the whole slice when no join line is present (VRChat already running long
 * before the window we read).
 */
export function sliceToCurrentInstance(lines: string[]): string[] {
  for (let i = lines.length - 1; i >= 0; i--) {
    if (JOINING_ROOM_RE.test(lines[i])) return lines.slice(i);
  }
  return lines;
}
