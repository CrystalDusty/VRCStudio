import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Users, Globe, Shirt, Star, Settings,
  LogOut, Bell, Search, History, UsersRound, FileText, Camera,
  ChevronDown, Flame, BarChart3, CalendarPlus, TrendingUp, Crown,
} from 'lucide-react';
import { useState } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { useFriendStore } from '../../stores/friendStore';
import { useThemeStore } from '../../stores/themeStore';
import StatusPresetPanel from '../StatusPresetPanel';
import api from '../../api/vrchat';
import { getBestAvatarUrl } from '../../utils/avatar';
import { isVrcPlus } from '../../utils/vrcPlus';

const mainNavItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/search', icon: Search, label: 'Search' },
  { to: '/friends', icon: Users, label: 'Friends', badge: 'friends' as const },
  { to: '/friend-log', icon: History, label: 'Friend Log' },
];

const browseNavItems = [
  { to: '/worlds', icon: Globe, label: 'Worlds' },
  { to: '/avatars', icon: Shirt, label: 'Avatars' },
  { to: '/groups', icon: UsersRound, label: 'Groups' },
  { to: '/favorites', icon: Star, label: 'Favorites' },
  { to: '/notifications', icon: Bell, label: 'Notifications' },
];

const toolsNavItems = [
  { to: '/activity', icon: Flame, label: 'Activity Map' },
  { to: '/friend-analytics', icon: BarChart3, label: 'Analytics' },
  { to: '/statistics', icon: TrendingUp, label: 'Statistics' },
  { to: '/events', icon: CalendarPlus, label: 'Events' },
  { to: '/game-log', icon: FileText, label: 'Game Log' },
  { to: '/screenshots', icon: Camera, label: 'Screenshots' },
];

const statusDotColors: Record<string, string> = {
  'join me': 'bg-status-joinme',
  'active': 'bg-status-online',
  'ask me': 'bg-status-askme',
  'busy': 'bg-status-busy',
  'offline': 'bg-status-offline',
};

const statusLabels: Record<string, string> = {
  'join me': 'Join Me',
  'active': 'Online',
  'ask me': 'Ask Me',
  'busy': 'Do Not Disturb',
  'offline': 'Offline',
};

export default function Sidebar() {
  const { user, logout, refreshUser } = useAuthStore();
  const { onlineFriends } = useFriendStore();
  const { theme } = useThemeStore();
  const [showPresets, setShowPresets] = useState(false);

  const avatarUrl = user ? getBestAvatarUrl(user) : '';

  const handleApplyPreset = async (status: string, statusDescription: string) => {
    if (!user?.id) return;
    try {
      await api.updateStatus(user.id, status, statusDescription);
      await refreshUser();
    } catch {}
  };

  const sidebarW = theme.sidebarWidth === 'compact' ? 'w-52' : theme.sidebarWidth === 'wide' ? 'w-72' : 'w-60';

  const renderNavItem = ({ to, icon: Icon, label, badge }: {
    to: string; icon: typeof LayoutDashboard; label: string; badge?: 'friends';
  }) => (
    <NavLink
      key={to}
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `sidebar-link group ${isActive ? 'active' : ''}`
      }
    >
      <Icon size={16} strokeWidth={1.8} />
      <span className="truncate flex-1">{label}</span>
      {badge === 'friends' && onlineFriends.length > 0 && (
        <span className="text-[10px] bg-green-500/15 text-green-400 px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0 tabular-nums">
          {onlineFriends.length}
        </span>
      )}
    </NavLink>
  );

  return (
    <aside className={`${sidebarW} bg-surface-900/60 border-r border-surface-800/40 flex flex-col h-full transition-all`}>
      {/* User card */}
      <div className="p-3">
        <div
          className="flex items-center gap-3 p-2.5 rounded-xl bg-surface-800/40 hover:bg-surface-800/60 cursor-pointer transition-colors"
          onClick={() => setShowPresets(!showPresets)}
        >
          <div className="relative flex-shrink-0">
            <img
              src={avatarUrl}
              alt=""
              className="w-9 h-9 rounded-lg object-cover bg-surface-800"
              onError={e => {
                (e.target as HTMLImageElement).src =
                  'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect fill="%231e293b" width="40" height="40" rx="8"/></svg>';
              }}
            />
            <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-surface-900 ${statusDotColors[user?.status || 'offline']}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-sm font-semibold truncate text-surface-100">{user?.displayName}</span>
              {isVrcPlus(user) && (
                <Crown size={12} className="text-amber-400 flex-shrink-0" title="VRC+ Member" />
              )}
            </div>
            <div className="text-[11px] text-surface-500 truncate">
              {statusLabels[user?.status || 'offline']}
            </div>
          </div>
          <ChevronDown size={14} className={`text-surface-500 transition-transform ${showPresets ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {/* Status presets dropdown */}
      {showPresets && (
        <div className="px-3 pb-3 border-b border-surface-800/40 animate-fade-in">
          <StatusPresetPanel onApply={handleApplyPreset} />
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-4">
        <div className="space-y-0.5">
          {mainNavItems.map(renderNavItem)}
        </div>

        <div>
          <div className="px-3 py-1.5 text-[10px] font-semibold text-surface-600 uppercase tracking-widest">
            Browse
          </div>
          <div className="space-y-0.5">
            {browseNavItems.map(renderNavItem)}
          </div>
        </div>

        <div>
          <div className="px-3 py-1.5 text-[10px] font-semibold text-surface-600 uppercase tracking-widest">
            Tools
          </div>
          <div className="space-y-0.5">
            {toolsNavItems.map(renderNavItem)}
          </div>
        </div>
      </nav>

      {/* Bottom */}
      <div className="p-2 border-t border-surface-800/40 space-y-0.5">
        <NavLink
          to="/settings"
          className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
        >
          <Settings size={16} strokeWidth={1.8} />
          <span>Settings</span>
        </NavLink>
        <button onClick={logout} className="sidebar-link w-full text-red-400/80 hover:text-red-300 hover:bg-red-500/8">
          <LogOut size={16} strokeWidth={1.8} />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
}
