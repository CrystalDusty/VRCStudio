import { useEffect, useRef } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useSettingsStore } from '../stores/settingsStore';

// VRC Studio Discord application client ID
// Users can set their own in Settings, or leave blank to use the default
const DEFAULT_CLIENT_ID = '1234567890123456789'; // placeholder

export function useDiscordRPC() {
  const { user, isLoggedIn } = useAuthStore();
  const { settings } = useSettingsStore();
  const startTimestamp = useRef(Date.now());
  const initialized = useRef(false);

  useEffect(() => {
    if (!isLoggedIn || !window.electronAPI) return;
    if (!(settings as any).discord?.enabled) return;

    const clientId = (settings as any).discord?.clientId || DEFAULT_CLIENT_ID;

    if (!initialized.current) {
      window.electronAPI.discordInit(clientId);
      initialized.current = true;
      startTimestamp.current = Date.now();
    }

    return () => {
      if (initialized.current) {
        window.electronAPI?.discordDisconnect();
        initialized.current = false;
      }
    };
  }, [isLoggedIn, (settings as any).discord?.enabled]);

  const updateActivity = async (opts: {
    details?: string;
    state?: string;
    worldName?: string;
    worldId?: string;
    playerCount?: number;
  }) => {
    if (!window.electronAPI || !initialized.current) return;

    await window.electronAPI.discordSetActivity({
      details: opts.details || (user ? `As ${user.displayName}` : 'In VRChat'),
      state: opts.state || (opts.worldName ? `In ${opts.worldName}` : 'Browsing'),
      largeImageKey: 'vrchat_logo',
      largeImageText: 'VRC Studio',
      smallImageKey: opts.worldId ? 'world_icon' : undefined,
      smallImageText: opts.worldName,
      startTimestamp: startTimestamp.current,
      instance: !!opts.worldId,
    });
  };

  return { updateActivity };
}
