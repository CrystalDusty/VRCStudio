import { useEffect, useRef } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useFriendStore } from '../stores/friendStore';
import { useSettingsStore } from '../stores/settingsStore';

export function usePolling() {
  const { isLoggedIn } = useAuthStore();
  const { fetchOnlineFriends, fetchOfflineFriends } = useFriendStore();
  const { settings } = useSettingsStore();
  const friendsIntervalRef = useRef<ReturnType<typeof setInterval>>();
  const offlineIntervalRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    if (!isLoggedIn) return;

    // Initial fetch
    fetchOnlineFriends();
    fetchOfflineFriends();

    // Set up polling
    friendsIntervalRef.current = setInterval(
      fetchOnlineFriends,
      settings.polling.friendsInterval * 1000
    );

    offlineIntervalRef.current = setInterval(
      fetchOfflineFriends,
      300_000 // Refresh offline friends every 5 min
    );

    return () => {
      if (friendsIntervalRef.current) clearInterval(friendsIntervalRef.current);
      if (offlineIntervalRef.current) clearInterval(offlineIntervalRef.current);
    };
  }, [isLoggedIn, settings.polling.friendsInterval]);
}
