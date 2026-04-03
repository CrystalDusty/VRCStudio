import { useState, useMemo } from 'react';
import { X, Calendar, MapPin, MessageCircle, Clock, Filter } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import UserAvatar from './common/UserAvatar';
import { getBestAvatarUrl } from '../utils/avatar';
import type { VRCUser, FeedEvent } from '../types/vrchat';

interface FriendEventDetailProps {
  friend: VRCUser;
  events: FeedEvent[];
  onClose: () => void;
}

export default function FriendEventDetail({ friend, events, onClose }: FriendEventDetailProps) {
  const [filterType, setFilterType] = useState<string | null>(null);

  const filteredEvents = useMemo(() => {
    const friendEvents = events.filter(e => e.userId === friend.id);
    if (!filterType) return friendEvents;
    return friendEvents.filter(e => e.type === filterType);
  }, [events, friend.id, filterType]);

  const eventTypes = useMemo(() => {
    const types = new Set<string>();
    events.forEach(e => {
      if (e.userId === friend.id) types.add(e.type);
    });
    return Array.from(types).sort();
  }, [events, friend.id]);

  const getEventLabel = (type: string) => {
    const labels: Record<string, string> = {
      'friend_online': 'Came Online',
      'friend_offline': 'Went Offline',
      'friend_location': 'Changed Location',
      'friend_status': 'Changed Status',
      'friend_update': 'Updated Profile',
    };
    return labels[type] || type;
  };

  const getEventColor = (type: string) => {
    const colors: Record<string, string> = {
      'friend_online': 'bg-green-500/15 text-green-400',
      'friend_offline': 'bg-red-500/15 text-red-400',
      'friend_location': 'bg-blue-500/15 text-blue-400',
      'friend_status': 'bg-purple-500/15 text-purple-400',
      'friend_update': 'bg-amber-500/15 text-amber-400',
    };
    return colors[type] || 'bg-surface-800 text-surface-400';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end animate-fade-in">
      {/* Backdrop */}
      <button
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
        aria-label="Close"
      />

      {/* Slide-in panel */}
      <div className="relative w-full max-w-md h-screen bg-surface-900 border-l border-surface-700 flex flex-col shadow-xl">
        {/* Header */}
        <div className="border-b border-surface-800 p-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <UserAvatar src={getBestAvatarUrl(friend)} status={friend.status} size="md" />
            <div className="min-w-0 flex-1">
              <h2 className="font-bold text-surface-100 truncate">{friend.displayName}</h2>
              <p className="text-xs text-surface-500 truncate">@{friend.username}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="btn-ghost flex-shrink-0"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Filter buttons */}
        <div className="border-b border-surface-800 px-4 py-3 flex items-center gap-2 overflow-x-auto">
          <Filter size={14} className="text-surface-500 flex-shrink-0" />
          <button
            onClick={() => setFilterType(null)}
            className={`px-2.5 py-1 rounded text-xs font-medium flex-shrink-0 transition-colors ${
              filterType === null
                ? 'bg-accent-600 text-white'
                : 'bg-surface-800 text-surface-400 hover:bg-surface-700'
            }`}
          >
            All
          </button>
          {eventTypes.map(type => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`px-2.5 py-1 rounded text-xs font-medium flex-shrink-0 transition-colors whitespace-nowrap ${
                filterType === type
                  ? 'bg-accent-600 text-white'
                  : 'bg-surface-800 text-surface-400 hover:bg-surface-700'
              }`}
            >
              {getEventLabel(type)}
            </button>
          ))}
        </div>

        {/* Events list */}
        <div className="flex-1 overflow-y-auto">
          {filteredEvents.length === 0 ? (
            <div className="flex items-center justify-center h-full text-center px-4">
              <div>
                <Calendar size={32} className="text-surface-700 mx-auto mb-2" />
                <p className="text-sm text-surface-500">No events found</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3 p-4">
              {filteredEvents.map((event, idx) => (
                <div
                  key={`${event.userId}-${event.timestamp}-${idx}`}
                  className="glass-panel-solid p-3 rounded-lg"
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${getEventColor(event.type).split(' ')[0]}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded ${getEventColor(event.type)}`}>
                          {getEventLabel(event.type)}
                        </span>
                      </div>
                      {event.data && Object.keys(event.data).length > 0 && (
                        <div className="text-xs text-surface-400 space-y-1">
                          {event.data.world && (
                            <div className="flex items-center gap-1.5">
                              <MapPin size={12} />
                              <span className="truncate">{event.data.world}</span>
                            </div>
                          )}
                          {event.data.status && (
                            <div className="flex items-center gap-1.5">
                              <MessageCircle size={12} />
                              <span className="truncate">Status: {event.data.status}</span>
                            </div>
                          )}
                        </div>
                      )}
                      <div className="flex items-center gap-1 text-[10px] text-surface-600 mt-1.5">
                        <Clock size={10} />
                        {format(event.timestamp, 'MMM d, HH:mm:ss')}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer stats */}
        <div className="border-t border-surface-800 px-4 py-3 text-xs text-surface-500">
          <p>Showing {filteredEvents.length} event{filteredEvents.length !== 1 ? 's' : ''}</p>
        </div>
      </div>
    </div>
  );
}
