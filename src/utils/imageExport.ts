// Loading and re-rendering gallery images for download.
//
// Two things make this less trivial than drawImage + toBlob:
//
//   1. VRChat's CDN sends no CORS headers, so an <img> pointed straight at it
//      taints any canvas it's drawn on and toBlob() throws a SecurityError.
//      We pull the bytes through the main process instead and load them from
//      a blob: URL, which is same-origin and exports cleanly.
//
//   2. "Without borders" can't be a fixed crop. A VRChat print has a photo
//      frame; a sticker has transparent padding; an emoji may have neither.
//      So we detect the border rather than assume it: sample the outer ring,
//      and if it's uniform, walk inward until the pixels stop matching.

export interface ExportSettings {
  /** keep = as-is, auto = detect and trim the frame, manual = fixed inset. */
  border: 'keep' | 'auto' | 'manual';
  /** Percent of each edge to trim when border === 'manual'. */
  manualInset: number;
  format: 'png' | 'jpeg' | 'webp';
  quality: number;          // 0.1–1, lossy formats only
  scale: number;            // 1 = native pixels
  background: 'transparent' | 'white' | 'black' | 'custom';
  customBackground: string;
  padding: number;          // px added around the image, post-scale
  cornerRadius: number;     // px, 0 = square
}

export const DEFAULT_EXPORT: ExportSettings = {
  border: 'keep',
  manualInset: 5,
  format: 'png',
  quality: 0.92,
  scale: 1,
  background: 'transparent',
  customBackground: '#0f172a',
  padding: 0,
  cornerRadius: 0,
};

export interface LoadedImage {
  image: HTMLImageElement;
  objectUrl: string;
  width: number;
  height: number;
  contentType: string;
}

/**
 * Fetch an image through the main process and decode it from a blob URL, so
 * the resulting canvas stays exportable. Falls back to a direct <img> load
 * outside Electron (browser dev mode), where export may then be blocked.
 */
export async function loadImage(url: string): Promise<LoadedImage> {
  const api = window.electronAPI;

  if (api?.httpGetBinary) {
    const res = await api.httpGetBinary(url);
    if (!res.ok || !res.base64) {
      throw new Error(res.error ?? `Could not fetch image (HTTP ${res.status})`);
    }
    const type = res.contentType?.split(';')[0] || 'image/png';
    const bytes = base64ToBytes(res.base64);
    const blob = new Blob([bytes], { type });
    const objectUrl = URL.createObjectURL(blob);
    const image = await decode(objectUrl);
    return { image, objectUrl, width: image.naturalWidth, height: image.naturalHeight, contentType: type };
  }

  const image = await decode(url, true);
  return { image, objectUrl: url, width: image.naturalWidth, height: image.naturalHeight, contentType: '' };
}

function base64ToBytes(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const buffer = new ArrayBuffer(bin.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < bin.length; i++) view[i] = bin.charCodeAt(i);
  return buffer;
}

function decode(src: string, crossOrigin = false): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image failed to decode'));
    img.src = src;
  });
}

export interface Box { x: number; y: number; width: number; height: number }

/**
 * Find the picture inside a bordered image.
 *
 * Works for both kinds of border we care about: a solid frame (VRChat prints)
 * and transparent padding (stickers and emoji). Returns the full frame when
 * the edges aren't uniform enough to call it a border, so "auto" is safe to
 * leave on for images that have none.
 */
export function detectContentBox(data: ImageData, tolerance = 22): Box {
  const { width: W, height: H, data: px } = data;
  const full: Box = { x: 0, y: 0, width: W, height: H };
  if (W < 8 || H < 8) return full;

  const at = (x: number, y: number) => {
    const i = (y * W + x) * 4;
    return [px[i], px[i + 1], px[i + 2], px[i + 3]] as const;
  };

  // The border colour is whatever the corners agree on.
  const corners = [at(0, 0), at(W - 1, 0), at(0, H - 1), at(W - 1, H - 1)];
  const ref = corners[0];
  const cornersAgree = corners.every(c => close(c, ref, tolerance));
  if (!cornersAgree) return full;

  // A fully transparent corner means the padding is alpha, not colour.
  const alphaBorder = ref[3] < 8;

  const isBorderPixel = (x: number, y: number) => {
    const p = at(x, y);
    return alphaBorder ? p[3] < 8 : close(p, ref, tolerance);
  };

  // Sample rather than test every pixel — 64 points per line is plenty and
  // keeps this fast on 4K prints.
  const rowIsBorder = (y: number) => {
    const step = Math.max(1, Math.floor(W / 64));
    for (let x = 0; x < W; x += step) if (!isBorderPixel(x, y)) return false;
    return true;
  };
  const colIsBorder = (x: number) => {
    const step = Math.max(1, Math.floor(H / 64));
    for (let y = 0; y < H; y += step) if (!isBorderPixel(x, y)) return false;
    return true;
  };

  let top = 0, bottom = H - 1, left = 0, right = W - 1;
  while (top < bottom && rowIsBorder(top)) top++;
  while (bottom > top && rowIsBorder(bottom)) bottom--;
  while (left < right && colIsBorder(left)) left++;
  while (right > left && colIsBorder(right)) right--;

  const width = right - left + 1;
  const height = bottom - top + 1;

  // Nothing trimmed, or trimmed to nothing → treat as "no border".
  if (width < 8 || height < 8) return full;
  if (width === W && height === H) return full;
  return { x: left, y: top, width, height };
}

