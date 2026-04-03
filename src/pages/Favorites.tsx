import { useState, useEffect } from 'react';
import { Star, Globe, Users, Shirt, Trash2 } from 'lucide-react';
import { useFavoriteStore } from '../stores/favoriteStore';
import { useFriendStore } from '../stores/friendStore';
import { useWorldStore } from '../stores/worldStore';
import EmptyState from '../components/common/EmptyState';
import UserAvatar from '../components/common/UserAvatar';
import LoadingSpinner from '../components/common/LoadingSpinner';
import AvatarPreviewModal from '../components/AvatarPreviewModal';
import { getBestAvatarUrl } from '../utils/avatar';
import api from '../api/vrchat';
import type { VRCAvatar } from '../types/vrchat';

type FavTab = 'friends' | 'worlds' | 'avatars';

export default function FavoritesPage() {
  const [tab, setTab] = useState<FavTab>('friends');
  const [avatarData, setAvatarData] = useState<Record<string, VRCAvatar>>({});
  const [selectedAvatar, setSelectedAvatar] = useState<VRCAvatar | null>(null);
  const { worldFavorites, friendFavorites, avatarFavorites, isLoading, fetchAllFavorites, removeFavorite } = useFavoriteStore();
  const { getFriend } = useFriendStore();
  const { worldCache, getWorld } = useWorldStore();

  useEffect(() => {
    fetchAllFavorites();
  }, []);

  // Load avatar data when avatarFavorites change
  useEffect(() => {
    const loadAvatarData = async () => {
      const avatarMap: Record<string, VRCAvatar> = {};
      for (const fav of avatarFavorites) {
        if (!avatarData[fav.favoriteId]) {
          try {
            const avatar = await api.getAvatar(fav.favoriteId);
            avatarMap[fav.favoriteId] = avatar;
          } catch (error) {
            console.error(`Failed to load avatar ${fav.favoriteId}:`, error);
          }
        } else {
          avatarMap[fav.favoriteId] = avatarData[fav.favoriteId];
        }
      }
      setAvatarData(prev => ({ ...prev, ...avatarMap }));
    };

    if (avatarFavorites.length > 0) {
      loadAvatarData();
    }
  }, [avatarFavorites]);

  return (
    <div className="max-w-5xl mx-auto space-y-4 animate-fade-in">
      <h1 className="text-2xl font-bold">Favorites</h1>

      <div className="flex gap-1 border-b border-surface-800 pb-px">
        {([
          { key: 'friends' as FavTab, icon: Users, label: `Friends (${friendFavorites.length})` },
          { key: 'worlds' as FavTab, icon: Globe, label: `Worlds (${worldFavorites.length})` },
          { key: 'avatars' as FavTab, icon: Shirt, label: `Avatars (${avatarFavorites.length})` },
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
      ) : (
        <>
          {tab === 'friends' && (
            friendFavorites.length === 0 ? (
              <EmptyState icon={Users} title="No favorite friends" description="Add friends to your favorites from the Friends page" />
            ) : (
              <div className="space-y-1">
                {friendFavorites.map(fav => {
                  const friend = getFriend(fav.favoriteId);
                  return (
                    <div key={fav.id} className="glass-panel-solid p-3 flex items-center gap-3">
                      {friend ? (
                        <>
                          <UserAvatar src={getBestAvatarUrl(friend)} status={friend.status} size="md" />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{friend.displayName}</div>
                            <div className="text-xs text-surface-500">{friend.statusDescription || friend.status}</div>
                          </div>
                        </>
                      ) : (
                        <div className="flex-1 text-sm text-surface-400">User: {fav.favoriteId}</div>
                      )}
                      <div className="flex flex-wrap gap-1">
                        {fav.tags.map(t => (
                          <span key={t} className="badge bg-surface-800 text-surface-400 text-[10px]">{t}</span>
                        ))}
                      </div>
                      <button
                        onClick={() => removeFavorite(fav.favoriteId, 'friend')}
                        className="btn-ghost text-red-400 hover:text-red-300"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )
          )}

          {tab === 'worlds' && (
            worldFavorites.length === 0 ? (
              <EmptyState icon={Globe} title="No favorite worlds" description="Add worlds to your favorites from the Worlds page" />
            ) : (
              <div className="space-y-1">
                {worldFavorites.map(fav => {
                  const world = worldCache[fav.favoriteId];
                  return (
                    <div key={fav.id} className="glass-panel-solid p-3 flex items-center gap-3">
                      {world ? (
                        <>
                          <img src={world.thumbnailImageUrl} alt="" className="w-14 h-10 rounded object-cover bg-surface-800" />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{world.name}</div>
                            <div className="text-xs text-surface-500">by {world.authorName}</div>
                          </div>
                          <div className="flex items-center gap-1 text-xs text-surface-500">
                            <Users size={12} /> {world.occupants}
                          </div>
                        </>
                      ) : (
                        <div className="flex-1 text-sm text-surface-400">World: {fav.favoriteId}</div>
                      )}
                      <button
                        onClick={() => removeFavorite(fav.favoriteId, 'world')}
                        className="btn-ghost text-red-400 hover:text-red-300"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )
          )}

          {tab === 'avatars' && (
            avatarFavorites.length === 0 ? (
              <EmptyState icon={Shirt} title="No favorite avatars" description="Add avatars to your favorites" />
            ) : (
              <div className="space-y-1">
                {avatarFavorites.map(fav => {
                  const avatar = avatarData[fav.favoriteId];
                  return (
                    <div key={fav.id} className="glass-panel-solid p-3 flex items-center gap-3">
                      {avatar ? (
                        <>
                          <button
                            onClick={() => setSelectedAvatar(avatar)}
                            className="flex-shrink-0 rounded overflow-hidden group"
                          >
                            <img
                              src={avatar.thumbnailImageUrl || avatar.imageUrl}
                              alt={avatar.name}
                              className="w-14 h-14 object-cover group-hover:scale-105 transition-transform"
                            />
                          </button>
                          <div className="flex-1 min-w-0">
                            <button
                              onClick={() => setSelectedAvatar(avatar)}
                              className="text-sm font-medium truncate hover:text-blue-400 transition-colors text-left"
                            >
                              {avatar.name}
                            </button>
                            <div className="text-xs text-surface-500">by {avatar.authorName}</div>
                          </div>
                        </>
                      ) : (
                        <div className="flex-1 text-sm text-surface-400">Avatar: {fav.favoriteId}</div>
                      )}
                      <div className="flex flex-wrap gap-1">
                        {fav.tags.map(t => (
                          <span key={t} className="badge bg-surface-800 text-surface-400 text-[10px]">{t}</span>
                        ))}
                      </div>
                      <button
                        onClick={() => removeFavorite(fav.favoriteId, 'avatar')}
                        className="btn-ghost text-red-400 hover:text-red-300"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </>
      )}

      {selectedAvatar && (
        <AvatarPreviewModal
          avatar={selectedAvatar}
          onClose={() => setSelectedAvatar(null)}
        />
      )}
    </div>
  );
}
