// Enlarged view of one grabbed image, with the export controls.
//
// The preview is the export: every setting redraws the same canvas the
// download will produce, so what you see is what lands on disk — including
// the border crop, which is the setting people actually came for.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  X, Download, Copy, Check, ExternalLink, Loader2, AlertCircle, Crop,
  EyeOff, Trash2, Image as ImageIcon, Film,
} from 'lucide-react';
import {
  loadImage, sourceBox, renderExport, canvasToBlob, downloadBlob, buildFilename,
  exportExtension, fetchOriginal,
  DEFAULT_EXPORT, type ExportSettings, type LoadedImage, type Box,
} from '../utils/imageExport';
import { useGrabberStore, type GrabbedItem } from '../stores/grabberStore';
import {
  guessSpriteLayout, framesFromSpriteSheet, framesFromAnimatedFile,
  supportedVideoFormats, toGif, toVideo,
  type ExtractedFrames, type LoopStyle,
} from '../utils/animation';

const SETTINGS_KEY = 'vrcstudio_grabber_export';

function loadSettings(): ExportSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_EXPORT, ...JSON.parse(raw) } : DEFAULT_EXPORT;
  } catch {
    return DEFAULT_EXPORT;
  }
}

/**
 * Video containers here carry no alpha, so a transparent emoji has to land on
 * something. Honour the chosen background, and use black when the answer is
 * "transparent" — an invisible choice can't be honoured.
 */
function backgroundForVideo(s: ExportSettings): string {
  switch (s.background) {
    case 'white': return '#ffffff';
    case 'black': return '#000000';
    case 'custom': return s.customBackground;
    default: return '#000000';
  }
}

function saveSettings(s: ExportSettings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch {}
}

const KIND_LABEL: Record<GrabbedItem['kind'], string> = {
  portal: 'Portal', print: 'Print', sticker: 'Sticker', emoji: 'Emoji',
  item: 'Item', image: 'Image',
};

interface Props {
  item: GrabbedItem;
  onClose: () => void;
  onHide: (id: string) => void;
  onDelete: (id: string) => void;
  /** Move to the previous/next item without closing. */
  onNavigate?: (delta: number) => void;
}

