// Fetching remote images, and working out what they actually are.
//
// Two jobs live here because they share the same fetch:
//
//   1. The Instance Grabber needs to know whether a file is a still picture or
//      an animation. VRChat serves everything from `/api/1/file/<id>/1/file`
//      with no extension and, often, a generic content-type — so the only
//      honest answer comes from the bytes. An animated emoji re-encoded
//      through a canvas silently loses every frame but the first, so this
//      decides whether a download may be re-rendered at all.
//
//   2. Discord Rich Presence can take an image URL instead of an uploaded
//      asset key, but Discord's media proxy fetches that URL itself, with no
//      VRChat session. Our own window renders those URLs fine because Electron
//      carries the login cookie; Discord has no such thing, gets a 401, and
//      draws the grey "?" box. Probing the URL the way a stranger would is
//      the only way to know before we send it.

import * as http from 'http';
import * as https from 'https';

export interface FetchResult {
  ok: boolean;
  status: number;
  contentType: string;
  buffer?: Buffer;
  /** Where we ended up after redirects — may differ from the URL asked for. */
  finalUrl: string;
  /** True when the body was cut short because a byte cap was hit. */
  truncated?: boolean;
  error?: string;
}

export interface FetchOptions {
  headers?: Record<string, string>;
  /** Stop reading after this many bytes. */
  maxBytes?: number;
  /** Ask the server for only the first `maxBytes`; harmless if unsupported. */
  useRange?: boolean;
  timeoutMs?: number;
  userAgent?: string;
}

const DEFAULT_MAX = 32 * 1024 * 1024;

export function fetchBuffer(url: string, opts: FetchOptions = {}): Promise<FetchResult> {
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX;

  const attempt = (targetUrl: string, hops: number): Promise<FetchResult> => new Promise((resolve) => {
    let parsed: URL;
    try { parsed = new URL(targetUrl); } catch {
      return resolve({ ok: false, status: 0, contentType: '', finalUrl: targetUrl, error: 'Invalid URL' });
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return resolve({ ok: false, status: 0, contentType: '', finalUrl: targetUrl, error: 'Unsupported protocol' });
    }

    const headers: Record<string, string> = {
      'User-Agent': opts.userAgent ?? 'VRCX',
      'Accept': 'image/*,*/*',
      ...(opts.useRange ? { Range: `bytes=0-${maxBytes - 1}` } : {}),
      ...opts.headers,
    };

    const mod = parsed.protocol === 'http:' ? http : https;
    const req = mod.request(
      {
        hostname: parsed.hostname,
        port: parsed.port ? Number(parsed.port) : (parsed.protocol === 'http:' ? 80 : 443),
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location && hops < 4) {
          const next = new URL(res.headers.location, parsed).toString();
          res.resume();
          return resolve(attempt(next, hops + 1));
        }

        const chunks: Buffer[] = [];
        let size = 0;
        let truncated = false;
        res.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes) {
            // Keep what fits, then stop — a capped read is a valid result
            // when all we needed was the header of the file.
            truncated = true;
            chunks.push(chunk.subarray(0, Math.max(0, chunk.length - (size - maxBytes))));
            res.destroy();
            return;
          }
          chunks.push(chunk);
        });
        let settled = false;
        const finish = () => {
          // 'end' and 'close' can both fire; the first one wins.
          if (settled) return;
          settled = true;
          const ok = status >= 200 && status < 300;
          resolve({
            ok,
            status,
            contentType: String(res.headers['content-type'] ?? '').split(';')[0].trim(),
            buffer: ok ? Buffer.concat(chunks) : undefined,
            finalUrl: parsed.toString(),
            truncated,
            error: ok ? undefined : `HTTP ${status}`,
          });
        };
        res.on('end', finish);
        res.on('close', finish);
      },
    );
    req.on('error', err => resolve({ ok: false, status: 0, contentType: '', finalUrl: targetUrl, error: err.message }));
    req.setTimeout(opts.timeoutMs ?? 20000, () => req.destroy(new Error('Request timeout')));
    req.end();
  });

  return attempt(url, 0);
}

// ── Format sniffing ─────────────────────────────────────────────────────────

export type ImageFormat = 'gif' | 'png' | 'apng' | 'webp' | 'jpeg' | 'avif' | 'bmp' | 'svg' | 'unknown';

export interface ImageInfo {
  format: ImageFormat;
  /** True only when the bytes prove more than one frame. */
  animated: boolean;
  /** Frames, when the container states it outright (APNG/animated WebP). */
  frameCount?: number;
  width?: number;
  height?: number;
  /** Extension to save the original bytes under. */
  extension: string;
  mimeType: string;
}

const EXT: Record<ImageFormat, string> = {
  gif: 'gif', png: 'png', apng: 'png', webp: 'webp', jpeg: 'jpg',
  avif: 'avif', bmp: 'bmp', svg: 'svg', unknown: 'png',
};
const MIME: Record<ImageFormat, string> = {
  gif: 'image/gif', png: 'image/png', apng: 'image/apng', webp: 'image/webp',
  jpeg: 'image/jpeg', avif: 'image/avif', bmp: 'image/bmp', svg: 'image/svg+xml',
  unknown: 'application/octet-stream',
};

