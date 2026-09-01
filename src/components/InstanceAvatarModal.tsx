// Detail view for one avatar spotted in the current instance.
//
// Opened by clicking a row on the Live Avatars page. Shows the full-size
// thumbnail, everything we know about the avatar (log-derived performance
// stats + whatever VRChat's API and avtrdb return), and — when the avatar is
// fully public — lets the user switch into it.
//
// On "fully public": VRChat's /avatars/{id} endpoint only serves an avatar
// to a non-owner when its releaseStatus is public. That is the whole gate.
// The author's *cloning* toggle is a client-side setting for the in-game
// clone button and has no bearing on selecting the avatar through the API,
// so we deliberately ignore it — a public avatar is wearable whether or not
// its author allows cloning.

import { useCallback, useEffect, useState } from 'react';
import {
  X, Copy, Check, ExternalLink, Shirt, Loader2, Lock, Globe, AlertCircle,
  Monitor, Smartphone, RefreshCw, Search,
} from 'lucide-react';
import api, { APIError } from '../api/vrchat';
import { useAuthStore } from '../stores/authStore';
import type { VRCAvatar } from '../types/vrchat';
import type { PlayerAvatar } from '../stores/instanceAvatarsStore';
import { PerformanceReport } from './AvatarPerformance';
import { platformRanks } from '../utils/avatarPerformance';

/** What VRChat's API told us about this avatar, and what it means for us. */
type Availability =
  | { state: 'no-id' }
  | { state: 'checking' }
  | { state: 'public'; avatar: VRCAvatar }
  | { state: 'restricted'; avatar: VRCAvatar }
  | { state: 'unavailable'; reason: string; status?: number };

// Re-opening the same avatar shouldn't re-hit the API.
const avatarCache = new Map<string, VRCAvatar>();


interface Props {
  player: PlayerAvatar;
  onClose: () => void;
  /** Fired after a successful switch so the list can flash "Worn" too. */
  onSwitched?: (avatarId: string) => void;
}

