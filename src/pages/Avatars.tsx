import { useState, useEffect, useRef } from 'react';
import {
  Shirt, Search, ArrowLeft, Heart, AlertCircle, RotateCw,
  Pin, PinOff, Zap, Copy, Check, Database, ExternalLink,
  ChevronLeft, ChevronRight,
  Monitor, Smartphone, Shuffle, User, Tag, X, LayoutGrid,
} from 'lucide-react';
import api from '../api/vrchat';
import { vrcdb, VRCDB_PROVIDERS, getProviderId, setProviderId } from '../api/vrcdb';
import type { ProviderId } from '../api/vrcdb';
import SearchInput from '../components/common/SearchInput';
import EmptyState from '../components/common/EmptyState';
import LoadingSpinner from '../components/common/LoadingSpinner';
import type { VRCAvatar } from '../types/vrchat';
import { useAvatarSwitcherStore } from '../stores/avatarSwitcherStore';
import { AvatarRankBadge } from '../components/AvatarPerformance';

type AvatarTab = 'own' | 'favorites' | 'vrc_search' | 'vrcdb';

const VRC_CHUNK = 100;
export const COLUMN_OPTIONS = [2, 3, 4, 5, 6] as const;
export const PER_PAGE_OPTIONS = [10, 20, 40, 60, 100] as const;
export const COLUMNS_KEY = 'vrcstudio_avatar_columns';
export const PER_PAGE_KEY = 'vrcstudio_avatar_perpage';

export function loadAvatarPref<T extends number>(key: string, fallback: T): T {
  const v = localStorage.getItem(key);
  return v ? (Number(v) as T) : fallback;
}

const loadPref = loadAvatarPref;

function getPlatformSupport(avatar: VRCAvatar): { pc: boolean; quest: boolean } {
  const pkgs = avatar.unityPackages ?? [];
  return {
    pc:    pkgs.some(p => p.platform === 'standalonewindows'),
    quest: pkgs.some(p => p.platform === 'android'),
  };
}

function PlatformBadge({ avatar }: { avatar: VRCAvatar }) {
  const { pc, quest } = getPlatformSupport(avatar);
  if (!pc && !quest) return null;
  if (pc && quest) {
    return (
      <span className="flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/20 font-medium flex-shrink-0">
        <Monitor size={8} /><span className="mx-0.5">+</span><Smartphone size={8} />
      </span>
    );
  }
  if (quest) {
    return (
      <span className="flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20 font-medium flex-shrink-0">
        <Smartphone size={8} /> Quest
      </span>
    );
  }
  return (
    <span className="flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/20 font-medium flex-shrink-0">
      <Monitor size={8} /> PC
    </span>
  );
}

