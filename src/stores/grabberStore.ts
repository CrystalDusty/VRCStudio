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
import api from '../api/vrchat';
import { useAuthStore } from './authStore';

export type GrabKind = 'portal' | 'print' | 'sticker' | 'emoji' | 'item' | 'image';

/** What the bytes turned out to be. `unknown` means we couldn't tell. */
export type MediaFormat = 'gif' | 'png' | 'apng' | 'webp' | 'jpeg' | 'avif' | 'bmp' | 'svg' | 'unknown';

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
  /** VRChat's own item type for inventory items — droneskin, warpeffect, … */
  itemType?: string;

  // ── What the file actually is ──
  //
  // VRChat serves everything from /api/1/file/<id>/1/file: no extension, and
  // often a content-type of application/octet-stream. So the only way to know
  // an animated emoji from a still one is to read the header bytes, which the
  // main process does on demand and we cache here.
  /** True only when the container proves more than one frame. */
  animated?: boolean;
  mediaFormat?: MediaFormat;
  frameCount?: number;
  imageWidth?: number;
  imageHeight?: number;
  /** Extension to save the untouched bytes under. */
  mediaExtension?: string;
  /** When we last looked; also set on failure so we don't retry in a loop. */
  inspectedAt?: number;
  inspectError?: string;

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

  /** Result of the last "Sync from VRChat" run. */
  syncing: boolean;
  lastSyncAt?: number;
  syncError?: string;
  syncSummary?: { inventory: number; prints: number; reclassified: number };

  setContext: (ctx: Ctx) => void;
  syncFromVRChat: () => Promise<void>;
  /**
   * Read the header bytes of anything not yet identified, so the grid can
   * badge animations and the export modal can offer the untouched file.
   * Safe to call repeatedly — already-inspected ids are skipped.
   */
  inspectMedia: (ids: string[]) => Promise<void>;
  ingestLines: (lines: string[]) => void;
  addItems: (items: GrabbedItem[]) => void;
  markResolved: (id: string, patch: Partial<GrabbedItem>) => void;
  setHidden: (id: string, hidden: boolean) => void;
  remove: (id: string) => void;
  clear: () => void;
}

const STORAGE_KEY = 'vrcstudio_grabber';
const MAX_ITEMS = 2000;
/** Ids currently being sniffed, so overlapping calls don't double-fetch. */
const inFlight = new Set<string>();

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

/**
 * VRChat's inventory itemType → our tab.
 *
 * The list grows (props, drone skins, portal skins, warp effects, and the
 * profile banners and effects added since) and every addition would otherwise
 * silently land in "Images". Anything unrecognised becomes an Item, which
 * keeps it findable, and the raw itemType is stored alongside so the modal can
 * still name it exactly.
 */
function kindFromItemType(itemType?: string, label?: string): GrabKind {
  const t = (itemType ?? '').toLowerCase();
  if (t === 'sticker') return 'sticker';
  if (t === 'emoji') return 'emoji';
  if (t === 'print' || t === 'photo') return 'print';
  if (t) return 'item';
  // No itemType at all — fall back to whatever the label says it is.
  const l = (label ?? '').toLowerCase();
  if (l.includes('sticker')) return 'sticker';
  if (l.includes('emoji')) return 'emoji';
  if (l.includes('print')) return 'print';
  return l ? 'item' : 'image';
}

function classify(line: string, id: string): GrabKind {
  const l = line.toLowerCase();
  if (id.startsWith('print_') || l.includes('print')) return 'print';
  if (id.startsWith('sticker_') || l.includes('sticker')) return 'sticker';
  if (id.startsWith('emoji_') || l.includes('emoji')) return 'emoji';
  return 'image';
}

