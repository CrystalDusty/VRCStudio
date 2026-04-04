/**
 * World Analytics Tracker
 * Tracks when users visit worlds with minimal data footprint
 * Stores compact world visit data and provides analytics
 */

import { savePersistentData, loadPersistentData, pruneDataEntries } from './persistentStorage';

export interface WorldVisit {
  worldId: string;
  worldName: string;
  enteredAt: number; // Unix timestamp
  exitedAt?: number; // Unix timestamp
  duration?: number; // Milliseconds
}

export interface WorldAnalytics {
  worldId: string;
  worldName: string;
  visitCount: number;
  totalDuration: number; // Milliseconds
  lastVisited: number; // Unix timestamp
  averageDuration?: number; // Milliseconds
}

const STORAGE_KEY = 'world_visits';
const ANALYTICS_KEY = 'world_analytics';
const MAX_HISTORY_ENTRIES = 500; // Keep last 500 world visits

/**
 * Log a world visit
 */
export async function logWorldVisit(
  worldId: string,
  worldName: string,
  enteredAt: number
): Promise<void> {
  try {
    const visits = (await loadPersistentData<WorldVisit[]>(STORAGE_KEY)) || [];

    // Create new visit record
    const visit: WorldVisit = {
      worldId,
      worldName,
      enteredAt,
    };

    visits.push(visit);

    // Save and prune
    await savePersistentData(STORAGE_KEY, visits);
    await pruneDataEntries(STORAGE_KEY, MAX_HISTORY_ENTRIES);

    // Update analytics
    await updateWorldAnalytics(worldId, worldName);
  } catch (error) {
    console.error('Failed to log world visit:', error);
  }
}

/**
 * Log when user exits a world
 */
export async function logWorldExit(worldId: string): Promise<number> {
  try {
    const visits = (await loadPersistentData<WorldVisit[]>(STORAGE_KEY)) || [];

    // Find the most recent visit to this world
    let lastVisit: WorldVisit | undefined;
    let visitIndex = -1;

    for (let i = visits.length - 1; i >= 0; i--) {
      if (visits[i].worldId === worldId && !visits[i].exitedAt) {
        lastVisit = visits[i];
        visitIndex = i;
        break;
      }
    }

    if (!lastVisit) {
      return 0;
    }

    const now = Date.now();
    const duration = now - lastVisit.enteredAt;

    // Update visit record
    lastVisit.exitedAt = now;
    lastVisit.duration = duration;
    visits[visitIndex] = lastVisit;

    await savePersistentData(STORAGE_KEY, visits);

    return duration;
  } catch (error) {
    console.error('Failed to log world exit:', error);
    return 0;
  }
}

/**
 * Update world analytics based on visits
 */
async function updateWorldAnalytics(
  worldId: string,
  worldName: string
): Promise<void> {
  try {
    const visits = (await loadPersistentData<WorldVisit[]>(STORAGE_KEY)) || [];
    const analyticsMap = (await loadPersistentData<Record<string, WorldAnalytics>>(ANALYTICS_KEY)) || {};

    // Calculate stats for this world
    const worldVisits = visits.filter(v => v.worldId === worldId);
    const completedVisits = worldVisits.filter(v => v.duration);

    const totalDuration = completedVisits.reduce((sum, v) => sum + (v.duration || 0), 0);
    const avgDuration = completedVisits.length > 0 ? totalDuration / completedVisits.length : 0;

    analyticsMap[worldId] = {
      worldId,
      worldName,
      visitCount: worldVisits.length,
      totalDuration,
      lastVisited: Math.max(...worldVisits.map(v => v.enteredAt)),
      averageDuration: avgDuration > 0 ? avgDuration : undefined,
    };

    await savePersistentData(ANALYTICS_KEY, analyticsMap);
  } catch (error) {
    console.error('Failed to update world analytics:', error);
  }
}

/**
 * Get analytics for all visited worlds
 */
export async function getWorldAnalytics(): Promise<WorldAnalytics[]> {
  try {
    const analyticsMap = (await loadPersistentData<Record<string, WorldAnalytics>>(ANALYTICS_KEY)) || {};
    return Object.values(analyticsMap)
      .sort((a, b) => b.lastVisited - a.lastVisited); // Newest first
  } catch (error) {
    console.error('Failed to get world analytics:', error);
    return [];
  }
}

/**
 * Get analytics for a specific world
 */
export async function getWorldStats(worldId: string): Promise<WorldAnalytics | null> {
  try {
    const analyticsMap = (await loadPersistentData<Record<string, WorldAnalytics>>(ANALYTICS_KEY)) || {};
    return analyticsMap[worldId] || null;
  } catch (error) {
    console.error('Failed to get world stats:', error);
    return null;
  }
}

/**
 * Get time spent in a specific world
 */
export async function getWorldDuration(worldId: string): Promise<number> {
  const stats = await getWorldStats(worldId);
  return stats?.totalDuration || 0;
}

/**
 * Get visit history for a world (last N visits)
 */
export async function getWorldHistory(worldId: string, limit: number = 20): Promise<WorldVisit[]> {
  try {
    const visits = (await loadPersistentData<WorldVisit[]>(STORAGE_KEY)) || [];
    return visits
      .filter(v => v.worldId === worldId)
      .sort((a, b) => b.enteredAt - a.enteredAt)
      .slice(0, limit);
  } catch (error) {
    console.error('Failed to get world history:', error);
    return [];
  }
}

/**
 * Format duration for display
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return '<1s';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}
