import { useEffect, useRef } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useInstanceHistoryStore } from '../stores/instanceHistoryStore';
import { useDiscordRpcStore } from '../stores/discordRpcStore';
import api from '../api/vrchat';

/**
 * What goes in Discord's two image slots.
 *
 * Discord renders exactly one large image and one small circular badge over
 * its corner, and the layout is Discord's to decide — an app cannot composite
 * them into a split panel. What we CAN do is choose which of our two pictures
 * goes in which slot, which is the closest thing to "half and half" the
 * protocol allows, and swap them on a condition.
 */
export type ImageLayout =
  | 'world-avatar'   // world big, you in the corner
  | 'avatar-world'   // you big, world in the corner
  | 'world-only'
  | 'avatar-only'
  | 'none';

/** When to flip to the alternate layout. */
export type LayoutSwitch =
  | 'never'
  | 'private'        // instance is private/invite
  | 'not-public'     // anything other than a public instance
  | 'group';

export interface DiscordConfig {
  enabled: boolean;
  clientId: string;
  showWorld: boolean;
  showAvatar: boolean;

  // ── Cosmetics ──
  layout: ImageLayout;
  /** Layout used when `switchWhen` matches — e.g. avatar-only in private worlds. */
  altLayout: ImageLayout;
  switchWhen: LayoutSwitch;
  /** Template for the first presence line. Tokens: {name} {world} {avatar} {status} {instance} {players} */
  detailsTemplate: string;
  /** Template for the second line. */
  stateTemplate: string;
  /** Hide the world's name in non-public instances. */
  privacyHideWorld: boolean;
  /** Show elapsed time in the instance. */
  showElapsed: boolean;
  /** Add a "View World" button to the presence card. */
  showWorldButton: boolean;
  /** Second button linking to your VRChat profile. */
  showProfileButton: boolean;
  /** Text shown when hovering the large image. */
  largeTextTemplate: string;
  /**
   * Asset key uploaded to your Discord application, used when there's no
   * world or avatar picture to show — or when the picture we have turns out
   * to be one Discord can't fetch. Prevents a broken-image box.
   */
  fallbackImageKey: string;
  /**
   * Asset keys that replace the VRChat pictures outright.
   *
   * VRChat serves world and avatar thumbnails from an endpoint that needs a
   * login. Our own window can show them because Electron carries the session
   * cookie; Discord's media proxy fetches the URL from its own servers with no
   * cookie at all, so for many accounts it gets a 401 and renders a "?" box.
   * Setting a key here sidesteps the whole question — Discord resolves keys
   * against your application's uploaded art, which always works.
   */
  worldImageKey: string;
  avatarImageKey: string;
  /** Resolve and show the group's name for group instances. */
  showGroupName: boolean;
}

export const DISCORD_DEFAULTS: DiscordConfig = {
  enabled: false,
  clientId: '',
  showWorld: true,
  showAvatar: true,
  layout: 'world-avatar',
  altLayout: 'avatar-only',
  switchWhen: 'never',
  detailsTemplate: '{name}',
  stateTemplate: 'In {world}{instance}',
  privacyHideWorld: false,
  showElapsed: true,
  showWorldButton: false,
  showProfileButton: false,
  largeTextTemplate: '{world}',
  fallbackImageKey: '',
  worldImageKey: '',
  avatarImageKey: '',
  showGroupName: true,
};

export function readConfig(): DiscordConfig {
  try {
    const raw = localStorage.getItem('vrcstudio_discord');
    const p = raw ? JSON.parse(raw) : {};
    return { ...DISCORD_DEFAULTS, ...p };
  } catch {
    return { ...DISCORD_DEFAULTS };
  }
}

