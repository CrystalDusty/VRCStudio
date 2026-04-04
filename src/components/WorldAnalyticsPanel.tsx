import { useEffect, useState } from 'react';
import { Globe, TrendingUp, Clock } from 'lucide-react';
import { getWorldAnalytics, formatDuration, type WorldAnalytics } from '../utils/worldAnalytics';
import LoadingSpinner from './common/LoadingSpinner';

interface WorldAnalyticsPanelProps {
  limit?: number;
  showDetails?: boolean;
}

export default function WorldAnalyticsPanel({ limit = 10, showDetails = false }: WorldAnalyticsPanelProps) {
  const [worlds, setWorlds] = useState<WorldAnalytics[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedWorld, setSelectedWorld] = useState<string | null>(null);

  useEffect(() => {
    loadAnalytics();
    // Refresh every 30 seconds
    const interval = setInterval(loadAnalytics, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadAnalytics = async () => {
    try {
      const data = await getWorldAnalytics();
      setWorlds(data);
    } catch (error) {
      console.error('Failed to load world analytics:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return <LoadingSpinner className="py-8" />;
  }

  if (worlds.length === 0) {
    return (
      <div className="glass-panel p-6 text-center">
        <Globe size={24} className="mx-auto text-surface-500 mb-2" />
        <p className="text-sm text-surface-400">No world visits tracked yet</p>
        <p className="text-xs text-surface-500 mt-1">World analytics will appear here as you visit worlds</p>
      </div>
    );
  }

  const displayedWorlds = worlds.slice(0, limit);
  const totalVisits = worlds.reduce((sum, w) => sum + w.visitCount, 0);
  const totalDuration = worlds.reduce((sum, w) => sum + w.totalDuration, 0);

  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        <div className="glass-panel p-3 text-center">
          <div className="text-2xl font-bold text-accent-500">{worlds.length}</div>
          <div className="text-xs text-surface-500 mt-1">Worlds Visited</div>
        </div>
        <div className="glass-panel p-3 text-center">
          <div className="text-2xl font-bold text-blue-500">{totalVisits}</div>
          <div className="text-xs text-surface-500 mt-1">Total Visits</div>
        </div>
        <div className="glass-panel p-3 text-center">
          <div className="text-lg font-bold text-green-500">{formatDuration(totalDuration)}</div>
          <div className="text-xs text-surface-500 mt-1">Total Time</div>
        </div>
      </div>

      {/* World List */}
      <div className="space-y-2">
        {displayedWorlds.map((world, idx) => (
          <div
            key={world.worldId}
            onClick={() => setSelectedWorld(selectedWorld === world.worldId ? null : world.worldId)}
            className={`glass-panel p-3 cursor-pointer transition-all ${
              selectedWorld === world.worldId
                ? 'ring-2 ring-accent-500 bg-surface-800'
                : 'hover:bg-surface-800/50'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="text-xs font-bold text-surface-500 flex-shrink-0 w-4 text-right">
                {idx + 1}
              </div>

              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-surface-100 truncate">{world.worldName}</h3>

                <div className="flex flex-wrap gap-3 mt-2 text-xs text-surface-400">
                  <div className="flex items-center gap-1">
                    <TrendingUp size={12} />
                    <span>{world.visitCount} visit{world.visitCount !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock size={12} />
                    <span>{formatDuration(world.totalDuration)}</span>
                  </div>
                </div>

                {showDetails && world.averageDuration && (
                  <div className="mt-2 text-xs text-surface-500">
                    <div>Avg per visit: {formatDuration(world.averageDuration)}</div>
                    <div>Last visited: {new Date(world.lastVisited).toLocaleDateString()}</div>
                  </div>
                )}
              </div>

              <div className="text-xs font-semibold text-accent-500 flex-shrink-0">
                {Math.round(world.totalDuration / 1000 / 60)} min
              </div>
            </div>

            {/* World ID for debugging */}
            {selectedWorld === world.worldId && (
              <div className="mt-2 pt-2 border-t border-surface-700 text-[10px] text-surface-500 font-mono">
                ID: {world.worldId}
              </div>
            )}
          </div>
        ))}
      </div>

      {worlds.length > limit && (
        <div className="text-center text-xs text-surface-500">
          +{worlds.length - limit} more worlds
        </div>
      )}
    </div>
  );
}
