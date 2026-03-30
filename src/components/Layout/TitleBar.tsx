import { useState, useEffect } from 'react';
import { Minus, Square, X, Copy, Shield } from 'lucide-react';

export default function TitleBar() {
  const isElectron = !!window.electronAPI;
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!isElectron) return;
    const check = async () => {
      const max = await window.electronAPI!.isMaximized();
      setIsMaximized(max);
    };
    check();
    const interval = setInterval(check, 500);
    return () => clearInterval(interval);
  }, [isElectron]);

  if (!isElectron) return null;

  return (
    <div className="h-9 flex items-center justify-between bg-surface-950 border-b border-surface-800/50 select-none"
         style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
      <div className="pl-3 flex items-center gap-2">
        <div className="w-5 h-5 rounded-md bg-gradient-to-br from-accent-500 to-blue-600 flex items-center justify-center">
          <Shield size={11} className="text-white" />
        </div>
        <span className="text-xs font-semibold text-surface-400 tracking-wide">
          VRC Studio
        </span>
      </div>
      <div className="flex" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button
          onClick={() => window.electronAPI?.minimize()}
          className="h-9 w-12 flex items-center justify-center hover:bg-surface-800 text-surface-500 hover:text-surface-200 transition-colors"
          title="Minimize"
        >
          <Minus size={14} />
        </button>
        <button
          onClick={async () => {
            await window.electronAPI?.maximize();
            setIsMaximized(!isMaximized);
          }}
          className="h-9 w-12 flex items-center justify-center hover:bg-surface-800 text-surface-500 hover:text-surface-200 transition-colors"
          title={isMaximized ? 'Restore' : 'Maximize'}
        >
          {isMaximized ? <Copy size={11} /> : <Square size={11} />}
        </button>
        <button
          onClick={() => window.electronAPI?.close()}
          className="h-9 w-12 flex items-center justify-center hover:bg-red-600 text-surface-500 hover:text-white transition-colors"
          title="Close"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
