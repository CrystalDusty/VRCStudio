import { useMemo, useState } from 'react';
import {
  BarChart3, Users, Clock, Globe, TrendingUp, Award,
  UserCheck, ChevronDown, ChevronUp, Calendar,
} from 'lucide-react';
import { format, formatDistanceToNow, differenceInHours, differenceInDays } from 'date-fns';
import { useFriendStore } from '../stores/friendStore';
import { useFeedStore } from '../stores/feedStore';
import { useInstanceHistoryStore } from '../stores/instanceHistoryStore';
import UserAvatar from '../components/common/UserAvatar';
import FriendEventDetail from '../components/FriendEventDetail';
import EmptyState from '../components/common/EmptyState';
import { getBestAvatarUrl } from '../utils/avatar';
import type { VRCUser } from '../types/vrchat';

interface FriendStat {
  user: VRCUser;
  eventCount: number;
  onlineEvents: number;
  locationEvents: number;
  lastSeen: number;
  sharedWorlds: number;
}

export default function FriendAnalyticsPage() {
  const { onlineFriends, offlineFriends } = useFriendStore();
  const { events } = useFeedStore();
  const { history } = useInstanceHistoryStore();
  const [expandedSection, setExpandedSection] = useState<string | null>('top-friends');
  const [sortBy, setSortBy] = useState<'events' | 'online' | 'recent'>('events');
  const [selectedFriendId, setSelectedFriendId] = useState<string | null>(null);

  const allFriends = useMemo(() => [...onlineFriends, ...offlineFriends], [onlineFriends, offlineFriends]);
  const friendMap = useMemo(() => {
    const map = new Map<string, VRCUser>();
    allFriends.forEach(f => map.set(f.id, f));
    return map;
  }, [allFriends]);

  // Compute per-friend stats
  const friendStats = useMemo(() => {
    const stats: Record<string, FriendStat> = {};

    for (const evt of events) {
      if (!evt.userId) continue;
      const user = friendMap.get(evt.userId);
      if (!user) continue;

      if (!stats[evt.userId]) {
        stats[evt.userId] = {
          user,
          eventCount: 0,
          onlineEvents: 0,
          locationEvents: 0,
          lastSeen: 0,
          sharedWorlds: 0,
        };
      }

      const s = stats[evt.userId];
      s.eventCount++;
      if (evt.type === 'friend_online') s.onlineEvents++;
      if (evt.type === 'friend_location') s.locationEvents++;
      s.lastSeen = Math.max(s.lastSeen, evt.timestamp);
    }

    // Shared world count from instance history
    const myWorlds = new Set(history.map(h => h.worldId));
    for (const friend of allFriends) {
      if (friend.location && friend.location !== 'offline' && friend.location !== 'private') {
        const worldId = friend.location.split(':')[0];
        if (myWorlds.has(worldId)) {
          if (!stats[friend.id]) {
            stats[friend.id] = {
              user: friend,
              eventCount: 0,
              onlineEvents: 0,
              locationEvents: 0,
              lastSeen: 0,
              sharedWorlds: 0,
            };
          }
          stats[friend.id].sharedWorlds++;
        }
      }
    }

    return Object.values(stats);
  }, [events, friendMap, allFriends, history]);

  const sortedStats = useMemo(() => {
    const sorted = [...friendStats];
    if (sortBy === 'events') sorted.sort((a, b) => b.eventCount - a.eventCount);
    else if (sortBy === 'online') sorted.sort((a, b) => b.onlineEvents - a.onlineEvents);
    else sorted.sort((a, b) => b.lastSeen - a.lastSeen);
    return sorted;
  }, [friendStats, sortBy]);

  // Overall stats
  const overallStats = useMemo(() => {
    const totalOnline = onlineFriends.length;
    const totalFriends = allFriends.length;
    const onlineRate = totalFriends > 0 ? ((totalOnline / totalFriends) * 100).toFixed(1) : '0';

    // Status distribution
    const statusCounts: Record<string, number> = {};
    for (const f of onlineFriends) {
      statusCounts[f.status] = (statusCounts[f.status] || 0) + 1;
    }

    // Platform distribution from last_platform
    const platformCounts: Record<string, number> = {};
    for (const f of allFriends) {
      const platform = f.last_platform || 'unknown';
      platformCounts[platform] = (platformCounts[platform] || 0) + 1;
    }

    // Friend join date distribution (account age)
    const joinYears: Record<string, number> = {};
    for (const f of allFriends) {
      if (f.date_joined) {
        const year = f.date_joined.slice(0, 4);
        joinYears[year] = (joinYears[year] || 0) + 1;
      }
    }

    // Most active time (from events)
    const hourCounts = new Array(24).fill(0);
    for (const evt of events) {
      hourCounts[new Date(evt.timestamp).getHours()]++;
    }
    const peakHour = hourCounts.indexOf(Math.max(...hourCounts));

    return { totalOnline, totalFriends, onlineRate, statusCounts, platformCounts, joinYears, peakHour };
  }, [onlineFriends, offlineFriends, allFriends, events]);

  // Location clustering — which worlds have the most friends right now
  const worldClusters = useMemo(() => {
    const clusters: Record<string, { worldId: string; friends: VRCUser[] }> = {};
    for (const f of onlineFriends) {
      if (!f.location || f.location === 'private' || f.location === 'offline') continue;
      const worldId = f.location.split(':')[0];
      if (!clusters[worldId]) clusters[worldId] = { worldId, friends: [] };
      clusters[worldId].friends.push(f);
    }
    return Object.values(clusters)
      .filter(c => c.friends.length >= 2)
      .sort((a, b) => b.friends.length - a.friends.length);
  }, [onlineFriends]);

  const toggle = (section: string) => {
    setExpandedSection(prev => prev === section ? null : section);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BarChart3 size={24} className="text-accent-400" /> Friend Analytics
        </h1>
        <p className="text-sm text-surface-400 mt-0.5">
          Insights about your VRChat social circle
        </p>
      </div>

      {/* Overview cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="stat-card">
          <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center text-green-400 flex-shrink-0">
            <Users size={18} />
          </div>
          <div>
            <div className="text-2xl font-bold text-surface-100 tabular-nums">{overallStats.totalFriends}</div>
            <div className="text-xs text-surface-500">Total Friends</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400 flex-shrink-0">
            <UserCheck size={18} />
          </div>
          <div>
            <div className="text-2xl font-bold text-surface-100 tabular-nums">{overallStats.onlineRate}%</div>
            <div className="text-xs text-surface-500">Online Rate</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400 flex-shrink-0">
            <Clock size={18} />
          </div>
          <div>
            <div className="text-2xl font-bold text-surface-100 tabular-nums">{overallStats.peakHour}:00</div>
            <div className="text-xs text-surface-500">Peak Activity Hour</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-400 flex-shrink-0">
            <Globe size={18} />
          </div>
          <div>
            <div className="text-2xl font-bold text-surface-100 tabular-nums">{worldClusters.length}</div>
            <div className="text-xs text-surface-500">Friend Clusters</div>
          </div>
        </div>
      </div>

      {/* Top Friends by Activity */}
      <div className="glass-panel-solid overflow-hidden">
        <button
          onClick={() => toggle('top-friends')}
          className="w-full px-4 py-3 border-b border-surface-800/40 flex items-center justify-between hover:bg-surface-800/20 transition-colors"
        >
          <h2 className="text-sm font-semibold text-surface-300 flex items-center gap-2">
            <Award size={14} className="text-amber-400" />
            Top Friends by Activity
          </h2>
          {expandedSection === 'top-friends' ? <ChevronUp size={14} className="text-surface-500" /> : <ChevronDown size={14} className="text-surface-500" />}
        </button>

        {expandedSection === 'top-friends' && (
          <div>
            <div className="px-4 py-2 border-b border-surface-800/20 flex items-center gap-2">
              <span className="text-xs text-surface-500">Sort by:</span>
              {(['events', 'online', 'recent'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setSortBy(s)}
                  className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                    sortBy === s ? 'bg-accent-600 text-white' : 'bg-surface-800 text-surface-400 hover:bg-surface-700'
                  }`}
                >
                  {s === 'events' ? 'Total Events' : s === 'online' ? 'Online Count' : 'Last Seen'}
                </button>
              ))}
            </div>

            {sortedStats.length === 0 ? (
              <div className="py-8">
                <EmptyState icon={Users} title="No data yet" description="Friend activity stats will build up over time as you use VRC Studio" />
              </div>
            ) : (
              <div className="divide-y divide-surface-800/30 max-h-[480px] overflow-y-auto">
                {sortedStats.slice(0, 30).map((stat, i) => {
                  const maxEvents = sortedStats[0]?.eventCount || 1;
                  const barWidth = (stat.eventCount / maxEvents) * 100;

                  return (
                    <button
                      key={stat.user.id}
                      onClick={() => setSelectedFriendId(stat.user.id)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-surface-800/30 transition-colors text-left border-b border-surface-800/10 last:border-0">
                      <span className="text-xs text-surface-600 w-5 text-right tabular-nums font-semibold">
                        {i + 1}
                      </span>
                      <UserAvatar src={getBestAvatarUrl(stat.user)} status={stat.user.status} size="sm" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-medium text-surface-200 truncate">
                            {stat.user.displayName}
                          </span>
                          {i < 3 && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                              i === 0 ? 'bg-amber-500/15 text-amber-400' :
                              i === 1 ? 'bg-surface-400/15 text-surface-300' :
                              'bg-orange-500/15 text-orange-400'
                            }`}>
                              #{i + 1}
                            </span>
                          )}
                        </div>
                        {/* Mini bar */}
                        <div className="mt-1 h-1 bg-surface-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-accent-500/50 rounded-full"
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-xs font-semibold text-surface-200 tabular-nums">{stat.eventCount}</div>
                        <div className="text-[10px] text-surface-500">events</div>
                      </div>
                      <div className="text-right flex-shrink-0 w-16">
                        <div className="text-xs text-green-400 tabular-nums">{stat.onlineEvents}</div>
                        <div className="text-[10px] text-surface-500">online</div>
                      </div>
                      {stat.lastSeen > 0 && (
                        <div className="text-[10px] text-surface-500 flex-shrink-0 w-20 text-right">
                          {formatDistanceToNow(stat.lastSeen, { addSuffix: true })}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Friend Clusters & Platform Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Friend Clusters */}
        <div className="glass-panel-solid overflow-hidden">
          <button
            onClick={() => toggle('clusters')}
            className="w-full px-4 py-3 border-b border-surface-800/40 flex items-center justify-between hover:bg-surface-800/20 transition-colors"
          >
            <h2 className="text-sm font-semibold text-surface-300 flex items-center gap-2">
              <Globe size={14} className="text-blue-400" />
              Friend Clusters (Same World)
            </h2>
            {expandedSection === 'clusters' ? <ChevronUp size={14} className="text-surface-500" /> : <ChevronDown size={14} className="text-surface-500" />}
          </button>
          {expandedSection === 'clusters' && (
            <div className="divide-y divide-surface-800/30 max-h-64 overflow-y-auto">
              {worldClusters.length === 0 ? (
                <div className="py-6 text-center text-sm text-surface-500">
                  No friend clusters right now
                </div>
              ) : (
                worldClusters.map(cluster => (
                  <div key={cluster.worldId} className="px-4 py-3">
                    <div className="text-xs text-surface-500 mb-1.5 font-mono">{cluster.worldId}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {cluster.friends.map(f => (
                        <div key={f.id} className="flex items-center gap-1 bg-surface-800/50 rounded-full px-2 py-0.5">
                          <UserAvatar src={getBestAvatarUrl(f)} size="sm" status={f.status} />
                          <span className="text-xs">{f.displayName}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Platform Distribution */}
        <div className="glass-panel-solid overflow-hidden">
          <button
            onClick={() => toggle('platforms')}
            className="w-full px-4 py-3 border-b border-surface-800/40 flex items-center justify-between hover:bg-surface-800/20 transition-colors"
          >
            <h2 className="text-sm font-semibold text-surface-300 flex items-center gap-2">
              <TrendingUp size={14} className="text-purple-400" />
              Platform Distribution
            </h2>
            {expandedSection === 'platforms' ? <ChevronUp size={14} className="text-surface-500" /> : <ChevronDown size={14} className="text-surface-500" />}
          </button>
          {expandedSection === 'platforms' && (
            <div className="p-4 space-y-3">
              {Object.entries(overallStats.platformCounts)
                .sort(([, a], [, b]) => b - a)
                .map(([platform, count]) => {
                  const pct = (count / overallStats.totalFriends) * 100;
                  const labels: Record<string, string> = {
                    standalonewindows: 'PC VR / Desktop',
                    android: 'Quest / Android',
                    ios: 'iOS',
                    unknown: 'Unknown',
                  };
                  return (
                    <div key={platform}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-surface-300">{labels[platform] || platform}</span>
                        <span className="text-xs text-surface-500 tabular-nums">{count} ({pct.toFixed(0)}%)</span>
                      </div>
                      <div className="h-2 bg-surface-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-purple-500/60 rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              }

              {Object.keys(overallStats.platformCounts).length === 0 && (
                <div className="text-sm text-surface-500 text-center py-4">No platform data available</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Join Year Distribution */}
      {Object.keys(overallStats.joinYears).length > 0 && (
        <div className="glass-panel-solid p-5">
          <h2 className="text-sm font-semibold text-surface-300 flex items-center gap-2 mb-4">
            <Calendar size={14} className="text-emerald-400" />
            Friends by VRChat Join Year
          </h2>
          <div className="flex items-end gap-2 h-32">
            {Object.entries(overallStats.joinYears)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([year, count]) => {
                const max = Math.max(...Object.values(overallStats.joinYears), 1);
                const pct = (count / max) * 100;
                return (
                  <div key={year} className="flex-1 flex flex-col items-center gap-1 group">
                    <div className="text-[10px] text-surface-400 opacity-0 group-hover:opacity-100 transition-opacity tabular-nums">
                      {count}
                    </div>
                    <div
                      className="w-full bg-emerald-500/50 rounded-t transition-all group-hover:bg-emerald-400/70"
                      style={{ height: `${Math.max(pct, 4)}%` }}
                    />
                    <span className="text-[10px] text-surface-500 tabular-nums">{year.slice(2)}</span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Friend Event Detail Panel */}
      {selectedFriendId && friendMap.get(selectedFriendId) && (
        <FriendEventDetail
          friend={friendMap.get(selectedFriendId)!}
          events={events}
          onClose={() => setSelectedFriendId(null)}
        />
      )}
    </div>
  );
}
