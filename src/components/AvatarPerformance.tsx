// The avatar performance readout, shared by every avatar surface in the app.
//
// The old version printed VRChat's overall rank and a grid of raw numbers,
// which tells you an avatar is expensive without telling you why. This one
// rates each statistic against VRChat's published limits (see
// utils/avatarPerformance) and leads with the thing that is actually holding
// the rank down, because that is the only number anyone acts on.
//
// Three entry points, smallest first:
//   RankBadge   — the coloured pill, used wherever a rank appears at all.
//   RankGauge   — five segments showing where a rank sits on the scale.
//   PerformanceStrip — one line for list rows: the offender, in words.
//   PerformanceReport — the full per-statistic breakdown for detail views.

import { useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, Monitor, Smartphone } from 'lucide-react';
import type { AvatarStats, PerfRank } from '../stores/instanceAvatarsStore';
import type { VRCAvatar } from '../types/vrchat';
import {
  RANK_COLORS, RANK_BAR, RANK_ORDER, PC_LIMITS, UNRANKED,
  analyzeStats, summarize, platformRanks,
  type PlatformRank,
} from '../utils/avatarPerformance';

// ── Badge ───────────────────────────────────────────────────────────────

export function RankBadge({ rank, size = 'sm', title }: {
  rank: PerfRank;
  size?: 'xs' | 'sm' | 'md';
  title?: string;
}) {
  const dims =
    size === 'md' ? 'text-xs px-2.5 py-1'
    : size === 'sm' ? 'text-[10px] px-2 py-0.5'
    : 'text-[9px] px-1.5 py-0.5';
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 font-bold rounded-full border whitespace-nowrap ${dims} ${RANK_COLORS[rank]}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${RANK_BAR[rank]}`} />
      {rank}
    </span>
  );
}

/**
 * The badge for an avatar straight off VRChat's API.
 *
 * VRChat rates each platform build separately and a card has room for one
 * badge, so it shows the worst of them — that's the rating people see you at
 * on the platform where you're most expensive. The tooltip has the rest.
 */
export function AvatarRankBadge({ avatar, size = 'xs' }: {
  avatar: Pick<VRCAvatar, 'unityPackages'>;
  size?: 'xs' | 'sm' | 'md';
}) {
  const ranks = platformRanks(avatar.unityPackages);
  if (ranks.length === 0) return null;
  const worst = ranks.reduce((a, b) =>
    RANK_ORDER.indexOf(b.rank) > RANK_ORDER.indexOf(a.rank) ? b : a);
  return (
    <RankBadge
      rank={worst.rank}
      size={size}
      title={ranks.map(r => `${r.label}: ${r.rank}`).join('  ·  ')}
    />
  );
}

// ── Gauge ───────────────────────────────────────────────────────────────

/** Five segments, lit up to the rank. Excellent lights one, Very Poor all five. */
export function RankGauge({ rank, className = '' }: { rank: PerfRank; className?: string }) {
  const at = RANK_ORDER.indexOf(rank);
  return (
    <div className={`flex items-center gap-0.5 ${className}`} aria-label={`Performance: ${rank}`}>
      {RANK_ORDER.map((r, i) => (
        <span
          key={r}
          title={r}
          className={`h-1.5 flex-1 rounded-full transition-colors ${
            i <= at ? RANK_BAR[rank] : 'bg-surface-700/60'
          }`}
        />
      ))}
    </div>
  );
}

// ── Compact strip ───────────────────────────────────────────────────────

/**
 * One line for a list row: what is dragging this avatar down, in words.
 *
 * Falls back to the headline numbers when nothing is dragging it down —
 * an Excellent avatar has no offender to name.
 */
export function PerformanceStrip({ stats, rank }: { stats?: AvatarStats; rank?: PerfRank }) {
  const analysis = useMemo(() => analyzeStats(stats), [stats]);
  const effective = rank ?? analysis.computed;
  if (!effective) return null;

  // VRChat sometimes logs the rating without the block of numbers under it.
  // The gauge still works; there's just nothing to blame it on.
  if (analysis.rows.length === 0) {
    return <RankGauge rank={effective} className="mt-1.5 max-w-[220px]" />;
  }

  const offenders = summarize(analysis);

  return (
    <div className="mt-1.5 space-y-1">
      <RankGauge rank={effective} className="max-w-[220px]" />
      <div className="text-[10px] leading-tight text-surface-500">
        {offenders ? (
          <>
            <span className="text-surface-600">held back by </span>
            <span className="text-surface-300">{offenders}</span>
          </>
        ) : (
          <span className="text-surface-400">
            {analysis.rows
              .slice()
              .sort((a, b) => b.fill - a.fill)
              .slice(0, 3)
              .map(r => `${r.value.toLocaleString()} ${r.noun}`)
              .join(' · ')}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Full report ─────────────────────────────────────────────────────────

export function PerformanceReport({ stats, loggedRank, platforms, defaultExpanded = false }: {
  stats?: AvatarStats;
  /** The rank VRChat itself wrote to the log, when we have one. */
  loggedRank?: PerfRank;
  /** Per-platform ratings from the API's unity packages, when we have them. */
  platforms?: PlatformRank[];
  defaultExpanded?: boolean;
}) {
  const analysis = useMemo(() => analyzeStats(stats), [stats]);
  const [expanded, setExpanded] = useState(defaultExpanded);

  const headline = loggedRank ?? analysis.computed;
  const disagrees =
    !!loggedRank && !!analysis.computed && loggedRank !== analysis.computed;

  if (!headline && (!platforms || platforms.length === 0)) {
    return (
      <p className="text-[11px] text-surface-600">
        No performance data yet. VRChat writes an [AvatarPerformance] block once
        the avatar finishes loading.
      </p>
    );
  }

  const unranked = UNRANKED
    .map(u => ({ ...u, value: stats?.[u.key] }))
    .filter((u): u is typeof u & { value: number } => typeof u.value === 'number');

  return (
    <div className="space-y-3">
      {/* Headline */}
      {headline && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <RankBadge rank={headline} size="md" />
            <span className="text-[11px] text-surface-500">
              {loggedRank ? "VRChat's rating" : 'estimated from the logged stats'}
            </span>
          </div>
          <RankGauge rank={headline} />
          <div className="flex justify-between text-[9px] text-surface-600 uppercase tracking-wider">
            <span>Excellent</span>
            <span>Very Poor</span>
          </div>
        </div>
      )}

      {/* Per-platform ratings, when the API gave us packages */}
      {platforms && platforms.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {platforms.map(p => (
            <span
              key={p.platform}
              className="inline-flex items-center gap-1.5 text-[10px] text-surface-400 bg-surface-800/60 border border-surface-700/50 rounded-full pl-1.5 pr-1 py-0.5"
              title={p.platform}
            >
              {p.label === 'PC' ? <Monitor size={9} /> : <Smartphone size={9} />}
              {p.label}
              <RankBadge rank={p.rank} size="xs" />
            </span>
          ))}
        </div>
      )}

      {/* What's holding it back */}
      {analysis.worst.length > 0 && (
        <div className="rounded-lg border border-surface-700/50 bg-surface-800/40 p-2.5 space-y-1.5">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-surface-300">
            <AlertTriangle size={11} className="text-amber-400" />
            Holding it back
          </div>
          {analysis.worst.slice(0, 3).map(row => (
            <div key={row.key} className="text-[11px]">
              <span className="text-surface-200 font-medium tabular-nums">
                {row.value.toLocaleString()}
              </span>{' '}
              <span className="text-surface-400">{row.noun}</span>
              {row.nextLimit != null && row.nextRank && (
                <span className="text-surface-600">
                  {' '}— {row.nextLimit.toLocaleString()} or fewer to reach {row.nextRank}
                </span>
              )}
              <div className="text-[10px] text-surface-600 leading-snug">{row.advice}</div>
            </div>
          ))}
        </div>
      )}

      {disagrees && (
        <p className="text-[10px] text-surface-600 leading-snug">
          The logged rating is {loggedRank}, but the statistics we parsed only
          reach {analysis.computed}. VRChat rates a few things we can't read
          from the log, so its rating is the one to trust.
        </p>
      )}

      {/* Per-statistic bars */}
      {analysis.rows.length > 0 && (
        <div>
          <button
            onClick={() => setExpanded(v => !v)}
            className="flex items-center gap-1 text-[11px] text-surface-500 hover:text-surface-300 transition-colors"
          >
            <ChevronDown size={11} className={`transition-transform ${expanded ? '' : '-rotate-90'}`} />
            {expanded ? 'Hide' : 'Show'} all {analysis.rows.length} statistics
          </button>
          {expanded && (
            <div className="mt-2 space-y-2">
              {analysis.rows.map(row => (
                <StatBar key={row.key} row={row} />
              ))}
              {unranked.length > 0 && (
                <div className="pt-1.5 border-t border-surface-800 space-y-0.5">
                  {unranked.map(u => (
                    <div key={u.key} className="flex justify-between text-[10px]">
                      <span className="text-surface-500">{u.label}</span>
                      <span className="tabular-nums text-surface-400">
                        {u.value.toLocaleString()}
                      </span>
                    </div>
                  ))}
                  <p className="text-[9px] text-surface-600 pt-0.5">
                    Not rated by VRChat, but a good proxy for how much work your
                    GPU does drawing this avatar.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * One statistic: label, value, and a track scaled to the Poor limit with
 * ticks at each rank boundary, so "how far over" is visible at a glance.
 */
function StatBar({ row }: { row: ReturnType<typeof analyzeStats>['rows'][number] }) {
  const limit = PC_LIMITS.find(l => l.key === row.key);
  const poorLimit = limit?.thresholds[3] ?? 0;
  // Boundary ticks, deduped — several stats share thresholds (triangles are
  // 70k for Good, Medium and Poor alike) and stacked ticks read as noise.
  const ticks = limit && poorLimit > 0
    ? [...new Set(limit.thresholds.slice(0, 3).filter(t => t > 0 && t < poorLimit))]
        .map(t => t / poorLimit)
    : [];

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-[10px]">
        <span className="text-surface-400">{row.label}</span>
        <span className="flex items-baseline gap-1.5">
          <span className="tabular-nums text-surface-200">{row.value.toLocaleString()}</span>
          <span className={`text-[9px] font-semibold ${RANK_COLORS[row.rank].split(' ')[0]}`}>
            {row.rank}
          </span>
        </span>
      </div>
      <div className="relative h-1.5 mt-1 rounded-full bg-surface-800 overflow-hidden">
        <div
          className={`absolute inset-y-0 left-0 rounded-full ${RANK_BAR[row.rank]}`}
          style={{ width: `${Math.max(2, row.fill * 100)}%` }}
        />
        {ticks.map(t => (
          <span
            key={t}
            className="absolute inset-y-0 w-px bg-surface-950/70"
            style={{ left: `${t * 100}%` }}
          />
        ))}
      </div>
    </div>
  );
}
