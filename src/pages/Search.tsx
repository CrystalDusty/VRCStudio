import { useState, useEffect } from 'react';
import { Search as SearchIcon, Users, Globe, Shirt, Heart, Database, Pin, PinOff, LayoutGrid } from 'lucide-react';
import api from '../api/vrchat';
import SearchInput from '../components/common/SearchInput';
import UserAvatar from '../components/common/UserAvatar';
import WorldCard from '../components/common/WorldCard';
import EmptyState from '../components/common/EmptyState';
import LoadingSpinner from '../components/common/LoadingSpinner';
import {
  VrcdbPanel, PageNavigator,
  COLUMN_OPTIONS, PER_PAGE_OPTIONS, COLUMNS_KEY, PER_PAGE_KEY, loadAvatarPref,
} from './Avatars';
import type { VRCUser, VRCWorld, VRCAvatar } from '../types/vrchat';
import { getBestAvatarUrl } from '../utils/avatar';
import { useAvatarSwitcherStore } from '../stores/avatarSwitcherStore';
import { AvatarRankBadge } from '../components/AvatarPerformance';

type SearchCategory = 'users' | 'worlds' | 'avatars';
type AvatarSubTab = 'vrc' | 'own' | 'favorites' | 'database';

const VRC_CHUNK = 100;