export default function InstanceAvatarModal({ player, onClose, onSwitched }: Props) {
  const avatarId = player.avatarId;
  const match = player.vrcdbMatch;
  const me = useAuthStore(s => s.user);
  // Your own avatar image is known for certain — never fall back to a
  // community index's guess for yourself.
  const selfImage = player.isLocal
    ? (me?.currentAvatarImageUrl || me?.currentAvatarThumbnailImageUrl || undefined)
    : undefined;

  const [availability, setAvailability] = useState<Availability>(
    avatarId ? { state: 'checking' } : { state: 'no-id' },
  );
  const [switching, setSwitching] = useState(false);
  const [switched, setSwitched] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const check = useCallback(async () => {
    if (!avatarId) {
      setAvailability({ state: 'no-id' });
      return;
    }

    const cached = avatarCache.get(avatarId);
    if (cached) {
      setAvailability(
        cached.releaseStatus === 'public'
          ? { state: 'public', avatar: cached }
          : { state: 'restricted', avatar: cached },
      );
      return;
    }

    setAvailability({ state: 'checking' });
    try {
      const avatar = await api.getAvatar(avatarId);
      avatarCache.set(avatarId, avatar);
      setAvailability(
        avatar.releaseStatus === 'public'
          ? { state: 'public', avatar }
          : { state: 'restricted', avatar },
      );
    } catch (err) {
      const status = err instanceof APIError ? err.status : undefined;
      // 404 is what VRChat returns for a private avatar you don't own —
      // it doesn't distinguish "private" from "deleted".
      const reason = status === 404
        ? 'VRChat won\'t serve this avatar — it\'s private, deleted, or not visible to your account.'
        : err instanceof Error ? err.message : 'Could not reach VRChat.';
      setAvailability({ state: 'unavailable', reason, status });
    }
  }, [avatarId]);

  useEffect(() => { void check(); }, [check]);

  // Escape closes, and the backdrop click is handled below.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const apiAvatar = availability.state === 'public' || availability.state === 'restricted'
    ? availability.avatar
    : null;

  const displayName = apiAvatar?.name ?? player.avatarName ?? match?.name ?? 'Unknown avatar';
  const authorName = apiAvatar?.authorName ?? match?.authorName;
  const description = apiAvatar?.description ?? match?.description;
  const image = apiAvatar?.imageUrl || selfImage || match?.imageUrl || match?.thumbnailImageUrl || apiAvatar?.thumbnailImageUrl;

  const canSwitch = availability.state === 'public' && !!avatarId;

  const handleSwitch = async () => {
    if (!avatarId || !canSwitch || switching) return;
    setSwitching(true);
    setSwitchError(null);
    try {
      await api.selectAvatar(avatarId);
      setSwitched(true);
      onSwitched?.(avatarId);
      setTimeout(() => setSwitched(false), 4000);
    } catch (err) {
      setSwitchError(err instanceof Error ? err.message : String(err));
    }
    setSwitching(false);
  };

  const copy = (text: string, key: string) => {
    navigator.clipboard?.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  const openExternal = (url: string) => {
    if (window.electronAPI?.openExternal) window.electronAPI.openExternal(url);
    else window.open(url, '_blank');
  };

  const platforms = apiAvatar?.unityPackages
    ? [...new Set(apiAvatar.unityPackages.map(p => p.platform))]
    : [];


  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="glass-panel-solid w-full max-w-3xl max-h-[90vh] overflow-y-auto relative"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${displayName} details`}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 p-1.5 rounded-lg bg-surface-900/80 text-surface-400 hover:text-surface-100 transition-colors"
          title="Close (Esc)"
        >
          <X size={16} />
        </button>

        <div className="grid sm:grid-cols-[minmax(0,260px)_1fr] gap-4 p-4">
          {/* ── Thumbnail ── */}
          <div>
            <div className="aspect-square rounded-lg overflow-hidden bg-surface-800 flex items-center justify-center">
              {image ? (
                <img src={image} alt={displayName} className="w-full h-full object-cover" />
              ) : (
                <Shirt size={40} className="text-surface-600" />
              )}
            </div>

            {/* ── Switch action ── */}
            <div className="mt-3 space-y-2">
              <button
                onClick={handleSwitch}
                disabled={!canSwitch || switching}
                className={`w-full text-sm py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
                  switched
                    ? 'bg-green-500/20 text-green-300'
                    : canSwitch
                      ? 'bg-accent-600/25 text-accent-200 hover:bg-accent-600/40'
                      : 'bg-surface-800 text-surface-600 cursor-not-allowed'
                }`}
                title={canSwitch
                  ? 'Switch into this avatar'
                  : 'Only fully public avatars can be worn'}
              >
                {switching ? <Loader2 size={14} className="animate-spin" />
                  : switched ? <Check size={14} />
                  : <Shirt size={14} />}
                {switching ? 'Switching…' : switched ? 'Now wearing' : 'Switch into avatar'}
              </button>

              <AvailabilityNote availability={availability} onRetry={check} />

              {switchError && (
                <p className="text-[11px] text-rose-400 flex items-start gap-1.5">
                  <AlertCircle size={11} className="mt-0.5 flex-shrink-0" />
                  <span>{switchError}</span>
                </p>
              )}
            </div>
          </div>

          {/* ── Details ── */}
          <div className="min-w-0 space-y-3">
            <div className="pr-8">
              <h2 className="text-lg font-bold leading-tight break-words">{displayName}</h2>
              <p className="text-xs text-surface-500 mt-0.5">
                {authorName ? <>by <span className="text-surface-300">{authorName}</span></> : 'author unknown'}
                {' · worn by '}
                <span className="text-surface-300">{player.playerName}</span>
                {player.isLocal && <span className="text-accent-400"> (you)</span>}
              </p>
            </div>

            {description && (
              <p className="text-xs text-surface-400 leading-relaxed line-clamp-4">{description}</p>
            )}

            {/* Performance */}
            <Section title="Performance">
              <PerformanceReport
                stats={player.stats}
                loggedRank={player.rank}
                platforms={platformRanks(apiAvatar?.unityPackages)}
                defaultExpanded
              />
            </Section>

            {/* Avatar metadata */}
            <Section title="Avatar">
              <div className="space-y-1 text-[11px]">
                <MetaRow label="Avatar ID">
                  {avatarId ? (
                    <button
                      onClick={() => copy(avatarId, 'id')}
                      className="font-mono text-surface-300 hover:text-accent-300 inline-flex items-center gap-1 break-all text-left"
                    >
                      {avatarId}
                      {copied === 'id' ? <Check size={10} className="text-green-400 flex-shrink-0" /> : <Copy size={10} className="flex-shrink-0" />}
                    </button>
                  ) : (
                    <span className="text-surface-600 italic">
                      not in the log — VRChat only named the avatar
                    </span>
                  )}
                </MetaRow>

                {player.idFromNameSearch && (
                  <MetaRow label="ID source">
                    <span className="text-amber-400/90">
                      matched by name on avtrdb — may be a different upload
                    </span>
                  </MetaRow>
                )}

                {apiAvatar && (
                  <>
                    <MetaRow label="Release">
                      <span className={apiAvatar.releaseStatus === 'public' ? 'text-green-400' : 'text-amber-400'}>
                        {apiAvatar.releaseStatus}
                      </span>
                    </MetaRow>
                    <MetaRow label="Version">{apiAvatar.version}</MetaRow>
                    {apiAvatar.updated_at && (
                      <MetaRow label="Updated">
                        {new Date(apiAvatar.updated_at).toLocaleDateString()}
                      </MetaRow>
                    )}
                    {platforms.length > 0 && (
                      <MetaRow label="Platforms">
                        <span className="inline-flex items-center gap-2">
                          {platforms.map(p => (
                            <span key={p} className="inline-flex items-center gap-1 text-surface-300">
                              {p === 'android'
                                ? <><Smartphone size={10} /> Quest</>
                                : <><Monitor size={10} /> PC</>}
                            </span>
                          ))}
                        </span>
                      </MetaRow>
                    )}
                  </>
                )}

                {apiAvatar?.tags && apiAvatar.tags.filter(t => t.startsWith('author_tag_')).length > 0 && (
                  <MetaRow label="Tags">
                    <span className="flex flex-wrap gap-1">
                      {apiAvatar.tags
                        .filter(t => t.startsWith('author_tag_'))
                        .slice(0, 12)
                        .map(t => (
                          <span key={t} className="badge bg-surface-800 text-surface-400 text-[10px]">
                            {t.replace('author_tag_', '')}
                          </span>
                        ))}
                    </span>
                  </MetaRow>
                )}
              </div>
            </Section>

            {/* Links */}
            <div className="flex flex-wrap gap-2 pt-1">
              {avatarId && (
                <>
                  <button
                    onClick={() => openExternal(`https://vrchat.com/home/avatar/${avatarId}`)}
                    className="btn-secondary text-xs inline-flex items-center gap-1.5"
                  >
                    <ExternalLink size={12} /> VRChat
                  </button>
                  <button
                    onClick={() => openExternal(`https://avtrdb.com/avatar/${avatarId}`)}
                    className="btn-secondary text-xs inline-flex items-center gap-1.5"
                  >
                    <ExternalLink size={12} /> avtrdb
                  </button>
                </>
              )}
              {!avatarId && (player.avatarName || match?.name) && (
                <button
                  onClick={() => openExternal(
                    `https://avtrdb.com/search?query=${encodeURIComponent(player.avatarName ?? match!.name)}`,
                  )}
                  className="btn-secondary text-xs inline-flex items-center gap-1.5"
                >
                  <Search size={12} /> Search avtrdb by name
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Explains, in one line, why the switch button is or isn't available. */
function AvailabilityNote({ availability, onRetry }: { availability: Availability; onRetry: () => void }) {
  switch (availability.state) {
    case 'checking':
      return (
        <p className="text-[11px] text-surface-500 flex items-center gap-1.5">
          <Loader2 size={11} className="animate-spin" /> Checking whether this avatar is public…
        </p>
      );
    case 'public':
      return (
        <p className="text-[11px] text-green-400/90 flex items-start gap-1.5">
          <Globe size={11} className="mt-0.5 flex-shrink-0" />
          <span>Fully public — yours to wear. The author's cloning setting doesn't apply here.</span>
        </p>
      );
    case 'restricted':
      return (
        <p className="text-[11px] text-amber-400/90 flex items-start gap-1.5">
          <Lock size={11} className="mt-0.5 flex-shrink-0" />
          <span>This avatar is <span className="font-medium">{availability.avatar.releaseStatus}</span>, not public — only its author can wear it.</span>
        </p>
      );
    case 'unavailable':
      return (
        <div className="text-[11px] text-surface-500 space-y-1">
          <p className="flex items-start gap-1.5">
            <Lock size={11} className="mt-0.5 flex-shrink-0 text-amber-400" />
            <span>{availability.reason}</span>
          </p>
          {availability.status !== 404 && (
            <button onClick={onRetry} className="text-accent-400 hover:text-accent-300 inline-flex items-center gap-1">
              <RefreshCw size={10} /> Try again
            </button>
          )}
        </div>
      );
    case 'no-id':
      return (
        <p className="text-[11px] text-surface-500 flex items-start gap-1.5">
          <AlertCircle size={11} className="mt-0.5 flex-shrink-0 text-amber-400" />
          <span>VRChat logged this avatar by name only, so there's no ID to switch into.</span>
        </p>
      );
  }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[10px] font-bold uppercase tracking-wider text-surface-500 mb-1.5">{title}</h3>
      {children}
    </div>
  );
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 items-start">
      <span className="text-surface-600 w-20 flex-shrink-0">{label}</span>
      <span className="text-surface-300 min-w-0 flex-1">{children}</span>
    </div>
  );
}
