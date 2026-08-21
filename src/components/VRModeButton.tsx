// The VR mode switch, and the scale slider that comes with it.

import { useState } from 'react';
import { Headset, Minus, Plus, X } from 'lucide-react';
import { useThemeStore } from '../stores/themeStore';

export default function VRModeButton() {
  const vrMode = useThemeStore(s => s.theme.vrMode);
  const vrZoom = useThemeStore(s => s.theme.vrZoom ?? 1.4);
  const setVrMode = useThemeStore(s => s.setVrMode);
  const setVrZoom = useThemeStore(s => s.setVrZoom);
  const [showScale, setShowScale] = useState(false);

  const toggle = () => {
    const next = !vrMode;
    setVrMode(next);
    // Opening the scale control on the way in saves hunting for it: the right
    // scale depends on the headset and how far the overlay is pinned, so the
    // first thing anyone wants to do is nudge it.
    setShowScale(next);
  };

  return (
    <div className="relative">
      <button
        onClick={toggle}
        aria-pressed={vrMode}
        title={vrMode
          ? 'Leave VR mode and go back to normal scale'
          : 'Bigger controls, higher contrast, nothing hidden behind hover — for reading through a VR overlay'}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
          vrMode
            ? 'border-accent-500 bg-accent-500/15 text-accent-200'
            : 'border-surface-700 text-surface-400 hover:text-surface-200 hover:border-surface-600'
        }`}
      >
        <Headset size={16} />
        <span className="hidden sm:inline">{vrMode ? 'VR mode on' : 'VR mode'}</span>
      </button>

      {vrMode && showScale && (
        <div className="absolute right-0 top-full mt-2 z-30 w-64 rounded-lg border border-surface-600 bg-surface-900 shadow-xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold">Interface scale</span>
            <button
              onClick={() => setShowScale(false)}
              className="p-1 rounded text-surface-500 hover:text-surface-200"
              title="Close"
            >
              <X size={13} />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setVrZoom(vrZoom - 0.1)}
              disabled={vrZoom <= 1}
              className="p-1.5 rounded border border-surface-700 hover:border-accent-500 disabled:opacity-40"
              title="Smaller"
            >
              <Minus size={13} />
            </button>
            <input
              type="range" min={1} max={2.2} step={0.05}
              value={vrZoom}
              onChange={e => setVrZoom(Number(e.target.value))}
              className="flex-1 accent-accent-500"
            />
            <button
              onClick={() => setVrZoom(vrZoom + 0.1)}
              disabled={vrZoom >= 2.2}
              className="p-1.5 rounded border border-surface-700 hover:border-accent-500 disabled:opacity-40"
              title="Bigger"
            >
              <Plus size={13} />
            </button>
            <span className="w-10 text-right text-xs tabular-nums text-surface-400">
              {Math.round(vrZoom * 100)}%
            </span>
          </div>

          <p className="text-[11px] text-surface-500 leading-snug">
            The right scale depends on your headset and how far the overlay sits from your face.
            Set it while looking through the headset, not at the monitor.
          </p>
        </div>
      )}
    </div>
  );
}
