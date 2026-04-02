import { useState, useEffect } from 'react';
import { Shirt, Search, Star, ArrowLeft, Heart } from 'lucide-react';
import api from '../api/vrchat';
import SearchInput from '../components/common/SearchInput';
import EmptyState from '../components/common/EmptyState';
import LoadingSpinner from '../components/common/LoadingSpinner';
import type { VRCAvatar } from '../types/vrchat';

type AvatarTab = 'favorites' | 'own' | 'search';

export default function AvatarsPage() {
  const [tab, setTab] = useState<AvatarTab>('favorites');
  const [favoriteAvatars, setFavoriteAvatars] = useState<VRCAvatar[]>([]);
  const [ownAvatars, setOwnAvatars] = useState<VRCAvatar[]>([]);
  const [searchResults, setSearchResults] = useState<VRCAvatar[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [selected, setSelected] = useState<VRCAvatar | null>(null);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    loadFavoriteAvatars();
    loadOwnAvatars();
  }, []);

  const loadFavoriteAvatars = async () => {
    setIsLoading(true);
    try {
      const favorites = await api.getFavorites('avatar', 100);
      // Resolve each favorite to full avatar data
      const avatarPromises = favorites.map(fav =>
        api.getAvatar(fav.favoriteId).catch(() => null)
      );
      const results = await Promise.all(avatarPromises);
      setFavoriteAvatars(results.filter((a): a is VRCAvatar => a !== null));
    } catch {}
    setIsLoading(false);
  };

  const loadOwnAvatars = async () => {
    try {
      const avatars = await api.getOwnAvatars();
      setOwnAvatars(avatars);
    } catch {}
  };

  const handleSearch = async () => {
    if (!searchInput.trim()) return;
    setTab('search');
    setIsLoading(true);
    try {
      const results = await api.searchAvatars({ query: searchInput.trim(), count: 30 });
      setSearchResults(results);
    } catch {}
    setIsLoading(false);
  };

  const handleSelect = async (avatarId: string) => {
    setSwitching(true);
    try {
      await api.selectAvatar(avatarId);
    } catch {}
    setSwitching(false);
  };

  const avatars = tab === 'favorites' ? favoriteAvatars : tab === 'own' ? ownAvatars : searchResults;

  if (selected) {
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
            <h1 className="text-xl font-bold">{selected.name}</h1>
            <p className="text-surface-400 text-sm mt-1">by {selected.authorName}</p>
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
              Version {selected.version} &middot;
              Updated: {new Date(selected.updated_at).toLocaleDateString()}
            </div>
            <button
              onClick={() => handleSelect(selected.id)}
              disabled={switching}
              className="btn-primary mt-4 text-sm"
            >
              {switching ? 'Switching...' : 'Switch to this Avatar'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-4 animate-fade-in">
      <h1 className="text-2xl font-bold">Avatars</h1>

      <div className="flex gap-2">
        <SearchInput
          value={searchInput}
          onChange={setSearchInput}
          placeholder="Search avatars..."
          className="flex-1 max-w-md"
        />
        <button onClick={handleSearch} className="btn-primary text-sm">Search</button>
      </div>

      <div className="flex gap-1 border-b border-surface-800 pb-px">
        {([
          { key: 'favorites' as AvatarTab, icon: Heart, label: `Favorites (${favoriteAvatars.length})` },
          { key: 'own' as AvatarTab, icon: Shirt, label: `My Uploads (${ownAvatars.length})` },
          ...(searchResults.length > 0 ? [{ key: 'search' as AvatarTab, icon: Search, label: `Search Results (${searchResults.length})` }] : []),
        ]).map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === key ? 'tab-active' : 'tab-inactive'
            }`}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <LoadingSpinner className="py-16" />
      ) : avatars.length === 0 ? (
        <EmptyState
          icon={tab === 'search' ? Search : tab === 'favorites' ? Heart : Shirt}
          title={
            tab === 'search' ? 'No avatars found'
            : tab === 'favorites' ? 'No favorited avatars'
            : 'No uploaded avatars'
          }
          description={
            tab === 'search' ? 'Try different search terms'
            : tab === 'favorites' ? 'Avatars you favorite in VRChat will appear here'
            : 'Avatars you\'ve uploaded to VRChat will appear here'
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {avatars.map(avatar => (
            <button
              key={avatar.id}
              onClick={() => setSelected(avatar)}
              className="glass-panel-solid overflow-hidden card-hover group text-left"
            >
              <div className="aspect-square overflow-hidden">
                <img
                  src={avatar.thumbnailImageUrl || avatar.imageUrl}
                  alt=""
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                />
              </div>
              <div className="p-3">
                <h3 className="text-sm font-semibold truncate">{avatar.name}</h3>
                <p className="text-xs text-surface-400 truncate">by {avatar.authorName}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