export default function GrabbedItemModal({ item, onClose, onHide, onDelete, onNavigate }: Props) {
  const [settings, setSettings] = useState<ExportSettings>(loadSettings);
  const [filenameTemplate, setFilenameTemplate] = useState(
    () => localStorage.getItem('vrcstudio_grabber_filename') || '{kind} {id}',
  );
  const [loaded, setLoaded] = useState<LoadedImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  // Ask what the file really is the moment it's opened — the grid may not have
  // reached this one yet, and everything below hangs off the answer.
  const inspectMedia = useGrabberStore(s => s.inspectMedia);
  const loadAnimationDetails = useGrabberStore(s => s.loadAnimationDetails);
  useEffect(() => {
    if (item.url && !item.inspectedAt) inspectMedia([item.id]);
  }, [item.id, item.url, item.inspectedAt, inspectMedia]);
  // And ask VRChat how it moves. An animated emoji's image is a still sprite
  // sheet, so the bytes can't answer this — only the file record can.
  useEffect(() => {
    if (item.spriteFrames === undefined) loadAnimationDetails(item.id);
  }, [item.id, item.spriteFrames, loadAnimationDetails]);

  // Two independent ways a thing can move, and an item may be either.
  const sheetFrames = item.spriteFrames && item.spriteFrames > 1 ? item.spriteFrames : 0;
  const isSheet = sheetFrames > 0;
  const isAnimatedFile = !!item.animated;
  const movesAtAll = isSheet || isAnimatedFile;

  const [extracted, setExtracted] = useState<ExtractedFrames | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [gridOverride, setGridOverride] = useState<{ columns: number; rows: number } | null>(null);
  const [fpsOverride, setFpsOverride] = useState<number | null>(null);
  const [loopOverride, setLoopOverride] = useState<LoopStyle | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  useEffect(() => {
    setGridOverride(null); setFpsOverride(null); setLoopOverride(null);
  }, [item.id]);

  const videoFormats = useMemo(() => supportedVideoFormats(), []);
  const videoFormat = useMemo(
    () => videoFormats.find(f => f.extension === settings.videoExtension) ?? videoFormats[0],
    [videoFormats, settings.videoExtension],
  );

  const fps = fpsOverride ?? item.spriteFps ?? 12;
  const loopStyle: LoopStyle = loopOverride ?? item.spriteLoopStyle ?? 'linear';
  const layout = useMemo(
    () => {
      if (!loaded || !isSheet) return null;
      const guess = guessSpriteLayout(loaded.width, loaded.height, sheetFrames);
      if (!gridOverride) return guess;
      const { columns, rows } = gridOverride;
      return {
        columns, rows, count: sheetFrames,
        frameWidth: Math.max(1, Math.floor(loaded.width / columns)),
        frameHeight: Math.max(1, Math.floor(loaded.height / rows)),
      };
    },
    [loaded, isSheet, sheetFrames, gridOverride],
  );

  // ── Rebuild the frames ──
  useEffect(() => {
    let cancelled = false;
    setExtractError(null);
    if (!loaded || !movesAtAll) { setExtracted(null); return; }

    if (isSheet && layout) {
      try {
        setExtracted(framesFromSpriteSheet(loaded.image, layout, {
          frameCount: sheetFrames, fps, loopStyle,
        }));
      } catch (err) {
        setExtracted(null);
        setExtractError(err instanceof Error ? err.message : String(err));
      }
      return;
    }

    // A real animated file — decode it rather than guessing at a grid.
    (async () => {
      try {
        const blob = await (await fetch(loaded.objectUrl)).blob();
        const frames = await framesFromAnimatedFile(blob, loaded.contentType || 'image/gif');
        if (cancelled) return;
        setExtracted(frames);
        if (!frames) {
          setExtractError('This build could not decode the frames, so only the original file can be saved.');
        }
      } catch (err) {
        if (!cancelled) {
          setExtracted(null);
          setExtractError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => { cancelled = true; };
  }, [loaded, movesAtAll, isSheet, layout, sheetFrames, fps, loopStyle]);

  const canRebuild = !!extracted && extracted.frames.length > 1;

  /**
   * What the download will actually do.
   *
   * Anything that moves defaults to being rebuilt as a GIF, because that's the
   * only output that both moves and goes anywhere. The canvas path holds one
   * frame, so it is never chosen for an animation unless asked for; and
   * "original" is honest about what VRChat stores, which for an emoji is a
   * sprite sheet rather than an animation.
   */
  const mode: ExportSettings['animatedMode'] = !movesAtAll
    ? 'still'
    : (settings.animatedMode === 'gif' || settings.animatedMode === 'video') && !canRebuild
      ? 'original'
      : settings.animatedMode === 'video' && !videoFormat
        ? 'gif'
        : settings.animatedMode;

  const effective: ExportSettings = useMemo(
    () => (mode === 'original' ? { ...settings, format: 'original' as const } : settings),
    [settings, mode],
  );
  const keepsOriginal = effective.format === 'original';
  // GIF and video bypass the canvas pipeline entirely.
  const rebuilding = mode === 'gif' || mode === 'video';

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
    // Saving the original means the whole file, untouched — a crop box would
    // be a promise the export can't keep.
    if (keepsOriginal) return { x: 0, y: 0, width: loaded.width, height: loaded.height };
    return sourceBox(loaded, settings);
  }, [loaded, keepsOriginal, settings.border, settings.manualInset]);

  const cropped = !!(loaded && box &&
    (box.width !== loaded.width || box.height !== loaded.height));

  // ── Draw the preview: literally the export canvas, scaled to fit ──
  useEffect(() => {
    const host = previewRef.current;
    if (!host || !loaded || !box) return;
    // A rebuilt animation is previewed by playing the actual frames, so the
    // grid guess and the frame rate can be judged rather than trusted.
    if (rebuilding && extracted && extracted.frames.length > 0) {
      const canvas = document.createElement('canvas');
      canvas.width = extracted.width;
      canvas.height = extracted.height;
      canvas.style.maxWidth = '100%';
      canvas.style.maxHeight = '46vh';
      canvas.style.objectFit = 'contain';
      canvas.style.display = 'block';
      canvas.style.margin = '0 auto';
      canvas.style.imageRendering = extracted.width < 128 ? 'pixelated' : 'auto';
      const ctx = canvas.getContext('2d');
      host.replaceChildren(canvas);
      if (!ctx) return;

      let frame = 0;
      let timer: ReturnType<typeof setTimeout>;
      const tick = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.putImageData(extracted.frames[frame], 0, 0);
        const delay = extracted.delays[frame] ?? 100;
        frame = (frame + 1) % extracted.frames.length;
        timer = setTimeout(tick, delay);
      };
      tick();
      return () => clearTimeout(timer);
    }

    // The original is shown as the file itself, not a canvas render — that's
    // the only way the preview animates, and it's literally what gets saved.
    if (keepsOriginal) {
      const img = document.createElement('img');
      img.src = loaded.objectUrl;
      img.alt = item.name ?? item.kind;
      img.style.maxWidth = '100%';
      img.style.maxHeight = '46vh';
      img.style.objectFit = 'contain';
      img.style.display = 'block';
      img.style.margin = '0 auto';
      host.replaceChildren(img);
      return;
    }
    const canvas = renderExport(loaded, settings, box);
    canvas.style.maxWidth = '100%';
    canvas.style.maxHeight = '46vh';
    canvas.style.objectFit = 'contain';
    canvas.style.display = 'block';
    canvas.style.margin = '0 auto';
    host.replaceChildren(canvas);
  }, [loaded, box, settings, keepsOriginal, rebuilding, extracted, item.name, item.kind]);

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
    if (keepsOriginal) return { w: box.width, h: box.height };
    const pad = Math.max(0, Math.round(settings.padding));
    return {
      w: Math.max(1, Math.round(box.width * settings.scale)) + pad * 2,
      h: Math.max(1, Math.round(box.height * settings.scale)) + pad * 2,
    };
  }, [box, keepsOriginal, settings.scale, settings.padding]);

  const handleDownload = useCallback(async () => {
    if (!loaded || !box) return;
    setBusy(true);
    setError(null);
    try {
      let blob: Blob;
      let ext: string;

      if (mode === 'gif' && extracted) {
        setProgress('Encoding GIF…');
        // Yield a frame so the label paints before the encoder blocks.
        await new Promise(r => setTimeout(r, 0));
        blob = toGif(extracted, { scale: settings.scale });
        ext = 'gif';
      } else if (mode === 'video' && extracted && videoFormat) {
        // Recording runs in real time, so say how long it will take rather
        // than looking frozen.
        const seconds = Math.max(2, Math.round(
          extracted.delays.reduce((a, b) => a + b, 0) / 1000));
        setProgress(`Recording ${videoFormat.label}… about ${seconds}s`);
        blob = await toVideo(extracted, videoFormat, {
          fps,
          scale: settings.scale,
          background: backgroundForVideo(settings),
        });
        ext = videoFormat.extension;
      } else if (keepsOriginal) {
        // loadImage already pulled the bytes into a blob: URL, so read them
        // back rather than fetching the file a second time. If that blob has
        // gone (browser dev mode loads the URL directly), refetch.
        try {
          blob = await (await fetch(loaded.objectUrl)).blob();
        } catch {
          blob = (await fetchOriginal(item.url)).blob;
        }
        ext = exportExtension(effective, item.mediaExtension);
      } else {
        const canvas = renderExport(loaded, effective, box);
        blob = await canvasToBlob(canvas, effective);
        ext = exportExtension(effective, item.mediaExtension);
      }

      downloadBlob(blob, buildFilename(filenameTemplate, {
        name: item.name, kind: item.kind, id: item.id,
      }, ext));
      localStorage.setItem('vrcstudio_grabber_filename', filenameTemplate);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setProgress(null);
    setBusy(false);
  }, [loaded, box, effective, keepsOriginal, mode, extracted, videoFormat, fps, settings.scale, filenameTemplate, item]);

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
                <span>
                  Export{' '}
                  {rebuilding && extracted
                    ? `${Math.round(extracted.width * settings.scale)}×${Math.round(extracted.height * settings.scale)} · ${
                        mode === 'gif' ? 'GIF' : videoFormat?.label ?? 'video'
                      } · ${extracted.frames.length} frames at ${fps}fps`
                    : `${outputSize.w}×${outputSize.h} · ${
                        keepsOriginal
                          ? `original ${(item.mediaFormat ?? 'file').toUpperCase()}${isSheet ? ` sprite sheet, ${sheetFrames} frames` : ''}`
                          : effective.format.toUpperCase()
                      }`}
                </span>
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
                title={movesAtAll
                  ? 'Copies a still frame — the clipboard only takes PNG'
                  : 'Copy the rendered image to the clipboard'}
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
                {progress ?? (saved ? 'Saved' : 'Download')}
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
              {(keepsOriginal || rebuilding) && (
                <p className="text-[10px] text-amber-400/80 mt-1.5">
                  {rebuilding
                    ? 'Not applied — each frame is taken whole so the animation stays aligned.'
                    : 'Not applied — the original is saved whole. Switch to "Still frame" to crop.'}
                </p>
              )}
              {!keepsOriginal && !rebuilding && settings.border === 'auto' && (
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

            {movesAtAll && (
              <Field label="Animation" icon={Film}>
                <div className="flex gap-1.5 flex-wrap">
                  <Chip
                    active={mode === 'gif'}
                    disabled={!canRebuild}
                    onClick={() => update({ animatedMode: 'gif' })}
                  >
                    Animated GIF
                  </Chip>
                  <Chip
                    active={mode === 'video'}
                    disabled={!canRebuild || !videoFormat}
                    onClick={() => update({ animatedMode: 'video' })}
                  >
                    Video{videoFormat ? ` (${videoFormat.label})` : ''}
                  </Chip>
                  <Chip active={mode === 'original'} onClick={() => update({ animatedMode: 'original' })}>
                    {isSheet ? 'Sprite sheet' : 'Original file'}
                  </Chip>
                  <Chip active={mode === 'still'} onClick={() => update({ animatedMode: 'still' })}>
                    Still frame
                  </Chip>
                </div>

                {videoFormats.length > 1 && mode === 'video' && (
                  <div className="flex gap-1.5 mt-1.5">
                    {videoFormats.map(f => (
                      <Chip
                        key={f.extension}
                        active={settings.videoExtension === f.extension}
                        onClick={() => update({ videoExtension: f.extension as 'webm' | 'mp4' })}
                      >
                        {f.label}
                      </Chip>
                    ))}
                  </div>
                )}

                <p className="text-[10px] text-surface-500 mt-1.5">
                  {mode === 'gif'
                    ? 'Rebuilt frame by frame and encoded here. Plays anywhere an image is accepted, and keeps transparency — though GIF transparency is on-or-off, so soft edges harden.'
                    : mode === 'video'
                      ? 'Recorded frame by frame in real time, so this takes about as long as the clip runs. Video has no transparency, so clear pixels land on the background colour below.'
                      : mode === 'original'
                        ? isSheet
                          ? `Saves the PNG VRChat actually stores: all ${sheetFrames} frames laid out in a ${layout?.columns ?? '?'}×${layout?.rows ?? '?'} grid, not an animation.`
                          : `Saves the ${(item.mediaFormat ?? 'file').toUpperCase()} exactly as VRChat serves it. Cropping, scaling and padding don't apply to an untouched file.`
                        : 'One frame through the canvas, so the border, size and format controls all apply.'}
                </p>

                {isSheet && (
                  <p className="text-[10px] text-surface-500 mt-1">
                    VRChat stores this as a sprite sheet — {sheetFrames} frames at{' '}
                    {item.spriteFps ?? '?'}fps
                    {item.spriteLoopStyle === 'pingpong' && ', ping-pong looping'}
                    {item.animationStyle && <> · style <span className="text-surface-400">{item.animationStyle}</span></>}.
                  </p>
                )}
                {extractError && (
                  <p className="text-[10px] text-amber-400/80 mt-1">{extractError}</p>
                )}

                {/* The grid is deduced from the image size, not published by
                    VRChat, so it has to be correctable when the guess is off. */}
                {isSheet && layout && (
                  <div className="mt-2 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap text-[10px] text-surface-500">
                      <span>Grid</span>
                      <NumberBox
                        value={layout.columns}
                        min={1} max={sheetFrames}
                        onChange={v => setGridOverride({ columns: v, rows: Math.ceil(sheetFrames / v) })}
                      />
                      <span>×</span>
                      <NumberBox
                        value={layout.rows}
                        min={1} max={sheetFrames}
                        onChange={v => setGridOverride({ columns: Math.ceil(sheetFrames / v), rows: v })}
                      />
                      <span className="text-surface-600">
                        {layout.frameWidth}×{layout.frameHeight} per frame
                      </span>
                      {gridOverride && (
                        <button onClick={() => setGridOverride(null)} className="text-accent-400 hover:underline">
                          reset
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap text-[10px] text-surface-500">
                      <span>Speed</span>
                      <NumberBox value={fps} min={1} max={64} onChange={v => setFpsOverride(v)} />
                      <span>fps</span>
                      <Chip active={loopStyle === 'linear'} onClick={() => setLoopOverride('linear')}>Loop</Chip>
                      <Chip active={loopStyle === 'pingpong'} onClick={() => setLoopOverride('pingpong')}>Ping-pong</Chip>
                    </div>
                  </div>
                )}
              </Field>
            )}

            <Field label="Format">
              <div className="flex gap-1.5 flex-wrap">
                {(['png', 'jpeg', 'webp', 'original'] as const).map(f => (
                  <Chip
                    key={f}
                    active={!rebuilding && effective.format === f}
                    disabled={rebuilding || (keepsOriginal && f !== 'original')}
                    onClick={() => update(
                      // Picking a still format for something animated is also a
                      // decision to flatten it — say so rather than being
                      // overruled by animatedMode a moment later.
                      f === 'original'
                        ? { format: f, animatedMode: 'original' }
                        : { format: f, ...(movesAtAll ? { animatedMode: 'still' as const } : null) },
                    )}
                  >
                    {f === 'original' ? 'Original' : f.toUpperCase()}
                  </Chip>
                ))}
              </div>
              {rebuilding && (
                <p className="text-[10px] text-surface-500 mt-1.5">
                  Set by the Animation choice above — a {mode === 'gif' ? 'GIF' : 'video'} isn't
                  encoded through the canvas.
                </p>
              )}
              {!rebuilding && effective.format === 'original' && !movesAtAll && (
                <p className="text-[10px] text-surface-500 mt-1.5">
                  Saves the file byte for byte — nothing re-encoded, no crop, no resize.
                </p>
              )}
              {!keepsOriginal && !rebuilding && settings.format !== 'png' && (
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
              {!keepsOriginal && !rebuilding && settings.format === 'jpeg' && settings.background === 'transparent' && (
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
                    exportExtension(effective, item.mediaExtension))}
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
            <div className="flex gap-3">
              <span className="text-surface-600 w-16 flex-shrink-0">File</span>
              <span className="text-surface-400">
                {item.inspectedAt
                  ? item.inspectError
                    ? <span className="text-amber-400">couldn't be read — {item.inspectError}</span>
                    : <>
                        {(item.mediaFormat ?? 'unknown').toUpperCase()}
                        {item.imageWidth && item.imageHeight && <> · {item.imageWidth}×{item.imageHeight}</>}
                        {item.animated
                          ? <span className="text-emerald-400">
                              {' '}· animated{item.frameCount ? ` (${item.frameCount} frames)` : ''}
                            </span>
                          // A sprite sheet genuinely IS a still file. Saying so
                          // and then saying it animates isn't a contradiction —
                          // it's the whole reason a rebuild is needed.
                          : isSheet
                            ? <span className="text-surface-500"> · still sprite sheet</span>
                            : <span className="text-surface-500"> · still image</span>}
                      </>
                  : <span className="text-surface-600">checking…</span>}
              </span>
            </div>
            {(isSheet || item.spriteAnimated) && (
              <div className="flex gap-3">
                <span className="text-surface-600 w-16 flex-shrink-0">Animation</span>
                <span className="text-emerald-400">
                  {isSheet
                    ? <>
                        {sheetFrames} frames at {item.spriteFps ?? '?'}fps
                        {item.spriteLoopStyle === 'pingpong' && ', ping-pong'}
                        {layout && <span className="text-surface-500"> · {layout.columns}×{layout.rows} grid</span>}
                      </>
                    : 'VRChat marks this as animated'}
                  {item.animationStyle && <span className="text-surface-500"> · {item.animationStyle}</span>}
                </span>
              </div>
            )}
            {item.itemType && (
              <div className="flex gap-3">
                <span className="text-surface-600 w-16 flex-shrink-0">Type</span>
                <span className="text-surface-400">{item.itemType}</span>
              </div>
            )}
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

/** A tight numeric input for grid and frame-rate overrides. */
function NumberBox({ value, min, max, onChange }: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      onChange={e => {
        const v = Number(e.target.value);
        if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, Math.round(v))));
      }}
      className="w-14 bg-surface-900 text-surface-200 px-1.5 py-0.5 rounded border border-surface-700 focus:outline-none focus:border-accent-500 text-[11px] tabular-nums"
    />
  );
}

function Chip({ active, onClick, children, disabled }: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`text-[11px] px-2.5 py-1 rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        active
          ? 'border-accent-500 bg-accent-500/10 text-accent-300'
          : 'border-surface-700 text-surface-400 hover:border-surface-600'
      }`}
    >
      {children}
    </button>
  );
}
