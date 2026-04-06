import { useEffect, Component, ErrorInfo, ReactNode } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { useThemeStore } from './stores/themeStore';
import { useSettingsStore } from './stores/settingsStore';
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
import StatisticsInsights from './pages/StatisticsInsights';
import AvatarEditor from './pages/AvatarEditor';
import LoadingSpinner from './components/common/LoadingSpinner';

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
  useDiscordRPC();

  useEffect(() => {
    const unregister = keyboardManager.registerAll([
      { key: '1', ctrl: true, shift: false, alt: false, description: 'Go to Dashboard', handler: () => navigate('/') },
      { key: '2', ctrl: true, shift: false, alt: false, description: 'Go to Friends', handler: () => navigate('/friends') },
      { key: '3', ctrl: true, shift: false, alt: false, description: 'Go to Worlds', handler: () => navigate('/worlds') },
      { key: '4', ctrl: true, shift: false, alt: false, description: 'Go to Avatars', handler: () => navigate('/avatars') },
      { key: 'f', ctrl: true, shift: false, alt: false, description: 'Focus Search', handler: () => navigate('/search') },
      { key: ',', ctrl: true, shift: false, alt: false, description: 'Open Settings', handler: () => navigate('/settings') },
    ]);
    return unregister;
  }, [navigate]);

  return (
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
        <Route path="/statistics" element={<StatisticsInsights />} />
        <Route path="/avatar-editor" element={<AvatarEditor />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  const { isLoggedIn, isLoading, restoreSession } = useAuthStore();
  const { applyTheme } = useThemeStore();

  useEffect(() => {
    applyTheme();
    requestNotificationPermission();
    restoreSession();
    // Sync minimizeToTray setting to Electron main process
    const { settings } = useSettingsStore.getState();
    window.electronAPI?.setMinimizeToTray(settings.general.minimizeToTray);
  }, []);

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
