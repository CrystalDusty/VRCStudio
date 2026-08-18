import { useEffect, useRef, useState, useCallback } from 'react';
import { X, Pin, PinOff, Shirt, RotateCw, Search, Check, Clock, Database, Copy, Tag, Image, ExternalLink } from 'lucide-react';
import api from '../api/vrchat';
import { vrcdb, VRCDB_PROVIDERS, getProviderId } from '../api/vrcdb';
import type { VRCDBAvatar } from '../api/vrcdb';
import { useAvatarSwitcherStore } from '../stores/avatarSwitcherStore';
import { useAuthStore } from '../stores/authStore';
import type { VRCAvatar } from '../types/vrchat';
import AvatarPreviewModal from './AvatarPreviewModal';

interface Props {
  open: boolean;
  onClose: () => void;
}

type SwitcherMode = 'mine' | 'vrcdb';
type VrcdbTab = 'name' | 'tag';

export default function AvatarSwitcher({ open, onClose }: Props) {
  const {
    pinnedIds, recentIds, cachedAvatars,
    togglePin, recordSwitch, setCache, isCacheStale, isPinned,
  } = useAvatarSwitcherStore();
  const { user } = useAuthStore();

  const [mode, setMode] = useState<SwitcherMode>('mine');
  const [filter, setFilter] = useState('');
  const [isFetching, setIsFetching] = useState(false);
  const [wearingId, setWearingId] = useState<string | null>(null);
  const [wornId, setWornId] = useState<string | null>(null);

  // VRCDB state
  const [vrcdbTab, setVrcdbTab] = useState<VrcdbTab>('name');
  const [vrcdbQuery, setVrcdbQuery] = useState('');
  const [tagQuery, setTagQuery] = useState('');
  const [vrcdbResults, setVrcdbResults] = useState<VRCDBAvatar[]>([]);
  const [vrcdbLoading, setVrcdbLoading] = useState(false);
  const [vrcdbError, setVrcdbError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [previewAvatar, setPreviewAvatar] = useState<VRCAvatar | null>(null);

  const panelRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);
  const vrcdbRef = useRef<HTMLInputElement>(null);

  const fetchAvatars = useCallback(async () => {
    setIsFetching(true);
    try {
      const [ownRes, favRes] = await Promise.allSettled([
        api.getOwnAvatars(100),
        api.getFavorites('avatar', 100).then(favs =>
          Promise.all(favs.map(f => api.getAvatar(f.favoriteId).catch(() => null)))
        ),
      ]);
      const own = ownRes.status === 'fulfilled' ? ownRes.value : [];
      const favsFull = favRes.status === 'fulfilled'
        ? favRes.value.filter((a): a is VRCAvatar => a !== null)
        : [];
      const seen = new Set<string>();
      const merged: VRCAvatar[] = [];
      for (const a of [...own, ...favsFull]) {
        if (!seen.has(a.id)) { seen.add(a.id); merged.push(a); }
      }
      setCache(merged);
    } catch {}
    setIsFetching(false);
  }, [setCache]);

  useEffect(() => {
    if (open) {
      if (cachedAvatars.length === 0 || isCacheStale()) fetchAvatars();
      setTimeout(() => (mode === 'mine' ? filterRef : vrcdbRef).current?.focus(), 80);
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      setTimeout(() => (mode === 'mine' ? filterRef : vrcdbRef).current?.focus(), 50);
    }
  }, [mode]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const onClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClickOutside);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClickOutside);
    };
  }, [open, onClose]);

  const handleWear = async (avatarId: string) => {
    if (wearingId) return;
    setWearingId(avatarId);
    try {
      await api.selectAvatar(avatarId);
      recordSwitch(avatarId);
      setWornId(avatarId);
      setTimeout(() => setWornId(null), 3000);
    } catch {}
    setWearingId(null);
  };

  const runVrcdbSearch = async (fn: () => Promise<VRCDBAvatar[]>) => {
    setVrcdbLoading(true);
    setVrcdbError(null);
    setVrcdbResults([]);
    try {
      setVrcdbResults(await fn());
    } catch (err) {
      setVrcdbError(err instanceof Error ? err.message : 'Search failed');
    }
    setVrcdbLoading(false);
  };

  const searchByName = () => {
    const q = vrcdbQuery.trim();
    if (!q) return;
    runVrcdbSearch(() => vrcdb.search(q, 30));
  };

  const searchByTag = () => {
    const t = tagQuery.trim();
    if (!t) return;
    // avtrdb has no tag-specific endpoint — its free-text search already
    // matches tags, so this goes through the same search path.
    runVrcdbSearch(() => vrcdb.search(t, 50));
  };

  const openSimilarImageSearch = (avatarId: string) => {
    const url = vrcdb.webUrlFor(avatarId);
    if (!url) return;
    if (window.electronAPI?.openExternal) window.electronAPI.openExternal(url);
    else window.open(url, '_blank');
  };

  const copyId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (!open) return null;

  const q = filter.toLowerCase();
  const byId = new Map(cachedAvatars.map(a => [a.id, a]));
  const allFiltered = cachedAvatars.filter(a =>
    !q || a.name.toLowerCase().includes(q) || a.authorName.toLowerCase().includes(q)
  );
  const pinnedAvatars = pinnedIds.map(id => byId.get(id)).filter((a): a is VRCAvatar => !!a)
    .filter(a => !q || a.name.toLowerCase().includes(q));
  const recentAvatars = recentIds.map(id => byId.get(id)).filter((a): a is VRCAvatar => !!a)
    .filter(a => !q || a.name.toLowerCase().includes(q)).slice(0, 5);
  const pinnedSet = new Set(pinnedIds);
  const recentSet = new Set(recentIds.slice(0, 5));
  const restAvatars = allFiltered
    .filter(a => !pinnedSet.has(a.id) && !recentSet.has(a.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  const currentAvatarId = user?.currentAvatar;
  const providerLabel = VRCDB_PROVIDERS.find(p => p.id === getProviderId())?.label ?? 'VRCDB';

  const vrcdbTabs: { id: VrcdbTab; icon: React.ElementType; label: string }[] = [
    { id: 'name', icon: Search, label: 'Name' },
    { id: 'tag', icon: Tag, label: 'Tag' },
  ];

  const showEmptyState = !vrcdbLoading && !vrcdbError && vrcdbResults.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end pointer-events-none">
      <div className="absolute inset-0 bg-black/40 pointer-events-auto" onClick={onClose} />

      <div
        ref={panelRef}
        className="relative pointer-events-auto w-80 h-full bg-surface-900 border-l border-surface-800/60 flex flex-col shadow-2xl animate-slide-in-right"
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-surface-800/60 flex-shrink-0">
          <Shirt size={15} className="text-accent-400" />
          <span className="text-sm font-semibold flex-1">Quick Switch</span>
          {mode === 'mine' && (
            <>
              <span className="text-xs text-surface-600 tabular-nums">{cachedAvatars.length}</span>
              <button
                onClick={fetchAvatars}
                disabled={isFetching}
                className="p-1 hover:bg-surface-800 rounded transition-colors text-surface-500 hover:text-surface-200"
                title="Refresh avatar list"
              >
                <RotateCw size={13} className={isFetching ? 'animate-spin' : ''} />
              </button>
            </>
          )}
          <button
            onClick={onClose}
            className="p-1 hover:bg-surface-800 rounded transition-colors text-surface-500 hover:text-surface-200"
          >
            <X size={14} />
          </button>
        </div>

        {/* Mode toggle */}
        <div className="flex border-b border-surface-800/60 flex-shrink-0">
          <button
            onClick={() => setMode('mine')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors ${
              mode === 'mine' ? 'text-accent-400 border-b-2 border-accent-500 -mb-px' : 'text-surface-500 hover:text-surface-300'
            }`}
          >
            <Shirt size={12} /> My Avatars
          </button>
          <button
            onClick={() => setMode('vrcdb')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors ${
              mode === 'vrcdb' ? 'text-accent-400 border-b-2 border-accent-500 -mb-px' : 'text-surface-500 hover:text-surface-300'
            }`}
          >
            <Database size={12} /> {providerLabel}
          </button>
        </div>

        {/* VRCDB sub-tabs */}
        {mode === 'vrcdb' && (
          <div className="flex border-b border-surface-800/40 flex-shrink-0 bg-surface-900/50">
            {vrcdbTabs.map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                onClick={() => setVrcdbTab(id)}
                className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 text-[10px] font-medium transition-colors ${
                  vrcdbTab === id
                    ? 'text-accent-400 bg-accent-500/8'
                    : 'text-surface-600 hover:text-surface-400'
                }`}
              >
                <Icon size={11} />
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Search input for vrcdb tabs */}
        {mode === 'vrcdb' && (
          <div className="px-3 py-2 flex-shrink-0 border-b border-surface-800/40">
            {vrcdbTab === 'name' && (
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-500 pointer-events-none" />
                  <input
                    ref={vrcdbRef}
                    value={vrcdbQuery}
                    onChange={e => setVrcdbQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && searchByName()}
                    placeholder="Avatar name..."
                    className="w-full bg-surface-800 text-sm pl-8 pr-3 py-1.5 rounded-lg border border-surface-700/40 focus:outline-none focus:border-accent-500/50 placeholder-surface-600"
                  />
                </div>
                <button onClick={searchByName} disabled={vrcdbLoading || !vrcdbQuery.trim()} className="btn-primary text-xs px-3 flex-shrink-0">
                  Go
                </button>
              </div>
            )}

            {vrcdbTab === 'tag' && (
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Tag size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-500 pointer-events-none" />
                  <input
                    value={tagQuery}
                    onChange={e => setTagQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && searchByTag()}
                    placeholder="e.g. cute, wolf, mmd..."
                    className="w-full bg-surface-800 text-sm pl-8 pr-3 py-1.5 rounded-lg border border-surface-700/40 focus:outline-none focus:border-accent-500/50 placeholder-surface-600"
                  />
                </div>
                <button onClick={searchByTag} disabled={vrcdbLoading || !tagQuery.trim()} className="btn-primary text-xs px-3 flex-shrink-0">
                  Go
                </button>
              </div>
            )}
          </div>
        )}

        {/* My avatars search */}
        {mode === 'mine' && (
          <div className="px-3 py-2 flex-shrink-0 border-b border-surface-800/40">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-500 pointer-events-none" />
              <input
                ref={filterRef}
                value={filter}
                onChange={e => setFilter(e.target.value)}
                placeholder="Filter my avatars..."
                className="w-full bg-surface-800 text-sm pl-8 pr-3 py-1.5 rounded-lg border border-surface-700/40 focus:outline-none focus:border-accent-500/50 placeholder-surface-600"
              />
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {mode === 'mine' ? (
            /* ── My Avatars ── */
            isFetching && cachedAvatars.length === 0 ? (
              <div className="flex items-center justify-center py-16 text-surface-500 text-sm gap-2">
                <RotateCw size={14} className="animate-spin" /> Loading avatars...
              </div>
            ) : cachedAvatars.length === 0 ? (
              <div className="text-center py-16 text-surface-500">
                <Shirt size={36} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">No avatars found</p>
                <button onClick={fetchAvatars} className="btn-secondary text-xs mt-3">Refresh</button>
              </div>
            ) : (
              <div className="py-2">
                {pinnedAvatars.length > 0 && (
                  <Section label="Pinned">
                    {pinnedAvatars.map(a => (
                      <AvatarRow key={a.id} avatar={a} isCurrent={a.id === currentAvatarId}
                        isPinned={isPinned(a.id)} isWearing={wearingId === a.id} isWorn={wornId === a.id}
                        onWear={() => handleWear(a.id)} onTogglePin={() => togglePin(a.id)}
                        onPreview={() => setPreviewAvatar(a)} />
                    ))}
                  </Section>
                )}
                {recentAvatars.length > 0 && (
                  <Section label="Recent">
                    {recentAvatars.map(a => (
                      <AvatarRow key={a.id} avatar={a} isCurrent={a.id === currentAvatarId}
                        isPinned={isPinned(a.id)} isWearing={wearingId === a.id} isWorn={wornId === a.id}
                        onWear={() => handleWear(a.id)} onTogglePin={() => togglePin(a.id)} showRecent
                        onPreview={() => setPreviewAvatar(a)} />
                    ))}
                  </Section>
                )}
                {restAvatars.length > 0 && (
                  <Section label={pinnedAvatars.length || recentAvatars.length ? 'All Avatars' : ''}>
                    {restAvatars.map(a => (
                      <AvatarRow key={a.id} avatar={a} isCurrent={a.id === currentAvatarId}
                        isPinned={isPinned(a.id)} isWearing={wearingId === a.id} isWorn={wornId === a.id}
                        onWear={() => handleWear(a.id)} onTogglePin={() => togglePin(a.id)}
                        onPreview={() => setPreviewAvatar(a)} />
                    ))}
                  </Section>
                )}
                {allFiltered.length === 0 && filter && (
                  <div className="text-center py-10 text-surface-500 text-sm">No avatars match "{filter}"</div>
                )}
              </div>
            )
          ) : (
            /* ── VRCDB ── */
            vrcdbLoading ? (
              <div className="flex items-center justify-center py-16 text-surface-500 text-sm gap-2">
                <RotateCw size={14} className="animate-spin" /> Searching...
              </div>
            ) : vrcdbError ? (
              <div className="p-4 text-xs text-rose-400 space-y-1">
                <p className="font-medium">Search failed</p>
                <p className="text-surface-500 leading-relaxed">{vrcdbError}</p>
              </div>
            ) : showEmptyState ? (
              <div className="text-center py-16 text-surface-500">
                {vrcdbTab === 'name' ? (
                  <>
                    <Search size={32} className="mx-auto mb-3 opacity-30" />
                    <p className="text-sm">{vrcdbQuery ? 'No results found' : 'Search by avatar name'}</p>
                    <p className="text-xs mt-1 text-surface-600">
                      {vrcdbQuery ? 'Try a different name or author' : 'Type a name and press Go'}
                    </p>
                  </>
                ) : (
                  <>
                    <Tag size={32} className="mx-auto mb-3 opacity-30" />
                    <p className="text-sm">{tagQuery ? 'No avatars with that tag' : 'Search by tag'}</p>
                    <p className="text-xs mt-1 text-surface-600">
                      {tagQuery ? 'Try a different tag' : 'e.g. cute, wolf, neko, vrchat...'}
                    </p>
                  </>
                )}
              </div>
            ) : (
              <div className="py-2">
                <Section label={`${vrcdbResults.length} results`}>
                  {vrcdbResults.map(a => {
                    const isWearing = wearingId === a.id;
                    const isWorn = wornId === a.id;
                    const imgUrl = a.thumbnailImageUrl || a.imageUrl;
                    return (
                      <div key={a.id} className="group flex items-center gap-2.5 px-3 py-1.5 hover:bg-surface-800/60 transition-colors">
                        <div className="flex-shrink-0">
                          {imgUrl ? (
                            <img src={imgUrl} alt="" className="w-9 h-9 rounded-lg object-cover bg-surface-800" loading="lazy" />
                          ) : (
                            <div className="w-9 h-9 rounded-lg bg-surface-800 flex items-center justify-center">
                              <Shirt size={14} className="text-surface-600" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium truncate">{a.name}</div>
                          <div className="text-[10px] text-surface-600 truncate">{a.authorName}</div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={() => openSimilarImageSearch(a.id)}
                            className="p-1 rounded text-surface-600 hover:text-accent-400 transition-colors opacity-0 group-hover:opacity-100"
                            title="Find similar avatars on avtrdb.com"
                          >
                            <Image size={11} />
                          </button>
                          <button
                            onClick={() => copyId(a.id)}
                            className="p-1 rounded text-surface-600 hover:text-surface-300 transition-colors opacity-0 group-hover:opacity-100"
                            title="Copy ID"
                          >
                            {copiedId === a.id ? <Check size={11} className="text-green-400" /> : <Copy size={11} />}
                          </button>
                          <button
                            onClick={() => handleWear(a.id)}
                            disabled={!!wearingId}
                            className={`text-[11px] px-2 py-1 rounded font-medium transition-colors ${
                              isWorn ? 'bg-green-500/20 text-green-400' : 'bg-accent-600/20 text-accent-400 hover:bg-accent-600/30'
                            }`}
                          >
                            {isWorn ? '✓' : isWearing ? '...' : 'Wear'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </Section>
              </div>
            )
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0">
          {mode === 'vrcdb' && (
            <div className="px-3 py-2 border-t border-surface-800/40 space-y-0.5">
              <p className="text-[9px] text-surface-600 leading-relaxed">
                Database provided by{' '}
                <a
                  href="https://avtrdb.com"
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent-400 hover:underline inline-flex items-center gap-0.5"
                >
                  avtrdb.com <ExternalLink size={8} />
                </a>
                , wouldn't be possible without them.
              </p>
              <p className="text-[9px] text-surface-600 leading-relaxed">
                For avatar removal please consult the{' '}
                <a
                  href="https://avtrdb.com/faq"
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent-400 hover:underline inline-flex items-center gap-0.5"
                >
                  database FAQ <ExternalLink size={8} />
                </a>
                .
              </p>
            </div>
          )}
          <div className="px-4 py-2 border-t border-surface-800/40">
            <p className="text-[10px] text-surface-700 text-center">Esc to close · Ctrl+Shift+A to toggle</p>
          </div>
        </div>
      </div>
      {previewAvatar && <AvatarPreviewModal avatar={previewAvatar} onClose={() => setPreviewAvatar(null)} />}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-1">
      {label ? (
        <div className="px-4 py-1.5 text-[10px] font-semibold text-surface-600 uppercase tracking-widest">{label}</div>
      ) : null}
      {children}
    </div>
  );
}

function AvatarRow({
  avatar, isCurrent, isPinned, isWearing, isWorn, showRecent,
  onWear, onTogglePin, onPreview,
}: {
  avatar: VRCAvatar;
  isCurrent: boolean;
  isPinned: boolean;
  isWearing: boolean;
  isWorn: boolean;
  showRecent?: boolean;
  onWear: () => void;
  onTogglePin: () => void;
  onPreview: () => void;
}) {
  const imgUrl = avatar.thumbnailImageUrl || avatar.imageUrl;
  return (
    <div className={`group flex items-center gap-2.5 px-3 py-1.5 hover:bg-surface-800/60 transition-colors ${isCurrent ? 'bg-accent-500/8' : ''}`}>
      <div className="relative flex-shrink-0">
        <button onClick={onPreview} className="block" title="Preview">
          <img src={imgUrl} alt="" className="w-9 h-9 rounded-lg object-cover bg-surface-800 hover:ring-2 hover:ring-accent-400 transition-all cursor-zoom-in" loading="lazy" />
        </button>
        {isCurrent && (
          <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full ring-2 ring-surface-900 flex items-center justify-center">
            <Check size={7} strokeWidth={3} className="text-white" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium truncate">{avatar.name}</div>
        {showRecent ? (
          <div className="text-[10px] text-surface-600 flex items-center gap-1 mt-0.5"><Clock size={9} /> worn recently</div>
        ) : (
          <div className="text-[10px] text-surface-600 truncate">{avatar.authorName}</div>
        )}
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={onTogglePin}
          className={`p-1 rounded transition-colors opacity-0 group-hover:opacity-100 ${isPinned ? 'text-accent-400 opacity-100' : 'text-surface-600 hover:text-surface-300'}`}
          title={isPinned ? 'Unpin' : 'Pin to top'}
        >
          {isPinned ? <Pin size={11} /> : <PinOff size={11} />}
        </button>
        <button
          onClick={onWear}
          disabled={isWearing || isCurrent}
          className={`text-[11px] px-2 py-1 rounded transition-colors font-medium flex items-center gap-1 ${
            isWorn ? 'bg-green-500/20 text-green-400'
            : isCurrent ? 'text-surface-600 cursor-default'
            : 'bg-accent-600/20 text-accent-400 hover:bg-accent-600/30'
          }`}
        >
          {isWorn ? <><Check size={10} /> Worn</> : isWearing ? '...' : isCurrent ? 'Current' : 'Wear'}
        </button>
      </div>
    </div>
  );
}
