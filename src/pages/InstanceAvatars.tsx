// Live avatar panel for the current instance.
// Sourced entirely from VRChat's log file via instanceAvatarsStore — no
// persistent storage. Closes the app, list goes away.
//
// Two responsibilities:
//   1. Show every player currently in the instance with the avatar they're
//      wearing, performance rank, and raw stats when available.
//   2. Where avtrdb has the avatar indexed, expose a "Wear" button so the
//      user can swap into it themselves.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  UserCheck, Copy, Check, ExternalLink, Shirt, Search, Triangle,
  Layers, Sparkles, Cpu, Volume2, AlertCircle, Loader2, RefreshCw, Info,
} from 'lucide-react';
import {
  useInstanceAvatarsStore,
  type PlayerAvatar,
  type PerfRank,
  type AvatarStats,
} from '../stores/instanceAvatarsStore';
import { useInstanceHistoryStore } from '../stores/instanceHistoryStore';
import { useVideoPlayerStore } from '../stores/videoPlayerStore';
import api from '../api/vrchat';

const RANK_COLORS: Record<PerfRank, string> = {
  Excellent: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30',
  Good:      'text-green-300   bg-green-500/15   border-green-500/30',
  Medium:    'text-yellow-300  bg-yellow-500/15  border-yellow-500/30',
  Poor:      'text-orange-300  bg-orange-500/15  border-orange-500/30',
  'Very Poor': 'text-rose-300  bg-rose-500/15    border-rose-500/30',
};

const RANK_ORDER: PerfRank[] = ['Excellent', 'Good', 'Medium', 'Poor', 'Very Poor'];

type SortMode = 'name' | 'rank' | 'recent';
type FilterMode = 'all' | PerfRank;