/** Fills {tokens} in a presence template. */
export function renderTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '').replace(/\s{2,}/g, ' ').trim();
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
  // Last world thumbnail we had, so a world change doesn't flash a gap.
  const lastWorldImageRef = useRef<{ worldId?: string; url: string }>({ url: '' });
  // Resolved group names, keyed by group id.
  const groupNameRef = useRef<Record<string, string>>({});

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

    const groupId = currentInstance?.groupId;
    const instanceType = (currentInstance?.instanceType ?? 'public').toLowerCase();
    const isPublic = instanceType === 'public';
    const worldKnown = !!currentInstance?.worldName &&
      !currentInstance.worldName.startsWith('wrld_');

    // Privacy: in a non-public instance the world name can identify a private
    // gathering, so it can be withheld while still showing you're in VRChat.
    const hideWorld = cfg.privacyHideWorld && !isPublic;
    const worldLabel = !currentInstance ? ''
      : hideWorld ? 'a private world'
      : worldKnown ? currentInstance.worldName
      : 'a world';

    // An explicit asset key always wins over the VRChat URL — see the config
    // comment: keys are the only image source Discord can resolve reliably.
    const avatarImage = cfg.avatarImageKey.trim()
      || user?.profilePicOverride || user?.currentAvatarThumbnailImageUrl || user?.userIcon || '';

    // A world change lands in two steps: the instance switches with an empty
    // worldImage, then the world fetch fills it in a moment later. Pushing
    // through that gap swapped the large image to your avatar and back, which
    // is what "changing world breaks the icons" looks like from outside.
    // Hold the previous world's image until the new one actually arrives.
    const liveWorldImage = currentInstance?.worldImage || '';
    if (liveWorldImage) {
      lastWorldImageRef.current = { worldId: currentInstance?.worldId, url: liveWorldImage };
    } else if (currentInstance && lastWorldImageRef.current.worldId !== currentInstance.worldId) {
      // Genuinely a different world with no image yet — don't show the old one.
      lastWorldImageRef.current = { worldId: currentInstance.worldId, url: '' };
    }
    const worldImage = cfg.worldImageKey.trim()
      || liveWorldImage || lastWorldImageRef.current.url || '';

    // Which layout applies right now.
    const switched =
      cfg.switchWhen === 'private'    ? instanceType === 'private' || instanceType === 'invite'
      : cfg.switchWhen === 'not-public' ? !isPublic
      : cfg.switchWhen === 'group'      ? instanceType === 'group'
      : false;
    let layout: ImageLayout = switched ? cfg.altLayout : cfg.layout;

    // Legacy toggles still win — turning images off means off.
    if (!cfg.showAvatar && !cfg.showWorld) layout = 'none';
    else if (!cfg.showAvatar && layout !== 'none') layout = 'world-only';
    else if (!cfg.showWorld && layout !== 'none') layout = 'avatar-only';
    if (!currentInstance && (layout === 'world-avatar' || layout === 'world-only')) {
      layout = cfg.showAvatar ? 'avatar-only' : 'none';
    }

    const vars: Record<string, string> = {
      name: user?.displayName ?? 'VRChat',
      world: worldLabel,
      avatar: (user as any)?.currentAvatarName ?? '',
      status: user?.statusDescription || user?.status || '',
      instance: currentInstance && !hideWorld && !isPublic ? ` · ${instanceType}` : '',
      players: '',
      // Group instances get the group's actual name once it resolves, not
      // just the word "group".
      group: (!hideWorld && cfg.showGroupName && groupId && groupNameRef.current[groupId]) || '',
    };
    // "· group" becomes "· Furry Hideout" when we know the name.
    if (vars.group) vars.instance = ` · ${vars.group}`;

    const details = renderTemplate(cfg.detailsTemplate || '{name}', vars) || (user?.displayName ?? 'VRChat');
    let state = renderTemplate(cfg.stateTemplate || 'In {world}', vars);
    if (!currentInstance) {
      state = renderTemplate(vars.status ? '{status}' : '', vars) || 'Not in a world';
    }

    let largeImageKey: string | undefined;
    let smallImageKey: string | undefined;
    switch (layout) {
      case 'world-avatar': largeImageKey = worldImage || avatarImage; smallImageKey = worldImage ? avatarImage : undefined; break;
      case 'avatar-world': largeImageKey = avatarImage || worldImage; smallImageKey = avatarImage ? worldImage : undefined; break;
      case 'world-only':   largeImageKey = worldImage; break;
      case 'avatar-only':  largeImageKey = avatarImage; break;
      case 'none':         break;
    }
    // Anything that isn't an https URL is treated as an asset KEY uploaded to
    // the Discord application, which is the only image source Discord can
    // always render. Empty stays empty.
    const usable = (v: string | undefined) => (v && v.trim() ? v : undefined);
    largeImageKey = usable(largeImageKey);
    smallImageKey = usable(smallImageKey);

    // The fallback key is applied in the main process instead of here: only
    // that side knows whether a URL survived the "can a stranger fetch this?"
    // probe, and substituting early would hide a dead URL behind a good one.

    const largeImageText = renderTemplate(cfg.largeTextTemplate || '{world}', vars) || undefined;
    const smallImageText = layout === 'world-avatar' ? user?.displayName
      : layout === 'avatar-world' ? (hideWorld ? undefined : worldLabel)
      : undefined;

    // MILLISECONDS, not seconds. discord-rpc passes this straight through
    // (it only converts a Date via getTime(), and range-checks against
    // 2147483647000), so a seconds value lands in January 1970 and the
    // elapsed counter renders as nonsense that never advances sensibly.
    const startTimestamp = cfg.showElapsed
      ? (currentInstance ? currentInstance.joinedAt : sessionStartTs.current)
      : undefined;

    // Buttons are suppressed whenever they'd leak a world the user chose to
    // hide — a link is a stronger disclosure than a name.
    const buttons: Array<{ label: string; url: string }> = [];
    if (cfg.showWorldButton && currentInstance?.worldId && !hideWorld) {
      buttons.push({ label: 'View World', url: `https://vrchat.com/home/world/${currentInstance.worldId}` });
    }
    if (cfg.showProfileButton && user?.id) {
      buttons.push({ label: 'VRChat Profile', url: `https://vrchat.com/home/user/${user.id}` });
    }

    const safeDetails = details.slice(0, 128);
    const safeState = state && state.length >= 2 ? state.slice(0, 128) : undefined;

    const payload = {
      details: safeDetails,
      state: safeState,
      largeImageKey,
      largeImageText: largeImageText?.slice(0, 128),
      smallImageKey,
      smallImageText: smallImageText?.slice(0, 128),
      startTimestamp,
      instance: !!currentInstance,
      buttons: buttons.length > 0 ? buttons.slice(0, 2) : undefined,
      fallbackImageKey: cfg.fallbackImageKey.trim() || undefined,
    };

    // Discord rate-limits SET_ACTIVITY, and the heartbeat below fires every
    // few seconds — only send when something actually changed, or once a
    // minute to keep a reconnected client in sync.
    const fingerprint = JSON.stringify(payload);
    const now = Date.now();
    if (fingerprint === lastPayloadRef.current && now - lastPushAtRef.current < 60_000) return;
    lastPayloadRef.current = fingerprint;
    lastPushAtRef.current = now;

    console.log('[useDiscordRPC] push', { layout, state: safeState, hideWorld });
    window.electronAPI.discordSetActivity(payload);
  }

  pushRef.current = pushActivity;

  // Resolve the group behind a group instance, once per group. The name is
  // what people actually want on their profile — "· group" says nothing.
  useEffect(() => {
    const gid = currentInstance?.groupId;
    if (!gid || groupNameRef.current[gid]) return;
    let cancelled = false;
    api.getGroup(gid)
      .then(g => {
        const name = g?.name ?? g?.shortCode;
        if (cancelled || !name) return;
        groupNameRef.current[gid] = name;
        // The name arriving changes the payload, so ask for a fresh push.
        pushRef.current?.();
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [currentInstance?.groupId]);

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
