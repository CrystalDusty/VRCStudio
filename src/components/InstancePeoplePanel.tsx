// "Who's in here?" — the people half of the Instance Grabber.
//
// The roster comes from VRChat's log (so non-friends are included, which is
// the whole point), and detail comes from the API. Friends we already hold in
// the friend store cost nothing; strangers are fetched on demand, and where
// the log never gave us a user ID we resolve it by display-name search so the
// actions still work.
//
// Search runs over everything we know — name, status, status message, bio,
// trust rank, the avatar they're wearing — because "the person whose bio
// mentions Osaka" is exactly the kind of thing you can't do in game.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, Loader2, UserPlus, UserMinus, Star, StarOff, Send, ExternalLink,
  Copy, Check, StickyNote, RefreshCw, AlertCircle, Users, Shirt, X, Flag,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useInstanceAvatarsStore, type PlayerAvatar } from '../stores/instanceAvatarsStore';
import { useInstanceHistoryStore } from '../stores/instanceHistoryStore';
import { useFriendStore } from '../stores/friendStore';
import { useAuthStore } from '../stores/authStore';
import { useFavoriteStore } from '../stores/favoriteStore';
import { getTrustRank, RANK_COLORS, type TrustRank } from '../utils/trustRank';
import type { VRCUser } from '../types/vrchat';
import api from '../api/vrchat';

/** Everything we know about one person standing in the instance. */
interface Person {
  name: string;
  userId?: string;
  isFriend: boolean;
  isLocal?: boolean;
  avatarName?: string;
  rank?: PlayerAvatar['rank'];
  user?: VRCUser;          // full profile, when we have it
  status?: string;
  statusDescription?: string;
  bio?: string;
  trust?: TrustRank;
  imageUrl?: string;
  /** Detail lookup state. */
  loading?: boolean;
  failed?: boolean;
}

// Profiles are stable for the length of a session; fetch each at most once.
const profileCache = new Map<string, VRCUser>();
const failedLookups = new Set<string>();

