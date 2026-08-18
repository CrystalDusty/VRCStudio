// Enlarged view of one discovered image, with the export controls.
//
// The preview is the export: every setting redraws the same canvas the
// download will produce, so what you see is what lands on disk — including
// the border crop, which is the setting people actually came for.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  X, Download, Copy, Check, ExternalLink, Loader2, AlertCircle, Crop,
  EyeOff, Trash2, Image as ImageIcon,
} from 'lucide-react';
import {
  loadImage, sourceBox, renderExport, canvasToBlob, downloadBlob, buildFilename,
  DEFAULT_EXPORT, type ExportSettings, type LoadedImage, type Box,
} from '../utils/imageExport';
import type { GalleryItem } from '../stores/galleryStore';

const SETTINGS_KEY = 'vrcstudio_gallery_export';

function loadSettings(): ExportSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_EXPORT, ...JSON.parse(raw) } : DEFAULT_EXPORT;
  } catch {
    return DEFAULT_EXPORT;
  }
}

function saveSettings(s: ExportSettings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch {}
}

const KIND_LABEL: Record<GalleryItem['kind'], string> = {
  print: 'Print', sticker: 'Sticker', emoji: 'Emoji', image: 'Image',
};

interface Props {
  item: GalleryItem;
  onClose: () => void;
  onHide: (id: string) => void;
  onDelete: (id: string) => void;
  /** Move to the previous/next item without closing. */
  onNavigate?: (delta: number) => void;
}

