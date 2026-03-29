import { useState, useMemo, useRef } from 'react';
import {
  FileText, Upload, UserPlus, UserMinus, Globe, Video, Link2,
  Compass, Trash2, Filter, Clock, ChevronDown, ChevronRight,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { useGameLogStore, GameLogSession, GameLogEntry } from '../stores/gameLogStore';
import SearchInput from '../components/common/SearchInput';
import EmptyState from '../components/common/EmptyState';
import LoadingSpinner from '../components/common/LoadingSpinner';

const typeIcons: Record<GameLogEntry['type'], typeof FileText> = {
  player_joined: UserPlus,
  player_left: UserMinus,
  world_visit: Globe,
  video_play: Video,
  portal_dropped: Compass,
  screenshot: FileText,
  notification: FileText,
  error: FileText,
  sdk_log: FileText,
};

const typeColors: Record<GameLogEntry['type'], string> = {
  player_joined: 'text-green-400',
  player_left: 'text-red-400',
  world_visit: 'text-blue-400',
  video_play: 'text-purple-400',
  portal_dropped: 'text-amber-400',
  screenshot: 'text-cyan-400',
  notification: 'text-surface-400',
  error: 'text-red-500',
  sdk_log: 'text-surface-500',
};

const typeLabels: Record<GameLogEntry['type'], string> = {
  player_joined: 'Joined',
  player_left: 'Left',
  world_visit: 'World',
  video_play: 'Video',
  portal_dropped: 'Portal',
  screenshot: 'Screenshot',
  notification: 'Notification',
  error: 'Error',
  sdk_log: 'SDK',
};

type LogTab = 'sessions' | 'players' | 'videos' | 'all';

function entryDescription(e: GameLogEntry): string {
  switch (e.type) {
    case 'player_joined': return `${e.playerName} joined`;
    case 'player_left': return `${e.playerName} left`;
    case 'world_visit': return e.worldName ? `Entered: ${e.worldName}` : `Joined ${e.worldId}`;
    case 'video_play': return e.videoUrl || e.message || 'Video played';
    case 'portal_dropped': return 'Portal dropped';
    case 'screenshot': return e.message || 'Screenshot taken';
    default: return e.message || '';
  }
}

function SessionRow({ session, defaultOpen }: { session: GameLogSession; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const duration = session.endTime
    ? Math.round((session.endTime - session.startTime) / 60000)
    : null;

  return (
    <div className="glass-panel-solid overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 p-3 hover:bg-surface-800/40 transition-colors text-left"
      >
        {open ? <ChevronDown size={16} className="text-surface-500 flex-shrink-0" /> : <ChevronRight size={16} className="text-surface-500 flex-shrink-0" />}
        <Globe size={16} className="text-accent-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">
            {session.worldName || session.worldId || 'Unknown World'}
          </div>
          <div className="text-xs text-surface-500">
            {format(session.startTime, 'MMM d, HH:mm')}
            {duration !== null ? ` · ${duration}m` : ''}
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-surface-500 flex-shrink-0">
          <span className="flex items-center gap-1 text-green-400">
            <UserPlus size={12} /> {session.playerJoins}
          </span>
          <span className="flex items-center gap-1 text-red-400">
            <UserMinus size={12} /> {session.playerLeaves}
          </span>
          <span>{session.entries.length} events</span>
        </div>
      </button>

      {open && (
        <div className="border-t border-surface-800/50 max-h-80 overflow-y-auto">
          {session.entries.map(entry => {
            const Icon = typeIcons[entry.type] || FileText;
            const color = typeColors[entry.type];
            return (
              <div key={entry.id} className="flex items-start gap-3 px-4 py-2 hover:bg-surface-800/30 transition-colors">
                <div className={`mt-0.5 flex-shrink-0 ${color}`}>
                  <Icon size={13} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-xs ${entry.type === 'sdk_log' ? 'text-surface-500' : ''}`}>
                    {entry.type === 'video_play' && entry.videoUrl ? (
                      <a
                        href={entry.videoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-purple-400 hover:underline break-all"
                        onClick={e => { e.preventDefault(); window.electronAPI?.openExternal(entry.videoUrl!); }}
                      >
                        {entry.videoUrl}
                      </a>
                    ) : (
                      entryDescription(entry)
                    )}
                  </div>
                </div>
                <div className="text-[10px] text-surface-700 flex-shrink-0">
                  {entry.rawTimestamp ? format(entry.timestamp, 'HH:mm:ss') : ''}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function GameLogPage() {
  const { entries, sessions, isLoading, loadLogFromFile, clearLog, getVideoUrls, getPlayerEvents } = useGameLogStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<LogTab>('sessions');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<GameLogEntry['type'] | 'all'>('all');

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await loadLogFromFile(file);
    e.target.value = '';
  };

  const videoUrls = getVideoUrls();
  const playerEvents = getPlayerEvents();

  const filteredEntries = useMemo(() => {
    let list = [...entries];
    if (typeFilter !== 'all') list = list.filter(e => e.type === typeFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(e =>
        entryDescription(e).toLowerCase().includes(q) ||
        e.playerName?.toLowerCase().includes(q) ||
        e.worldName?.toLowerCase().includes(q) ||
        e.message?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [entries, typeFilter, search]);

  const uniquePlayers = useMemo(() => {
    const map = new Map<string, { name: string; joins: number; leaves: number; lastSeen: number }>();
    for (const e of entries) {
      if (e.playerName && (e.type === 'player_joined' || e.type === 'player_left')) {
        const existing = map.get(e.playerName) || { name: e.playerName, joins: 0, leaves: 0, lastSeen: e.timestamp };
        if (e.type === 'player_joined') existing.joins++;
        else existing.leaves++;
        existing.lastSeen = Math.max(existing.lastSeen, e.timestamp);
        map.set(e.playerName, existing);
      }
    }
    return [...map.values()].sort((a, b) => b.lastSeen - a.lastSeen);
  }, [entries]);

  return (
    <div className="max-w-5xl mx-auto space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Game Log</h1>
          <p className="text-sm text-surface-400 mt-0.5">
            Parse VRChat log files to see player events, world visits, and video URLs
          </p>
        </div>
        <div className="flex gap-2">
          {entries.length > 0 && (
            <button onClick={clearLog} className="btn-secondary text-sm flex items-center gap-1.5">
              <Trash2 size={14} /> Clear
            </button>
          )}
          <button onClick={() => fileRef.current?.click()} className="btn-primary text-sm flex items-center gap-1.5">
            <Upload size={14} /> Load Log File
          </button>
          <input ref={fileRef} type="file" accept=".txt,.log" className="hidden" onChange={handleFileChange} />
        </div>
      </div>

      {/* Log path hint */}
      <div className="glass-panel p-3 text-xs text-surface-500">
        <span className="font-medium text-surface-400">Default log location: </span>
        <span className="font-mono">%AppData%\..\LocalLow\VRChat\VRChat\output_log_*.txt</span>
        <span className="mx-2 text-surface-700">·</span>
        <span className="font-mono">~/Library/Logs/VRChat/output_log_*.txt</span>
      </div>

      {isLoading ? (
        <LoadingSpinner className="py-16" />
      ) : entries.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No log loaded"
          description="Click 'Load Log File' to select a VRChat output log file"
          action={
            <button onClick={() => fileRef.current?.click()} className="btn-primary text-sm flex items-center gap-2">
              <Upload size={16} /> Load Log File
            </button>
          }
        />
      ) : (
        <>
          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Sessions" value={sessions.length} color="text-blue-400" bg="bg-blue-500/10" />
            <StatCard label="Player Joins" value={playerEvents.filter(e => e.type === 'player_joined').length} color="text-green-400" bg="bg-green-500/10" />
            <StatCard label="Unique Players" value={uniquePlayers.length} color="text-accent-400" bg="bg-accent-500/10" />
            <StatCard label="Videos Played" value={videoUrls.length} color="text-purple-400" bg="bg-purple-500/10" />
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-surface-800 pb-px">
            {([
              { key: 'sessions' as LogTab, label: `Sessions (${sessions.length})` },
              { key: 'players' as LogTab, label: `Players (${uniquePlayers.length})` },
              { key: 'videos' as LogTab, label: `Videos (${videoUrls.length})` },
              { key: 'all' as LogTab, label: `All Events (${entries.length})` },
            ]).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === key ? 'tab-active' : 'tab-inactive'}`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {tab === 'sessions' && (
            <div className="space-y-2">
              {sessions.length === 0 ? (
                <p className="text-surface-500 text-sm py-4 text-center">No sessions found in log</p>
              ) : (
                sessions.map((s, i) => <SessionRow key={s.id} session={s} defaultOpen={i === 0} />)
              )}
            </div>
          )}

          {tab === 'players' && (
            <div className="space-y-1">
              {uniquePlayers.map(p => (
                <div key={p.name} className="glass-panel-solid p-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-surface-800 flex items-center justify-center text-sm font-bold text-surface-400">
                    {p.name[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{p.name}</div>
                    <div className="text-xs text-surface-500">
                      Last seen {formatDistanceToNow(p.lastSeen, { addSuffix: true })}
                    </div>
                  </div>
                  <div className="flex gap-3 text-xs">
                    <span className="flex items-center gap-1 text-green-400"><UserPlus size={12} /> {p.joins}</span>
                    <span className="flex items-center gap-1 text-red-400"><UserMinus size={12} /> {p.leaves}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'videos' && (
            <div className="space-y-1">
              {videoUrls.length === 0 ? (
                <p className="text-surface-500 text-sm py-4 text-center">No video URLs found in log</p>
              ) : videoUrls.map(e => (
                <div key={e.id} className="glass-panel-solid p-3 flex items-start gap-3">
                  <Video size={16} className="text-purple-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <a
                      href={e.videoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-purple-400 hover:underline break-all"
                      onClick={ev => { ev.preventDefault(); window.electronAPI?.openExternal(e.videoUrl!); }}
                    >
                      {e.videoUrl}
                    </a>
                    <div className="text-xs text-surface-600 mt-0.5">
                      {format(e.timestamp, 'MMM d, HH:mm:ss')}
                    </div>
                  </div>
                  <button
                    onClick={() => navigator.clipboard?.writeText(e.videoUrl || '')}
                    className="btn-ghost text-xs flex-shrink-0"
                  >
                    Copy
                  </button>
                </div>
              ))}
            </div>
          )}

          {tab === 'all' && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <SearchInput value={search} onChange={setSearch} placeholder="Filter events..." className="flex-1 max-w-sm" />
                <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as any)} className="input-field w-auto text-sm">
                  <option value="all">All Types</option>
                  <option value="player_joined">Player Joined</option>
                  <option value="player_left">Player Left</option>
                  <option value="world_visit">World Visit</option>
                  <option value="video_play">Video Play</option>
                  <option value="portal_dropped">Portal Dropped</option>
                </select>
              </div>
              <div className="space-y-0.5 max-h-[60vh] overflow-y-auto">
                {filteredEntries.slice(0, 500).map(e => {
                  const Icon = typeIcons[e.type] || FileText;
                  return (
                    <div key={e.id} className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg hover:bg-surface-800/40 transition-colors">
                      <Icon size={13} className={typeColors[e.type]} />
                      <span className={`badge text-[10px] ${typeColors[e.type]} bg-transparent`}>{typeLabels[e.type]}</span>
                      <span className="text-sm flex-1 min-w-0 truncate">{entryDescription(e)}</span>
                      <span className="text-xs text-surface-700 flex-shrink-0">{format(e.timestamp, 'HH:mm:ss')}</span>
                    </div>
                  );
                })}
                {filteredEntries.length > 500 && (
                  <p className="text-xs text-surface-500 text-center py-2">Showing first 500 of {filteredEntries.length} events</p>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, color, bg }: { label: string; value: number; color: string; bg: string }) {
  return (
    <div className={`glass-panel-solid p-3 flex items-center gap-3`}>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-surface-400">{label}</div>
    </div>
  );
}
