import { useSettingsStore } from '../stores/settingsStore';
import { useAuthStore } from '../stores/authStore';
import { Settings as SettingsIcon, Bell, Monitor, Clock, RotateCcw } from 'lucide-react';

export default function SettingsPage() {
  const { settings, updateGeneral, updateNotifications, updatePolling, updateDisplay, resetSettings } = useSettingsStore();
  const { user } = useAuthStore();

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* Account Info */}
      <section className="glass-panel-solid p-5">
        <h2 className="text-sm font-semibold text-surface-300 mb-4 flex items-center gap-2">
          <SettingsIcon size={16} /> Account
        </h2>
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-surface-400">Display Name</span>
            <span>{user?.displayName}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-surface-400">User ID</span>
            <span className="font-mono text-xs text-surface-500">{user?.id}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-surface-400">2FA Enabled</span>
            <span>{user?.twoFactorAuthEnabled ? 'Yes' : 'No'}</span>
          </div>
        </div>
      </section>

      {/* General */}
      <section className="glass-panel-solid p-5">
        <h2 className="text-sm font-semibold text-surface-300 mb-4 flex items-center gap-2">
          <Monitor size={16} /> General
        </h2>
        <div className="space-y-4">
          <Toggle
            label="Start Minimized"
            description="Start VRC Studio minimized to system tray"
            checked={settings.general.startMinimized}
            onChange={(v) => updateGeneral({ startMinimized: v })}
          />
          <Toggle
            label="Minimize to Tray"
            description="Minimize to system tray instead of taskbar"
            checked={settings.general.minimizeToTray}
            onChange={(v) => updateGeneral({ minimizeToTray: v })}
          />
          <Toggle
            label="Launch on Startup"
            description="Automatically start when your computer boots"
            checked={settings.general.launchOnStartup}
            onChange={(v) => updateGeneral({ launchOnStartup: v })}
          />
        </div>
      </section>

      {/* Notifications */}
      <section className="glass-panel-solid p-5">
        <h2 className="text-sm font-semibold text-surface-300 mb-4 flex items-center gap-2">
          <Bell size={16} /> Notifications
        </h2>
        <div className="space-y-4">
          <Toggle
            label="Friend Online"
            description="Notify when a friend comes online"
            checked={settings.notifications.friendOnline}
            onChange={(v) => updateNotifications({ friendOnline: v })}
          />
          <Toggle
            label="Friend Offline"
            description="Notify when a friend goes offline"
            checked={settings.notifications.friendOffline}
            onChange={(v) => updateNotifications({ friendOffline: v })}
          />
          <Toggle
            label="Friend Location Change"
            description="Notify when a friend changes worlds"
            checked={settings.notifications.friendLocation}
            onChange={(v) => updateNotifications({ friendLocation: v })}
          />
          <Toggle
            label="Friend Status Change"
            description="Notify when a friend changes their status"
            checked={settings.notifications.friendStatus}
            onChange={(v) => updateNotifications({ friendStatus: v })}
          />
          <Toggle
            label="Invites"
            description="Notify on incoming invites"
            checked={settings.notifications.invites}
            onChange={(v) => updateNotifications({ invites: v })}
          />
          <Toggle
            label="Sound"
            description="Play sound with notifications"
            checked={settings.notifications.sound}
            onChange={(v) => updateNotifications({ sound: v })}
          />
        </div>
      </section>

      {/* Polling */}
      <section className="glass-panel-solid p-5">
        <h2 className="text-sm font-semibold text-surface-300 mb-4 flex items-center gap-2">
          <Clock size={16} /> Update Intervals
        </h2>
        <div className="space-y-4">
          <div>
            <label className="text-sm text-surface-300 block mb-1">Friends Update Interval</label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={10}
                max={120}
                step={5}
                value={settings.polling.friendsInterval}
                onChange={(e) => updatePolling({ friendsInterval: Number(e.target.value) })}
                className="flex-1"
              />
              <span className="text-sm text-surface-400 w-16 text-right">{settings.polling.friendsInterval}s</span>
            </div>
          </div>
          <div>
            <label className="text-sm text-surface-300 block mb-1">World Update Interval</label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={30}
                max={300}
                step={10}
                value={settings.polling.worldInterval}
                onChange={(e) => updatePolling({ worldInterval: Number(e.target.value) })}
                className="flex-1"
              />
              <span className="text-sm text-surface-400 w-16 text-right">{settings.polling.worldInterval}s</span>
            </div>
          </div>
        </div>
      </section>

      {/* Display */}
      <section className="glass-panel-solid p-5">
        <h2 className="text-sm font-semibold text-surface-300 mb-4 flex items-center gap-2">
          <Monitor size={16} /> Display
        </h2>
        <div className="space-y-4">
          <Toggle
            label="Compact Mode"
            description="Show more information in less space"
            checked={settings.display.compactMode}
            onChange={(v) => updateDisplay({ compactMode: v })}
          />
          <Toggle
            label="Show Offline Friends"
            description="Show offline friends in the friends list"
            checked={settings.display.showOfflineFriends}
            onChange={(v) => updateDisplay({ showOfflineFriends: v })}
          />
          <div>
            <label className="text-sm text-surface-300 block mb-1">Time Format</label>
            <select
              value={settings.display.timeFormat}
              onChange={(e) => updateDisplay({ timeFormat: e.target.value as '12h' | '24h' })}
              className="input-field w-auto"
            >
              <option value="24h">24-hour</option>
              <option value="12h">12-hour</option>
            </select>
          </div>
        </div>
      </section>

      {/* Reset */}
      <div className="flex justify-end">
        <button onClick={resetSettings} className="btn-danger flex items-center gap-2 text-sm">
          <RotateCcw size={14} /> Reset All Settings
        </button>
      </div>
    </div>
  );
}

function Toggle({ label, description, checked, onChange }: {
  label: string; description: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-surface-500">{description}</div>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`w-10 h-5.5 rounded-full transition-colors relative ${
          checked ? 'bg-accent-600' : 'bg-surface-700'
        }`}
      >
        <div
          className={`absolute top-0.5 w-4.5 h-4.5 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0.5'
          }`}
          style={{ width: 18, height: 18, top: 2 }}
        />
      </button>
    </div>
  );
}
