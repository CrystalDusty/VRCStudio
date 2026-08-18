// Instance Grabber — everything worth taking out of the instance you're in.
//
// One page, one sub-menu. Each tab is a different kind of thing VRChat leaks
// into its log as you play:
//
//   People    who's here, searchable by status/bio, with per-person actions
//   Portals   where dropped portals went — joinable after they close
//   Prints    photo prints spawned nearby
//   Stickers  stickers placed in the world
//   Emoji     emoji thrown around
//   Images    everything else that came through as a picture
//
// Media tabs share the thumbnail grid and the export modal; People and
// Portals bring their own panels because they aren't pictures.

import { useEffect, useMemo, useState } from 'react';
import {
  Grab, Search, Sticker, Smile, Printer, Image as ImageIcon, Compass, Users,
  Trash2, EyeOff, Eye, Info, LayoutGrid, RefreshCw, Check, AlertCircle, Package,
} from 'lucide-react';
import { useGrabberStore, type GrabbedItem, type GrabKind } from '../stores/grabberStore';
import { useInstanceAvatarsStore } from '../stores/instanceAvatarsStore';
import { useVideoPlayerStore } from '../stores/videoPlayerStore';
import GrabbedItemModal from '../components/GrabbedItemModal';
import PortalsPanel from '../components/PortalsPanel';
import InstancePeoplePanel from '../components/InstancePeoplePanel';

type TabKey = 'people' | 'portal' | 'print' | 'sticker' | 'emoji' | 'item' | 'image' | 'all';
type SortMode = 'recent' | 'oldest' | 'seen';

const MEDIA_KINDS: GrabKind[] = ['print', 'sticker', 'emoji', 'item', 'image'];

const TAB_META: Record<Exclude<TabKey, 'all'>, { label: string; icon: typeof Sticker }> = {
  people:  { label: 'People',   icon: Users },
  portal:  { label: 'Portals',  icon: Compass },
  print:   { label: 'Prints',   icon: Printer },
  sticker: { label: 'Stickers', icon: Sticker },
  emoji:   { label: 'Emoji',    icon: Smile },
  // Props, drone and portal skins, warp effects, profile banners and effects —
  // everything else the inventory hands back, under one tab rather than six.
  item:    { label: 'Items',    icon: Package },
  image:   { label: 'Images',   icon: ImageIcon },
};

const KIND_BADGE: Record<GrabKind, string> = {
  portal:  'text-amber-300 bg-amber-500/15 border-amber-500/30',
  print:   'text-sky-300 bg-sky-500/15 border-sky-500/30',
  sticker: 'text-pink-300 bg-pink-500/15 border-pink-500/30',
  emoji:   'text-amber-300 bg-amber-500/15 border-amber-500/30',
  item:    'text-violet-300 bg-violet-500/15 border-violet-500/30',
  image:   'text-surface-300 bg-surface-700/40 border-surface-600/40',
};

