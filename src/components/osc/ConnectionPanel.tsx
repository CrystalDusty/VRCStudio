// What OSC is actually doing, and why it isn't working when it isn't.

import { useEffect, useState } from 'react';
import { Plug, RefreshCw, AlertCircle, CheckCircle2, Activity } from 'lucide-react';
import { useOSCStore } from '../../stores/oscStore';

export default function ConnectionPanel() {
  const { connected, config, status, lastError, setConfig, start, stop, refreshStatus } = useOSCStore();
  const [probe, setProbe] = useState<{ free: boolean; error?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [, setTick] = useState(0);

  // Counters only mean something if they move, so refresh while this is open.
  useEffect(() => {
    refreshStatus();
    const id = setInterval(() => { refreshStatus(); setTick(t => t + 1); }, 2000);
    return () => clearInterval(id);
  }, [refreshStatus]);

  const checkPort = async () => {
    setProbe(null);
    const result = await window.electronAPI?.oscProbePort?.(config.recvPort);
    setProbe(result ?? { free: false, error: 'not available' });
  };

  const restart = async () => {
    setBusy(true);
    await stop();
    await start();
    setBusy(false);
  };

  const quiet = connected && status?.lastMessageAt == null;

  return (
    <div className="space-y-3">
      <div className="glass-panel-solid p-3 space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Plug size={15} className="text-accent-400" /> Connection
        </h2>

        {lastError && (
          <div className="flex items-start gap-2 text-xs rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-amber-300">
            <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
            <span>{lastError}</span>
          </div>
        )}

        {/* Bound but never heard a thing: almost always VRChat's OSC toggle. */}
        {quiet && (
          <div className="flex items-start gap-2 text-xs rounded-lg border border-surface-700 bg-surface-900/60 p-2.5 text-surface-400">
            <Activity size={14} className="mt-0.5 flex-shrink-0" />
            <span>
              The socket is open but VRChat hasn't sent anything yet. Turn OSC on in VRChat's
              Action Menu → Options → OSC → Enabled, then change an avatar parameter — a gesture
              will do it.
            </span>
          </div>
        )}

        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
          <span className="text-surface-500">Socket</span>
          <span className={connected ? 'text-green-400' : 'text-surface-400'}>
            {connected
              ? `listening on 127.0.0.1:${status?.recvPort ?? config.recvPort}`
              : 'not listening'}
          </span>
          <span className="text-surface-500">Sending to</span>
          <span className="font-mono text-surface-300">{config.sendHost}:{config.sendPort}</span>
          <span className="text-surface-500">Packets</span>
          <span className="text-surface-300 tabular-nums">
            {status?.packetsIn ?? 0} in · {status?.packetsOut ?? 0} out
          </span>
          <span className="text-surface-500">Last heard</span>
          <span className="text-surface-300">
            {status?.lastMessageAt ? new Date(status.lastMessageAt).toLocaleTimeString() : '—'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button onClick={restart} disabled={busy} className="btn-secondary text-xs inline-flex items-center gap-1.5">
            <RefreshCw size={12} className={busy ? 'animate-spin' : ''} /> Restart OSC
          </button>
          <button onClick={checkPort} className="btn-ghost text-xs inline-flex items-center gap-1.5">
            Check port {config.recvPort}
          </button>
          {probe && (
            <span className={`text-xs inline-flex items-center gap-1.5 ${probe.free ? 'text-green-400' : 'text-amber-400'}`}>
              {probe.free ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
              {probe.free
                ? 'free'
                : `taken by another app (${probe.error ?? 'in use'})`}
            </span>
          )}
        </div>
      </div>

      <div className="glass-panel-solid p-3 space-y-2.5">
        <h3 className="text-xs font-semibold text-surface-300">Ports</h3>
        <p className="text-[11px] text-surface-500">
          VRChat listens on 9000 and sends to 9001, so those are the defaults and they're right
          unless you launched VRChat with <code className="text-surface-400">--osc=</code> to move
          them. Changing anything here restarts the socket.
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          <Field label="Send to host" value={config.sendHost} onChange={v => setConfig({ sendHost: v })} />
          <NumberField label="Send port" value={config.sendPort} onChange={v => setConfig({ sendPort: v })} />
          <NumberField label="Receive port" value={config.recvPort} onChange={v => setConfig({ recvPort: v })} />
        </div>
        <label className="flex items-center gap-2 text-xs text-surface-400">
          <input
            type="checkbox"
            checked={config.autoStart}
            onChange={e => setConfig({ autoStart: e.target.checked })}
            className="accent-accent-500"
          />
          Start OSC automatically when VRC Studio opens
        </label>
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] text-surface-500">{label}</span>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        className="input-field w-full text-xs font-mono"
      />
    </label>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] text-surface-500">{label}</span>
      <input
        type="number" min={1024} max={65535}
        value={value}
        onChange={e => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(Math.max(1024, Math.min(65535, Math.round(v))));
        }}
        className="input-field w-full text-xs font-mono"
      />
    </label>
  );
}
