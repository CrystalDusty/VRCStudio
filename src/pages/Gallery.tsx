// Everything VRChat has shown us: prints, stickers, emoji and other images
// picked up from the log as you play, the same way the video player records
// what's been played. Thumbnails are visible up front — you shouldn't have to
// click an item to find out what it is — and clicking opens the export view.

import { useEffect, useMemo, useState } from 'react';
import {
  Images, Search, Sticker, Smile, Printer, Image as ImageIcon,
  Trash2, EyeOff, Eye, RefreshCw, Info,
} from 'lucide-react';
import { useGalleryStore, type GalleryItem, type GalleryKind } from '../stores/galleryStore';
import { useVideoPlayerStore } from '../stores/videoPlayerStore';
import GalleryItemModal from '../components/GalleryItemModal';

type SortMode = 'recent' | 'oldest' | 'seen';
type KindFilter = 'all' | GalleryKind;

const KIND_META: Record<GalleryKind, { label: string; icon: typeof Sticker; color: string }> = {
  print:   { label: 'Prints',   icon: Printer,   color: 'text-sky-300 bg-sky-500/15 border-sky-500/30' },
  sticker: { label: 'Stickers', icon: Sticker,   color: 'text-pink-300 bg-pink-500/15 border-pink-500/30' },
  emoji:   { label: 'Emoji',    icon: Smile,     color: 'text-amber-300 bg-amber-500/15 border-amber-500/30' },
  image:   { label: 'Images',   icon: ImageIcon, color: 'text-surface-300 bg-surface-700/40 border-surface-600/40' },
};

const KIND_ORDER: GalleryKind[] = ['print', 'sticker', 'emoji', 'image'];

