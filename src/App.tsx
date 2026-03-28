import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { usePolling } from './hooks/usePolling';
import AppLayout from './components/Layout/AppLayout';
import LoginPage from './pages/Login';
import Dashboard from './pages/Dashboard';
import Friends from './pages/Friends';
import Worlds from './pages/Worlds';
import Avatars from './pages/Avatars';
import Favorites from './pages/Favorites';
import Notifications from './pages/Notifications';
import Settings from './pages/Settings';
import LoadingSpinner from './components/common/LoadingSpinner';

export default function App() {
  const { isLoggedIn, isLoading, restoreSession } = useAuthStore();

  useEffect(() => {
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

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/friends" element={<Friends />} />
        <Route path="/worlds" element={<Worlds />} />
        <Route path="/avatars" element={<Avatars />} />
        <Route path="/favorites" element={<Favorites />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
