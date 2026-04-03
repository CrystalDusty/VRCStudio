/**
 * Statistics calculation utilities for the insights dashboard
 */

import type { InstanceHistoryEntry } from '../stores/instanceHistoryStore';
import { differenceInDays, differenceInHours, startOfDay, startOfWeek, startOfMonth, endOfDay } from 'date-fns';

export interface SessionStats {
  totalPlaytime: number; // milliseconds
  totalSessions: number;
  averageSessionDuration: number;
  longestSession: number;
}

export interface WorldInsight {
  worldId: string;
  worldName: string;
  visits: number;
  totalTime: number; // milliseconds
  lastVisited: number;
  averageSessionTime: number;
}

export interface ActivityByHour {
  hour: number;
  count: number;
  percentage: number;
}

export interface ActivityStreak {
  current: number;
  longest: number;
  lastBreak: number;
}

/**
 * Calculate session statistics from history
 */
export function calculateSessionStats(history: InstanceHistoryEntry[], daysBack = 30): SessionStats {
  const cutoff = Date.now() - daysBack * 24 * 60 * 60 * 1000;
  const relevantHistory = history.filter(h => h.timestamp >= cutoff);

  if (relevantHistory.length === 0) {
    return { totalPlaytime: 0, totalSessions: 0, averageSessionDuration: 0, longestSession: 0 };
  }

  const sorted = [...relevantHistory].sort((a, b) => a.timestamp - b.timestamp);
  let totalPlaytime = 0;
  let longestSession = 0;

  for (let i = 1; i < sorted.length; i++) {
    const duration = sorted[i].timestamp - sorted[i - 1].timestamp;
    // Assume sessions longer than 2 hours are false positives
    if (duration > 0 && duration < 2 * 60 * 60 * 1000) {
      totalPlaytime += duration;
      longestSession = Math.max(longestSession, duration);
    }
  }

  return {
    totalPlaytime,
    totalSessions: relevantHistory.length,
    averageSessionDuration: relevantHistory.length > 0 ? totalPlaytime / relevantHistory.length : 0,
    longestSession,
  };
}

/**
 * Calculate insights per world
 */
export function calculateWorldInsights(history: InstanceHistoryEntry[]): WorldInsight[] {
  const worldMap = new Map<string, { visits: number; times: number[] }>();

  for (const entry of history) {
    const [worldId] = entry.worldId.split(':');
    if (!worldMap.has(worldId)) {
      worldMap.set(worldId, { visits: 1, times: [entry.timestamp] });
    } else {
      const existing = worldMap.get(worldId)!;
      existing.visits++;
      existing.times.push(entry.timestamp);
    }
  }

  const insights: WorldInsight[] = [];

  for (const [worldId, data] of worldMap) {
    const sorted = data.times.sort((a, b) => a - b);
    let totalTime = 0;

    for (let i = 1; i < sorted.length; i++) {
      const duration = sorted[i] - sorted[i - 1];
      if (duration > 0 && duration < 2 * 60 * 60 * 1000) {
        totalTime += duration;
      }
    }

    insights.push({
      worldId,
      worldName: worldId, // Would be populated from world API
      visits: data.visits,
      totalTime,
      lastVisited: Math.max(...data.times),
      averageSessionTime: data.visits > 0 ? totalTime / data.visits : 0,
    });
  }

  return insights.sort((a, b) => b.visits - a.visits);
}

/**
 * Calculate activity distribution by hour
 */
export function calculateActivityByHour(history: InstanceHistoryEntry[]): ActivityByHour[] {
  const hourCounts = new Array(24).fill(0);
  const totalCount = history.length;

  for (const entry of history) {
    const hour = new Date(entry.timestamp).getHours();
    hourCounts[hour]++;
  }

  return hourCounts.map((count, hour) => ({
    hour,
    count,
    percentage: totalCount > 0 ? (count / totalCount) * 100 : 0,
  }));
}

/**
 * Calculate activity streaks (consecutive days active)
 */
export function calculateActivityStreaks(history: InstanceHistoryEntry[]): ActivityStreak {
  if (history.length === 0) {
    return { current: 0, longest: 0, lastBreak: 0 };
  }

  const activeDays = new Set(
    history.map(h => {
      const d = new Date(h.timestamp);
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    })
  );

  const sortedDays = Array.from(activeDays).sort();
  let currentStreak = 1;
  let longestStreak = 1;

  for (let i = 1; i < sortedDays.length; i++) {
    const [prevYear, prevMonth, prevDay] = sortedDays[i - 1].split('-').map(Number);
    const [year, month, day] = sortedDays[i].split('-').map(Number);

    const prevDate = new Date(prevYear, prevMonth, prevDay);
    const currDate = new Date(year, month, day);
    const daysDiff = Math.floor((currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));

    if (daysDiff === 1) {
      currentStreak++;
      longestStreak = Math.max(longestStreak, currentStreak);
    } else {
      currentStreak = 1;
    }
  }

  const today = new Date();
  const lastActiveDay = new Date(sortedDays[sortedDays.length - 1]);
  const daysSinceActive = differenceInDays(today, lastActiveDay);

  return {
    current: daysSinceActive <= 1 ? currentStreak : 0,
    longest: longestStreak,
    lastBreak: daysSinceActive,
  };
}

/**
 * Format milliseconds to readable time string
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

/**
 * Get time range description
 */
export function getTimeRangeLabel(days: number): string {
  if (days === 7) return 'Last 7 days';
  if (days === 30) return 'Last 30 days';
  if (days === 90) return 'Last 90 days';
  if (days === 365) return 'Last year';
  return `Last ${days} days`;
}
