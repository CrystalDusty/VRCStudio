// Single subscription to the Electron log tail. Fans the incoming line
// stream out to every store that needs to consume it (video player history,
// live instance avatars, future log-mining features). Replaces the old
// useVideoPlayerTracking hook.
//
// Each store exposes an `ingestLines(lines: string[])` method; we call them
// all on every batch. Stores are cheap regex-only consumers — no async work
// on the hot path.
//
// Also keeps the "current instance" context in sync from
// instanceHistoryStore → videoPlayerStore so newly-parsed URLs/avatars get
// pinned to the right room.

import { useEffect } from 'react';
import { useVideoPlayerStore } from '../stores/videoPlayerStore';
import { useInstanceAvatarsStore, sliceToCurrentInstance } from '../stores/instanceAvatarsStore';
import { useInstanceHistoryStore } from '../stores/instanceHistoryStore';
import { useGalleryStore } from '../stores/galleryStore';

// How much of the log to replay on startup. VRChat is chatty — a busy
// instance can burn a couple of thousand lines in minutes, and anything
// less than this misses the joins that built the current player list.
const BACKLOG_LINES = 12_000;

export function useLogIngestion() {
  const current = useInstanceHistoryStore(s => s.currentInstance);
  const setVideoCtx = useVideoPlayerStore(s => s.setContext);
  const setTailingStatus = useVideoPlayerStore(s => s.setTailingStatus);

  // Sync current instance into the video store (and reset avatar tracking
  // whenever the user moves to a different instance).
  useEffect(() => {
    if (current) {
      setVideoCtx({
        worldId: current.worldId,
        worldName: current.worldName,
        instanceId: current.instanceId,
      });
      useInstanceAvatarsStore.getState().setInstanceContext({
        worldId: current.worldId,
        worldName: current.worldName,
        instanceId: current.instanceId,
      });
      useGalleryStore.getState().setContext({
        worldId: current.worldId,
        worldName: current.worldName,
        instanceId: current.instanceId,
      });
    }
  }, [current?.id, setVideoCtx]);

  // Start log tailing + fan-out subscription.
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.logStartTailing || !api?.onVRChatLogLines) return;

    let cancelled = false;
    let unlisten: (() => void) | null = null;
    let unlistenStatus: (() => void) | null = null;

    const fanOut = (lines: string[]) => {
      // Pull store actions fresh each call so we always have the latest
      // closure values without re-subscribing.
      useVideoPlayerStore.getState().ingestLines(lines);
      useInstanceAvatarsStore.getState().ingestLines(lines);
      useGalleryStore.getState().ingestLines(lines);
    };

    // The main process pushes this when it finds a log file after VRChat
    // launches, or when VRChat rotates to a new one.
    unlistenStatus = api.onVRChatLogStatus?.(status => {
      if (cancelled) return;
      setTailingStatus(!!status.active, status.path);
      if (status.path) useInstanceAvatarsStore.setState({ logPath: status.path });
      // A rotation means a brand-new VRChat session: the old instance's
      // players are gone.
      if (status.reason === 'rotated') {
        useInstanceAvatarsStore.getState().resetForInstance();
      }
    }) ?? null;

    (async () => {
      try {
        // Attach the tail *before* reading the backlog so nothing written
        // between the two calls is lost.
        const result = await api.logStartTailing();
        if (cancelled) return;
        setTailingStatus(!!result.success, result.path);
        if (result.path) useInstanceAvatarsStore.setState({ logPath: result.path });
        if (!result.success && !result.waiting) {
          useInstanceAvatarsStore.setState({ logError: result.error });
        }

        unlisten = api.onVRChatLogLines(fanOut);

        const backlog = await api.logReadBacklog?.(BACKLOG_LINES);
        if (backlog?.success && backlog.lines && !cancelled) {
          // Videos want the whole window; the avatar list only wants the
          // instance the user is actually in right now.
          useVideoPlayerStore.getState().ingestLines(backlog.lines);
          useInstanceAvatarsStore.getState().ingestLines(sliceToCurrentInstance(backlog.lines));
          // The gallery keeps everything it has ever seen, so it wants the
          // whole replay window rather than just the current instance.
          useGalleryStore.getState().ingestLines(backlog.lines);
          useInstanceAvatarsStore.setState({ logPath: backlog.path });
        } else if (backlog && !backlog.success) {
          useInstanceAvatarsStore.setState({ logError: backlog.error });
        }
      } catch (err) {
        console.error('[useLogIngestion] failed to start:', err);
      }
    })();

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
      if (unlistenStatus) unlistenStatus();
      // Deliberately NOT calling logStopTailing() here: this hook is mounted
      // for the app's lifetime, and stopping on a transient unmount (dev
      // StrictMode remount) races the restart and kills the log stream.
      // The main process tears the tail down with the window.
    };
  }, [setTailingStatus]);
}
