import { useSettingsStore } from '../stores/settingsStore';
import type { FeedEvent } from '../types/vrchat';

type NotifEventType = FeedEvent['type'];

const eventTitles: Record<NotifEventType, string> = {
  friend_online: 'Friend Online',
  friend_offline: 'Friend Offline',
  friend_location: 'Location Change',
  friend_status: 'Status Change',
  friend_avatar: 'Avatar Change',
  friend_add: 'New Friend',
  friend_remove: 'Friend Removed',
  world_visit: 'World Visit',
};

const settingsKeyMap: Partial<Record<NotifEventType, keyof ReturnType<typeof useSettingsStore.getState>['settings']['notifications']>> = {
  friend_online: 'friendOnline',
  friend_offline: 'friendOffline',
  friend_location: 'friendLocation',
  friend_status: 'friendStatus',
  friend_add: 'invites',
};

let webPermissionGranted = false;

export function requestNotificationPermission() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    webPermissionGranted = true;
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(p => { webPermissionGranted = p === 'granted'; });
  }
}

function getBody(event: Partial<FeedEvent>): string {
  switch (event.type) {
    case 'friend_online': return `${event.userName} came online`;
    case 'friend_offline': return `${event.userName} went offline`;
    case 'friend_location': return `${event.userName} ${event.details || 'changed location'}`;
    case 'friend_status': return `${event.userName} is now ${event.newValue}`;
    case 'friend_add': return `${event.userName} added as a friend`;
    case 'friend_remove': return `${event.userName} removed from friends`;
    default: return event.details || '';
  }
}

export function sendDesktopNotification(event: Partial<FeedEvent>) {
  const settings = useSettingsStore.getState().settings;

  // Check if this type is enabled in settings
  const settingKey = settingsKeyMap[event.type as NotifEventType];
  if (settingKey && !settings.notifications[settingKey]) return;

  const title = eventTitles[event.type as NotifEventType] || 'VRC Studio';
  const body = getBody(event);
  if (!body) return;

  // Prefer Electron native notifications
  if (window.electronAPI?.sendNotification) {
    window.electronAPI.sendNotification({ title, body, icon: event.userAvatar });
    return;
  }

  // Fall back to Web Notifications API
  if (!webPermissionGranted || !('Notification' in window)) return;

  try {
    const n = new Notification(title, {
      body,
      icon: event.userAvatar,
      silent: !settings.notifications.sound,
      tag: `vrcstudio-${event.type}-${event.userId}`,
    });
    n.onclick = () => { window.focus(); n.close(); };
    setTimeout(() => n.close(), 8000);
  } catch {}
}

export function sendSimpleNotification(title: string, body: string, icon?: string) {
  if (window.electronAPI?.sendNotification) {
    window.electronAPI.sendNotification({ title, body, icon });
    return;
  }
  if (!webPermissionGranted || !('Notification' in window)) return;
  try {
    const n = new Notification(title, { body, icon });
    n.onclick = () => { window.focus(); n.close(); };
    setTimeout(() => n.close(), 8000);
  } catch {}
}
