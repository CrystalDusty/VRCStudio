import { Minus, Square, X } from 'lucide-react';

export default function TitleBar() {
  const isElectron = !!window.electronAPI;

  if (!isElectron) return null;

  return (
    <div className="h-8 flex items-center justify-between bg-surface-950 select-none"
         style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
      <div className="pl-3 text-xs font-semibold text-surface-400 tracking-wider">
        VRC STUDIO
      </div>
      <div className="flex" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button
          onClick={() => window.electronAPI?.minimize()}
          className="h-8 w-11 flex items-center justify-center hover:bg-surface-800 text-surface-400 hover:text-white transition-colors"
        >
          <Minus size={14} />
        </button>
        <button
          onClick={() => window.electronAPI?.maximize()}
          className="h-8 w-11 flex items-center justify-center hover:bg-surface-800 text-surface-400 hover:text-white transition-colors"
        >
          <Square size={11} />
        </button>
        <button
          onClick={() => window.electronAPI?.close()}
          className="h-8 w-11 flex items-center justify-center hover:bg-red-600 text-surface-400 hover:text-white transition-colors"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
