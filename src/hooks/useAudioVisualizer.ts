import { useEffect, useRef, useState } from 'react';
import { useThemeStore } from '../stores/themeStore';

export interface MediaInfo {
  active: boolean;
  source: 'spotify' | 'youtube' | null;
  title: string | null;
  /**
   * Only ever 'music' or 'unknown'.
   *
   * Nothing here listens to audio — it reads window titles. A music player's
   * title becomes the track when it plays, which is real evidence. No window
   * title anywhere says whether a voice call is connected or a paused video
   * is actually running, so those are simply not knowable this way and are
   * never claimed.
   */
  kind: 'music' | 'unknown';
  app: string | null;
}

/**
 * Polls the main process for what's currently making sound. Reports nothing
 * when it can't tell, rather than assuming.
 */
export function useMediaDetection(): MediaInfo {
  const [info, setInfo] = useState<MediaInfo>({
    active: false, source: null, title: null, kind: 'unknown', app: null,
  });

  useEffect(() => {
    if (!window.electronAPI?.detectMedia) {
      // Outside Electron we can't see any windows. The old default here was
      // `active: true`, which asserted playback we had no evidence for.
      setInfo({ active: false, source: null, title: null, kind: 'unknown', app: null });
      return;
    }

    let cancelled = false;
    const tick = async () => {
      try {
        const next = await window.electronAPI!.detectMedia();
        if (!cancelled) setInfo(next);
      } catch {}
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return info;
}

/**
 * Captures system audio (when supported) and exposes a frequency-bin getter.
 */
export function useSystemAudio(enabled: boolean) {
  const analyserRef = useRef<AnalyserNode | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const smoothing = useThemeStore(s => s.theme.visualizer.smoothing);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    async function start() {
      try {
        const sources = window.electronAPI?.getDesktopSources
          ? await window.electronAPI.getDesktopSources()
          : [];

        const spotify = sources.find(s => /spotify/i.test(s.name));
        const screen  = sources.find(s => /entire screen|screen/i.test(s.name));
        const chosen  = spotify || screen || sources[0];

        const constraints: any = chosen
          ? {
              audio: {
                mandatory: {
                  chromeMediaSource: 'desktop',
                  chromeMediaSourceId: chosen.id,
                },
              },
              video: {
                mandatory: {
                  chromeMediaSource: 'desktop',
                  chromeMediaSourceId: chosen.id,
                  maxWidth: 1, maxHeight: 1,
                },
              },
            }
          : { audio: true, video: false };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }

        stream.getVideoTracks().forEach(t => t.stop());

        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const src = ctx.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = smoothing;
        src.connect(analyser);

        ctxRef.current = ctx;
        analyserRef.current = analyser;
        streamRef.current = stream;
        setReady(true);
      } catch (err) {
        setError((err as Error).message || 'Audio capture failed');
      }
    }

    start();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach(t => t.stop());
      ctxRef.current?.close();
      analyserRef.current = null;
      ctxRef.current = null;
      streamRef.current = null;
      setReady(false);
    };
  }, [enabled, smoothing]);

  return {
    ready,
    error,
    getFrequencyData: () => {
      const a = analyserRef.current;
      if (!a) return null;
      const data = new Uint8Array(a.frequencyBinCount);
      a.getByteFrequencyData(data);
      return data;
    },
  };
}
