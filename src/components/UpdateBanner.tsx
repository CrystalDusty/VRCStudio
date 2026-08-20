// Slim banner that sits across the top of the app when an update is
// available. Click "Install" to kick off the download + restart flow.
// Dismissable; reappears next time the user opens the app (or on a fresh
// check that finds an even newer commit).

import { useEffect, useState } from 'react';
import { Download, X, RefreshCw, AlertTriangle, Check, GitBranch } from 'lucide-react';
import { useUpdateStore } from '../stores/updateStore';

export default function UpdateBanner() {
  const [branch, setBranch] = useState<string | null>(null);
  useEffect(() => {
    window.electronAPI?.updateGetBranch?.().then(b => setBranch(b?.branch ?? null)).catch(() => {});
  }, []);

  const stage = useUpdateStore(s => s.stage);
  const info = useUpdateStore(s => s.info);
  const error = useUpdateStore(s => s.error);
  const progress = useUpdateStore(s => s.progress);
  const dismissed = useUpdateStore(s => s.bannerDismissed);
  const dismiss = useUpdateStore(s => s.dismissBanner);
  const apply = useUpdateStore(s => s.apply);

  // Show the banner only when an update is actually waiting to be applied
  // (or we're mid-apply). All other stages are silent.
  const isUpdating = stage === 'downloading' || stage === 'preparing' || stage === 'restarting';
  const isAvailable = stage === 'available' && info && !info.upToDate;
  const isError = stage === 'error' && info != null;

  if (dismissed && !isUpdating) return null;
  if (!isAvailable && !isUpdating && !isError) return null;

  let body: React.ReactNode = null;
  let actionLabel = '';
  let stripe = 'bg-accent-500';

  if (isUpdating) {
    stripe = 'bg-blue-500';
    const pct = progress && progress.total > 0
      ? Math.round((progress.received / progress.total) * 100)
      : null;
    body = (
      <span className="flex items-center gap-2">
        <RefreshCw size={13} className="animate-spin" />
        {stage === 'downloading' && `Downloading update${pct != null ? ` (${pct}%)` : '...'}`}
        {stage === 'preparing' && 'Preparing files...'}
        {stage === 'restarting' && 'Restarting VRC Studio...'}
      </span>
    );
  } else if (isError) {
    stripe = 'bg-rose-500';
    body = (
      <span className="flex items-center gap-2 text-rose-300">
        <AlertTriangle size={13} />
        Update failed: {error}
      </span>
    );
    actionLabel = 'Retry';
  } else if (isAvailable && info) {
    const versionLabel = info.behind > 0
      ? `${info.behind} new ${info.behind === 1 ? 'commit' : 'commits'} available`
      : `New version available`;
    body = (
      <span className="flex items-center gap-2">
        <Download size={13} className="text-accent-300" />
        <span className="font-medium">{versionLabel}</span>
        {/* Which branch this is from. Without it, an update from a different
            line of work looks identical to the one you were waiting for — and
            installing it silently replaces everything you were testing. */}
        {branch && (
          <span className="text-surface-500 font-mono hidden sm:inline">
            <GitBranch size={11} className="inline mr-1 -mt-0.5" />{branch}
          </span>
        )}
        {info.commits[0] && (
          <span className="text-surface-400 truncate hidden md:inline">
            — {info.commits[0].message}
          </span>
        )}
      </span>
    );
    actionLabel = 'Install';
  }

  return (
    <div className={`relative w-full overflow-hidden`}>
      <div className={`absolute inset-y-0 left-0 w-1 ${stripe}`} />
      <div className="flex items-center gap-3 pl-3 pr-2 py-1.5 bg-surface-800/60 border-b border-surface-700/50 text-xs">
        <div className="flex-1 min-w-0">{body}</div>
        {actionLabel && !isUpdating && (
          <button
            onClick={() => {
              if (isError) {
                useUpdateStore.getState().check();
              } else {
                apply();
              }
            }}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-accent-500/15 text-accent-300 hover:bg-accent-500/25 font-medium transition-colors"
          >
            {isError ? <RefreshCw size={11} /> : <Check size={11} />}
            {actionLabel}
          </button>
        )}
        {!isUpdating && (
          <button
            onClick={dismiss}
            className="p-1 rounded text-surface-500 hover:text-surface-200 hover:bg-surface-800 transition-colors"
            title="Dismiss"
          >
            <X size={12} />
          </button>
        )}
      </div>
    </div>
  );
}
