// Portals seen in the log, and the ability to walk back through one after
// it has closed.
//
// A dropped portal lives for about a minute in game. The instance it points
// at doesn't expire with it — so once we've captured `worldId:instanceId`
// (tags and all) we can invite ourselves straight back to it whenever. That
// invite lands in VRChat as a normal notification you click to join, which
// is the same mechanism the "rejoin" button on the visits list uses.

import { useEffect, useMemo, useState } from 'react';
import {
  Compass, Loader2, Check, AlertCircle, ExternalLink, Copy, LogIn,
  Trash2, Clock, User as UserIcon,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useGrabberStore, type GrabbedItem } from '../stores/grabberStore';
import api from '../api/vrchat';

const TYPE_COLORS: Record<string, string> = {
  public:   'bg-green-500/15 text-green-400 border-green-500/30',
  friends:  'bg-blue-500/15 text-blue-400 border-blue-500/30',
  'friends+': 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
  group:    'bg-purple-500/15 text-purple-400 border-purple-500/30',
  private:  'bg-surface-700 text-surface-400 border-surface-600',
};

// World lookups are shared across every portal pointing at the same world.
const worldCache = new Map<string, { name: string; image: string }>();

export default function PortalsPanel({ portals }: { portals: GrabbedItem[] }) {
  const markResolved = useGrabberStore(s => s.markResolved);
  const remove = useGrabberStore(s => s.remove);
  const [joining, setJoining] = useState<string | null>(null);
  const [joined, setJoined] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState<string | null>(null);

  // Resolve world names so the list reads like places rather than IDs.
  useEffect(() => {
    let cancelled = false;
    const pending = portals.filter(p => p.targetWorldId && !p.targetWorldName && !p.resolved);

    (async () => {
      for (const portal of pending) {
        if (cancelled) return;
        const worldId = portal.targetWorldId!;
        const cached = worldCache.get(worldId);
        if (cached) {
          markResolved(portal.id, { targetWorldName: cached.name, targetWorldImage: cached.image });
          continue;
        }
        try {
          const world = await api.getWorld(worldId);
          if (cancelled) return;
          const entry = { name: world?.name ?? worldId, image: world?.thumbnailImageUrl ?? '' };
          worldCache.set(worldId, entry);
          markResolved(portal.id, { targetWorldName: entry.name, targetWorldImage: entry.image });
        } catch {
          // Keep the name empty rather than falling back to the raw ID —
          // a 36-character UUID as a headline reads like a bug.
          if (!cancelled) markResolved(portal.id, {});
        }
        await new Promise(r => setTimeout(r, 250));
      }
    })();

    return () => { cancelled = true; };
  }, [portals, markResolved]);

  const sorted = useMemo(
    () => [...portals].sort((a, b) => b.lastSeenAt - a.lastSeenAt),
    [portals],
  );

  const join = async (portal: GrabbedItem) => {
    if (!portal.targetWorldId || joining) return;
    setJoining(portal.id);
    setErrors(prev => ({ ...prev, [portal.id]: '' }));
    try {
      // The tail carries ~group()/~private() etc. Without it a closed portal
      // into a group instance can't be re-entered.
      await api.selfInvite(portal.targetWorldId, portal.targetInstanceTail || portal.targetInstanceId || '');
      setJoined(portal.id);
      setTimeout(() => setJoined(null), 5000);
    } catch (err) {
      setErrors(prev => ({
        ...prev,
        [portal.id]: err instanceof Error ? err.message : String(err),
      }));
    }
    setJoining(null);
  };

  const copy = (text: string, id: string) => {
    navigator.clipboard?.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  };

  const openExternal = (url: string) => {
    if (window.electronAPI?.openExternal) window.electronAPI.openExternal(url);
    else window.open(url, '_blank');
  };

  if (sorted.length === 0) {
    return (
      <div className="glass-panel-solid p-10 text-center text-sm text-surface-400">
        <Compass size={30} className="mx-auto mb-2 opacity-30" />
        <p>No portals logged yet.</p>
        <p className="text-xs text-surface-500 mt-1">
          When someone drops a portal near you it gets recorded here — including
          where it went, so you can still get there after it closes.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-surface-500">
        Portals close after about a minute in game, but the instance behind one stays
        open. "Join" sends you an invite to that exact instance — check your VRChat
        notifications and click it to travel.
      </p>

      {sorted.map(portal => {
        const err = errors[portal.id];
        const type = portal.targetInstanceType ?? 'public';
        return (
          <div key={portal.id} className="glass-panel-solid p-3">
            <div className="flex items-start gap-3">
              <div className="w-16 h-16 rounded-lg overflow-hidden bg-surface-800 flex-shrink-0 flex items-center justify-center">
                {portal.targetWorldImage ? (
                  <img src={portal.targetWorldImage} alt="" className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <Compass size={18} className="text-surface-600" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold truncate">
                    {portal.targetWorldName
                      ? portal.targetWorldName
                      : portal.resolved
                        ? <span className="text-surface-400">Unknown world</span>
                        : (
                          <span className="text-surface-500 inline-flex items-center gap-1.5 font-normal">
                            <Loader2 size={11} className="animate-spin" /> resolving world…
                          </span>
                        )}
                  </span>
                  <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${TYPE_COLORS[type] ?? TYPE_COLORS.public}`}>
                    {type}
                  </span>
                </div>

                <div className="text-[11px] text-surface-500 mt-1 flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1">
                    <Clock size={10} /> {formatDistanceToNow(portal.lastSeenAt, { addSuffix: true })}
                  </span>
                  {portal.droppedBy && (
                    <span className="inline-flex items-center gap-1">
                      <UserIcon size={10} /> {portal.droppedBy}
                    </span>
                  )}
                  {portal.worldName && (
                    <span className="text-surface-600">seen in {portal.worldName}</span>
                  )}
                  {portal.seenCount > 1 && <span className="text-surface-600">· {portal.seenCount}×</span>}
                </div>

                <button
                  onClick={() => copy(`${portal.targetWorldId}:${portal.targetInstanceTail ?? portal.targetInstanceId}`, portal.id)}
                  className="font-mono text-[10px] text-surface-600 hover:text-surface-300 mt-1 inline-flex items-center gap-1 break-all text-left"
                  title="Copy the full instance ID"
                >
                  {portal.targetWorldId?.slice(0, 14)}…:{portal.targetInstanceTail ?? portal.targetInstanceId}
                  {copied === portal.id ? <Check size={9} className="text-green-400" /> : <Copy size={9} />}
                </button>

                {err && (
                  <p className="text-[11px] text-rose-400 mt-1.5 flex items-start gap-1.5">
                    <AlertCircle size={11} className="mt-0.5 flex-shrink-0" />
                    <span>{err}</span>
                  </p>
                )}
              </div>

              <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                <button
                  onClick={() => join(portal)}
                  disabled={joining === portal.id || !portal.targetWorldId}
                  className={`text-[11px] px-2.5 py-1.5 rounded-lg font-medium transition-colors inline-flex items-center gap-1.5 ${
                    joined === portal.id
                      ? 'bg-green-500/20 text-green-300'
                      : 'bg-accent-600/25 text-accent-200 hover:bg-accent-600/40'
                  } disabled:opacity-50`}
                  title="Invite yourself back to this instance"
                >
                  {joining === portal.id ? <Loader2 size={11} className="animate-spin" />
                    : joined === portal.id ? <Check size={11} />
                    : <LogIn size={11} />}
                  {joined === portal.id ? 'Invite sent' : 'Join'}
                </button>

                <div className="flex items-center gap-1">
                  {portal.targetWorldId && (
                    <button
                      onClick={() => openExternal(`https://vrchat.com/home/world/${portal.targetWorldId}`)}
                      className="p-1.5 rounded text-surface-500 hover:text-surface-200 hover:bg-surface-800 transition-colors"
                      title="Open the world on vrchat.com"
                    >
                      <ExternalLink size={11} />
                    </button>
                  )}
                  <button
                    onClick={() => remove(portal.id)}
                    className="p-1.5 rounded text-surface-500 hover:text-rose-400 hover:bg-surface-800 transition-colors"
                    title="Forget this portal"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
