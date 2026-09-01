import { useState, useRef, useEffect } from 'react';
import {
  Settings as SettingsIcon, Bell, Monitor, Clock, RotateCcw, RotateCw,
  Palette, Download, Upload, UserCircle, Globe2, Zap, Shield,
  Trash2, Smile, X, Volume2, Moon, Sun, ArrowUpDown, Lock,
  Cpu, Database, Keyboard, Info, ExternalLink, Gamepad2,
  CheckCircle, XCircle, History,
} from 'lucide-react';
import { VRCDB_PROVIDERS, getProviderId, setProviderId } from '../api/vrcdb';
import { useAsteroidsGameStore } from '../stores/asteroidsGameStore';
import type { ProviderId } from '../api/vrcdb';
import { useSettingsStore } from '../stores/settingsStore';
import { useAvatarHistoryStore } from '../stores/avatarHistoryStore';
import { KEEP_MIN, KEEP_MAX } from '../utils/avatarHistory';
import { useAuthStore } from '../stores/authStore';
import { useInstanceHistoryStore } from '../stores/instanceHistoryStore';
import { useFriendStore } from '../stores/friendStore';
import { useThemeStore } from '../stores/themeStore';
import { useUpdateStore } from '../stores/updateStore';
import { useDiscordBotStore } from '../stores/discordBotStore';
import { useDiscordRpcStore } from '../stores/discordRpcStore';
import { readConfig as readDiscordConfig, type DiscordConfig, type ImageLayout, type LayoutSwitch } from '../hooks/useDiscordRPC';
import { useMultiAccountStore } from '../stores/multiAccountStore';
import { exportAllData, downloadExport, importData, exportFriendsList, downloadCSV } from '../utils/dataExport';
import { getAvailableLanguages, setLanguage, getLanguage } from '../utils/i18n';

type SettingsSection =
  | 'account' | 'accounts' | 'notifications' | 'polling'
  | 'display' | 'appearance' | 'discord' | 'discord-bot' | 'vrcdb' | 'general' | 'data'
  | 'profile' | 'privacy' | 'performance' | 'shortcuts' | 'about' | 'updates'
  | 'avatar-log';

// `keywords` are concept words used only by the settings search box, so a
// section can be found by terms that don't appear in its visible label.
const sections: Array<{ key: SettingsSection; label: string; icon: typeof SettingsIcon; group: string; keywords?: string }> = [
  { key: 'profile',       label: 'Personalization',       icon: Smile,         group: 'Profile',      keywords: 'nickname greeting name preferred' },
  { key: 'account',       label: 'Account',               icon: UserCircle,    group: 'Profile',      keywords: 'login user bio profile picture sign out' },
  { key: 'accounts',      label: 'Multiple Accounts',     icon: Shield,        group: 'Profile',      keywords: 'switch alt accounts saved login' },
  { key: 'notifications', label: 'Notifications',         icon: Bell,          group: 'App',          keywords: 'alerts desktop popup sound toast' },
  { key: 'polling',       label: 'Update Intervals',      icon: Clock,         group: 'App',          keywords: 'refresh rate polling frequency friends' },
  { key: 'display',       label: 'Display',               icon: Monitor,       group: 'App',          keywords: 'window layout screen' },
  { key: 'appearance',    label: 'Appearance',            icon: Palette,       group: 'App',          keywords: 'theme colour color border font dark light oled midnight accent visualizer liveliness particles hacker premium' },
  { key: 'privacy',       label: 'Privacy',               icon: Lock,          group: 'App',          keywords: 'security hide blur sensitive' },
  { key: 'avatar-log',    label: 'Avatar Log',            icon: History,       group: 'App',          keywords: 'avatar log history track record players changed worn past' },
  { key: 'discord',       label: 'Discord Rich Presence', icon: Zap,           group: 'Integrations', keywords: 'discord rpc status presence activity' },
  { key: 'discord-bot',   label: 'Discord Bot',           icon: Zap,           group: 'Integrations', keywords: 'discord bot slash commands token' },
  { key: 'vrcdb',         label: 'Avatar Database',       icon: Database,      group: 'Integrations', keywords: 'avatar database avtrdb search provider' },
  { key: 'general',       label: 'General',               icon: SettingsIcon,  group: 'System',       keywords: 'misc startup tray launch minimize' },
  { key: 'performance',   label: 'Performance',           icon: Cpu,           group: 'System',       keywords: 'fps cpu memory gpu speed' },
  { key: 'shortcuts',     label: 'Keyboard Shortcuts',    icon: Keyboard,      group: 'System',       keywords: 'hotkeys keys bindings ctrl' },
  { key: 'data',          label: 'Data & Backup',         icon: Download,      group: 'System',       keywords: 'export import csv storage backup restore' },
  { key: 'updates',       label: 'Updates',               icon: Download,      group: 'System',       keywords: 'version github upgrade changelog' },
  { key: 'about',         label: 'About',                 icon: Info,          group: 'System',       keywords: 'version credits author license' },
];

const SHORTCUT_LIST: Array<{ description: string; keys: string[] }> = [
  { description: 'Go to Dashboard',  keys: ['Ctrl', '1'] },
  { description: 'Go to Friends',    keys: ['Ctrl', '2'] },
  { description: 'Go to Worlds',     keys: ['Ctrl', '3'] },
  { description: 'Go to Avatars',    keys: ['Ctrl', '4'] },
  { description: 'Focus Search',     keys: ['Ctrl', 'F'] },
  { description: 'Open Settings',    keys: ['Ctrl', ','] },
];

// ── Discord presence cosmetics ──────────────────────────────────────────

const LAYOUT_OPTIONS: Array<{ v: ImageLayout; label: string; hint: string }> = [
  { v: 'world-avatar', label: 'World + you',  hint: 'World big, your avatar in the corner' },
  { v: 'avatar-world', label: 'You + world',  hint: 'Your avatar big, world in the corner' },
  { v: 'world-only',   label: 'World only',   hint: 'Just the world thumbnail' },
  { v: 'avatar-only',  label: 'Avatar only',  hint: 'Just your avatar' },
  { v: 'none',         label: 'No images',    hint: 'Text presence only' },
];