function close(a: readonly number[], b: readonly number[], tol: number): boolean {
  return Math.abs(a[0] - b[0]) <= tol
      && Math.abs(a[1] - b[1]) <= tol
      && Math.abs(a[2] - b[2]) <= tol
      && Math.abs(a[3] - b[3]) <= tol;
}

/** The source rectangle an export will take, given the settings. */
export function sourceBox(loaded: LoadedImage, settings: ExportSettings): Box {
  const { width: W, height: H } = loaded;
  if (settings.border === 'keep') return { x: 0, y: 0, width: W, height: H };

  if (settings.border === 'manual') {
    const ix = Math.round((W * settings.manualInset) / 100);
    const iy = Math.round((H * settings.manualInset) / 100);
    return {
      x: ix, y: iy,
      width: Math.max(1, W - ix * 2),
      height: Math.max(1, H - iy * 2),
    };
  }

  // auto — needs pixels, so this runs on an offscreen canvas
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return { x: 0, y: 0, width: W, height: H };
  ctx.drawImage(loaded.image, 0, 0);
  try {
    return detectContentBox(ctx.getImageData(0, 0, W, H));
  } catch {
    // Tainted canvas (browser mode without the binary fetch) — keep it whole.
    return { x: 0, y: 0, width: W, height: H };
  }
}

function backgroundColor(s: ExportSettings): string | null {
  switch (s.background) {
    case 'white': return '#ffffff';
    case 'black': return '#000000';
    case 'custom': return s.customBackground;
    default: return null;
  }
}

/** Render the export to a canvas, applying crop, scale, padding and corners. */
export function renderExport(loaded: LoadedImage, settings: ExportSettings, box?: Box): HTMLCanvasElement {
  const src = box ?? sourceBox(loaded, settings);
  const scale = Math.max(0.05, settings.scale);
  const pad = Math.max(0, Math.round(settings.padding));

  const innerW = Math.max(1, Math.round(src.width * scale));
  const innerH = Math.max(1, Math.round(src.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = innerW + pad * 2;
  canvas.height = innerH + pad * 2;

  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // JPEG has no alpha — force an opaque backdrop so it doesn't come out black.
  const bg = backgroundColor(settings) ?? (settings.format === 'jpeg' ? '#ffffff' : null);
  if (bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  if (settings.cornerRadius > 0) {
    const r = Math.min(settings.cornerRadius, innerW / 2, innerH / 2);
    ctx.save();
    roundedRect(ctx, pad, pad, innerW, innerH, r);
    ctx.clip();
    ctx.drawImage(loaded.image, src.x, src.y, src.width, src.height, pad, pad, innerW, innerH);
    ctx.restore();
  } else {
    ctx.drawImage(loaded.image, src.x, src.y, src.width, src.height, pad, pad, innerW, innerH);
  }

  return canvas;
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function canvasToBlob(canvas: HTMLCanvasElement, settings: ExportSettings): Promise<Blob> {
  const mime = settings.format === 'jpeg' ? 'image/jpeg'
    : settings.format === 'webp' ? 'image/webp'
    : 'image/png';
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => blob ? resolve(blob) : reject(new Error('Could not encode the image')),
      mime,
      settings.format === 'png' ? undefined : settings.quality,
    );
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Filesystem-safe filename from a template with {name}/{kind}/{id}/{date}. */
export function buildFilename(
  template: string,
  vars: { name?: string; kind: string; id: string; date?: Date },
  ext: string,
): string {
  const date = vars.date ?? new Date();
  const stamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const filled = template
    .replace(/\{name\}/g, vars.name ?? vars.kind)
    .replace(/\{kind\}/g, vars.kind)
    .replace(/\{id\}/g, vars.id.slice(0, 20))
    .replace(/\{date\}/g, stamp);
  const safe = filled.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim() || 'vrchat-image';
  return `${safe}.${ext}`;
}
