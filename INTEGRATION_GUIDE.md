# VRCStudio Feature Integration Guide

This guide shows how to integrate the new persistent storage, world analytics, and avatar handling systems.

## 1. Persistent Storage (Survives App Updates)

### Setup
Data is automatically saved to both localStorage AND Electron app files. No setup needed!

Location: `C:\Users\[YourUser]\AppData\Roaming\VRCStudio\AppData\*.json`

### Usage in Zustand Stores

```typescript
import { savePersistentData, loadPersistentData } from '../utils/persistentStorage';

export const useMyStore = create<MyState>((set, get) => ({
  data: [],
  
  loadData: async () => {
    const data = await loadPersistentData('my_data_key');
    if (data) set({ data });
  },
  
  saveData: async () => {
    await savePersistentData('my_data_key', get().data);
  },
}));
```

### In React Components

```typescript
import { savePersistentData, loadPersistentData } from '../utils/persistentStorage';

function MyComponent() {
  useEffect(() => {
    // Load data
    loadPersistentData('my_key').then(data => {
      console.log('Loaded:', data);
    });
  }, []);
  
  const handleSave = async () => {
    await savePersistentData('my_key', { foo: 'bar' });
  };
  
  return <button onClick={handleSave}>Save</button>;
}
```

## 2. World Analytics (Track User Activity)

### Auto-Track World Visits

Add this to your websocket handler or friend status tracker:

```typescript
import { logWorldVisit, logWorldExit } from '../utils/worldAnalytics';

// When user joins a world
await logWorldVisit(worldId, worldName, Date.now());

// When user leaves a world
const durationMs = await logWorldExit(worldId);
console.log(`Spent ${formatDuration(durationMs)} in world`);
```

### Display World Analytics

```typescript
import { getWorldAnalytics, getWorldStats, formatDuration } from '../utils/worldAnalytics';

async function ShowWorldStats() {
  const analytics = await getWorldAnalytics();
  
  return (
    <div>
      {analytics.map(world => (
        <div key={world.worldId}>
          <h3>{world.worldName}</h3>
          <p>Visits: {world.visitCount}</p>
          <p>Total Time: {formatDuration(world.totalDuration)}</p>
          {world.averageDuration && (
            <p>Avg Time: {formatDuration(world.averageDuration)}</p>
          )}
        </div>
      ))}
    </div>
  );
}
```

### Get Specific World Stats

```typescript
import { getWorldStats, getWorldHistory } from '../utils/worldAnalytics';

// Get summary stats
const stats = await getWorldStats(worldId);
console.log(`Visited ${stats.visitCount} times, ${stats.totalDuration}ms total`);

// Get visit history (last 20 visits)
const history = await getWorldHistory(worldId, 20);
history.forEach(visit => {
  const duration = visit.duration ? `${visit.duration}ms` : 'still there';
  console.log(`Entered: ${new Date(visit.enteredAt).toLocaleString()} (${duration})`);
});
```

## 3. Avatar Image Handling

### Replace Old Avatar URL Logic

**Before:**
```typescript
<img src={friend.currentAvatarThumbnailImageUrl} alt={friend.displayName} />
```

**After:**
```typescript
import { getBestUserAvatarUrl, hasVRCPlus } from '../utils/avatarImage';

// Shows custom profile pic if they have VRC+, otherwise current avatar
<img src={getBestUserAvatarUrl(friend)} alt={friend.displayName} />

// Check if user has VRC+ for special UI
{hasVRCPlus(friend) && <span className="badge">VRC+</span>}
```

### For Public Avatars

```typescript
import { getAvatarImageUrl } from '../utils/avatarImage';

<img src={getAvatarImageUrl(avatar)} alt={avatar.name} />
```

### Handle Image Load Failures

```typescript
import { getFallbackAvatarUrl, preloadImage } from '../utils/avatarImage';

const [imageUrl, setImageUrl] = useState(avatar.thumbnailImageUrl);

useEffect(() => {
  preloadImage(imageUrl)
    .catch(() => setImageUrl(getFallbackAvatarUrl()));
}, [imageUrl]);

<img src={imageUrl} alt={avatar.name} />
```

## Data Storage Details

### What Gets Stored Where

| Type | Location | Survives Update |
|------|----------|-----------------|
| localStorage | Browser storage | ❌ May clear on update |
| Electron files | `AppData/AppData/*.json` | ✅ Always survives |
| Bundle data | `AppData/AvatarBundles/` | ✅ Always survives |

### File Size Management

The system automatically prevents excessive storage:

- **World visits**: Max 500 entries (auto-prunes oldest)
- **Avatar bundles**: User controls extraction location
- **Other data**: Manual control with `pruneDataEntries()`

To manually clean up:

```typescript
import { deletePersistentData, clearAllPersistentData } from '../utils/persistentStorage';

// Delete specific data
await deletePersistentData('world_visits');

// Nuclear option - delete everything
await clearAllPersistentData();
```

### Checking File Locations

Users can find their data here:
- **Windows**: `C:\Users\[Username]\AppData\Roaming\VRCStudio\AppData\`
- Files are human-readable JSON for easy inspection/backup

## Integration Checklist

- [ ] Replace `getBestAvatarUrl` with `getBestUserAvatarUrl` in user displays
- [ ] Add world tracking to WebSocket status updates
- [ ] Update stores to use `savePersistentData`/`loadPersistentData`
- [ ] Test data persistence across app restarts
- [ ] Test data persistence across app updates
- [ ] Add world analytics display to Dashboard or Analytics page
- [ ] Update activity map to use persistent world visit data

## Common Patterns

### Persist Store on Every Change

```typescript
export const useMyStore = create<MyState>((set) => ({
  items: [],
  
  addItem: async (item) => {
    set(state => {
      const newItems = [...state.items, item];
      savePersistentData('items_key', newItems); // Fire and forget
      return { items: newItems };
    });
  },
}));
```

### Lazy Load on First Access

```typescript
export const useMyStore = create<MyState>((set) => {
  // Load on creation
  loadPersistentData('items_key').then(data => {
    if (data) set({ items: data });
  });
  
  return {
    items: [],
    // ... rest of store
  };
});
```

### Smart Caching

```typescript
async function getWorldStats(worldId: string) {
  // Try cache first
  const cached = sessionStorage.getItem(`world_${worldId}`);
  if (cached) return JSON.parse(cached);
  
  // Load from persistent storage
  const stats = await loadPersistentData(`world_stats_${worldId}`);
  if (stats) {
    sessionStorage.setItem(`world_${worldId}`, JSON.stringify(stats));
    return stats;
  }
  
  return null;
}
```

## Performance Notes

- **No database needed** - Pure JSON files, instant access
- **Auto-pruning** - Old data automatically removed
- **Dual storage** - Fallback if Electron unavailable
- **Non-blocking** - Uses async/await, won't freeze UI
- **Minimal overhead** - Typical setup <1MB total storage

## Troubleshooting

**Data not persisting across updates?**
- Check that Electron `storage:*` handlers are in `main.ts` ✅
- Check that handlers are in `preload.ts` ✅
- Check that `electronAPI` is available in renderer

**Files getting too large?**
- Call `pruneDataEntries()` to limit history
- Files should stay under 50KB each

**Need to reset everything?**
- Call `clearAllPersistentData()`
- Delete `AppData/AppData/` folder manually
