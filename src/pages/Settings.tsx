import { useState, useRef, useEffect } from 'react';
import {
  Settings as SettingsIcon, Bell, Monitor, Clock, RotateCcw,
  Palette, Download, Upload, UserCircle, Globe2, Zap, Shield,
  Plus, Trash2, Check, ChevronDown,
} from 'lucide-react';
import { useSettingsStore } from '../stores/settingsStore';
import { useAuthStore } from '../stores/authStore';
import { useFriendStore } from '../stores/friendStore';
import { useThemeStore } from '../stores/themeStore';
import { useMultiAccountStore } from '../stores/multiAccountStore';
import { exportAllData, downloadExport, importData, exportFriendsList, downloadCSV } from '../utils/dataExport';
import { getAvailableLanguages, setLanguage, getLanguage } from '../utils/i18n';
import api from '../api/vrchat';

type SettingsSection =
  | 'account' | 'accounts' | 'notifications' | 'polling'
  | 'display' | 'appearance' | 'discord' | 'general' | 'data';

const sections: Array<{ key: SettingsSection; label: string; icon: typeof SettingsIcon }> = [
  { key: 'account', label: 'Account', icon: UserCircle },
  { key: 'accounts', label: 'Multiple Accounts', icon: Shield },
  { key: 'notifications', label: 'Notifications', icon: Bell },
  { key: 'polling', label: 'Update Intervals', icon: Clock },
  { key: 'display', label: 'Display', icon: Monitor },
  { key: 'appearance', label: 'Appearance', icon: Palette },
  { key: 'discord', label: 'Discord Rich Presence', icon: Zap },
  { key: 'general', label: 'General', icon: SettingsIcon },
  { key: 'data', label: 'Data & Backup', icon: Download },
];

