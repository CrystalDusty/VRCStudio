import {
  Users,
  Globe,
  Activity,
  UserPlus,
  UserMinus,
  MapPin,
  CircleDot,
  Wifi,
  WifiOff,
  TrendingUp,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useAuthStore } from '../stores/authStore';
import { useFriendStore } from '../stores/friendStore';
import { useFeedStore } from '../stores/feedStore';
import UserAvatar from '../components/common/UserAvatar';
import type { FeedEvent, UserStatus } from '../types/vrchat';

const eventIcons: Record<FeedEvent['type'], typeof Activity> = {
  friend_online: UserPlus,
  friend_offline: UserMinus,
  friend_location: MapPin,
  friend_status: CircleDot,
  friend_avatar: CircleDot,
  friend_add: UserPlus,
  friend_remove: UserMinus,
  world_visit: Globe,
};

const eventColors: Record<FeedEvent['type'], string> = {
  friend_online: 'text-green-400 bg-green-500/10',
  friend_offline: 'text-surface-500 bg-surface-500/10',
  friend_location: 'text-blue-400 bg-blue-500/10',
  friend_status: 'text-amber-400 bg-amber-500/10',
  friend_avatar: 'text-purple-400 bg-purple-500/10',
  friend_add: 'text-green-400 bg-green-500/10',
  friend_remove: 'text-red-400 bg-red-500/10',
  world_visit: 'text-blue-400 bg-blue-500/10',
};

function eventMessage(event: FeedEvent): string {
  switch (event.type) {
    case 'friend_online': return 'came online';
    case 'friend_offline': return 'went offline';
    case 'friend_location': return event.details || 'changed location';
    case 'friend_status': return `changed status to ${event.newValue}`;
    case 'friend_avatar': return 'changed avatar';
    case 'friend_add': return 'was added as friend';
    case 'friend_remove': return 'was removed as friend';
    case 'world_visit': return `visited ${event.worldName}`;
    default: return '';
  }
}

const statusColors: Record<string, string> = {
  'join me': 'bg-status-joinme',
  'active': 'bg-status-online',
  'ask me': 'bg-status-askme',
  'busy': 'bg-status-busy',
};

