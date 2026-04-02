import { useEffect, useRef } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useFriendStore } from '../stores/friendStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useInstanceHistoryStore } from '../stores/instanceHistoryStore';
import { useWorldStore } from '../stores/worldStore';
import vrchatWS from '../api/websocket';

export function usePolling() {
  const { isLoggedIn, user, refreshUser } = useAuthStore();
  const { fetchOnlineFriends, fetchOfflineFriends } = useFriendStore();
  const { settings } = useSettingsStore();
  const { trackJoin, trackLeave, currentInstance } = useInstanceHistoryStore();
  const { getWorld } = useWorldStore();
  const friendsIntervalRef = useRef<ReturnType<typeof setInterval>>();
  const offlineIntervalRef = useRef<ReturnType<typeof setInterval>>();
  const locationIntervalRef = useRef<ReturnType<typeof setInterval>>();
  const lastLocationRef = useRef<string>('');

  // Track user's location changes for instance history
  useEffect(() => {
    if (!user?.location) return;
    const loc = user.location;

    if (loc === lastLocationRef.current) return;
    lastLocationRef.current = loc;

    if (!loc || loc === 'offline' || loc === 'private') {
      if (currentInstance) trackLeave();
      return;
    }

    const parts = loc.split(':');
    const worldId = parts[0];
    const instanceId = parts.slice(1).join(':');

    if (!worldId?.startsWith('wrld_') || !instanceId) return;

    // Determine instance type from the instance ID
    let instanceType = 'public';
    if (instanceId.includes('~friends(')) instanceType = 'friends';
    else if (instanceId.includes('~hidden(')) instanceType = 'friends+';
    else if (instanceId.includes('~private(')) instanceType = 'invite';
    else if (instanceId.includes('~group(')) instanceType = 'group';

    // Fetch world info for name/image
    getWorld(worldId).then(world => {
      trackJoin({
        worldId,
        instanceId,
        worldName: world?.name || worldId,
        worldImage: world?.thumbnailImageUrl || '',
        instanceType,
      });
    }).catch(() => {
      trackJoin({
        worldId,
        instanceId,
        worldName: worldId,
        worldImage: '',
        instanceType,
      });
    });
  }, [user?.location]);

  useEffect(() => {
    if (!isLoggedIn) {
      vrchatWS.disconnect();
      return;
    }

    // Connect WebSocket for real-time events
    vrchatWS.connect();

    // Initial fetch
    fetchOnlineFriends();
    fetchOfflineFriends();
    refreshUser();

    // Polling as fallback / supplement to WebSocket
    friendsIntervalRef.current = setInterval(
      fetchOnlineFriends,
      settings.polling.friendsInterval * 1000
    );

    offlineIntervalRef.current = setInterval(
      fetchOfflineFriends,
      300_000
    );

    // Poll user location for instance tracking
    locationIntervalRef.current = setInterval(
      refreshUser,
      60_000
    );

    return () => {
      vrchatWS.disconnect();
      if (friendsIntervalRef.current) clearInterval(friendsIntervalRef.current);
      if (offlineIntervalRef.current) clearInterval(offlineIntervalRef.current);
      if (locationIntervalRef.current) clearInterval(locationIntervalRef.current);
    };
  }, [isLoggedIn, settings.polling.friendsInterval]);
}
