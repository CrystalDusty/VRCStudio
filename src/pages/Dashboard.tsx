import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Users,
  Globe,
  Activity,
  UserPlus,
  UserMinus,
  MapPin,
  CircleDot,
  UsersRound,
  Hourglass,
  Globe2,
  Wifi,
  WifiOff,
  TrendingUp,
  History,
  Send,
  RotateCcw,
  Thermometer,
  CloudRain,
  Sun,
  Cloud,
  Snowflake,
  Wind,
  Zap,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { useAuthStore } from '../stores/authStore';
import { useFriendStore } from '../stores/friendStore';
import { useFeedStore } from '../stores/feedStore';
import { useInstanceHistoryStore } from '../stores/instanceHistoryStore';
import { useSettingsStore } from '../stores/settingsStore';
import UserAvatar from '../components/common/UserAvatar';
import api from '../api/vrchat';
import type { FeedEvent, UserStatus } from '../types/vrchat';
import { getBestAvatarUrl } from '../utils/avatar';
import WorldAnalyticsPanel from '../components/WorldAnalyticsPanel';
import VideoPlayerWidget from '../components/VideoPlayerWidget';

const eventIcons: Record<FeedEvent['type'], typeof Activity> = {
  friend_online: UserPlus,
  friend_offline: UserMinus,
  friend_location: MapPin,
  friend_status: CircleDot,
  friend_avatar: CircleDot,
  friend_add: UserPlus,
  friend_remove: UserMinus,
  world_visit: Globe,
  group_update: UsersRound,
  instance_queue: Hourglass,
};

const eventColors: Record<FeedEvent['type'], string> = {
  friend_online: 'text-green-400 bg-green-500/10',
  friend_offline: 'text-surface-500 bg-surface-500/10',
  friend_location: 'text-blue-400 bg-blue-500/10',
  friend_status: 'text-amber-400 bg-amber-500/10',
  friend_avatar: 'text-purple-400 bg-purple-500/10',
  friend_add: 'text-green-400 bg-green-500/10',
  friend_remove: 'text-red-400 bg-red-500/10',
  world_visit: 'text-blue-400 bg-blue-500/10',
  group_update: 'text-purple-400 bg-purple-500/10',
  instance_queue: 'text-cyan-400 bg-cyan-500/10',
};

function eventMessage(event: FeedEvent): string {
  switch (event.type) {
    case 'friend_online': return 'came online';
    case 'friend_offline': return 'went offline';
    case 'friend_location': return event.details || 'changed location';
    case 'friend_status': return `changed status to ${event.newValue}`;
    case 'friend_avatar': return 'changed avatar';
    case 'friend_add': return 'was added as friend';
    case 'friend_remove': return 'was removed as friend';
    case 'world_visit': return `visited ${event.worldName}`;
    default: return '';
  }
}

const statusColors: Record<string, string> = {
  'join me': 'bg-status-joinme',
  'active': 'bg-status-online',
  'ask me': 'bg-status-askme',
  'busy': 'bg-status-busy',
};

