import { useMemo, useState } from 'react';
import { BarChart3, Clock, Globe, Users, TrendingUp, Flame, Calendar, AlertCircle } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { useInstanceHistoryStore } from '../stores/instanceHistoryStore';
import { useFriendStore } from '../stores/friendStore';
import { useFeedStore } from '../stores/feedStore';
import EmptyState from '../components/common/EmptyState';
import StatCard from '../components/StatCard';
import {
  calculateSessionStats,
  calculateWorldInsights,
  calculateActivityByHour,
  calculateActivityStreaks,
  formatDuration,
  getTimeRangeLabel,
} from '../utils/statisticsCalculations';

export default function StatisticsInsightsPage() {
  const { history } = useInstanceHistoryStore();
  const { onlineFriends, offlineFriends } = useFriendStore();
  const { events } = useFeedStore();
  const [timeRange, setTimeRange] = useState<7 | 30 | 90 | 365>(30);

  const allFriends = useMemo(() => [...onlineFriends, ...offlineFriends], [onlineFriends, offlineFriends]);

  // Calculate all statistics
  const sessionStats = useMemo(() => calculateSessionStats(history, timeRange), [history, timeRange]);
  const worldInsights = useMemo(() => calculateWorldInsights(history), [history]);
  const activityByHour = useMemo(() => calculateActivityByHour(history), [history]);
  const streaks = useMemo(() => calculateActivityStreaks(history), [history]);

  // Top 10 worlds
  const topWorlds = useMemo(() => worldInsights.slice(0, 10), [worldInsights]);

  // Friend encounter stats
  const friendEncounters = useMemo(() => {
    const encounters: Record<string, number> = {};
    for (const entry of history) {
      // This is a simplified version - in reality you'd need to correlate with friend locations
      const matchingFriends = allFriends.filter(f => f.location?.startsWith(entry.worldId));
      for (const friend of matchingFriends) {
        encounters[friend.id] = (encounters[friend.id] || 0) + 1;
      }
    }

    return Object.entries(encounters)
      .map(([friendId, count]) => {
        const friend = allFriends.find(f => f.id === friendId);
        return { friendId, friend, count };
      })
      .filter(e => e.friend)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [history, allFriends]);

  // Peak activity hour
  const peakHour = useMemo(() => {
    if (activityByHour.length === 0) return 0;
    return activityByHour.reduce((prev, current) =>
      current.count > prev.count ? current : prev
    ).hour;
  }, [activityByHour]);

  if (history.length === 0) {
    return (
      <div className="max-w-6xl mx-auto space-y-4 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 size={24} className="text-accent-400" /> Statistics & Insights
          </h1>
          <p className="text-sm text-surface-400 mt-0.5">
            Track your VRChat activity and discover insights about your gameplay
          </p>
        </div>
        <EmptyState
          icon={AlertCircle}
          title="No activity data yet"
          description="Your activity data will appear here as you play VRChat"
        />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BarChart3 size={24} className="text-accent-400" /> Statistics & Insights
        </h1>
        <p className="text-sm text-surface-400 mt-0.5">
          Track your VRChat activity and discover insights about your gameplay
        </p>
      </div>

      {/* Time Range Filter */}
      <div className="flex gap-2">
        {([7, 30, 90, 365] as const).map(range => (
          <button
            key={range}
            onClick={() => setTimeRange(range)}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              timeRange === range
                ? 'bg-accent-600 text-white'
                : 'bg-surface-800 text-surface-400 hover:bg-surface-700'
            }`}
          >
            {getTimeRangeLabel(range)}
          </button>
        ))}
      </div>

      {/* Session Statistics */}
      <div>
        <h2 className="text-sm font-semibold text-surface-300 mb-3 flex items-center gap-2">
          <Clock size={14} className="text-blue-400" />
          Session Statistics
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            icon={Clock}
            label="Total Playtime"
            value={formatDuration(sessionStats.totalPlaytime)}
            color="blue"
          />
          <StatCard
            icon={TrendingUp}
            label="Sessions"
            value={sessionStats.totalSessions}
            subtext={`${(sessionStats.totalSessions / timeRange).toFixed(1)} per day`}
            color="green"
          />
          <StatCard
            icon={Clock}
            label="Avg Session"
            value={formatDuration(sessionStats.averageSessionDuration)}
            color="amber"
          />
          <StatCard
            icon={Flame}
            label="Longest Session"
            value={formatDuration(sessionStats.longestSession)}
            color="rose"
          />
        </div>
      </div>

      {/* Activity Streaks */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <StatCard
          icon={Calendar}
          label="Current Streak"
          value={`${streaks.current}d`}
          subtext="consecutive days"
          color="purple"
        />
        <StatCard
          icon={Flame}
          label="Longest Streak"
          value={`${streaks.longest}d`}
          subtext="all time"
          color="orange"
        />
        <StatCard
          icon={Calendar}
          label="Last Activity"
          value={formatDistanceToNow(new Date(history[history.length - 1]?.timestamp || Date.now()), { addSuffix: true })}
          color="cyan"
        />
      </div>

      {/* Peak Activity */}
      <div className="glass-panel-solid p-5">
        <h2 className="text-sm font-semibold text-surface-300 mb-4 flex items-center gap-2">
          <TrendingUp size={14} className="text-amber-400" />
          Peak Activity Hours
        </h2>
        <div className="flex items-end gap-2 h-32">
          {activityByHour.map(hour => (
            <div
              key={hour.hour}
              className="flex-1 flex flex-col items-center gap-1 group"
              title={`${hour.hour}:00 - ${hour.count} sessions`}
            >
              <div className="text-[10px] text-surface-400 opacity-0 group-hover:opacity-100 transition-opacity tabular-nums">
                {hour.count}
              </div>
              <div
                className={`w-full rounded-t transition-all ${
                  hour.hour === peakHour ? 'bg-amber-500' : 'bg-blue-500/50 group-hover:bg-blue-400/70'
                }`}
                style={{ height: `${Math.max(hour.percentage * 3, 4)}%` }}
              />
              <span className="text-[10px] text-surface-500 tabular-nums">{hour.hour}:00</span>
            </div>
          ))}
        </div>
      </div>

      {/* World Insights */}
      <div className="glass-panel-solid overflow-hidden">
        <div className="px-4 py-3 border-b border-surface-800/40">
          <h2 className="text-sm font-semibold text-surface-300 flex items-center gap-2">
            <Globe size={14} className="text-blue-400" />
            Most Visited Worlds (Top 10)
          </h2>
        </div>
        <div className="divide-y divide-surface-800/30 max-h-80 overflow-y-auto">
          {topWorlds.map((world, idx) => (
            <div key={world.worldId} className="px-4 py-3 hover:bg-surface-800/20 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold text-surface-600 w-5">#{idx + 1}</span>
                    <span className="text-sm font-medium text-surface-200 truncate">{world.worldName}</span>
                  </div>
                  <div className="text-xs text-surface-500 space-y-0.5">
                    <div>{world.visits} visit{world.visits !== 1 ? 's' : ''}</div>
                    <div>{formatDuration(world.totalTime)} total</div>
                    <div>Avg: {formatDuration(world.averageSessionTime)}</div>
                  </div>
                </div>
                <div className="text-right text-xs text-surface-500 flex-shrink-0">
                  Last visited {formatDistanceToNow(world.lastVisited, { addSuffix: true })}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Friend Encounters */}
      {friendEncounters.length > 0 && (
        <div className="glass-panel-solid overflow-hidden">
          <div className="px-4 py-3 border-b border-surface-800/40">
            <h2 className="text-sm font-semibold text-surface-300 flex items-center gap-2">
              <Users size={14} className="text-green-400" />
              Most Frequently Encountered Friends
            </h2>
          </div>
          <div className="divide-y divide-surface-800/30 max-h-64 overflow-y-auto">
            {friendEncounters.map(({ friend, count }, idx) => (
              friend && (
                <div key={friend.id} className="px-4 py-3 hover:bg-surface-800/20 transition-colors flex items-center gap-3">
                  <span className="text-xs font-semibold text-surface-600 w-5">#{idx + 1}</span>
                  <img
                    src={friend.currentAvatarImageUrl}
                    alt=""
                    className="w-8 h-8 rounded-lg object-cover flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-surface-200 truncate">{friend.displayName}</div>
                    <div className="text-xs text-surface-500">{count} time{count !== 1 ? 's' : ''} encountered</div>
                  </div>
                </div>
              )
            ))}
          </div>
        </div>
      )}

      {/* Stats Summary */}
      <div className="glass-panel-solid p-5 border-l-4 border-accent-500">
        <h3 className="text-sm font-semibold text-surface-300 mb-3">Summary</h3>
        <div className="text-sm text-surface-400 space-y-1">
          <p>
            You've visited <span className="font-semibold text-surface-200">{worldInsights.length}</span> unique worlds
            in the last {getTimeRangeLabel(timeRange).toLowerCase()}.
          </p>
          <p>
            Your peak activity hour is around <span className="font-semibold text-surface-200">{peakHour}:00</span>, when
            you're most likely to be playing.
          </p>
          {streaks.current > 0 && (
            <p>
              You're on a <span className="font-semibold text-surface-200">{streaks.current}-day streak</span> of active
              days!
            </p>
          )}
          <p>
            You've spent an average of{' '}
            <span className="font-semibold text-surface-200">{formatDuration(sessionStats.averageSessionDuration)}</span>{' '}
            per session.
          </p>
        </div>
      </div>
    </div>
  );
}