export default function GalleryItemModal({ item, onClose, onHide, onDelete, onNavigate }: Props) {
  const [settings, setSettings] = useState<ExportSettings>(loadSettings);
  const [filenameTemplate, setFilenameTemplate] = useState(
    () => localStorage.getItem('vrcstudio_gallery_filename') || '{kind} {id}',
  );
  const [loaded, setLoaded] = useState<LoadedImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  const update = (patch: Partial<ExportSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  };

  // ── Load the image bytes ──
  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setLoaded(null);
    setError(null);

    if (!item.url) {
      setError('This item has no image URL yet — VRChat only logged its ID.');
      return;
    }

    loadImage(item.url)
      .then(res => {
        if (cancelled) { URL.revokeObjectURL(res.objectUrl); return; }
        objectUrl = res.objectUrl;
        setLoaded(res);
      })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)); });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [item.url]);

  // ── Crop box, recomputed only when it can actually change ──
  const box: Box | null = useMemo(() => {
    if (!loaded) return null;
    return sourceBox(loaded, settings);
  }, [loaded, settings.border, settings.manualInset]);

  const cropped = !!(loaded && box &&
    (box.width !== loaded.width || box.height !== loaded.height));

  // ── Draw the preview: literally the export canvas, scaled to fit ──
  useEffect(() => {
    const host = previewRef.current;
    if (!host || !loaded || !box) return;
    const canvas = renderExport(loaded, settings, box);
    canvas.style.maxWidth = '100%';
    canvas.style.maxHeight = '46vh';
    canvas.style.objectFit = 'contain';
    canvas.style.display = 'block';
    canvas.style.margin = '0 auto';
    host.replaceChildren(canvas);
  }, [loaded, box, settings]);

  // ── Keyboard: escape closes, arrows move between items ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onNavigate?.(-1);
      if (e.key === 'ArrowRight') onNavigate?.(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onNavigate]);

  const outputSize = useMemo(() => {
    if (!box) return null;
    const pad = Math.max(0, Math.round(settings.padding));
    return {
      w: Math.max(1, Math.round(box.width * settings.scale)) + pad * 2,
      h: Math.max(1, Math.round(box.height * settings.scale)) + pad * 2,
    };
  }, [box, settings.scale, settings.padding]);

  const handleDownload = useCallback(async () => {
    if (!loaded || !box) return;
    setBusy(true);
    setError(null);
    try {
      const canvas = renderExport(loaded, settings, box);
      const blob = await canvasToBlob(canvas, settings);
      const ext = settings.format === 'jpeg' ? 'jpg' : settings.format;
      downloadBlob(blob, buildFilename(filenameTemplate, {
        name: item.name, kind: item.kind, id: item.id,
      }, ext));
      localStorage.setItem('vrcstudio_gallery_filename', filenameTemplate);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setBusy(false);
  }, [loaded, box, settings, filenameTemplate, item]);

  const handleCopyImage = useCallback(async () => {
    if (!loaded || !box) return;
    setBusy(true);
    try {
      // Clipboard images have to be PNG regardless of the export format.
      const canvas = renderExport(loaded, settings, box);
      const blob = await canvasToBlob(canvas, { ...settings, format: 'png' });
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setCopied('image');
      setTimeout(() => setCopied(null), 1800);
    } catch (err) {
      setError(err instanceof Error ? `Copy failed: ${err.message}` : 'Copy failed');
    }
    setBusy(false);
  }, [loaded, box, settings]);

  const copyText = (text: string, key: string) => {
    navigator.clipboard?.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  const openExternal = (url: string) => {
    if (window.electronAPI?.openExternal) window.electronAPI.openExternal(url);
    else window.open(url, '_blank');
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="glass-panel-solid w-full max-w-4xl max-h-[92vh] overflow-y-auto relative"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${KIND_LABEL[item.kind]} details`}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 p-1.5 rounded-lg bg-surface-900/80 text-surface-400 hover:text-surface-100 transition-colors"
          title="Close (Esc)"
        >
          <X size={16} />
        </button>

        <div className="p-4 space-y-4">
          {/* ── Preview ── */}
          <div>
            <div
              className="rounded-lg p-3 flex items-center justify-center min-h-[220px]"
              style={{
                // Checkerboard so transparency is visible rather than guessed at.
                backgroundImage:
                  'linear-gradient(45deg, rgba(255,255,255,.045) 25%, transparent 25%),' +
                  'linear-gradient(-45deg, rgba(255,255,255,.045) 25%, transparent 25%),' +
                  'linear-gradient(45deg, transparent 75%, rgba(255,255,255,.045) 75%),' +
                  'linear-gradient(-45deg, transparent 75%, rgba(255,255,255,.045) 75%)',
                backgroundSize: '18px 18px',
                backgroundPosition: '0 0, 0 9px, 9px -9px, -9px 0',
              }}
            >
              {error ? (
                <div className="text-center text-sm text-surface-400 py-8 px-4">
                  <AlertCircle size={26} className="mx-auto mb-2 text-amber-400 opacity-70" />
                  <p>{error}</p>
                  {item.url && (
                    <button onClick={() => openExternal(item.url)} className="btn-secondary text-xs mt-3 inline-flex items-center gap-1.5">
                      <ExternalLink size={12} /> Open the original
                    </button>
                  )}
                </div>
              ) : !loaded ? (
                <div className="text-sm text-surface-500 flex items-center gap-2 py-10">
                  <Loader2 size={15} className="animate-spin" /> Loading image…
                </div>
              ) : (
                <div ref={previewRef} className="w-full" />
              )}
            </div>

            {loaded && outputSize && (
              <div className="flex items-center justify-between flex-wrap gap-2 mt-2 text-[11px] text-surface-500">
                <span>
                  Source {loaded.width}×{loaded.height}
                  {cropped && box && (
                    <span className="text-accent-400">
                      {' '}→ cropped to {box.width}×{box.height}
                    </span>
                  )}
                </span>
                <span>Export {outputSize.w}×{outputSize.h} · {settings.format.toUpperCase()}</span>
              </div>
            )}
          </div>

          {/* ── Header + actions ── */}
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <h2 className="text-base font-bold flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-accent-500/15 text-accent-300 border border-accent-500/30">
                  {KIND_LABEL[item.kind]}
                </span>
                <span className="truncate">{item.name ?? 'Untitled'}</span>
              </h2>
              <p className="text-[11px] text-surface-500 mt-1">
                {item.authorName && <>by <span className="text-surface-300">{item.authorName}</span> · </>}
                Seen {item.seenCount}×
                {item.worldName && <> · first in <span className="text-surface-400">{item.worldName}</span></>}
                {' · '}{new Date(item.firstSeenAt).toLocaleDateString()}
              </p>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={handleCopyImage}
                disabled={!loaded || busy}
                className="btn-secondary text-xs inline-flex items-center gap-1.5 disabled:opacity-40"
                title="Copy the rendered image to the clipboard"
              >
                {copied === 'image' ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                {copied === 'image' ? 'Copied' : 'Copy'}
              </button>
              <button
                onClick={handleDownload}
                disabled={!loaded || busy}
                className="btn-primary text-xs inline-flex items-center gap-1.5 disabled:opacity-40"
              >
                {busy ? <Loader2 size={12} className="animate-spin" />
                  : saved ? <Check size={12} />
                  : <Download size={12} />}
                {saved ? 'Saved' : 'Download'}
              </button>
            </div>
          </div>

          {/* ── Export settings ── */}
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3 border-t border-surface-800 pt-3">
            {/* Borders — the headline setting */}
            <Field label="Borders" icon={Crop}>
              <div className="flex gap-1.5 flex-wrap">
                {([
                  { v: 'keep', label: 'Keep' },
                  { v: 'auto', label: 'Trim automatically' },
                  { v: 'manual', label: 'Manual' },
                ] as const).map(o => (
                  <Chip key={o.v} active={settings.border === o.v} onClick={() => update({ border: o.v })}>
                    {o.label}
                  </Chip>
                ))}
              </div>
              {settings.border === 'auto' && (
                <p className="text-[10px] text-surface-500 mt-1.5">
                  {loaded
                    ? cropped
                      ? 'Border found and trimmed — the preview above is the result.'
                      : "No uniform border on this one, so nothing was trimmed."
                    : 'Detects a solid frame or transparent padding and cuts it off.'}
                </p>
              )}
              {settings.border === 'manual' && (
                <label className="block mt-1.5">
                  <span className="text-[10px] text-surface-500">Trim {settings.manualInset}% from each edge</span>
                  <input
                    type="range" min={0} max={40} step={0.5}
                    value={settings.manualInset}
                    onChange={e => update({ manualInset: Number(e.target.value) })}
                    className="w-full accent-accent-500"
                  />
                </label>
              )}
            </Field>

            <Field label="Format">
              <div className="flex gap-1.5">
                {(['png', 'jpeg', 'webp'] as const).map(f => (
                  <Chip key={f} active={settings.format === f} onClick={() => update({ format: f })}>
                    {f.toUpperCase()}
                  </Chip>
                ))}
              </div>
              {settings.format !== 'png' && (
                <label className="block mt-1.5">
                  <span className="text-[10px] text-surface-500">Quality {Math.round(settings.quality * 100)}%</span>
                  <input
                    type="range" min={0.1} max={1} step={0.01}
                    value={settings.quality}
                    onChange={e => update({ quality: Number(e.target.value) })}
                    className="w-full accent-accent-500"
                  />
                </label>
              )}
              {settings.format === 'jpeg' && settings.background === 'transparent' && (
                <p className="text-[10px] text-amber-400/80 mt-1">
                  JPEG has no transparency — anything see-through becomes white.
                </p>
              )}
            </Field>

            <Field label="Size">
              <div className="flex gap-1.5 flex-wrap">
                {[0.5, 1, 2, 4].map(s => (
                  <Chip key={s} active={settings.scale === s} onClick={() => update({ scale: s })}>
                    {s}×
                  </Chip>
                ))}
              </div>
            </Field>

            <Field label="Background">
              <div className="flex gap-1.5 items-center flex-wrap">
                {([
                  { v: 'transparent', label: 'Transparent' },
                  { v: 'white', label: 'White' },
                  { v: 'black', label: 'Black' },
                  { v: 'custom', label: 'Custom' },
                ] as const).map(o => (
                  <Chip key={o.v} active={settings.background === o.v} onClick={() => update({ background: o.v })}>
                    {o.label}
                  </Chip>
                ))}
                {settings.background === 'custom' && (
                  <input
                    type="color"
                    value={settings.customBackground}
                    onChange={e => update({ customBackground: e.target.value })}
                    className="w-7 h-7 rounded bg-transparent border border-surface-700 cursor-pointer"
                  />
                )}
              </div>
            </Field>

            <Field label={`Padding — ${settings.padding}px`}>
              <input
                type="range" min={0} max={128} step={2}
                value={settings.padding}
                onChange={e => update({ padding: Number(e.target.value) })}
                className="w-full accent-accent-500"
              />
            </Field>

            <Field label={`Rounded corners — ${settings.cornerRadius}px`}>
              <input
                type="range" min={0} max={200} step={2}
                value={settings.cornerRadius}
                onChange={e => update({ cornerRadius: Number(e.target.value) })}
                className="w-full accent-accent-500"
              />
            </Field>

            <Field label="Filename">
              <input
                value={filenameTemplate}
                onChange={e => setFilenameTemplate(e.target.value)}
                className="w-full bg-surface-900 text-xs px-2 py-1.5 rounded-lg border border-surface-700 focus:outline-none focus:border-accent-500 font-mono"
              />
              <p className="text-[10px] text-surface-600 mt-1">
                {'{name} {kind} {id} {date}'} · saves as{' '}
                <span className="text-surface-400">
                  {buildFilename(filenameTemplate, { name: item.name, kind: item.kind, id: item.id },
                    settings.format === 'jpeg' ? 'jpg' : settings.format)}
                </span>
              </p>
            </Field>

            <Field label="Reset">
              <button
                onClick={() => { setSettings(DEFAULT_EXPORT); saveSettings(DEFAULT_EXPORT); }}
                className="btn-secondary text-xs"
              >
                Back to defaults
              </button>
            </Field>
          </div>

          {/* ── Metadata + item actions ── */}
          <div className="border-t border-surface-800 pt-3 space-y-2 text-[11px]">
            <div className="flex gap-3">
              <span className="text-surface-600 w-16 flex-shrink-0">ID</span>
              <button
                onClick={() => copyText(item.id, 'id')}
                className="font-mono text-surface-300 hover:text-accent-300 break-all text-left inline-flex items-center gap-1"
              >
                {item.id}
                {copied === 'id' ? <Check size={10} className="text-green-400" /> : <Copy size={10} />}
              </button>
            </div>
            {item.url && (
              <div className="flex gap-3">
                <span className="text-surface-600 w-16 flex-shrink-0">Source</span>
                <button
                  onClick={() => copyText(item.url, 'url')}
                  className="font-mono text-surface-400 hover:text-accent-300 break-all text-left inline-flex items-center gap-1"
                >
                  {item.url}
                  {copied === 'url' ? <Check size={10} className="text-green-400" /> : <Copy size={10} />}
                </button>
              </div>
            )}

            <div className="flex items-center gap-2 pt-1 flex-wrap">
              {item.url && (
                <button onClick={() => openExternal(item.url)} className="btn-secondary text-xs inline-flex items-center gap-1.5">
                  <ExternalLink size={12} /> Open original
                </button>
              )}
              <button
                onClick={() => { onHide(item.id); onClose(); }}
                className="btn-secondary text-xs inline-flex items-center gap-1.5"
                title="Keep it, but stop showing it in the grid"
              >
                <EyeOff size={12} /> Hide
              </button>
              <button
                onClick={() => { onDelete(item.id); onClose(); }}
                className="text-xs px-2.5 py-1.5 rounded-lg text-rose-400 hover:bg-rose-500/10 inline-flex items-center gap-1.5"
              >
                <Trash2 size={12} /> Forget
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, icon: Icon, children }: {
  label: string;
  icon?: typeof ImageIcon;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wider text-surface-500 mb-1.5 flex items-center gap-1.5">
        {Icon && <Icon size={11} className="text-accent-400" />}
        {label}
      </div>
      {children}
    </div>
  );
}

function Chip({ active, onClick, children }: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-[11px] px-2.5 py-1 rounded-lg border transition-colors ${
        active
          ? 'border-accent-500 bg-accent-500/10 text-accent-300'
          : 'border-surface-700 text-surface-400 hover:border-surface-600'
      }`}
    >
      {children}
    </button>
  );
}
