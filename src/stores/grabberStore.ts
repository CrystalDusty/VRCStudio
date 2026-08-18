// Everything VRChat lets slip in its log that's worth keeping: prints,
// stickers, emoji, other images — and portals, which are the one kind you can
// act on afterwards. Same idea as the video-player history: discovery is
// passive, we just watch the log and remember what turns up.
//
// Portals matter because a dropped portal closes after about a minute, but
// the destination it pointed at doesn't go anywhere. Once we've captured
// `worldId:instanceId` (with its ~region/~group tail intact) you can invite
// yourself back to that exact instance long after the portal is gone.
//
// Detection is deliberately loose. VRChat renames its log lines constantly
// (that's what broke Live Avatars), so instead of matching whole sentences we
// scan every line for the identifiers themselves — file_/print_/sticker_/
// emoji_ ids and api.vrchat.cloud file URLs — and classify from whatever
// words happen to surround them. A wording change costs us the *category*,
// never the item.

import { create } from 'zustand';

export type GrabKind = 'portal' | 'print' | 'sticker' | 'emoji' | 'image';

export interface GrabbedItem {
  /** file_… / print_… id — the stable identity. */
  id: string;
  kind: GrabKind;
  /** Full-size image URL. */
  url: string;
  /** Version number from the file URL, when it had one. */
  version?: number;
  /** Enriched from VRChat's API when available. */
  name?: string;
  authorId?: string;
  authorName?: string;
  tags?: string[];
  createdAt?: string;
  /** How we came by it. */
  source: 'log' | 'api';
  firstSeenAt: number;
  lastSeenAt: number;
  seenCount: number;
  worldId?: string;
  worldName?: string;
  instanceId?: string;
  /** Set once we've asked the API about it (successfully or not). */
  resolved?: boolean;
  hidden?: boolean;

  // ── Portals only ──
  /** Destination world of a dropped portal. */
  targetWorldId?: string;
  /** Short instance id, e.g. 47110. */
  targetInstanceId?: string;
  /**
   * Instance id WITH its tags (`47110~group(grp_x)~region(use)`). Private and
   * group instances can't be re-entered without these, so we keep the whole
   * thing for the self-invite.
   */
  targetInstanceTail?: string;
  targetWorldName?: string;
  targetWorldImage?: string;
  /** public / friends / group / private, parsed from the tags. */
  targetInstanceType?: string;
  /** Who dropped it, when VRChat named them on the line. */
  droppedBy?: string;
}

interface Ctx { worldId?: string; worldName?: string; instanceId?: string }

interface State {
  items: Record<string, GrabbedItem>;
  ctx: Ctx;
  /** Bumped whenever ingest finds something new — cheap "you have new items" signal. */
  discoveredCount: number;
  lastDiscoveryAt?: number;

  setContext: (ctx: Ctx) => void;
  ingestLines: (lines: string[]) => void;
  addItems: (items: GrabbedItem[]) => void;
  markResolved: (id: string, patch: Partial<GrabbedItem>) => void;
  setHidden: (id: string, hidden: boolean) => void;
  remove: (id: string) => void;
  clear: () => void;
}

const STORAGE_KEY = 'vrcstudio_grabber';
const MAX_ITEMS = 2000;

// ── Patterns ────────────────────────────────────────────────────────────

