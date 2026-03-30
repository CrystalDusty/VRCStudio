import { useState, useMemo, useEffect } from 'react';
import {
  Users, MapPin, StickyNote, UserMinus, Globe,
  ChevronRight, RefreshCw, X,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { useFriendStore } from '../stores/friendStore';
import { useWorldStore } from '../stores/worldStore';
import SearchInput from '../components/common/SearchInput';
import UserAvatar from '../components/common/UserAvatar';
import EmptyState from '../components/common/EmptyState';
import LoadingSpinner from '../components/common/LoadingSpinner';
import InstanceModal from '../components/InstanceModal';
import type { VRCUser, UserStatus, VRCWorld } from '../types/vrchat';
import api from '../api/vrchat';

type FriendTab = 'online' | 'offline' | 'all' | 'gps';
type SortBy = 'name' | 'status';

const statusOrder: Record<UserStatus, number> = {
  'join me': 0, 'active': 1, 'ask me': 2, 'busy': 3, 'offline': 4,
};

const statusDotColors: Record<UserStatus, string> = {
  'join me': 'bg-status-joinme',
  'active': 'bg-status-online',
  'ask me': 'bg-status-askme',
  'busy': 'bg-status-busy',
  'offline': 'bg-status-offline',
};

function useDetailPanel() {
  const [user, setUser] = useState<VRCUser | null>(null);
  const [fullUser, setFullUser] = useState<VRCUser | null>(null);
  const [mutuals, setMutuals] = useState<VRCUser[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const open = async (u: VRCUser) => {
    setUser(u);
    setFullUser(null);
    setMutuals([]);
    setLoadingDetail(true);
    try {
      const [detail, mutualsRes] = await Promise.allSettled([
        api.getUser(u.id),
        api.getMutualFriends(u.id),
      ]);
      if (detail.status === 'fulfilled') setFullUser(detail.value);
      if (mutualsRes.status === 'fulfilled') setMutuals(Array.isArray(mutualsRes.value) ? mutualsRes.value : []);
    } catch {}
    setLoadingDetail(false);
  };

  const close = () => { setUser(null); setFullUser(null); setMutuals([]); };

  return { user, fullUser, mutuals, loadingDetail, open, close };
}

export default function FriendsPage() {
  const { onlineFriends, offlineFriends, notes, setNote, isLoading, fetchAllFriends } = useFriendStore();
  const { worldCache, getWorld } = useWorldStore();
  const [tab, setTab] = useState<FriendTab>('online');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('status');
  const [statusFilter, setStatusFilter] = useState<UserStatus | 'all'>('all');
  const detail = useDetailPanel();
  const [editingNote, setEditingNote] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteTagInput, setNoteTagInput] = useState('');
  const [noteTags, setNoteTags] = useState<string[]>([]);
  const [instanceModal, setInstanceModal] = useState<{ worldId: string; instanceId: string } | null>(null);

  // GPS: group online friends by world
  const worldGroups = useMemo(() => {
    const groups = new Map<string, { worldId: string; worldName: string; friends: VRCUser[] }>();
    for (const f of onlineFriends) {
      if (!f.location || f.location === 'private' || f.location === 'offline') continue;
      const [worldId] = f.location.split(':');
      if (!worldId || !worldId.startsWith('wrld_')) continue;
      const world = worldCache[worldId];
      const key = f.location;
      if (!groups.has(key)) {
        groups.set(key, { worldId, worldName: world?.name || worldId, friends: [] });
        if (!world) getWorld(worldId).catch(() => {});
      }
      groups.get(key)!.friends.push(f);
    }
    return [...groups.entries()]
      .map(([loc, g]) => ({ ...g, location: loc, instanceId: loc.split(':')[1] || '' }))
      .sort((a, b) => b.friends.length - a.friends.length);
  }, [onlineFriends, worldCache]);

  const friends = useMemo(() => {
    let list: VRCUser[] = [];
    if (tab === 'online') list = [...onlineFriends];
    else if (tab === 'offline') list = [...offlineFriends];
    else if (tab === 'all') list = [...onlineFriends, ...offlineFriends];
    else return [];

    if (statusFilter !== 'all') list = list.filter(f => f.status === statusFilter);

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(f =>
        f.displayName.toLowerCase().includes(q) ||
        f.statusDescription?.toLowerCase().includes(q) ||
        notes[f.id]?.note?.toLowerCase().includes(q) ||
        notes[f.id]?.tags?.some(t => t.toLowerCase().includes(q))
      );
    }

    if (sortBy === 'status') {
      list.sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || a.displayName.localeCompare(b.displayName));
    } else {
      list.sort((a, b) => a.displayName.localeCompare(b.displayName));
    }
    return list;
  }, [tab, onlineFriends, offlineFriends, search, sortBy, statusFilter, notes]);

  const openNoteEditor = (u: VRCUser) => {
    const n = notes[u.id];
    setNoteText(n?.note || '');
    setNoteTags(n?.tags || []);
    setNoteTagInput('');
    setEditingNote(true);
  };

  const saveNote = () => {
    if (detail.user) {
      setNote(detail.user.id, noteText, noteTags);
      setEditingNote(false);
    }
  };

  const addTag = () => {
    const t = noteTagInput.trim();
    if (t && !noteTags.includes(t)) setNoteTags(prev => [...prev, t]);
    setNoteTagInput('');
  };

  const privateCount = onlineFriends.filter(f => f.location === 'private').length;
  const travelingCount = onlineFriends.filter(f => f.travelingToLocation).length;

  return (
    <div className={`max-w-5xl mx-auto space-y-4 animate-fade-in ${detail.user ? 'mr-80' : ''}`}>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Friends</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-surface-400">
            {onlineFriends.length} online / {onlineFriends.length + offlineFriends.length} total
          </span>
          <button onClick={fetchAllFriends} disabled={isLoading} className="btn-ghost text-xs flex items-center gap-1">
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-surface-800 pb-px">
        {([
          { key: 'online' as FriendTab, label: `Online (${onlineFriends.length})` },
          { key: 'offline' as FriendTab, label: `Offline (${offlineFriends.length})` },
          { key: 'all' as FriendTab, label: `All (${onlineFriends.length + offlineFriends.length})` },
          { key: 'gps' as FriendTab, label: `GPS Map (${worldGroups.length} worlds)` },
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

      {/* Filters (not GPS) */}
      {tab !== 'gps' && (
        <div className="flex items-center gap-3 flex-wrap">
          <SearchInput value={search} onChange={setSearch} placeholder="Search friends, notes, tags..." className="flex-1 max-w-xs" />
          <select value={sortBy} onChange={e => setSortBy(e.target.value as SortBy)} className="input-field w-auto text-sm">
            <option value="status">Sort by Status</option>
            <option value="name">Sort by Name</option>
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} className="input-field w-auto text-sm">
            <option value="all">All Statuses</option>
            <option value="join me">Join Me</option>
            <option value="active">Online</option>
            <option value="ask me">Ask Me</option>
            <option value="busy">Busy</option>
          </select>
        </div>
      )}

      {/* GPS Map View */}
      {tab === 'gps' && (
        <div className="space-y-3">
          {privateCount > 0 && (
            <div className="glass-panel-solid p-3 flex items-center gap-3 opacity-60">
              <div className="w-8 h-8 rounded-lg bg-surface-800 flex items-center justify-center">
                <Globe size={16} className="text-surface-500" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium text-surface-400">Private / Invite Worlds</div>
                <div className="text-xs text-surface-500">{privateCount} friend{privateCount !== 1 ? 's' : ''}</div>
              </div>
              <div className="flex -space-x-2">
                {onlineFriends.filter(f => f.location === 'private').slice(0, 6).map(f => (
                  <UserAvatar key={f.id} src={f.currentAvatarThumbnailImageUrl} status={f.status} size="sm"
                    className="ring-2 ring-surface-900" />
                ))}
              </div>
            </div>
          )}

          {worldGroups.length === 0 && privateCount === 0 ? (
            <EmptyState icon={Globe} title="No friends in public worlds" description="Friends in public instances will appear here" />
          ) : (
            worldGroups.map(group => {
              const world = worldCache[group.worldId];
              return (
                <div key={group.location} className="glass-panel-solid overflow-hidden">
                  <div className="flex items-center gap-3 p-3">
                    {world?.thumbnailImageUrl ? (
                      <img src={world.thumbnailImageUrl} alt="" className="w-16 h-12 rounded object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-16 h-12 rounded bg-surface-800 flex items-center justify-center flex-shrink-0">
                        <Globe size={20} className="text-surface-600" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate">{worldCache[group.worldId]?.name || group.worldId}</div>
                      <div className="text-xs text-surface-500 flex items-center gap-1.5 mt-0.5">
                        <Users size={11} /> {group.friends.length} friend{group.friends.length !== 1 ? 's' : ''}
                        {world && <><span className="mx-1">·</span>{world.occupants} total</>}
                      </div>
                    </div>
                    {group.instanceId && (
                      <button
                        onClick={() => setInstanceModal({ worldId: group.worldId, instanceId: group.instanceId })}
                        className="btn-secondary text-xs flex items-center gap-1"
                      >
                        <MapPin size={12} /> Join
                      </button>
                    )}
                  </div>
                  <div className="border-t border-surface-800/50 px-3 pb-3 pt-2 flex flex-wrap gap-2">
                    {group.friends.map(f => (
                      <button
                        key={f.id}
                        onClick={() => detail.open(f)}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-surface-800/60 transition-colors text-left"
                      >
                        <UserAvatar src={f.currentAvatarThumbnailImageUrl} status={f.status} size="sm" />
                        <span className="text-xs font-medium">{f.displayName}</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Friend list */}
      {tab !== 'gps' && (
        isLoading ? <LoadingSpinner className="py-16" /> :
        friends.length === 0 ? (
          <EmptyState icon={Users} title="No friends found" description={search ? 'Try a different search' : 'Friends appear once data loads'} />
        ) : (
          <div className="space-y-0.5">
            {friends.map(friend => {
              const note = notes[friend.id];
              return (
                <button
                  key={friend.id}
                  onClick={() => detail.user?.id === friend.id ? detail.close() : detail.open(friend)}
                  className={`glass-panel-solid p-3 flex items-center gap-3 w-full text-left card-hover group ${
                    detail.user?.id === friend.id ? 'border-accent-500/30' : ''
                  }`}
                >
                  <UserAvatar src={friend.currentAvatarThumbnailImageUrl} status={friend.status} size="md" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{friend.displayName}</span>
                      {note?.tags?.map(tag => (
                        <span key={tag} className="badge bg-accent-600/20 text-accent-400 text-[10px]">{tag}</span>
                      ))}
                    </div>
                    <div className="text-xs text-surface-500 truncate mt-0.5">
                      {friend.statusDescription || friend.status}
                    </div>
                  </div>

                  {friend.location && friend.location !== 'private' && friend.location !== 'offline' && (
                    <div className="text-xs text-surface-500 flex items-center gap-1 flex-shrink-0">
                      <MapPin size={11} />
                      <span className="max-w-[120px] truncate font-mono text-[10px]">
                        {worldCache[friend.location.split(':')[0]]?.name || friend.location.split(':')[0]}
                      </span>
                    </div>
                  )}
                  {friend.location === 'private' && friend.status !== 'offline' && (
                    <span className="text-xs text-surface-600 flex-shrink-0">Private</span>
                  )}
                  {note?.note && <StickyNote size={12} className="text-amber-400/70 flex-shrink-0" />}
                </button>
              );
            })}
          </div>
        )
      )}

      {/* Detail side panel */}
      {detail.user && (
        <div
          className="fixed right-0 top-8 bottom-0 w-80 bg-surface-900 border-l border-surface-800
                     overflow-y-auto z-30 animate-slide-in shadow-2xl"
          style={{ top: window.electronAPI ? 32 : 0 }}
        >
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-surface-500">Friend Profile</span>
              <button onClick={detail.close} className="btn-ghost p-1"><X size={16} /></button>
            </div>

            {/* Avatar / Header */}
            <div className="text-center">
              <div className="relative inline-block">
                <img
                  src={(detail.fullUser || detail.user).profilePicOverride || (detail.fullUser || detail.user).currentAvatarThumbnailImageUrl}
                  alt=""
                  className="w-24 h-24 rounded-full mx-auto object-cover bg-surface-800"
                />
                <div className={`absolute bottom-0 right-0 w-4 h-4 rounded-full ring-2 ring-surface-900 ${statusDotColors[detail.user.status]}`} />
              </div>
              <h3 className="text-lg font-bold mt-3">{detail.user.displayName}</h3>
              <p className="text-sm text-surface-400">{detail.user.statusDescription || detail.user.status}</p>
              {detail.loadingDetail && <LoadingSpinner size="sm" className="mt-2" />}
            </div>

            {/* Info rows */}
            <div className="space-y-2 text-sm">
              {(detail.fullUser || detail.user).bio && (
                <div className="glass-panel p-3">
                  <div className="text-xs text-surface-500 mb-1">Bio</div>
                  <div className="text-surface-300 text-xs whitespace-pre-wrap leading-relaxed">
                    {(detail.fullUser || detail.user).bio}
                  </div>
                </div>
              )}

              {detail.user.location && detail.user.location !== 'offline' && (
                <div className="glass-panel p-3">
                  <div className="text-xs text-surface-500 mb-1">Location</div>
                  {detail.user.location === 'private' ? (
                    <div className="text-surface-400 text-xs">Private World</div>
                  ) : (
                    <button
                      className="flex items-center gap-1.5 text-xs text-accent-400 hover:underline"
                      onClick={() => {
                        const [wid, iid] = detail.user!.location.split(':');
                        if (wid && iid) setInstanceModal({ worldId: wid, instanceId: iid });
                      }}
                    >
                      <MapPin size={12} />
                      {worldCache[detail.user.location.split(':')[0]]?.name || detail.user.location.split(':')[0]}
                      <ChevronRight size={12} />
                    </button>
                  )}
                </div>
              )}

              {detail.user.last_login && (
                <div className="glass-panel p-3">
                  <div className="text-xs text-surface-500 mb-1">Last Login</div>
                  <div className="text-xs">{formatDistanceToNow(new Date(detail.user.last_login), { addSuffix: true })}</div>
                </div>
              )}

              {detail.user.date_joined && (
                <div className="glass-panel p-3">
                  <div className="text-xs text-surface-500 mb-1">Joined VRChat</div>
                  <div className="text-xs">{format(new Date(detail.user.date_joined), 'MMMM d, yyyy')}</div>
                </div>
              )}

              {/* Mutual friends */}
              {detail.mutuals.length > 0 && (
                <div className="glass-panel p-3">
                  <div className="text-xs text-surface-500 mb-2">
                    {detail.mutuals.length} Mutual Friend{detail.mutuals.length !== 1 ? 's' : ''}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {detail.mutuals.slice(0, 8).map(m => (
                      <button key={m.id} onClick={() => detail.open(m)} className="flex items-center gap-1.5 text-xs hover:text-white transition-colors">
                        <UserAvatar src={m.currentAvatarThumbnailImageUrl} status={m.status} size="sm" />
                        <span className="text-surface-400 truncate max-w-[80px]">{m.displayName}</span>
                      </button>
                    ))}
                    {detail.mutuals.length > 8 && (
                      <span className="text-xs text-surface-600">+{detail.mutuals.length - 8} more</span>
                    )}
                  </div>
                </div>
              )}

              {/* Note */}
              {editingNote ? (
                <div className="glass-panel p-3 space-y-2">
                  <div className="text-xs text-amber-400 mb-1">Note</div>
                  <textarea
                    value={noteText}
                    onChange={e => setNoteText(e.target.value)}
                    className="input-field text-xs h-20 resize-none"
                    placeholder="Write a note..."
                    autoFocus
                  />
                  <div className="flex gap-1">
                    <input
                      type="text"
                      value={noteTagInput}
                      onChange={e => setNoteTagInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); } }}
                      placeholder="Add tag, press Enter"
                      className="input-field text-xs flex-1"
                    />
                    <button onClick={addTag} className="btn-secondary text-xs px-2">+</button>
                  </div>
                  {noteTags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {noteTags.map(t => (
                        <span key={t} className="badge bg-accent-600/20 text-accent-400 text-[10px] flex items-center gap-1">
                          {t}
                          <button onClick={() => setNoteTags(prev => prev.filter(x => x !== t))}><X size={8} /></button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button onClick={() => setEditingNote(false)} className="btn-secondary text-xs flex-1">Cancel</button>
                    <button onClick={saveNote} className="btn-primary text-xs flex-1">Save</button>
                  </div>
                </div>
              ) : (
                <>
                  {notes[detail.user.id]?.note && (
                    <div className="glass-panel p-3 border-amber-500/20">
                      <div className="text-xs text-amber-400 mb-1 flex items-center gap-1"><StickyNote size={11} /> Note</div>
                      <p className="text-xs text-surface-300">{notes[detail.user.id].note}</p>
                      {notes[detail.user.id].tags?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {notes[detail.user.id].tags.map(t => (
                            <span key={t} className="badge bg-accent-600/20 text-accent-400 text-[10px]">{t}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <button
                    onClick={() => openNoteEditor(detail.user!)}
                    className="btn-secondary text-xs w-full"
                  >
                    {notes[detail.user.id]?.note ? 'Edit Note' : 'Add Note'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Instance modal */}
      {instanceModal && (
        <InstanceModal
          worldId={instanceModal.worldId}
          instanceId={instanceModal.instanceId}
          onClose={() => setInstanceModal(null)}
        />
      )}
    </div>
  );
}
