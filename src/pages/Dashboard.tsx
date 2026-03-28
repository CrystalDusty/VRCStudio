import { useEffect } from 'react';
import {
  Users,
  Globe,
  Activity,
  Clock,
  UserPlus,
  UserMinus,
  MapPin,
  CircleDot,
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
  friend_online: 'text-green-400',
  friend_offline: 'text-surface-500',
  friend_location: 'text-blue-400',
  friend_status: 'text-amber-400',
  friend_avatar: 'text-purple-400',
  friend_add: 'text-green-400',
  friend_remove: 'text-red-400',
  world_visit: 'text-blue-400',
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

  const recentEvents = events.slice(0, 30);

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">
          Welcome back, {user?.displayName}
        </h1>
        <p className="text-surface-400 text-sm mt-1">
          Here's what's happening in your VRChat world
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Users}
          label="Friends Online"
          value={onlineFriends.length}
          accent="text-green-400"
          bg="bg-green-500/10"
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
          icon={Activity}
          label="Events Today"
          value={events.filter(e => Date.now() - e.timestamp < 86400000).length}
          accent="text-amber-400"
          bg="bg-amber-500/10"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Activity Feed */}
        <div className="lg:col-span-2 glass-panel-solid p-4">
          <h2 className="text-sm font-semibold text-surface-300 mb-4 flex items-center gap-2">
            <Activity size={16} />
            Activity Feed
          </h2>
          {recentEvents.length === 0 ? (
            <p className="text-surface-500 text-sm py-8 text-center">
              No activity yet. Events will appear as friends come online and move around.
            </p>
          ) : (
            <div className="space-y-1 max-h-[500px] overflow-y-auto">
              {recentEvents.map(event => {
                const Icon = eventIcons[event.type] || Activity;
                return (
                  <div
                    key={event.id}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-surface-800/40 transition-colors"
                  >
                    <div className={`flex-shrink-0 ${eventColors[event.type]}`}>
                      <Icon size={14} />
                    </div>
                    {event.userAvatar && (
                      <UserAvatar src={event.userAvatar} size="sm" />
                    )}
                    <div className="flex-1 min-w-0">
                      <span className="text-sm">
                        <span className="font-medium">{event.userName}</span>{' '}
                        <span className="text-surface-400">{eventMessage(event)}</span>
                      </span>
                    </div>
                    <span className="text-xs text-surface-600 flex-shrink-0">
                      {formatDistanceToNow(event.timestamp, { addSuffix: true })}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Online Friends sidebar */}
        <div className="glass-panel-solid p-4">
          <h2 className="text-sm font-semibold text-surface-300 mb-4 flex items-center gap-2">
            <Users size={16} />
            Online Friends
          </h2>
          {onlineFriends.length === 0 ? (
            <p className="text-surface-500 text-sm py-4 text-center">No friends online</p>
          ) : (
            <div className="space-y-1 max-h-[500px] overflow-y-auto">
              {onlineFriends.slice(0, 30).map(friend => (
                <div
                  key={friend.id}
                  className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-surface-800/40 transition-colors"
                >
                  <UserAvatar
                    src={friend.currentAvatarThumbnailImageUrl}
                    status={friend.status}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{friend.displayName}</div>
                    <div className="text-xs text-surface-500 truncate">
                      {friend.statusDescription || friend.status}
                    </div>
                  </div>
                </div>
              ))}
              {onlineFriends.length > 30 && (
                <p className="text-xs text-surface-500 text-center pt-2">
                  +{onlineFriends.length - 30} more
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, accent, bg }: {
  icon: typeof Activity; label: string; value: number; accent: string; bg: string;
}) {
  return (
    <div className="glass-panel-solid p-4 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center ${accent}`}>
        <Icon size={20} />
      </div>
      <div>
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-xs text-surface-400">{label}</div>
      </div>
    </div>
  );
}
