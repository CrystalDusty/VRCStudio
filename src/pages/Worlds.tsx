import { useState, useEffect } from 'react';
import { Globe, TrendingUp, Clock, Star, Search, Users, Heart, ArrowLeft } from 'lucide-react';
import { useWorldStore } from '../stores/worldStore';
import { useFriendStore } from '../stores/friendStore';
import SearchInput from '../components/common/SearchInput';
import WorldCard from '../components/common/WorldCard';
import EmptyState from '../components/common/EmptyState';
import LoadingSpinner from '../components/common/LoadingSpinner';
import InstanceModal from '../components/InstanceModal';
import type { VRCWorld } from '../types/vrchat';

type WorldTab = 'search' | 'active' | 'recent' | 'favorites';

export default function WorldsPage() {
  const {
    searchResults, activeWorlds, recentWorlds, favoriteWorlds,
    isLoading, searchWorlds, fetchActiveWorlds, fetchRecentWorlds, fetchFavoriteWorlds,
    getWorld, worldCache,
  } = useWorldStore();
  const { onlineFriends } = useFriendStore();

  const [tab, setTab] = useState<WorldTab>('active');
  const [selectedWorld, setSelectedWorld] = useState<VRCWorld | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [instanceModal, setInstanceModal] = useState<{ worldId: string; instanceId: string } | null>(null);

  useEffect(() => {
    fetchActiveWorlds();
    fetchRecentWorlds();
    fetchFavoriteWorlds();
  }, []);

  const handleSearch = () => {
    if (searchInput.trim()) {
      setTab('search');
      searchWorlds(searchInput.trim());
    }
  };

  const openWorldDetail = async (world: VRCWorld) => {
    try {
      const detailed = await getWorld(world.id);
      setSelectedWorld(detailed);
    } catch {
      setSelectedWorld(world);
    }
  };

  const worldList =
    tab === 'search' ? searchResults :
    tab === 'active' ? activeWorlds :
    tab === 'recent' ? recentWorlds :
    favoriteWorlds;

  // For a given world, which friends are there?
  const friendsInWorld = (worldId: string) =>
    onlineFriends.filter(f => f.location?.startsWith(worldId));

  if (selectedWorld) {
    const friends = friendsInWorld(selectedWorld.id);
    return (
      <div className="max-w-4xl mx-auto animate-fade-in">
        <button onClick={() => setSelectedWorld(null)} className="btn-ghost flex items-center gap-1 mb-4 -ml-2">
          <ArrowLeft size={16} /> Back to Worlds
        </button>

        <div className="glass-panel-solid overflow-hidden">
          <div className="relative aspect-video max-h-72">
            <img src={selectedWorld.imageUrl} alt="" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-surface-900 to-transparent" />
          </div>

          <div className="p-6 -mt-16 relative">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-2xl font-bold">{selectedWorld.name}</h1>
                <p className="text-surface-400 text-sm">by {selectedWorld.authorName}</p>
              </div>
            </div>

            <div className="flex items-center gap-6 mt-4 flex-wrap">
              <StatPill icon={Users} value={selectedWorld.occupants} label="Online" />
              <StatPill icon={Heart} value={selectedWorld.favorites} label="Favorites" />
              <StatPill icon={Globe} value={selectedWorld.visits} label="Visits" />
              <StatPill icon={Users} value={selectedWorld.capacity} label="Capacity" />
            </div>

            {/* Friends in this world */}
            {friends.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-surface-300 mb-2 flex items-center gap-1.5">
                  <Users size={14} className="text-green-400" />
                  {friends.length} Friend{friends.length !== 1 ? 's' : ''} Here
                </h3>
                <div className="flex flex-wrap gap-2">
                  {friends.map(f => (
                    <div key={f.id} className="flex items-center gap-2 glass-panel px-3 py-1.5 rounded-full">
                      <img src={f.currentAvatarThumbnailImageUrl} alt="" className="w-5 h-5 rounded-full object-cover" />
                      <span className="text-xs font-medium">{f.displayName}</span>
                      <button
                        onClick={() => {
                          const parts = f.location.split(':');
                          if (parts[0] && parts[1]) setInstanceModal({ worldId: parts[0], instanceId: parts[1] });
                        }}
                        className="text-accent-400 hover:text-accent-300 text-xs"
                      >
                        Join
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedWorld.description && (
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-surface-300 mb-2">Description</h3>
                <p className="text-sm text-surface-400 whitespace-pre-wrap leading-relaxed">
                  {selectedWorld.description}
                </p>
              </div>
            )}

            {selectedWorld.tags?.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-semibold text-surface-300 mb-2">Tags</h3>
                <div className="flex flex-wrap gap-1.5">
                  {selectedWorld.tags
                    .filter(t => !t.startsWith('system_') && !t.startsWith('admin_'))
                    .map(tag => (
                      <span key={tag} className="badge bg-surface-800 text-surface-400">
                        {tag.replace('author_tag_', '')}
                      </span>
                    ))}
                </div>
              </div>
            )}

            {/* Instances */}
            {selectedWorld.instances && selectedWorld.instances.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-surface-300 mb-2">
                  Active Instances ({selectedWorld.instances.length})
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {selectedWorld.instances.map(([id, count]) => (
                    <button
                      key={id}
                      onClick={() => setInstanceModal({ worldId: selectedWorld.id, instanceId: id })}
                      className="glass-panel p-3 flex items-center justify-between hover:border-accent-500/30 transition-colors"
                    >
                      <span className="text-xs font-mono truncate">{id}</span>
                      <span className="text-xs text-surface-400 flex items-center gap-1 flex-shrink-0 ml-2">
                        <Users size={11} /> {count}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4 text-xs text-surface-600">
              Created: {new Date(selectedWorld.created_at).toLocaleDateString()} &middot;
              Updated: {new Date(selectedWorld.updated_at).toLocaleDateString()} &middot;
              v{selectedWorld.version}
            </div>
          </div>
        </div>

        {instanceModal && (
          <InstanceModal
            worldId={instanceModal.worldId}
            instanceId={instanceModal.instanceId}
            onClose={() => setInstanceModal(null)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-4 animate-fade-in">
      <h1 className="text-2xl font-bold">Worlds</h1>

      <div className="flex gap-2">
        <SearchInput
          value={searchInput}
          onChange={setSearchInput}
          placeholder="Search worlds..."
          className="flex-1 max-w-md"
        />
        <button onClick={handleSearch} className="btn-primary text-sm">Search</button>
      </div>

      <div className="flex gap-1 border-b border-surface-800 pb-px">
        {[
          { key: 'active' as WorldTab, icon: TrendingUp, label: 'Popular' },
          { key: 'recent' as WorldTab, icon: Clock, label: 'Recent' },
          { key: 'favorites' as WorldTab, icon: Star, label: 'Favorites' },
          ...(searchResults.length > 0 ? [{ key: 'search' as WorldTab, icon: Search, label: 'Search Results' }] : []),
        ].map(({ key, icon: Icon, label }) => (
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
      ) : worldList.length === 0 ? (
        <EmptyState icon={Globe} title={tab === 'search' ? 'No worlds found' : 'No worlds yet'}
          description={tab === 'search' ? 'Try different search terms' : 'Worlds will appear once loaded'} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {worldList.map(world => {
            const friendCount = friendsInWorld(world.id).length;
            return (
              <div key={world.id} className="relative">
                <WorldCard world={world} onClick={() => openWorldDetail(world)} />
                {friendCount > 0 && (
                  <div className="absolute top-2 left-2 bg-green-500/90 text-white text-xs px-1.5 py-0.5 rounded-full
                                  flex items-center gap-1 backdrop-blur-sm font-medium">
                    <Users size={10} /> {friendCount} friend{friendCount !== 1 ? 's' : ''}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatPill({ icon: Icon, value, label }: { icon: typeof Globe; value: number; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-sm text-surface-400">
      <Icon size={14} />
      <span className="font-semibold text-white">{value.toLocaleString()}</span>
      <span className="text-xs">{label}</span>
    </div>
  );
}
