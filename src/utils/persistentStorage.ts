/**
 * Persistent Storage Utility
 * Stores data in both localStorage AND Electron app data directory
 * Ensures data survives app updates and provides a fallback
 */

const isElectron = () => {
  return typeof window !== 'undefined' && !!(window as any).electronAPI;
};

interface StorageOptions {
  key: string;
  version?: number;
  maxSize?: number; // Maximum entries before pruning (default: 1000)
}

/**
 * Save data to both localStorage and Electron storage
 */
export async function savePersistentData(
  key: string,
  data: unknown,
  options?: { maxSize?: number }
): Promise<void> {
  try {
    const json = JSON.stringify(data);

    // Always save to localStorage as primary
    localStorage.setItem(`persistent_${key}`, json);

    // Also save to Electron if available
    if (isElectron()) {
      const electronAPI = (window as any).electronAPI;
      try {
        await electronAPI.saveAppData(key, json);
      } catch (e) {
        console.warn('Failed to save to Electron storage:', e);
      }
    }
  } catch (error) {
    console.error('Failed to save persistent data:', error);
  }
}

/**
 * Load data from Electron first, fallback to localStorage
 */
export async function loadPersistentData<T>(key: string): Promise<T | null> {
  try {
    // Try Electron first (more reliable)
    if (isElectron()) {
      const electronAPI = (window as any).electronAPI;
      try {
        const data = await electronAPI.loadAppData(key);
        if (data) {
          return JSON.parse(data) as T;
        }
      } catch (e) {
        console.warn('Failed to load from Electron storage:', e);
      }
    }

    // Fallback to localStorage
    const data = localStorage.getItem(`persistent_${key}`);
    if (data) {
      return JSON.parse(data) as T;
    }

    return null;
  } catch (error) {
    console.error('Failed to load persistent data:', error);
    return null;
  }
}

/**
 * Delete persistent data from both sources
 */
export async function deletePersistentData(key: string): Promise<void> {
  try {
    localStorage.removeItem(`persistent_${key}`);

    if (isElectron()) {
      const electronAPI = (window as any).electronAPI;
      try {
        await electronAPI.deleteAppData(key);
      } catch (e) {
        console.warn('Failed to delete from Electron storage:', e);
      }
    }
  } catch (error) {
    console.error('Failed to delete persistent data:', error);
  }
}

/**
 * Prune old data entries (keep only newest N entries)
 * Useful for analytics and history data
 */
export async function pruneDataEntries<T extends { timestamp?: number }>(
  key: string,
  maxEntries: number = 1000
): Promise<void> {
  try {
    const data = await loadPersistentData<T[]>(key);
    if (Array.isArray(data) && data.length > maxEntries) {
      // Sort by timestamp if available, otherwise by index
      const sorted = [...data].sort((a, b) => {
        const aTime = a.timestamp || 0;
        const bTime = b.timestamp || 0;
        return bTime - aTime; // Newest first
      });

      const pruned = sorted.slice(0, maxEntries);
      await savePersistentData(key, pruned);
    }
  } catch (error) {
    console.error('Failed to prune data:', error);
  }
}

/**
 * Clear all persistent data
 */
export async function clearAllPersistentData(): Promise<void> {
  try {
    // Clear localStorage
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith('persistent_')) {
        localStorage.removeItem(key);
      }
    });

    // Clear Electron if available
    if (isElectron()) {
      const electronAPI = (window as any).electronAPI;
      try {
        await electronAPI.clearAllAppData?.();
      } catch (e) {
        console.warn('Failed to clear Electron storage:', e);
      }
    }
  } catch (error) {
    console.error('Failed to clear persistent data:', error);
  }
}
