import { useState, useEffect } from 'react';
import { UsersRound, ArrowLeft, Shield, Hash, Calendar, AlertCircle, RotateCw } from 'lucide-react';
import api from '../api/vrchat';
import { useAuthStore } from '../stores/authStore';
import EmptyState from '../components/common/EmptyState';
import LoadingSpinner from '../components/common/LoadingSpinner';
import type { VRCGroup } from '../types/vrchat';

export default function GroupsPage() {
  const { user } = useAuthStore();
  const [groups, setGroups] = useState<VRCGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedGroup, setSelectedGroup] = useState<VRCGroup | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadGroups();
  }, []);

  const loadGroups = async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (!user?.id) {
        setError('User not authenticated');
        setIsLoading(false);
        return;
      }
      const data = await api.getUserGroups(user.id);
      setGroups(Array.isArray(data) ? data : []);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load groups';
      setError(errorMessage);
      console.error('Failed to load groups:', err);
    }
    setIsLoading(false);
  };

  if (selectedGroup) {
    return (
      <div className="max-w-3xl mx-auto animate-fade-in">
        <button onClick={() => setSelectedGroup(null)} className="btn-ghost flex items-center gap-1 mb-4 -ml-2">
          <ArrowLeft size={16} /> Back to Groups
        </button>

        <div className="glass-panel-solid overflow-hidden">
          {selectedGroup.bannerUrl && (
            <div className="h-40 overflow-hidden">
              <img src={selectedGroup.bannerUrl} alt="" className="w-full h-full object-cover" />
            </div>
          )}
          <div className="p-6">
            <div className="flex items-start gap-4">
              {selectedGroup.iconUrl && (
                <img
                  src={selectedGroup.iconUrl}
                  alt=""
                  className="w-16 h-16 rounded-xl object-cover bg-surface-800 flex-shrink-0"
                />
              )}
              <div>
                <h1 className="text-xl font-bold">{selectedGroup.name}</h1>
                <div className="flex items-center gap-2 mt-1 text-sm text-surface-400">
                  <Hash size={14} />
                  {selectedGroup.shortCode}.{selectedGroup.discriminator}
                  <span className="mx-1">&middot;</span>
                  <UsersRound size={14} />
                  {selectedGroup.memberCount} members
                </div>
              </div>
            </div>

            {selectedGroup.description && (
              <div className="mt-4">
                <h3 className="text-sm font-semibold text-surface-300 mb-2">Description</h3>
                <p className="text-sm text-surface-400 whitespace-pre-wrap">{selectedGroup.description}</p>
              </div>
            )}

            {selectedGroup.rules && (
              <div className="mt-4">
                <h3 className="text-sm font-semibold text-surface-300 mb-2">Rules</h3>
                <p className="text-sm text-surface-400 whitespace-pre-wrap">{selectedGroup.rules}</p>
              </div>
            )}

            {selectedGroup.tags && selectedGroup.tags.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-semibold text-surface-300 mb-2">Tags</h3>
                <div className="flex flex-wrap gap-1.5">
                  {selectedGroup.tags.map(tag => (
                    <span key={tag} className="badge bg-surface-800 text-surface-400">{tag}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4 animate-fade-in">
      <h1 className="text-2xl font-bold">Groups</h1>

      {error && (
        <div className="glass-panel-solid border border-rose-500/30 bg-rose-500/10 p-4 rounded-lg flex items-start gap-3">
          <AlertCircle size={20} className="text-rose-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-rose-400">Error loading groups</p>
            <p className="text-xs text-rose-400/80 mt-1">{error}</p>
          </div>
          <button
            onClick={loadGroups}
            disabled={isLoading}
            className="btn-secondary text-xs flex items-center gap-1 flex-shrink-0"
          >
            <RotateCw size={14} /> Retry
          </button>
        </div>
      )}

      {isLoading ? (
        <LoadingSpinner className="py-16" />
      ) : groups.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title="No groups"
          description="Groups you belong to will appear here"
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {groups.map(group => (
            <button
              key={group.id}
              onClick={() => setSelectedGroup(group)}
              className="glass-panel-solid overflow-hidden card-hover text-left"
            >
              {group.bannerUrl && (
                <div className="h-24 overflow-hidden">
                  <img src={group.bannerUrl} alt="" className="w-full h-full object-cover" />
                </div>
              )}
              <div className="p-4 flex items-start gap-3">
                {group.iconUrl ? (
                  <img src={group.iconUrl} alt="" className="w-12 h-12 rounded-lg object-cover bg-surface-800 flex-shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-surface-800 flex items-center justify-center flex-shrink-0">
                    <UsersRound size={20} className="text-surface-500" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-sm truncate">{group.name}</h3>
                  <div className="text-xs text-surface-500 mt-0.5 flex items-center gap-2">
                    <span className="flex items-center gap-1">
                      <Hash size={11} /> {group.shortCode}.{group.discriminator}
                    </span>
                    <span className="flex items-center gap-1">
                      <UsersRound size={11} /> {group.memberCount}
                    </span>
                  </div>
                  {group.description && (
                    <p className="text-xs text-surface-500 mt-1.5 line-clamp-2">
                      {group.description}
                    </p>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
