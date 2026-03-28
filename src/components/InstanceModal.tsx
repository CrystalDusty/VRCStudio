import { useState, useEffect } from 'react';
import { X, Users, Globe, MapPin, Send, ExternalLink } from 'lucide-react';
import api from '../api/vrchat';
import LoadingSpinner from './common/LoadingSpinner';
import type { VRCInstance, VRCWorld } from '../types/vrchat';

interface Props {
  worldId: string;
  instanceId: string;
  onClose: () => void;
}

export default function InstanceModal({ worldId, instanceId, onClose }: Props) {
  const [instance, setInstance] = useState<VRCInstance | null>(null);
  const [world, setWorld] = useState<VRCWorld | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [invited, setInvited] = useState(false);

  useEffect(() => {
    loadData();
  }, [worldId, instanceId]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [inst, w] = await Promise.allSettled([
        api.getInstance(worldId, instanceId),
        api.getWorld(worldId),
      ]);
      if (inst.status === 'fulfilled') setInstance(inst.value);
      if (w.status === 'fulfilled') setWorld(w.value);
    } catch {}
    setIsLoading(false);
  };

  const handleSelfInvite = async () => {
    setInviting(true);
    try {
      await api.selfInvite(worldId, instanceId);
      setInvited(true);
    } catch {}
    setInviting(false);
  };

  const typeLabel = instance?.type === 'public' ? 'Public'
    : instance?.type === 'friends' ? 'Friends'
    : instance?.type === 'hidden' ? 'Friends+'
    : instance?.type === 'private' ? 'Invite'
    : instance?.type === 'group' ? 'Group'
    : 'Unknown';

  const regionLabel = instance?.region === 'us' ? 'US West'
    : instance?.region === 'use' ? 'US East'
    : instance?.region === 'eu' ? 'Europe'
    : instance?.region === 'jp' ? 'Japan'
    : instance?.photonRegion || 'Unknown';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="glass-panel w-full max-w-lg mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
        {isLoading ? (
          <div className="p-8">
            <LoadingSpinner />
          </div>
        ) : (
          <>
            {/* World image header */}
            {world && (
              <div className="relative h-40 overflow-hidden">
                <img src={world.imageUrl} alt="" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-surface-900/90 to-transparent" />
                <div className="absolute bottom-3 left-4 right-4">
                  <h2 className="text-lg font-bold">{world.name}</h2>
                  <p className="text-xs text-surface-300">by {world.authorName}</p>
                </div>
              </div>
            )}

            <div className="p-4 space-y-4">
              {/* Instance info */}
              <div className="grid grid-cols-3 gap-3">
                <div className="glass-panel p-2.5 text-center">
                  <div className="text-xs text-surface-500">Type</div>
                  <div className="text-sm font-semibold mt-0.5">{typeLabel}</div>
                </div>
                <div className="glass-panel p-2.5 text-center">
                  <div className="text-xs text-surface-500">Region</div>
                  <div className="text-sm font-semibold mt-0.5">{regionLabel}</div>
                </div>
                <div className="glass-panel p-2.5 text-center">
                  <div className="text-xs text-surface-500">Players</div>
                  <div className="text-sm font-semibold mt-0.5">
                    {instance?.n_users ?? '?'} / {instance?.capacity ?? world?.capacity ?? '?'}
                  </div>
                </div>
              </div>

              {/* Platform breakdown */}
              {instance?.platforms && Object.keys(instance.platforms).length > 0 && (
                <div>
                  <h4 className="text-xs text-surface-500 mb-1.5">Platform Breakdown</h4>
                  <div className="flex gap-2">
                    {Object.entries(instance.platforms).map(([platform, count]) => (
                      <span key={platform} className="badge bg-surface-800 text-surface-400">
                        {platform}: {count}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Instance ID */}
              <div>
                <h4 className="text-xs text-surface-500 mb-1">Instance ID</h4>
                <div className="text-xs font-mono text-surface-400 bg-surface-800 rounded px-2 py-1.5 break-all">
                  {worldId}:{instanceId}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={handleSelfInvite}
                  disabled={inviting || invited}
                  className="btn-primary flex-1 text-sm flex items-center justify-center gap-1.5"
                >
                  {invited ? (
                    <>Invite Sent!</>
                  ) : inviting ? (
                    <>Sending...</>
                  ) : (
                    <><Send size={14} /> Join Instance</>
                  )}
                </button>
                <button onClick={onClose} className="btn-secondary text-sm">
                  Close
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
