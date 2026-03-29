import { create } from 'zustand';
import type { FeedEvent } from '../types/vrchat';
import { sendDesktopNotification } from '../utils/notifications';

interface FeedState {
  events: FeedEvent[];
  maxEvents: number;
  addEvent: (event: Omit<FeedEvent, 'id' | 'timestamp'>) => void;
  clearEvents: () => void;
  getRecentEvents: (count?: number) => FeedEvent[];
  getEventsByType: (type: FeedEvent['type']) => FeedEvent[];
  getEventsByUser: (userId: string) => FeedEvent[];
}

let eventCounter = 0;

export const useFeedStore = create<FeedState>((set, get) => ({
  events: [],
  maxEvents: 1000,

  addEvent: (event) => {
    const newEvent: FeedEvent = {
      ...event,
      id: `evt_${Date.now()}_${eventCounter++}`,
      timestamp: Date.now(),
    };

    // Fire desktop notification (web or Electron)
    sendDesktopNotification(newEvent);

    set((state) => ({
      events: [newEvent, ...state.events].slice(0, state.maxEvents),
    }));
  },

  clearEvents: () => set({ events: [] }),
  getRecentEvents: (count = 50) => get().events.slice(0, count),
  getEventsByType: (type) => get().events.filter(e => e.type === type),
  getEventsByUser: (userId) => get().events.filter(e => e.userId === userId),
}));
