// A nudge channel for Discord Rich Presence.
//
// The presence payload is built inside useDiscordRPC, which lives in the app
// shell. Settings needs a way to say "push it now" — for the Test button, and
// after the Application ID changes — without duplicating that logic or
// reaching into the hook. Bumping a nonce is the whole mechanism.

import { create } from 'zustand';

interface DiscordRpcState {
  pushNonce: number;
  requestPush: () => void;
}

export const useDiscordRpcStore = create<DiscordRpcState>((set) => ({
  pushNonce: 0,
  requestPush: () => set(s => ({ pushNonce: s.pushNonce + 1 })),
}));
