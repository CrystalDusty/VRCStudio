// Reading VRChat's avatar performance ranks.
//
// The log tells us the overall rank and a pile of raw numbers, and the overall
// rank on its own is nearly useless: "Very Poor" says an avatar is expensive
// but not what makes it expensive. VRChat computes that rank by rating every
// statistic separately and taking the worst one, so with the published limits
// we can work backwards and name the offender — which is the thing anyone
// actually wants to know.
//
// Limits are VRChat's own PC table. Quest is stricter across the board; only
// PC is modelled here because the log we read comes from a PC client.

import type { AvatarStats, PerfRank } from '../stores/instanceAvatarsStore';

export const RANK_ORDER: PerfRank[] = ['Excellent', 'Good', 'Medium', 'Poor', 'Very Poor'];

/** Tailwind classes per rank, shared by every avatar surface in the app. */
export const RANK_COLORS: Record<PerfRank, string> = {
  Excellent:   'text-emerald-300 bg-emerald-500/15 border-emerald-500/30',
  Good:        'text-lime-300 bg-lime-500/15 border-lime-500/30',
  Medium:      'text-amber-300 bg-amber-500/15 border-amber-500/30',
  Poor:        'text-orange-300 bg-orange-500/15 border-orange-500/30',
  'Very Poor': 'text-rose-300 bg-rose-500/15 border-rose-500/30',
};

/** Just the bar fill, where a background tint would muddy the track. */
export const RANK_BAR: Record<PerfRank, string> = {
  Excellent:   'bg-emerald-400',
  Good:        'bg-lime-400',
  Medium:      'bg-amber-400',
  Poor:        'bg-orange-400',
  'Very Poor': 'bg-rose-400',
};

interface Limit {
  /** Key on AvatarStats. */
  key: keyof AvatarStats;
  /** Column heading: "Material slots". */
  label: string;
  /** The same thing mid-sentence: "22 material slots". */
  noun: string;
  /** Upper bound for Excellent, Good, Medium, Poor. Above Poor is Very Poor. */
  thresholds: [number, number, number, number];
  /** Shown under the bar when this stat is what's holding the rank down. */
  advice: string;
}

/**
 * VRChat's PC limits, from the creator documentation.
 *
 * Only the statistics our log parser actually captures are listed — there is no
 * value in a row that can never have a number in it.
 */
export const PC_LIMITS: Limit[] = [
  { key: 'triangles', label: 'Triangles', noun: 'triangles', thresholds: [32000, 70000, 70000, 70000],
    advice: 'Past 70k every rank is Very Poor — the triangle budget stops there.' },
  { key: 'materials', label: 'Material slots', noun: 'material slots', thresholds: [4, 8, 16, 32],
    advice: 'Each slot is another draw call. Atlasing textures merges them.' },
  { key: 'skinnedMeshes', label: 'Skinned meshes', noun: 'skinned meshes', thresholds: [1, 2, 8, 16],
    advice: 'Merging skinned meshes is usually the single biggest win.' },
  { key: 'meshes', label: 'Basic meshes', noun: 'basic meshes', thresholds: [4, 8, 16, 24],
    advice: 'Static props that never deform can often be merged.' },
  { key: 'bones', label: 'Bones', noun: 'bones', thresholds: [75, 150, 256, 400],
    advice: 'Unused leaf bones from imported rigs are the usual cause.' },
  { key: 'physBones', label: 'PhysBones', noun: 'PhysBones', thresholds: [4, 8, 16, 32],
    advice: 'Each component is simulated every frame for everyone who sees you.' },
  { key: 'dynamicBones', label: 'Dynamic bones', noun: 'Dynamic Bones', thresholds: [4, 8, 16, 32],
    advice: 'Legacy Dynamic Bones; PhysBones replaced these and cost less.' },
  { key: 'animators', label: 'Animators', noun: 'animators', thresholds: [1, 4, 16, 32],
    advice: 'Extra animators usually come in with props.' },
  { key: 'particles', label: 'Particle systems', noun: 'particle systems', thresholds: [0, 4, 8, 16],
    advice: 'Any particle system at all drops you out of Excellent.' },
  { key: 'lights', label: 'Lights', noun: 'realtime lights', thresholds: [0, 0, 0, 1],
    advice: 'A single realtime light is Poor, and two is Very Poor.' },
  { key: 'audioSources', label: 'Audio sources', noun: 'audio sources', thresholds: [1, 4, 8, 8],
    advice: 'Audio sources are cheap individually but add up.' },
];

/** Stats we display but VRChat doesn't rank — shown as plain numbers. */
export const UNRANKED: Array<{ key: keyof AvatarStats; label: string }> = [
  { key: 'drawCalls', label: 'Draw calls' },
];

/** The rank a single statistic earns on its own. */
export function rankForValue(limit: Limit, value: number): PerfRank {
  const [excellent, good, medium, poor] = limit.thresholds;
  if (value <= excellent) return 'Excellent';
  if (value <= good) return 'Good';
  if (value <= medium) return 'Medium';
  if (value <= poor) return 'Poor';
  return 'Very Poor';
}

export interface StatRow {
  key: keyof AvatarStats;
  label: string;
  /** Lower-case form for prose: "22 material slots". */
  noun: string;
  value: number;
  rank: PerfRank;
  advice: string;
  /** Get to this number or below to improve the rating. Null when already Excellent. */
  nextLimit: number | null;
  /**
   * The rating `nextLimit` actually earns.
   *
   * Usually one step up, but not always: triangles are Good up to 70,000 and
   * Very Poor above it, with nothing in between, so getting under the limit
   * jumps three ranks. Reading it off RANK_ORDER promised "Poor" for a number
   * that is in fact Good.
   */
  nextRank: PerfRank | null;
  /** 0–1 against the Poor threshold, for the bar. Clamped, so 3x over reads as full. */
  fill: number;
}

