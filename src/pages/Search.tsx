import { useState } from 'react';
import { Search as SearchIcon, Users, Globe, Shirt, ArrowRight, ExternalLink } from 'lucide-react';
import api from '../api/vrchat';
import SearchInput from '../components/common/SearchInput';
import UserAvatar from '../components/common/UserAvatar';
import WorldCard from '../components/common/WorldCard';
import EmptyState from '../components/common/EmptyState';
import LoadingSpinner from '../components/common/LoadingSpinner';
import type { VRCUser, VRCWorld, VRCAvatar } from '../types/vrchat';

type SearchCategory = 'users' | 'worlds' | 'avatars';

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<SearchCategory>('users');
  const [isLoading, setIsLoading] = useState(false);
  const [userResults, setUserResults] = useState<VRCUser[]>([]);
  const [worldResults, setWorldResults] = useState<VRCWorld[]>([]);
  const [avatarResults, setAvatarResults] = useState<VRCAvatar[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  const detectQueryType = (q: string): { type: 'id' | 'text'; category?: SearchCategory; id?: string } => {
    const trimmed = q.trim();
    if (trimmed.startsWith('usr_')) return { type: 'id', category: 'users', id: trimmed };
    if (trimmed.startsWith('wrld_')) return { type: 'id', category: 'worlds', id: trimmed };
    if (trimmed.startsWith('avtr_')) return { type: 'id', category: 'avatars', id: trimmed };
    // VRChat URL patterns
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

    setIsLoading(true);
    setHasSearched(true);

    const detection = detectQueryType(q);

    try {
      if (detection.type === 'id' && detection.id) {
        // Direct ID lookup
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
            break;
          }
        }
      } else {
        // Text search across all categories in parallel
        const [users, worlds, avatars] = await Promise.allSettled([
          api.searchUsers(q, 20),
          api.searchWorlds({ query: q, count: 20 }),
          api.searchAvatars({ query: q, count: 20 }),
        ]);
        setUserResults(users.status === 'fulfilled' ? users.value : []);
        setWorldResults(worlds.status === 'fulfilled' ? worlds.value : []);
        setAvatarResults(avatars.status === 'fulfilled' ? avatars.value : []);
      }
    } catch (err) {
      console.error('Search failed:', err);
    }

    setIsLoading(false);
  };

  const results = category === 'users' ? userResults
    : category === 'worlds' ? worldResults
    : avatarResults;

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
            placeholder="Search users, worlds, avatars... or paste an ID/URL"
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
          { key: 'users' as SearchCategory, icon: Users, label: `Users (${userResults.length})` },
          { key: 'worlds' as SearchCategory, icon: Globe, label: `Worlds (${worldResults.length})` },
          { key: 'avatars' as SearchCategory, icon: Shirt, label: `Avatars (${avatarResults.length})` },
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

      {/* Results */}
      {isLoading ? (
        <LoadingSpinner className="py-16" />
      ) : !hasSearched ? (
        <EmptyState
          icon={SearchIcon}
          title="Start searching"
          description="Enter a name, ID, or VRChat URL to find users, worlds, and avatars"
        />
      ) : results.length === 0 ? (
        <EmptyState
          icon={SearchIcon}
          title="No results found"
          description="Try different search terms or check the ID format"
        />
      ) : (
        <div className="space-y-1">
          {category === 'users' && userResults.map(user => (
            <div key={user.id} className="glass-panel-solid p-3 flex items-center gap-3 card-hover">
              <UserAvatar
                src={user.currentAvatarThumbnailImageUrl}
                status={user.status}
                size="md"
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{user.displayName}</div>
                <div className="text-xs text-surface-500 truncate">
                  {user.statusDescription || user.status}
                </div>
              </div>
              <div className="text-xs text-surface-600 font-mono">{user.id}</div>
              {user.isFriend && (
                <span className="badge bg-green-500/15 text-green-400">Friend</span>
              )}
            </div>
          ))}

          {category === 'worlds' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {worldResults.map(world => (
                <WorldCard key={world.id} world={world} />
              ))}
            </div>
          )}

          {category === 'avatars' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {avatarResults.map(avatar => (
                <div key={avatar.id} className="glass-panel-solid overflow-hidden card-hover text-left">
                  <div className="aspect-square overflow-hidden">
                    <img
                      src={avatar.thumbnailImageUrl || avatar.imageUrl}
                      alt=""
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>
                  <div className="p-3">
                    <h3 className="text-sm font-semibold truncate">{avatar.name}</h3>
                    <p className="text-xs text-surface-400 truncate">by {avatar.authorName}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
