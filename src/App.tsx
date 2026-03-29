import { useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { useThemeStore } from './stores/themeStore';
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
import LoadingSpinner from './components/common/LoadingSpinner';

function AppShell() {
  const navigate = useNavigate();
  useDiscordRPC();

  useEffect(() => {
    // Global keyboard shortcuts
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
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  const { isLoggedIn, isLoading, restoreSession } = useAuthStore();
  const { applyTheme } = useThemeStore();

  // Apply saved theme on mount
  useEffect(() => {
    applyTheme();
    requestNotificationPermission();
    restoreSession();
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
    return <LoginPage />;
  }

  return <AppShell />;
}