function ascii(buf: Buffer, start: number, len: number): string {
  return buf.subarray(start, start + len).toString('latin1');
}

/**
 * Identify an image from its leading bytes.
 *
 * `animated` is only ever true when the container says so — a GIF with one
 * frame, a plain PNG and a lossy WebP all come back false. The caller uses
 * that to decide whether re-encoding through a canvas is lossless or destroys
 * the animation, so a false positive is worse than an unknown.
 */
export function sniffImage(buf: Buffer): ImageInfo {
  const base = (format: ImageFormat, rest: Partial<ImageInfo> = {}): ImageInfo => ({
    format, animated: false, extension: EXT[format], mimeType: MIME[format], ...rest,
  });
  if (buf.length < 12) return base('unknown');

  // ── GIF ──
  if (ascii(buf, 0, 3) === 'GIF') {
    const width = buf.readUInt16LE(6);
    const height = buf.readUInt16LE(8);
    // Every frame after the first is introduced by a Graphic Control
    // Extension (0x21 0xF9 0x04). Counting those is the standard heuristic:
    // it can't undercount, and a stray match inside pixel data would need the
    // exact three-byte run, which is rare enough to accept.
    let frames = 0;
    for (let i = 0; i + 2 < buf.length; i++) {
      if (buf[i] === 0x21 && buf[i + 1] === 0xf9 && buf[i + 2] === 0x04) frames++;
      if (frames > 1) break;
    }
    return base('gif', { animated: frames > 1, frameCount: frames || undefined, width, height });
  }

  // ── PNG / APNG ──
  if (buf.length > 8 && buf.readUInt32BE(0) === 0x89504e47 && buf.readUInt32BE(4) === 0x0d0a1a0a) {
    let width: number | undefined;
    let height: number | undefined;
    let animated = false;
    let frameCount: number | undefined;
    let off = 8;
    while (off + 8 <= buf.length) {
      const len = buf.readUInt32BE(off);
      const type = ascii(buf, off + 4, 4);
      if (type === 'IHDR' && off + 16 <= buf.length) {
        width = buf.readUInt32BE(off + 8);
        height = buf.readUInt32BE(off + 12);
      }
      // acTL is the APNG animation control chunk and always precedes IDAT.
      if (type === 'acTL' && off + 12 <= buf.length) {
        animated = true;
        frameCount = buf.readUInt32BE(off + 8);
        break;
      }
      if (type === 'IDAT' || type === 'IEND') break;
      off += 12 + len;
      if (len < 0 || off <= 0) break;
    }
    return base(animated ? 'apng' : 'png', { animated, frameCount, width, height });
  }

  // ── WebP ──
  if (ascii(buf, 0, 4) === 'RIFF' && ascii(buf, 8, 4) === 'WEBP') {
    const chunk = ascii(buf, 12, 4);
    if (chunk === 'VP8X' && buf.length > 30) {
      const flags = buf[20];
      const animated = (flags & 0x02) !== 0;
      // 24-bit little-endian, stored as (dimension - 1).
      const width = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
      const height = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
      let frameCount: number | undefined;
      if (animated) {
        frameCount = 0;
        for (let i = 12; i + 4 <= buf.length; i++) {
          if (buf[i] === 0x41 && ascii(buf, i, 4) === 'ANMF') frameCount++;
        }
        frameCount = frameCount || undefined;
      }
      return base('webp', { animated, frameCount, width, height });
    }
    return base('webp');
  }

  // ── JPEG ──
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return base('jpeg');

  // ── AVIF (the 'avis' brand is an image sequence) ──
  if (ascii(buf, 4, 4) === 'ftyp') {
    const brand = ascii(buf, 8, 4);
    if (brand === 'avif' || brand === 'avis') {
      return base('avif', { animated: brand === 'avis' });
    }
  }

  if (buf[0] === 0x42 && buf[1] === 0x4d) return base('bmp');
  const head = ascii(buf, 0, Math.min(256, buf.length)).trimStart();
  if (head.startsWith('<svg') || head.startsWith('<?xml')) return base('svg');

  return base('unknown');
}

/** Fetch just enough of an image to identify it. */
export async function inspectImage(url: string): Promise<ImageInfo & { ok: boolean; status: number; error?: string }> {
  // 512 KB covers the header of anything, and reaches the second frame of any
  // emoji- or sticker-sized GIF. Bigger files simply report what's in range.
  const res = await fetchBuffer(url, { maxBytes: 512 * 1024, useRange: true, timeoutMs: 15000 });
  if (!res.ok || !res.buffer) {
    return {
      ok: false, status: res.status, error: res.error ?? 'Could not fetch image',
      format: 'unknown', animated: false, extension: 'png', mimeType: 'application/octet-stream',
    };
  }
  const info = sniffImage(res.buffer);
  // A server that names the type outright beats a guess of 'unknown'.
  if (info.format === 'unknown' && res.contentType.startsWith('image/')) {
    return { ...info, ok: true, status: res.status, mimeType: res.contentType };
  }
  return { ...info, ok: true, status: res.status };
}

