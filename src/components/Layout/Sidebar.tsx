import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Globe,
  Shirt,
  Star,
  Settings,
  LogOut,
  Bell,
  Search,
  History,
  UsersRound,
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useFriendStore } from '../../stores/friendStore';
import StatusPresetPanel from '../StatusPresetPanel';
import api from '../../api/vrchat';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/search', icon: Search, label: 'Search' },
  { to: '/friends', icon: Users, label: 'Friends' },
  { to: '/friend-log', icon: History, label: 'Friend Log' },
  { to: '/worlds', icon: Globe, label: 'Worlds' },
  { to: '/avatars', icon: Shirt, label: 'Avatars' },
  { to: '/groups', icon: UsersRound, label: 'Groups' },
  { to: '/favorites', icon: Star, label: 'Favorites' },
  { to: '/notifications', icon: Bell, label: 'Notifications' },
];

export default function Sidebar() {
  const { user, logout, refreshUser } = useAuthStore();
  const { onlineFriends } = useFriendStore();

  const avatarUrl = user?.profilePicOverride || user?.currentAvatarThumbnailImageUrl;

  const statusColorMap: Record<string, string> = {
    'join me': 'bg-status-joinme',
    'active': 'bg-status-online',
    'ask me': 'bg-status-askme',
    'busy': 'bg-status-busy',
    'offline': 'bg-status-offline',
  };

  const handleApplyPreset = async (status: string, statusDescription: string) => {
    try {
      await fetch(
        `https://api.vrchat.cloud/api/1/users/${user?.id}?apiKey=JlE5Jldo5Jibn0215Oi0JXqlu4w`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'VRCStudio/1.0.0',
            'Cookie': `auth=${api.getAuthCookies().auth}${api.getAuthCookies().twoFactorAuth ? `; twoFactorAuth=${api.getAuthCookies().twoFactorAuth}` : ''}`,
          },
          body: JSON.stringify({ status, statusDescription }),
        }
      );
      refreshUser();
    } catch {}
  };

  return (
    <aside className="w-60 bg-surface-900/50 border-r border-surface-800/50 flex flex-col h-full">
      {/* User profile summary */}
      <div className="p-4 border-b border-surface-800/50">
        <div className="flex items-center gap-3">
          <div className="relative">
            <img
              src={avatarUrl}
              alt=""
              className="w-10 h-10 rounded-full object-cover bg-surface-800"
              onError={(e) => {
                (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect fill="%231e293b" width="40" height="40" rx="20"/></svg>';
              }}
            />
            <div className={`absolute -bottom-0.5 -right-0.5 status-dot ${statusColorMap[user?.status || 'offline']}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold truncate">{user?.displayName}</div>
            <div className="text-xs text-surface-400 truncate">
              {user?.statusDescription || user?.status}
            </div>
          </div>
        </div>
      </div>

      {/* Status Presets */}
      <div className="px-3 py-3 border-b border-surface-800/50">
        <StatusPresetPanel onApply={handleApplyPreset} />
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `sidebar-link ${isActive ? 'active' : ''}`
            }
            end={to === '/'}
          >
            <Icon size={18} />
            <span>{label}</span>
            {label === 'Friends' && onlineFriends.length > 0 && (
              <span className="ml-auto text-xs bg-accent-600/20 text-accent-400 px-1.5 py-0.5 rounded-full">
                {onlineFriends.length}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Bottom actions */}
      <div className="p-2 border-t border-surface-800/50 space-y-0.5">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `sidebar-link ${isActive ? 'active' : ''}`
          }
        >
          <Settings size={18} />
          <span>Settings</span>
        </NavLink>
        <button onClick={logout} className="sidebar-link w-full text-red-400 hover:text-red-300">
          <LogOut size={18} />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
}