export default function SettingsPage() {
  const { settings, updateGeneral, updateNotifications, updatePolling, updateDisplay, resetSettings } = useSettingsStore();
  const { user } = useAuthStore();
  const { onlineFriends, offlineFriends } = useFriendStore();
  const { theme, setMode, setAccentColor, setCustomCSS, setFontSize, setSidebarWidth, resetTheme } = useThemeStore();
  const { accounts, addAccount, removeAccount } = useMultiAccountStore();
  const [active, setActive] = useState<SettingsSection>('account');
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [lang, setLang] = useState(getLanguage());
  const [autoLaunch, setAutoLaunch] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  // Discord settings stored in a simple local state backed to localStorage
  const [discordEnabled, setDiscordEnabled] = useState(() =>
    JSON.parse(localStorage.getItem('vrcstudio_discord') || '{"enabled":false,"clientId":""}').enabled
  );
  const [discordClientId, setDiscordClientId] = useState(() =>
    JSON.parse(localStorage.getItem('vrcstudio_discord') || '{"enabled":false,"clientId":""}').clientId
  );

  const saveDiscord = (enabled: boolean, clientId: string) => {
    localStorage.setItem('vrcstudio_discord', JSON.stringify({ enabled, clientId }));
    if (enabled && window.electronAPI) {
      window.electronAPI.discordInit(clientId || '1234567890');
    } else {
      window.electronAPI?.discordDisconnect();
    }
  };

  useEffect(() => {
    window.electronAPI?.getAutoLaunch().then(v => setAutoLaunch(v));
  }, []);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const result = importData(text);
    setImportStatus(result.message);
    setTimeout(() => setImportStatus(null), 5000);
    e.target.value = '';
  };

  const handleExportData = () => {
    const data = exportAllData();
    downloadExport(data);
  };

  const handleExportFriends = () => {
    const all = [...onlineFriends, ...offlineFriends];
    const csv = exportFriendsList(all.map(f => ({ id: f.id, displayName: f.displayName, status: f.status })));
    downloadCSV(csv, `vrcstudio-friends-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const handleLangChange = (code: string) => {
    setLanguage(code);
    setLang(code);
    // Reload to apply
    window.location.reload();
  };

  const handleAutoLaunch = (v: boolean) => {
    setAutoLaunch(v);
    window.electronAPI?.setAutoLaunch(v);
    updateGeneral({ launchOnStartup: v });
  };

  return (
    <div className="max-w-5xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-surface-100">Settings</h1>
        <p className="text-sm text-surface-500 mt-0.5">Configure your VRC Studio experience</p>
      </div>

      <div className="flex gap-6">
        {/* Left nav */}
        <nav className="w-48 flex-shrink-0">
          <div className="glass-panel-solid p-2 space-y-0.5">
            {sections.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setActive(key)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  active === key
                    ? 'bg-accent-600/15 text-accent-400'
                    : 'text-surface-400 hover:text-surface-200 hover:bg-surface-800/60'
                }`}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </div>
          <div className="mt-3">
            <button onClick={resetSettings} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors">
              <RotateCcw size={15} /> Reset All Settings
            </button>
          </div>
        </nav>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-4">

          {/* ── Account ── */}
          {active === 'account' && (
            <Section title="Account" icon={UserCircle}>
              <InfoRow label="Display Name" value={user?.displayName || '—'} />
              <InfoRow label="User ID" value={user?.id || '—'} mono />
              <InfoRow label="Email Verified" value={user?.emailVerified ? 'Yes' : 'No'} />
              <InfoRow label="2FA Enabled" value={user?.twoFactorAuthEnabled ? 'Yes' : 'No'} />
              <InfoRow label="Friends" value={`${onlineFriends.length} online / ${onlineFriends.length + offlineFriends.length} total`} />
            </Section>
          )}

          {/* ── Multiple Accounts ── */}
          {active === 'accounts' && (
            <Section title="Multiple Accounts" icon={Shield}>
              <p className="text-xs text-surface-500 mb-3">
                Saved accounts let you quickly switch between VRChat profiles. Credentials are stored locally only.
              </p>
              <div className="space-y-2">
                {accounts.map(acct => (
                  <div key={acct.id} className="glass-panel p-3 flex items-center gap-3">
                    {acct.avatarUrl && <img src={acct.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover" />}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{acct.displayName || acct.label || acct.username}</div>
                      <div className="text-xs text-surface-500">{acct.username}</div>
                    </div>
                    <button onClick={() => removeAccount(acct.id)} className="btn-ghost text-red-400 hover:text-red-300">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                {accounts.length === 0 && (
                  <p className="text-sm text-surface-500">No saved accounts. Log in to automatically save your session.</p>
                )}
              </div>
            </Section>
          )}

          {/* ── Notifications ── */}
          {active === 'notifications' && (
            <Section title="Notifications" icon={Bell}>
              <Toggle label="Friend Comes Online" description="Notify when a friend's status becomes online"
                checked={settings.notifications.friendOnline} onChange={v => updateNotifications({ friendOnline: v })} />
              <Toggle label="Friend Goes Offline" description="Notify when a friend disconnects"
                checked={settings.notifications.friendOffline} onChange={v => updateNotifications({ friendOffline: v })} />
              <Toggle label="Friend Location Change" description="Notify when a friend joins a new world"
                checked={settings.notifications.friendLocation} onChange={v => updateNotifications({ friendLocation: v })} />
              <Toggle label="Friend Status Change" description="Notify when a friend updates their status message"
                checked={settings.notifications.friendStatus} onChange={v => updateNotifications({ friendStatus: v })} />
              <Toggle label="Invites & Requests" description="Notify on incoming invites and friend requests"
                checked={settings.notifications.invites} onChange={v => updateNotifications({ invites: v })} />
              <Toggle label="Sound" description="Play a sound with each notification"
                checked={settings.notifications.sound} onChange={v => updateNotifications({ sound: v })} />
            </Section>
          )}

          {/* ── Polling ── */}
          {active === 'polling' && (
            <Section title="Update Intervals" icon={Clock}>
              <p className="text-xs text-surface-500 mb-4">
                Polling supplements the real-time WebSocket connection. Lower intervals mean more up-to-date info but more API calls.
              </p>
              <SliderRow
                label="Friends Refresh Interval"
                value={settings.polling.friendsInterval}
                min={10} max={120} step={5}
                unit="s"
                onChange={v => updatePolling({ friendsInterval: v })}
              />
              <SliderRow
                label="World Browser Refresh"
                value={settings.polling.worldInterval}
                min={30} max={300} step={10}
                unit="s"
                onChange={v => updatePolling({ worldInterval: v })}
              />
            </Section>
          )}

          {/* ── Display ── */}
          {active === 'display' && (
            <Section title="Display" icon={Monitor}>
              <Toggle label="Compact Mode" description="Denser layout showing more items per screen"
                checked={settings.display.compactMode} onChange={v => updateDisplay({ compactMode: v })} />
              <Toggle label="Show Offline Friends" description="Include offline friends in the friends list"
                checked={settings.display.showOfflineFriends} onChange={v => updateDisplay({ showOfflineFriends: v })} />
              <div>
                <label className="block text-sm font-medium mb-1">Time Format</label>
                <select value={settings.display.timeFormat}
                  onChange={e => updateDisplay({ timeFormat: e.target.value as '12h' | '24h' })}
                  className="input-field w-auto">
                  <option value="24h">24-hour (14:30)</option>
                  <option value="12h">12-hour (2:30 PM)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Language</label>
                <select value={lang} onChange={e => handleLangChange(e.target.value)} className="input-field w-auto">
                  {getAvailableLanguages().map(l => (
                    <option key={l.code} value={l.code}>{l.name}</option>
                  ))}
                </select>
                <p className="text-xs text-surface-500 mt-1">Changing language reloads the app.</p>
              </div>
            </Section>
          )}

          {/* ── Appearance ── */}
          {active === 'appearance' && (
            <Section title="Appearance" icon={Palette}>
              <div>
                <label className="block text-sm font-medium mb-2">Theme Mode</label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {(['dark', 'midnight', 'oled', 'light'] as const).map(mode => (
                    <button
                      key={mode}
                      onClick={() => setMode(mode)}
                      className={`py-2 rounded-lg text-sm font-medium border transition-colors capitalize ${
                        theme.mode === mode
                          ? 'border-accent-500 bg-accent-500/15 text-accent-400'
                          : 'border-surface-700 bg-surface-800 text-surface-400 hover:border-surface-600'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Accent Color</label>
                <div className="flex gap-3 flex-wrap">
                  {([
                    { key: 'blue', bg: 'bg-blue-500' },
                    { key: 'purple', bg: 'bg-purple-500' },
                    { key: 'green', bg: 'bg-green-500' },
                    { key: 'rose', bg: 'bg-rose-500' },
                    { key: 'amber', bg: 'bg-amber-500' },
                    { key: 'cyan', bg: 'bg-cyan-500' },
                  ] as const).map(({ key, bg }) => (
                    <button
                      key={key}
                      onClick={() => setAccentColor(key)}
                      className={`w-8 h-8 rounded-full ${bg} transition-transform hover:scale-110 ${
                        theme.accentColor === key ? 'ring-2 ring-white ring-offset-2 ring-offset-surface-900' : ''
                      }`}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Font Size</label>
                <div className="flex gap-2">
                  {(['small', 'medium', 'large'] as const).map(size => (
                    <button
                      key={size}
                      onClick={() => setFontSize(size)}
                      className={`px-4 py-1.5 rounded-lg text-sm border transition-colors capitalize ${
                        theme.fontSize === size
                          ? 'border-accent-500 bg-accent-500/15 text-accent-400'
                          : 'border-surface-700 bg-surface-800 text-surface-400 hover:border-surface-600'
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Custom CSS</label>
                <p className="text-xs text-surface-500 mb-2">Advanced: inject custom CSS into the app.</p>
                <textarea
                  value={theme.customCSS}
                  onChange={e => setCustomCSS(e.target.value)}
                  placeholder="/* Custom CSS */"
                  className="input-field font-mono text-xs h-32 resize-y"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Sidebar Width</label>
                <div className="flex gap-2">
                  {(['compact', 'normal', 'wide'] as const).map(width => (
                    <button
                      key={width}
                      onClick={() => setSidebarWidth(width)}
                      className={`px-4 py-1.5 rounded-lg text-sm border transition-colors capitalize ${
                        theme.sidebarWidth === width
                          ? 'border-accent-500 bg-accent-500/15 text-accent-400'
                          : 'border-surface-700 bg-surface-800 text-surface-400 hover:border-surface-600'
                      }`}
                    >
                      {width}
                    </button>
                  ))}
                </div>
              </div>

              <button onClick={resetTheme} className="btn-secondary text-sm w-fit">
                Reset to Default Theme
              </button>
            </Section>
          )}

          {/* ── Discord RPC ── */}
          {active === 'discord' && (
            <Section title="Discord Rich Presence" icon={Zap}>
              <p className="text-xs text-surface-500 mb-4">
                Show your VRChat activity on Discord. Requires the desktop app (Electron) to work.
                {!window.electronAPI && <span className="text-amber-400"> (Not available in browser mode)</span>}
              </p>
              <Toggle
                label="Enable Discord Rich Presence"
                description="Show what you're doing in VRChat on your Discord profile"
                checked={discordEnabled}
                onChange={v => { setDiscordEnabled(v); saveDiscord(v, discordClientId); }}
              />
              {discordEnabled && (
                <div>
                  <label className="block text-sm font-medium mb-1">Discord Application Client ID</label>
                  <p className="text-xs text-surface-500 mb-2">
                    Optional: use your own Discord application for custom branding.
                    Leave blank to use the VRC Studio default.
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={discordClientId}
                      onChange={e => setDiscordClientId(e.target.value)}
                      placeholder="Discord Application Client ID"
                      className="input-field flex-1 font-mono text-sm"
                    />
                    <button
                      onClick={() => saveDiscord(discordEnabled, discordClientId)}
                      className="btn-primary text-sm"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              )}
            </Section>
          )}

          {/* ── General ── */}
          {active === 'general' && (
            <Section title="General" icon={SettingsIcon}>
              <Toggle
                label="Start Minimized"
                description="Start VRC Studio minimized to the system tray"
                checked={settings.general.startMinimized}
                onChange={v => updateGeneral({ startMinimized: v })}
              />
              <Toggle
                label="Minimize to Tray"
                description="Send to system tray instead of closing when you click X"
                checked={settings.general.minimizeToTray}
                onChange={v => {
                  updateGeneral({ minimizeToTray: v });
                  window.electronAPI?.setMinimizeToTray(v);
                }}
              />
              <Toggle
                label="Launch on System Startup"
                description="Start VRC Studio when your computer boots"
                checked={autoLaunch}
                onChange={handleAutoLaunch}
                disabled={!window.electronAPI}
              />
              {!window.electronAPI && (
                <p className="text-xs text-amber-400">Auto-launch requires the desktop (Electron) build.</p>
              )}
            </Section>
          )}

          {/* ── Data & Backup ── */}
          {active === 'data' && (
            <Section title="Data & Backup" icon={Download}>
              <p className="text-xs text-surface-500 mb-2">
                Export and import your VRC Studio data: notes, presets, friend log, settings, and theme.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <ActionCard
                  title="Export Full Backup"
                  description="All notes, presets, friend log, settings as JSON"
                  icon={Download}
                  onClick={handleExportData}
                  label="Export .json"
                />
                <ActionCard
                  title="Import Backup"
                  description="Restore from a previously exported backup file"
                  icon={Upload}
                  onClick={() => importRef.current?.click()}
                  label="Import .json"
                  variant="secondary"
                />
                <ActionCard
                  title="Export Friends List"
                  description="Export friend IDs and names as CSV"
                  icon={Download}
                  onClick={handleExportFriends}
                  label="Export .csv"
                  variant="secondary"
                />
              </div>
              <input ref={importRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
              {importStatus && (
                <div className={`text-sm px-3 py-2 rounded-lg ${
                  importStatus.includes('Successfully') ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
                }`}>
                  {importStatus}
                </div>
              )}

              <div className="pt-4 border-t border-surface-800">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-red-400">Clear All Local Data</div>
                    <div className="text-xs text-surface-500">Removes all notes, presets, friend log, and settings</div>
                  </div>
                  <button
                    onClick={() => {
                      if (confirm('This will delete ALL local data. Are you sure?')) {
                        localStorage.clear();
                        window.location.reload();
                      }
                    }}
                    className="btn-danger text-sm"
                  >
                    Clear Data
                  </button>
                </div>
              </div>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({ title, icon: Icon, children }: { title: string; icon: typeof SettingsIcon; children: React.ReactNode }) {
  return (
    <div className="glass-panel-solid p-5 space-y-5">
      <h2 className="text-sm font-semibold text-surface-300 flex items-center gap-2">
        <Icon size={15} /> {title}
      </h2>
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

function Toggle({
  label, description, checked, onChange, disabled,
}: {
  label: string; description: string; checked: boolean;
  onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between ${disabled ? 'opacity-50' : ''}`}>
      <div className="pr-4">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-surface-500">{description}</div>
      </div>
      <button
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
        className={`flex-shrink-0 w-11 h-6 rounded-full transition-colors relative ${checked ? 'bg-accent-600' : 'bg-surface-700'}`}
      >
        <div
          className={`absolute top-[3px] w-[18px] h-[18px] rounded-full bg-white shadow transition-transform duration-200 ${
            checked ? 'translate-x-[22px]' : 'translate-x-[3px]'
          }`}
        />
      </button>
    </div>
  );
}

function SliderRow({ label, value, min, max, step, unit, onChange }: {
  label: string; value: number; min: number; max: number; step: number; unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-sm font-medium">{label}</label>
        <span className="text-sm font-semibold text-accent-400">{value}{unit}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-accent-500"
      />
      <div className="flex justify-between text-xs text-surface-600 mt-1">
        <span>{min}{unit}</span><span>{max}{unit}</span>
      </div>
    </div>
  );
}

function ActionCard({ title, description, icon: Icon, onClick, label, variant = 'primary' }: {
  title: string; description: string; icon: typeof Download;
  onClick: () => void; label: string; variant?: 'primary' | 'secondary';
}) {
  return (
    <div className="glass-panel p-4 space-y-2">
      <div className="flex items-center gap-2">
        <Icon size={15} className="text-accent-400" />
        <span className="text-sm font-medium">{title}</span>
      </div>
      <p className="text-xs text-surface-500">{description}</p>
      <button onClick={onClick} className={variant === 'primary' ? 'btn-primary text-xs' : 'btn-secondary text-xs'}>
        {label}
      </button>
    </div>
  );
}
