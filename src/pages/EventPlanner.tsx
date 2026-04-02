import { useState, useEffect, useMemo } from 'react';
import {
  CalendarPlus, Clock, MapPin, Users, Trash2, Edit3, Check, X,
  Bell, Globe, Send, ChevronDown, Plus,
} from 'lucide-react';
import { format, formatDistanceToNow, isPast, isFuture, addHours } from 'date-fns';
import api from '../api/vrchat';
import EmptyState from '../components/common/EmptyState';

export interface VRCEvent {
  id: string;
  title: string;
  description: string;
  worldId?: string;
  worldName?: string;
  instanceId?: string;
  date: number; // timestamp
  duration: number; // minutes
  invitees: string[]; // user IDs
  inviteeNames: string[];
  remindBefore: number; // minutes before
  color: string;
  createdAt: number;
}

const STORAGE_KEY = 'vrcstudio_events';
const COLORS = [
  { name: 'Blue', value: 'bg-blue-500/20 border-blue-500/40 text-blue-300', accent: 'bg-blue-500' },
  { name: 'Purple', value: 'bg-purple-500/20 border-purple-500/40 text-purple-300', accent: 'bg-purple-500' },
  { name: 'Green', value: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300', accent: 'bg-emerald-500' },
  { name: 'Amber', value: 'bg-amber-500/20 border-amber-500/40 text-amber-300', accent: 'bg-amber-500' },
  { name: 'Red', value: 'bg-red-500/20 border-red-500/40 text-red-300', accent: 'bg-red-500' },
  { name: 'Pink', value: 'bg-pink-500/20 border-pink-500/40 text-pink-300', accent: 'bg-pink-500' },
];

function loadEvents(): VRCEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveEvents(events: VRCEvent[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
}

function CountdownTimer({ targetDate }: { targetDate: number }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const diff = targetDate - now;
  if (diff <= 0) return <span className="text-green-400 font-semibold">Started!</span>;

  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);

  return (
    <div className="flex items-center gap-1.5 tabular-nums">
      {days > 0 && (
        <div className="glass-panel px-2 py-1 text-center">
          <div className="text-sm font-bold text-surface-100">{days}</div>
          <div className="text-[9px] text-surface-500">days</div>
        </div>
      )}
      <div className="glass-panel px-2 py-1 text-center">
        <div className="text-sm font-bold text-surface-100">{String(hours).padStart(2, '0')}</div>
        <div className="text-[9px] text-surface-500">hrs</div>
      </div>
      <span className="text-surface-600 text-xs">:</span>
      <div className="glass-panel px-2 py-1 text-center">
        <div className="text-sm font-bold text-surface-100">{String(minutes).padStart(2, '0')}</div>
        <div className="text-[9px] text-surface-500">min</div>
      </div>
      <span className="text-surface-600 text-xs">:</span>
      <div className="glass-panel px-2 py-1 text-center">
        <div className="text-sm font-bold text-accent-400">{String(seconds).padStart(2, '0')}</div>
        <div className="text-[9px] text-surface-500">sec</div>
      </div>
    </div>
  );
}

export default function EventPlannerPage() {
  const [events, setEvents] = useState<VRCEvent[]>(loadEvents());
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [worldName, setWorldName] = useState('');
  const [worldId, setWorldId] = useState('');
  const [dateStr, setDateStr] = useState('');
  const [timeStr, setTimeStr] = useState('');
  const [duration, setDuration] = useState(60);
  const [inviteeInput, setInviteeInput] = useState('');
  const [inviteeNames, setInviteeNames] = useState<string[]>([]);
  const [remindBefore, setRemindBefore] = useState(15);
  const [colorIndex, setColorIndex] = useState(0);

  // Reminder notification system
  useEffect(() => {
    const checkReminders = () => {
      const now = Date.now();
      for (const evt of events) {
        if (isPast(evt.date)) continue;
        const reminderTime = evt.date - evt.remindBefore * 60 * 1000;
        if (now >= reminderTime && now < reminderTime + 60000) {
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(`VRC Studio: ${evt.title}`, {
              body: `Starting ${formatDistanceToNow(evt.date, { addSuffix: true })}${evt.worldName ? ` in ${evt.worldName}` : ''}`,
              icon: '/icon.png',
            });
          }
        }
      }
    };
    const interval = setInterval(checkReminders, 30000);
    return () => clearInterval(interval);
  }, [events]);

  const upcomingEvents = useMemo(
    () => events.filter(e => isFuture(e.date)).sort((a, b) => a.date - b.date),
    [events]
  );

  const pastEvents = useMemo(
    () => events.filter(e => isPast(e.date)).sort((a, b) => b.date - a.date),
    [events]
  );

  const nextEvent = upcomingEvents[0];

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setWorldName('');
    setWorldId('');
    const defaultDate = addHours(new Date(), 1);
    setDateStr(format(defaultDate, 'yyyy-MM-dd'));
    setTimeStr(format(defaultDate, 'HH:mm'));
    setDuration(60);
    setInviteeInput('');
    setInviteeNames([]);
    setRemindBefore(15);
    setColorIndex(0);
  };

  const openCreate = () => {
    resetForm();
    setEditingId(null);
    setIsCreating(true);
  };

  const openEdit = (evt: VRCEvent) => {
    setTitle(evt.title);
    setDescription(evt.description);
    setWorldName(evt.worldName || '');
    setWorldId(evt.worldId || '');
    setDateStr(format(evt.date, 'yyyy-MM-dd'));
    setTimeStr(format(evt.date, 'HH:mm'));
    setDuration(evt.duration);
    setInviteeNames(evt.inviteeNames);
    setRemindBefore(evt.remindBefore);
    setColorIndex(COLORS.findIndex(c => c.value === evt.color) || 0);
    setEditingId(evt.id);
    setIsCreating(true);
  };

  const saveEvent = () => {
    if (!title.trim() || !dateStr || !timeStr) return;

    const dateTime = new Date(`${dateStr}T${timeStr}`).getTime();
    const evt: VRCEvent = {
      id: editingId || `evt_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      title: title.trim(),
      description: description.trim(),
      worldId: worldId.trim() || undefined,
      worldName: worldName.trim() || undefined,
      instanceId: undefined,
      date: dateTime,
      duration,
      invitees: [],
      inviteeNames,
      remindBefore,
      color: COLORS[colorIndex].value,
      createdAt: editingId ? events.find(e => e.id === editingId)?.createdAt || Date.now() : Date.now(),
    };

    let updated: VRCEvent[];
    if (editingId) {
      updated = events.map(e => e.id === editingId ? evt : e);
    } else {
      updated = [evt, ...events];
    }

    setEvents(updated);
    saveEvents(updated);
    setIsCreating(false);
    setEditingId(null);
  };

  const deleteEvent = (id: string) => {
    const updated = events.filter(e => e.id !== id);
    setEvents(updated);
    saveEvents(updated);
  };

  const addInvitee = () => {
    const name = inviteeInput.trim();
    if (name && !inviteeNames.includes(name)) {
      setInviteeNames(prev => [...prev, name]);
    }
    setInviteeInput('');
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarPlus size={24} className="text-accent-400" /> Event Planner
          </h1>
          <p className="text-sm text-surface-400 mt-0.5">
            Schedule VRChat meetups and get reminders
          </p>
        </div>
        <button onClick={openCreate} className="btn-primary text-sm flex items-center gap-1.5">
          <Plus size={14} /> New Event
        </button>
      </div>

      {/* Next event countdown */}
      {nextEvent && (
        <div className={`glass-panel-solid p-5 border ${nextEvent.color}`}>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex-1 min-w-0">
              <div className="text-xs text-surface-500 uppercase tracking-wider mb-1">Next Event</div>
              <h2 className="text-lg font-bold">{nextEvent.title}</h2>
              <div className="flex items-center gap-3 mt-1 text-xs text-surface-400">
                <span className="flex items-center gap-1">
                  <Clock size={11} /> {format(nextEvent.date, 'MMM d, yyyy · h:mm a')}
                </span>
                {nextEvent.worldName && (
                  <span className="flex items-center gap-1">
                    <Globe size={11} /> {nextEvent.worldName}
                  </span>
                )}
                {nextEvent.inviteeNames.length > 0 && (
                  <span className="flex items-center gap-1">
                    <Users size={11} /> {nextEvent.inviteeNames.length} invited
                  </span>
                )}
              </div>
            </div>
            <CountdownTimer targetDate={nextEvent.date} />
          </div>
        </div>
      )}

      {/* Create / Edit Form */}
      {isCreating && (
        <div className="glass-panel-solid p-5 space-y-4 border border-accent-500/20">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">{editingId ? 'Edit Event' : 'Create Event'}</h3>
            <button onClick={() => setIsCreating(false)} className="btn-ghost p-1"><X size={14} /></button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="text-xs text-surface-500 block mb-1">Title *</label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g., Movie Night, Club Meetup..."
                className="input-field text-sm"
                autoFocus
              />
            </div>

            <div className="sm:col-span-2">
              <label className="text-xs text-surface-500 block mb-1">Description</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="What's the plan?"
                className="input-field text-sm h-16 resize-none"
              />
            </div>

            <div>
              <label className="text-xs text-surface-500 block mb-1">Date *</label>
              <input
                type="date"
                value={dateStr}
                onChange={e => setDateStr(e.target.value)}
                className="input-field text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-surface-500 block mb-1">Time *</label>
              <input
                type="time"
                value={timeStr}
                onChange={e => setTimeStr(e.target.value)}
                className="input-field text-sm"
              />
            </div>

            <div>
              <label className="text-xs text-surface-500 block mb-1">Duration (minutes)</label>
              <select
                value={duration}
                onChange={e => setDuration(Number(e.target.value))}
                className="input-field text-sm"
              >
                <option value={30}>30 min</option>
                <option value={60}>1 hour</option>
                <option value={90}>1.5 hours</option>
                <option value={120}>2 hours</option>
                <option value={180}>3 hours</option>
                <option value={240}>4 hours</option>
                <option value={360}>6 hours</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-surface-500 block mb-1">Remind Before</label>
              <select
                value={remindBefore}
                onChange={e => setRemindBefore(Number(e.target.value))}
                className="input-field text-sm"
              >
                <option value={5}>5 minutes</option>
                <option value={15}>15 minutes</option>
                <option value={30}>30 minutes</option>
                <option value={60}>1 hour</option>
                <option value={1440}>1 day</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-surface-500 block mb-1">World Name</label>
              <input
                type="text"
                value={worldName}
                onChange={e => setWorldName(e.target.value)}
                placeholder="e.g., The Great Pug"
                className="input-field text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-surface-500 block mb-1">World ID (optional)</label>
              <input
                type="text"
                value={worldId}
                onChange={e => setWorldId(e.target.value)}
                placeholder="wrld_..."
                className="input-field text-sm font-mono"
              />
            </div>

            {/* Invitees */}
            <div className="sm:col-span-2">
              <label className="text-xs text-surface-500 block mb-1">Invitees</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={inviteeInput}
                  onChange={e => setInviteeInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addInvitee(); } }}
                  placeholder="Type a name and press Enter"
                  className="input-field text-sm flex-1"
                />
                <button onClick={addInvitee} className="btn-secondary text-xs">Add</button>
              </div>
              {inviteeNames.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {inviteeNames.map(name => (
                    <span key={name} className="badge bg-accent-600/20 text-accent-400 flex items-center gap-1">
                      {name}
                      <button onClick={() => setInviteeNames(prev => prev.filter(n => n !== name))}>
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Color */}
            <div className="sm:col-span-2">
              <label className="text-xs text-surface-500 block mb-1">Color</label>
              <div className="flex gap-2">
                {COLORS.map((c, i) => (
                  <button
                    key={i}
                    onClick={() => setColorIndex(i)}
                    className={`w-7 h-7 rounded-full ${c.accent} ${
                      colorIndex === i ? 'ring-2 ring-white ring-offset-2 ring-offset-surface-900' : 'opacity-60 hover:opacity-100'
                    } transition-all`}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-2 border-t border-surface-800">
            <button onClick={() => setIsCreating(false)} className="btn-secondary text-sm">Cancel</button>
            <button onClick={saveEvent} disabled={!title.trim() || !dateStr || !timeStr} className="btn-primary text-sm">
              {editingId ? 'Save Changes' : 'Create Event'}
            </button>
          </div>
        </div>
      )}

      {/* Upcoming Events */}
      {upcomingEvents.length === 0 && pastEvents.length === 0 && !isCreating ? (
        <EmptyState
          icon={CalendarPlus}
          title="No events planned"
          description="Create your first VRChat meetup event"
        />
      ) : (
        <div className="space-y-2">
          {upcomingEvents.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-surface-500 uppercase tracking-wider px-1">
                Upcoming ({upcomingEvents.length})
              </h3>
              {upcomingEvents.map(evt => (
                <EventCard
                  key={evt.id}
                  event={evt}
                  onEdit={() => openEdit(evt)}
                  onDelete={() => deleteEvent(evt.id)}
                />
              ))}
            </div>
          )}

          {pastEvents.length > 0 && (
            <div className="space-y-2 mt-4">
              <button
                onClick={() => setShowPast(!showPast)}
                className="flex items-center gap-1.5 text-xs font-semibold text-surface-500 uppercase tracking-wider px-1 hover:text-surface-300 transition-colors"
              >
                <ChevronDown size={12} className={`transition-transform ${showPast ? 'rotate-180' : ''}`} />
                Past Events ({pastEvents.length})
              </button>
              {showPast && pastEvents.map(evt => (
                <EventCard
                  key={evt.id}
                  event={evt}
                  isPast
                  onEdit={() => openEdit(evt)}
                  onDelete={() => deleteEvent(evt.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EventCard({
  event, isPast, onEdit, onDelete,
}: {
  event: VRCEvent; isPast?: boolean; onEdit: () => void; onDelete: () => void;
}) {
  const [inviting, setInviting] = useState(false);

  const handleSelfInvite = async () => {
    if (!event.worldId) return;
    setInviting(true);
    try {
      // If we have an instanceId, use it. Otherwise try the world
      const instanceId = event.instanceId || '0';
      await api.selfInvite(event.worldId, instanceId);
    } catch {}
    setInviting(false);
  };

  return (
    <div className={`glass-panel-solid p-4 border ${event.color} ${isPast ? 'opacity-50' : ''}`}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm">{event.title}</h3>
          {event.description && (
            <p className="text-xs text-surface-400 mt-0.5">{event.description}</p>
          )}
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <span className="flex items-center gap-1 text-xs text-surface-400">
              <Clock size={11} /> {format(event.date, 'MMM d · h:mm a')}
            </span>
            <span className="text-xs text-surface-500">{event.duration} min</span>
            {event.worldName && (
              <span className="flex items-center gap-1 text-xs text-surface-400">
                <Globe size={11} /> {event.worldName}
              </span>
            )}
            {event.inviteeNames.length > 0 && (
              <span className="flex items-center gap-1 text-xs text-surface-400">
                <Users size={11} /> {event.inviteeNames.join(', ')}
              </span>
            )}
            {event.remindBefore > 0 && (
              <span className="flex items-center gap-1 text-xs text-surface-500">
                <Bell size={10} /> {event.remindBefore}m before
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {!isPast && event.worldId && (
            <button
              onClick={handleSelfInvite}
              disabled={inviting}
              className="btn-primary text-xs px-2 py-1 flex items-center gap-1"
              title="Join this world"
            >
              <Send size={10} /> {inviting ? '...' : 'Join'}
            </button>
          )}
          <button onClick={onEdit} className="btn-ghost p-1.5" title="Edit">
            <Edit3 size={12} />
          </button>
          <button onClick={onDelete} className="btn-ghost p-1.5 text-red-400 hover:text-red-300" title="Delete">
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}