export default function GalleryPage() {
  const items = useGalleryStore(s => s.items);
  const setHidden = useGalleryStore(s => s.setHidden);
  const remove = useGalleryStore(s => s.remove);
  const clear = useGalleryStore(s => s.clear);
  const tailingActive = useVideoPlayerStore(s => s.tailingActive);

  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<KindFilter>('all');
  const [sort, setSort] = useState<SortMode>('recent');
  const [showHidden, setShowHidden] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [showAbout, setShowAbout] = useState(false);

  const all = useMemo(() => Object.values(items), [items]);

  const counts = useMemo(() => {
    const c: Record<GalleryKind, number> = { print: 0, sticker: 0, emoji: 0, image: 0 };
    for (const it of all) if (!it.hidden) c[it.kind]++;
    return c;
  }, [all]);

  const hiddenCount = useMemo(() => all.filter(i => i.hidden).length, [all]);

  const visible = useMemo(() => {
    let list = all.filter(i => (showHidden ? true : !i.hidden));
    if (kind !== 'all') list = list.filter(i => i.kind === kind);

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(i =>
        i.name?.toLowerCase().includes(q) ||
        i.authorName?.toLowerCase().includes(q) ||
        i.worldName?.toLowerCase().includes(q) ||
        i.id.toLowerCase().includes(q) ||
        i.kind.includes(q),
      );
    }

    switch (sort) {
      case 'oldest': return [...list].sort((a, b) => a.firstSeenAt - b.firstSeenAt);
      case 'seen':   return [...list].sort((a, b) => b.seenCount - a.seenCount);
      default:       return [...list].sort((a, b) => b.lastSeenAt - a.lastSeenAt);
    }
  }, [all, kind, search, sort, showHidden]);

  const selectedIndex = selectedId ? visible.findIndex(i => i.id === selectedId) : -1;
  const selected = selectedIndex >= 0 ? visible[selectedIndex] : undefined;

  // Keep the modal pointing at something real if the list shifts underneath it.
  useEffect(() => {
    if (selectedId && selectedIndex === -1) setSelectedId(null);
  }, [selectedId, selectedIndex]);

  return (
    <div className="max-w-6xl mx-auto space-y-4 animate-fade-in">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Images size={22} className="text-accent-400" />
            Gallery
          </h1>
          <p className="text-sm text-surface-400 mt-0.5">
            Prints, stickers and emoji VRChat has shown you — collected from the log as you play
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
            title="Where these come from"
          >
            <Info size={13} />
          </button>
        </div>
      </div>

      {showAbout && (
        <div className="glass-panel-solid p-3 text-[11px] text-surface-400 space-y-1.5">
          <p>
            Items are discovered passively: whenever VRChat writes an image ID or file URL to its
            log — a print someone spawns, a sticker placed on a wall, an emoji thrown — it gets
            recorded here with the world you were in at the time.
          </p>
          <p>
            That means the collection grows as you play and nothing appears retroactively for
            sessions before this feature existed. Everything is stored locally; "Forget" removes
            an item for good.
          </p>
        </div>
      )}

      {/* Filters */}
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
          <FilterChip active={kind === 'all'} onClick={() => setKind('all')} label="All" count={all.filter(i => !i.hidden).length} />
          {KIND_ORDER.map(k => (
            <FilterChip
              key={k}
              active={kind === k}
              onClick={() => setKind(kind === k ? 'all' : k)}
              label={KIND_META[k].label}
              count={counts[k]}
              colorClass={KIND_META[k].color}
            />
          ))}
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

      {/* Grid */}
      {visible.length === 0 ? (
        <div className="glass-panel-solid p-10 text-center text-sm text-surface-400">
          <Images size={30} className="mx-auto mb-2 opacity-30" />
          {all.length === 0 ? (
            <>
              <p>Nothing collected yet.</p>
              <p className="text-xs text-surface-500 mt-1">
                {tailingActive
                  ? 'Prints, stickers and emoji will appear here as you come across them in game.'
                  : "VRChat's log isn't connected, so nothing can be discovered yet."}
              </p>
            </>
          ) : (
            <>
              <p>Nothing matches these filters.</p>
              <button
                onClick={() => { setSearch(''); setKind('all'); }}
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
            {visible.map(item => (
              <Thumbnail key={item.id} item={item} onOpen={() => setSelectedId(item.id)} />
            ))}
          </div>
          <p className="text-[10px] text-surface-600 text-center">
            {visible.length} of {all.length} item{all.length === 1 ? '' : 's'} · click any thumbnail to
            enlarge, adjust borders and download
          </p>
        </>
      )}

      {selected && (
        <GalleryItemModal
          item={selected}
          onClose={() => setSelectedId(null)}
          onHide={id => setHidden(id, true)}
          onDelete={remove}
          onNavigate={delta => {
            const next = visible[selectedIndex + delta];
            if (next) setSelectedId(next.id);
          }}
        />
      )}
    </div>
  );
}

function Thumbnail({ item, onOpen }: { item: GalleryItem; onOpen: () => void }) {
  const [failed, setFailed] = useState(false);
  const meta = KIND_META[item.kind];
  const Icon = meta.icon;

  return (
    <button
      onClick={onOpen}
      className={`group relative aspect-square rounded-lg overflow-hidden bg-surface-850 border transition-colors ${
        item.hidden ? 'border-surface-800 opacity-45' : 'border-surface-800 hover:border-accent-500/50'
      }`}
      title={item.name ?? `${meta.label.replace(/s$/, '')} · seen ${item.seenCount}×`}
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

      {/* Kind badge, always visible so the grid is readable at a glance */}
      <span className={`absolute top-1 left-1 p-0.5 rounded border ${meta.color}`}>
        <Icon size={9} />
      </span>

      {item.seenCount > 1 && (
        <span className="absolute top-1 right-1 text-[9px] font-bold px-1 rounded bg-black/60 text-surface-300">
          {item.seenCount}×
        </span>
      )}

      {/* Name on hover — kept out of the way until wanted */}
      {(item.name || item.worldName) && (
        <span className="absolute inset-x-0 bottom-0 px-1.5 py-1 text-[9px] text-left text-surface-200 bg-gradient-to-t from-black/85 to-transparent opacity-0 group-hover:opacity-100 transition-opacity truncate">
          {item.name ?? item.worldName}
        </span>
      )}
    </button>
  );
}

function FilterChip({ active, onClick, label, count, colorClass }: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  colorClass?: string;
}) {
  if (count === 0 && !active) return null;
  return (
    <button
      onClick={onClick}
      className={`px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider rounded-full border transition-colors ${
        active
          ? colorClass ?? 'bg-accent-500/20 text-accent-300 border-accent-500/40'
          : 'text-surface-500 border-surface-700 hover:border-surface-600'
      }`}
    >
      {label} <span className="opacity-60 ml-0.5">{count}</span>
    </button>
  );
}