export default function AvatarsPage() {
  const { togglePin, isPinned, toggle: openSwitcher } = useAvatarSwitcherStore();
  const [tab, setTab] = useState<AvatarTab>('own');
  const [favoriteAvatars, setFavoriteAvatars] = useState<VRCAvatar[]>([]);
  const [ownAvatars, setOwnAvatars] = useState<VRCAvatar[]>([]);
  const [vrcSearchResults, setVrcSearchResults] = useState<VRCAvatar[]>([]);
  const [vrcdbQuery, setVrcdbQuery] = useState<string | null>(null);
  const [favLoading, setFavLoading] = useState(false);
  const [ownLoading, setOwnLoading] = useState(false);
  const [vrcSearchLoading, setVrcSearchLoading] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [selected, setSelected] = useState<VRCAvatar | null>(null);
  const [switching, setSwitching] = useState(false);
  const [ownAvatarsError, setOwnAvatarsError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [surpriseMeLoading, setSurpriseMeLoading] = useState(false);
  const [vrcPage, setVrcPage] = useState(0);
  const [vrcReachedEnd, setVrcReachedEnd] = useState(false);
  const [ownPage, setOwnPage] = useState(0);
  const [favPage, setFavPage] = useState(0);
  const [columns, setColumns] = useState<number>(() => loadPref(COLUMNS_KEY, 4));
  const [perPage, setPerPage] = useState<number>(() => loadPref(PER_PAGE_KEY, 20));
  const [lastQuery, setLastQuery] = useState<{ q: string; tag?: string } | null>(null);

  useEffect(() => {
    loadFavoriteAvatars();
    loadOwnAvatars();
  }, []);

  const loadFavoriteAvatars = async () => {
    setFavLoading(true);
    try {
      const favorites = await api.getFavorites('avatar', 100);
      const results = await Promise.all(favorites.map(f => api.getAvatar(f.favoriteId).catch(() => null)));
      setFavoriteAvatars(results.filter((a): a is VRCAvatar => a !== null));
    } catch {}
    setFavLoading(false);
  };

  const loadOwnAvatars = async () => {
    setOwnLoading(true);
    try {
      setOwnAvatarsError(null);
      const avatars = await api.getOwnAvatars();
      setOwnAvatars(Array.isArray(avatars) ? avatars : []);
    } catch (err) {
      setOwnAvatarsError(err instanceof Error ? err.message : 'Failed to load uploaded avatars');
    }
    setOwnLoading(false);
  };

  const saveColumns = (v: number) => { setColumns(v); localStorage.setItem(COLUMNS_KEY, String(v)); };
  const savePerPage = (v: number) => { setPerPage(v); localStorage.setItem(PER_PAGE_KEY, String(v)); };

  const ensureVrcPageLoaded = async (targetPage: number, query: { q: string; tag?: string }, existingResults: VRCAvatar[], reachedEnd: boolean) => {
    if (reachedEnd) return;
    const needed = (targetPage + 1) * perPage;
    if (existingResults.length >= needed) return;
    setVrcSearchLoading(true);
    let current = existingResults.slice();
    let ended = false;
    try {
      while (current.length < needed && !ended) {
        const more = await api.searchAvatars({ query: query.q || undefined, tag: query.tag, count: VRC_CHUNK, offset: current.length });
        if (more.length < VRC_CHUNK) ended = true;
        if (more.length === 0) break;
        current = [...current, ...more];
      }
    } catch {}
    setVrcSearchResults(current);
    setVrcReachedEnd(ended);
    setVrcSearchLoading(false);
  };

  const goToVrcPage = (page: number) => {
    setVrcPage(page);
    if (lastQuery) ensureVrcPageLoaded(page, lastQuery, vrcSearchResults, vrcReachedEnd);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSearch = async () => {
    const q = searchInput.trim();
    const t = tagInput.trim();
    if (!q && !t) return;
    if (tab === 'vrcdb') {
      if (q) setVrcdbQuery(q);
    } else {
      const apiTag = t ? `author_tag_${t}` : undefined;
      const query = { q, tag: apiTag };
      setTab('vrc_search');
      setVrcPage(0);
      setVrcSearchResults([]);
      setVrcReachedEnd(false);
      setLastQuery(query);
      setVrcSearchLoading(true);
      try {
        const results = await api.searchAvatars({ query: q || undefined, tag: apiTag, count: VRC_CHUNK });
        setVrcSearchResults(results);
        setVrcReachedEnd(results.length < VRC_CHUNK);
      } catch {}
      setVrcSearchLoading(false);
    }
  };

  const handleSelect = async (avatarId: string) => {
    setSwitching(true);
    try { await api.selectAvatar(avatarId); } catch {}
    setSwitching(false);
  };

  const copyId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSurpriseMe = async () => {
    setSurpriseMeLoading(true);
    try {
      const terms = ['cute', 'anime', 'robot', 'dragon', 'fox', 'wolf', 'miku', 'knight', 'witch', 'cat'];
      const q = terms[Math.floor(Math.random() * terms.length)];
      const results = await api.searchAvatars({ query: q, sort: 'updated', count: 50 });
      if (results.length > 0) setSelected(results[Math.floor(Math.random() * results.length)]);
    } catch {}
    setSurpriseMeLoading(false);
  };

  const handleFindByCreator = async (avatar: VRCAvatar) => {
    setSelected(null);
    const query = { q: avatar.authorName };
    setTab('vrc_search');
    setVrcPage(0);
    setVrcSearchResults([]);
    setVrcReachedEnd(false);
    setLastQuery(query);
    setSearchInput(avatar.authorName);
    setVrcSearchLoading(true);
    try {
      const results = await api.searchAvatars({ query: avatar.authorName, count: VRC_CHUNK });
      setVrcSearchResults(results);
      setVrcReachedEnd(results.length < VRC_CHUNK);
    } catch {}
    setVrcSearchLoading(false);
  };

  const searchPlaceholder = tab === 'vrcdb'
    ? 'Search Database — name, author, or avtr_ ID...'
    : 'Search avatars...';

  const allVrcAvatars = tab === 'own' ? ownAvatars : tab === 'favorites' ? favoriteAvatars : vrcSearchResults;
  const vrcLoading = tab === 'own' ? ownLoading : tab === 'favorites' ? favLoading : vrcSearchLoading;

  const currentPage = tab === 'own' ? ownPage : tab === 'favorites' ? favPage : vrcPage;
  const setCurrentPage = tab === 'own' ? setOwnPage : tab === 'favorites' ? setFavPage : goToVrcPage;

  const totalPages = Math.max(1, Math.ceil(allVrcAvatars.length / perPage));
  const hasUnknownEnd = tab === 'vrc_search' && !vrcReachedEnd && allVrcAvatars.length > 0;
  const vrcAvatars = allVrcAvatars.slice(currentPage * perPage, (currentPage + 1) * perPage);

  if (selected) {
    const { pc, quest } = getPlatformSupport(selected);
    return (
      <div className="max-w-3xl mx-auto animate-fade-in">
        <button onClick={() => setSelected(null)} className="btn-ghost flex items-center gap-1 mb-4 -ml-2">
          <ArrowLeft size={16} /> Back
        </button>
        <div className="glass-panel-solid overflow-hidden">
          <div className="aspect-video max-h-80">
            <img src={selected.imageUrl} alt="" className="w-full h-full object-cover" />
          </div>
          <div className="p-6">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h1 className="text-xl font-bold">{selected.name}</h1>
                <p className="text-surface-400 text-sm mt-1">by {selected.authorName}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 mt-1">
                {pc && quest && (
                  <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-green-500/15 text-green-400 border border-green-500/20 font-medium">
                    <Monitor size={12} /> PC + <Smartphone size={12} /> Quest
                  </span>
                )}
                {pc && !quest && (
                  <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-blue-500/15 text-blue-400 border border-blue-500/20 font-medium">
                    <Monitor size={12} /> PC Only
                  </span>
                )}
                {quest && !pc && (
                  <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/20 font-medium">
                    <Smartphone size={12} /> Quest
                  </span>
                )}
              </div>
            </div>
            {selected.description && (
              <p className="text-sm text-surface-400 mt-4 whitespace-pre-wrap">{selected.description}</p>
            )}
            {selected.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-4">
                {selected.tags
                  .filter(t => !t.startsWith('system_') && !t.startsWith('admin_'))
                  .map(tag => (
                    <span key={tag} className="badge bg-surface-800 text-surface-400">
                      {tag.replace('author_tag_', '')}
                    </span>
                  ))}
              </div>
            )}
            <div className="mt-4 text-xs text-surface-600">
              Version {selected.version} &middot; Updated: {new Date(selected.updated_at).toLocaleDateString()}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={() => handleSelect(selected.id)} disabled={switching} className="btn-primary text-sm">
                {switching ? 'Switching...' : 'Switch to this Avatar'}
              </button>
              <button
                onClick={() => handleFindByCreator(selected)}
                className="btn-secondary text-sm flex items-center gap-1.5"
              >
                <User size={14} /> More by {selected.authorName}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Avatars</h1>
        <button onClick={openSwitcher} className="btn-secondary text-xs flex items-center gap-1.5" title="Open quick avatar switcher (Ctrl+Shift+A)">
          <Zap size={13} /> Quick Switch
        </button>
      </div>

      <div className="flex gap-2 flex-wrap">
        <SearchInput
          value={searchInput}
          onChange={setSearchInput}
          onEnter={handleSearch}
          placeholder={searchPlaceholder}
          className="flex-1 min-w-40 max-w-md"
        />
        {tab !== 'vrcdb' && (
          <div className="flex items-center gap-1 bg-surface-800/60 border border-surface-700/40 rounded-lg px-2 min-w-32 max-w-xs flex-1">
            <Tag size={13} className="text-surface-500 flex-shrink-0" />
            <input
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="Tag filter..."
              className="bg-transparent text-sm text-surface-200 placeholder-surface-500 focus:outline-none flex-1 py-1.5 min-w-0"
            />
            {tagInput && (
              <button onClick={() => setTagInput('')} className="text-surface-500 hover:text-surface-300"><X size={12} /></button>
            )}
          </div>
        )}
        <button onClick={handleSearch} className="btn-primary text-sm">Search</button>
        <button
          onClick={handleSurpriseMe}
          disabled={surpriseMeLoading}
          className="btn-secondary text-sm flex items-center gap-1.5"
          title="Pick a random popular avatar"
        >
          <Shuffle size={14} /> {surpriseMeLoading ? '...' : 'Surprise Me'}
        </button>
      </div>

      <div className="flex gap-1 border-b border-surface-800 pb-px">
        {([
          { key: 'own'        as AvatarTab, icon: Shirt,    label: `My Uploads${ownAvatars.length ? ` (${ownAvatars.length})` : ''}` },
          { key: 'favorites'  as AvatarTab, icon: Heart,    label: `Favorites${favoriteAvatars.length ? ` (${favoriteAvatars.length})` : ''}` },
          ...(vrcSearchResults.length > 0 ? [{ key: 'vrc_search' as AvatarTab, icon: Search, label: `VRChat (${vrcSearchResults.length})` }] : []),
          { key: 'vrcdb'      as AvatarTab, icon: Database, label: 'Database' },
        ] as const).map(({ key, icon: Icon, label }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === key ? 'tab-active' : 'tab-inactive'
            }`}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {/* Display controls */}
      <div className="flex items-center gap-3 flex-wrap text-xs text-surface-400">
        <div className="flex items-center gap-1.5">
          <LayoutGrid size={13} className="text-surface-500" />
          <span>Columns:</span>
          <div className="flex gap-1">
            {COLUMN_OPTIONS.map(c => (
              <button key={c} onClick={() => saveColumns(c)}
                className={`w-7 h-6 rounded border text-xs transition-colors ${
                  columns === c ? 'border-accent-500 bg-accent-500/20 text-accent-400 font-semibold' : 'border-surface-700 hover:border-surface-500 text-surface-400'
                }`}
              >{c}</button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span>Per page:</span>
          <div className="flex gap-1">
            {PER_PAGE_OPTIONS.map(n => (
              <button key={n} onClick={() => { savePerPage(n); setOwnPage(0); setFavPage(0); setVrcPage(0); }}
                className={`px-2 h-6 rounded border text-xs transition-colors ${
                  perPage === n ? 'border-accent-500 bg-accent-500/20 text-accent-400 font-semibold' : 'border-surface-700 hover:border-surface-500 text-surface-400'
                }`}
              >{n}</button>
            ))}
          </div>
        </div>
        {tab === 'vrc_search' && allVrcAvatars.length > 0 && (
          <span className="ml-auto text-surface-600">{allVrcAvatars.length}{!vrcReachedEnd ? '+' : ''} loaded</span>
        )}
      </div>

      {tab === 'vrcdb' ? (
        <VrcdbPanel
          query={vrcdbQuery}
          copiedId={copiedId}
          onCopy={copyId}
          onWear={handleSelect}
          perPage={perPage}
          columns={columns}
        />
      ) : (
        vrcLoading ? (
          <LoadingSpinner className="py-16" />
        ) : tab === 'own' && ownAvatarsError ? (
          <div className="glass-panel-solid border border-rose-500/30 bg-rose-500/10 p-4 rounded-lg flex items-start gap-3">
            <AlertCircle size={20} className="text-rose-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-rose-400">Error loading uploaded avatars</p>
              <p className="text-xs text-rose-400/80 mt-1">{ownAvatarsError}</p>
            </div>
            <button onClick={loadOwnAvatars} className="btn-secondary text-xs flex items-center gap-1 flex-shrink-0"><RotateCw size={14} /> Retry</button>
          </div>
        ) : allVrcAvatars.length === 0 ? (
          <EmptyState
            icon={tab === 'vrc_search' ? Search : tab === 'favorites' ? Heart : Shirt}
            title={tab === 'vrc_search' ? 'No avatars found' : tab === 'favorites' ? 'No favorited avatars' : 'No uploaded avatars'}
            description={tab === 'vrc_search' ? 'Try different search terms' : tab === 'favorites' ? 'Avatars you favorite in VRChat will appear here' : "Avatars you've uploaded to VRChat will appear here"}
          />
        ) : (
          <>
          <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
            {vrcAvatars.map(avatar => {
              const pinned = isPinned(avatar.id);
              return (
                <div key={avatar.id} className="relative group">
                  <button onClick={() => setSelected(avatar)} className="glass-panel-solid overflow-hidden card-hover group text-left w-full">
                    <div className="aspect-square overflow-hidden relative">
                      <img src={avatar.thumbnailImageUrl || avatar.imageUrl} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
                      <div className="absolute top-2 left-2 drop-shadow">
                        <AvatarRankBadge avatar={avatar} />
                      </div>
                    </div>
                    <div className="p-3">
                      <h3 className="text-sm font-semibold truncate">{avatar.name}</h3>
                      <div className="flex items-center justify-between gap-1 mt-0.5">
                        <p className="text-xs text-surface-400 truncate">by {avatar.authorName}</p>
                        <PlatformBadge avatar={avatar} />
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); togglePin(avatar.id); }}
                    className={`absolute top-2 right-2 p-1.5 rounded-lg backdrop-blur-sm transition-all ${
                      pinned ? 'bg-accent-600/80 text-white opacity-100' : 'bg-black/50 text-white opacity-0 group-hover:opacity-100'
                    }`}
                    title={pinned ? 'Remove from Quick Switch pins' : 'Pin to Quick Switch'}
                  >
                    {pinned ? <Pin size={11} /> : <PinOff size={11} />}
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); handleFindByCreator(avatar); }}
                    className="absolute bottom-2 left-2 text-[10px] px-2 py-0.5 rounded bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80"
                    title={`More by ${avatar.authorName}`}
                  >
                    more
                  </button>
                </div>
              );
            })}
          </div>
          <PageNavigator
            page={currentPage}
            totalPages={totalPages}
            hasUnknownEnd={hasUnknownEnd}
            loading={vrcSearchLoading}
            onGoTo={setCurrentPage}
          />
          </>
        )
      )}
    </div>
  );
}

export function PageNavigator({
  page, totalPages, hasUnknownEnd = false, loading = false,
  onGoTo,
}: {
  page: number;
  totalPages: number;
  hasUnknownEnd?: boolean;
  loading?: boolean;
  onGoTo: (page: number) => void;
}) {
  if (totalPages <= 1 && !hasUnknownEnd) return null;
  const effectiveTotal = hasUnknownEnd ? totalPages + 1 : totalPages;
  const pages = Array.from({ length: effectiveTotal }, (_, i) => i)
    .filter(i => Math.abs(i - page) <= 3 || i === 0 || i === effectiveTotal - 1)
    .reduce<(number | 'gap')[]>((acc, i, idx, arr) => {
      if (idx > 0 && i - (arr[idx - 1] as number) > 1) acc.push('gap');
      acc.push(i);
      return acc;
    }, []);

  return (
    <div className="flex items-center justify-center gap-2 pt-2">
      <button onClick={() => onGoTo(0)} disabled={page === 0}
        className="p-1.5 rounded border border-surface-700 text-surface-400 hover:text-surface-200 hover:border-surface-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors" title="First page">
        <ChevronLeft size={14} className="inline" /><ChevronLeft size={14} className="inline -ml-2" />
      </button>
      <button onClick={() => onGoTo(page - 1)} disabled={page === 0}
        className="p-1.5 rounded border border-surface-700 text-surface-400 hover:text-surface-200 hover:border-surface-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors" title="Previous page">
        <ChevronLeft size={14} />
      </button>
      <div className="flex gap-1">
        {pages.map((item, idx) =>
          item === 'gap' ? (
            <span key={`gap-${idx}`} className="px-1.5 py-1 text-xs text-surface-600">…</span>
          ) : item === effectiveTotal - 1 && hasUnknownEnd ? (
            <button key={item} onClick={() => onGoTo(item as number)} disabled={loading}
              className={`min-w-[28px] h-7 px-1.5 rounded text-xs border transition-colors ${
                page === item ? 'border-accent-500 bg-accent-500/20 text-accent-400 font-semibold' : 'border-surface-700 text-surface-400 hover:text-surface-200 hover:border-surface-500'
              }`}
            >{loading && page === item ? '…' : `${(item as number) + 1}+`}</button>
          ) : (
            <button key={item} onClick={() => onGoTo(item as number)}
              className={`min-w-[28px] h-7 px-1.5 rounded text-xs border transition-colors ${
                page === item ? 'border-accent-500 bg-accent-500/20 text-accent-400 font-semibold' : 'border-surface-700 text-surface-400 hover:text-surface-200 hover:border-surface-500'
              }`}
            >{(item as number) + 1}</button>
          )
        )}
      </div>
      <button onClick={() => onGoTo(page + 1)} disabled={page >= effectiveTotal - 1 && !hasUnknownEnd}
        className="p-1.5 rounded border border-surface-700 text-surface-400 hover:text-surface-200 hover:border-surface-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors" title="Next page">
        <ChevronRight size={14} />
      </button>
      <button onClick={() => onGoTo(effectiveTotal - 1)} disabled={page >= effectiveTotal - 1 && !hasUnknownEnd}
        className="p-1.5 rounded border border-surface-700 text-surface-400 hover:text-surface-200 hover:border-surface-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors" title="Last page">
        <ChevronRight size={14} className="inline" /><ChevronRight size={14} className="inline -ml-2" />
      </button>
    </div>
  );
}

export function VrcdbPanel({
  query,
  copiedId,
  onCopy,
  onWear,
  perPage = 20,
  columns = 4,
}: {
  query: string | null;
  copiedId: string | null;
  onCopy: (id: string) => void;
  onWear: (id: string) => void;
  perPage?: number;
  columns?: number;
}) {
  const [providerId, setProviderIdState] = useState<ProviderId>(getProviderId());
  const [wearingId, setWearingId] = useState<string | null>(null);
  const [wornId, setWornId] = useState<string | null>(null);

  // Paginated search state
  type CachedAvatars = import('../api/vrcdb').VRCDBAvatar[];
  type CacheEntry = { avatars: CachedAvatars; fetchedAt: number };
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  const CACHE_MAX = 30;             // max pages held at once
  const cacheRef = useRef<Map<number, CacheEntry>>(new Map());
  const [knownPageCount, setKnownPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [displayResults, setDisplayResults] = useState<CachedAvatars>([]);

  // Author search override state
  const [authorQuery, setAuthorQuery] = useState<{ id: string; name: string } | null>(null);
  const [authorResults, setAuthorResults] = useState<CachedAvatars>([]);
  const [authorPage, setAuthorPage] = useState(0);
  const [authorLoading, setAuthorLoading] = useState(false);
  const [authorError, setAuthorError] = useState<string | null>(null);

  const resetCache = () => {
    cacheRef.current = new Map();
    setKnownPageCount(0);
  };

  const writeCache = (pageIdx: number, avatars: CachedAvatars) => {
    const cache = cacheRef.current;
    // Evict oldest entry when at cap
    if (!cache.has(pageIdx) && cache.size >= CACHE_MAX) {
      const oldest = [...cache.entries()].sort((a, b) => a[1].fetchedAt - b[1].fetchedAt)[0];
      if (oldest) cache.delete(oldest[0]);
    }
    cache.set(pageIdx, { avatars, fetchedAt: Date.now() });
    setKnownPageCount(cache.size);
  };

  const readCache = (pageIdx: number): CachedAvatars | null => {
    const entry = cacheRef.current.get(pageIdx);
    if (!entry) return null;
    if (Date.now() - entry.fetchedAt > CACHE_TTL) {
      cacheRef.current.delete(pageIdx);
      setKnownPageCount(cacheRef.current.size);
      return null;
    }
    return entry.avatars;
  };

  const changeProvider = (id: ProviderId) => {
    setProviderId(id);
    setProviderIdState(id);
    resetCache();
    setCurrentPage(0);
    setHasMore(false);
    setTotal(undefined);
    setDisplayResults([]);
    setAuthorQuery(null);
    if (query) fetchSearchPage(0, query, perPage);
  };

  const fetchSearchPage = async (pageIdx: number, q: string, ps: number) => {
    const cached = readCache(pageIdx);
    if (cached) {
      setDisplayResults(cached);
      setCurrentPage(pageIdx);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await vrcdb.searchPage(q, ps, pageIdx + 1);
      writeCache(pageIdx, result.avatars);
      setDisplayResults(result.avatars);
      setHasMore(result.hasMore);
      if (result.total !== undefined) setTotal(result.total);
      setCurrentPage(pageIdx);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    }
    setLoading(false);
  };

  // Reset and fetch page 1 whenever query, perPage, or providerId changes
  useEffect(() => {
    if (!query) return;
    resetCache();
    setCurrentPage(0);
    setHasMore(false);
    setTotal(undefined);
    setDisplayResults([]);
    setError(null);
    setAuthorQuery(null);
    fetchSearchPage(0, query, perPage);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, perPage, providerId]);

  const goToPage = (pageIdx: number) => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (authorQuery) {
      setAuthorPage(pageIdx);
      return;
    }
    if (query) fetchSearchPage(pageIdx, query, perPage);
  };

  const handleFindByAuthor = async (authorId: string, authorName: string) => {
    setAuthorQuery({ id: authorId, name: authorName });
    setAuthorPage(0);
    setAuthorResults([]);
    setAuthorError(null);
    setAuthorLoading(true);
    try {
      const r = await vrcdb.getByAuthor(authorId);
      setAuthorResults(r.length > 0 ? r : await vrcdb.search(authorName));
    } catch (err) {
      setAuthorError(err instanceof Error ? err.message : 'Search failed');
    }
    setAuthorLoading(false);
  };

  const handleWear = async (id: string) => {
    if (wearingId) return;
    setWearingId(id);
    try {
      await onWear(id);
      setWornId(id);
      setTimeout(() => setWornId(null), 3000);
    } catch {}
    setWearingId(null);
  };

  const renderCard = (avatar: import('../api/vrcdb').VRCDBAvatar) => {
    const isWearing = wearingId === avatar.id;
    const isWorn = wornId === avatar.id;
    const wasCopied = copiedId === avatar.id;
    const imgUrl = avatar.thumbnailImageUrl || avatar.imageUrl;
    return (
      <div key={avatar.id} className="glass-panel-solid overflow-hidden flex flex-col">
        <div className="aspect-square overflow-hidden bg-surface-800">
          {imgUrl
            ? <img src={imgUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
            : <div className="w-full h-full flex items-center justify-center"><Shirt size={32} className="text-surface-700" /></div>}
        </div>
        <div className="p-3 flex flex-col gap-2 flex-1">
          <div>
            <h3 className="text-sm font-semibold truncate" title={avatar.name}>{avatar.name}</h3>
            <p className="text-xs text-surface-400 truncate">by {avatar.authorName}</p>
          </div>
          {avatar.description && <p className="text-[11px] text-surface-500 line-clamp-2 leading-relaxed">{avatar.description}</p>}
          <div className="flex items-center gap-1.5 mt-auto pt-1">
            <button onClick={() => handleWear(avatar.id)} disabled={!!wearingId}
              className={`flex-1 text-xs py-1.5 rounded-lg font-medium transition-colors flex items-center justify-center gap-1 ${
                isWorn ? 'bg-green-500/20 text-green-400' : 'btn-primary'
              }`}
            >
              {isWorn ? <><Check size={11} /> Worn</> : isWearing ? 'Switching...' : 'Wear'}
            </button>
            <button onClick={() => handleFindByAuthor(avatar.authorId, avatar.authorName)}
              className="text-[10px] px-2 py-1.5 rounded-lg border border-surface-700 hover:border-surface-500 transition-colors text-surface-400 hover:text-surface-200"
              title={`More by ${avatar.authorName}`}
            >more</button>
            <button onClick={() => onCopy(avatar.id)}
              className="p-1.5 rounded-lg border border-surface-700 hover:border-surface-500 transition-colors text-surface-400 hover:text-surface-200"
              title="Copy avatar ID"
            >
              {wasCopied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
            </button>
            <a href={`https://vrchat.com/home/avatar/${avatar.id}`} target="_blank" rel="noopener noreferrer"
              onClick={e => { if (window.electronAPI?.openExternal) { e.preventDefault(); window.electronAPI.openExternal(`https://vrchat.com/home/avatar/${avatar.id}`); } }}
              className="p-1.5 rounded-lg border border-surface-700 hover:border-surface-500 transition-colors text-surface-400 hover:text-surface-200" title="Open on VRChat website"
            ><ExternalLink size={12} /></a>
          </div>
        </div>
      </div>
    );
  };

  // Author search mode
  if (authorQuery) {
    const totalAuthorPages = Math.max(1, Math.ceil(authorResults.length / perPage));
    const pageSlice = authorResults.slice(authorPage * perPage, (authorPage + 1) * perPage);
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => setAuthorQuery(null)} className="btn-ghost text-xs flex items-center gap-1">
            <ChevronLeft size={13} /> Back to search
          </button>
          <span className="text-sm text-surface-400">Avatars by <span className="text-surface-200 font-medium">{authorQuery.name}</span></span>
          {authorResults.length > 0 && <span className="text-xs text-surface-600 ml-auto">{authorResults.length} found</span>}
        </div>
        {authorLoading ? <LoadingSpinner className="py-16" /> :
         authorError ? (
           <div className="glass-panel-solid border border-rose-500/30 bg-rose-500/10 p-4 rounded-lg text-sm text-rose-400 flex items-center justify-between gap-4">
             <span>{authorError}</span>
             <button onClick={() => handleFindByAuthor(authorQuery.id, authorQuery.name)} className="btn-secondary text-xs flex items-center gap-1 flex-shrink-0"><RotateCw size={12} /> Retry</button>
           </div>
         ) : authorResults.length === 0 ? (
           <EmptyState icon={Database} title="No avatars found" description={`No public avatars found by ${authorQuery.name}`} />
         ) : (
           <>
             <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
               {pageSlice.map(renderCard)}
             </div>
             <PageNavigator page={authorPage} totalPages={totalAuthorPages} onGoTo={p => { setAuthorPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
           </>
         )}
      </div>
    );
  }

  // Normal search mode
  const totalPages = total !== undefined
    ? Math.max(1, Math.ceil(total / perPage))
    : hasMore ? knownPageCount + 1 : Math.max(1, knownPageCount);
  const unknownEnd = total === undefined && hasMore;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs text-surface-500"><Database size={12} /> Provider:</div>
        <div className="flex gap-1">
          {VRCDB_PROVIDERS.map(p => (
            <button key={p.id} onClick={() => changeProvider(p.id as ProviderId)}
              className={`px-2.5 py-1 rounded text-xs border transition-colors ${
                providerId === p.id ? 'border-accent-500 bg-accent-500/15 text-accent-400' : 'border-surface-700 bg-surface-800 text-surface-500 hover:text-surface-300'
              }`}
            >{p.label}</button>
          ))}
        </div>
        <p className="text-xs text-surface-600 ml-auto">Community-run public avatar index</p>
      </div>

      {loading ? (
        <LoadingSpinner className="py-16" />
      ) : error ? (
        <div className="glass-panel-solid border border-rose-500/30 bg-rose-500/10 p-4 rounded-lg text-sm text-rose-400 flex items-center justify-between gap-4">
          <span>{error}</span>
          {query && <button onClick={() => fetchSearchPage(currentPage, query, perPage)} className="btn-secondary text-xs flex items-center gap-1 flex-shrink-0"><RotateCw size={12} /> Retry</button>}
        </div>
      ) : displayResults.length === 0 && !query ? (
        <div className="text-center py-16 text-surface-500">
          <Database size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-semibold">Search the Database</p>
          <p className="text-xs mt-1 text-surface-600">Type a name or author in the search bar above and press Search</p>
        </div>
      ) : displayResults.length === 0 ? (
        <div className="text-center py-16 text-surface-500">
          <Database size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-semibold">No avatars found</p>
          <p className="text-xs mt-1 text-surface-600">Try a different name, author, or paste an avtr_ ID</p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between text-xs text-surface-500">
            {total !== undefined
              ? <span>{total.toLocaleString()} avatar{total !== 1 ? 's' : ''} found &mdash; page {currentPage + 1} of {totalPages}</span>
              : <span>Page {currentPage + 1}{hasMore ? '+' : ''}</span>}
          </div>
          <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
            {displayResults.map(renderCard)}
          </div>
          <PageNavigator
            page={currentPage}
            totalPages={totalPages}
            hasUnknownEnd={unknownEnd}
            loading={loading}
            onGoTo={goToPage}
          />
        </>
      )}
      <div className="px-3 py-2 border-t border-surface-800/40 text-[10px] text-surface-600 leading-relaxed">
        Avatar data is provided by third-party databases (avtrdb.com).
        Database holder wanting your data removed?{' '}
        <a href="mailto:vrcstudio@proton.me" className="text-accent-400 hover:underline">vrcstudio@proton.me</a>
      </div>
    </div>
  );
}
