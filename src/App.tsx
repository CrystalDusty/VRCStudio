import { useEffect, Component, ErrorInfo, ReactNode } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { useThemeStore, restoreThemeFromDisk } from './stores/themeStore';
import { useSettingsStore, restoreSettingsFromDisk } from './stores/settingsStore';
import { checkForUpdatesOnStartup } from './stores/updateStore';
import { usePolling } from './hooks/usePolling';
import { useDiscordRPC } from './hooks/useDiscordRPC';
import { requestNotificationPermission } from './utils/notifications';
import keyboardManager from './utils/keyboard';
import AppLayout from './components/Layout/AppLayout';
import LoginPage from './pages/Login';
import Dashboard from './pages/Dashboard';
import Friends from './pages/Friends';
import FriendLog from './pages/FriendLog';
import Worlds from './pages/Worlds';
import Avatars from './pages/Avatars';
import Groups from './pages/Groups';
import Favorites from './pages/Favorites';
import Notifications from './pages/Notifications';
import Settings from './pages/Settings';
import SearchPage from './pages/Search';
import GameLog from './pages/GameLog';
import Screenshots from './pages/Screenshots';
import ActivityHeatmap from './pages/ActivityHeatmap';
import FriendAnalytics from './pages/FriendAnalytics';
import EventPlanner from './pages/EventPlanner';
import AvatarEditor from './pages/AvatarEditor';
import Reports from './pages/Reports';
import OSCPage from './pages/OSC';
import InstanceAvatars from './pages/InstanceAvatars';
import Gallery from './pages/Gallery';
import LoadingSpinner from './components/common/LoadingSpinner';
import { useLocationTracking } from './hooks/useLocationTracking';
import { useTrayStatus } from './hooks/useTrayStatus';
import { useLogIngestion } from './hooks/useLogIngestion';
import { useDiscordBotBridge } from './hooks/useDiscordBotBridge';
import { useDiscordBotStore } from './stores/discordBotStore';
import AvatarSwitcher from './components/AvatarSwitcher';
import HackerConsole from './components/HackerConsole';
import { useAvatarSwitcherStore } from './stores/avatarSwitcherStore';
import { useOSCStore } from './stores/oscStore';

// Error boundary to catch React rendering errors and show them instead of a blank screen
class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[VRC Studio] React error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          height: '100vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: '#020617', color: '#e2e8f0', fontFamily: 'Inter, system-ui, sans-serif',
          padding: '2rem', textAlign: 'center',
        }}>
          <div style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            Something went wrong
          </div>
          <div style={{
            fontSize: '0.8rem', color: '#94a3b8', maxWidth: '500px',
            marginBottom: '1rem',
          }}>
            {this.state.error?.message}
          </div>
          <pre style={{
            fontSize: '0.7rem', color: '#64748b', maxWidth: '600px',
            overflow: 'auto', textAlign: 'left', padding: '1rem',
            background: '#0f172a', borderRadius: '0.5rem', maxHeight: '200px',
            width: '100%',
          }}>
            {this.state.error?.stack}
          </pre>
          <button
            onClick={() => {
              localStorage.clear();
              window.location.reload();
            }}
            style={{
              marginTop: '1rem', padding: '0.5rem 1.5rem',
              background: '#2563eb', color: '#fff', border: 'none',
              borderRadius: '0.5rem', cursor: 'pointer', fontSize: '0.85rem',
            }}
          >
            Clear data & reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function AppShell() {
  const navigate = useNavigate();
  const { isOpen: switcherOpen, close: closeSwitcher, toggle: toggleSwitcher } = useAvatarSwitcherStore();
  useDiscordRPC();
  useLocationTracking();
  useTrayStatus();
  useLogIngestion();
  useDiscordBotBridge();

  // Auto-start OSC if configured
  useEffect(() => {
    const cfg = useOSCStore.getState().config;
    if (cfg.autoStart) {
      useOSCStore.getState().start().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const unregister = keyboardManager.registerAll([
      { key: '1', ctrl: true, shift: false, alt: false, description: 'Go to Dashboard', handler: () => navigate('/') },
      { key: '2', ctrl: true, shift: false, alt: false, description: 'Go to Friends', handler: () => navigate('/friends') },
      { key: '3', ctrl: true, shift: false, alt: false, description: 'Go to Worlds', handler: () => navigate('/worlds') },
      { key: '4', ctrl: true, shift: false, alt: false, description: 'Go to Avatars', handler: () => navigate('/avatars') },
      { key: 'f', ctrl: true, shift: false, alt: false, description: 'Focus Search', handler: () => navigate('/search') },
      { key: ',', ctrl: true, shift: false, alt: false, description: 'Open Settings', handler: () => navigate('/settings') },
      { key: 'a', ctrl: true, shift: true, alt: false, description: 'Quick Avatar Switch', handler: toggleSwitcher },
    ]);
    return unregister;
  }, [navigate, toggleSwitcher]);

  return (
    <>
    <HackerConsole />
    <AvatarSwitcher open={switcherOpen} onClose={closeSwitcher} />
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/friends" element={<Friends />} />
        <Route path="/friend-log" element={<FriendLog />} />
        <Route path="/worlds" element={<Worlds />} />
        <Route path="/avatars" element={<Avatars />} />
        <Route path="/groups" element={<Groups />} />
        <Route path="/favorites" element={<Favorites />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/game-log" element={<GameLog />} />
        <Route path="/screenshots" element={<Screenshots />} />
        <Route path="/activity" element={<ActivityHeatmap />} />
        <Route path="/friend-analytics" element={<FriendAnalytics />} />
        <Route path="/events" element={<EventPlanner />} />
<Route path="/avatar-editor" element={<AvatarEditor />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/osc" element={<OSCPage />} />
        <Route path="/instance-avatars" element={<InstanceAvatars />} />
        <Route path="/gallery" element={<Gallery />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
    </>
  );
}

export default function App() {
  const { isLoggedIn, isLoading, restoreSession } = useAuthStore();
  const { applyTheme } = useThemeStore();

  useEffect(() => {
    applyTheme();
    requestNotificationPermission();
    // Restore from persistent disk storage if localStorage is empty (crash recovery)
    Promise.all([
      restoreThemeFromDisk(),
      restoreSettingsFromDisk(),
      useDiscordBotStore.getState().restoreFromDisk(),
    ]).then(() => {
      const { settings } = useSettingsStore.getState();
      window.electronAPI?.setMinimizeToTray(settings.general.minimizeToTray);
      window.electronAPI?.setAlwaysOnTop(settings.general.alwaysOnTop);
    });
    restoreSession();

    // Background update check ~10s after launch so it doesn't compete with
    // login traffic. Result lands in updateStore and the banner picks it up.
    const t = setTimeout(() => { void checkForUpdatesOnStartup(); }, 10_000);
    return () => clearTimeout(t);
  }, []);

  // Re-apply theme after login so CSS custom properties are always in sync
  useEffect(() => {
    if (isLoggedIn) applyTheme();
  }, [isLoggedIn]);

  usePolling();

  if (isLoading && !isLoggedIn) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-surface-950 gap-4">
        <LoadingSpinner size="lg" />
        <p className="text-surface-400 text-sm">Restoring session...</p>
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <ErrorBoundary>
        <LoginPage />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <AppShell />
    </ErrorBoundary>
  );
}
