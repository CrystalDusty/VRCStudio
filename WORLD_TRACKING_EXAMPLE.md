# World Tracking Integration Example

Quick example showing how to add automatic world tracking to your WebSocket handler.

## Add to WebSocket Handler (src/api/websocket.ts)

```typescript
import { logWorldVisit, logWorldExit } from '../utils/worldAnalytics';

// Add this to your WebSocket message handler where friend-location is processed:

case 'friend-location':
  if (data.location && data.location !== 'private') {
    const worldId = data.worldId || data.location?.split(':')[0];
    const worldName = data.worldId ? 'Unknown World' : worldId; // You can enhance this
    
    // Track world visit
    logWorldVisit(worldId, worldName, Date.now())
      .catch(e => console.error('Failed to track world visit:', e));
    
    // Rest of existing code...
  }
  break;
```

## Track When User Goes Offline/Private

```typescript
case 'user-presence':
  if (data.user?.location === 'private' || !data.user?.location) {
    // User went offline or private, log exit
    const previousLocation = friendStore.getFriend(data.user.id)?.location;
    if (previousLocation && previousLocation !== 'private') {
      const worldId = previousLocation.split(':')[0];
      logWorldExit(worldId)
        .catch(e => console.error('Failed to track world exit:', e));
    }
  }
  break;
```

## Display World Stats in Dashboard

```typescript
// src/pages/Dashboard.tsx

import { getWorldAnalytics, formatDuration } from '../utils/worldAnalytics';

function WorldActivity() {
  const [worlds, setWorlds] = useState<WorldAnalytics[]>([]);
  
  useEffect(() => {
    getWorldAnalytics().then(setWorlds);
  }, []);
  
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">World Activity</h3>
      {worlds.slice(0, 5).map(world => (
        <div key={world.worldId} className="glass-panel p-2 text-xs">
          <div className="flex justify-between">
            <span>{world.worldName}</span>
            <span className="text-surface-400">{world.visitCount}x</span>
          </div>
          <div className="text-surface-500 text-[10px]">
            Total: {formatDuration(world.totalDuration)}
            {world.averageDuration && ` • Avg: ${formatDuration(world.averageDuration)}`}
          </div>
        </div>
      ))}
    </div>
  );
}
```

## Enhanced Analytics Page

```typescript
// src/pages/Analytics.tsx or create new Analytics section

import { getWorldAnalytics, getWorldHistory, formatDuration } from '../utils/worldAnalytics';

export function WorldAnalyticsPage() {
  const [worlds, setWorlds] = useState<WorldAnalytics[]>([]);
  const [selectedWorld, setSelectedWorld] = useState<string | null>(null);
  const [history, setHistory] = useState<WorldVisit[]>([]);
  
  useEffect(() => {
    getWorldAnalytics().then(setWorlds);
  }, []);
  
  useEffect(() => {
    if (selectedWorld) {
      getWorldHistory(selectedWorld).then(setHistory);
    }
  }, [selectedWorld]);
  
  const topWorlds = worlds.sort((a, b) => b.totalDuration - a.totalDuration).slice(0, 10);
  
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-4">World Statistics</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {topWorlds.map(world => (
            <div
              key={world.worldId}
              onClick={() => setSelectedWorld(world.worldId)}
              className={`glass-panel p-4 cursor-pointer hover:bg-surface-800 transition ${
                selectedWorld === world.worldId ? 'ring-2 ring-accent-500' : ''
              }`}
            >
              <h3 className="font-semibold text-sm">{world.worldName}</h3>
              <div className="text-xs text-surface-400 mt-2 space-y-1">
                <div>Visits: {world.visitCount}</div>
                <div>Total Time: {formatDuration(world.totalDuration)}</div>
                {world.averageDuration && (
                  <div>Average: {formatDuration(world.averageDuration)}</div>
                )}
                <div className="text-[10px]">
                  Last Visited: {new Date(world.lastVisited).toLocaleDateString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      
      {selectedWorld && (
        <div>
          <h3 className="text-lg font-bold mb-3">Visit History</h3>
          <div className="space-y-2">
            {history.map((visit, i) => (
              <div key={i} className="glass-panel p-3 text-xs">
                <div className="flex justify-between">
                  <span>{new Date(visit.enteredAt).toLocaleString()}</span>
                  {visit.duration && <span>{formatDuration(visit.duration)}</span>}
                </div>
                {visit.exitedAt && (
                  <div className="text-surface-400 text-[10px]">
                    Exited: {new Date(visit.exitedAt).toLocaleTimeString()}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

## Auto-Sync with Current User Location

```typescript
// In useAuthStore or a dedicated hook

useEffect(() => {
  if (!user?.location || user.location === 'private') return;
  
  const worldId = user.location.split(':')[0];
  logWorldVisit(worldId, 'Your Location', Date.now())
    .catch(e => console.error('Failed to track your location:', e));
  
  return () => {
    // On unmount or logout, log exit
    logWorldExit(worldId).catch(e => console.error('Failed to log exit:', e));
  };
}, [user?.location]);
```

## Data Size Example

With the auto-pruning to 500 entries:
- **Total file size**: ~50-100 KB
- **Per entry**: 100-200 bytes
- **Max storage**: ~500 world visits tracked
- **Auto-cleanup**: Oldest entries removed automatically

This means you can track world visits indefinitely without bloating storage!

## Testing

```typescript
// In browser console:

// Import the utilities
import { logWorldVisit, logWorldExit, getWorldAnalytics } from './utils/worldAnalytics';

// Simulate a world visit
await logWorldVisit('world_12345', 'Test World', Date.now() - 3600000); // 1 hour ago
await logWorldExit('world_12345'); // Exit 30 min later

// Check the data
const analytics = await getWorldAnalytics();
console.log('Analytics:', analytics);
```

## What's Being Tracked

✅ World ID and name  
✅ Entry timestamp  
✅ Exit timestamp  
✅ Duration (calculated automatically)  
✅ Visit count per world  
✅ Total time per world  
✅ Average time per visit  

❌ Does NOT track: User behavior, camera position, inventory, etc.  
❌ Does NOT log: Private world visits, friends' private locations  

## Performance Impact

- **Near zero overhead** - Analytics runs async
- **Non-blocking** - Doesn't freeze UI
- **Automatic cleanup** - Old data pruned silently
- **Network independent** - All local, no API calls
