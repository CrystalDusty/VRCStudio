import { useState, useEffect } from 'react';
import { Bell, Mail, UserPlus, MessageSquare, Trash2, CheckCheck, RefreshCw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import api from '../api/vrchat';
import EmptyState from '../components/common/EmptyState';
import LoadingSpinner from '../components/common/LoadingSpinner';
import type { VRCNotification } from '../types/vrchat';

const typeIcons: Record<string, typeof Bell> = {
  friendRequest: UserPlus,
  invite: Mail,
  message: MessageSquare,
  votetokick: Bell,
};

const typeLabels: Record<string, string> = {
  friendRequest: 'Friend Request',
  invite: 'Invite',
  message: 'Message',
  votetokick: 'Vote to Kick',
};

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<VRCNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchNotifications = async () => {
    setIsLoading(true);
    try {
      const notifs = await api.getNotifications();
      setNotifications(notifs);
    } catch {}
    setIsLoading(false);
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  const markRead = async (id: string) => {
    try {
      await api.markNotificationRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, seen: true } : n));
    } catch {}
  };

  const clearAll = async () => {
    try {
      await api.clearAllNotifications();
      setNotifications([]);
    } catch {}
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Notifications</h1>
        <div className="flex gap-2">
          <button onClick={fetchNotifications} className="btn-ghost flex items-center gap-1 text-sm">
            <RefreshCw size={14} /> Refresh
          </button>
          {notifications.length > 0 && (
            <button onClick={clearAll} className="btn-danger flex items-center gap-1 text-sm">
              <Trash2 size={14} /> Clear All
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <LoadingSpinner className="py-16" />
      ) : notifications.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="No notifications"
          description="You're all caught up!"
        />
      ) : (
        <div className="space-y-1">
          {notifications.map(notif => {
            const Icon = typeIcons[notif.type] || Bell;
            return (
              <div
                key={notif.id}
                className={`glass-panel-solid p-4 flex items-start gap-3 card-hover ${
                  !notif.seen ? 'border-accent-500/30' : ''
                }`}
              >
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  !notif.seen ? 'bg-accent-500/15 text-accent-400' : 'bg-surface-800 text-surface-400'
                }`}>
                  <Icon size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{notif.senderUsername}</span>
                    <span className="badge bg-surface-800 text-surface-400">
                      {typeLabels[notif.type] || notif.type}
                    </span>
                    {!notif.seen && (
                      <span className="w-1.5 h-1.5 rounded-full bg-accent-500" />
                    )}
                  </div>
                  {notif.message && (
                    <p className="text-sm text-surface-400 mt-0.5">{notif.message}</p>
                  )}
                  <span className="text-xs text-surface-600 mt-1 block">
                    {formatDistanceToNow(new Date(notif.created_at), { addSuffix: true })}
                  </span>
                </div>
                {!notif.seen && (
                  <button
                    onClick={() => markRead(notif.id)}
                    className="btn-ghost text-xs flex items-center gap-1"
                  >
                    <CheckCheck size={14} /> Mark Read
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
