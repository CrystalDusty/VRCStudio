import { useState, useMemo } from 'react';
import { History, UserPlus, UserMinus, RefreshCw, Trash2, Filter } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { useFriendLogStore, FriendLogEntry } from '../stores/friendLogStore';
import SearchInput from '../components/common/SearchInput';
import UserAvatar from '../components/common/UserAvatar';
import EmptyState from '../components/common/EmptyState';

const typeIcons: Record<FriendLogEntry['type'], typeof History> = {
  added: UserPlus,
  removed: UserMinus,
  name_change: RefreshCw,
  status_change: RefreshCw,
};

const typeColors: Record<FriendLogEntry['type'], string> = {
  added: 'text-green-400 bg-green-500/10',
  removed: 'text-red-400 bg-red-500/10',
  name_change: 'text-amber-400 bg-amber-500/10',
  status_change: 'text-blue-400 bg-blue-500/10',
};

const typeLabels: Record<FriendLogEntry['type'], string> = {
  added: 'Friend Added',
  removed: 'Friend Removed',
  name_change: 'Name Changed',
  status_change: 'Status Changed',
};

function eventDescription(entry: FriendLogEntry): string {
  switch (entry.type) {
    case 'added': return `${entry.displayName} was added as a friend`;
    case 'removed': return `${entry.displayName} was removed from friends`;
    case 'name_change': return `Changed name from "${entry.previousValue}" to "${entry.newValue}"`;
    case 'status_change': return `Changed status from "${entry.previousValue}" to "${entry.newValue}"`;
    default: return entry.details || '';
  }
}

export default function FriendLogPage() {
  const { entries, clearLog } = useFriendLogStore();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<FriendLogEntry['type'] | 'all'>('all');

  const filtered = useMemo(() => {
    let list = [...entries];
    if (typeFilter !== 'all') {
      list = list.filter(e => e.type === typeFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(e =>
        e.displayName.toLowerCase().includes(q) ||
        e.userId.toLowerCase().includes(q) ||
        e.details?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [entries, search, typeFilter]);

  // Group entries by date
  const groupedByDate = useMemo(() => {
    const groups: Record<string, FriendLogEntry[]> = {};
    for (const entry of filtered) {
      const date = format(entry.timestamp, 'yyyy-MM-dd');
      if (!groups[date]) groups[date] = [];
      groups[date].push(entry);
    }
    return groups;
  }, [filtered]);

  return (
    <div className="max-w-4xl mx-auto space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Friend Log</h1>
          <p className="text-sm text-surface-400 mt-0.5">
            Historical record of friendship changes and name changes
          </p>
        </div>
        {entries.length > 0 && (
          <button onClick={clearLog} className="btn-danger text-sm flex items-center gap-1">
            <Trash2 size={14} /> Clear Log
          </button>
        )}
      </div>

      <div className="flex gap-3 items-center">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by name or ID..."
          className="flex-1 max-w-sm"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as any)}
          className="input-field w-auto text-sm"
        >
          <option value="all">All Types</option>
          <option value="added">Friend Added</option>
          <option value="removed">Friend Removed</option>
          <option value="name_change">Name Changes</option>
          <option value="status_change">Status Changes</option>
        </select>
      </div>

      {/* Stats bar */}
      {entries.length > 0 && (
        <div className="flex gap-4 text-sm">
          <div className="glass-panel px-3 py-2 flex items-center gap-2">
            <span className="text-surface-500">Total Events:</span>
            <span className="font-semibold">{entries.length}</span>
          </div>
          <div className="glass-panel px-3 py-2 flex items-center gap-2">
            <span className="text-green-400">Added:</span>
            <span className="font-semibold">{entries.filter(e => e.type === 'added').length}</span>
          </div>
          <div className="glass-panel px-3 py-2 flex items-center gap-2">
            <span className="text-red-400">Removed:</span>
            <span className="font-semibold">{entries.filter(e => e.type === 'removed').length}</span>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={History}
          title={entries.length === 0 ? 'No friend log entries yet' : 'No matching entries'}
          description={entries.length === 0
            ? 'Events will be recorded as friends are added, removed, or change their names'
            : 'Try different search terms or filters'}
        />
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedByDate).map(([date, dayEntries]) => (
            <div key={date}>
              <div className="sticky top-0 z-10 bg-surface-950/90 backdrop-blur-sm py-2 mb-2">
                <h3 className="text-xs font-semibold text-surface-500 uppercase tracking-wider">
                  {format(new Date(date), 'EEEE, MMMM d, yyyy')}
                </h3>
              </div>
              <div className="space-y-1">
                {dayEntries.map(entry => {
                  const Icon = typeIcons[entry.type];
                  const colorClass = typeColors[entry.type];
                  return (
                    <div key={entry.id} className="glass-panel-solid p-3 flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${colorClass}`}>
                        <Icon size={16} />
                      </div>
                      {entry.avatarUrl && (
                        <UserAvatar src={entry.avatarUrl} size="sm" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm">{eventDescription(entry)}</div>
                        <div className="text-xs text-surface-600 mt-0.5">
                          {format(entry.timestamp, 'HH:mm:ss')} &middot;{' '}
                          {formatDistanceToNow(entry.timestamp, { addSuffix: true })}
                        </div>
                      </div>
                      <span className={`badge ${colorClass} text-[10px]`}>
                        {typeLabels[entry.type]}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