export default function InstanceAvatarsPage() {
  const byPlayer = useInstanceAvatarsStore(s => s.byPlayer);
  const instance = useInstanceAvatarsStore(s => s.instance);
  const lookup = useInstanceAvatarsStore(s => s.lookupOnVrcdb);
  const refreshFromLog = useInstanceAvatarsStore(s => s.refreshFromLog);
  const refreshing = useInstanceAvatarsStore(s => s.refreshing);
  const linesSeen = useInstanceAvatarsStore(s => s.linesSeen);
  const eventsParsed = useInstanceAvatarsStore(s => s.eventsParsed);
  const lastEventAt = useInstanceAvatarsStore(s => s.lastEventAt);
  const logPath = useInstanceAvatarsStore(s => s.logPath);
  const logError = useInstanceAvatarsStore(s => s.logError);
  const currentInstance = useInstanceHistoryStore(s => s.currentInstance);
  const tailingActive = useVideoPlayerStore(s => s.tailingActive);
  const tailingPath = useVideoPlayerStore(s => s.tailingPath);

  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortMode>('rank');
  const [filter, setFilter] = useState<FilterMode>('all');
  const [wearingId, setWearingId] = useState<string | null>(null);
  const [wornId, setWornId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<number | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  // Lazily look up every avatar we don't know about yet. The store keeps its
  // own in-flight set and result cache, so re-firing on render is cheap.
  useEffect(() => {
    for (const p of Object.values(byPlayer)) {
      if ((p.avatarId || p.avatarName) && p.vrcdbMatch === undefined && !p.vrcdbLooking) {
        lookup(p.playerName);
      }
    }
  }, [byPlayer, lookup]);

  const handleRefresh = useCallback(async () => {
    await refreshFromLog();
    setRefreshedAt(Date.now());
  }, [refreshFromLog]);

  // Opening the page with an empty list usually means the app started after
  // the instance did (so the live tail never saw those joins). Re-read the
  // log once rather than making the user find the Refresh button.
  useEffect(() => {
    if (Object.keys(useInstanceAvatarsStore.getState().byPlayer).length > 0) return;
    if (useInstanceAvatarsStore.getState().refreshing) return;
    if (!window.electronAPI?.logReadBacklog) return;
    void handleRefresh();
    // Mount-only on purpose — later refreshes are user-driven.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const players = useMemo(() => {
    let list = Object.values(byPlayer);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        p.playerName.toLowerCase().includes(q) ||
        p.avatarId?.toLowerCase().includes(q) ||
        p.avatarName?.toLowerCase().includes(q) ||
        p.vrcdbMatch?.name?.toLowerCase().includes(q),
      );
    }
    if (filter !== 'all') list = list.filter(p => p.rank === filter);

    if (sort === 'name') list = [...list].sort((a, b) => a.playerName.localeCompare(b.playerName));
    if (sort === 'recent') list = [...list].sort((a, b) =>
      (b.lastAvatarChangeAt ?? b.seenAt) - (a.lastAvatarChangeAt ?? a.seenAt));
    if (sort === 'rank') list = [...list].sort((a, b) => {
      const ai = a.rank ? RANK_ORDER.indexOf(a.rank) : 99;
      const bi = b.rank ? RANK_ORDER.indexOf(b.rank) : 99;
      return ai - bi;
    });
    return list;
  }, [byPlayer, search, sort, filter]);

  const summary = useMemo(() => {
    const counts: Record<PerfRank, number> = {
      Excellent: 0, Good: 0, Medium: 0, Poor: 0, 'Very Poor': 0,
    };
    let withRank = 0;
    for (const p of Object.values(byPlayer)) {
      if (p.rank) { counts[p.rank]++; withRank++; }
    }
    return { counts, withRank, total: Object.keys(byPlayer).length };
  }, [byPlayer]);

  const handleWear = async (player: PlayerAvatar) => {
    if (!player.avatarId || wearingId) return;
    setWearingId(player.avatarId);
    try {
      await api.selectAvatar(player.avatarId);
      setWornId(player.avatarId);
      setTimeout(() => setWornId(null), 3000);
    } catch (err) {
      console.error('[InstanceAvatars] wear failed:', err);
      alert(`Failed to wear avatar: ${err instanceof Error ? err.message : String(err)}`);
    }
    setWearingId(null);
  };

  const copy = (text: string, id: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const openAvtrdb = (avatarId: string) => {
    const url = `https://avtrdb.com/avatar/${avatarId}`;
    if (window.electronAPI?.openExternal) window.electronAPI.openExternal(url);
    else window.open(url, '_blank');
  };

  return (
    <div className="max-w-5xl mx-auto space-y-4 animate-fade-in">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <UserCheck size={22} className="text-accent-400" />
            Live Avatars
          </h1>
          <p className="text-sm text-surface-400 mt-0.5">
            {instance.worldName || currentInstance?.worldName
              ? `Players in ${instance.worldName || currentInstance?.worldName}`
              : 'Players in your current instance — populated live from VRChat\'s log'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {tailingActive ? (
            <span className="flex items-center gap-1 text-[11px] text-green-400 uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" /> Live
            </span>
          ) : (
            <span className="text-[11px] text-amber-400">Log not connected</span>
          )}
          <button
            onClick={() => setShowDiagnostics(v => !v)}
            className={`p-1.5 rounded transition-colors ${
              showDiagnostics ? 'text-accent-400 bg-accent-500/10' : 'text-surface-500 hover:text-surface-200 hover:bg-surface-800'
            }`}
            title="Log parser details"
          >
            <Info size={13} />
          </button>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="text-xs px-2.5 py-1.5 rounded-lg font-medium bg-accent-600/20 text-accent-300 hover:bg-accent-600/30 disabled:opacity-50 transition-colors flex items-center gap-1.5"
            title="Re-read VRChat's log and rebuild the list"
          >
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Reading log…' : 'Refresh'}
          </button>
        </div>
      </div>

      {showDiagnostics && (
        <div className="glass-panel-solid p-3 text-[11px] space-y-1 font-mono">
          <DiagRow label="Tail" value={tailingActive ? 'connected' : 'not connected'} bad={!tailingActive} />
          <DiagRow label="Log file" value={logPath ?? tailingPath ?? '— none found —'} bad={!logPath && !tailingPath} />
          <DiagRow label="Lines parsed" value={linesSeen.toLocaleString()} />
          <DiagRow label="Events matched" value={eventsParsed.toLocaleString()} bad={linesSeen > 0 && eventsParsed === 0} />
          <DiagRow label="Last event" value={lastEventAt ? new Date(lastEventAt).toLocaleTimeString() : '—'} />
          <DiagRow label="Players tracked" value={String(Object.keys(byPlayer).length)} />
          <DiagRow
            label="Instance"
            value={instance.worldId ? `${instance.worldId}${instance.instanceId ? `:${instance.instanceId}` : ''}` : '—'}
          />
          {refreshedAt && <DiagRow label="Refreshed" value={new Date(refreshedAt).toLocaleTimeString()} />}
          {logError && <DiagRow label="Error" value={logError} bad />}
        </div>
      )}

      {/* Filters */}
      <div className="glass-panel-solid p-3 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter players, avatar names, or IDs..."
            className="w-full bg-surface-800 text-sm pl-8 pr-3 py-1.5 rounded-lg border border-surface-700/40 focus:outline-none focus:border-accent-500/50 placeholder-surface-600"
          />
        </div>
        <div className="flex gap-1">
          {(['rank', 'name', 'recent'] as const).map(m => (
            <button
              key={m}
              onClick={() => setSort(m)}
              className={`px-2.5 py-1 text-xs rounded font-medium capitalize transition-colors ${
                sort === m ? 'bg-accent-500/20 text-accent-300' : 'text-surface-500 hover:text-surface-300'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} label="All" count={summary.total} />
          {RANK_ORDER.map(r => (
            <FilterChip
              key={r}
              active={filter === r}
              onClick={() => setFilter(filter === r ? 'all' : r)}
              label={r}
              count={summary.counts[r]}
              colorClass={RANK_COLORS[r]}
            />
          ))}
        </div>
      </div>

      {/* Empty states */}
      {!tailingActive ? (
        <div className="glass-panel-solid p-8 text-center text-sm text-surface-400">
          <AlertCircle size={28} className="mx-auto mb-2 text-amber-400 opacity-60" />
          <p>VRChat's log file couldn't be found.</p>
          <p className="text-xs text-surface-500 mt-1">
            Launch VRChat at least once so it writes a log — this page picks it up
            automatically, no restart needed.
          </p>
          {logError && <p className="text-[11px] text-surface-600 mt-2 font-mono break-all">{logError}</p>}
          <button onClick={handleRefresh} disabled={refreshing} className="btn-secondary text-xs mt-3 inline-flex items-center gap-1.5">
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} /> Look again
          </button>
        </div>
      ) : players.length === 0 ? (
        <div className="glass-panel-solid p-8 text-center text-sm text-surface-400">
          <UserCheck size={28} className="mx-auto mb-2 opacity-30" />
          <p>{Object.keys(byPlayer).length === 0
            ? 'No players in the current instance yet.'
            : 'No players match the current filter.'}</p>
          <p className="text-xs text-surface-500 mt-1">
            Join a world in VRChat and players will appear here as they connect.
          </p>
          {Object.keys(byPlayer).length === 0 && (
            <button onClick={handleRefresh} disabled={refreshing} className="btn-secondary text-xs mt-3 inline-flex items-center gap-1.5">
              <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} /> Re-read the log
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-1.5">
          {players.map(p => (
            <PlayerRow
              key={p.playerName}
              player={p}
              wearingId={wearingId}
              wornId={wornId}
              copiedId={copiedId}
              onWear={() => handleWear(p)}
              onCopy={(text, id) => copy(text, id)}
              onOpenAvtrdb={() => p.avatarId && openAvtrdb(p.avatarId)}
            />
          ))}
        </div>
      )}

      {/* Footer note */}
      <p className="text-[10px] text-surface-600 text-center">
        Ephemeral · no data is saved · cleared when you switch instances or close the app ·
        Refresh re-reads VRChat's log from disk
      </p>
    </div>
  );
}

function DiagRow({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <div className="flex gap-2">
      <span className="text-surface-600 w-28 flex-shrink-0">{label}</span>
      <span className={`break-all ${bad ? 'text-amber-400' : 'text-surface-300'}`}>{value}</span>
    </div>
  );
}

function FilterChip({ active, onClick, label, count, colorClass }: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  colorClass?: string;
}) {
  if (count === 0 && !active) return null;
  return (
    <button
      onClick={onClick}
      className={`px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider rounded-full border transition-colors ${
        active
          ? colorClass ?? 'bg-accent-500/20 text-accent-300 border-accent-500/40'
          : 'text-surface-500 border-surface-700 hover:border-surface-600'
      }`}
    >
      {label} <span className="opacity-60 ml-0.5">{count}</span>
    </button>
  );
}

function PlayerRow({ player, wearingId, wornId, copiedId, onWear, onCopy, onOpenAvtrdb }: {
  player: PlayerAvatar;
  wearingId: string | null;
  wornId: string | null;
  copiedId: string | null;
  onWear: () => void;
  onCopy: (text: string, id: string) => void;
  onOpenAvtrdb: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const match = player.vrcdbMatch;
  const isWearing = wearingId === player.avatarId;
  const isWorn = wornId === player.avatarId;
  // An id from the log is enough to wear — an avtrdb hit is a bonus, not a
  // requirement. Ids we only *guessed* from a name search are still offered,
  // but flagged in the tooltip.
  const canWear = !!player.avatarId;

  return (
    <div className="glass-panel-solid p-3 hover:bg-surface-800/30 transition-colors">
      <div className="flex items-start gap-3">
        {/* Thumbnail (from avtrdb match if available) */}
        <div className="flex-shrink-0">
          {match?.thumbnailImageUrl || match?.imageUrl ? (
            <img
              src={match.thumbnailImageUrl || match.imageUrl}
              alt=""
              className="w-12 h-12 rounded-lg object-cover bg-surface-800"
              loading="lazy"
            />
          ) : (
            <div className="w-12 h-12 rounded-lg bg-surface-800 flex items-center justify-center">
              <Shirt size={16} className="text-surface-600" />
            </div>
          )}
        </div>

        {/* Main info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold truncate">{player.playerName}</span>
            {player.isLocal && (
              <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-accent-500/15 text-accent-300 border border-accent-500/30">
                You
              </span>
            )}
            {player.rank && <RankChip rank={player.rank} />}
            {player.vrcdbLooking && <Loader2 size={11} className="text-surface-500 animate-spin" />}
          </div>

          <div className="text-[11px] text-surface-500 mt-0.5 flex items-center gap-2 flex-wrap">
            {player.avatarName || match ? (
              <>
                <span className="text-surface-300 font-medium">{player.avatarName ?? match!.name}</span>
                {match?.authorName && (
                  <span className="text-surface-600">by {match.authorName}</span>
                )}
              </>
            ) : (
              <span className="text-surface-600 italic">avatar name unknown</span>
            )}
            {player.idFromNameSearch && (
              <span className="text-[9px] uppercase tracking-wider text-surface-600 border border-surface-700 rounded px-1" title="Avatar id matched by name on avtrdb — it may be a different upload with the same name">
                name match
              </span>
            )}
            {player.avatarId && (
              <>
                <span className="text-surface-700">·</span>
                <button
                  onClick={() => onCopy(player.avatarId!, `id-${player.avatarId}`)}
                  className="font-mono text-[10px] text-surface-500 hover:text-surface-300 inline-flex items-center gap-1"
                  title="Copy avatar ID"
                >
                  {player.avatarId.slice(0, 12)}…
                  {copiedId === `id-${player.avatarId}` ? <Check size={9} className="text-green-400" /> : <Copy size={9} />}
                </button>
              </>
            )}
          </div>

          {player.stats && Object.keys(player.stats).length > 0 && (
            <StatStrip stats={player.stats} expanded={expanded} onToggle={() => setExpanded(!expanded)} />
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {player.avatarId && (
            <button
              onClick={onOpenAvtrdb}
              className="p-1.5 rounded text-surface-500 hover:text-surface-200 hover:bg-surface-800 transition-colors"
              title="Open on avtrdb.com"
            >
              <ExternalLink size={12} />
            </button>
          )}
          {canWear && (
            <button
              onClick={onWear}
              disabled={isWearing}
              className={`text-[11px] px-2.5 py-1 rounded font-medium transition-colors flex items-center gap-1 ${
                isWorn
                  ? 'bg-green-500/20 text-green-400'
                  : 'bg-accent-600/20 text-accent-400 hover:bg-accent-600/30'
              }`}
              title={player.idFromNameSearch
                ? 'Switch to this avatar (id matched by name — may be a different upload)'
                : 'Switch to this avatar'}
            >
              {isWorn ? <><Check size={11} /> Worn</> : isWearing ? '…' : 'Wear'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function RankChip({ rank }: { rank: PerfRank }) {
  return (
    <span className={`inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${RANK_COLORS[rank]}`}>
      {rank}
    </span>
  );
}

function StatStrip({ stats, expanded, onToggle }: {
  stats: AvatarStats;
  expanded: boolean;
  onToggle: () => void;
}) {
  const primary: Array<{ key: keyof AvatarStats; icon: typeof Triangle; label: string; format?: (n: number) => string }> = [
    { key: 'triangles', icon: Triangle, label: 'tris' },
    { key: 'materials', icon: Layers, label: 'mats' },
    { key: 'skinnedMeshes', icon: Sparkles, label: 'sk' },
    { key: 'drawCalls', icon: Cpu, label: 'draws' },
  ];
  const secondary: Array<{ key: keyof AvatarStats; label: string }> = [
    { key: 'meshes', label: 'Meshes' },
    { key: 'physBones', label: 'PhysBones' },
    { key: 'dynamicBones', label: 'Dyn bones' },
    { key: 'particles', label: 'Particles' },
    { key: 'audioSources', label: 'Audio src' },
    { key: 'bones', label: 'Bones' },
    { key: 'lights', label: 'Lights' },
    { key: 'animators', label: 'Animators' },
  ];

  const hasSecondary = secondary.some(s => stats[s.key] != null);

  return (
    <div className="mt-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        {primary.map(({ key, icon: Icon, label }) =>
          stats[key] != null ? (
            <span key={key} className="text-[10px] text-surface-400 inline-flex items-center gap-1">
              <Icon size={9} className="text-surface-500" />
              {stats[key]!.toLocaleString()} {label}
            </span>
          ) : null,
        )}
        {hasSecondary && (
          <button
            onClick={onToggle}
            className="text-[10px] text-surface-500 hover:text-accent-400 underline"
          >
            {expanded ? 'Less' : 'More'}
          </button>
        )}
      </div>
      {expanded && hasSecondary && (
        <div className="mt-1.5 grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-0.5 text-[10px] text-surface-400">
          {secondary.map(({ key, label }) =>
            stats[key] != null ? (
              <div key={key} className="flex justify-between border-b border-surface-800/40 py-0.5">
                <span className="text-surface-500">{label}</span>
                <span className="tabular-nums">{stats[key]!.toLocaleString()}</span>
              </div>
            ) : null,
          )}
          {stats.audioSources != null && (
            <div className="flex items-center gap-1 text-surface-500 text-[10px]">
              <Volume2 size={9} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
