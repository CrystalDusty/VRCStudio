import { useState, useMemo } from 'react';
import { Users, UserX, MapPin, Clock, StickyNote, Tag, Filter } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useFriendStore } from '../stores/friendStore';
import { useWorldStore } from '../stores/worldStore';
import SearchInput from '../components/common/SearchInput';
import UserAvatar from '../components/common/UserAvatar';
import EmptyState from '../components/common/EmptyState';
import type { VRCUser, UserStatus } from '../types/vrchat';

type FriendTab = 'online' | 'offline' | 'all';
type SortBy = 'name' | 'status' | 'location';

const statusOrder: Record<UserStatus, number> = {
  'join me': 0,
  'active': 1,
  'ask me': 2,
  'busy': 3,
  'offline': 4,
};

export default function FriendsPage() {
  const { onlineFriends, offlineFriends, notes, setNote, getNote } = useFriendStore();
  const [tab, setTab] = useState<FriendTab>('online');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('status');
  const [selectedUser, setSelectedUser] = useState<VRCUser | null>(null);
  const [editingNote, setEditingNote] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [statusFilter, setStatusFilter] = useState<UserStatus | 'all'>('all');

  const friends = useMemo(() => {
    let list: VRCUser[] = [];
    switch (tab) {
      case 'online': list = [...onlineFriends]; break;
      case 'offline': list = [...offlineFriends]; break;
      case 'all': list = [...onlineFriends, ...offlineFriends]; break;
    }

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(f =>
        f.displayName.toLowerCase().includes(q) ||
        f.statusDescription?.toLowerCase().includes(q) ||
        notes[f.id]?.note?.toLowerCase().includes(q) ||
        notes[f.id]?.tags?.some(t => t.toLowerCase().includes(q))
      );
    }

    if (statusFilter !== 'all') {
      list = list.filter(f => f.status === statusFilter);
    }

    switch (sortBy) {
      case 'name':
        list.sort((a, b) => a.displayName.localeCompare(b.displayName));
        break;
      case 'status':
        list.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]
          || a.displayName.localeCompare(b.displayName));
        break;
    }

    return list;
  }, [tab, onlineFriends, offlineFriends, search, sortBy, statusFilter, notes]);

  // Group friends by their world location
  const locationGroups = useMemo(() => {
    if (tab !== 'online') return null;
    const groups = new Map<string, VRCUser[]>();
    for (const f of friends) {
      const loc = f.location || 'private';
      if (!groups.has(loc)) groups.set(loc, []);
      groups.get(loc)!.push(f);
    }
    return groups;
  }, [friends, tab]);

  const openNoteEditor = (user: VRCUser) => {
    setSelectedUser(user);
    setNoteText(getNote(user.id)?.note || '');
    setEditingNote(true);
  };

  const saveNote = () => {
    if (selectedUser) {
      setNote(selectedUser.id, noteText);
      setEditingNote(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Friends</h1>
        <div className="text-sm text-surface-400">
          {onlineFriends.length} online / {onlineFriends.length + offlineFriends.length} total
        </div>
      </div>

      {/* Tabs & Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex bg-surface-900 rounded-lg p-0.5">
          {(['online', 'offline', 'all'] as FriendTab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                tab === t ? 'bg-accent-600 text-white' : 'text-surface-400 hover:text-white'
              }`}
            >
              {t === 'online' ? `Online (${onlineFriends.length})` :
               t === 'offline' ? `Offline (${offlineFriends.length})` :
               `All (${onlineFriends.length + offlineFriends.length})`}
            </button>
          ))}
        </div>

        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search friends, notes, tags..."
          className="flex-1 max-w-xs"
        />

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
          className="input-field w-auto text-sm"
        >
          <option value="status">Sort by Status</option>
          <option value="name">Sort by Name</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as UserStatus | 'all')}
          className="input-field w-auto text-sm"
        >
          <option value="all">All Statuses</option>
          <option value="join me">Join Me</option>
          <option value="active">Online</option>
          <option value="ask me">Ask Me</option>
          <option value="busy">Busy</option>
        </select>
      </div>

      {/* Friend List */}
      {friends.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No friends found"
          description={search ? 'Try a different search term' : 'Friends will appear when data loads'}
        />
      ) : (
        <div className="space-y-1">
          {friends.map(friend => {
            const note = notes[friend.id];
            return (
              <div
                key={friend.id}
                className="glass-panel-solid p-3 flex items-center gap-3 card-hover cursor-pointer group"
                onClick={() => setSelectedUser(selectedUser?.id === friend.id ? null : friend)}
              >
                <UserAvatar
                  src={friend.currentAvatarThumbnailImageUrl}
                  status={friend.status}
                  size="md"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{friend.displayName}</span>
                    {note?.tags?.map(tag => (
                      <span key={tag} className="badge bg-accent-600/20 text-accent-400 text-[10px]">
                        {tag}
                      </span>
                    ))}
                  </div>
                  <div className="text-xs text-surface-500 truncate">
                    {friend.statusDescription || friend.status}
                  </div>
                </div>

                {friend.location && friend.location !== 'private' && friend.location !== 'offline' && (
                  <div className="flex items-center gap-1 text-xs text-surface-500">
                    <MapPin size={12} />
                    <span className="max-w-[150px] truncate">
                      {friend.location.split(':')[0]}
                    </span>
                  </div>
                )}

                {friend.location === 'private' && friend.status !== 'offline' && (
                  <span className="text-xs text-surface-600">Private</span>
                )}

                {note?.note && (
                  <div className="text-xs text-amber-400/70 flex items-center gap-1">
                    <StickyNote size={12} />
                  </div>
                )}

                <button
                  onClick={(e) => { e.stopPropagation(); openNoteEditor(friend); }}
                  className="opacity-0 group-hover:opacity-100 btn-ghost text-xs"
                >
                  Note
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Note Editor Modal */}
      {editingNote && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
             onClick={() => setEditingNote(false)}>
          <div className="glass-panel p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-1">Note for {selectedUser.displayName}</h3>
            <p className="text-xs text-surface-400 mb-4">Add a personal note or tags for this friend</p>

            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              className="input-field h-24 resize-none mb-3"
              placeholder="Write a note..."
              autoFocus
            />

            <div className="flex justify-end gap-2">
              <button onClick={() => setEditingNote(false)} className="btn-secondary text-sm">
                Cancel
              </button>
              <button onClick={saveNote} className="btn-primary text-sm">
                Save Note
              </button>
            </div>
          </div>
        </div>
      )}

      {/* User Detail Panel */}
      {selectedUser && !editingNote && (
        <div className="fixed right-0 top-0 bottom-0 w-80 bg-surface-900 border-l border-surface-800 p-4 z-40
                        overflow-y-auto animate-slide-in shadow-2xl">
          <button
            onClick={() => setSelectedUser(null)}
            className="absolute top-3 right-3 btn-ghost text-xs"
          >
            Close
          </button>

          <div className="text-center pt-4 pb-4">
            <img
              src={selectedUser.profilePicOverride || selectedUser.currentAvatarThumbnailImageUrl}
              alt=""
              className="w-20 h-20 rounded-full mx-auto object-cover bg-surface-800"
            />
            <h3 className="text-lg font-bold mt-3">{selectedUser.displayName}</h3>
            <p className="text-sm text-surface-400">{selectedUser.statusDescription || selectedUser.status}</p>
          </div>

          <div className="space-y-3 text-sm">
            <div className="glass-panel p-3">
              <div className="text-xs text-surface-500 mb-1">Status</div>
              <div className="capitalize">{selectedUser.status}</div>
            </div>

            {selectedUser.bio && (
              <div className="glass-panel p-3">
                <div className="text-xs text-surface-500 mb-1">Bio</div>
                <div className="text-surface-300 whitespace-pre-wrap text-xs">{selectedUser.bio}</div>
              </div>
            )}

            {selectedUser.location && selectedUser.location !== 'offline' && (
              <div className="glass-panel p-3">
                <div className="text-xs text-surface-500 mb-1">Location</div>
                <div className="flex items-center gap-1.5">
                  <MapPin size={14} className="text-accent-400" />
                  <span className="truncate">
                    {selectedUser.location === 'private' ? 'Private World' : selectedUser.location}
                  </span>
                </div>
              </div>
            )}

            {selectedUser.last_login && (
              <div className="glass-panel p-3">
                <div className="text-xs text-surface-500 mb-1">Last Login</div>
                <div className="flex items-center gap-1.5">
                  <Clock size={14} />
                  {formatDistanceToNow(new Date(selectedUser.last_login), { addSuffix: true })}
                </div>
              </div>
            )}

            {selectedUser.date_joined && (
              <div className="glass-panel p-3">
                <div className="text-xs text-surface-500 mb-1">Joined VRChat</div>
                <div>{new Date(selectedUser.date_joined).toLocaleDateString()}</div>
              </div>
            )}

            {notes[selectedUser.id]?.note && (
              <div className="glass-panel p-3 border-amber-500/20">
                <div className="text-xs text-amber-400 mb-1 flex items-center gap-1">
                  <StickyNote size={12} /> Your Note
                </div>
                <div className="text-surface-300 text-xs">{notes[selectedUser.id].note}</div>
              </div>
            )}

            <button
              onClick={() => openNoteEditor(selectedUser)}
              className="btn-secondary w-full text-sm"
            >
              {notes[selectedUser.id]?.note ? 'Edit Note' : 'Add Note'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
