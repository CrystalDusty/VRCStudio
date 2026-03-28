import { useEffect, useRef } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useFriendStore } from '../stores/friendStore';
import { useSettingsStore } from '../stores/settingsStore';
import vrchatWS from '../api/websocket';

export function usePolling() {
  const { isLoggedIn } = useAuthStore();
  const { fetchOnlineFriends, fetchOfflineFriends } = useFriendStore();
  const { settings } = useSettingsStore();
  const friendsIntervalRef = useRef<ReturnType<typeof setInterval>>();
  const offlineIntervalRef = useRef<ReturnType<typeof setInterval>>();

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

    // Polling as fallback / supplement to WebSocket
    friendsIntervalRef.current = setInterval(
      fetchOnlineFriends,
      settings.polling.friendsInterval * 1000
    );

    offlineIntervalRef.current = setInterval(
      fetchOfflineFriends,
      300_000
    );

    return () => {
      vrchatWS.disconnect();
      if (friendsIntervalRef.current) clearInterval(friendsIntervalRef.current);
      if (offlineIntervalRef.current) clearInterval(offlineIntervalRef.current);
    };
  }, [isLoggedIn, settings.polling.friendsInterval]);
}