export default function InstanceGrabberPage() {
  const items = useGrabberStore(s => s.items);
  const setHidden = useGrabberStore(s => s.setHidden);
  const remove = useGrabberStore(s => s.remove);
  const clear = useGrabberStore(s => s.clear);
  const playerCount = useInstanceAvatarsStore(s => Object.keys(s.byPlayer).length);
  const syncFromVRChat = useGrabberStore(s => s.syncFromVRChat);
  const syncing = useGrabberStore(s => s.syncing);
  const lastSyncAt = useGrabberStore(s => s.lastSyncAt);
  const syncError = useGrabberStore(s => s.syncError);
  const syncSummary = useGrabberStore(s => s.syncSummary);
  const inspectMedia = useGrabberStore(s => s.inspectMedia);
  const tailingActive = useVideoPlayerStore(s => s.tailingActive);

  const [tab, setTab] = useState<TabKey>('people');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortMode>('recent');
  const [showHidden, setShowHidden] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [showAbout, setShowAbout] = useState(false);

  const all = useMemo(() => Object.values(items), [items]);

  const counts = useMemo(() => {
    const c: Record<GrabKind, number> = { portal: 0, print: 0, sticker: 0, emoji: 0, item: 0, image: 0 };
    for (const it of all) if (!it.hidden) c[it.kind]++;
    return c;
  }, [all]);

  const hiddenCount = useMemo(() => all.filter(i => i.hidden).length, [all]);
  const portals = useMemo(() => all.filter(i => i.kind === 'portal' && !i.hidden), [all]);

  // The grid only ever shows media kinds — People and Portals have their own
  // panels, and a portal has no thumbnail to show.
  const gridItems = useMemo(() => {
    let list = all.filter(i => MEDIA_KINDS.includes(i.kind) && (showHidden ? true : !i.hidden));
    if (tab !== 'all' && tab !== 'people' && tab !== 'portal') {
      list = list.filter(i => i.kind === tab);
    }

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(i =>
        i.name?.toLowerCase().includes(q) ||
        i.authorName?.toLowerCase().includes(q) ||
        i.worldName?.toLowerCase().includes(q) ||
        i.id.toLowerCase().includes(q) ||
        i.itemType?.toLowerCase().includes(q) ||
        i.mediaFormat?.includes(q) ||
        // "gif" and "animated" both find the moving ones, whatever container
        // they actually came in.
        ((i.animated || i.spriteAnimated) && ('animated'.includes(q) || 'gif'.includes(q))) ||
        i.animationStyle?.toLowerCase().includes(q) ||
        i.kind.includes(q),
      );
    }

    switch (sort) {
      case 'oldest': return [...list].sort((a, b) => a.firstSeenAt - b.firstSeenAt);
      case 'seen':   return [...list].sort((a, b) => b.seenCount - a.seenCount);
      default:       return [...list].sort((a, b) => b.lastSeenAt - a.lastSeenAt);
    }
  }, [all, tab, search, sort, showHidden]);

  // Read the header bytes of whatever is on screen, so animations get badged
  // without anyone having to click them. inspectMedia skips ids it already has
  // an answer for, so this settles after a pass or two rather than looping.
  useEffect(() => {
    const ids = gridItems.filter(i => i.url && !i.inspectedAt).slice(0, 60).map(i => i.id);
    if (ids.length > 0) inspectMedia(ids);
  }, [gridItems, inspectMedia]);

  const selectedIndex = selectedId ? gridItems.findIndex(i => i.id === selectedId) : -1;
  const selected = selectedIndex >= 0 ? gridItems[selectedIndex] : undefined;

  useEffect(() => {
    if (selectedId && selectedIndex === -1) setSelectedId(null);
  }, [selectedId, selectedIndex]);

  const mediaTotal = all.filter(i => MEDIA_KINDS.includes(i.kind) && !i.hidden).length;
  const isGridTab = tab === 'all' || MEDIA_KINDS.includes(tab as GrabKind);

  return (
    <div className="max-w-6xl mx-auto space-y-4 animate-fade-in">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Grab size={22} className="text-accent-400" />
            Instance Grabber
          </h1>
          <p className="text-sm text-surface-400 mt-0.5">
            Everything worth taking out of the instance you're in — people, portals, and the
            art that passes through
          </p>
        </div>
        <div className="flex items-center gap-2">
          {tailingActive ? (
            <span className="flex items-center gap-1 text-[11px] text-green-400 uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" /> Watching
            </span>
          ) : (
            <span className="text-[11px] text-amber-400">Log not connected</span>
          )}
          <button
            onClick={() => setShowAbout(v => !v)}
            className={`p-1.5 rounded transition-colors ${showAbout ? 'text-accent-400 bg-accent-500/10' : 'text-surface-500 hover:text-surface-200 hover:bg-surface-800'}`}
            title="Where this comes from"
          >
            <Info size={13} />
          </button>
          <button
            onClick={() => void syncFromVRChat()}
            disabled={syncing}
            className="text-xs px-2.5 py-1.5 rounded-lg font-medium bg-accent-600/20 text-accent-300 hover:bg-accent-600/30 disabled:opacity-50 transition-colors flex items-center gap-1.5"
            title="Pull your emoji, stickers and prints from VRChat — this is what gives them their real categories"
          >
            <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Syncing…' : 'Sync from VRChat'}
          </button>
        </div>
      </div>

      {(syncSummary || syncError) && (
        <div className="glass-panel-solid p-2.5 text-[11px] flex items-start gap-2 flex-wrap">
          {syncSummary && (
            <span className="text-surface-300 inline-flex items-center gap-1.5">
              <Check size={12} className="text-green-400" />
              Synced {syncSummary.inventory} inventory item{syncSummary.inventory === 1 ? '' : 's'} and{' '}
              {syncSummary.prints} print{syncSummary.prints === 1 ? '' : 's'}
              {syncSummary.reclassified > 0 && (
                <span className="text-accent-300">
                  · {syncSummary.reclassified} recategorised from the log's guess
                </span>
              )}
            </span>
          )}
          {syncError && (
            <span className="text-amber-400 inline-flex items-start gap-1.5">
              <AlertCircle size={12} className="mt-0.5 flex-shrink-0" /> {syncError}
            </span>
          )}
          {lastSyncAt && (
            <span className="text-surface-600 ml-auto">{new Date(lastSyncAt).toLocaleTimeString()}</span>
          )}
        </div>
      )}

      {showAbout && (
        <div className="glass-panel-solid p-3 text-[11px] text-surface-400 space-y-1.5">
          <p>
            Everything here is read passively out of VRChat's log as you play — the people
            around you, portals dropped near you, and any print, sticker or emoji that gets
            spawned. Nothing appears retroactively for sessions before this feature existed.
          </p>
          <p>
            Portals are the one thing you can act on later: the instance behind a portal
            outlives the portal itself, so a logged one stays joinable long after it closes.
          </p>
          <p>
            <span className="text-surface-300">Sync from VRChat</span> is the other half: the log
            can only guess what a file is from the words around it, which is why things pile up
            under "Images". Your inventory and prints state their own types, so a sync gives
            everything its real category and fills in names, authors and worlds. Props, skins,
            warp effects, profile banners and effects all land under "Items".
          </p>
          <p>
            Each file's first few kilobytes are read to work out what it actually is, because
            VRChat serves everything from one extension-less URL. Anything that moves is badged
            in the grid — <span className="text-emerald-300">GIF</span> for a real animated file,
            a frame count like <span className="text-emerald-300">16f</span> for an emoji.
          </p>
          <p>
            Animated emoji aren't animated files: VRChat stores them as a single PNG holding a
            grid of frames, plus a frame count and rate on the file record. Downloading that
            gives you the contact sheet, so opening one rebuilds the frames and offers them back
            as an animated GIF or a video — with the sprite sheet and a single still frame still
            available if that's what you wanted.
          </p>
        </div>
      )}

      {/* ── Sub-menu ── */}
      <div className="glass-panel-solid p-2 flex items-center gap-1 flex-wrap">
        <TabButton
          active={tab === 'people'}
          onClick={() => setTab('people')}
          icon={Users}
          label="People"
          count={playerCount}
        />
        <TabButton
          active={tab === 'portal'}
          onClick={() => setTab('portal')}
          icon={Compass}
          label="Portals"
          count={counts.portal}
        />
        <span className="w-px h-6 bg-surface-700 mx-1" />
        <TabButton
          active={tab === 'all'}
          onClick={() => setTab('all')}
          icon={LayoutGrid}
          label="All media"
          count={mediaTotal}
        />
        {MEDIA_KINDS.map(k => (
          <TabButton
            key={k}
            active={tab === k}
            onClick={() => setTab(k)}
            icon={TAB_META[k].icon}
            label={TAB_META[k].label}
            count={counts[k]}
          />
        ))}
      </div>

      {/* ── Panels ── */}
      {tab === 'people' ? (
        <InstancePeoplePanel />
      ) : tab === 'portal' ? (
        <PortalsPanel portals={portals} />
      ) : (
        <>
          {/* Media filters */}
          <div className="glass-panel-solid p-3 flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[180px]">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-500" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search names, authors, worlds or IDs…"
                className="w-full bg-surface-800 text-sm pl-8 pr-3 py-1.5 rounded-lg border border-surface-700/40 focus:outline-none focus:border-accent-500/50 placeholder-surface-600"
              />
            </div>

            <div className="flex gap-1">
              {(['recent', 'oldest', 'seen'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setSort(m)}
                  className={`px-2.5 py-1 text-xs rounded font-medium capitalize transition-colors ${
                    sort === m ? 'bg-accent-500/20 text-accent-300' : 'text-surface-500 hover:text-surface-300'
                  }`}
                >
                  {m === 'seen' ? 'most seen' : m}
                </button>
              ))}
            </div>

            {hiddenCount > 0 && (
              <button
                onClick={() => setShowHidden(v => !v)}
                className={`text-xs px-2 py-1 rounded flex items-center gap-1.5 transition-colors ${
                  showHidden ? 'bg-accent-500/20 text-accent-300' : 'text-surface-500 hover:text-surface-300'
                }`}
              >
                {showHidden ? <Eye size={12} /> : <EyeOff size={12} />} {hiddenCount} hidden
              </button>
            )}

            {all.length > 0 && (
              confirmClear ? (
                <span className="flex items-center gap-1.5 text-xs">
                  <button onClick={() => { clear(); setConfirmClear(false); }} className="text-rose-400 hover:text-rose-300">
                    Forget all {all.length}?
                  </button>
                  <button onClick={() => setConfirmClear(false)} className="text-surface-500 hover:text-surface-300">
                    Cancel
                  </button>
                </span>
              ) : (
                <button
                  onClick={() => setConfirmClear(true)}
                  className="text-xs text-surface-500 hover:text-rose-400 flex items-center gap-1.5"
                >
                  <Trash2 size={12} /> Clear
                </button>
              )
            )}
          </div>

          {gridItems.length === 0 ? (
            <div className="glass-panel-solid p-10 text-center text-sm text-surface-400">
              <ImageIcon size={30} className="mx-auto mb-2 opacity-30" />
              {mediaTotal === 0 ? (
                <>
                  <p>Nothing collected yet.</p>
                  <p className="text-xs text-surface-500 mt-1">
                    {tailingActive
                      ? 'Prints, stickers and emoji appear here as you come across them in game.'
                      : "VRChat's log isn't connected, so nothing can be discovered yet."}
                  </p>
                </>
              ) : (
                <>
                  <p>Nothing in {tab === 'all' ? 'this view' : TAB_META[tab as GrabKind].label.toLowerCase()} matches.</p>
                  <button
                    onClick={() => { setSearch(''); setTab('all'); }}
                    className="text-xs text-accent-400 hover:text-accent-300 mt-2"
                  >
                    Clear filters
                  </button>
                </>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7 gap-2">
                {gridItems.map(item => (
                  <Thumbnail key={item.id} item={item} onOpen={() => setSelectedId(item.id)} />
                ))}
              </div>
              <p className="text-[10px] text-surface-600 text-center">
                {gridItems.length} of {mediaTotal} · click any thumbnail to enlarge, adjust
                borders and download
              </p>
            </>
          )}
        </>
      )}

      {selected && isGridTab && (
        <GrabbedItemModal
          item={selected}
          onClose={() => setSelectedId(null)}
          onHide={id => setHidden(id, true)}
          onDelete={remove}
          onNavigate={delta => {
            const next = gridItems[selectedIndex + delta];
            if (next) setSelectedId(next.id);
          }}
        />
      )}
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, label, count }: {
  active: boolean;
  onClick: () => void;
  icon: typeof Users;
  label: string;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
        active
          ? 'bg-accent-500/20 text-accent-300'
          : 'text-surface-400 hover:text-surface-200 hover:bg-surface-800/60'
      }`}
    >
      <Icon size={13} />
      {label}
      <span className={`text-[10px] tabular-nums ${active ? 'text-accent-400/80' : 'text-surface-600'}`}>
        {count}
      </span>
    </button>
  );
}

function Thumbnail({ item, onOpen }: { item: GrabbedItem; onOpen: () => void }) {
  const [failed, setFailed] = useState(false);
  const Icon = TAB_META[item.kind as Exclude<TabKey, 'all' | 'people'>]?.icon ?? ImageIcon;

  return (
    <button
      onClick={onOpen}
      className={`group relative aspect-square rounded-lg overflow-hidden bg-surface-850 border transition-colors ${
        item.hidden ? 'border-surface-800 opacity-45' : 'border-surface-800 hover:border-accent-500/50'
      }`}
      title={item.name ?? `${item.kind} · seen ${item.seenCount}×`}
    >
      {item.url && !failed ? (
        <img
          src={item.url}
          alt={item.name ?? item.kind}
          loading="lazy"
          onError={() => setFailed(true)}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-surface-600">
          <Icon size={18} />
          {failed && <span className="text-[8px] uppercase tracking-wider">no preview</span>}
        </div>
      )}

      <span className={`absolute top-1 left-1 p-0.5 rounded border ${KIND_BADGE[item.kind]}`}>
        <Icon size={9} />
      </span>

      {/* Two different kinds of "moves". A real GIF animates in this grid on
          its own; a VRChat emoji is a still sprite sheet that only moves once
          it's rebuilt, so the badge is the only sign it isn't a contact sheet. */}
      {(item.animated || item.spriteAnimated || (item.spriteFrames ?? 0) > 1) && (
        <span className="absolute bottom-1 left-1 text-[8px] font-bold px-1 rounded bg-black/70 text-emerald-300 border border-emerald-500/40 uppercase tracking-wider">
          {item.animated
            ? (item.mediaFormat === 'gif' ? 'GIF' : item.mediaFormat === 'apng' ? 'APNG' : 'ANIM')
            : item.spriteFrames ? `${item.spriteFrames}f` : 'ANIM'}
        </span>
      )}

      {item.seenCount > 1 && (
        <span className="absolute top-1 right-1 text-[9px] font-bold px-1 rounded bg-black/60 text-surface-300">
          {item.seenCount}×
        </span>
      )}

      {(item.name || item.worldName) && (
        <span className="absolute inset-x-0 bottom-0 px-1.5 py-1 text-[9px] text-left text-surface-200 bg-gradient-to-t from-black/85 to-transparent opacity-0 group-hover:opacity-100 transition-opacity truncate">
          {item.name ?? item.worldName}
        </span>
      )}
    </button>
  );
}