export interface PerfAnalysis {
  rows: StatRow[];
  /** Worst-rated statistics — VRChat's overall rank is the worst single stat. */
  worst: StatRow[];
  /** The rank those numbers imply, which may differ from the logged one. */
  computed: PerfRank | null;
}

/**
 * Rate every statistic we have a number for.
 *
 * The overall rank comes back as the worst individual rating, which is how
 * VRChat derives it. It can disagree with the rank in the log — the log's is
 * authoritative because it saw statistics we don't parse, and a disagreement is
 * worth showing rather than hiding.
 */
export function analyzeStats(stats: AvatarStats | undefined): PerfAnalysis {
  if (!stats) return { rows: [], worst: [], computed: null };

  const rows: StatRow[] = [];
  for (const limit of PC_LIMITS) {
    const value = stats[limit.key];
    if (typeof value !== 'number' || Number.isNaN(value)) continue;
    const rank = rankForValue(limit, value);
    const poorLimit = limit.thresholds[3];
    const betterIndex = RANK_ORDER.indexOf(rank) - 1;
    const nextLimit = betterIndex >= 0 ? limit.thresholds[betterIndex] : null;
    rows.push({
      key: limit.key,
      label: limit.label,
      noun: limit.noun,
      value,
      rank,
      advice: limit.advice,
      nextLimit,
      nextRank: nextLimit == null ? null : rankForValue(limit, nextLimit),
      fill: poorLimit > 0 ? Math.min(1, value / poorLimit) : (value > 0 ? 1 : 0),
    });
  }

  if (rows.length === 0) return { rows: [], worst: [], computed: null };

  let worstIndex = 0;
  for (const row of rows) worstIndex = Math.max(worstIndex, RANK_ORDER.indexOf(row.rank));
  const computed = RANK_ORDER[worstIndex];

  // Sort worst-first so the expensive things are read first.
  rows.sort((a, b) => RANK_ORDER.indexOf(b.rank) - RANK_ORDER.indexOf(a.rank) || b.fill - a.fill);

  return {
    rows,
    // Only call something an offender if it's actually dragging the rank down.
    worst: computed === 'Excellent' ? [] : rows.filter(r => r.rank === computed),
    computed,
  };
}

/** "Very Poor because of 340,000 triangles" — the one-line version. */
export function summarize(analysis: PerfAnalysis): string | null {
  if (analysis.worst.length === 0) return null;
  const names = analysis.worst.slice(0, 2).map(w => `${w.value.toLocaleString()} ${w.noun}`);
  const extra = analysis.worst.length > 2 ? ` and ${analysis.worst.length - 2} more` : '';
  return `${names.join(', ')}${extra}`;
}

// ── VRChat's API spelling ───────────────────────────────────────────────
//
// The log writes "Very Poor"; the API's unityPackages[].performanceRating
// writes "VeryPoor", and "None" for an avatar that was never rated. Both
// end up in the same badge, so they need one spelling.

/** "VeryPoor" | "very poor" | "Very Poor" → 'Very Poor'. "None"/junk → null. */
export function normalizeApiRank(raw: string | undefined | null): PerfRank | null {
  if (!raw) return null;
  const k = raw.replace(/[\s_-]+/g, '').toLowerCase();
  if (k === 'verypoor') return 'Very Poor';
  if (k === 'poor') return 'Poor';
  if (k === 'medium') return 'Medium';
  if (k === 'good') return 'Good';
  if (k === 'excellent') return 'Excellent';
  return null;
}

export interface PlatformRank {
  /** VRChat's platform string: "standalonewindows" | "android" | "ios" | … */
  platform: string;
  /** Friendly name for the badge. */
  label: string;
  rank: PerfRank;
}

function platformLabel(platform: string): string {
  const p = platform.toLowerCase();
  if (p.includes('android')) return 'Quest';
  if (p.includes('ios')) return 'iOS';
  if (p.includes('windows') || p.includes('standalone')) return 'PC';
  return platform;
}

/**
 * The rated builds of an avatar, one row per platform.
 *
 * VRChat uploads a separate package per platform and rates each on its own —
 * an avatar can be Good on PC and Very Poor on Quest. Where a platform has
 * several packages (an older Unity version still hanging around) the worst
 * rating wins, because that is the one some clients will actually download.
 */
export function platformRanks(
  packages: Array<{ platform?: string; performanceRating?: string }> | undefined,
): PlatformRank[] {
  if (!packages?.length) return [];
  const worstByPlatform = new Map<string, PerfRank>();
  for (const pkg of packages) {
    if (!pkg?.platform) continue;
    const rank = normalizeApiRank(pkg.performanceRating);
    if (!rank) continue;
    const seen = worstByPlatform.get(pkg.platform);
    if (!seen || RANK_ORDER.indexOf(rank) > RANK_ORDER.indexOf(seen)) {
      worstByPlatform.set(pkg.platform, rank);
    }
  }
  return [...worstByPlatform.entries()]
    .map(([platform, rank]) => ({ platform, label: platformLabel(platform), rank }))
    // PC first — it's the platform the ranks in this app are measured against.
    .sort((a, b) => (a.label === 'PC' ? -1 : b.label === 'PC' ? 1 : a.label.localeCompare(b.label)));
}
