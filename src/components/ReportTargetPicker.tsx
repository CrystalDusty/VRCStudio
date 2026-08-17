// Quick-pick for "who are you reporting?".
//
// The old picker showed the first eight friends and nothing else, which is
// the wrong shape for reporting: the person you need is usually standing in
// front of you and often isn't a friend at all. This offers every scope that
// matters — the instance you're in, the group hosting it, the world you're
// in, and your full friends list — each searchable, each showing everyone
// rather than a truncated handful.

import { useEffect, useMemo, useState } from 'react';
import { Search, Users, MapPin, Globe, Shield, UserCheck, Loader2 } from 'lucide-react';
import { useFriendStore } from '../stores/friendStore';
import { useInstanceAvatarsStore } from '../stores/instanceAvatarsStore';
import { useInstanceHistoryStore } from '../stores/instanceHistoryStore';
import { useAuthStore } from '../stores/authStore';
import api from '../api/vrchat';

export interface TargetOption {
  id: string;
  name: string;
  imageUrl?: string;
  /** Secondary line: status, where they are, group role. */
  sub?: string;
  /** True when we only know a display name (log-derived, non-friend). */
  idUnknown?: boolean;
}

type ScopeKey = 'here' | 'group' | 'world' | 'friends' | 'mygroups';

interface Scope {
  key: ScopeKey;
  label: string;
  icon: typeof Users;
  hint: string;
  options: TargetOption[];
}

// ── Location helpers ────────────────────────────────────────────────────
// VRChat locations look like `wrld_x:12345~group(grp_y)~region(use)`, or one
// of the opaque values below when the user isn't somewhere joinable.

function parseLocation(loc?: string): { worldId?: string; instanceId?: string; groupId?: string } {
  if (!loc || loc === 'offline' || loc === 'private' || loc === 'traveling') return {};
  const [worldId, rest] = loc.split(':');
  if (!worldId?.startsWith('wrld_')) return {};
  const instanceId = rest?.split('~')[0];
  const groupId = loc.match(/~group\((grp_[^)]+)\)/)?.[1];
  return { worldId, instanceId, groupId };
}

function statusLine(f: { status?: string; statusDescription?: string }): string | undefined {
  if (f.statusDescription?.trim()) return f.statusDescription.trim();
  switch (f.status) {
    case 'active': return 'Online';
    case 'join me': return 'Join me';
    case 'ask me': return 'Ask me';
    case 'busy': return 'Do not disturb';
    case 'offline': return 'Offline';
    default: return undefined;
  }
}

