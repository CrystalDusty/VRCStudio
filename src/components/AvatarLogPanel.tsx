// The avatar log: every avatar we've seen each player change into.
//
// Lives on the Live Avatars page, under its own tab, because that page is
// already where "who is wearing what" is answered — this is the same question
// asked about the past. The setting that fills it lives here too rather than
// only in Settings, so the panel explains itself the first time it's opened
// empty.

import { useMemo, useState } from 'react';
import {
  History, Trash2, ChevronDown, Shirt, Search, Copy, Check,
  ExternalLink, AlertTriangle, X,
} from 'lucide-react';
import { useAvatarHistoryStore } from '../stores/avatarHistoryStore';
import { useSettingsStore } from '../stores/settingsStore';
import { groupByPlayer, KEEP_MIN, KEEP_MAX, type AvatarLogEntry } from '../utils/avatarHistory';
import { RankBadge, PerformanceStrip } from './AvatarPerformance';

export default function AvatarLogPanel() {
  const entries = useAvatarHistoryStore(s => s.entries);
  const clearAll = useAvatarHistoryStore(s => s.clearAll);
  const clearPlayer = useAvatarHistoryStore(s => s.clearPlayer);
  const applyLimit = useAvatarHistoryStore(s => s.applyLimit);
  const cfg = useSettingsStore(s => s.settings.avatarLog);
  const updateAvatarLog = useSettingsStore(s => s.updateAvatarLog);

  const [search, setSearch] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const players = useMemo(() => {
    const groups = groupByPlayer(entries);
    if (!search.trim()) return groups;
    const q = search.toLowerCase();
    return groups
      .map(g => ({
        ...g,
        entries: g.playerName.toLowerCase().includes(q)
          ? g.entries
          : g.entries.filter(e =>
              e.avatarName?.toLowerCase().includes(q) ||
              e.avatarId?.toLowerCase().includes(q) ||
              e.authorName?.toLowerCase().includes(q)),
      }))
      .filter(g => g.entries.length > 0);
  }, [entries, search]);

  const copy = (text: string) => {
    navigator.clipboard?.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="space-y-3">
      {/* ── Controls ── */}
      <div className="glass-panel-solid p-3 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <label className="flex items-start gap-2.5 cursor-pointer min-w-[240px] flex-1">
            <input
              type="checkbox"
              checked={cfg.enabled}
              onChange={e => updateAvatarLog({ enabled: e.target.checked })}
              className="mt-0.5 accent-accent-500 w-4 h-4"
            />
            <span>
              <span className="text-sm font-medium flex items-center gap-1.5">
                <History size={13} className="text-accent-400" />
                Keep a log of avatar changes
              </span>
              <span className="block text-[11px] text-surface-500 mt-0.5">
                Records the avatars players change into while you're in an instance
                with them, and keeps them after they leave.
              </span>
            </span>
          </label>

          <button
            onClick={() => (confirmClear ? (clearAll(), setConfirmClear(false)) : setConfirmClear(true))}
            onBlur={() => setConfirmClear(false)}
            disabled={entries.length === 0}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed ${
              confirmClear
                ? 'bg-rose-600/80 text-white hover:bg-rose-600'
                : 'bg-rose-500/10 text-rose-300 hover:bg-rose-500/20'
            }`}
            title="Permanently delete every logged avatar"
          >
            <Trash2 size={12} />
            {confirmClear ? `Delete ${entries.length} — click again` : 'Delete all logs'}
          </button>
        </div>

        {cfg.enabled && (
          <div className="space-y-3 pt-1">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-surface-400">Avatars kept per player</span>
                <span className="text-accent-300 font-semibold tabular-nums">{cfg.keepPerPlayer}</span>
              </div>
              <input
                type="range"
                min={KEEP_MIN}
                max={KEEP_MAX}
                step={1}
                value={cfg.keepPerPlayer}
                onChange={e => {
                  const keepPerPlayer = Number(e.target.value);
                  updateAvatarLog({ keepPerPlayer });
                  // Lowering the slider takes effect immediately rather than
                  // waiting for the next sighting to prune the overflow.
                  applyLimit(keepPerPlayer);
                }}
                className="w-full accent-accent-500"
              />
              <div className="flex justify-between text-[9px] text-surface-600">
                <span>{KEEP_MIN}</span><span>{KEEP_MAX}</span>
              </div>
            </div>

            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={cfg.includeSelf}
                onChange={e => updateAvatarLog({ includeSelf: e.target.checked })}
                className="accent-accent-500 w-3.5 h-3.5"
              />
              <span className="text-xs text-surface-400">Log my own avatar changes too</span>
            </label>
          </div>
        )}
      </div>

      {/* ── Empty states ── */}
      {!cfg.enabled && entries.length === 0 ? (
        <div className="glass-panel-solid p-8 text-center text-sm text-surface-400">
          <History size={28} className="mx-auto mb-2 opacity-30" />
          <p>Avatar logging is off.</p>
          <p className="text-xs text-surface-500 mt-1">
            Turn it on above and this fills up as players around you change avatars.
          </p>
        </div>
      ) : entries.length === 0 ? (
        <div className="glass-panel-solid p-8 text-center text-sm text-surface-400">
          <History size={28} className="mx-auto mb-2 opacity-30" />
          <p>Nothing logged yet.</p>
          <p className="text-xs text-surface-500 mt-1">
            The next avatar anyone changes into will show up here.
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[180px]">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-500" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Filter players, avatar names, authors, or IDs..."
                className="w-full bg-surface-800 text-sm pl-8 pr-8 py-1.5 rounded-lg border border-surface-700/40 focus:outline-none focus:border-accent-500/50 placeholder-surface-600"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300"
                >
                  <X size={12} />
                </button>
              )}
            </div>
            <span className="text-[11px] text-surface-500 whitespace-nowrap">
              {entries.length} avatar{entries.length === 1 ? '' : 's'} · {players.length} player
              {players.length === 1 ? '' : 's'}
            </span>
          </div>

          {!cfg.enabled && (
            <p className="text-[11px] text-amber-400/80 flex items-center gap-1.5">
              <AlertTriangle size={11} />
              Logging is off — these are the entries recorded before you turned it off.
            </p>
          )}

          <div className="space-y-1.5">
            {players.map(g => {
              const isOpen = open[g.playerName] ?? true;
              return (
                <div key={g.playerName} className="glass-panel-solid overflow-hidden">
                  <div className="flex items-center gap-2 p-2.5">
                    <button
                      onClick={() => setOpen(o => ({ ...o, [g.playerName]: !isOpen }))}
                      className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
                    >
                      <ChevronDown
                        size={13}
                        className={`text-surface-500 transition-transform flex-shrink-0 ${isOpen ? '' : '-rotate-90'}`}
                      />
                      <span className="text-sm font-semibold truncate">{g.playerName}</span>
                      <span className="text-[10px] text-surface-600 flex-shrink-0">
                        {g.entries.length} avatar{g.entries.length === 1 ? '' : 's'}
                      </span>
                      <span className="text-[10px] text-surface-600 flex-shrink-0 ml-auto">
                        {timeAgo(g.lastSeenAt)}
                      </span>
                    </button>
                    <button
                      onClick={() => clearPlayer(g.playerName)}
                      className="p-1.5 rounded text-surface-600 hover:text-rose-400 hover:bg-rose-500/10 transition-colors flex-shrink-0"
                      title={`Delete ${g.playerName}'s log`}
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>

                  {isOpen && (
                    <div className="border-t border-surface-800/60 divide-y divide-surface-800/40">
                      {g.entries.map((e, i) => (
                        <LogRow
                          key={`${e.avatarId ?? e.avatarName}-${e.firstSeenAt}-${i}`}
                          entry={e}
                          copied={copied}
                          onCopy={copy}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function LogRow({ entry, copied, onCopy }: {
  entry: AvatarLogEntry;
  copied: string | null;
  onCopy: (text: string) => void;
}) {
  const openAvtrdb = () => {
    if (!entry.avatarId) return;
    const url = `https://avtrdb.com/avatar/${entry.avatarId}`;
    if (window.electronAPI?.openExternal) window.electronAPI.openExternal(url);
    else window.open(url, '_blank');
  };

  return (
    <div className="flex items-start gap-2.5 p-2.5 hover:bg-surface-800/30 transition-colors">
      {entry.thumbnailUrl ? (
        <img
          src={entry.thumbnailUrl}
          alt=""
          className="w-10 h-10 rounded-lg object-cover bg-surface-800 flex-shrink-0"
          loading="lazy"
        />
      ) : (
        <div className="w-10 h-10 rounded-lg bg-surface-800 flex items-center justify-center flex-shrink-0">
          <Shirt size={14} className="text-surface-600" />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[13px] font-medium truncate">
            {entry.avatarName ?? 'Unnamed avatar'}
          </span>
          {entry.rank && <RankBadge rank={entry.rank} size="xs" />}
        </div>
        <div className="text-[10px] text-surface-500 flex items-center gap-2 flex-wrap mt-0.5">
          {entry.authorName && <span>by {entry.authorName}</span>}
          <span title={new Date(entry.lastSeenAt).toLocaleString()}>{timeAgo(entry.lastSeenAt)}</span>
          {entry.worldName && <span className="truncate max-w-[160px]">in {entry.worldName}</span>}
          {entry.avatarId && (
            <button
              onClick={() => onCopy(entry.avatarId!)}
              className="font-mono text-surface-500 hover:text-surface-300 inline-flex items-center gap-1"
              title="Copy avatar ID"
            >
              {entry.avatarId.slice(0, 12)}…
              {copied === entry.avatarId ? <Check size={9} className="text-green-400" /> : <Copy size={9} />}
            </button>
          )}
        </div>
        <PerformanceStrip stats={entry.stats} rank={entry.rank} />
      </div>

      {entry.avatarId && (
        <button
          onClick={openAvtrdb}
          className="p-1.5 rounded text-surface-500 hover:text-surface-200 hover:bg-surface-800 transition-colors flex-shrink-0"
          title="Open on avtrdb.com"
        >
          <ExternalLink size={12} />
        </button>
      )}
    </div>
  );
}

function timeAgo(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}