/** Blanks the sniffed media fields — used when an item's URL changes. */
function clearMediaInfo(_item: GrabbedItem): Partial<GrabbedItem> {
  return {
    animated: undefined, mediaFormat: undefined, frameCount: undefined,
    imageWidth: undefined, imageHeight: undefined, mediaExtension: undefined,
    inspectedAt: undefined, inspectError: undefined,
  };
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
  syncing: false,

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

  /**
   * Pull the authoritative lists from VRChat and merge them in.
   *
   * Log discovery can only ever guess what a file is from the words around
   * it — which is why everything landed in "Images". The inventory endpoint
   * states each item's type outright, and /prints/user gives prints with
   * their world and author. Anything we'd already seen by id gets corrected
   * in place rather than duplicated.
   */
  syncFromVRChat: async () => {
    if (get().syncing) return;
    const userId = useAuthStore.getState().user?.id;
    if (!userId) {
      set({ syncError: 'Not signed in to VRChat.' });
      return;
    }

    set({ syncing: true, syncError: undefined });
    const items = { ...get().items };
    let inventoryCount = 0;
    let printCount = 0;
    let reclassified = 0;
    const problems: string[] = [];

    const mergeItem = (id: string, patch: Partial<GrabbedItem>, kind: GrabKind) => {
      const existing = items[id];
      if (existing) {
        if (existing.kind !== kind) reclassified++;
        // A new URL means the cached "is this animated?" answer describes a
        // file we're no longer pointing at.
        const urlChanged = !!patch.url && patch.url !== existing.url;
        items[id] = {
          ...existing,
          ...(urlChanged ? clearMediaInfo(existing) : null),
          ...patch,
          kind, resolved: true, source: 'api',
        };
      } else {
        items[id] = {
          id, kind, url: '', source: 'api',
          firstSeenAt: Date.now(), lastSeenAt: Date.now(), seenCount: 1,
          resolved: true,
          ...patch,
        } as GrabbedItem;
      }
    };

    // ── Inventory: emoji, stickers, props, skins ──
    try {
      const inv = await api.getInventory({ n: 100 });
      for (const it of inv) {
        if (!it?.id) continue;
        const kind = kindFromItemType(it.itemType, it.itemTypeLabel);
        // Key by the image's file id when there is one, so an item we already
        // spotted in the log is corrected rather than duplicated.
        const fileId = it.imageUrl?.match(/(file_[0-9a-fA-F-]{20,})/)?.[1];
        const id = fileId ?? it.id;
        mergeItem(id, {
          name: it.name,
          url: it.imageUrl ?? '',
          tags: it.tags,
          itemType: it.itemTypeLabel || it.itemType,
          createdAt: it.created_at,
          hidden: it.isArchived ? true : items[id]?.hidden,
        }, kind);
        inventoryCount++;
      }
    } catch (err) {
      problems.push(`inventory: ${err instanceof Error ? err.message : String(err)}`);
    }

    // ── Prints ──
    try {
      const prints = await api.getUserPrints(userId);
      for (const pr of prints) {
        if (!pr?.id) continue;
        const image = pr.files?.image ?? '';
        const fileId = pr.files?.fileId ?? image.match(/(file_[0-9a-fA-F-]{20,})/)?.[1];
        const id = fileId ?? pr.id;
        const at = pr.createdAt || pr.timestamp;
        mergeItem(id, {
          name: pr.note?.trim() || `Print in ${pr.worldName ?? 'VRChat'}`,
          url: image,
          authorId: pr.authorId,
          authorName: pr.authorName,
          worldId: pr.worldId ?? items[id]?.worldId,
          worldName: pr.worldName ?? items[id]?.worldName,
          createdAt: at,
          firstSeenAt: at ? new Date(at).getTime() || Date.now() : (items[id]?.firstSeenAt ?? Date.now()),
        }, 'print');
        printCount++;
      }
    } catch (err) {
      problems.push(`prints: ${err instanceof Error ? err.message : String(err)}`);
    }

    set({
      items,
      syncing: false,
      lastSyncAt: Date.now(),
      // A partial failure is still a useful sync — say what didn't work
      // rather than throwing the whole run away.
      syncError: problems.length ? problems.join(' · ') : undefined,
      syncSummary: { inventory: inventoryCount, prints: printCount, reclassified },
    });
    savePersisted(items);
  },

  inspectMedia: async (ids) => {
    const inspect = window.electronAPI?.inspectImage;
    if (!inspect) return;

    // Only ids we have a URL for and haven't already answered. A failure is
    // remembered too — a 404 doesn't become more true by asking again — but
    // is retried after an hour in case it was the network's fault.
    const now = Date.now();
    const pending = ids.filter(id => {
      const it = get().items[id];
      if (!it?.url || inFlight.has(id)) return false;
      if (!it.inspectedAt) return true;
      return !!it.inspectError && now - it.inspectedAt > 60 * 60 * 1000;
    });
    if (pending.length === 0) return;

    // Three at a time: enough to fill a screen of thumbnails quickly without
    // opening a connection per item in a 2000-item history.
    const queue = [...pending];
    const patches: Record<string, Partial<GrabbedItem>> = {};

    const worker = async () => {
      for (let id = queue.shift(); id; id = queue.shift()) {
        const item = get().items[id];
        if (!item?.url) continue;
        inFlight.add(id);
        try {
          const info = await inspect(item.url);
          patches[id] = info.ok
            ? {
                animated: info.animated,
                mediaFormat: info.format,
                frameCount: info.frameCount,
                imageWidth: info.width,
                imageHeight: info.height,
                mediaExtension: info.extension,
                inspectedAt: Date.now(),
                inspectError: undefined,
              }
            : { inspectedAt: Date.now(), inspectError: info.error ?? `HTTP ${info.status}` };
        } catch (err) {
          patches[id] = {
            inspectedAt: Date.now(),
            inspectError: err instanceof Error ? err.message : String(err),
          };
        } finally {
          inFlight.delete(id);
        }
      }
    };

    await Promise.all([worker(), worker(), worker()]);

    const items = { ...get().items };
    let changed = false;
    for (const [id, patch] of Object.entries(patches)) {
      if (!items[id]) continue;
      items[id] = { ...items[id], ...patch };
      changed = true;
    }
    if (!changed) return;
    set({ items });
    savePersisted(items);
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
