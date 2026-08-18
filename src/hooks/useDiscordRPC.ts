import { useEffect, useRef } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useInstanceHistoryStore } from '../stores/instanceHistoryStore';
import { useDiscordRpcStore } from '../stores/discordRpcStore';

interface DiscordConfig {
  enabled: boolean;
  clientId: string;
  showWorld: boolean;
  showAvatar: boolean;
}

function readConfig(): DiscordConfig {
  try {
    const raw = localStorage.getItem('vrcstudio_discord');
    const p = raw ? JSON.parse(raw) : {};
    return {
      enabled: p.enabled ?? false,
      clientId: p.clientId || '',
      showWorld: p.showWorld ?? true,
      showAvatar: p.showAvatar ?? true,
    };
  } catch {
    return { enabled: false, clientId: '', showWorld: true, showAvatar: true };
  }
}

export function useDiscordRPC() {
  // React-based selectors — re-render (and re-run effects) whenever these change.
  const user = useAuthStore(s => s.user);
  const isLoggedIn = useAuthStore(s => s.isLoggedIn);
  const currentInstance = useInstanceHistoryStore(s => s.currentInstance);
  const pushNonce = useDiscordRpcStore(s => s.pushNonce);

  const initialized = useRef(false);
  const sessionStartTs = useRef(Date.now());
  const lastClientId = useRef('');

  // Track previous config so we can detect enable/disable/clientId changes.
  const cfgRef = useRef(readConfig());
  // applyConfig runs from an interval and needs the latest pushActivity.
  const pushRef = useRef<() => void>();
  // Skip identical pushes — Discord rate-limits SET_ACTIVITY.
  const lastPayloadRef = useRef('');
  const lastPushAtRef = useRef(0);

  // ------------------------------------------------------------------
  // applyConfig: connect / disconnect discord RPC based on settings.
  // Runs once on mount and then on every config poll tick.
  // ------------------------------------------------------------------
  const applyConfig = useRef<() => void>(null!);
  applyConfig.current = () => {
    if (!window.electronAPI) return;
    const cfg = readConfig();
    cfgRef.current = cfg;

    if (cfg.enabled && isLoggedIn && cfg.clientId) {
      if (!initialized.current || lastClientId.current !== cfg.clientId) {
        window.electronAPI.discordInit(cfg.clientId);
        initialized.current = true;
        lastClientId.current = cfg.clientId;
        sessionStartTs.current = Date.now();
        // Connecting alone shows nothing — Discord only renders a presence
        // once an activity is set. Push straight away rather than waiting for
        // the user or instance object to happen to change.
        pushRef.current?.();
      } else {
        // Heartbeat: re-push when the payload changed, or every 60s so a
        // reconnect (Discord restarted, PC woke) recovers on its own.
        pushRef.current?.();
      }
    } else if (!cfg.enabled || !cfg.clientId) {
      if (initialized.current) {
        window.electronAPI.discordDisconnect();
        initialized.current = false;
        lastClientId.current = '';
      }
    }
  };

  // ------------------------------------------------------------------
  // pushActivity: build and send the current RPC payload.
  // Reads directly from refs/args so it's always fresh.
  // ------------------------------------------------------------------
  function pushActivity() {
    if (!window.electronAPI || !initialized.current) return;
    const cfg = cfgRef.current;

    const details = user ? user.displayName : 'VRChat Companion';
    let state: string | undefined;
    let largeImageKey: string | undefined;
    let largeImageText: string | undefined;
    let smallImageKey: string | undefined;
    let smallImageText: string | undefined;

    if (cfg.showWorld && currentInstance) {
      const worldName = currentInstance.worldName && !currentInstance.worldName.startsWith('wrld_')
        ? currentInstance.worldName
        : undefined;

      if (worldName) {
        const type = currentInstance.instanceType && currentInstance.instanceType !== 'public'
          ? ` · ${currentInstance.instanceType}` : '';
        state = `In ${worldName}${type}`;
        largeImageText = worldName;
      } else {
        state = 'Loading world…';
      }

      if (currentInstance.worldImage) {
        largeImageKey = currentInstance.worldImage;
      }

      if (cfg.showAvatar && user) {
        const avatar = user.profilePicOverride || user.currentAvatarThumbnailImageUrl || user.userIcon;
        if (avatar?.startsWith('https://')) {
          smallImageKey = avatar;
          smallImageText = user.displayName;
        }
      }
    } else if (user) {
      const status = user.statusDescription || user.status || 'Online';
      state = status.length >= 2 ? status : 'Online';
      const avatar = user.profilePicOverride || user.currentAvatarThumbnailImageUrl || user.userIcon;
      if (avatar?.startsWith('https://')) {
        largeImageKey = avatar;
        largeImageText = user.displayName;
      }
    }

    const safeDetails = details.slice(0, 128);
    const safeState = state && state.length >= 2 ? state.slice(0, 128) : undefined;
    const startTimestamp = Math.floor(
      (currentInstance ? currentInstance.joinedAt : sessionStartTs.current) / 1000
    );

    console.log('[useDiscordRPC] push', {
      inWorld: !!currentInstance,
      worldName: currentInstance?.worldName,
      state: safeState,
      startTimestamp,
    });

    const payload = {
      details: safeDetails,
      state: safeState,
      largeImageKey,
      largeImageText,
      smallImageKey,
      smallImageText,
      startTimestamp,
      instance: !!currentInstance,
    };

    // Discord rate-limits SET_ACTIVITY, and the heartbeat below fires every
    // few seconds — only send when something actually changed, or once a
    // minute to keep a reconnected client in sync.
    const fingerprint = JSON.stringify(payload);
    const now = Date.now();
    if (fingerprint === lastPayloadRef.current && now - lastPushAtRef.current < 60_000) return;
    lastPayloadRef.current = fingerprint;
    lastPushAtRef.current = now;

    window.electronAPI.discordSetActivity(payload);
  }

  pushRef.current = pushActivity;

  // ------------------------------------------------------------------
  // Effect 1: connect/disconnect when login state or clientId changes.
  // Polls every 5 s to catch localStorage config changes.
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!window.electronAPI) return;
    applyConfig.current();
    const pollId = setInterval(() => applyConfig.current(), 5000);
    return () => {
      clearInterval(pollId);
      if (initialized.current) {
        window.electronAPI?.discordDisconnect();
        initialized.current = false;
        lastClientId.current = '';
      }
    };
  }, [isLoggedIn]);

  // ------------------------------------------------------------------
  // Effect 2: push activity whenever user data or instance changes.
  // Because user/currentInstance come from React selectors, this effect
  // re-runs on every store change — no manual subscription needed.
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!initialized.current) return;
    pushActivity();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, currentInstance]);

  // Effect 3: an explicit "push now" request from Settings. Bypasses the
  // de-dupe so the button always does something visible.
  useEffect(() => {
    if (pushNonce === 0) return;
    lastPayloadRef.current = '';
    applyConfig.current();
    pushActivity();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pushNonce]);
}