// ── Presence image probing ──────────────────────────────────────────────────

export interface PresenceProbe {
  url: string;
  ok: boolean;
  status: number;
  /** The URL to actually send, once redirects are resolved. */
  finalUrl?: string;
  contentType?: string;
  reason?: string;
  at: number;
}

const probeCache = new Map<string, PresenceProbe>();
const PROBE_TTL = 6 * 60 * 60 * 1000;
const PROBE_MISS_TTL = 10 * 60 * 1000;

/**
 * Can a third party load this image?
 *
 * Deliberately sends no cookies and no VRChat headers, because Discord's media
 * proxy has neither. A 401 here means Discord gets a 401 too, and sending the
 * URL anyway is what produces the "?" box.
 */
export async function probePresenceImage(url: string): Promise<PresenceProbe> {
  const cached = probeCache.get(url);
  const ttl = cached?.ok ? PROBE_TTL : PROBE_MISS_TTL;
  if (cached && Date.now() - cached.at < ttl) return cached;

  const res = await fetchBuffer(url, {
    maxBytes: 4096,
    useRange: true,
    timeoutMs: 10000,
    userAgent: 'Mozilla/5.0 (compatible; VRCStudio/1.0; +https://github.com/DoNotPetMe/VRCStudio)',
  });

  const looksLikeImage = res.contentType.startsWith('image/')
    || (!!res.buffer && sniffImage(res.buffer).format !== 'unknown');

  const probe: PresenceProbe = {
    url,
    ok: res.ok && looksLikeImage,
    status: res.status,
    finalUrl: res.ok ? res.finalUrl : undefined,
    contentType: res.contentType || undefined,
    reason: res.ok
      ? (looksLikeImage ? undefined : `Served ${res.contentType || 'something that is not an image'}`)
      : res.status === 401 || res.status === 403
        ? `VRChat will not serve this image without a login (HTTP ${res.status}), so Discord cannot load it either`
        : res.error ?? `HTTP ${res.status}`,
    at: Date.now(),
  };
  probeCache.set(url, probe);
  // The cache is per-URL and world/avatar images churn; keep it bounded.
  if (probeCache.size > 200) {
    const oldest = [...probeCache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) probeCache.delete(oldest[0]);
  }
  return probe;
}

export function recentPresenceProbes(limit = 4): PresenceProbe[] {
  return [...probeCache.values()].sort((a, b) => b.at - a.at).slice(0, limit);
}

// ── Presence image vetting ──────────────────────────────────────────────────

export interface PresenceImages {
  largeImageKey?: string;
  largeImageText?: string;
  smallImageKey?: string;
  smallImageText?: string;
  /** Asset key to fall back to when a picture can't be used. */
  fallbackImageKey?: string;
}

/**
 * Replace image URLs Discord can't actually load.
 *
 * Discord accepts a URL in place of an uploaded asset key, but its media proxy
 * fetches that URL itself with no VRChat session. Our own window renders
 * `api.vrchat.cloud` images because Electron sends the login cookie; Discord
 * doesn't have one, gets a 401, and draws the grey "?" box — which looks
 * identical to a broken app and is exactly what was being reported.
 *
 * So every URL is probed first, cookie-free, the way a stranger sees it. One
 * that answers with a real image is sent, resolved past any redirect, since
 * the CDN it lands on is usually the publicly readable half. One that doesn't
 * is swapped for the app's own asset key, so the card shows an icon rather
 * than a placeholder, and the reason comes back for the diagnostics panel.
 */
export async function vetPresenceImages<T extends PresenceImages>(
  activity: T,
): Promise<{ activity: T; issues: string[] }> {
  const issues: string[] = [];

  const vet = async (value: string | undefined, slot: string): Promise<string | undefined> => {
    if (!value) return undefined;
    // Anything that isn't a URL is an asset key — Discord resolves those itself.
    if (!/^https?:\/\//i.test(value)) return value;
    // Discord's field cap; an over-long URL is rejected outright.
    if (value.length > 256) {
      issues.push(`${slot}: URL too long for Discord (${value.length} characters)`);
      return undefined;
    }
    try {
      const probe = await probePresenceImage(value);
      if (probe.ok) return probe.finalUrl ?? value;
      issues.push(`${slot}: ${probe.reason ?? `HTTP ${probe.status}`}`);
    } catch (err) {
      issues.push(`${slot}: ${err instanceof Error ? err.message : String(err)}`);
    }
    return undefined;
  };

  const fallback = activity.fallbackImageKey?.trim() || undefined;
  const large = (await vet(activity.largeImageKey, 'Large image')) ?? fallback;
  const small = await vet(activity.smallImageKey, 'Small image');

  return {
    issues,
    activity: {
      ...activity,
      largeImageKey: large,
      // A badge with no large image behind it renders oddly, and promoting the
      // fallback into both slots would show the same picture twice.
      smallImageKey: large ? small : undefined,
      largeImageText: large ? activity.largeImageText : undefined,
      smallImageText: large && small ? activity.smallImageText : undefined,
    },
  };
}