export default function Dashboard() {
  const { user } = useAuthStore();
  const { onlineFriends, offlineFriends } = useFriendStore();
  const { events } = useFeedStore();
  const { history } = useInstanceHistoryStore();
  const [rejoining, setRejoining] = useState<string | null>(null);
  const [rejoined, setRejoined] = useState<Set<string>>(new Set());

  const handleRejoin = async (entryId: string, worldId: string, instanceId: string) => {
    setRejoining(entryId);
    try {
      await api.selfInvite(worldId, instanceId);
      setRejoined(prev => new Set(prev).add(entryId));
    } catch {}
    setRejoining(null);
  };

  const recentInstances = (() => {
    const seen = new Set<string>();
    const deduped = [];
    for (const inst of history) {
      const key = `${inst.worldId}:${inst.instanceId}`;
      if (!seen.has(key)) { seen.add(key); deduped.push(inst); }
      if (deduped.length >= 8) break;
    }
    return deduped;
  })();

  const friendAvatarMap = new Map<string, string>();
  for (const f of [...onlineFriends, ...offlineFriends]) {
    friendAvatarMap.set(f.id, getBestAvatarUrl(f));
  }

  const statusGroups: Record<string, typeof onlineFriends> = {
    'join me': [],
    'active': [],
    'ask me': [],
    'busy': [],
  };
  for (const f of onlineFriends) {
    if (statusGroups[f.status]) statusGroups[f.status].push(f);
  }

  // Global concurrent-player count. Refreshed slowly: it's a worldwide
  // figure, so a tight poll would be pure noise.
  const [onlineNow, setOnlineNow] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      api.getVisits()
        .then(n => { if (!cancelled && n > 0) setOnlineNow(n); })
        .catch(() => {});
    };
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const todayEvents = events.filter(e => Date.now() - e.timestamp < 86400000);

  const [feedFilter, setFeedFilter] = useState<'all' | 'worlds' | 'friends'>('all');
  const filteredEvents = useMemo(() => {
    if (feedFilter === 'worlds') return events.filter(e => e.type === 'friend_location' || e.type === 'world_visit');
    if (feedFilter === 'friends') return events.filter(e => e.type === 'friend_online' || e.type === 'friend_offline' || e.type === 'friend_status' || e.type === 'friend_avatar' || e.type === 'friend_add' || e.type === 'friend_remove');
    return events;
  }, [events, feedFilter]);
  const recentEvents = filteredEvents.slice(0, 40);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <DashboardGreeting />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Wifi} label="Online" value={onlineFriends.length} accent="text-green-400" bg="bg-green-500/10" detail={`of ${onlineFriends.length + offlineFriends.length} friends`} />
        <StatCard icon={Users} label="Total Friends" value={onlineFriends.length + offlineFriends.length} accent="text-blue-400" bg="bg-blue-500/10" />
        <StatCard icon={Globe} label="Join Me" value={statusGroups['join me'].length} accent="text-status-joinme" bg="bg-blue-500/10" />
        <StatCard icon={TrendingUp} label="Events Today" value={todayEvents.length} accent="text-amber-400" bg="bg-amber-500/10" />
        <StatCard
          icon={Globe2}
          label="VRChat Online"
          value={onlineNow === null ? '—' : onlineNow.toLocaleString()}
          accent="text-cyan-400"
          bg="bg-cyan-500/10"
          detail="players worldwide"
        />
      </div>

      <div className="glass-panel-solid p-4">
        <div className="flex items-center gap-6">
          {Object.entries(statusGroups).map(([status, friends]) => (
            <div key={status} className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${statusColors[status]}`} />
              <span className="text-xs text-surface-400 capitalize">{status}</span>
              <span className="text-xs font-semibold text-surface-200 tabular-nums">{friends.length}</span>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-status-offline" />
            <span className="text-xs text-surface-400">Offline</span>
            <span className="text-xs font-semibold text-surface-200 tabular-nums">{offlineFriends.length}</span>
          </div>
        </div>
      </div>

      {recentInstances.length > 0 && (
        <div className="glass-panel-solid overflow-hidden">
          <div className="px-4 py-3 border-b border-surface-800/40 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-surface-300 flex items-center gap-2"><History size={14} />Recent Instances</h2>
            <span className="text-xs text-surface-600">Rejoin private worlds</span>
          </div>
          <div className="divide-y divide-surface-800/30 max-h-64 overflow-y-auto">
            {recentInstances.map(inst => {
              const isRejoining = rejoining === inst.id;
              const hasRejoined = rejoined.has(inst.id);
              const isPrivate = inst.instanceType !== 'public';
              return (
                <div key={inst.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-800/30 transition-colors">
                  {inst.worldImage ? (
                    <img src={inst.worldImage} alt="" className="w-10 h-7 rounded object-cover flex-shrink-0 bg-surface-800" />
                  ) : (
                    <div className="w-10 h-7 rounded bg-surface-800 flex items-center justify-center flex-shrink-0"><Globe size={12} className="text-surface-600" /></div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium truncate text-surface-200">{inst.worldName}</div>
                    <div className="text-[11px] text-surface-500 flex items-center gap-1.5">
                      <span className={`capitalize ${isPrivate ? 'text-amber-400/70' : ''}`}>{inst.instanceType}</span>
                      <span>&middot;</span>
                      <span>{formatDistanceToNow(inst.joinedAt, { addSuffix: true })}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRejoin(inst.id, inst.worldId, inst.instanceId)}
                    disabled={isRejoining || hasRejoined}
                    className={`text-xs px-2.5 py-1 rounded-md flex items-center gap-1 flex-shrink-0 transition-colors ${
                      hasRejoined ? 'bg-green-500/15 text-green-400' : 'bg-accent-600/15 text-accent-400 hover:bg-accent-600/25'
                    }`}
                  >
                    {hasRejoined ? <>Sent!</> : isRejoining ? <>Joining...</> : <><RotateCcw size={11} /> Rejoin</>}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <VideoPlayerWidget />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 glass-panel-solid overflow-hidden">
          <div className="px-4 py-3 border-b border-surface-800/40 flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-sm font-semibold text-surface-300 flex items-center gap-2">
              <Activity size={14} />Activity Feed
              <span className="ml-1 inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-rose-500/15 text-rose-400">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />LIVE
              </span>
            </h2>
            <div className="flex items-center gap-1">
              {(['all', 'worlds', 'friends'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFeedFilter(f)}
                  className={`text-[10px] font-medium px-2 py-0.5 rounded-full uppercase tracking-wider transition-colors ${
                    feedFilter === f ? 'bg-accent-500/20 text-accent-300' : 'text-surface-500 hover:text-surface-300'
                  }`}
                >
                  {f}
                </button>
              ))}
              <span className="text-xs text-surface-600 ml-2">{todayEvents.length} today</span>
            </div>
          </div>
          {recentEvents.length === 0 ? (
            <p className="text-surface-500 text-sm py-12 text-center">
              {feedFilter === 'all'
                ? 'No activity yet. Events will appear as friends come online and move around.'
                : `No ${feedFilter} activity yet.`}
            </p>
          ) : (
            <div className="divide-y divide-surface-800/30 max-h-[520px] overflow-y-auto">
              {recentEvents.map(event => {
                const Icon = eventIcons[event.type] || Activity;
                const colorClasses = eventColors[event.type] || 'text-surface-400 bg-surface-500/10';
                const [textColor, bgColor] = colorClasses.split(' ');
                const isWorldEvent = event.type === 'friend_location' || event.type === 'world_visit';
                return (
                  <div key={event.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-800/30 transition-colors">
                    {isWorldEvent && event.worldImage ? (
                      <img src={event.worldImage} alt="" className="w-10 h-7 rounded object-cover flex-shrink-0 bg-surface-800" />
                    ) : (
                      <div className={`w-7 h-7 rounded-lg ${bgColor} flex items-center justify-center flex-shrink-0`}>
                        <Icon size={13} className={textColor} />
                      </div>
                    )}
                    {((event.userId && friendAvatarMap.get(event.userId)) || event.userAvatar) && (
                      <UserAvatar src={(event.userId && friendAvatarMap.get(event.userId)) || event.userAvatar || ''} size="sm" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] truncate">
                        <span className="font-medium text-surface-200">{event.userName}</span>{' '}
                        <span className="text-surface-500">{eventMessage(event)}</span>
                      </div>
                      {isWorldEvent && event.worldName && (
                        <div className="text-[10px] text-blue-400/70 truncate">in {event.worldName}</div>
                      )}
                    </div>
                    {isWorldEvent && event.worldId && event.instanceId && (
                      <a
                        href={`vrchat://launch?ref=vrcstudio&id=${event.worldId}:${event.instanceId}`}
                        title="Launch directly into this instance"
                        className="text-[10px] px-2 py-0.5 rounded-md bg-accent-600/15 text-accent-400 hover:bg-accent-600/25 flex-shrink-0 transition-colors"
                      >
                        Join
                      </a>
                    )}
                    <span className="text-[11px] text-surface-600 flex-shrink-0 tabular-nums">
                      {formatDistanceToNow(event.timestamp, { addSuffix: true })}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="glass-panel-solid overflow-hidden">
          <div className="px-4 py-3 border-b border-surface-800/40 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-surface-300 flex items-center gap-2"><Users size={14} />Online Now</h2>
            <span className="text-xs font-medium text-green-400 tabular-nums">{onlineFriends.length}</span>
          </div>
          {onlineFriends.length === 0 ? (
            <div className="py-12 text-center"><WifiOff size={24} className="mx-auto text-surface-700 mb-2" /><p className="text-surface-500 text-sm">No friends online</p></div>
          ) : (
            <div className="divide-y divide-surface-800/20 max-h-[520px] overflow-y-auto">
              {onlineFriends.slice(0, 40).map(friend => (
                <div key={friend.id} className="flex items-center gap-2.5 px-4 py-2 hover:bg-surface-800/30 transition-colors">
                  <UserAvatar src={getBestAvatarUrl(friend)} status={friend.status} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium truncate text-surface-200">{friend.displayName}</div>
                    <div className="text-[11px] text-surface-500 truncate">{friend.statusDescription || friend.status}</div>
                  </div>
                </div>
              ))}
              {onlineFriends.length > 40 && (
                <p className="text-xs text-surface-600 text-center py-2.5">+{onlineFriends.length - 40} more</p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="glass-panel-solid p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-surface-300 flex items-center gap-2"><Globe size={14} />World Activity</h2>
          <span className="text-xs text-surface-600">Auto-tracked</span>
        </div>
        <WorldAnalyticsPanel limit={8} />
      </div>
    </div>
  );
}

// ─── Weather helpers ────────────────────────────────────────────────────────────────

interface WeatherInfo {
  temp: number;
  condition: string;
  icon: 'sun' | 'cloud' | 'rain' | 'snow' | 'storm' | 'fog' | 'wind';
}

function wmoToWeather(code: number): Omit<WeatherInfo, 'temp'> {
  if (code === 0) return { condition: 'Clear sky', icon: 'sun' };
  if (code <= 3)  return { condition: 'Partly cloudy', icon: 'cloud' };
  if (code <= 48) return { condition: 'Foggy', icon: 'fog' };
  if (code <= 55) return { condition: 'Drizzle', icon: 'rain' };
  if (code <= 67) return { condition: 'Rainy', icon: 'rain' };
  if (code <= 77) return { condition: 'Snowy', icon: 'snow' };
  if (code <= 82) return { condition: 'Rain showers', icon: 'rain' };
  if (code <= 86) return { condition: 'Snow showers', icon: 'snow' };
  if (code <= 99) return { condition: 'Thunderstorm', icon: 'storm' };
  return { condition: 'Windy', icon: 'wind' };
}

const weatherIconMap: Record<WeatherInfo['icon'], typeof Sun> = {
  sun: Sun, cloud: Cloud, rain: CloudRain, snow: Snowflake, storm: Zap, fog: Wind, wind: Wind,
};

const weatherColorMap: Record<WeatherInfo['icon'], string> = {
  sun: 'text-amber-400', cloud: 'text-surface-400', rain: 'text-blue-400',
  snow: 'text-cyan-300', storm: 'text-yellow-300', fog: 'text-surface-500', wind: 'text-surface-400',
};

function getCasualGreeting(h: number, name: string): string {
  if (h >= 22 || h < 5) return `isn't it a little late to be jammin', ${name}?`;
  if (h >= 5 && h < 12) return `starting the day off with a bang! I like it, ${name}`;
  return `I like your style, ${name}`;
}

// ─── Dashboard Greeting component ─────────────────────────────────────────────

function DashboardGreeting() {
  const { user } = useAuthStore();
  const { settings } = useSettingsStore();
  const { onlineFriends } = useFriendStore();
  const { history } = useInstanceHistoryStore();

  const [now, setNow] = useState(() => new Date());
  const [weather, setWeather] = useState<WeatherInfo | null>(null);
  const [weatherFailed, setWeatherFailed] = useState(false);
  const [tickerIndex, setTickerIndex] = useState(0);
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const displayName = settings.profile.nickname.trim() || user?.displayName || 'Traveler';

  // Live clock — syncs to the next whole minute so it's never late
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval>;
    const msToNextMinute = 60_000 - (Date.now() % 60_000);
    const timeoutId = setTimeout(() => {
      setNow(new Date());
      intervalId = setInterval(() => setNow(new Date()), 60_000);
    }, msToNextMinute);
    return () => { clearTimeout(timeoutId); clearInterval(intervalId); };
  }, []);

  useEffect(() => {
    if (!settings.profile.showWeather || !settings.profile.greetingEnabled) return;
    if (!navigator.geolocation) { setWeatherFailed(true); return; }
    const timeout = setTimeout(() => setWeatherFailed(true), 8_000);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        clearTimeout(timeout);
        try {
          const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.latitude.toFixed(4)}&longitude=${coords.longitude.toFixed(4)}&current=temperature_2m,weather_code&timezone=auto`;
          const res = await fetch(url);
          if (!res.ok) { setWeatherFailed(true); return; }
          const data = await res.json();
          setWeather({ temp: Math.round(data.current.temperature_2m), ...wmoToWeather(data.current.weather_code) });
        } catch { setWeatherFailed(true); }
      },
      () => { clearTimeout(timeout); setWeatherFailed(true); },
      { timeout: 6000 }
    );
    return () => clearTimeout(timeout);
  }, [settings.profile.showWeather, settings.profile.greetingEnabled]);

  const joinMeFriends = useMemo(() => onlineFriends.filter(f => f.status === 'join me'), [onlineFriends]);

  const tickerMessages = useMemo(() => {
    const h = now.getHours();
    const msgs: Array<{ text: string; sub?: string }> = [];

    if (h >= 0 && h < 5) msgs.push({ text: 'Late night session?', sub: format(now, 'h:mm a · EEEE, MMMM d') });
    else if (h < 9)  msgs.push({ text: 'Early start today', sub: format(now, 'h:mm a · EEEE, MMMM d') });
    else if (h < 12) msgs.push({ text: 'Good morning', sub: format(now, 'h:mm a · EEEE, MMMM d') });
    else if (h < 14) msgs.push({ text: 'Midday', sub: format(now, 'h:mm a · EEEE, MMMM d') });
    else if (h < 18) msgs.push({ text: 'Good afternoon', sub: format(now, 'h:mm a · EEEE, MMMM d') });
    else if (h < 22) msgs.push({ text: 'Good evening', sub: format(now, 'h:mm a · EEEE, MMMM d') });
    else msgs.push({ text: 'Good night', sub: format(now, 'h:mm a · EEEE, MMMM d') });

    const n = onlineFriends.length;
    if (n === 0) msgs.push({ text: 'All quiet right now', sub: 'Everyone seems to be offline — good time to explore' });
    else if (n === 1) msgs.push({ text: `Just ${onlineFriends[0].displayName} is online`, sub: 'You two have the place to yourselves' });
    else if (n <= 5) msgs.push({ text: `${n} friends online right now`, sub: `${onlineFriends[0].displayName} among them` });
    else if (n <= 15) msgs.push({ text: `${n} friends online — good turnout`, sub: `${onlineFriends[0].displayName} and ${n - 1} others` });
    else msgs.push({ text: `${n} friends online — the crew's all here`, sub: `${onlineFriends[0].displayName} and ${n - 1} others are on` });

    if (joinMeFriends.length === 1) msgs.push({ text: `${joinMeFriends[0].displayName} has their doors open`, sub: "They're on Join Me — hop in any time" });
    else if (joinMeFriends.length > 1) {
      const names = joinMeFriends.slice(0, 2).map(f => f.displayName).join(' & ');
      msgs.push({ text: `${joinMeFriends.length} friends are inviting you`, sub: joinMeFriends.length > 2 ? `${names} and ${joinMeFriends.length - 2} more` : names });
    }

    if (history.length > 0) {
      const last = history[0];
      const worldLabel = last.worldName && !last.worldName.startsWith('wrld_') ? last.worldName : 'a world';
      const recent = last.leftAt && (Date.now() - last.leftAt) < 2 * 60 * 60 * 1000;
      if (recent) msgs.push({ text: `You just left ${worldLabel}`, sub: `Spent ${Math.round((last.leftAt! - last.joinedAt) / 60000)}m there` });
    }

    if (weather) {
      const { temp, condition, icon } = weather;
      let commentary = '';
      if (icon === 'rain') commentary = 'Perfect weather to stay in VRChat';
      else if (icon === 'snow') commentary = 'Snowing outside — cosy in here though';
      else if (icon === 'storm') commentary = "Stay safe out there — you're better off in here";
      else if (icon === 'cloud') commentary = `${temp}°C and overcast outside`;
      else if (temp <= 5) commentary = `${temp}°C — quite cold out there`;
      else if (temp >= 28) commentary = `${temp}°C outside — peak VRChat weather`;
      else commentary = `${temp}°C outside right now`;
      msgs.push({ text: condition, sub: commentary });
    }

    return msgs;
  }, [now, onlineFriends, joinMeFriends, weather, history]);

  useEffect(() => {
    if (tickerRef.current) clearInterval(tickerRef.current);
    if (tickerMessages.length <= 1) return;
    tickerRef.current = setInterval(() => setTickerIndex(i => (i + 1) % tickerMessages.length), 8_000);
    return () => { if (tickerRef.current) clearInterval(tickerRef.current); };
  }, [tickerMessages.length]);

  const safeTicker = tickerIndex % Math.max(tickerMessages.length, 1);
  const currentTicker = tickerMessages[safeTicker] ?? tickerMessages[0];

  if (!settings.profile.greetingEnabled) {
    return (
      <div>
        <h1 className="text-xl font-semibold text-surface-100">Welcome back, <span className="text-gradient">{displayName}</span></h1>
        <p className="text-surface-500 text-sm mt-0.5">Here's what's happening in your VRChat world</p>
      </div>
    );
  }

  const WeatherIcon = weather ? weatherIconMap[weather.icon] : Thermometer;
  const weatherColor = weather ? weatherColorMap[weather.icon] : 'text-surface-500';
  const hour = now.getHours();

  return (
    <div className="flex items-start justify-between gap-6 w-full">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-surface-100">
          <span className="text-gradient">{getCasualGreeting(hour, displayName)}</span>
        </h1>
        <div className="mt-1.5 h-9 overflow-hidden">
          <div key={safeTicker} className="animate-fade-in">
            <p className="text-sm text-surface-300 leading-tight">{currentTicker?.text}</p>
            {currentTicker?.sub && <p className="text-xs text-surface-500 mt-0.5 leading-tight">{currentTicker.sub}</p>}
          </div>
        </div>
        {tickerMessages.length > 1 && (
          <div className="flex items-center gap-1 mt-1">
            {tickerMessages.map((_, i) => (
              <button key={i} onClick={() => setTickerIndex(i)}
                className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
                  i === safeTicker ? 'bg-accent-400 w-3' : 'bg-surface-700 hover:bg-surface-600'
                }`}
              />
            ))}
          </div>
        )}
      </div>
      {settings.profile.showWeather && weather && (
        <div className="flex-shrink-0 glass-panel px-3 py-2 flex items-center gap-2 text-sm">
          <WeatherIcon size={16} className={weatherColor} />
          <div className="text-right">
            <div className="text-surface-200 font-medium tabular-nums">{weather.temp}°C</div>
            <div className="text-xs text-surface-500">{weather.condition}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, accent, bg, detail }: {
  icon: typeof Activity; label: string;
  /** Formatted counts (e.g. "12,480") arrive as strings. */
  value: number | string;
  accent: string; bg: string; detail?: string;
}) {
  return (
    <div className="stat-card">
      <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center ${accent} flex-shrink-0`}>
        <Icon size={18} />
      </div>
      <div>
        <div className="text-2xl font-bold text-surface-100 tabular-nums">{value}</div>
        <div className="text-xs text-surface-500">{label}</div>
        {detail && <div className="text-[10px] text-surface-600 mt-0.5">{detail}</div>}
      </div>
    </div>
  );
}
