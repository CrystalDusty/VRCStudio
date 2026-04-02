import { useState, useMemo } from 'react';
import { Flame, Calendar, Clock, Globe, TrendingUp, ChevronLeft, ChevronRight } from 'lucide-react';
import { format, startOfWeek, addDays, subDays, isSameDay, differenceInDays, startOfDay } from 'date-fns';
import { useFeedStore } from '../stores/feedStore';
import { useInstanceHistoryStore } from '../stores/instanceHistoryStore';

const CELL_SIZE = 14;
const CELL_GAP = 3;
const WEEKS_TO_SHOW = 26; // ~6 months

const intensityColors = [
  'bg-surface-800',
  'bg-emerald-900/60',
  'bg-emerald-700/70',
  'bg-emerald-500/80',
  'bg-emerald-400',
];

function getIntensity(count: number): number {
  if (count === 0) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  if (count <= 10) return 3;
  return 4;
}

const DAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

export default function ActivityHeatmapPage() {
  const { events } = useFeedStore();
  const { history } = useInstanceHistoryStore();
  const [weekOffset, setWeekOffset] = useState(0);

  // Build daily activity counts from events + instance history
  const { dailyCounts, totalDays, totalEvents, longestStreak, currentStreak, peakDay } = useMemo(() => {
    const counts: Record<string, { events: number; worldVisits: number; timeOnline: number }> = {};

    // Count events per day
    for (const evt of events) {
      const day = format(evt.timestamp, 'yyyy-MM-dd');
      if (!counts[day]) counts[day] = { events: 0, worldVisits: 0, timeOnline: 0 };
      counts[day].events++;
      if (evt.type === 'friend_online' || evt.type === 'friend_location') {
        counts[day].worldVisits++;
      }
    }

    // Count instance visits per day
    for (const inst of history) {
      const day = format(inst.joinedAt, 'yyyy-MM-dd');
      if (!counts[day]) counts[day] = { events: 0, worldVisits: 0, timeOnline: 0 };
      counts[day].worldVisits++;
      if (inst.leftAt) {
        counts[day].timeOnline += (inst.leftAt - inst.joinedAt);
      }
    }

    // Calculate stats
    let totalDays = 0;
    let totalEvents = 0;
    let peakDay = { date: '', count: 0 };

    for (const [date, data] of Object.entries(counts)) {
      const total = data.events + data.worldVisits;
      if (total > 0) totalDays++;
      totalEvents += total;
      if (total > peakDay.count) peakDay = { date, count: total };
    }

    // Streak calculation
    let longestStreak = 0;
    let currentStreak = 0;
    let streak = 0;
    const today = startOfDay(new Date());

    for (let i = 0; i < 365; i++) {
      const d = format(subDays(today, i), 'yyyy-MM-dd');
      const count = (counts[d]?.events || 0) + (counts[d]?.worldVisits || 0);
      if (count > 0) {
        streak++;
        if (i === currentStreak) currentStreak = streak;
      } else {
        longestStreak = Math.max(longestStreak, streak);
        streak = 0;
      }
    }
    longestStreak = Math.max(longestStreak, streak);

    return { dailyCounts: counts, totalDays, totalEvents, longestStreak, currentStreak, peakDay };
  }, [events, history]);

  // Build the grid
  const grid = useMemo(() => {
    const today = new Date();
    const baseDate = subDays(today, weekOffset * 7);
    const endDate = baseDate;
    const startDate = subDays(startOfWeek(endDate, { weekStartsOn: 1 }), (WEEKS_TO_SHOW - 1) * 7);

    const weeks: { date: Date; count: number; day: string }[][] = [];
    let current = startDate;

    while (differenceInDays(endDate, current) >= 0) {
      const weekDay = current.getDay();
      const weekIndex = Math.floor(differenceInDays(current, startDate) / 7);
      if (!weeks[weekIndex]) weeks[weekIndex] = [];

      const dayStr = format(current, 'yyyy-MM-dd');
      const data = dailyCounts[dayStr];
      const count = data ? data.events + data.worldVisits : 0;

      weeks[weekIndex].push({ date: current, count, day: dayStr });
      current = addDays(current, 1);
    }

    return { weeks, startDate, endDate };
  }, [dailyCounts, weekOffset]);

  // Monthly labels
  const monthLabels = useMemo(() => {
    const labels: { label: string; weekIndex: number }[] = [];
    let lastMonth = -1;
    grid.weeks.forEach((week, i) => {
      if (week.length > 0) {
        const month = week[0].date.getMonth();
        if (month !== lastMonth) {
          labels.push({ label: format(week[0].date, 'MMM'), weekIndex: i });
          lastMonth = month;
        }
      }
    });
    return labels;
  }, [grid]);

  // Hourly activity breakdown
  const hourlyActivity = useMemo(() => {
    const hours = new Array(24).fill(0);
    for (const evt of events) {
      const h = new Date(evt.timestamp).getHours();
      hours[h]++;
    }
    for (const inst of history) {
      const h = new Date(inst.joinedAt).getHours();
      hours[h]++;
    }
    const max = Math.max(...hours, 1);
    return hours.map((count, hour) => ({ hour, count, pct: (count / max) * 100 }));
  }, [events, history]);

  // Day of week breakdown
  const dayOfWeekActivity = useMemo(() => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const counts = new Array(7).fill(0);
    for (const evt of events) {
      counts[new Date(evt.timestamp).getDay()]++;
    }
    for (const inst of history) {
      counts[new Date(inst.joinedAt).getDay()]++;
    }
    const max = Math.max(...counts, 1);
    return days.map((name, i) => ({ name, count: counts[i], pct: (counts[i] / max) * 100 }));
  }, [events, history]);

  const [hoveredCell, setHoveredCell] = useState<{ day: string; count: number; x: number; y: number } | null>(null);

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Flame size={24} className="text-emerald-400" /> Activity Heatmap
        </h1>
        <p className="text-sm text-surface-400 mt-0.5">
          Your VRChat activity visualized over time
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="stat-card">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 flex-shrink-0">
            <Calendar size={18} />
          </div>
          <div>
            <div className="text-2xl font-bold text-surface-100 tabular-nums">{totalDays}</div>
            <div className="text-xs text-surface-500">Active Days</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400 flex-shrink-0">
            <TrendingUp size={18} />
          </div>
          <div>
            <div className="text-2xl font-bold text-surface-100 tabular-nums">{totalEvents}</div>
            <div className="text-xs text-surface-500">Total Events</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400 flex-shrink-0">
            <Flame size={18} />
          </div>
          <div>
            <div className="text-2xl font-bold text-surface-100 tabular-nums">{currentStreak}</div>
            <div className="text-xs text-surface-500">Current Streak</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-400 flex-shrink-0">
            <Flame size={18} />
          </div>
          <div>
            <div className="text-2xl font-bold text-surface-100 tabular-nums">{longestStreak}</div>
            <div className="text-xs text-surface-500">Longest Streak</div>
          </div>
        </div>
      </div>

      {/* Heatmap */}
      <div className="glass-panel-solid p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-surface-300">Activity Calendar</h2>
          <div className="flex items-center gap-2">
            <button onClick={() => setWeekOffset(w => w + WEEKS_TO_SHOW)} className="btn-ghost p-1">
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => setWeekOffset(0)}
              className="btn-ghost text-xs px-2 py-1"
              disabled={weekOffset === 0}
            >
              Today
            </button>
            <button
              onClick={() => setWeekOffset(w => Math.max(0, w - WEEKS_TO_SHOW))}
              className="btn-ghost p-1"
              disabled={weekOffset === 0}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {/* Month labels */}
        <div className="flex ml-8" style={{ gap: 0 }}>
          {monthLabels.map(({ label, weekIndex }, i) => (
            <div
              key={i}
              className="text-[10px] text-surface-500"
              style={{
                position: 'relative',
                left: weekIndex * (CELL_SIZE + CELL_GAP),
                width: 0,
                whiteSpace: 'nowrap',
              }}
            >
              {label}
            </div>
          ))}
        </div>

        <div className="flex gap-0 mt-2 relative">
          {/* Day labels */}
          <div className="flex flex-col flex-shrink-0 mr-2" style={{ gap: CELL_GAP }}>
            {DAY_LABELS.map((label, i) => (
              <div
                key={i}
                className="text-[10px] text-surface-500 flex items-center justify-end"
                style={{ height: CELL_SIZE, width: 24 }}
              >
                {label}
              </div>
            ))}
          </div>

          {/* Grid */}
          <div className="flex overflow-x-auto" style={{ gap: CELL_GAP }}>
            {grid.weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col" style={{ gap: CELL_GAP }}>
                {week.map(({ date, count, day }) => (
                  <div
                    key={day}
                    className={`rounded-sm cursor-pointer transition-all hover:ring-1 hover:ring-surface-400 ${intensityColors[getIntensity(count)]}`}
                    style={{ width: CELL_SIZE, height: CELL_SIZE }}
                    onMouseEnter={(e) => {
                      const rect = (e.target as HTMLElement).getBoundingClientRect();
                      setHoveredCell({ day, count, x: rect.left, y: rect.top });
                    }}
                    onMouseLeave={() => setHoveredCell(null)}
                  />
                ))}
              </div>
            ))}
          </div>

          {/* Tooltip */}
          {hoveredCell && (
            <div
              className="fixed z-50 glass-panel px-2.5 py-1.5 text-xs pointer-events-none"
              style={{ left: hoveredCell.x - 40, top: hoveredCell.y - 40 }}
            >
              <span className="font-semibold">{hoveredCell.count} event{hoveredCell.count !== 1 ? 's' : ''}</span>
              <span className="text-surface-500 ml-1.5">{format(new Date(hoveredCell.day), 'MMM d, yyyy')}</span>
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-2 mt-4 justify-end">
          <span className="text-[10px] text-surface-500">Less</span>
          {intensityColors.map((color, i) => (
            <div key={i} className={`rounded-sm ${color}`} style={{ width: CELL_SIZE, height: CELL_SIZE }} />
          ))}
          <span className="text-[10px] text-surface-500">More</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Hourly activity */}
        <div className="glass-panel-solid p-5">
          <h2 className="text-sm font-semibold text-surface-300 flex items-center gap-2 mb-4">
            <Clock size={14} /> Activity by Hour
          </h2>
          <div className="flex items-end gap-[3px] h-32">
            {hourlyActivity.map(({ hour, count, pct }) => (
              <div key={hour} className="flex-1 flex flex-col items-center gap-1 group relative">
                <div
                  className="w-full bg-accent-500/60 rounded-t-sm transition-all group-hover:bg-accent-400"
                  style={{ height: `${Math.max(pct, 2)}%` }}
                />
                {hour % 3 === 0 && (
                  <span className="text-[9px] text-surface-600 tabular-nums">{hour}</span>
                )}
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 glass-panel px-1.5 py-0.5 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                  {count} at {hour}:00
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Day of week */}
        <div className="glass-panel-solid p-5">
          <h2 className="text-sm font-semibold text-surface-300 flex items-center gap-2 mb-4">
            <Calendar size={14} /> Activity by Day
          </h2>
          <div className="space-y-2">
            {dayOfWeekActivity.map(({ name, count, pct }) => (
              <div key={name} className="flex items-center gap-3">
                <span className="text-xs text-surface-400 w-8 text-right tabular-nums">{name}</span>
                <div className="flex-1 bg-surface-800 rounded-full h-5 overflow-hidden">
                  <div
                    className="h-full bg-accent-500/60 rounded-full transition-all flex items-center justify-end pr-2"
                    style={{ width: `${Math.max(pct, 3)}%` }}
                  >
                    {pct > 15 && (
                      <span className="text-[10px] text-white/80 tabular-nums">{count}</span>
                    )}
                  </div>
                </div>
                {pct <= 15 && (
                  <span className="text-[10px] text-surface-500 w-6 tabular-nums">{count}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Peak day highlight */}
      {peakDay.count > 0 && (
        <div className="glass-panel-solid p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400">
            <TrendingUp size={18} />
          </div>
          <div>
            <div className="text-sm font-semibold text-surface-200">Most Active Day</div>
            <div className="text-xs text-surface-500">
              {format(new Date(peakDay.date), 'EEEE, MMMM d, yyyy')} — {peakDay.count} events
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