export default function Dashboard() {
  const { user } = useAuthStore();
  const { onlineFriends, offlineFriends } = useFriendStore();
  const { events } = useFeedStore();

  const statusGroups: Record<string, typeof onlineFriends> = {
    'join me': [],
    'active': [],
    'ask me': [],
    'busy': [],
  };
  for (const f of onlineFriends) {
    if (statusGroups[f.status]) {
      statusGroups[f.status].push(f);
    }
  }

  const todayEvents = events.filter(e => Date.now() - e.timestamp < 86400000);
  const recentEvents = events.slice(0, 40);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-surface-100">
            Welcome back, <span className="text-gradient">{user?.displayName}</span>
          </h1>
          <p className="text-surface-500 text-sm mt-0.5">
            Here's what's happening in your VRChat world
          </p>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={Wifi}
          label="Online"
          value={onlineFriends.length}
          accent="text-green-400"
          bg="bg-green-500/10"
          detail={`of ${onlineFriends.length + offlineFriends.length} friends`}
        />
        <StatCard
          icon={Users}
          label="Total Friends"
          value={onlineFriends.length + offlineFriends.length}
          accent="text-blue-400"
          bg="bg-blue-500/10"
        />
        <StatCard
          icon={Globe}
          label="Join Me"
          value={statusGroups['join me'].length}
          accent="text-status-joinme"
          bg="bg-blue-500/10"
        />
        <StatCard
          icon={TrendingUp}
          label="Events Today"
          value={todayEvents.length}
          accent="text-amber-400"
          bg="bg-amber-500/10"
        />
      </div>

      {/* Status breakdown */}
      <div className="glass-panel-solid p-4">
        <div className="flex items-center gap-6">
          {Object.entries(statusGroups).map(([status, friends]) => (
            <div key={status} className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${statusColors[status]}`} />
              <span className="text-xs text-surface-400 capitalize">{status}</span>
              <span className="text-xs font-semibold text-surface-200 tabular-nums">{friends.length}</span>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-status-offline" />
            <span className="text-xs text-surface-400">Offline</span>
            <span className="text-xs font-semibold text-surface-200 tabular-nums">{offlineFriends.length}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Activity Feed */}
        <div className="lg:col-span-2 glass-panel-solid overflow-hidden">
          <div className="px-4 py-3 border-b border-surface-800/40 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-surface-300 flex items-center gap-2">
              <Activity size={14} />
              Activity Feed
            </h2>
            <span className="text-xs text-surface-600">{todayEvents.length} today</span>
          </div>
          {recentEvents.length === 0 ? (
            <p className="text-surface-500 text-sm py-12 text-center">
              No activity yet. Events will appear as friends come online and move around.
            </p>
          ) : (
            <div className="divide-y divide-surface-800/30 max-h-[520px] overflow-y-auto">
              {recentEvents.map(event => {
                const Icon = eventIcons[event.type] || Activity;
                const colorClasses = eventColors[event.type] || 'text-surface-400 bg-surface-500/10';
                const [textColor, bgColor] = colorClasses.split(' ');
                return (
                  <div
                    key={event.id}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-800/30 transition-colors"
                  >
                    <div className={`w-7 h-7 rounded-lg ${bgColor} flex items-center justify-center flex-shrink-0`}>
                      <Icon size={13} className={textColor} />
                    </div>
                    {event.userAvatar && (
                      <UserAvatar src={event.userAvatar} size="sm" />
                    )}
                    <div className="flex-1 min-w-0">
                      <span className="text-[13px]">
                        <span className="font-medium text-surface-200">{event.userName}</span>{' '}
                        <span className="text-surface-500">{eventMessage(event)}</span>
                      </span>
                    </div>
                    <span className="text-[11px] text-surface-600 flex-shrink-0 tabular-nums">
                      {formatDistanceToNow(event.timestamp, { addSuffix: true })}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Online Friends sidebar */}
        <div className="glass-panel-solid overflow-hidden">
          <div className="px-4 py-3 border-b border-surface-800/40 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-surface-300 flex items-center gap-2">
              <Users size={14} />
              Online Now
            </h2>
            <span className="text-xs font-medium text-green-400 tabular-nums">{onlineFriends.length}</span>
          </div>
          {onlineFriends.length === 0 ? (
            <div className="py-12 text-center">
              <WifiOff size={24} className="mx-auto text-surface-700 mb-2" />
              <p className="text-surface-500 text-sm">No friends online</p>
            </div>
          ) : (
            <div className="divide-y divide-surface-800/20 max-h-[520px] overflow-y-auto">
              {onlineFriends.slice(0, 40).map(friend => (
                <div
                  key={friend.id}
                  className="flex items-center gap-2.5 px-4 py-2 hover:bg-surface-800/30 transition-colors"
                >
                  <UserAvatar
                    src={friend.currentAvatarThumbnailImageUrl}
                    status={friend.status}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium truncate text-surface-200">{friend.displayName}</div>
                    <div className="text-[11px] text-surface-500 truncate">
                      {friend.statusDescription || friend.status}
                    </div>
                  </div>
                </div>
              ))}
              {onlineFriends.length > 40 && (
                <p className="text-xs text-surface-600 text-center py-2.5">
                  +{onlineFriends.length - 40} more
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, accent, bg, detail }: {
  icon: typeof Activity; label: string; value: number; accent: string; bg: string; detail?: string;
}) {
  return (
    <div className="stat-card">
      <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center ${accent} flex-shrink-0`}>
        <Icon size={18} />
      </div>
      <div>
        <div className="text-2xl font-bold text-surface-100 tabular-nums">{value}</div>
        <div className="text-xs text-surface-500">{label}</div>
        {detail && <div className="text-[10px] text-surface-600 mt-0.5">{detail}</div>}
      </div>
    </div>
  );
}