export default function ReportTargetPicker({ reportType, selectedId, selectedName, onPick }: {
  reportType: 'player' | 'group';
  selectedId: string;
  selectedName: string;
  onPick: (opt: TargetOption) => void;
}) {
  const { onlineFriends, offlineFriends } = useFriendStore();
  const byPlayer = useInstanceAvatarsStore(s => s.byPlayer);
  const currentInstance = useInstanceHistoryStore(s => s.currentInstance);
  const me = useAuthStore(s => s.user);

  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<ScopeKey | null>(null);
  const [myGroups, setMyGroups] = useState<TargetOption[] | null>(null);
  const [groupsLoading, setGroupsLoading] = useState(false);

  const here = currentInstance;
  const hereGroupId = here?.groupId;

  // Groups are only fetched when the user actually switches to reporting one.
  useEffect(() => {
    if (reportType !== 'group' || myGroups !== null || groupsLoading || !me?.id) return;
    setGroupsLoading(true);
    api.getUserGroups(me.id)
      .then(list => {
        setMyGroups((list ?? []).map((g: any) => ({
          id: g.groupId ?? g.id ?? '',
          name: g.name ?? g.shortCode ?? 'Unnamed group',
          imageUrl: g.iconUrl ?? g.bannerUrl ?? undefined,
          sub: [g.memberCount ? `${g.memberCount} members` : null, g.shortCode ? `${g.shortCode}` : null]
            .filter(Boolean).join(' · ') || undefined,
        })));
      })
      .catch(() => setMyGroups([]))
      .finally(() => setGroupsLoading(false));
  }, [reportType, myGroups, groupsLoading, me?.id]);

  const allFriends = useMemo(
    () => [...onlineFriends, ...offlineFriends],
    [onlineFriends, offlineFriends],
  );

  const scopes: Scope[] = useMemo(() => {
    if (reportType === 'group') {
      const currentGroup: TargetOption[] = [];
      if (hereGroupId) {
        const known = myGroups?.find(g => g.id === hereGroupId);
        currentGroup.push({
          id: hereGroupId,
          name: known?.name ?? here?.worldName ?? hereGroupId,
          imageUrl: known?.imageUrl,
          sub: known ? 'Hosting the instance you\'re in' : 'Group hosting your current instance',
        });
      }
      return [
        {
          key: 'group', label: 'This group', icon: Shield,
          hint: "The group hosting the instance you're in right now.",
          options: currentGroup,
        },
        {
          key: 'mygroups', label: 'My groups', icon: Users,
          hint: 'Every group your account belongs to.',
          options: myGroups ?? [],
        },
      ];
    }

    // ── Player scopes ──
    const friendByName = new Map(allFriends.map(f => [f.displayName, f]));

    // People physically in the instance, from VRChat's log. Non-friends
    // included — usually the whole reason someone opens this page.
    const hereOptions: TargetOption[] = Object.values(byPlayer)
      .filter(p => !p.isLocal && p.playerName !== me?.displayName)
      .sort((a, b) => a.playerName.localeCompare(b.playerName))
      .map(p => {
        const friend = friendByName.get(p.playerName);
        return {
          id: p.userId ?? friend?.id ?? '',
          name: p.playerName,
          imageUrl: friend?.profilePicOverride || friend?.currentAvatarThumbnailImageUrl || undefined,
          sub: [friend ? 'Friend' : 'In your instance', p.avatarName ? `wearing ${p.avatarName}` : null]
            .filter(Boolean).join(' · '),
          idUnknown: !p.userId && !friend?.id,
        };
      });

    // Friends elsewhere in the same world, and friends in other instances of
    // the same group — both derived from their published location.
    const worldOptions: TargetOption[] = [];
    const groupOptions: TargetOption[] = [];
    const hereKey = here ? `${here.worldId}:${here.instanceId}` : null;

    for (const f of allFriends) {
      const loc = parseLocation(f.location);
      if (!loc.worldId) continue;
      const key = `${loc.worldId}:${loc.instanceId}`;
      const opt: TargetOption = {
        id: f.id,
        name: f.displayName,
        imageUrl: f.profilePicOverride || f.currentAvatarThumbnailImageUrl || undefined,
        sub: key === hereKey ? 'In your instance' : statusLine(f),
      };
      if (here && loc.worldId === here.worldId && !hereOptions.some(h => h.name === f.displayName)) {
        worldOptions.push({ ...opt, sub: key === hereKey ? 'In your instance' : 'Another instance of this world' });
      }
      if (hereGroupId && loc.groupId === hereGroupId && !hereOptions.some(h => h.name === f.displayName)) {
        groupOptions.push({ ...opt, sub: key === hereKey ? 'In your instance' : "In this group's instances" });
      }
    }

    const friendOptions: TargetOption[] = allFriends.map(f => ({
      id: f.id,
      name: f.displayName,
      imageUrl: f.profilePicOverride || f.currentAvatarThumbnailImageUrl || undefined,
      sub: statusLine(f),
    }));

    return [
      {
        key: 'here', label: 'In this instance', icon: MapPin,
        hint: here
          ? `Everyone VRChat has logged joining ${here.worldName || 'your instance'} — friends or not.`
          : 'Nobody yet — this fills in from VRChat\'s log once you\'re in an instance.',
        options: hereOptions,
      },
      {
        key: 'group', label: 'This group', icon: Shield,
        hint: hereGroupId
          ? "Friends in any instance belonging to the group you're in."
          : "You're not in a group instance right now.",
        options: groupOptions,
      },
      {
        key: 'world', label: 'This world', icon: Globe,
        hint: here
          ? 'Friends in this world, including its other instances.'
          : 'Join a world to see who else is in it.',
        options: worldOptions,
      },
      {
        key: 'friends', label: 'All friends', icon: Users,
        hint: 'Your whole friends list, online and offline.',
        options: friendOptions,
      },
    ];
  }, [reportType, byPlayer, allFriends, here, hereGroupId, myGroups, me?.id, me?.displayName]);

  // Default to the first scope that actually has people in it.
  const activeKey: ScopeKey = scope ?? scopes.find(s => s.options.length > 0)?.key ?? scopes[0].key;
  const active = scopes.find(s => s.key === activeKey) ?? scopes[0];

  const filter = (opts: TargetOption[]) => {
    const q = query.trim().toLowerCase();
    if (!q) return opts;
    return opts.filter(o =>
      o.name.toLowerCase().includes(q) ||
      o.id.toLowerCase().includes(q) ||
      o.sub?.toLowerCase().includes(q),
    );
  };

  const visible = filter(active.options);

  // When a search finds nothing here but hits another scope, say so rather
  // than leaving the user staring at an empty list.
  const elsewhere = query.trim() && visible.length === 0
    ? scopes.filter(s => s.key !== activeKey).map(s => ({ scope: s, count: filter(s.options).length })).filter(s => s.count > 0)
    : [];

  return (
    <div className="space-y-2">
      {/* Scope tabs */}
      <div className="flex flex-wrap gap-1.5">
        {scopes.map(s => {
          const Icon = s.icon;
          const isActive = s.key === activeKey;
          return (
            <button
              key={s.key}
              onClick={() => setScope(s.key)}
              className={`text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors ${
                isActive ? 'bg-accent-500/20 text-accent-300' : 'bg-surface-800 text-surface-400 hover:bg-surface-700'
              }`}
            >
              <Icon size={12} /> {s.label}
              <span className={`text-[10px] tabular-nums ${isActive ? 'text-accent-400/80' : 'text-surface-600'}`}>
                {s.options.length}
              </span>
            </button>
          );
        })}
      </div>

      <p className="text-[11px] text-surface-500">{active.hint}</p>

      {/* Search */}
      <div className="relative">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-500" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={`Search ${active.label.toLowerCase()}…`}
          className="w-full bg-surface-900 text-sm pl-8 pr-3 py-1.5 rounded-lg border border-surface-700 focus:outline-none focus:border-accent-500 placeholder-surface-600"
        />
      </div>

      {/* Results */}
      <div className="max-h-64 overflow-y-auto rounded-lg border border-surface-800 divide-y divide-surface-800/70">
        {groupsLoading && active.key === 'mygroups' ? (
          <div className="p-4 text-center text-xs text-surface-500 flex items-center justify-center gap-2">
            <Loader2 size={13} className="animate-spin" /> Loading your groups…
          </div>
        ) : visible.length === 0 ? (
          <div className="p-4 text-center text-xs text-surface-500 space-y-2">
            <p>{query.trim() ? `No matches in ${active.label.toLowerCase()}.` : 'Nothing here yet.'}</p>
            {elsewhere.map(({ scope: s, count }) => (
              <button
                key={s.key}
                onClick={() => setScope(s.key)}
                className="text-accent-400 hover:text-accent-300 block mx-auto"
              >
                {count} match{count === 1 ? '' : 'es'} in {s.label} →
              </button>
            ))}
          </div>
        ) : (
          visible.map(opt => {
            const picked = selectedId
              ? opt.id === selectedId
              : opt.name === selectedName && !!selectedName;
            return (
              <button
                key={`${opt.id || 'noid'}-${opt.name}`}
                onClick={() => onPick(opt)}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 text-left transition-colors ${
                  picked ? 'bg-accent-500/15' : 'hover:bg-surface-800/60'
                }`}
              >
                {opt.imageUrl ? (
                  <img src={opt.imageUrl} alt="" className="w-7 h-7 rounded object-cover flex-shrink-0 bg-surface-800" loading="lazy" />
                ) : (
                  <div className="w-7 h-7 rounded bg-surface-800 flex items-center justify-center flex-shrink-0 text-[11px] font-bold text-surface-500">
                    {opt.name.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium truncate flex items-center gap-1.5">
                    {opt.name}
                    {picked && <UserCheck size={11} className="text-accent-400 flex-shrink-0" />}
                  </div>
                  {opt.sub && <div className="text-[10px] text-surface-500 truncate">{opt.sub}</div>}
                </div>
                {opt.idUnknown && (
                  <span className="text-[9px] uppercase tracking-wider text-surface-600 border border-surface-700 rounded px-1 flex-shrink-0"
                        title="VRChat didn't log this player's user ID — the name is still enough to report them">
                    no id
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