// https://api.vrchat.cloud/api/1/file/file_<uuid>/<version>/file
const FILE_URL_RE = /https?:\/\/[^\s"'<>]*\/api\/1\/(?:file|image)\/(file_[0-9a-fA-F-]{20,})\/(\d+)(?:\/[^\s"'<>]*)?/g;
// Bare ids, wherever they appear.
const BARE_ID_RE = /\b((?:file|print|sticker|emoji)_[0-9a-fA-F-]{20,})\b/g;
// Any other image URL VRChat mentions (world/user content on its CDN).
const IMAGE_URL_RE = /https?:\/\/[^\s"'<>]+\.(?:png|jpe?g|webp|gif)(?:\?[^\s"'<>]*)?/gi;

// A world reference with its instance and any tags:
//   wrld_xxx:47110~group(grp_y)~groupAccessType(public)~region(use)
// Same trick as everywhere else — match the identifier, not the sentence
// around it, because VRChat rewords portal lines between builds.
const WORLD_REF_RE = /(wrld_[0-9a-fA-F-]{20,}):([0-9]+((?:~[a-zA-Z]+\([^)]*\))*))/g;
// The lines a portal reference can plausibly appear on.
const PORTAL_HINT_RE = /portal/i;
// "…dropped by NAME" / "…by NAME" tails VRChat has used over the years.
const DROPPED_BY_RE = /(?:dropped |created |placed |requested )?by\s+(.+?)\s*$/i;

function instanceTypeFromTags(tail: string): string {
  if (tail.includes('~private(')) return 'private';
  if (tail.includes('~friends(')) return 'friends';
  if (tail.includes('~hidden(')) return 'friends+';
  if (tail.includes('~group(')) return 'group';
  return 'public';
}

function classify(line: string, id: string): GrabKind {
  const l = line.toLowerCase();
  if (id.startsWith('print_') || l.includes('print')) return 'print';
  if (id.startsWith('sticker_') || l.includes('sticker')) return 'sticker';
  if (id.startsWith('emoji_') || l.includes('emoji')) return 'emoji';
  return 'image';
}

function fileUrlFor(id: string, version = 1): string {
  if (id.startsWith('file_')) {
    return `https://api.vrchat.cloud/api/1/file/${id}/${version}/file`;
  }
  // print_/sticker_/emoji_ ids aren't file ids — the API resolves them, and
  // until it does we keep the id and show a placeholder.
  return '';
}

// ── Persistence ─────────────────────────────────────────────────────────

function loadPersisted(): Record<string, GrabbedItem> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && parsed.items ? parsed.items : {};
  } catch {
    return {};
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function savePersisted(items: Record<string, GrabbedItem>) {
  if (saveTimer) clearTimeout(saveTimer);
  // Ingest can fire many times a second while a busy instance loads; batch.
  saveTimer = setTimeout(() => {
    try {
      let toStore = items;
      const keys = Object.keys(items);
      if (keys.length > MAX_ITEMS) {
        // Keep the most recently seen.
        const sorted = keys.sort((a, b) => items[b].lastSeenAt - items[a].lastSeenAt).slice(0, MAX_ITEMS);
        toStore = Object.fromEntries(sorted.map(k => [k, items[k]]));
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ items: toStore }));
    } catch {
      // Quota exceeded — drop the oldest half and try once more.
      try {
        const keys = Object.keys(items).sort((a, b) => items[b].lastSeenAt - items[a].lastSeenAt);
        const half = Object.fromEntries(keys.slice(0, Math.floor(keys.length / 2)).map(k => [k, items[k]]));
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ items: half }));
      } catch {}
    }
  }, 1200);
}

// ── Store ───────────────────────────────────────────────────────────────