export default function SearchPage() {
  const { togglePin, isPinned } = useAvatarSwitcherStore();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<SearchCategory>('users');
  const [avatarSubTab, setAvatarSubTab] = useState<AvatarSubTab>('vrc');
  const [isLoading, setIsLoading] = useState(false);
  const [userResults, setUserResults] = useState<VRCUser[]>([]);
  const [worldResults, setWorldResults] = useState<VRCWorld[]>([]);
  const [avatarResults, setAvatarResults] = useState<VRCAvatar[]>([]);
  const [ownAvatars, setOwnAvatars] = useState<VRCAvatar[]>([]);
  const [favoriteAvatars, setFavoriteAvatars] = useState<VRCAvatar[]>([]);
  const [vrcdbQuery, setVrcdbQuery] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [avatarsLoaded, setAvatarsLoaded] = useState(false);

  // Display preferences (shared with Avatars page via localStorage keys)
  const [columns, setColumns] = useState<number>(() => loadAvatarPref(COLUMNS_KEY, 4));
  const [perPage, setPerPage] = useState<number>(() => loadAvatarPref(PER_PAGE_KEY, 20));
  const saveColumns = (v: number) => { setColumns(v); localStorage.setItem(COLUMNS_KEY, String(v)); };
  const savePerPage = (v: number) => { setPerPage(v); localStorage.setItem(PER_PAGE_KEY, String(v)); setVrcPage(0); setOwnPage(0); setFavPage(0); };

  // Pagination state
  const [vrcPage, setVrcPage] = useState(0);
  const [vrcReachedEnd, setVrcReachedEnd] = useState(false);
  const [vrcLoading, setVrcLoading] = useState(false);
  const [ownLoading, setOwnLoading] = useState(false);
  const [favLoading, setFavLoading] = useState(false);
  const [ownPage, setOwnPage] = useState(0);
  const [favPage, setFavPage] = useState(0);
  const [lastQuery, setLastQuery] = useState<string>('');

  useEffect(() => {
    if (category === 'avatars' && !avatarsLoaded) {
      setAvatarsLoaded(true);
      loadOwnAvatars();
      loadFavoriteAvatars();
    }
  }, [category, avatarsLoaded]);

  const loadOwnAvatars = async () => {
    setOwnLoading(true);
    try {
      const avatars = await api.getOwnAvatars();
      setOwnAvatars(Array.isArray(avatars) ? avatars : []);
    } catch {}
    setOwnLoading(false);
  };

  const loadFavoriteAvatars = async () => {
    setFavLoading(true);
    try {
      const favorites = await api.getFavorites('avatar', 100);
      const results = await Promise.all(
        favorites.map(f => api.getAvatar(f.favoriteId).catch(() => null))
      );
      setFavoriteAvatars(results.filter((a): a is VRCAvatar => a !== null));
    } catch {}
    setFavLoading(false);
  };

  const ensureVrcPageLoaded = async (targetPage: number, q: string, existing: VRCAvatar[], reachedEnd: boolean) => {
    if (reachedEnd) return;
    const needed = (targetPage + 1) * perPage;
    if (existing.length >= needed) return;
    setVrcLoading(true);
    let current = existing.slice();
    let ended = false;
    try {
      while (current.length < needed && !ended) {
        const more = await api.searchAvatars({ query: q, count: VRC_CHUNK, offset: current.length });
        if (more.length < VRC_CHUNK) ended = true;
        if (more.length === 0) break;
        current = [...current, ...more];
      }
    } catch {}
    setAvatarResults(current);
    setVrcReachedEnd(ended);
    setVrcLoading(false);
  };

  const goToVrcPage = (page: number) => {
    setVrcPage(page);
    if (lastQuery) ensureVrcPageLoaded(page, lastQuery, avatarResults, vrcReachedEnd);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const copyId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const detectQueryType = (q: string): { type: 'id' | 'text'; category?: SearchCategory; id?: string } => {
    const trimmed = q.trim();
    if (trimmed.startsWith('usr_')) return { type: 'id', category: 'users', id: trimmed };
    if (trimmed.startsWith('wrld_')) return { type: 'id', category: 'worlds', id: trimmed };
    if (trimmed.startsWith('avtr_')) return { type: 'id', category: 'avatars', id: trimmed };
    const urlMatch = trimmed.match(/vrchat\.com\/home\/(world|user|avatar)\/(wrld_|usr_|avtr_)([a-f0-9-]+)/);
    if (urlMatch) {
      const typeMap: Record<string, SearchCategory> = { world: 'worlds', user: 'users', avatar: 'avatars' };
      return { type: 'id', category: typeMap[urlMatch[1]], id: `${urlMatch[2]}${urlMatch[3]}` };
    }
    return { type: 'text' };
  };

  const handleSearch = async () => {
    const q = query.trim();
    if (!q) return;

    // Database sub-tab: route to VrcdbPanel (self-fetching)
    if (category === 'avatars' && avatarSubTab === 'database') {
      setVrcdbQuery(q);
      return;
    }

    setIsLoading(true);
    setHasSearched(true);
    const detection = detectQueryType(q);

    try {
      if (detection.type === 'id' && detection.id) {
        switch (detection.category) {
          case 'users': {
            const user = await api.getUser(detection.id);
            setUserResults([user]);
            setWorldResults([]);
            setAvatarResults([]);
            setCategory('users');
            break;
          }
          case 'worlds': {
            const world = await api.getWorld(detection.id);
            setWorldResults([world]);
            setUserResults([]);
            setAvatarResults([]);
            setCategory('worlds');
            break;
          }
          case 'avatars': {
            const avatar = await api.getAvatar(detection.id);
            setAvatarResults([avatar]);
            setUserResults([]);
            setWorldResults([]);
            setCategory('avatars');
            setAvatarSubTab('vrc');
            setVrcReachedEnd(true);
            setVrcPage(0);
            setLastQuery('');
            break;
          }
        }
      } else {
        const [users, worlds, avatars] = await Promise.allSettled([
          api.searchUsers(q, 20),
          api.searchWorlds({ query: q, count: 20 }),
          api.searchAvatars({ query: q, count: VRC_CHUNK }),
        ]);
        setUserResults(users.status === 'fulfilled' ? users.value : []);
        setWorldResults(worlds.status === 'fulfilled' ? worlds.value : []);
        const avs = avatars.status === 'fulfilled' ? avatars.value : [];
        setAvatarResults(avs);
        setVrcReachedEnd(avs.length < VRC_CHUNK);
        setVrcPage(0);
        setLastQuery(q);
        if (category === 'avatars') setAvatarSubTab('vrc');
      }
    } catch (err) {
      console.error('Search failed:', err);
    }

    setIsLoading(false);
  };

  // Derived pagination values for the currently visible sub-tab
  const sliceFor = (list: VRCAvatar[], page: number) => list.slice(page * perPage, (page + 1) * perPage);

  const renderAvatarGrid = (list: VRCAvatar[]) => (
    <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {list.map(avatar => {
        const pinned = isPinned(avatar.id);
        return (
          <div key={avatar.id} className="relative group glass-panel-solid overflow-hidden card-hover">
            <div className="aspect-square overflow-hidden relative">
              <img src={avatar.thumbnailImageUrl || avatar.imageUrl} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
              <div className="absolute top-2 left-2 drop-shadow">
                <AvatarRankBadge avatar={avatar} />
              </div>
            </div>
            <div className="p-3">
              <h3 className="text-sm font-semibold truncate">{avatar.name}</h3>
              <p className="text-xs text-surface-400 truncate">by {avatar.authorName}</p>
            </div>
            <button
              onClick={e => { e.stopPropagation(); togglePin(avatar.id); }}
              className={`absolute top-2 right-2 p-1.5 rounded-lg backdrop-blur-sm transition-all ${
                pinned ? 'bg-accent-600/80 text-white opacity-100' : 'bg-black/50 text-white opacity-0 group-hover:opacity-100'
              }`}
              title={pinned ? 'Unpin' : 'Pin to Quick Switch'}
            >
              {pinned ? <Pin size={11} /> : <PinOff size={11} />}
            </button>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto space-y-4 animate-fade-in">
      <h1 className="text-2xl font-bold">Search</h1>
      <p className="text-sm text-surface-400 -mt-2">
        Search by name, or paste a VRChat URL or ID (usr_, wrld_, avtr_) for direct lookup
      </p>

      <div className="flex gap-2">
        <div className="flex-1">
          <SearchInput
            value={query}
            onChange={setQuery}
            onEnter={handleSearch}
            placeholder={
              category === 'avatars' && avatarSubTab === 'database'
                ? 'Search Database — name, author, or avtr_ ID...'
                : 'Search users, worlds, avatars... or paste an ID/URL'
            }
            autoFocus
          />
        </div>
        <button onClick={handleSearch} className="btn-primary text-sm">
          Search
        </button>
      </div>

      {/* Category tabs */}
      <div className="flex gap-1 border-b border-surface-800 pb-px">
        {([
          { key: 'users' as SearchCategory,   icon: Users,  label: `Users (${userResults.length})` },
          { key: 'worlds' as SearchCategory,  icon: Globe,  label: `Worlds (${worldResults.length})` },
          { key: 'avatars' as SearchCategory, icon: Shirt,  label: `Avatars` },
        ]).map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => setCategory(key)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              category === key ? 'tab-active' : 'tab-inactive'
            }`}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {/* Avatar sub-tabs */}
      {category === 'avatars' && (
        <>
          <div className="flex gap-1 border-b border-surface-700/60 pb-px -mt-2">
            {([
              { key: 'vrc'      as AvatarSubTab, icon: SearchIcon, label: `VRChat${avatarResults.length ? ` (${avatarResults.length}${!vrcReachedEnd ? '+' : ''})` : ''}` },
              { key: 'own'      as AvatarSubTab, icon: Shirt,      label: `My Uploads${ownAvatars.length ? ` (${ownAvatars.length})` : ''}` },
              { key: 'favorites'as AvatarSubTab, icon: Heart,      label: `Favorites${favoriteAvatars.length ? ` (${favoriteAvatars.length})` : ''}` },
              { key: 'database' as AvatarSubTab, icon: Database,   label: 'Database' },
            ]).map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                onClick={() => setAvatarSubTab(key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors ${
                  avatarSubTab === key ? 'tab-active' : 'tab-inactive'
                }`}
              >
                <Icon size={12} /> {label}
              </button>
            ))}
          </div>

          {/* Display controls (columns + per page) */}
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
                  <button key={n} onClick={() => savePerPage(n)}
                    className={`px-2 h-6 rounded border text-xs transition-colors ${
                      perPage === n ? 'border-accent-500 bg-accent-500/20 text-accent-400 font-semibold' : 'border-surface-700 hover:border-surface-500 text-surface-400'
                    }`}
                  >{n}</button>
                ))}
              </div>
            </div>
            {avatarSubTab === 'vrc' && avatarResults.length > 0 && (
              <span className="ml-auto text-surface-600">{avatarResults.length}{!vrcReachedEnd ? '+' : ''} loaded</span>
            )}
          </div>
        </>
      )}

      {/* Results */}
      {isLoading ? (
        <LoadingSpinner className="py-16" />
      ) : category !== 'avatars' && !hasSearched ? (
        <EmptyState
          icon={SearchIcon}
          title="Start searching"
          description="Enter a name, ID, or VRChat URL to find users, worlds, and avatars"
        />
      ) : (
        <div className="space-y-1">
          {category === 'users' && (
            userResults.length === 0 ? (
              <EmptyState icon={SearchIcon} title="No users found" description="Try a different name or user ID" />
            ) : userResults.map(user => (
              <div key={user.id} className="glass-panel-solid p-3 flex items-center gap-3 card-hover">
                <UserAvatar src={getBestAvatarUrl(user)} status={user.status} size="md" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{user.displayName}</div>
                  <div className="text-xs text-surface-500 truncate">{user.statusDescription || user.status}</div>
                </div>
                <div className="text-xs text-surface-600 font-mono">{user.id}</div>
                {user.isFriend && <span className="badge bg-green-500/15 text-green-400">Friend</span>}
              </div>
            ))
          )}

          {category === 'worlds' && (
            worldResults.length === 0 ? (
              <EmptyState icon={Globe} title="No worlds found" description="Try a different world name or world ID" />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {worldResults.map(world => (
                  <div key={world.id} className="h-full"><WorldCard world={world} /></div>
                ))}
              </div>
            )
          )}

          {category === 'avatars' && avatarSubTab === 'vrc' && (
            vrcLoading ? <LoadingSpinner className="py-16" /> :
            avatarResults.length === 0 && !hasSearched ? (
              <EmptyState icon={SearchIcon} title="Search for avatars" description="Enter a name in the search bar above" />
            ) : avatarResults.length === 0 ? (
              <EmptyState icon={SearchIcon} title="No avatars found" description="Try different search terms" />
            ) : (
              <>
                {renderAvatarGrid(sliceFor(avatarResults, vrcPage))}
                <PageNavigator
                  page={vrcPage}
                  totalPages={Math.max(1, Math.ceil(avatarResults.length / perPage))}
                  hasUnknownEnd={!vrcReachedEnd && avatarResults.length > 0}
                  loading={vrcLoading}
                  onGoTo={goToVrcPage}
                />
              </>
            )
          )}

          {category === 'avatars' && avatarSubTab === 'own' && (
            ownLoading ? <LoadingSpinner className="py-16" /> :
            ownAvatars.length === 0 ? (
              <EmptyState icon={Shirt} title="No uploaded avatars" description="Avatars you've uploaded to VRChat will appear here" />
            ) : (
              <>
                {renderAvatarGrid(sliceFor(ownAvatars, ownPage))}
                <PageNavigator
                  page={ownPage}
                  totalPages={Math.max(1, Math.ceil(ownAvatars.length / perPage))}
                  onGoTo={p => { setOwnPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                />
              </>
            )
          )}

          {category === 'avatars' && avatarSubTab === 'favorites' && (
            favLoading ? <LoadingSpinner className="py-16" /> :
            favoriteAvatars.length === 0 ? (
              <EmptyState icon={Heart} title="No favorited avatars" description="Avatars you favorite in VRChat will appear here" />
            ) : (
              <>
                {renderAvatarGrid(sliceFor(favoriteAvatars, favPage))}
                <PageNavigator
                  page={favPage}
                  totalPages={Math.max(1, Math.ceil(favoriteAvatars.length / perPage))}
                  onGoTo={p => { setFavPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                />
              </>
            )
          )}

          {category === 'avatars' && avatarSubTab === 'database' && (
            <VrcdbPanel
              query={vrcdbQuery}
              copiedId={copiedId}
              onCopy={copyId}
              onWear={async (id) => { try { await api.selectAvatar(id); } catch {} }}
              perPage={perPage}
              columns={columns}
            />
          )}
        </div>
      )}
    </div>
  );
}