export default function InstancePeoplePanel() {
  const byPlayer = useInstanceAvatarsStore(s => s.byPlayer);
  const currentInstance = useInstanceHistoryStore(s => s.currentInstance);
  const { onlineFriends, offlineFriends } = useFriendStore();
  const me = useAuthStore(s => s.user);

  const [query, setQuery] = useState('');
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Record<string, VRCUser>>({});
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const [failedNames, setFailedNames] = useState<Set<string>>(new Set());
  const [autoLoad, setAutoLoad] = useState(false);
  const queueRef = useRef<string[]>([]);
  const runningRef = useRef(false);

  const friendByName = useMemo(() => {
    const m = new Map<string, VRCUser>();
    for (const f of [...onlineFriends, ...offlineFriends]) m.set(f.displayName, f);
    return m;
  }, [onlineFriends, offlineFriends]);

  const people: Person[] = useMemo(() => {
    return Object.values(byPlayer)
      .map(p => {
        const friend = friendByName.get(p.playerName);
        const fetched = profiles[p.playerName];
        const user = fetched ?? friend;
        return {
          name: p.playerName,
          userId: p.userId ?? friend?.id ?? fetched?.id,
          isFriend: !!friend,
          isLocal: p.isLocal || p.playerName === me?.displayName,
          avatarName: p.avatarName,
          rank: p.rank,
          user,
          status: user?.status,
          statusDescription: user?.statusDescription,
          bio: user?.bio,
          trust: user?.tags ? getTrustRank(user.tags) : undefined,
          imageUrl: user?.profilePicOverride || user?.currentAvatarThumbnailImageUrl || user?.userIcon,
          loading: loadingIds.has(p.playerName),
          failed: failedNames.has(p.playerName),
        } satisfies Person;
      })
      .sort((a, b) => {
        if (a.isLocal !== b.isLocal) return a.isLocal ? -1 : 1;
        if (a.isFriend !== b.isFriend) return a.isFriend ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }, [byPlayer, friendByName, profiles, loadingIds, failedNames, me?.displayName]);

  /**
   * Pull one person's profile. Uses the user ID from the log when there is
   * one; otherwise finds them by display name, which is how a stranger with
   * no logged ID becomes actionable.
   */
  const loadProfile = useCallback(async (person: Person) => {
    if (profiles[person.name] || person.isFriend) return;
    if (loadingIds.has(person.name) || failedLookups.has(person.name)) return;

    setLoadingIds(prev => new Set(prev).add(person.name));
    try {
      let user: VRCUser | undefined;
      if (person.userId) {
        user = profileCache.get(person.userId) ?? await api.getUser(person.userId);
        if (user) profileCache.set(person.userId, user);
      } else {
        const results = await api.searchUsers(person.name, 10);
        const exact = results.find(u => u.displayName === person.name);
        // Only accept an exact display-name match — a fuzzy one would attach
        // the wrong person's bio to this row, which is worse than no bio.
        if (exact) {
          user = await api.getUser(exact.id).catch(() => exact);
          if (user) profileCache.set(exact.id, user);
        }
      }

      if (user) {
        setProfiles(prev => ({ ...prev, [person.name]: user! }));
      } else {
        failedLookups.add(person.name);
        setFailedNames(prev => new Set(prev).add(person.name));
      }
    } catch {
      failedLookups.add(person.name);
      setFailedNames(prev => new Set(prev).add(person.name));
    } finally {
      setLoadingIds(prev => {
        const next = new Set(prev);
        next.delete(person.name);
        return next;
      });
    }
  }, [profiles, loadingIds]);

  // Sequential queue — VRChat rate-limits hard, and a 40-person instance
  // firing 40 parallel requests gets the session throttled.
  const runQueue = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    while (queueRef.current.length > 0) {
      const name = queueRef.current.shift()!;
      const person = people.find(p => p.name === name);
      if (person) await loadProfile(person);
      await new Promise(r => setTimeout(r, 350));
    }
    runningRef.current = false;
  }, [people, loadProfile]);

  const enqueue = useCallback((names: string[]) => {
    for (const n of names) {
      if (!queueRef.current.includes(n)) queueRef.current.push(n);
    }
    void runQueue();
  }, [runQueue]);

  // Searching by bio only works on people whose bio we hold, so a query that
  // matches nothing yet is a good moment to go and fetch the rest.
  useEffect(() => {
    if (!autoLoad) return;
    const pending = people
      .filter(p => !p.user && !p.loading && !p.failed && !p.isLocal)
      .map(p => p.name);
    if (pending.length) enqueue(pending);
  }, [autoLoad, people, enqueue]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return people;
    const terms = q.split(/\s+/);
    return people.filter(p => {
      const hay = [
        p.name, p.userId, p.status, p.statusDescription, p.bio,
        p.trust, p.avatarName, p.isFriend ? 'friend' : '', p.rank,
      ].filter(Boolean).join(' ').toLowerCase();
      return terms.every(t => hay.includes(t));
    });
  }, [people, query]);

  const selected = selectedName ? people.find(p => p.name === selectedName) : undefined;
  const detailsLoaded = people.filter(p => p.user).length;

  // Opening someone always fetches their detail — that's the point of clicking.
  useEffect(() => {
    if (selected && !selected.user && !selected.loading && !selected.failed) {
      enqueue([selected.name]);
    }
  }, [selected, enqueue]);

  if (people.length === 0) {
    return (
      <div className="glass-panel-solid p-10 text-center text-sm text-surface-400">
        <Users size={30} className="mx-auto mb-2 opacity-30" />
        <p>Nobody tracked in your instance yet.</p>
        <p className="text-xs text-surface-500 mt-1">
          The roster comes from VRChat's log — join a world and players appear as they connect.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="glass-panel-solid p-3 space-y-2">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-500" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search name, status, bio, trust rank, avatar…"
            className="w-full bg-surface-900 text-sm pl-8 pr-3 py-2 rounded-lg border border-surface-700 focus:outline-none focus:border-accent-500 placeholder-surface-600"
          />
        </div>
        <div className="flex items-center justify-between gap-3 flex-wrap text-[11px]">
          <span className="text-surface-500">
            {filtered.length} of {people.length} in {currentInstance?.worldName || 'this instance'}
            {' · '}
            <span className={detailsLoaded === people.length ? 'text-green-400' : 'text-surface-500'}>
              {detailsLoaded}/{people.length} profiles loaded
            </span>
          </span>
          <label className="flex items-center gap-1.5 cursor-pointer text-surface-400">
            <input
              type="checkbox"
              checked={autoLoad}
              onChange={e => setAutoLoad(e.target.checked)}
              className="accent-accent-500"
            />
            Fetch every profile
            <span className="text-surface-600">(needed to search bios)</span>
          </label>
        </div>
      </div>

      {/* Roster */}
      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] gap-3 items-start">
        <div className="glass-panel-solid divide-y divide-surface-800/70 max-h-[32rem] overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="p-6 text-center text-xs text-surface-500 space-y-2">
              <p>Nobody here matches "{query}".</p>
              {!autoLoad && detailsLoaded < people.length && (
                <button onClick={() => setAutoLoad(true)} className="text-accent-400 hover:text-accent-300">
                  {people.length - detailsLoaded} profiles aren't loaded — fetch them and search again
                </button>
              )}
            </div>
          ) : filtered.map(p => (
            <button
              key={p.name}
              onClick={() => setSelectedName(p.name)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                selectedName === p.name ? 'bg-accent-500/15' : 'hover:bg-surface-800/60'
              }`}
            >
              {p.imageUrl ? (
                <img src={p.imageUrl} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0 bg-surface-800" loading="lazy" />
              ) : (
                <div className="w-8 h-8 rounded bg-surface-800 flex items-center justify-center flex-shrink-0 text-xs font-bold text-surface-500">
                  {p.name.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium truncate flex items-center gap-1.5">
                  {p.name}
                  {p.isLocal && <Tag className="bg-accent-500/15 text-accent-300 border-accent-500/30">you</Tag>}
                  {p.isFriend && !p.isLocal && <Tag className="bg-green-500/15 text-green-400 border-green-500/30">friend</Tag>}
                  {p.trust && <Tag className={RANK_COLORS[p.trust]}>{p.trust}</Tag>}
                  {p.loading && <Loader2 size={10} className="animate-spin text-surface-500" />}
                </div>
                <div className="text-[10px] text-surface-500 truncate">
                  {p.statusDescription || p.status || (p.failed ? 'profile unavailable' : p.user ? 'no status set' : 'profile not loaded')}
                  {p.avatarName && <span className="text-surface-600"> · {p.avatarName}</span>}
                </div>
              </div>
            </button>
          ))}
        </div>

        {selected
          ? <PersonDetail
              key={selected.name}
              person={selected}
              onClose={() => setSelectedName(null)}
              onRetry={() => {
                failedLookups.delete(selected.name);
                setFailedNames(prev => {
                  const next = new Set(prev);
                  next.delete(selected.name);
                  return next;
                });
                enqueue([selected.name]);
              }}
            />
          : (
            <div className="glass-panel-solid p-6 text-center text-xs text-surface-500 hidden lg:block">
              Pick someone to see their profile and what you can do with them.
            </div>
          )}
      </div>
    </div>
  );
}

// ── Detail panel ────────────────────────────────────────────────────────

function PersonDetail({ person, onClose, onRetry }: {
  person: Person;
  onClose: () => void;
  onRetry: () => void;
}) {
  const navigate = useNavigate();
  const currentInstance = useInstanceHistoryStore(s => s.currentInstance);
  const { addFavorite, removeFavorite, isFavorite } = useFavoriteStore();

  const [note, setNote] = useState('');
  const [noteLoaded, setNoteLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [friendRequested, setFriendRequested] = useState(false);

  const userId = person.userId;
  const favorited = userId ? isFavorite(userId) : false;

  useEffect(() => {
    if (!userId || noteLoaded) return;
    api.getUserNote(userId)
      .then(r => { setNote(r?.note ?? ''); setNoteLoaded(true); })
      .catch(() => setNoteLoaded(true));
  }, [userId, noteLoaded]);

  const flash = (key: string) => {
    setDone(key);
    setTimeout(() => setDone(null), 2200);
  };

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      flash(key);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setBusy(null);
  };

  const openExternal = (url: string) => {
    if (window.electronAPI?.openExternal) window.electronAPI.openExternal(url);
    else window.open(url, '_blank');
  };

  return (
    <div className="glass-panel-solid p-3 space-y-3 lg:sticky lg:top-4">
      <div className="flex items-start gap-3">
        {person.imageUrl ? (
          <img src={person.imageUrl} alt="" className="w-14 h-14 rounded-lg object-cover bg-surface-800 flex-shrink-0" />
        ) : (
          <div className="w-14 h-14 rounded-lg bg-surface-800 flex items-center justify-center flex-shrink-0 text-lg font-bold text-surface-500">
            {person.name.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm truncate">{person.name}</div>
          <div className="flex items-center gap-1.5 flex-wrap mt-1">
            {person.trust && <Tag className={RANK_COLORS[person.trust]}>{person.trust}</Tag>}
            {person.isFriend && <Tag className="bg-green-500/15 text-green-400 border-green-500/30">friend</Tag>}
            {person.status && <Tag className="bg-surface-800 text-surface-400 border-surface-700">{person.status}</Tag>}
          </div>
        </div>
        <button onClick={onClose} className="p-1 rounded text-surface-500 hover:text-surface-200 lg:hidden">
          <X size={14} />
        </button>
      </div>

      {person.statusDescription && (
        <p className="text-xs text-surface-300">{person.statusDescription}</p>
      )}

      {person.loading ? (
        <p className="text-[11px] text-surface-500 flex items-center gap-1.5">
          <Loader2 size={11} className="animate-spin" /> Loading profile…
        </p>
      ) : person.failed ? (
        <div className="text-[11px] text-amber-400/90 space-y-1.5">
          <p className="flex items-start gap-1.5">
            <AlertCircle size={11} className="mt-0.5 flex-shrink-0" />
            Couldn't match this display name to a VRChat account. They may have
            renamed, or the name is ambiguous.
          </p>
          <button onClick={onRetry} className="text-accent-400 hover:text-accent-300 inline-flex items-center gap-1">
            <RefreshCw size={10} /> Try again
          </button>
        </div>
      ) : person.bio ? (
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-surface-500 mb-1">Bio</div>
          <p className="text-xs text-surface-400 whitespace-pre-wrap max-h-32 overflow-y-auto">{person.bio}</p>
        </div>
      ) : person.user ? (
        <p className="text-[11px] text-surface-600 italic">No bio set.</p>
      ) : null}

      {person.avatarName && (
        <div className="text-[11px] text-surface-500 flex items-center gap-1.5">
          <Shirt size={11} /> Wearing <span className="text-surface-300">{person.avatarName}</span>
          {person.rank && <span className="text-surface-600">· {person.rank}</span>}
        </div>
      )}

      {/* Private note — the most useful per-person setting there is */}
      {userId && !person.isLocal && (
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-surface-500 mb-1 flex items-center gap-1.5">
            <StickyNote size={10} className="text-accent-400" /> Private note
          </div>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Only you can see this."
            className="w-full h-16 bg-surface-900 border border-surface-700 rounded-lg p-2 text-xs resize-none focus:outline-none focus:border-accent-500 placeholder-surface-600"
          />
          <button
            onClick={() => run('note', () => api.setUserNote(userId, note))}
            disabled={busy === 'note'}
            className="btn-secondary text-[11px] mt-1.5 inline-flex items-center gap-1.5"
          >
            {busy === 'note' ? <Loader2 size={10} className="animate-spin" />
              : done === 'note' ? <Check size={10} className="text-green-400" />
              : <StickyNote size={10} />}
            {done === 'note' ? 'Saved' : 'Save note'}
          </button>
        </div>
      )}

      {/* Actions */}
      {!person.isLocal && (
        <div className="border-t border-surface-800 pt-2.5 space-y-1.5">
          <div className="flex flex-wrap gap-1.5">
            {userId && !person.isFriend && (
              <Action
                icon={friendRequested || done === 'friend' ? Check : UserPlus}
                label={friendRequested || done === 'friend' ? 'Request sent' : 'Add friend'}
                busy={busy === 'friend'}
                onClick={() => run('friend', async () => {
                  await api.sendFriendRequest(userId);
                  setFriendRequested(true);
                })}
              />
            )}
            {userId && person.isFriend && (
              <Action
                icon={UserMinus}
                label={done === 'unfriend' ? 'Removed' : 'Unfriend'}
                busy={busy === 'unfriend'}
                onClick={() => run('unfriend', () => api.unfriend(userId))}
              />
            )}
            {userId && (
              <Action
                icon={favorited ? StarOff : Star}
                label={favorited ? 'Unfavorite' : 'Favorite'}
                busy={busy === 'fav'}
                onClick={() => run('fav', () =>
                  favorited ? removeFavorite(userId, 'friend') : addFavorite('friend', userId, ['group_0']))}
              />
            )}
            {userId && currentInstance && (
              <Action
                icon={Send}
                label={done === 'invite' ? 'Invited' : 'Invite here'}
                busy={busy === 'invite'}
                onClick={() => run('invite', () =>
                  api.inviteUser(userId, currentInstance.worldId, currentInstance.instanceId))}
              />
            )}
            {userId && (
              <Action
                icon={copied ? Check : Copy}
                label={copied ? 'Copied' : 'Copy ID'}
                onClick={() => {
                  navigator.clipboard?.writeText(userId);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              />
            )}
            {userId && (
              <Action
                icon={ExternalLink}
                label="Profile"
                onClick={() => openExternal(`https://vrchat.com/home/user/${userId}`)}
              />
            )}
            <Action
              icon={Flag}
              label="Report"
              onClick={() => navigate('/reports')}
            />
          </div>

          {!userId && (
            <p className="text-[10px] text-surface-600">
              VRChat didn't log this player's user ID, so most actions need a
              profile lookup first — it runs automatically when you open them.
            </p>
          )}
          {error && (
            <p className="text-[11px] text-rose-400 flex items-start gap-1.5">
              <AlertCircle size={11} className="mt-0.5 flex-shrink-0" /> {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Action({ icon: Icon, label, onClick, busy }: {
  icon: typeof UserPlus;
  label: string;
  onClick: () => void;
  busy?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="text-[11px] px-2 py-1 rounded-lg border border-surface-700 text-surface-300 hover:border-surface-600 hover:bg-surface-800/60 transition-colors inline-flex items-center gap-1.5 disabled:opacity-50"
    >
      {busy ? <Loader2 size={10} className="animate-spin" /> : <Icon size={10} />}
      {label}
    </button>
  );
}

function Tag({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${className}`}>
      {children}
    </span>
  );
}