/** Miniature of how Discord will arrange the two slots. */
function LayoutSwatch({ layout }: { layout: ImageLayout }) {
  const big = layout === 'avatar-world' || layout === 'avatar-only' ? 'avatar'
    : layout === 'none' ? null : 'world';
  const small = layout === 'world-avatar' ? 'avatar'
    : layout === 'avatar-world' ? 'world' : null;
  const fill = (k: string | null) =>
    k === 'avatar' ? 'bg-gradient-to-br from-pink-500/70 to-purple-500/70'
      : k === 'world' ? 'bg-gradient-to-br from-sky-500/70 to-emerald-500/70'
      : 'bg-surface-700';
  return (
    <div className="relative w-9 h-9 rounded-md overflow-hidden flex-shrink-0">
      <div className={`w-full h-full ${fill(big)}`} />
      {small && (
        <span className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border border-surface-900 ${fill(small)}`} />
      )}
    </div>
  );
}

function LayoutPicker({ value, onChange }: { value: ImageLayout; onChange: (v: ImageLayout) => void }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {LAYOUT_OPTIONS.map(o => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={`p-2 rounded-lg border text-left flex items-center gap-2 transition-colors ${
            value === o.v ? 'border-accent-500 bg-accent-500/10' : 'border-surface-700 hover:border-surface-600'
          }`}
        >
          <LayoutSwatch layout={o.v} />
          <span className="min-w-0">
            <span className="block text-xs font-medium">{o.label}</span>
            <span className="block text-[10px] text-surface-500 leading-tight">{o.hint}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

function TemplateField({ label, value, onChange }: {
  label: string; value: string; onChange: (v: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  return (
    <label className="block">
      <span className="text-xs text-surface-400">{label}</span>
      <input
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => draft !== value && onChange(draft)}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        className="input-field w-full text-sm font-mono mt-0.5"
      />
    </label>
  );
}

/**
 * One image slot in the preview. The value is either a VRChat URL, which we
 * can show directly because this window is logged in, or an asset key, which
 * only Discord can resolve — so we show the key itself rather than pretending
 * to know what art it points at.
 */
function PresenceSlotImage({ value, small }: { value: string; small?: boolean }) {
  if (/^https?:\/\//i.test(value)) {
    return <img src={value} alt="" className="w-full h-full object-cover" />;
  }
  return (
    <div className={`w-full h-full grid place-items-center bg-surface-700 text-surface-300 font-mono text-center px-0.5 ${small ? 'text-[6px]' : 'text-[8px]'}`}>
      {small ? value.slice(0, 4) : value}
    </div>
  );
}

/**
 * Renders the presence the way Discord will, using the live world/avatar so
 * changes can be judged without alt-tabbing to Discord.
 */
function DiscordPresencePreview({ cfg }: { cfg: DiscordConfig }) {
  const user = useAuthStore(s => s.user);
  const current = useInstanceHistoryStore(s => s.currentInstance);

  const instanceType = (current?.instanceType ?? 'public').toLowerCase();
  const isPublic = instanceType === 'public';
  const hideWorld = cfg.privacyHideWorld && !isPublic;
  const worldName = !current ? '' : hideWorld ? 'a private world' : (current.worldName || 'a world');

  const switched =
    cfg.switchWhen === 'private' ? instanceType === 'private' || instanceType === 'invite'
    : cfg.switchWhen === 'not-public' ? !isPublic
    : cfg.switchWhen === 'group' ? instanceType === 'group'
    : false;
  const layout = switched ? cfg.altLayout : cfg.layout;

  // Mirrors the resolution in useDiscordRPC, including the group-name swap.
  const groupLabel = !hideWorld && cfg.showGroupName && (current as any)?.groupName
    ? String((current as any).groupName)
    : '';
  const vars: Record<string, string> = {
    name: user?.displayName ?? 'VRChat',
    world: worldName,
    avatar: '',
    status: user?.statusDescription || user?.status || '',
    instance: groupLabel
      ? ` · ${groupLabel}`
      : current && !hideWorld && !isPublic ? ` · ${instanceType}` : '',
    players: '',
    group: groupLabel,
  };
  const fill = (t: string) => t.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '').replace(/\s{2,}/g, ' ').trim();

  // Mirrors the hook: an asset key set here replaces the VRChat picture.
  const avatarImg = cfg.avatarImageKey.trim()
    || user?.profilePicOverride || user?.currentAvatarThumbnailImageUrl || user?.userIcon || '';
  const worldImg = cfg.worldImageKey.trim() || current?.worldImage || '';
  const bigVal = layout === 'avatar-world' || layout === 'avatar-only' ? avatarImg
    : layout === 'none' ? '' : worldImg;
  const smallVal = layout === 'world-avatar' ? avatarImg : layout === 'avatar-world' ? worldImg : '';
  const fallbackKey = cfg.fallbackImageKey.trim();
  const usingFallback = layout !== 'none' && !bigVal && !!fallbackKey;

  const buttons: string[] = [];
  if (cfg.showWorldButton && current?.worldId && !hideWorld) buttons.push('View World');
  if (cfg.showProfileButton && user?.id) buttons.push('VRChat Profile');

  return (
    <div className="rounded-lg border border-surface-700 bg-surface-900/60 p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-surface-500 mb-2">Preview</p>
      <div className="flex gap-3">
        {layout !== 'none' && (
          <div className="relative flex-shrink-0">
            <div className="w-16 h-16 rounded-lg bg-surface-800 overflow-hidden">
              {bigVal
                ? <PresenceSlotImage value={bigVal} />
                : usingFallback
                  ? <div className="w-full h-full grid place-items-center text-[8px] text-surface-400 text-center px-1 font-mono">{fallbackKey}</div>
                  : <div className="w-full h-full grid place-items-center text-[9px] text-surface-600">no image</div>}
            </div>
            {smallVal && bigVal && (
              <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full overflow-hidden border-2 border-surface-900 bg-surface-800">
                <PresenceSlotImage value={smallVal} small />
              </div>
            )}
          </div>
        )}
        <div className="min-w-0 flex-1 text-xs">
          <div className="font-semibold truncate">{fill(cfg.detailsTemplate) || '—'}</div>
          <div className="text-surface-400 truncate">
            {current ? (fill(cfg.stateTemplate) || '—') : (vars.status || 'Not in a world')}
          </div>
          {cfg.showElapsed && <div className="text-surface-500">00:12 elapsed</div>}
          {buttons.length > 0 && (
            <div className="flex gap-1.5 mt-1.5">
              {buttons.map(b => (
                <span key={b} className="text-[10px] px-2 py-0.5 rounded bg-surface-700 text-surface-300">{b}</span>
              ))}
            </div>
          )}
        </div>
      </div>
      {!current && (
        <p className="text-[10px] text-surface-600 mt-2">
          You're not in a world right now, so the world half falls back to your avatar.
        </p>
      )}
    </div>
  );
}

function DiscordDiagnostics() {
  const user = useAuthStore(s => s.user);
  const current = useInstanceHistoryStore(s => s.currentInstance);
  const [tick, setTick] = useState(0);
  const [rpc, setRpc] = useState<{
    connected: boolean; lastError: string | null;
    lastPushAt: number | null; lastPushOk: boolean; imagesDropped: boolean;
    imageIssues?: string[];
    probes?: Array<{ url: string; ok: boolean; status: number; reason?: string }>;
  } | null>(null);
  const requestPush = useDiscordRpcStore(s => s.requestPush);

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 3000);
    return () => clearInterval(id);
  }, []);

  // Connection state plus the outcome of the last push — between them these
  // answer every "why isn't it showing" case without reading the console.
  useEffect(() => {
    let cancelled = false;
    window.electronAPI?.discordStatus?.()
      .then(v => { if (!cancelled) setRpc(v); })
      .catch(() => { if (!cancelled) setRpc(null); });
    return () => { cancelled = true; };
  }, [tick]);

  const rpcConnected = rpc?.connected ?? null;

  const location = user?.location ?? '—';
  const worldId = (user as any)?.worldId ?? '—';
  const instanceId = (user as any)?.instanceId ?? '—';
  const avatarUrl = user?.profilePicOverride || user?.currentAvatarThumbnailImageUrl || user?.userIcon || '';
  const worldImg  = current?.worldImage ?? '';

  return (
    <div className="rounded-lg border border-surface-700 bg-surface-900/60 p-3 space-y-2 text-xs">
      <p className="text-surface-300 font-semibold">Live status</p>
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-surface-400">
        <span className="text-surface-500">Discord link</span>
        <span className={rpcConnected ? 'text-green-400' : rpcConnected === null ? 'text-surface-500' : 'text-amber-400'}>
          {rpcConnected === null
            ? 'checking…'
            : rpcConnected
              ? 'connected to your Discord client'
              : 'not connected — is the Discord desktop app running?'}
        </span>
        <span className="text-surface-500">Last push</span>
        <span className={rpc?.lastPushAt ? (rpc.lastPushOk ? 'text-green-400' : 'text-amber-400') : 'text-amber-400'}>
          {rpc?.lastPushAt
            ? `${rpc.lastPushOk ? 'accepted' : 'rejected'} at ${new Date(rpc.lastPushAt).toLocaleTimeString()}`
            : 'never — no activity has been sent yet'}
        </span>
        {rpc?.imagesDropped && (
          <>
            <span className="text-surface-500">Images</span>
            <span className="text-amber-400">
              Discord refused the image URLs, so presence is running text-only
            </span>
          </>
        )}
        {/* The "?" box case: we could load the picture, Discord's proxy can't. */}
        {!!rpc?.imageIssues?.length && (
          <>
            <span className="text-surface-500">Image check</span>
            <span className="text-amber-400 break-words">
              {rpc.imageIssues.map(i => <span key={i} className="block">{i}</span>)}
              <span className="block text-surface-500 mt-1">
                Set an asset key below and Discord will show that instead of a placeholder.
              </span>
            </span>
          </>
        )}
        {!rpc?.imageIssues?.length && rpc?.probes?.some(pr => pr.ok) && (
          <>
            <span className="text-surface-500">Image check</span>
            <span className="text-green-400">
              Presence images load without a VRChat login — Discord can fetch them
            </span>
          </>
        )}
        {rpc?.lastError && (
          <>
            <span className="text-surface-500">Last error</span>
            <span className="text-amber-400 break-words">{rpc.lastError}</span>
          </>
        )}
        <span className="text-surface-500">user.location</span>
        <span className="font-mono text-surface-200 break-all">{location || '—'}</span>
        <span className="text-surface-500">user.worldId</span>
        <span className="font-mono text-surface-200 break-all">{worldId || '—'}</span>
        <span className="text-surface-500">user.instanceId</span>
        <span className="font-mono text-surface-200 break-all">{instanceId || '—'}</span>
        <span className="text-surface-500">World tracked</span>
        <span className={current ? 'text-green-400' : 'text-surface-500'}>
          {current ? `${current.worldName || current.worldId} (${current.instanceType})` : 'none'}
        </span>
        <span className="text-surface-500">World image</span>
        <span className="font-mono break-all">{worldImg ? `${worldImg.slice(0, 60)}…` : '—'}</span>
        <span className="text-surface-500">Avatar image</span>
        <span className="font-mono break-all">{avatarUrl ? `${avatarUrl.slice(0, 60)}…` : '—'}</span>
      </div>
      {!current && location && location !== '—' && !location.startsWith('wrld_') && (
        <p className="text-amber-400 text-xs mt-1">
          ⚠ location is <code className="bg-surface-800 px-1 rounded">{location}</code> — not a world instance. Join a world for tracking to begin.
        </p>
      )}
      <div className="flex items-center gap-2 pt-1">
        <button onClick={() => { requestPush(); setTick(t => t + 1); }} className="btn-secondary text-xs">
          Push presence now
        </button>
        <span className="text-surface-600 text-[11px]">
          Forces an update — check your Discord profile straight after.
        </span>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { settings, updateGeneral, updateNotifications, updatePolling, updateDisplay, updatePrivacy, updatePerformance, updateProfile, resetSettings } = useSettingsStore();
  const { user } = useAuthStore();
  const { onlineFriends, offlineFriends } = useFriendStore();
  const {
    theme, setMode, setAccentColor, setCustomCSS, setFontSize,
    setSidebarWidth, setBorderRadius, setBorderStyle, setAnimationSpeed, setGlassEffect,
    setPremiumTheme, setVisualizer, setLiveliness, resetTheme,
  } = useThemeStore();
  const { accounts, removeAccount } = useMultiAccountStore();
  const openAsteroidsGame = useAsteroidsGameStore(s => s.open);
  const [active, setActive] = useState<SettingsSection>('account');
  const [settingsQuery, setSettingsQuery] = useState('');
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [vrcdbProvider, setVrcdbProviderState] = useState<ProviderId>(getProviderId());
  const [lang, setLang] = useState(getLanguage());
  const [autoLaunch, setAutoLaunch] = useState(false);
  const [nicknameInput, setNicknameInput] = useState(settings.profile.nickname);
  const [resetConfirm, setResetConfirm] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  const [discordCfg, setDiscordCfg] = useState<DiscordConfig>(() => readDiscordConfig());

  const patchDiscord = (patch: Partial<DiscordConfig>) => {
    const next = { ...discordCfg, ...patch };
    setDiscordCfg(next);
    localStorage.setItem('vrcstudio_discord', JSON.stringify(next));
    // Presence only changes when an activity is pushed — ask for one rather
    // than waiting for the config poll to notice.
    useDiscordRpcStore.getState().requestPush();
    if (next.enabled && next.clientId && window.electronAPI) {
      window.electronAPI.discordInit(next.clientId);
    } else if (!next.enabled && window.electronAPI) {
      window.electronAPI.discordDisconnect();
    }
  };



  useEffect(() => { window.electronAPI?.getAutoLaunch().then(v => setAutoLaunch(v)); }, []);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const result = importData(text);
    setImportStatus(result.message);
    setTimeout(() => setImportStatus(null), 5000);
    e.target.value = '';
  };

  const handleExportData = () => downloadExport(exportAllData());
  const handleExportFriends = () => {
    const all = [...onlineFriends, ...offlineFriends];
    const csv = exportFriendsList(all.map(f => ({ id: f.id, displayName: f.displayName, status: f.status })));
    downloadCSV(csv, `vrcstudio-friends-${new Date().toISOString().slice(0, 10)}.csv`);
  };
  const handleLangChange = (code: string) => { setLanguage(code); setLang(code); window.location.reload(); };
  const handleAutoLaunch = (v: boolean) => { setAutoLaunch(v); window.electronAPI?.setAutoLaunch(v); updateGeneral({ launchOnStartup: v }); };

  const q = settingsQuery.trim().toLowerCase();
  const visibleSections = q
    ? sections.filter(s =>
        s.label.toLowerCase().includes(q) ||
        s.group.toLowerCase().includes(q) ||
        (s.keywords ?? '').toLowerCase().includes(q)
      )
    : sections;

  const groups = visibleSections.reduce<Record<string, typeof sections>>((acc, s) => {
    const g = s.group ?? 'Other';
    (acc[g] = acc[g] || []).push(s);
    return acc;
  }, {});

  return (
    <div className="max-w-5xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-surface-100">Settings</h1>
        <p className="text-sm text-surface-500 mt-0.5">Configure your VRC Studio experience</p>
      </div>

      <div className="flex gap-6">
        <nav className="w-52 flex-shrink-0">
          <div className="relative mb-2">
            <input
              value={settingsQuery}
              onChange={e => setSettingsQuery(e.target.value)}
              placeholder="Search settings..."
              className="w-full bg-surface-800 text-sm pl-3 pr-7 py-1.5 rounded-lg border border-surface-700/40 focus:outline-none focus:border-accent-500/50 placeholder-surface-600"
            />
            {settingsQuery && (
              <button
                onClick={() => setSettingsQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-200"
                title="Clear"
              >
                <X size={13} />
              </button>
            )}
          </div>
          <div className="glass-panel-solid p-2 space-y-3">
            {Object.keys(groups).length === 0 && (
              <div className="px-3 py-2 text-xs text-surface-500">No settings match "{settingsQuery}"</div>
            )}
            {Object.entries(groups).map(([groupName, items]) => (
              <div key={groupName}>
                <div className="px-3 py-1 text-xs font-semibold uppercase tracking-wider text-surface-600">{groupName}</div>
                <div className="space-y-0.5">
                  {items.map(({ key, label, icon: Icon }) => (
                    <button key={key} onClick={() => setActive(key)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                        active === key ? 'bg-accent-600/15 text-accent-400' : 'text-surface-400 hover:text-surface-200 hover:bg-surface-800/60'
                      }`}
                    >
                      <Icon size={14} />{label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3">
            <button onClick={() => setResetConfirm(true)}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
            >
              <RotateCcw size={14} /> Reset All Settings
            </button>
          </div>
          {resetConfirm && (
            <div className="mt-2 glass-panel p-3 space-y-2">
              <p className="text-xs text-surface-400">Reset all settings to defaults?</p>
              <div className="flex gap-2">
                <button onClick={() => { resetSettings(); setResetConfirm(false); }} className="btn-danger text-xs flex-1">Reset</button>
                <button onClick={() => setResetConfirm(false)} className="btn-secondary text-xs flex-1">Cancel</button>
              </div>
            </div>
          )}
        </nav>

        <div className="flex-1 min-w-0 space-y-4">

          {active === 'profile' && (
            <>
              <Section title="Your Identity" icon={Smile}>
                <p className="text-xs text-surface-500">Set a preferred name that VRC Studio uses to greet you. Leave blank to use your VRChat display name.</p>
                <div className="space-y-1">
                  <label className="block text-sm font-medium">Preferred Name</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input type="text" value={nicknameInput} onChange={e => setNicknameInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') updateProfile({ nickname: nicknameInput.trim() }); if (e.key === 'Escape') setNicknameInput(settings.profile.nickname); }}
                        placeholder={user?.displayName || 'Your VRChat name'} maxLength={40} className="input-field w-full pr-8"
                      />
                      {nicknameInput && (
                        <button onClick={() => { setNicknameInput(''); updateProfile({ nickname: '' }); }}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300 transition-colors" title="Clear name"
                        ><X size={14} /></button>
                      )}
                    </div>
                    <button onClick={() => updateProfile({ nickname: nicknameInput.trim() })} disabled={nicknameInput.trim() === settings.profile.nickname} className="btn-primary text-sm disabled:opacity-40">Save</button>
                  </div>
                  <p className="text-xs text-surface-600">{nicknameInput.trim() ? `You'll be greeted as "${nicknameInput.trim()}"` : `You'll be greeted as "${user?.displayName || 'Traveler'}"`}</p>
                </div>
              </Section>
              <Section title="Dashboard Greeting" icon={Smile}>
                <Toggle label="Show Greeting" description="Display a personalized greeting with live info on the Dashboard" checked={settings.profile.greetingEnabled} onChange={v => updateProfile({ greetingEnabled: v })} />
                {settings.profile.greetingEnabled && (
                  <Toggle label="Show Local Weather" description="Fetch and display your current weather in the greeting — requires location permission" checked={settings.profile.showWeather} onChange={v => updateProfile({ showWeather: v })} />
                )}
                {settings.profile.greetingEnabled && (
                  <div className="glass-panel p-3 mt-1">
                    <div className="text-xs text-surface-500 mb-2 font-medium uppercase tracking-wide">Preview</div>
                    <div className="text-sm font-semibold text-surface-200">
                      {(() => {
                        const h = new Date().getHours();
                        let g = 'Good night';
                        if (h >= 5 && h < 12) g = 'Good morning';
                        else if (h >= 12 && h < 17) g = 'Good afternoon';
                        else if (h >= 17 && h < 21) g = 'Good evening';
                        const name = nicknameInput.trim() || user?.displayName || 'Traveler';
                        return <>{g}, <span className="text-gradient">{name}</span></>;
                      })()}
                    </div>
                    <p className="text-xs text-surface-500 mt-1">The greeting rotates through: current time, friends online, join-me invites{settings.profile.showWeather ? ', and weather' : ''}.</p>
                  </div>
                )}
              </Section>
            </>
          )}

          {active === 'account' && (
            <Section title="Account" icon={UserCircle}>
              <InfoRow label="Display Name" value={user?.displayName || '—'} />
              <InfoRow label="User ID" value={user?.id || '—'} mono />
              <InfoRow label="Email Verified" value={user?.emailVerified ? 'Yes' : 'No'} />
              <InfoRow label="2FA Enabled" value={user?.twoFactorAuthEnabled ? 'Yes' : 'No'} />
              <InfoRow label="Friends" value={`${onlineFriends.length} online / ${onlineFriends.length + offlineFriends.length} total`} />
              <InfoRow label="Join Date" value={user?.date_joined ? new Date(user.date_joined).toLocaleDateString() : '—'} />
              <InfoRow label="Last Platform" value={user?.last_platform || '—'} />
            </Section>
          )}

          {active === 'accounts' && (
            <Section title="Multi-Account" icon={Shield}>
              <p className="text-xs text-surface-500 mb-3">Saved accounts allow quick profile switching. Credentials are stored locally only and never sent to any server.</p>
              <div className="space-y-2">
                {accounts.map(acct => (
                  <div key={acct.id} className="glass-panel p-3 flex items-center gap-3">
                    {acct.avatarUrl && <img src={acct.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover" />}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{acct.displayName || acct.label || acct.username}</div>
                      <div className="text-xs text-surface-500">{acct.username}</div>
                    </div>
                    <button onClick={() => removeAccount(acct.id)} className="btn-ghost text-red-400 hover:text-red-300 p-1"><Trash2 size={14} /></button>
                  </div>
                ))}
                {accounts.length === 0 && <p className="text-sm text-surface-500">No saved accounts. Log in to automatically save your session.</p>}
              </div>
            </Section>
          )}

          {active === 'privacy' && (
            <Section title="Privacy" icon={Lock}>
              <p className="text-xs text-surface-500 mb-1">Control what information VRC Studio reads and displays locally. These settings do not change your VRChat account privacy — configure that in-game.</p>
              <Toggle label="Show Online Status" description="Display your online/offline status in the dashboard" checked={settings.privacy.showOnlineStatus} onChange={v => updatePrivacy({ showOnlineStatus: v })} />
              <Toggle label="Show Current World" description="Display the world you are currently in" checked={settings.privacy.showCurrentWorld} onChange={v => updatePrivacy({ showCurrentWorld: v })} />
              <Toggle label="Show Last Seen" description="Display when friends were last active" checked={settings.privacy.showLastSeen} onChange={v => updatePrivacy({ showLastSeen: v })} />
              <Toggle label="Allow Friend Requests" description="Show incoming friend request notifications" checked={settings.privacy.allowFriendRequests} onChange={v => updatePrivacy({ allowFriendRequests: v })} />
            </Section>
          )}

          {active === 'notifications' && (
            <>
              <Section title="Event Notifications" icon={Bell}>
                <Toggle label="Friend Comes Online" description="Notify when a friend's status becomes online" checked={settings.notifications.friendOnline} onChange={v => updateNotifications({ friendOnline: v })} />
                <Toggle label="Friend Goes Offline" description="Notify when a friend disconnects" checked={settings.notifications.friendOffline} onChange={v => updateNotifications({ friendOffline: v })} />
                <Toggle label="Friend Location Change" description="Notify when a friend joins a new world" checked={settings.notifications.friendLocation} onChange={v => updateNotifications({ friendLocation: v })} />
                <Toggle label="Friend Status Change" description="Notify when a friend updates their status message" checked={settings.notifications.friendStatus} onChange={v => updateNotifications({ friendStatus: v })} />
                <Toggle label="Invites & Requests" description="Notify on incoming invites and friend requests" checked={settings.notifications.invites} onChange={v => updateNotifications({ invites: v })} />
                <Toggle label="Group Activity Updates" description="Bundle rapid status changes into a single notification" checked={settings.notifications.groupUpdates} onChange={v => updateNotifications({ groupUpdates: v })} />
              </Section>
              <Section title="Delivery" icon={Volume2}>
                <Toggle label="Sound" description="Play a sound with each notification" checked={settings.notifications.sound} onChange={v => updateNotifications({ sound: v })} />
                <Toggle label="Desktop Notifications" description="Show OS-level pop-up notifications" checked={settings.notifications.desktopNotifications} onChange={v => updateNotifications({ desktopNotifications: v })} />
                <SliderRow label="Notification Duration" value={settings.notifications.notificationDuration} min={2} max={15} step={1} unit="s" onChange={v => updateNotifications({ notificationDuration: v })} />
              </Section>
              <Section title="Do Not Disturb" icon={Moon}>
                <Toggle label="Enable Do Not Disturb" description="Silence all notifications during the set hours" checked={settings.notifications.dndEnabled} onChange={v => updateNotifications({ dndEnabled: v })} />
                {settings.notifications.dndEnabled && (
                  <div className="grid grid-cols-2 gap-4 mt-1">
                    <div><label className="block text-xs text-surface-500 mb-1">Start time</label><input type="time" value={settings.notifications.dndStart} onChange={e => updateNotifications({ dndStart: e.target.value })} className="input-field text-sm w-full" /></div>
                    <div><label className="block text-xs text-surface-500 mb-1">End time</label><input type="time" value={settings.notifications.dndEnd} onChange={e => updateNotifications({ dndEnd: e.target.value })} className="input-field text-sm w-full" /></div>
                  </div>
                )}
              </Section>
            </>
          )}

          {active === 'polling' && (
            <Section title="Update Intervals" icon={Clock}>
              <p className="text-xs text-surface-500 mb-4">VRC Studio uses a real-time WebSocket connection plus periodic polling. Lower intervals give fresher data at the cost of more API calls.</p>
              <SliderRow label="Friends Refresh" value={settings.polling.friendsInterval} min={10} max={120} step={5} unit="s" onChange={v => updatePolling({ friendsInterval: v })} />
              <SliderRow label="World Browser Refresh" value={settings.polling.worldInterval} min={30} max={300} step={10} unit="s" onChange={v => updatePolling({ worldInterval: v })} />
              <SliderRow label="Notifications Refresh" value={settings.polling.notificationsInterval} min={10} max={120} step={5} unit="s" onChange={v => updatePolling({ notificationsInterval: v })} />
              <SliderRow label="Activity Feed Refresh" value={settings.polling.feedInterval} min={10} max={120} step={5} unit="s" onChange={v => updatePolling({ feedInterval: v })} />
            </Section>
          )}

          {active === 'display' && (
            <>
              <Section title="Layout" icon={Monitor}>
                <Toggle label="Compact Mode" description="Denser layout showing more items per screen" checked={settings.display.compactMode} onChange={v => updateDisplay({ compactMode: v })} />
                <Toggle label="Show Offline Friends" description="Include offline friends in the friends list" checked={settings.display.showOfflineFriends} onChange={v => updateDisplay({ showOfflineFriends: v })} />
                <Toggle label="Group Friends by Status" description="Separate friends into Online / Away / Offline sections" checked={settings.display.groupByStatus} onChange={v => updateDisplay({ groupByStatus: v })} />
                <Toggle label="Show Avatar in List" description="Display friend avatars next to their names" checked={settings.display.showAvatarInList} onChange={v => updateDisplay({ showAvatarInList: v })} />
                <Toggle label="Show Bio Preview" description="Show a short bio excerpt in the friends list" checked={settings.display.showBioPreview} onChange={v => updateDisplay({ showBioPreview: v })} />
                <Toggle label="Show Trust Rank Badges" description="Display VRChat trust level badges on friend cards" checked={settings.display.showTrustBadges} onChange={v => updateDisplay({ showTrustBadges: v })} />
              </Section>
              <Section title="Sorting & Format" icon={ArrowUpDown}>
                <div>
                  <label className="block text-sm font-medium mb-1">Friends Sort Order</label>
                  <select value={settings.display.friendsSortBy} onChange={e => updateDisplay({ friendsSortBy: e.target.value as 'name' | 'status' | 'trust' })} className="input-field w-auto">
                    <option value="status">By Status</option>
                    <option value="name">By Name (A–Z)</option>
                    <option value="trust">By Trust Rank</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Time Format</label>
                  <select value={settings.display.timeFormat} onChange={e => updateDisplay({ timeFormat: e.target.value as '12h' | '24h' })} className="input-field w-auto">
                    <option value="24h">24-hour (14:30)</option>
                    <option value="12h">12-hour (2:30 PM)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Language</label>
                  <select value={lang} onChange={e => handleLangChange(e.target.value)} className="input-field w-auto">
                    {getAvailableLanguages().map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
                  </select>
                  <p className="text-xs text-surface-500 mt-1">Changing language reloads the app.</p>
                </div>
              </Section>
            </>
          )}

          {active === 'appearance' && (
            <>
              <Section title="Theme" icon={Palette}>
                <div>
                  <label className="block text-sm font-medium mb-2">Color Mode</label>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {([{ key: 'dark', label: 'Dark', icon: Moon }, { key: 'midnight', label: 'Midnight', icon: Moon }, { key: 'oled', label: 'OLED', icon: Moon }, { key: 'light', label: 'Light', icon: Sun }] as const).map(({ key, label, icon: ModeIcon }) => (
                      <button key={key} onClick={() => setMode(key)} className={`py-2 rounded-lg text-sm font-medium border transition-colors flex items-center justify-center gap-1.5 ${theme.mode === key ? 'border-accent-500 bg-accent-500/15 text-accent-400' : 'border-surface-700 bg-surface-800 text-surface-400 hover:border-surface-600'}`}>
                        <ModeIcon size={13} /> {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Accent Color</label>
                  <div className="flex gap-3 flex-wrap">
                    {([{ key: 'blue', bg: 'bg-blue-500', label: 'Blue' }, { key: 'purple', bg: 'bg-purple-500', label: 'Purple' }, { key: 'green', bg: 'bg-green-500', label: 'Green' }, { key: 'rose', bg: 'bg-rose-500', label: 'Rose' }, { key: 'amber', bg: 'bg-amber-500', label: 'Amber' }, { key: 'cyan', bg: 'bg-cyan-500', label: 'Cyan' }] as const).map(({ key, bg, label }) => (
                      <button key={key} onClick={() => setAccentColor(key)} title={label} className={`w-8 h-8 rounded-full ${bg} transition-transform hover:scale-110 ${theme.accentColor === key ? 'ring-2 ring-white ring-offset-2 ring-offset-surface-900' : ''}`} />
                    ))}
                  </div>
                </div>
              </Section>

              <Section title="Typography & Layout" icon={Monitor}>
                <div><label className="block text-sm font-medium mb-2">Font Size</label><OptionRow options={['small', 'medium', 'large']} value={theme.fontSize} onChange={v => setFontSize(v as 'small' | 'medium' | 'large')} /></div>
                <div><label className="block text-sm font-medium mb-2">Sidebar Width</label><OptionRow options={['compact', 'normal', 'wide']} value={theme.sidebarWidth} onChange={v => setSidebarWidth(v as 'compact' | 'normal' | 'wide')} /></div>
                <div><label className="block text-sm font-medium mb-2">Border Radius</label><OptionRow options={['sharp', 'rounded', 'pill']} value={theme.borderRadius} onChange={v => setBorderRadius(v as 'sharp' | 'rounded' | 'pill')} /></div>
              </Section>

              <Section title="Effects & Animation" icon={Zap}>
                <div><label className="block text-sm font-medium mb-2">Glass Effect</label><OptionRow options={['none', 'light', 'medium']} value={theme.glassEffect} onChange={v => setGlassEffect(v as 'none' | 'light' | 'medium')} /></div>
                <div><label className="block text-sm font-medium mb-2">Animation Speed</label><OptionRow options={['none', 'subtle', 'normal']} value={theme.animationSpeed} onChange={v => setAnimationSpeed(v as 'none' | 'subtle' | 'normal')} /></div>
              </Section>

              <Section title="Border Style" icon={Palette}>
                <p className="text-xs text-surface-500 mb-2">Borders for panels, cards, buttons, and inputs. Each option is GPU-friendly — animation runs on a single root-level CSS variable.</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {([
                    { key: 'default',     label: 'Default',     preview: 'border-2 border-surface-600',
                      blurb: 'Standard subtle borders' },
                    { key: 'rainbow',     label: 'Rainbow',     preview: 'border-2 border-transparent bg-[conic-gradient(from_0deg,_#f0f,_#0ff,_#ff0,_#f00,_#f0f)] [background-clip:border-box]',
                      blurb: 'Smooth hue cycle (8s)' },
                    { key: 'neon',        label: 'Neon',        preview: 'border-2 border-accent-400 shadow-[0_0_10px_rgb(var(--accent-500)/0.7)]',
                      blurb: 'Static vivid accent + glow' },
                    { key: 'pulse',       label: 'Pulse',       preview: 'border-2 border-accent-500/70 shadow-[0_0_0_3px_rgb(var(--accent-500)/0.25)]',
                      blurb: 'Opacity throb, no shadow' },
                    { key: 'holographic', label: 'Holographic', preview: 'border-2 [border-image:linear-gradient(135deg,#f0a,#0df,#fe0,#f40,#f0a)_1]',
                      blurb: 'Rotating gradient stripe' },
                    { key: 'flame',       label: 'Flame',       preview: 'border-2 border-orange-500 shadow-[0_0_12px_rgb(239,68,68,0.55)] bg-gradient-to-br from-orange-500/15 to-red-600/15',
                      blurb: 'Amber/red hue wobble' },
                    { key: 'shimmer',     label: 'Shimmer',     preview: 'border-2 [border-image:linear-gradient(90deg,rgb(var(--surface-700)/0.6),rgb(var(--accent-300)),rgb(var(--accent-50)),rgb(var(--accent-300)),rgb(var(--surface-700)/0.6))_1]',
                      blurb: 'Traveling light sheen' },
                    { key: 'cyber',       label: 'Cyber',       preview: 'border-2 border-fuchsia-400 shadow-[0_0_14px_rgb(34,211,238,0.45)]',
                      blurb: 'Stepped 8-color cycle' },
                  ] as const).map(({ key, label, preview, blurb }) => (
                    <button
                      key={key}
                      onClick={() => setBorderStyle(key)}
                      className={`p-2 rounded-lg border transition-all text-left ${theme.borderStyle === key ? 'border-accent-500 bg-accent-500/10' : 'border-surface-700 hover:border-surface-600'}`}
                    >
                      <div className={`w-full h-12 rounded ${preview}`} />
                      <div className="text-xs font-medium mt-1.5">{label}</div>
                      <div className="text-[10px] text-surface-500 leading-tight mt-0.5">{blurb}</div>
                    </button>
                  ))}
                </div>
              </Section>

              <Section title="Liveliness" icon={Zap}>
                <p className="text-xs text-surface-500 mb-2">Optional effects that make the shell feel less static. All toggleable, all cheap — pick what you like.</p>
                <div className="space-y-2">
                  <LivelinessToggle
                    enabled={theme.liveliness.hoverLift}
                    onToggle={v => setLiveliness({ hoverLift: v })}
                    label="Hover lift"
                    description="Cards and panels rise 2px when hovered"
                  />
                  <LivelinessToggle
                    enabled={theme.liveliness.statusPulse}
                    onToggle={v => setLiveliness({ statusPulse: v })}
                    label="Status dot pulse"
                    description="Online indicators gently breathe"
                  />
                  <LivelinessToggle
                    enabled={theme.liveliness.particles}
                    onToggle={v => setLiveliness({ particles: v })}
                    label="Floating particles"
                    description="Slow-drifting accent-colored dots behind the UI"
                  />
                  <LivelinessToggle
                    enabled={theme.liveliness.cursorGlow}
                    onToggle={v => setLiveliness({ cursorGlow: v })}
                    label="Cursor glow"
                    description="A soft halo follows your pointer"
                  />
                  <LivelinessToggle
                    enabled={theme.liveliness.ambientHaze}
                    onToggle={v => setLiveliness({ ambientHaze: v })}
                    label="Ambient haze"
                    description="Subtle accent-color gradient drifts behind everything"
                  />
                </div>
              </Section>

              <Section title="Premium Themes" icon={Palette}>
                <p className="text-xs text-surface-500 mb-2">Animated background overlays — sit behind everything, no impact on text legibility.</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {([
                    { key: 'none',         label: 'Off',          preview: 'bg-surface-800' },
                    { key: 'iridescent',   label: 'Iridescent',   preview: 'bg-gradient-to-br from-pink-500 via-purple-500 to-cyan-500' },
                    { key: 'holographic',  label: 'Holographic',  preview: 'bg-[conic-gradient(from_0deg,_#f0f,_#0ff,_#ff0,_#f0f)]' },
                    { key: 'aurora',       label: 'Aurora',       preview: 'bg-gradient-to-br from-emerald-500 via-blue-500 to-purple-500' },
                    { key: 'cosmic',       label: 'Cosmic',       preview: 'bg-gradient-to-br from-indigo-900 via-purple-900 to-black' },
                    { key: 'synthwave',    label: 'Synthwave',    preview: 'bg-gradient-to-b from-[#2a0845] via-[#ff2d96] to-[#12002e] relative overflow-hidden' },
                    { key: 'asteroids',    label: 'Asteroids',    preview: 'bg-gradient-to-br from-[#050812] via-[#0d1836] to-[#050812] border border-accent-800/40' },
                    { key: 'koi',          label: 'Koi Pond',     preview: 'bg-gradient-to-br from-[#05202a] via-[#0b3a44] to-[#04161d] relative overflow-hidden' },
                    { key: 'hacker',       label: 'Hacker',       preview: 'bg-black border border-green-500/60 shadow-[inset_0_0_12px_rgba(0,255,100,0.3)] text-green-400 font-mono text-[8px] flex items-center justify-center' },
                    // Only while VR mode is on. Every other theme animates, and
                    // VR mode cuts animation — this one is built to work standing
                    // still, so it's the one that belongs there.
                    ...(theme.vrMode
                      ? [{ key: 'guardian' as const, label: 'Guardian', preview: 'bg-[#05090e] relative overflow-hidden border border-cyan-300/30' }]
                      : []),
                  ] as const).map(({ key, label, preview }) => (
                    <button key={key} onClick={() => setPremiumTheme(key)} className={`p-2 rounded-lg border transition-all ${theme.premiumTheme === key ? 'border-accent-500 bg-accent-500/10' : 'border-surface-700 hover:border-surface-600'}`}>
                      <div className={`w-full h-12 rounded mb-1.5 ${preview}`}>
                        {key === 'guardian' && (
                          <>
                            <span
                              className="absolute inset-0"
                              style={{
                                backgroundImage:
                                  'repeating-linear-gradient(0deg, rgba(64,224,232,.55) 0 1px, transparent 1px 9px),' +
                                  'repeating-linear-gradient(90deg, rgba(64,224,232,.55) 0 1px, transparent 1px 9px)',
                                maskImage: 'radial-gradient(ellipse 70% 65% at 50% 50%, transparent 30%, #000 100%)',
                                WebkitMaskImage: 'radial-gradient(ellipse 70% 65% at 50% 50%, transparent 30%, #000 100%)',
                              }}
                            />
                            <span className="absolute inset-0 shadow-[inset_0_0_14px_rgba(64,224,232,.35)]" />
                          </>
                        )}
                        {key === 'hacker' && (
                          <span className="text-green-400 font-mono text-[9px] tracking-tight">{'>_ vrc.run()'}</span>
                        )}
                        {key === 'koi' && (
                          <>
                            <span className="absolute left-[22%] top-[38%] w-3.5 h-1.5 rounded-full bg-orange-300/90 -rotate-12" />
                            <span className="absolute left-[55%] top-[58%] w-4 h-1.5 rounded-full bg-white/80 rotate-6" />
                            <span className="absolute left-[62%] top-[26%] w-3 h-1.5 rounded-full bg-amber-200/70 rotate-12" />
                            <span className="absolute inset-0 rounded-[50%] border border-cyan-200/25 scale-50" />
                          </>
                        )}
                        {key === 'synthwave' && (
                          <>
                            <span className="absolute left-1/2 top-1.5 -translate-x-1/2 w-5 h-5 rounded-full bg-gradient-to-b from-amber-200 to-pink-500" />
                            <span
                              className="absolute inset-x-0 bottom-0 h-1/2 opacity-70"
                              style={{
                                backgroundImage:
                                  'repeating-linear-gradient(90deg, rgba(90,255,255,.7) 0 1px, transparent 1px 8px),' +
                                  'repeating-linear-gradient(0deg, rgba(255,60,200,.6) 0 1px, transparent 1px 6px)',
                              }}
                            />
                          </>
                        )}
                      </div>
                      <div className="text-xs font-medium">{label}</div>
                    </button>
                  ))}
                  {theme.premiumTheme === 'guardian' && theme.vrMode && (
                    <div className="col-span-2 sm:col-span-5 mt-1 text-xs text-surface-400 bg-surface-800/50 rounded-lg p-2.5">
                      The chaperone boundary, borrowed. It doesn't move — everything else here
                      animates, and drifting decoration pinned to your head is tiring in a way it
                      never is on a monitor. The mesh stays at the edges and the middle stays
                      clear, so nothing competes with what you're reading.
                    </div>
                  )}
                  {theme.premiumTheme === 'guardian' && !theme.vrMode && (
                    <div className="col-span-2 sm:col-span-5 mt-1 text-xs text-cyan-300/90 bg-cyan-500/10 border border-cyan-500/25 rounded-lg p-2.5">
                      Guardian is still selected, but it only exists in VR mode — that's why
                      nothing looks picked above. Turn VR mode on from the Dashboard and it comes back.
                    </div>
                  )}
                  {theme.premiumTheme === 'koi' && (
                    <div className="col-span-2 sm:col-span-5 mt-1 text-xs text-surface-400 bg-surface-800/50 rounded-lg p-2.5">
                      The koi react to you: they scatter from your cursor, your pointer leaves a
                      wake, and clicking anywhere drops food they'll race for. It never intercepts
                      your clicks — the UI keeps working normally.
                    </div>
                  )}
                  {theme.premiumTheme === 'asteroids' && (
                    <div className="col-span-2 sm:col-span-5 mt-1">
                      <button onClick={openAsteroidsGame} className="btn-primary text-sm flex items-center gap-2">
                        <Gamepad2 size={14} /> Take the Wheel
                      </button>
                    </div>
                  )}
                </div>
              </Section>

              <Section title="Audio Visualizer" icon={Volume2}>
                <p className="text-xs text-surface-500">
                  Animated background reacting to system audio. Captures audio when permitted; falls back to procedural animation otherwise.
                </p>
                <Toggle
                  label="Enable visualizer"
                  description="Renders an animated equaliser behind the app"
                  checked={theme.visualizer.enabled}
                  onChange={v => setVisualizer({ enabled: v })}
                />

                <div className={theme.visualizer.enabled ? '' : 'opacity-50 pointer-events-none'}>
                  <label className="block text-sm font-medium mb-2">Style</label>
                  <OptionRow
                    options={['bars', 'blocks', 'wave', 'radial', 'dots', 'aurora']}
                    labels={{ bars: 'Bars', blocks: 'Blocks', wave: 'Wave', radial: 'Radial', dots: 'Dots', aurora: 'Aurora' }}
                    value={theme.visualizer.style ?? 'bars'}
                    onChange={v => setVisualizer({ style: v as 'bars' | 'blocks' | 'wave' | 'radial' | 'dots' | 'aurora' })}
                  />
                  <label className="block text-sm font-medium mt-4 mb-2">Frequency Focus</label>
                  <OptionRow
                    options={['all', 'bass', 'mids', 'treble']}
                    value={theme.visualizer.focus}
                    onChange={v => setVisualizer({ focus: v as 'all' | 'bass' | 'mids' | 'treble' })}
                  />

                  <label className="block text-sm font-medium mt-4 mb-2">Bar Color</label>
                  <OptionRow options={['white', 'accent', 'rainbow']} value={theme.visualizer.color} onChange={v => setVisualizer({ color: v as 'white' | 'accent' | 'rainbow' })} />
                  <label className="block text-sm font-medium mt-4 mb-1">Bar Count: <span className="text-accent-400">{theme.visualizer.barCount}</span></label>
                  <input type="range" min={16} max={128} step={4} value={theme.visualizer.barCount} onChange={e => setVisualizer({ barCount: parseInt(e.target.value) })} className="w-full" />
                  <label className="block text-sm font-medium mt-3 mb-1">Sensitivity: <span className="text-accent-400">{theme.visualizer.sensitivity.toFixed(1)}×</span></label>
                  <input type="range" min={0.5} max={3} step={0.1} value={theme.visualizer.sensitivity} onChange={e => setVisualizer({ sensitivity: parseFloat(e.target.value) })} className="w-full" />
                  <label className="block text-sm font-medium mt-3 mb-1">Smoothing: <span className="text-accent-400">{(theme.visualizer.smoothing * 100).toFixed(0)}%</span></label>
                  <input type="range" min={0} max={0.95} step={0.05} value={theme.visualizer.smoothing} onChange={e => setVisualizer({ smoothing: parseFloat(e.target.value) })} className="w-full" />
                </div>
              </Section>

              <Section title="Custom CSS" icon={SettingsIcon}>
                <p className="text-xs text-surface-500">Advanced: inject CSS directly into the app. Changes apply instantly.</p>
                <textarea value={theme.customCSS} onChange={e => setCustomCSS(e.target.value)} placeholder="/* Custom CSS */" className="input-field font-mono text-xs h-32 resize-y" />
              </Section>
              <button onClick={resetTheme} className="btn-secondary text-sm w-fit">Reset to Default Theme</button>
            </>
          )}

          {active === 'discord' && (
            <Section title="Discord Rich Presence" icon={Zap}>
              {!window.electronAPI && (
                <div className="mb-4 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-xs text-amber-300">Not available in browser mode — requires the Electron desktop app.</div>
              )}
              <div className="mb-4 bg-surface-800/50 rounded-lg p-3 space-y-1.5 text-xs text-surface-400">
                <p className="text-surface-200 font-semibold text-xs">No bot needed</p>
                <p>
                  Rich Presence talks to the Discord app already running on this PC over a local
                  socket — the same way VRCX and games do it. There's no bot, no token, and nothing
                  to invite to a server. (The <span className="text-surface-300">Discord Bot</span> section
                  is a separate, optional feature for slash commands — it is not required for this.)
                </p>
                <p className="text-surface-200 font-semibold text-xs pt-1">One-time setup</p>
                <p>
                  Discord needs an <span className="text-surface-300">Application</span> to hang the
                  presence off — it supplies the name shown on your profile and nothing else. Creating
                  one takes about thirty seconds and it stays private to you:
                </p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Go to <span className="text-accent-400">discord.com/developers/applications</span> and click New Application</li>
                  <li>Name it whatever you want your profile to say (e.g. "VRChat")</li>
                  <li>Copy the <span className="font-semibold text-surface-200">Application ID</span> from General Information</li>
                  <li>Paste it below and click Apply — don't create a bot, don't generate a token</li>
                </ol>
                <p className="text-surface-500 mt-1">The world thumbnail is used automatically as your presence image — no assets to upload.</p>
              </div>
              <DiscordDiagnostics />
              <Toggle
                label="Enable Discord Rich Presence"
                description="Show your current VRChat world and playtime on Discord"
                checked={discordCfg.enabled}
                onChange={v => patchDiscord({ enabled: v })}
              />
              {discordCfg.enabled && (
                <>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium">Discord Application Client ID</label>
                    <p className="text-xs text-surface-500">Required — paste your Discord Application ID here.</p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={discordCfg.clientId}
                        onChange={e => setDiscordCfg({ ...discordCfg, clientId: e.target.value })}
                        placeholder="1234567890123456789"
                        className="input-field flex-1 font-mono text-sm"
                      />
                      <button onClick={() => patchDiscord({ clientId: discordCfg.clientId })} className="btn-primary text-sm">Apply</button>
                    </div>
                    {!discordCfg.clientId && <p className="text-xs text-amber-400">⚠ Enter a Client ID to activate rich presence.</p>}
                  </div>

                  <DiscordPresencePreview cfg={discordCfg} />

                  {/* ── Images ── */}
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Image layout</div>
                    <p className="text-xs text-surface-500">
                      Discord draws one large image with a small circular badge over its corner —
                      the layout itself is Discord's, so an app can't split the panel down the
                      middle. What you can choose is which picture goes in which slot.
                    </p>
                    <LayoutPicker
                      value={discordCfg.layout}
                      onChange={v => patchDiscord({ layout: v })}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="text-sm font-medium">Switch layout when…</div>
                    <div className="flex flex-wrap gap-1.5">
                      {([
                        { v: 'never', label: 'Never' },
                        { v: 'private', label: 'Instance is private' },
                        { v: 'not-public', label: 'Instance is not public' },
                        { v: 'group', label: 'Instance is a group' },
                      ] as Array<{ v: LayoutSwitch; label: string }>).map(o => (
                        <button
                          key={o.v}
                          onClick={() => patchDiscord({ switchWhen: o.v })}
                          className={`text-[11px] px-2.5 py-1 rounded-lg border transition-colors ${
                            discordCfg.switchWhen === o.v
                              ? 'border-accent-500 bg-accent-500/10 text-accent-300'
                              : 'border-surface-700 text-surface-400 hover:border-surface-600'
                          }`}
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                    {discordCfg.switchWhen !== 'never' && (
                      <div className="pl-3 border-l-2 border-surface-700 space-y-1.5">
                        <div className="text-xs text-surface-400">…use this layout instead:</div>
                        <LayoutPicker
                          value={discordCfg.altLayout}
                          onChange={v => patchDiscord({ altLayout: v })}
                        />
                      </div>
                    )}
                  </div>

                  {/* ── Text ── */}
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Text</div>
                    <p className="text-xs text-surface-500">
                      Tokens: <code className="text-surface-300">{'{name}'}</code>{' '}
                      <code className="text-surface-300">{'{world}'}</code>{' '}
                      <code className="text-surface-300">{'{status}'}</code>{' '}
                      <code className="text-surface-300">{'{instance}'}</code>
                    </p>
                    <TemplateField
                      label="First line"
                      value={discordCfg.detailsTemplate}
                      onChange={v => patchDiscord({ detailsTemplate: v })}
                    />
                    <TemplateField
                      label="Second line"
                      value={discordCfg.stateTemplate}
                      onChange={v => patchDiscord({ stateTemplate: v })}
                    />
                    <TemplateField
                      label="Image hover text"
                      value={discordCfg.largeTextTemplate}
                      onChange={v => patchDiscord({ largeTextTemplate: v })}
                    />
                    <p className="text-[10px] text-surface-600">
                      In a group instance, <code className="text-surface-400">{'{instance}'}</code> becomes
                      the group's name once it resolves — "· Furry Hideout" rather than "· group".
                      Use <code className="text-surface-400">{'{group}'}</code> to place it yourself.
                    </p>
                  </div>

                  {/* ── Asset keys ── */}
                  <div className="space-y-2 rounded-lg border border-surface-700 bg-surface-900/40 p-3">
                    <p className="text-sm font-medium">Asset keys</p>
                    <p className="text-xs text-surface-500">
                      Discord fetches image URLs from its own servers, with no VRChat login. This
                      window can show world and avatar thumbnails because it's signed in; Discord
                      often can't, and draws a grey <span className="text-surface-300">?</span> box
                      instead. Every URL is now checked before it's sent — see{' '}
                      <span className="text-surface-300">Image check</span> in Live status above — and
                      anything Discord couldn't load is swapped for a key from here.
                    </p>
                    <p className="text-xs text-surface-500">
                      Keys are the names of images uploaded under{' '}
                      <span className="text-surface-300">Rich Presence → Art Assets</span> on your
                      Discord application. Setting one replaces that picture permanently, which is
                      the only way to guarantee an image shows.
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="block space-y-1">
                        <span className="text-xs text-surface-400">World image key</span>
                        <input
                          type="text"
                          value={discordCfg.worldImageKey}
                          onChange={e => setDiscordCfg({ ...discordCfg, worldImageKey: e.target.value })}
                          onBlur={e => patchDiscord({ worldImageKey: e.target.value })}
                          placeholder="leave empty to use the world thumbnail"
                          className="input-field w-full font-mono text-sm"
                        />
                      </label>
                      <label className="block space-y-1">
                        <span className="text-xs text-surface-400">Avatar image key</span>
                        <input
                          type="text"
                          value={discordCfg.avatarImageKey}
                          onChange={e => setDiscordCfg({ ...discordCfg, avatarImageKey: e.target.value })}
                          onBlur={e => patchDiscord({ avatarImageKey: e.target.value })}
                          placeholder="leave empty to use your avatar picture"
                          className="input-field w-full font-mono text-sm"
                        />
                      </label>
                      <label className="block space-y-1 sm:col-span-2">
                        <span className="text-xs text-surface-400">Fallback image key</span>
                        <input
                          type="text"
                          value={discordCfg.fallbackImageKey}
                          onChange={e => setDiscordCfg({ ...discordCfg, fallbackImageKey: e.target.value })}
                          onBlur={e => patchDiscord({ fallbackImageKey: e.target.value })}
                          placeholder="e.g. vrchat_logo"
                          className="input-field w-full font-mono text-sm"
                        />
                        <span className="block text-[10px] text-surface-600">
                          Used whenever the slot has no usable picture — a world still loading, or a
                          URL Discord couldn't fetch. Empty means show nothing at all.
                        </span>
                      </label>
                    </div>
                  </div>

                  {/* ── Extras ── */}
                  <Toggle
                    label="Show the group's name"
                    description="In a group instance, resolve and display the group rather than just the word &quot;group&quot;"
                    checked={discordCfg.showGroupName}
                    onChange={v => patchDiscord({ showGroupName: v })}
                  />
                  <Toggle
                    label="Show elapsed time"
                    description="How long you've been in the instance, counting up on the card"
                    checked={discordCfg.showElapsed}
                    onChange={v => patchDiscord({ showElapsed: v })}
                  />
                  <Toggle
                    label="Hide world name outside public instances"
                    description="Shows &quot;a private world&quot; instead of the name, and drops the world link, so a private gathering isn't broadcast"
                    checked={discordCfg.privacyHideWorld}
                    onChange={v => patchDiscord({ privacyHideWorld: v })}
                  />
                  <Toggle
                    label="&quot;View World&quot; button"
                    description="Adds a link button to the presence card (hidden automatically when the world name is being withheld)"
                    checked={discordCfg.showWorldButton}
                    onChange={v => patchDiscord({ showWorldButton: v })}
                  />
                  <Toggle
                    label="&quot;VRChat Profile&quot; button"
                    description="Links to your own VRChat profile"
                    checked={discordCfg.showProfileButton}
                    onChange={v => patchDiscord({ showProfileButton: v })}
                  />
                  <Toggle
                    label="Show Current World"
                    description="Master switch — turn off to keep world details out of the presence entirely"
                    checked={discordCfg.showWorld}
                    onChange={v => patchDiscord({ showWorld: v })}
                  />
                  <Toggle
                    label="Show Images"
                    description="Turn off if Discord shows your text but no pictures"
                    checked={discordCfg.showAvatar}
                    onChange={v => patchDiscord({ showAvatar: v })}
                  />

                  <button
                    onClick={() => patchDiscord({
                      layout: 'world-avatar', altLayout: 'avatar-only', switchWhen: 'never',
                      detailsTemplate: '{name}', stateTemplate: 'In {world}{instance}',
                      largeTextTemplate: '{world}', privacyHideWorld: false, showElapsed: true,
                      showWorldButton: false, showProfileButton: false,
                      fallbackImageKey: '', worldImageKey: '', avatarImageKey: '',
                      showGroupName: true,
                    })}
                    className="btn-secondary text-xs"
                  >
                    Reset cosmetics to defaults
                  </button>

                  <div className="text-xs text-surface-500 bg-surface-800/40 rounded-lg p-2.5 space-y-1">
                    <p className="text-surface-300 font-semibold">Still not showing?</p>
                    <ul className="list-disc list-inside space-y-0.5">
                      <li>Discord must be the <span className="text-surface-300">desktop app</span>, running and signed in — the browser version has no local socket to connect to.</li>
                      <li>Run both apps at the same privilege level. If VRC Studio is elevated and Discord isn't (or the other way round), the socket isn't visible across them.</li>
                      <li>Discord → Settings → Activity Privacy → <span className="text-surface-300">Display current activity as a status message</span> has to be on.</li>
                      <li>Another app broadcasting a VRChat presence (Medal, VRCX) doesn't block this one — Discord stacks them, so check the whole profile card, not just the first row.</li>
                    </ul>
                  </div>
                </>
              )}
            </Section>
          )}

          {active === 'avatar-log' && <AvatarLogSection />}

          {active === 'vrcdb' && (
            <Section title="Avatar Database" icon={Database}>
              <p className="text-xs text-surface-500">The VRCDB search (Avatars page → VRCDB tab and Quick Switcher) uses community-run public avatar indexes. These are independent third-party services — switch if one is unavailable.</p>
              <div>
                <div className="text-sm font-medium mb-2">Search Provider</div>
                <div className="space-y-2">
                  {VRCDB_PROVIDERS.map(p => (
                    <label key={p.id} className="flex items-center gap-3 cursor-pointer">
                      <input type="radio" name="vrcdb_provider" checked={vrcdbProvider === p.id} onChange={() => { setProviderId(p.id as ProviderId); setVrcdbProviderState(p.id as ProviderId); }} className="accent-accent-500" />
                      <div><div className="text-sm font-medium">{p.label}</div><div className="text-xs text-surface-500 font-mono">{p.searchPageUrl('…', 25, 1)}</div></div>
                    </label>
                  ))}
                </div>
              </div>
              <div className="pt-3 border-t border-surface-800 text-xs text-surface-600 space-y-1">
                <p>These providers index only <strong className="text-surface-400">public</strong> avatars shared by their creators.</p>
                <p>Any public avatar can be worn directly via the Wear button — same as clicking an avatar on the VRChat website.</p>
                <p>To request removal of your avatar from an index, contact the provider directly. <button className="text-accent-400 hover:text-accent-300 underline" onClick={() => window.electronAPI?.openExternal('https://avtrdb.com/faq')}>avtrdb.com/faq</button></p>
              </div>
            </Section>
          )}

          {active === 'general' && (
            <>
              <Section title="Window Behavior" icon={SettingsIcon}>
                <Toggle
                  label="Start Minimized"
                  description="Start VRC Studio minimized to the system tray"
                  checked={settings.general.startMinimized}
                  onChange={v => updateGeneral({ startMinimized: v })}
                />
                <Toggle
                  label="Minimize to Tray"
                  description="Send to system tray instead of closing when you click ✕"
                  checked={settings.general.minimizeToTray}
                  onChange={v => { updateGeneral({ minimizeToTray: v }); window.electronAPI?.setMinimizeToTray(v); }}
                />
                <Toggle
                  label="Always on Top"
                  description="Keep the window pinned above all other applications"
                  checked={settings.general.alwaysOnTop}
                  onChange={v => { updateGeneral({ alwaysOnTop: v }); window.electronAPI?.setAlwaysOnTop(v); }}
                  disabled={!window.electronAPI}
                />
                <Toggle
                  label="Confirm Before Closing"
                  description="Ask for confirmation before quitting the app"
                  checked={settings.general.confirmClose}
                  onChange={v => updateGeneral({ confirmClose: v })}
                />
                <Toggle
                  label="Launch on System Startup"
                  description="Start VRC Studio automatically when your computer boots"
                  checked={autoLaunch}
                  onChange={handleAutoLaunch}
                  disabled={!window.electronAPI}
                />
                {!window.electronAPI && (
                  <p className="text-xs text-amber-400">Auto-launch requires the desktop (Electron) build.</p>
                )}
              </Section>
              <Section title="Updates" icon={RotateCw}>
                <Toggle label="Check for Updates Automatically" description="Notify you when a new version of VRC Studio is available" checked={settings.general.checkForUpdates} onChange={v => updateGeneral({ checkForUpdates: v })} />
              </Section>
              <Section title="UI Helpers" icon={SettingsIcon}>
                <div className="flex items-center justify-between gap-4 py-1">
                  <div>
                    <p className="text-sm font-medium">Show "Lost?" helper button</p>
                    <p className="text-xs text-surface-500 mt-0.5">Restore the getting-started helper tab in the sidebar</p>
                  </div>
                  <button
                    onClick={() => { localStorage.removeItem('vrcstudio_helper_dismissed'); window.location.reload(); }}
                    className="btn-secondary text-xs flex-shrink-0"
                  >
                    Re-enable
                  </button>
                </div>
              </Section>
            </>
          )}

          {active === 'performance' && (
            <>
              <Section title="Rendering" icon={Cpu}>
                <Toggle label="Enable Animations" description="Fade and slide transitions throughout the UI" checked={settings.performance.enableAnimations} onChange={v => updatePerformance({ enableAnimations: v })} />
                <Toggle label="Hardware Acceleration" description="Use GPU acceleration (requires restart)" checked={settings.general.hardwareAcceleration} onChange={v => updateGeneral({ hardwareAcceleration: v })} disabled={!window.electronAPI} />
                <div>
                  <label className="block text-sm font-medium mb-1">Image Quality</label>
                  <p className="text-xs text-surface-500 mb-2">Controls thumbnail resolution for worlds and avatars.</p>
                  <OptionRow options={['low', 'medium', 'high']} value={settings.performance.imageQuality} onChange={v => updatePerformance({ imageQuality: v as 'low' | 'medium' | 'high' })} />
                </div>
              </Section>
              <Section title="Data & Sync" icon={Database}>
                <Toggle label="Background Sync" description="Keep friends and world data fresh even when the app is minimized" checked={settings.performance.backgroundSync} onChange={v => updatePerformance({ backgroundSync: v })} />
                <Toggle label="Prefetch Images" description="Pre-load avatar and world thumbnails for faster browsing" checked={settings.performance.prefetchImages} onChange={v => updatePerformance({ prefetchImages: v })} />
                <SliderRow label="Virtualize Lists Above" value={settings.performance.virtualizeListsThreshold} min={20} max={500} step={10} unit=" items" onChange={v => updatePerformance({ virtualizeListsThreshold: v })} />
              </Section>
            </>
          )}

          {active === 'shortcuts' && (
            <Section title="Keyboard Shortcuts" icon={Keyboard}>
              <p className="text-xs text-surface-500 mb-3">These shortcuts work globally when no text input is focused.</p>
              <div className="space-y-2">
                {SHORTCUT_LIST.map(({ keys, description }) => (
                  <div key={description} className="flex items-center justify-between py-1.5 border-b border-surface-800 last:border-0">
                    <span className="text-sm text-surface-300">{description}</span>
                    <div className="flex items-center gap-1">
                      {keys.map((k, i) => (
                        <span key={i} className="flex items-center gap-1">
                          <kbd className="px-2 py-0.5 rounded bg-surface-700 border border-surface-600 text-xs font-mono text-surface-300">{k}</kbd>
                          {i < keys.length - 1 && <span className="text-surface-600 text-xs">+</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {active === 'data' && (
            <Section title="Data & Backup" icon={Download}>
              <p className="text-xs text-surface-500 mb-2">Export and import your VRC Studio data: notes, presets, friend log, settings, and theme.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <ActionCard title="Export Full Backup" description="All notes, presets, friend log, settings as JSON" icon={Download} onClick={handleExportData} label="Export .json" />
                <ActionCard title="Import Backup" description="Restore from a previously exported backup file" icon={Upload} onClick={() => importRef.current?.click()} label="Import .json" variant="secondary" />
                <ActionCard title="Export Friends List" description="Export friend IDs and display names as CSV" icon={Download} onClick={handleExportFriends} label="Export .csv" variant="secondary" />
              </div>
              <input ref={importRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
              {importStatus && (
                <div className={`text-sm px-3 py-2 rounded-lg ${importStatus.includes('Successfully') ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>{importStatus}</div>
              )}
              <StorageUsage />
              <div className="pt-4 border-t border-surface-800">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-red-400">Clear All Local Data</div>
                    <div className="text-xs text-surface-500">Removes all notes, presets, friend log, and settings</div>
                  </div>
                  <button onClick={() => { if (confirm('This will delete ALL local data. Are you sure?')) { localStorage.clear(); window.location.reload(); } }} className="btn-danger text-sm">Clear Data</button>
                </div>
              </div>
            </Section>
          )}

          {active === 'discord-bot' && <DiscordBotSection />}

          {active === 'updates' && <UpdatesSection />}

          {active === 'about' && (
            <Section title="About VRC Studio" icon={Info}>
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-xl bg-accent-600/20 flex items-center justify-center"><Globe2 size={24} className="text-accent-400" /></div>
                <div><div className="text-base font-semibold">VRC Studio</div><div className="text-xs text-surface-500">Advanced VRChat companion app</div></div>
              </div>
              <InfoRow label="Version" value="1.0.0" />
              <InfoRow label="Build" value="electron + vite + react" />
              <InfoRow label="Theme Engine" value="CSS custom properties" />
              <InfoRow label="Data Storage" value="localStorage (local only)" />
              <div className="pt-3 border-t border-surface-800 mt-2">
                <p className="text-xs text-surface-500">VRC Studio is an unofficial third-party application. It is not affiliated with or endorsed by VRChat Inc. All VRChat data is fetched through the official VRChat API using your own credentials.</p>
              </div>
              <div className="pt-2 text-center">
                <p className="text-[11px] text-surface-600">Made by DoNotPetMe or DoNotResurrect_ (on vrc)</p>
              </div>
            </Section>
          )}

        </div>
      </div>
    </div>
  );
}


/**
 * The avatar log's settings. The same controls exist on the Live Avatars
 * page's Log tab — this is here so the feature is findable from Settings and
 * from the settings search box, which is where people look for "history".
 */
function AvatarLogSection() {
  const cfg = useSettingsStore(s => s.settings.avatarLog);
  const updateAvatarLog = useSettingsStore(s => s.updateAvatarLog);
  const entries = useAvatarHistoryStore(s => s.entries);
  const clearAll = useAvatarHistoryStore(s => s.clearAll);
  const applyLimit = useAvatarHistoryStore(s => s.applyLimit);
  const [confirm, setConfirm] = useState(false);

  return (
    <>
      <Section title="Avatar Log" icon={History}>
        <p className="text-xs text-surface-500">
          Records the avatars players change into while you're in an instance with
          them, so you can look one up after they've gone. Kept on this machine
          only — nothing is uploaded anywhere.
        </p>
        <Toggle
          label="Log avatar changes"
          description="Off by default. Nothing is recorded while this is off."
          checked={cfg.enabled}
          onChange={v => updateAvatarLog({ enabled: v })}
        />
        <Toggle
          label="Include my own avatars"
          description="Log the avatars you change into as well as everyone else's"
          checked={cfg.includeSelf}
          onChange={v => updateAvatarLog({ includeSelf: v })}
          disabled={!cfg.enabled}
        />
        <div className={cfg.enabled ? '' : 'opacity-40 pointer-events-none'}>
          <SliderRow
            label="Avatars kept per player"
            value={cfg.keepPerPlayer}
            min={KEEP_MIN}
            max={KEEP_MAX}
            step={1}
            unit=""
            onChange={v => { updateAvatarLog({ keepPerPlayer: v }); applyLimit(v); }}
          />
        </div>
      </Section>

      <Section title="Stored Log" icon={Database}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm">
            <div className="font-medium">{entries.length.toLocaleString()} avatar{entries.length === 1 ? '' : 's'} logged</div>
            <div className="text-xs text-surface-500">
              Across {new Set(entries.map(e => e.playerName)).size} player
              {new Set(entries.map(e => e.playerName)).size === 1 ? '' : 's'}
            </div>
          </div>
          <button
            onClick={() => (confirm ? (clearAll(), setConfirm(false)) : setConfirm(true))}
            onBlur={() => setConfirm(false)}
            disabled={entries.length === 0}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed ${
              confirm ? 'bg-rose-600/80 text-white hover:bg-rose-600' : 'bg-rose-500/10 text-rose-300 hover:bg-rose-500/20'
            }`}
          >
            <Trash2 size={12} /> {confirm ? 'Click again to confirm' : 'Delete all logs'}
          </button>
        </div>
      </Section>
    </>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: typeof SettingsIcon; children: React.ReactNode }) {
  return (
    <div className="glass-panel-solid p-5 space-y-5">
      <h2 className="text-sm font-semibold text-surface-300 flex items-center gap-2"><Icon size={15} /> {title}</h2>
      {children}
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-surface-400">{label}</span>
      <span className={`text-sm ${mono ? 'font-mono text-xs text-surface-500' : ''}`}>{value}</span>
    </div>
  );
}

function Toggle({ label, description, checked, onChange, disabled }: { label: string; description: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${disabled ? 'opacity-50' : ''}`}>
      <div className="pr-4">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-surface-500">{description}</div>
      </div>
      <button onClick={() => !disabled && onChange(!checked)} disabled={disabled} className={`flex-shrink-0 w-11 h-6 rounded-full transition-colors relative ${checked ? 'bg-accent-600' : 'bg-surface-700'}`}>
        <div className={`absolute top-[3px] w-[18px] h-[18px] rounded-full bg-white shadow transition-transform duration-200 ${checked ? 'translate-x-[22px]' : 'translate-x-[3px]'}`} />
      </button>
    </div>
  );
}

function SliderRow({ label, value, min, max, step, unit, onChange }: { label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-sm font-medium">{label}</label>
        <span className="text-sm font-semibold text-accent-400">{value}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} className="w-full accent-accent-500" />
      <div className="flex justify-between text-xs text-surface-600 mt-1"><span>{min}{unit}</span><span>{max}{unit}</span></div>
    </div>
  );
}

function LivelinessToggle({ enabled, onToggle, label, description }: {
  enabled: boolean;
  onToggle: (v: boolean) => void;
  label: string;
  description: string;
}) {
  return (
    <label className="flex items-start gap-3 p-2.5 rounded-lg border border-surface-700 bg-surface-800/40 hover:bg-surface-800/60 cursor-pointer transition-colors">
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={() => onToggle(!enabled)}
        className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 mt-0.5 ${enabled ? 'bg-accent-500' : 'bg-surface-700'}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${enabled ? 'translate-x-4' : ''}`} />
      </button>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-surface-500 leading-snug">{description}</div>
      </div>
    </label>
  );
}

function OptionRow({ options, labels, value, onChange }: {
  options: string[]; labels?: Record<string, string>; value: string; onChange: (v: string) => void;
}) {
  return (
    <div className="flex gap-2 flex-wrap">
      {options.map(opt => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`px-4 py-1.5 rounded-lg text-sm border transition-colors capitalize ${
            value === opt
              ? 'border-accent-500 bg-accent-500/15 text-accent-400'
              : 'border-surface-700 bg-surface-800 text-surface-400 hover:border-surface-600'
          }`}
        >
          {labels?.[opt] ?? opt}
        </button>
      ))}
    </div>
  );
}

const STORAGE_STORES: Array<{ key: string; label: string; clearable: boolean }> = [
  { key: 'vrcstudio_instance_history', label: 'Visit history',      clearable: true  },
  { key: 'vrcstudio_reports',          label: 'Filed reports',      clearable: false },
  { key: 'vrcstudio_world_analytics',  label: 'World analytics',    clearable: true  },
  { key: 'vrcstudio_settings',         label: 'App settings',       clearable: false },
  { key: 'vrcstudio_theme',            label: 'Theme preferences',  clearable: false },
  { key: 'vrcstudio_discord',          label: 'Discord RPC config', clearable: false },
  { key: 'vrcstudio_starred_friends',  label: 'Starred friends',    clearable: false },
  { key: 'vrcstudio_multi_accounts',   label: 'Saved accounts',     clearable: false },
];

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// ─── Discord Bot ────────────────────────────────────────────────────────────
function DiscordBotSection() {
  const config = useDiscordBotStore(s => s.config);
  const status = useDiscordBotStore(s => s.status);
  const busy = useDiscordBotStore(s => s.busy);
  const setToken = useDiscordBotStore(s => s.setToken);
  const setAutoStart = useDiscordBotStore(s => s.setAutoStart);
  const start = useDiscordBotStore(s => s.start);
  const stop = useDiscordBotStore(s => s.stop);

  const [tokenInput, setTokenInput] = useState(config.token);
  const [showToken, setShowToken] = useState(false);
  const [lastResult, setLastResult] = useState<{ ok: boolean; error?: string } | null>(null);

  useEffect(() => { setTokenInput(config.token); }, [config.token]);

  const onSaveToken = async () => {
    await setToken(tokenInput);
    setLastResult({ ok: true });
    setTimeout(() => setLastResult(null), 2000);
  };

  const onConnect = async () => {
    if (tokenInput !== config.token) await setToken(tokenInput);
    const result = await start();
    setLastResult(result);
  };

  const onDisconnect = async () => {
    await stop();
    setLastResult({ ok: true });
  };

  return (
    <Section title="Discord Bot" icon={Zap}>
      <p className="text-xs text-surface-500 mb-3">
        Run a Discord bot from inside VRC Studio that exposes slash commands like{' '}
        <code>/whoami</code>, <code>/world</code>, <code>/players</code>, <code>/wear</code>, and{' '}
        <code>/say</code>. Replies come from the live state inside this app — no extra VRChat API spam.
      </p>

      <div className="space-y-3">
        <div className="rounded-lg border border-surface-700 bg-surface-800/40 p-3 flex items-center gap-3">
          <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${status.connected ? 'bg-green-500 animate-pulse' : 'bg-surface-600'}`} />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold">
              {status.connected ? `Connected as ${status.botTag ?? 'unknown'}` : 'Not connected'}
            </div>
            <div className="text-[11px] text-surface-500">
              {status.connected
                ? `${status.guildCount} server${status.guildCount === 1 ? '' : 's'}${status.ping != null ? ` · ${status.ping}ms ping` : ''}`
                : (status.lastError ? `Last error: ${status.lastError}` : 'Paste your bot token below and click Connect.')}
            </div>
          </div>
          {status.connected ? (
            <button onClick={onDisconnect} disabled={busy} className="btn-secondary text-sm">
              Disconnect
            </button>
          ) : (
            <button onClick={onConnect} disabled={busy || !tokenInput} className="btn-primary text-sm">
              {busy ? 'Connecting...' : 'Connect'}
            </button>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">Bot token</label>
          <div className="flex gap-2">
            <input
              type={showToken ? 'text' : 'password'}
              value={tokenInput}
              onChange={e => setTokenInput(e.target.value)}
              placeholder="Paste your bot's token (Developer Portal -> Bot)"
              className="input-field flex-1 font-mono text-xs"
              autoComplete="off"
              spellCheck={false}
            />
            <button onClick={() => setShowToken(!showToken)} className="btn-secondary text-xs">
              {showToken ? 'Hide' : 'Show'}
            </button>
            <button onClick={onSaveToken} disabled={tokenInput === config.token} className="btn-secondary text-xs">
              Save
            </button>
          </div>
          <p className="text-[10px] text-surface-600 mt-1">
            Stored only on this machine. Treat it like a password.
          </p>
        </div>

        <label className="flex items-start gap-3 p-2.5 rounded-lg border border-surface-700 bg-surface-800/40 cursor-pointer hover:bg-surface-800/60 transition-colors">
          <button
            type="button"
            role="switch"
            aria-checked={config.autoStart}
            onClick={() => setAutoStart(!config.autoStart)}
            className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 mt-0.5 ${config.autoStart ? 'bg-accent-500' : 'bg-surface-700'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${config.autoStart ? 'translate-x-4' : ''}`} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">Auto-start on launch</div>
            <div className="text-xs text-surface-500 leading-snug">
              Reconnect the bot automatically every time VRC Studio opens.
            </div>
          </div>
        </label>

        {lastResult && !lastResult.ok && (
          <div className="text-xs text-rose-400 flex items-start gap-2 p-2 rounded bg-rose-500/8 border border-rose-500/30">
            <XCircle size={12} className="mt-0.5 flex-shrink-0" />
            <span>{lastResult.error}</span>
          </div>
        )}

        <div className="rounded-lg border border-surface-700/60 bg-surface-900/40 p-3 text-xs space-y-1.5">
          <div className="font-medium text-surface-300">How to get a bot token</div>
          <ol className="list-decimal pl-5 space-y-1 text-surface-500">
            <li>
              Open the{' '}
              <button
                className="text-accent-400 hover:underline"
                onClick={() => window.electronAPI?.openExternal('https://discord.com/developers/applications')}
              >Discord Developer Portal</button>
              {' '}and click <b>New Application</b>.
            </li>
            <li>Open the new app, go to <b>Bot</b> in the sidebar, click <b>Add Bot</b>.</li>
            <li>Under <b>Token</b>, click <b>Reset Token</b> and copy the new token.</li>
            <li>Paste it above and click Connect.</li>
            <li>
              To use the bot in a server, go to <b>OAuth2 -&gt; URL Generator</b>, tick <code>bot</code> and{' '}
              <code>applications.commands</code>, copy the URL and open it to invite.
            </li>
          </ol>
        </div>

        <div className="rounded-lg border border-surface-700/60 bg-surface-900/40 p-3 text-xs">
          <div className="font-medium text-surface-300 mb-1.5">Available slash commands</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1 text-surface-400">
            <div><code className="text-accent-400">/whoami</code> — your VRChat profile</div>
            <div><code className="text-accent-400">/world</code> — current world</div>
            <div><code className="text-accent-400">/players</code> — players in instance</div>
            <div><code className="text-accent-400">/friends</code> — online friends</div>
            <div><code className="text-accent-400">/videos</code> — recent videos played</div>
            <div><code className="text-accent-400">/avatar &lt;id&gt;</code> — avatar lookup</div>
            <div><code className="text-accent-400">/status &lt;state&gt;</code> — change status</div>
            <div><code className="text-accent-400">/wear &lt;id&gt;</code> — switch avatar</div>
            <div><code className="text-accent-400">/say &lt;text&gt;</code> — VRChat chatbox via OSC</div>
          </div>
          <p className="text-[10px] text-surface-600 mt-2">
            Slash commands are registered globally and may take up to an hour to appear in
            Discord the first time you connect.
          </p>
        </div>
      </div>
    </Section>
  );
}

// ─── Updates ────────────────────────────────────────────────────────────────
/**
 * Which branch updates come from.
 *
 * This was hard-coded, which made testing a branch impossible to reason about:
 * the app checked one branch while the work under test sat on another, so every
 * fix landed somewhere the running build would never see — and pressing
 * Install would have replaced the build being tested with the other branch
 * entirely. Making it visible and changeable is the fix.
 */
/** Names the repo and branch updates actually come from, read at runtime. */
function UpdateSourceLine() {
  const [source, setSource] = useState<{ repo: string; branch: string } | null>(null);
  useEffect(() => {
    window.electronAPI?.updateGetBranch?.()
      .then(b => b && setSource({ repo: b.repo, branch: b.branch }))
      .catch(() => {});
  }, []);
  if (!source) return null;
  return (
    <p className="text-[10px] text-surface-600 mt-3">
      Source: <span className="font-mono">{source.repo}</span> · branch{' '}
      <span className="font-mono">{source.branch}</span>
    </p>
  );
}

function UpdateBranchField() {
  const [branch, setBranch] = useState('');
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [defaultBranch, setDefaultBranch] = useState('');
  const check = useUpdateStore(s => s.check);

  useEffect(() => {
    window.electronAPI?.updateGetBranch?.().then(b => {
      if (!b) return;
      setBranch(b.branch);
      setSaved(b.branch);
      setDefaultBranch(b.default);
    }).catch(() => {});
  }, []);

  const apply = async () => {
    setError(null);
    const res = await window.electronAPI?.updateSetBranch?.(branch);
    if (!res) return;
    if (!res.ok) { setError(res.error ?? 'Could not save that branch.'); return; }
    setSaved(res.branch);
    setBranch(res.branch);
    // Re-check straight away, or the panel keeps showing the other branch's
    // commits and the change looks like it did nothing.
    check();
  };

  if (!window.electronAPI?.updateGetBranch) return null;

  return (
    <div className="rounded-lg border border-surface-700 bg-surface-800/40 p-3 mb-3 space-y-2">
      <div className="text-[10px] uppercase tracking-wider text-surface-500">Update branch</div>
      <div className="flex gap-2 flex-wrap">
        <input
          value={branch}
          onChange={e => setBranch(e.target.value)}
          spellCheck={false}
          placeholder={defaultBranch}
          className="input-field flex-1 min-w-[220px] font-mono text-xs"
        />
        <button
          onClick={apply}
          disabled={!branch.trim() || branch.trim() === saved}
          className="btn-secondary text-xs disabled:opacity-40"
        >
          Use this branch
        </button>
        {saved !== defaultBranch && defaultBranch && (
          <button onClick={() => setBranch(defaultBranch)} className="btn-ghost text-xs">
            Reset
          </button>
        )}
      </div>
      {error && <p className="text-[11px] text-rose-400">{error}</p>}
      <p className="text-[11px] text-surface-500">
        Updates, and the banner at the top of the window, both follow this branch. If you're
        testing work on a different one, point this at it — otherwise Install will replace your
        build with whatever is on{' '}
        <code className="text-surface-400">{saved || defaultBranch}</code>.
      </p>
    </div>
  );
}

function UpdatesSection() {
  const stage = useUpdateStore(s => s.stage);
  const info = useUpdateStore(s => s.info);
  const error = useUpdateStore(s => s.error);
  const progress = useUpdateStore(s => s.progress);
  const lastCheckedAt = useUpdateStore(s => s.lastCheckedAt);
  const check = useUpdateStore(s => s.check);
  const apply = useUpdateStore(s => s.apply);

  const checking = stage === 'checking';
  const isUpdating = stage === 'downloading' || stage === 'preparing' || stage === 'restarting';
  const pct = progress && progress.total > 0 ? Math.round((progress.received / progress.total) * 100) : null;

  return (
    <Section title="Updates" icon={Download}>
      <p className="text-xs text-surface-500 mb-3">
        VRC Studio fetches updates directly from a branch on GitHub. Clicking <b>Install</b> downloads the latest snapshot,
        runs <code>npm install</code> for any new dependencies, and restarts the app.
      </p>

      <UpdateBranchField />

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="rounded-lg border border-surface-700 bg-surface-800/40 p-3">
          <div className="text-[10px] uppercase tracking-wider text-surface-500 mb-1">Installed</div>
          <div className="font-mono text-xs text-surface-200 truncate">
            {info?.currentCommit ? info.currentCommit.slice(0, 12) : '—'}
          </div>
        </div>
        <div className="rounded-lg border border-surface-700 bg-surface-800/40 p-3">
          <div className="text-[10px] uppercase tracking-wider text-surface-500 mb-1">Latest on GitHub</div>
          <div className="font-mono text-xs text-surface-200 truncate">
            {info?.latestCommit ? info.latestCommit.slice(0, 12) : '—'}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={() => check()}
          disabled={checking || isUpdating}
          className="btn-secondary text-sm flex items-center gap-1.5 disabled:opacity-40"
        >
          <RotateCw size={13} className={checking ? 'animate-spin' : ''} />
          {checking ? 'Checking...' : 'Check now'}
        </button>

        {info && !info.upToDate && !isUpdating && (
          <button onClick={apply} className="btn-primary text-sm flex items-center gap-1.5">
            <Download size={13} />
            Install update
          </button>
        )}

        {info?.upToDate && (
          <span className="text-xs text-green-400 flex items-center gap-1">
            <CheckCircle size={12} /> You're up to date
          </span>
        )}

        {lastCheckedAt && !checking && (
          <span className="text-[10px] text-surface-600 ml-auto">
            Last checked {new Date(lastCheckedAt).toLocaleTimeString()}
          </span>
        )}
      </div>

      {isUpdating && (
        <div className="mb-3 p-3 rounded-lg border border-accent-500/30 bg-accent-500/8 text-xs space-y-1.5">
          <div className="flex items-center gap-2">
            <RotateCw size={12} className="animate-spin text-accent-300" />
            <span className="font-medium">
              {stage === 'downloading' && `Downloading update${pct != null ? ` (${pct}%)` : '...'}`}
              {stage === 'preparing' && 'Preparing files...'}
              {stage === 'restarting' && 'Restarting VRC Studio...'}
            </span>
          </div>
          {pct != null && (
            <div className="h-1 bg-surface-800 rounded-full overflow-hidden">
              <div className="h-full bg-accent-500 transition-all" style={{ width: `${pct}%` }} />
            </div>
          )}
          {stage === 'restarting' && (
            <p className="text-surface-500 text-[10px]">A separate CMD window has opened and is taking over. This app will close shortly and the new version will start on its own.</p>
          )}
        </div>
      )}

      {error && stage === 'error' && (
        <div className="mb-3 p-3 rounded-lg border border-rose-500/30 bg-rose-500/8 text-xs text-rose-300 flex items-start gap-2">
          <XCircle size={13} className="mt-0.5 flex-shrink-0" />
          <div>
            <div className="font-medium">Update failed</div>
            <div className="text-rose-300/80 mt-0.5 break-words">{error}</div>
          </div>
        </div>
      )}

      {info && info.commits.length > 0 && !info.upToDate && (
        <div className="rounded-lg border border-surface-700 bg-surface-800/30 overflow-hidden">
          <div className="px-3 py-2 border-b border-surface-700 text-[11px] uppercase tracking-wider text-surface-500">
            What's new — {info.behind} commit{info.behind === 1 ? '' : 's'} ahead
          </div>
          <ul className="divide-y divide-surface-800/60 max-h-72 overflow-y-auto">
            {info.commits.slice().reverse().map(c => (
              <li key={c.sha} className="px-3 py-2 text-xs flex items-start gap-2 hover:bg-surface-800/40">
                <span className="font-mono text-[10px] text-surface-600 mt-0.5 flex-shrink-0">{c.shortSha}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-surface-200 truncate">{c.message}</div>
                  <div className="text-[10px] text-surface-600">
                    {c.author} · {new Date(c.date).toLocaleDateString()}
                  </div>
                </div>
                {c.url && (
                  <button
                    onClick={() => window.electronAPI?.openExternal(c.url)}
                    className="text-surface-500 hover:text-accent-400"
                    title="Open on GitHub"
                  >
                    <ExternalLink size={11} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <UpdateSourceLine />
    </Section>
  );
}

function StorageUsage() {
  const [tick, setTick] = useState(0);
  const rows = STORAGE_STORES.map(store => {
    const raw = localStorage.getItem(store.key) ?? '';
    return { ...store, bytes: new Blob([raw]).size };
  });
  const knownKeys = new Set(STORAGE_STORES.map(s => s.key));
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i) ?? '';
    if (k.startsWith('vrcstudio_') && !knownKeys.has(k)) {
      const raw = localStorage.getItem(k) ?? '';
      rows.push({ key: k, label: k.replace('vrcstudio_', ''), bytes: new Blob([raw]).size, clearable: true });
    }
  }
  const total = rows.reduce((s, r) => s + r.bytes, 0);
  const maxBytes = Math.max(...rows.map(r => r.bytes), 1);
  function clearStore(key: string) { localStorage.removeItem(key); setTick(t => t + 1); }
  return (
    <div className="pt-4 border-t border-surface-800 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Storage Usage</div>
        <div className="text-xs text-surface-500">{fmtBytes(total)} total</div>
      </div>
      <div className="space-y-2">
        {rows.filter(r => r.bytes > 0).sort((a, b) => b.bytes - a.bytes).map(row => (
          <div key={row.key + tick} className="flex items-center gap-3">
            <div className="w-28 text-xs text-surface-400 truncate flex-shrink-0">{row.label}</div>
            <div className="flex-1 h-1.5 bg-surface-800 rounded-full overflow-hidden">
              <div className="h-full bg-accent-500/60 rounded-full" style={{ width: `${(row.bytes / maxBytes) * 100}%` }} />
            </div>
            <div className="text-xs text-surface-500 w-14 text-right flex-shrink-0">{fmtBytes(row.bytes)}</div>
            {row.clearable ? (
              <button onClick={() => clearStore(row.key)} className="text-xs text-red-400/70 hover:text-red-400 transition-colors flex-shrink-0" title={`Clear ${row.label}`}><Trash2 size={12} /></button>
            ) : <div className="w-3 flex-shrink-0" />}
          </div>
        ))}
        {rows.every(r => r.bytes === 0) && <p className="text-xs text-surface-600">No data stored yet.</p>}
      </div>
    </div>
  );
}

function ActionCard({ title, description, icon: Icon, onClick, label, variant = 'primary' }: { title: string; description: string; icon: typeof Download; onClick: () => void; label: string; variant?: 'primary' | 'secondary' }) {
  return (
    <div className="glass-panel p-4 space-y-2">
      <div className="flex items-center gap-2"><Icon size={15} className="text-accent-400" /><span className="text-sm font-medium">{title}</span></div>
      <p className="text-xs text-surface-500">{description}</p>
      <button onClick={onClick} className={variant === 'primary' ? 'btn-primary text-xs' : 'btn-secondary text-xs'}>{label}</button>
    </div>
  );
}