export const useGrabberStore = create<State>((set, get) => ({
  items: loadPersisted(),
  ctx: {},
  discoveredCount: 0,

  setContext: (ctx) => set({ ctx: { ...get().ctx, ...ctx } }),

  ingestLines: (lines) => {
    const items = { ...get().items };
    const { ctx } = get();
    let added = 0;
    let touched = false;
    const now = Date.now();

    // One log line often carries the same id twice — once inside a URL and
    // once bare — and that must count as a single sighting, not two.
    let seenThisLine = new Set<string>();

    const record = (id: string, url: string, kind: GrabKind, version?: number) => {
      if (seenThisLine.has(id)) return;
      seenThisLine.add(id);
      const existing = items[id];
      if (existing) {
        items[id] = {
          ...existing,
          lastSeenAt: now,
          seenCount: existing.seenCount + 1,
          // Fill in anything we didn't have the first time.
          url: existing.url || url,
          kind: existing.kind === 'image' && kind !== 'image' ? kind : existing.kind,
        };
        touched = true;
        return;
      }
      items[id] = {
        id, kind, url, version,
        source: 'log',
        firstSeenAt: now,
        lastSeenAt: now,
        seenCount: 1,
        worldId: ctx.worldId,
        worldName: ctx.worldName,
        instanceId: ctx.instanceId,
      };
      added++;
      touched = true;
    };

    for (const line of lines) {
      if (!line) continue;
      // Cheap pre-filter: the vast majority of log lines mention none of this.
      const hasPortal = line.includes('wrld_') && PORTAL_HINT_RE.test(line);
      if (!hasPortal &&
          !line.includes('file_') && !line.includes('print_') &&
          !line.includes('sticker_') && !line.includes('emoji_') &&
          !/\.(png|jpe?g|webp|gif)/i.test(line)) continue;

      seenThisLine = new Set<string>();
      let m: RegExpExecArray | null;

      // ── Portals ──
      // Only lines that actually mention a portal, so ordinary "Joining
      // wrld_…" room transitions don't get logged as portals.
      if (PORTAL_HINT_RE.test(line)) {
        WORLD_REF_RE.lastIndex = 0;
        while ((m = WORLD_REF_RE.exec(line)) !== null) {
          const worldId = m[1];
          const tail = m[2];                    // 47110~region(use)
          const shortId = tail.split('~')[0];   // 47110
          // A portal into the instance we're already standing in is noise.
          if (worldId === ctx.worldId && shortId === ctx.instanceId) continue;

          const id = `portal_${worldId}:${tail}`;
          const byMatch = line.match(DROPPED_BY_RE);
          const droppedBy = byMatch?.[1]?.trim().replace(/[.\s]+$/, '') || undefined;

          const existing = items[id];
          if (existing) {
            items[id] = { ...existing, lastSeenAt: now, seenCount: existing.seenCount + 1 };
          } else {
            items[id] = {
              id, kind: 'portal', url: '',
              source: 'log',
              firstSeenAt: now, lastSeenAt: now, seenCount: 1,
              worldId: ctx.worldId, worldName: ctx.worldName, instanceId: ctx.instanceId,
              targetWorldId: worldId,
              targetInstanceId: shortId,
              targetInstanceTail: tail,
              targetInstanceType: instanceTypeFromTags(tail),
              droppedBy: droppedBy && droppedBy.length < 60 ? droppedBy : undefined,
            };
            added++;
          }
          touched = true;
          seenThisLine.add(id);
        }
      }

      FILE_URL_RE.lastIndex = 0;
      while ((m = FILE_URL_RE.exec(line)) !== null) {
        const id = m[1];
        const version = parseInt(m[2], 10);
        record(id, fileUrlFor(id, version), classify(line, id), version);
      }

      BARE_ID_RE.lastIndex = 0;
      while ((m = BARE_ID_RE.exec(line)) !== null) {
        const id = m[1];
        if (items[id]) { record(id, items[id].url, items[id].kind); continue; }
        record(id, fileUrlFor(id), classify(line, id));
      }

      // Direct image URLs (world posters, gallery images) keyed by URL.
      IMAGE_URL_RE.lastIndex = 0;
      while ((m = IMAGE_URL_RE.exec(line)) !== null) {
        const url = m[0];
        if (url.includes('/api/1/file/') || url.includes('/api/1/image/')) continue; // already handled
        record(url, url, classify(line, url));
      }
    }

    if (touched) {
      set(s => ({
        items,
        discoveredCount: s.discoveredCount + added,
        lastDiscoveryAt: added > 0 ? now : s.lastDiscoveryAt,
      }));
      savePersisted(items);
    }
  },

  addItems: (incoming) => {
    const items = { ...get().items };
    let added = 0;
    for (const it of incoming) {
      const existing = items[it.id];
      items[it.id] = existing
        ? { ...existing, ...it, firstSeenAt: existing.firstSeenAt, seenCount: existing.seenCount }
        : it;
      if (!existing) added++;
    }
    set(s => ({ items, discoveredCount: s.discoveredCount + added, lastDiscoveryAt: Date.now() }));
    savePersisted(items);
  },

  markResolved: (id, patch) => {
    const items = { ...get().items };
    if (!items[id]) return;
    items[id] = { ...items[id], ...patch, resolved: true };
    set({ items });
    savePersisted(items);
  },

  setHidden: (id, hidden) => {
    const items = { ...get().items };
    if (!items[id]) return;
    items[id] = { ...items[id], hidden };
    set({ items });
    savePersisted(items);
  },

  remove: (id) => {
    const items = { ...get().items };
    delete items[id];
    set({ items });
    savePersisted(items);
  },

  clear: () => {
    set({ items: {}, discoveredCount: 0 });
    savePersisted({});
  },
}));
