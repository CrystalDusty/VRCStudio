import { useState, useRef, useCallback, useEffect } from 'react';
import { Camera, Upload, FolderOpen, X, Globe, Calendar, Printer, Download, Type, Paintbrush, Sliders } from 'lucide-react';
import { format } from 'date-fns';
import EmptyState from '../components/common/EmptyState';
import { useAuthStore } from '../stores/authStore';

interface ScreenshotEntry {
  id: string;
  src: string;
  name: string;
  size: number;
  takenAt: number;
  worldName?: string;
  worldId?: string;
  notes?: string;
}

const SCREENSHOTS_KEY = 'vrcstudio_screenshots_meta';

function loadMeta(): Record<string, Partial<ScreenshotEntry>> {
  try {
    const raw = localStorage.getItem(SCREENSHOTS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveMeta(meta: Record<string, Partial<ScreenshotEntry>>) {
  localStorage.setItem(SCREENSHOTS_KEY, JSON.stringify(meta));
}

// --- Photo Print Creator ---

type BorderType = 'none' | 'simple' | 'thick' | 'shadow' | 'neon' | 'grunge' | 'pixel' | 'hearts' | 'stars' | 'glitch' | 'fire' | 'rainbow' | 'metallic' | 'soft-glow' | 'film-strip' | 'neon-tube' | 'hologram' | 'retro-pixel' | 'watercolor' | 'chain-link';

interface PrintSettings {
  showUsername: boolean;
  showDate: boolean;
  showWorldName: boolean;
  showCustomText: boolean;
  customText: string;
  position: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';
  style: 'classic' | 'polaroid' | 'minimal' | 'strip';
  fontSize: number;
  border: BorderType;
  printSize: 'fit' | '2048' | '1024' | 'custom';
  customPrintSize?: { width: number; height: number };
}

const defaultPrintSettings: PrintSettings = {
  showUsername: true,
  showDate: true,
  showWorldName: true,
  showCustomText: false,
  customText: '',
  position: 'bottom-left',
  style: 'classic',
  fontSize: 24,
  border: 'none',
  printSize: 'fit',
};

function drawBorder(ctx: CanvasRenderingContext2D, w: number, h: number, border: BorderType) {
  if (border === 'none') return;

  ctx.save();

  if (border === 'simple') {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, w - 4, h - 4);
  } else if (border === 'thick') {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 12;
    ctx.strokeRect(6, 6, w - 12, h - 12);
  } else if (border === 'shadow') {
    // Inset shadow effect
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(0,0,0,0.6)');
    grad.addColorStop(0.08, 'rgba(0,0,0,0)');
    grad.addColorStop(0.92, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    const gradH = ctx.createLinearGradient(0, 0, w, 0);
    gradH.addColorStop(0, 'rgba(0,0,0,0.5)');
    gradH.addColorStop(0.08, 'rgba(0,0,0,0)');
    gradH.addColorStop(0.92, 'rgba(0,0,0,0)');
    gradH.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = gradH;
    ctx.fillRect(0, 0, w, h);
  } else if (border === 'neon') {
    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur = 15;
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 3;
    ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.shadowColor = '#ff00ff';
    ctx.shadowBlur = 15;
    ctx.strokeStyle = '#ff00ff';
    ctx.lineWidth = 2;
    ctx.strokeRect(12, 12, w - 24, h - 24);
    ctx.shadowBlur = 0;
  } else if (border === 'grunge') {
    const seed = 42;
    for (let i = 0; i < 300; i++) {
      const side = i % 4;
      let x: number, y: number;
      const rng = Math.sin(seed + i * 127.1) * 0.5 + 0.5;
      const size = 3 + rng * 8;
      if (side === 0) { x = rng * w; y = rng * 20; }
      else if (side === 1) { x = rng * w; y = h - rng * 20; }
      else if (side === 2) { x = rng * 20; y = rng * h; }
      else { x = w - rng * 20; y = rng * h; }
      ctx.fillStyle = `rgba(${60 + rng * 40}, ${40 + rng * 30}, ${30 + rng * 20}, ${0.4 + rng * 0.4})`;
      ctx.fillRect(x, y, size, size);
    }
  } else if (border === 'pixel') {
    const pxSize = 8;
    const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ffffff'];
    for (let x = 0; x < w; x += pxSize) {
      const c = colors[(x / pxSize) % colors.length];
      ctx.fillStyle = c;
      ctx.fillRect(x, 0, pxSize, pxSize);
      ctx.fillRect(x, h - pxSize, pxSize, pxSize);
    }
    for (let y = pxSize; y < h - pxSize; y += pxSize) {
      const c = colors[(y / pxSize) % colors.length];
      ctx.fillStyle = c;
      ctx.fillRect(0, y, pxSize, pxSize);
      ctx.fillRect(w - pxSize, y, pxSize, pxSize);
    }
  } else if (border === 'hearts') {
    ctx.fillStyle = '#ff4488';
    const drawHeart = (cx: number, cy: number, size: number) => {
      ctx.beginPath();
      ctx.moveTo(cx, cy + size / 4);
      ctx.bezierCurveTo(cx, cy, cx - size / 2, cy, cx - size / 2, cy + size / 4);
      ctx.bezierCurveTo(cx - size / 2, cy + size / 2, cx, cy + size * 0.7, cx, cy + size * 0.85);
      ctx.bezierCurveTo(cx, cy + size * 0.7, cx + size / 2, cy + size / 2, cx + size / 2, cy + size / 4);
      ctx.bezierCurveTo(cx + size / 2, cy, cx, cy, cx, cy + size / 4);
      ctx.fill();
    };
    const step = 40;
    for (let x = 20; x < w; x += step) { drawHeart(x, 6, 18); drawHeart(x, h - 20, 18); }
    for (let y = 30; y < h - 30; y += step) { drawHeart(8, y, 18); drawHeart(w - 14, y, 18); }
  } else if (border === 'stars') {
    ctx.fillStyle = '#ffd700';
    const drawStar = (cx: number, cy: number, r: number) => {
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const angle = (i * 4 * Math.PI) / 5 - Math.PI / 2;
        const method = i === 0 ? 'moveTo' : 'lineTo';
        ctx[method](cx + r * Math.cos(angle), cy + r * Math.sin(angle));
      }
      ctx.closePath();
      ctx.fill();
    };
    const step = 35;
    for (let x = 12; x < w; x += step) { drawStar(x, 10, 8); drawStar(x, h - 10, 8); }
    for (let y = 25; y < h - 25; y += step) { drawStar(10, y, 8); drawStar(w - 10, y, 8); }
  } else if (border === 'glitch') {
    const colors = ['rgba(255,0,0,0.6)', 'rgba(0,255,0,0.5)', 'rgba(0,0,255,0.5)', 'rgba(255,0,255,0.4)'];
    for (let i = 0; i < 20; i++) {
      const rng = Math.sin(i * 73.7) * 0.5 + 0.5;
      const barH = 3 + rng * 12;
      const y = rng * h;
      ctx.fillStyle = colors[i % colors.length];
      if (i % 2 === 0) {
        ctx.fillRect(0, y, 15 + rng * 30, barH);
      } else {
        ctx.fillRect(w - 15 - rng * 30, y, 15 + rng * 30, barH);
      }
    }
  } else if (border === 'fire') {
    const gradTop = ctx.createLinearGradient(0, 0, 0, 30);
    gradTop.addColorStop(0, 'rgba(255, 80, 0, 0.7)');
    gradTop.addColorStop(0.5, 'rgba(255, 160, 0, 0.3)');
    gradTop.addColorStop(1, 'rgba(255, 200, 0, 0)');
    ctx.fillStyle = gradTop;
    ctx.fillRect(0, 0, w, 30);
    const gradBot = ctx.createLinearGradient(0, h - 30, 0, h);
    gradBot.addColorStop(0, 'rgba(255, 200, 0, 0)');
    gradBot.addColorStop(0.5, 'rgba(255, 160, 0, 0.3)');
    gradBot.addColorStop(1, 'rgba(255, 80, 0, 0.7)');
    ctx.fillStyle = gradBot;
    ctx.fillRect(0, h - 30, w, 30);
    const gradL = ctx.createLinearGradient(0, 0, 25, 0);
    gradL.addColorStop(0, 'rgba(255, 80, 0, 0.6)');
    gradL.addColorStop(1, 'rgba(255, 200, 0, 0)');
    ctx.fillStyle = gradL;
    ctx.fillRect(0, 0, 25, h);
    const gradR = ctx.createLinearGradient(w - 25, 0, w, 0);
    gradR.addColorStop(0, 'rgba(255, 200, 0, 0)');
    gradR.addColorStop(1, 'rgba(255, 80, 0, 0.6)');
    ctx.fillStyle = gradR;
    ctx.fillRect(w - 25, 0, 25, h);
  } else if (border === 'rainbow') {
    const rainbowColors = ['#ff0000', '#ff8800', '#ffff00', '#00ff00', '#0088ff', '#8800ff'];
    const bw = 6;
    for (let i = 0; i < rainbowColors.length; i++) {
      ctx.strokeStyle = rainbowColors[i];
      ctx.lineWidth = bw;
      const offset = i * bw + bw / 2;
      ctx.strokeRect(offset, offset, w - offset * 2, h - offset * 2);
    }
  } else if (border === 'metallic') {
    // Chrome/steel gradient with beveled edges
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#e0e0e0');
    grad.addColorStop(0.5, '#ffffff');
    grad.addColorStop(1, '#888888');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, 10);
    ctx.fillRect(0, h - 10, w, 10);
    ctx.fillRect(0, 10, 10, h - 20);
    ctx.fillRect(w - 10, 10, 10, h - 20);
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 1;
    ctx.strokeRect(4, 4, w - 8, h - 8);
  } else if (border === 'soft-glow') {
    // Radial gradient glow from edges
    ctx.fillStyle = 'rgba(255, 200, 100, 0.1)';
    for (let i = 40; i > 0; i -= 5) {
      ctx.globalAlpha = (40 - i) / 40 * 0.4;
      ctx.fillRect(i, i, w - i * 2, h - i * 2);
    }
    ctx.globalAlpha = 1;
  } else if (border === 'film-strip') {
    // Movie filmstrip perforations
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#333333';
    ctx.fillRect(20, 20, w - 40, h - 40);
    ctx.fillStyle = '#000000';
    const perfSize = 12;
    const perfSpacing = 30;
    for (let y = 40; y < h - 40; y += perfSpacing) {
      ctx.fillRect(10, y, perfSize, perfSize);
      ctx.fillRect(w - 10 - perfSize, y, perfSize, perfSize);
    }
  } else if (border === 'neon-tube') {
    // Thicker neon glow with multiple layers
    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur = 20;
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 6;
    ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.shadowColor = '#ff00ff';
    ctx.shadowBlur = 25;
    ctx.strokeStyle = '#ff00ff';
    ctx.lineWidth = 4;
    ctx.strokeRect(14, 14, w - 28, h - 28);
    ctx.shadowBlur = 0;
  } else if (border === 'hologram') {
    // Sci-fi hologram with color shift and scan lines
    const hgrad = ctx.createLinearGradient(0, 0, w, h);
    hgrad.addColorStop(0, 'rgba(0, 255, 200, 0.6)');
    hgrad.addColorStop(0.5, 'rgba(100, 200, 255, 0.4)');
    hgrad.addColorStop(1, 'rgba(200, 100, 255, 0.6)');
    ctx.strokeStyle = hgrad;
    ctx.lineWidth = 3;
    ctx.strokeRect(10, 10, w - 20, h - 20);
    ctx.strokeStyle = 'rgba(0, 255, 200, 0.3)';
    for (let y = 10; y < h; y += 8) {
      ctx.fillRect(10, y, w - 20, 1);
    }
  } else if (border === 'retro-pixel') {
    // Larger pixel blocks for 8-bit retro look
    ctx.fillStyle = '#ff1493';
    const pxSize = 16;
    const colors = ['#ff1493', '#00ffff', '#ffff00', '#00ff00', '#ff6600', '#9933ff'];
    let colorIdx = 0;
    for (let x = 0; x < w; x += pxSize) {
      ctx.fillStyle = colors[colorIdx % colors.length];
      ctx.fillRect(x, 0, pxSize, pxSize);
      ctx.fillRect(x, h - pxSize, pxSize, pxSize);
      colorIdx++;
    }
    colorIdx = 0;
    for (let y = pxSize; y < h - pxSize; y += pxSize) {
      ctx.fillStyle = colors[colorIdx % colors.length];
      ctx.fillRect(0, y, pxSize, pxSize);
      ctx.fillRect(w - pxSize, y, pxSize, pxSize);
      colorIdx++;
    }
  } else if (border === 'watercolor') {
    // Organic watercolor brush strokes
    ctx.fillStyle = 'rgba(100, 150, 200, 0.4)';
    for (let i = 0; i < 15; i++) {
      const x = Math.random() * w;
      const y = Math.random() * (h * 0.2);
      const size = 20 + Math.random() * 40;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(x, h - y - size, size, size);
    }
    ctx.fillStyle = 'rgba(150, 100, 150, 0.3)';
    for (let x = 0; x < w; x += 60) {
      ctx.fillRect(x, 0, 40, 15);
      ctx.fillRect(x, h - 15, 40, 15);
    }
  } else if (border === 'chain-link') {
    // Decorative linked circles pattern
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 3;
    const linkSize = 25;
    const linkSpacing = 45;
    // Top and bottom chains
    for (let x = 25; x < w; x += linkSpacing) {
      ctx.beginPath();
      ctx.arc(x, 20, linkSize / 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, h - 20, linkSize / 2, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Left and right chains
    for (let y = 50; y < h - 50; y += linkSpacing) {
      ctx.beginPath();
      ctx.arc(20, y, linkSize / 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(w - 20, y, linkSize / 2, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  ctx.restore();
}

function PhotoPrintCreator({
  screenshot,
  onClose,
}: {
  screenshot: ScreenshotEntry;
  onClose: () => void;
}) {
  const { user } = useAuthStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [settings, setSettings] = useState<PrintSettings>(defaultPrintSettings);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [rendering, setRendering] = useState(false);

  // Helper to calculate target canvas size based on print settings
  const getTargetCanvasSize = (imgWidth: number, imgHeight: number): { w: number; h: number; scale: number } => {
    if (settings.printSize === '2048') {
      const maxDim = 2048;
      const scale = Math.min(maxDim / imgWidth, maxDim / imgHeight);
      return { w: 2048, h: 2048, scale };
    } else if (settings.printSize === '1024') {
      const maxDim = 1024;
      const scale = Math.min(maxDim / imgWidth, maxDim / imgHeight);
      return { w: 1024, h: 1024, scale };
    } else if (settings.printSize === 'custom' && settings.customPrintSize) {
      const scale = Math.min(settings.customPrintSize.width / imgWidth, settings.customPrintSize.height / imgHeight);
      return { w: settings.customPrintSize.width, h: settings.customPrintSize.height, scale };
    }
    // 'fit' mode: calculate based on style
    return { w: 0, h: 0, scale: 1 };
  };

  const renderPrint = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setRendering(true);

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = screenshot.src;

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject();
    });

    const ctx = canvas.getContext('2d')!;
    const targetSize = getTargetCanvasSize(img.width, img.height);
    const isFixedSize = settings.printSize !== 'fit';

    if (isFixedSize) {
      // Fixed size mode: center image in canvas
      canvas.width = targetSize.w;
      canvas.height = targetSize.h;

      const scaledImgWidth = img.width * targetSize.scale;
      const scaledImgHeight = img.height * targetSize.scale;
      const offsetX = (canvas.width - scaledImgWidth) / 2;
      const offsetY = (canvas.height - scaledImgHeight) / 2;

      // Draw background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw scaled image
      ctx.drawImage(img, offsetX, offsetY, scaledImgWidth, scaledImgHeight);

      // Draw border on fixed canvas
      drawBorder(ctx, canvas.width, canvas.height, settings.border);

      // TODO: Add text overlay for fixed size
      setPreviewUrl(canvas.toDataURL('image/png'));
      setRendering(false);
      return;
    }

    // Original fit mode for different styles
    if (settings.style === 'polaroid') {
      const padding = 40;
      const bottomPadding = 120;
      canvas.width = img.width + padding * 2;
      canvas.height = img.height + padding + bottomPadding;

      // White polaroid border
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Shadow effect
      ctx.shadowColor = 'rgba(0,0,0,0.15)';
      ctx.shadowBlur = 20;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 5;
      ctx.drawImage(img, padding, padding, img.width, img.height);
      ctx.shadowColor = 'transparent';

      // Text on polaroid bottom
      ctx.fillStyle = '#333333';
      ctx.font = `${settings.fontSize}px 'Segoe UI', sans-serif`;
      const lines: string[] = [];
      if (settings.showUsername && user?.displayName) lines.push(user.displayName);
      if (settings.showWorldName && screenshot.worldName) lines.push(screenshot.worldName);
      if (settings.showDate) lines.push(format(screenshot.takenAt, 'MMM d, yyyy'));
      if (settings.showCustomText && settings.customText) lines.push(settings.customText);

      let ty = img.height + padding + 40;
      for (const line of lines) {
        ctx.fillText(line, padding + 10, ty);
        ty += settings.fontSize + 8;
      }
    } else if (settings.style === 'strip') {
      const stripH = 60;
      canvas.width = img.width;
      canvas.height = img.height + stripH;
      ctx.drawImage(img, 0, 0);

      // Dark strip at bottom
      ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
      ctx.fillRect(0, img.height, img.width, stripH);

      ctx.fillStyle = '#ffffff';
      ctx.font = `${settings.fontSize - 4}px 'Segoe UI', sans-serif`;

      const parts: string[] = [];
      if (settings.showUsername && user?.displayName) parts.push(user.displayName);
      if (settings.showWorldName && screenshot.worldName) parts.push(screenshot.worldName);
      if (settings.showDate) parts.push(format(screenshot.takenAt, 'MMM d, yyyy HH:mm'));
      if (settings.showCustomText && settings.customText) parts.push(settings.customText);

      const text = parts.join('  •  ');
      ctx.fillText(text, 20, img.height + 38);
    } else if (settings.style === 'minimal') {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      const parts: string[] = [];
      if (settings.showDate) parts.push(format(screenshot.takenAt, 'yyyy.MM.dd'));
      if (settings.showUsername && user?.displayName) parts.push(user.displayName);
      if (settings.showCustomText && settings.customText) parts.push(settings.customText);
      const text = parts.join(' | ');

      ctx.font = `${settings.fontSize - 6}px monospace`;
      const metrics = ctx.measureText(text);
      const pad = 8;

      let tx: number, ty: number;
      if (settings.position === 'bottom-right') {
        tx = img.width - metrics.width - pad - 12;
        ty = img.height - pad - 8;
      } else if (settings.position === 'top-left') {
        tx = pad + 12;
        ty = settings.fontSize + pad;
      } else if (settings.position === 'top-right') {
        tx = img.width - metrics.width - pad - 12;
        ty = settings.fontSize + pad;
      } else {
        tx = pad + 12;
        ty = img.height - pad - 8;
      }

      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(tx - 6, ty - settings.fontSize + 2, metrics.width + 12, settings.fontSize + 8);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(text, tx, ty);
    } else {
      // Classic: overlay on the image
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      const lines: string[] = [];
      if (settings.showUsername && user?.displayName) lines.push(user.displayName);
      if (settings.showWorldName && screenshot.worldName) lines.push(`📍 ${screenshot.worldName}`);
      if (settings.showDate) lines.push(format(screenshot.takenAt, 'MMM d, yyyy  HH:mm'));
      if (settings.showCustomText && settings.customText) lines.push(settings.customText);

      if (lines.length > 0) {
        ctx.font = `bold ${settings.fontSize}px 'Segoe UI', sans-serif`;
        const maxW = Math.max(...lines.map(l => ctx.measureText(l).width));
        const blockH = lines.length * (settings.fontSize + 10) + 20;
        const pad = 16;

        let bx: number, by: number;
        if (settings.position === 'bottom-right') {
          bx = img.width - maxW - pad * 2 - 20;
          by = img.height - blockH - 20;
        } else if (settings.position === 'top-left') {
          bx = 20;
          by = 20;
        } else if (settings.position === 'top-right') {
          bx = img.width - maxW - pad * 2 - 20;
          by = 20;
        } else {
          bx = 20;
          by = img.height - blockH - 20;
        }

        // Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        const radius = 12;
        ctx.beginPath();
        ctx.moveTo(bx + radius, by);
        ctx.lineTo(bx + maxW + pad * 2 - radius, by);
        ctx.quadraticCurveTo(bx + maxW + pad * 2, by, bx + maxW + pad * 2, by + radius);
        ctx.lineTo(bx + maxW + pad * 2, by + blockH - radius);
        ctx.quadraticCurveTo(bx + maxW + pad * 2, by + blockH, bx + maxW + pad * 2 - radius, by + blockH);
        ctx.lineTo(bx + radius, by + blockH);
        ctx.quadraticCurveTo(bx, by + blockH, bx, by + blockH - radius);
        ctx.lineTo(bx, by + radius);
        ctx.quadraticCurveTo(bx, by, bx + radius, by);
        ctx.closePath();
        ctx.fill();

        // Text
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${settings.fontSize}px 'Segoe UI', sans-serif`;
        let ty = by + pad + settings.fontSize;
        for (let i = 0; i < lines.length; i++) {
          if (i > 0) {
            ctx.font = `${settings.fontSize - 4}px 'Segoe UI', sans-serif`;
            ctx.fillStyle = 'rgba(255,255,255,0.85)';
          }
          ctx.fillText(lines[i], bx + pad, ty);
          ty += settings.fontSize + 10;
        }
      }
    }

    // Draw border on top
    drawBorder(ctx, canvas.width, canvas.height, settings.border);

    setPreviewUrl(canvas.toDataURL('image/png'));
    setRendering(false);
  }, [screenshot, settings, user]);

  // Auto-render on settings change
  useState(() => {
    setTimeout(renderPrint, 100);
  });

  const handleDownload = () => {
    if (!previewUrl) return;
    const a = document.createElement('a');
    a.href = previewUrl;
    a.download = `VRCStudio_Print_${screenshot.name}`;
    a.click();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center" onClick={onClose}>
      <div className="relative max-w-6xl w-full mx-4 flex gap-4 max-h-[90vh]" onClick={e => e.stopPropagation()}>
        {/* Preview */}
        <div className="flex-1 flex items-center justify-center overflow-hidden">
          <canvas ref={canvasRef} className="hidden" />
          {previewUrl ? (
            <img src={previewUrl} alt="Print preview" className="max-w-full max-h-[85vh] rounded-xl shadow-2xl" />
          ) : (
            <div className="text-surface-500 text-sm">Generating preview...</div>
          )}
        </div>

        {/* Settings panel */}
        <div className="w-72 flex-shrink-0 glass-panel p-4 space-y-4 overflow-y-auto max-h-[90vh]">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-1.5">
              <Printer size={14} /> Photo Print Creator
            </h3>
            <button onClick={onClose} className="btn-ghost p-1"><X size={14} /></button>
          </div>

          {/* Style */}
          <div>
            <label className="text-xs text-surface-500 block mb-1.5">Style</label>
            <div className="grid grid-cols-2 gap-1.5">
              {(['classic', 'polaroid', 'strip', 'minimal'] as const).map(style => (
                <button
                  key={style}
                  onClick={() => setSettings(s => ({ ...s, style }))}
                  className={`px-2 py-1.5 rounded text-xs font-medium transition-colors ${
                    settings.style === style
                      ? 'bg-accent-600 text-white'
                      : 'bg-surface-800 text-surface-400 hover:bg-surface-700'
                  }`}
                >
                  {style.charAt(0).toUpperCase() + style.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Position */}
          {settings.style !== 'polaroid' && settings.style !== 'strip' && (
            <div>
              <label className="text-xs text-surface-500 block mb-1.5">Position</label>
              <div className="grid grid-cols-2 gap-1.5">
                {([
                  { key: 'bottom-left' as const, label: '↙ Bottom Left' },
                  { key: 'bottom-right' as const, label: '↘ Bottom Right' },
                  { key: 'top-left' as const, label: '↖ Top Left' },
                  { key: 'top-right' as const, label: '↗ Top Right' },
                ]).map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setSettings(s => ({ ...s, position: key }))}
                    className={`px-2 py-1.5 rounded text-xs font-medium transition-colors ${
                      settings.position === key
                        ? 'bg-accent-600 text-white'
                        : 'bg-surface-800 text-surface-400 hover:bg-surface-700'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Toggle options */}
          <div className="space-y-2">
            {[
              { key: 'showUsername' as const, label: 'Show Username' },
              { key: 'showDate' as const, label: 'Show Date' },
              { key: 'showWorldName' as const, label: 'Show World Name' },
              { key: 'showCustomText' as const, label: 'Custom Text' },
            ].map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings[key]}
                  onChange={e => setSettings(s => ({ ...s, [key]: e.target.checked }))}
                  className="rounded bg-surface-800 border-surface-600 text-accent-500 focus:ring-accent-500"
                />
                {label}
              </label>
            ))}
          </div>

          {/* Custom text input */}
          {settings.showCustomText && (
            <input
              type="text"
              value={settings.customText}
              onChange={e => setSettings(s => ({ ...s, customText: e.target.value }))}
              placeholder="Enter custom text..."
              className="input-field text-xs"
            />
          )}

          {/* Font size */}
          <div>
            <label className="text-xs text-surface-500 block mb-1.5">
              Font Size: {settings.fontSize}px
            </label>
            <input
              type="range"
              min={14}
              max={48}
              value={settings.fontSize}
              onChange={e => setSettings(s => ({ ...s, fontSize: Number(e.target.value) }))}
              className="w-full accent-accent-500"
            />
          </div>

          {/* Print Size */}
          <div>
            <label className="text-xs text-surface-500 block mb-1.5">Print Size</label>
            <div className="grid grid-cols-2 gap-1">
              {([
                { key: 'fit' as const, label: 'Fit to Image' },
                { key: '2048' as const, label: '2048x2048' },
                { key: '1024' as const, label: '1024x1024' },
                { key: 'custom' as const, label: 'Custom' },
              ]).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setSettings(s => ({ ...s, printSize: key }))}
                  className={`px-2 py-1.5 rounded text-[10px] font-medium transition-colors ${
                    settings.printSize === key
                      ? 'bg-accent-600 text-white'
                      : 'bg-surface-800 text-surface-400 hover:bg-surface-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {settings.printSize === 'custom' && (
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                <input
                  type="number"
                  placeholder="Width"
                  defaultValue={settings.customPrintSize?.width || 2048}
                  onChange={e => setSettings(s => ({ ...s, customPrintSize: { width: Number(e.target.value), height: s.customPrintSize?.height || 2048 } }))}
                  className="input-field text-xs"
                />
                <input
                  type="number"
                  placeholder="Height"
                  defaultValue={settings.customPrintSize?.height || 2048}
                  onChange={e => setSettings(s => ({ ...s, customPrintSize: { width: s.customPrintSize?.width || 2048, height: Number(e.target.value) } }))}
                  className="input-field text-xs"
                />
              </div>
            )}
          </div>

          {/* Border */}
          <div>
            <label className="text-xs text-surface-500 block mb-1.5">Border</label>
            <div className="grid grid-cols-4 gap-1">
              {(['none', 'simple', 'thick', 'shadow', 'neon', 'grunge', 'pixel', 'hearts', 'stars', 'glitch', 'fire', 'rainbow', 'metallic', 'soft-glow', 'film-strip', 'neon-tube', 'hologram', 'retro-pixel', 'watercolor', 'chain-link'] as const).map(border => (
                <button
                  key={border}
                  onClick={() => setSettings(s => ({ ...s, border }))}
                  className={`px-2 py-1 rounded text-[9px] font-medium transition-colors ${
                    settings.border === border
                      ? 'bg-accent-600 text-white'
                      : 'bg-surface-800 text-surface-400 hover:bg-surface-700'
                  }`}
                  title={border}
                >
                  {border.replace('-', ' ').split(' ').map((w, i) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ').substring(0, 8)}
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-2 pt-2 border-t border-surface-800">
            <button
              onClick={renderPrint}
              disabled={rendering}
              className="btn-secondary text-xs w-full flex items-center justify-center gap-1.5"
            >
              <Type size={12} /> {rendering ? 'Rendering...' : 'Update Preview'}
            </button>
            <button
              onClick={handleDownload}
              disabled={!previewUrl}
              className="btn-primary text-xs w-full flex items-center justify-center gap-1.5"
            >
              <Download size={12} /> Download Print
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Main Screenshots Page ---

export default function ScreenshotsPage() {
  const [screenshots, setScreenshots] = useState<ScreenshotEntry[]>([]);
  const [selected, setSelected] = useState<ScreenshotEntry | null>(null);
  const [printTarget, setPrintTarget] = useState<ScreenshotEntry | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [editingNote, setEditingNote] = useState('');
  const [editingWorld, setEditingWorld] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [meta, setMeta] = useState(loadMeta());
  const [isPhotoEditing, setIsPhotoEditing] = useState(false);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [hueRotate, setHueRotate] = useState(0);
  const [blur, setBlur] = useState(0);
  const [grayscaleAmt, setGrayscaleAmt] = useState(0);
  const [sepiaAmt, setSepiaAmt] = useState(0);
  const [invertAmt, setInvertAmt] = useState(0);
  const [opacityAmt, setOpacityAmt] = useState(100);
  const [filterPreset, setFilterPreset] = useState('none');
  const fileRef = useRef<HTMLInputElement>(null);
  const photoEditCanvasRef = useRef<HTMLCanvasElement>(null);

  const filterPresets: Record<string, { brightness: number; contrast: number; saturation: number; hueRotate: number }> = {
    grayscale: { brightness: 100, contrast: 110, saturation: 0, hueRotate: 0 },
    sepia: { brightness: 100, contrast: 110, saturation: 30, hueRotate: -10 },
    cool: { brightness: 95, contrast: 105, saturation: 110, hueRotate: -20 },
    warm: { brightness: 110, contrast: 95, saturation: 120, hueRotate: 15 },
    vintage: { brightness: 105, contrast: 90, saturation: 80, hueRotate: -5 },
    noir: { brightness: 80, contrast: 130, saturation: 0, hueRotate: 0 },
    neon: { brightness: 110, contrast: 120, saturation: 150, hueRotate: 0 },
    vibrant: { brightness: 100, contrast: 115, saturation: 140, hueRotate: 0 },
    soft: { brightness: 110, contrast: 85, saturation: 90, hueRotate: 0 },
    dreamy: { brightness: 115, contrast: 85, saturation: 110, hueRotate: 10 },
    dramatic: { brightness: 90, contrast: 140, saturation: 120, hueRotate: 0 },
    faded: { brightness: 110, contrast: 90, saturation: 70, hueRotate: 0 },
    cyberpunk: { brightness: 105, contrast: 125, saturation: 150, hueRotate: -30 },
    retro: { brightness: 105, contrast: 95, saturation: 80, hueRotate: 10 },
    film: { brightness: 95, contrast: 110, saturation: 85, hueRotate: -5 },
  };

  const processFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files);
    const imageFiles = arr.filter(f => f.type.startsWith('image/'));
    const newEntries: ScreenshotEntry[] = [];

    for (const file of imageFiles) {
      const id = `ss_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const src = URL.createObjectURL(file);
      const storedMeta = meta[file.name] || {};
      newEntries.push({
        id,
        src,
        name: file.name,
        size: file.size,
        takenAt: storedMeta.takenAt || file.lastModified || Date.now(),
        worldName: storedMeta.worldName,
        worldId: storedMeta.worldId,
        notes: storedMeta.notes,
      });
    }

    setScreenshots(prev => {
      const existingNames = new Set(prev.map(s => s.name));
      const fresh = newEntries.filter(e => !existingNames.has(e.name));
      return [...fresh, ...prev].sort((a, b) => b.takenAt - a.takenAt);
    });
  }, [meta]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) processFiles(e.target.files);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) processFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);

  const removeScreenshot = (id: string) => {
    setScreenshots(prev => prev.filter(s => s.id !== id));
    if (selected?.id === id) setSelected(null);
  };

  const saveMeta_ = (ss: ScreenshotEntry) => {
    const updated = { ...ss, worldName: editingWorld || ss.worldName, notes: editingNote };
    setScreenshots(prev => prev.map(s => s.id === ss.id ? updated : s));
    if (selected?.id === ss.id) setSelected(updated);
    const newMeta = { ...meta, [ss.name]: { worldName: updated.worldName, worldId: updated.worldId, notes: updated.notes } };
    saveMeta(newMeta);
    setMeta(newMeta);
    setIsEditing(false);
  };

  const openEdit = (ss: ScreenshotEntry) => {
    setEditingNote(ss.notes || '');
    setEditingWorld(ss.worldName || '');
    setIsEditing(true);
  };

  // Group by date
  const byDate = screenshots.reduce<Record<string, ScreenshotEntry[]>>((acc, s) => {
    const d = format(s.takenAt, 'yyyy-MM-dd');
    if (!acc[d]) acc[d] = [];
    acc[d].push(s);
    return acc;
  }, {});

  return (
    <div className="max-w-6xl mx-auto space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Screenshots</h1>
          <p className="text-sm text-surface-400 mt-0.5">
            Load your VRChat screenshots to browse, annotate, and create photo prints
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => fileRef.current?.click()} className="btn-primary text-sm flex items-center gap-1.5">
            <FolderOpen size={14} /> Load Screenshots
          </button>
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileChange} />
        </div>
      </div>

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${
          isDragging ? 'border-accent-500 bg-accent-500/5' : 'border-surface-700 hover:border-surface-600'
        }`}
      >
        <Upload size={24} className="mx-auto mb-2 text-surface-500" />
        <p className="text-sm text-surface-400">
          Drag & drop screenshots here, or{' '}
          <button onClick={() => fileRef.current?.click()} className="text-accent-400 hover:underline">
            browse files
          </button>
        </p>
        <p className="text-xs text-surface-600 mt-1">
          Default: <span className="font-mono">%Pictures%\VRChat</span>
        </p>
      </div>

      {screenshots.length === 0 ? (
        <EmptyState icon={Camera} title="No screenshots loaded" description="Load your VRChat screenshots folder to view them here" />
      ) : (
        <div className="space-y-6">
          {Object.entries(byDate).map(([date, shots]) => (
            <div key={date}>
              <div className="flex items-center gap-2 mb-3">
                <Calendar size={14} className="text-surface-500" />
                <h3 className="text-sm font-semibold text-surface-400">
                  {format(new Date(date), 'EEEE, MMMM d, yyyy')}
                  <span className="ml-2 text-surface-600 font-normal">{shots.length} photo{shots.length !== 1 ? 's' : ''}</span>
                </h3>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {shots.map(ss => (
                  <div key={ss.id} className="group relative">
                    <button
                      onClick={() => setSelected(ss)}
                      className="w-full aspect-video rounded-lg overflow-hidden bg-surface-800 block"
                    >
                      <img
                        src={ss.src}
                        alt={ss.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                        loading="lazy"
                      />
                    </button>
                    {ss.worldName && (
                      <div className="absolute bottom-1 left-1 right-1 bg-black/60 backdrop-blur-sm rounded px-1.5 py-0.5 text-[10px] truncate text-white">
                        {ss.worldName}
                      </div>
                    )}
                    <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => { e.stopPropagation(); setPrintTarget(ss); }}
                        className="w-5 h-5 bg-black/60 rounded-full flex items-center justify-center hover:bg-accent-600/80 transition-colors"
                        title="Create Photo Print"
                      >
                        <Printer size={10} className="text-white" />
                      </button>
                      <button
                        onClick={() => removeScreenshot(ss.id)}
                        className="w-5 h-5 bg-black/60 rounded-full flex items-center justify-center hover:bg-red-600/80 transition-colors"
                      >
                        <X size={10} className="text-white" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {selected && !printTarget && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center"
          onClick={() => { setSelected(null); setIsEditing(false); }}
        >
          <div className="relative max-w-5xl w-full mx-4 flex gap-4 items-start" onClick={e => e.stopPropagation()}>
            {/* Image */}
            <div className="flex-1">
              <img
                src={selected.src}
                alt=""
                className="w-full rounded-xl shadow-2xl"
                style={{
                  filter: `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) hue-rotate(${hueRotate}deg) blur(${blur}px) grayscale(${grayscaleAmt}%) sepia(${sepiaAmt}%) invert(${invertAmt}%)`,
                  opacity: opacityAmt / 100,
                  transition: 'filter 0.1s ease-out, opacity 0.1s ease-out',
                }}
              />
            </div>

            {/* Info panel */}
            <div className="w-64 flex-shrink-0 glass-panel p-4 space-y-3">
              <h3 className="text-sm font-semibold truncate">{selected.name}</h3>
              <div className="text-xs text-surface-400 space-y-1">
                <div className="flex items-center gap-1.5">
                  <Calendar size={12} />
                  {format(selected.takenAt, 'MMM d, yyyy HH:mm')}
                </div>
                <div>{(selected.size / 1024).toFixed(0)} KB</div>
              </div>

              {isEditing ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={editingWorld}
                    onChange={e => setEditingWorld(e.target.value)}
                    placeholder="World name..."
                    className="input-field text-xs"
                    autoFocus
                  />
                  <textarea
                    value={editingNote}
                    onChange={e => setEditingNote(e.target.value)}
                    placeholder="Notes..."
                    className="input-field text-xs h-20 resize-none"
                  />
                  <div className="flex gap-2">
                    <button onClick={() => setIsEditing(false)} className="btn-secondary text-xs flex-1">Cancel</button>
                    <button onClick={() => saveMeta_(selected)} className="btn-primary text-xs flex-1">Save</button>
                  </div>
                </div>
              ) : (
                <>
                  {selected.worldName && (
                    <div className="glass-panel p-2">
                      <div className="text-[10px] text-surface-500 mb-0.5 flex items-center gap-1"><Globe size={10} /> World</div>
                      <div className="text-xs">{selected.worldName}</div>
                    </div>
                  )}
                  {selected.notes && (
                    <div className="glass-panel p-2">
                      <div className="text-[10px] text-surface-500 mb-0.5">Notes</div>
                      <div className="text-xs text-surface-300">{selected.notes}</div>
                    </div>
                  )}
                  <button onClick={() => openEdit(selected)} className="btn-secondary text-xs w-full">
                    {selected.worldName || selected.notes ? 'Edit Info' : 'Add World / Notes'}
                  </button>
                </>
              )}

              <button
                onClick={() => setIsPhotoEditing(!isPhotoEditing)}
                className="btn-secondary text-xs w-full flex items-center justify-center gap-1.5"
              >
                <Paintbrush size={12} /> {isPhotoEditing ? 'Done Editing' : 'Photo Editor'}
              </button>

              {isPhotoEditing && (
                <div className="space-y-2 bg-surface-800/30 p-3 rounded">
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-surface-500 block font-semibold">Filter Presets</label>
                    <div className="grid grid-cols-4 gap-1">
                      {['none', 'grayscale', 'sepia', 'cool', 'warm', 'vintage', 'noir', 'neon', 'vibrant', 'soft', 'dreamy', 'dramatic', 'faded', 'cyberpunk', 'retro', 'film'].map(preset => (
                        <button
                          key={preset}
                          onClick={() => {
                            setFilterPreset(preset as any);
                            if (preset === 'none') {
                              setBrightness(100);
                              setContrast(100);
                              setSaturation(100);
                              setHueRotate(0);
                            } else {
                              const p = filterPresets[preset];
                              setBrightness(p.brightness);
                              setContrast(p.contrast);
                              setSaturation(p.saturation);
                              setHueRotate(p.hueRotate);
                            }
                          }}
                          className={`px-2 py-1 text-[10px] rounded font-medium transition-all ${
                            filterPreset === preset
                              ? 'bg-blue-500/80 text-white'
                              : 'bg-surface-700 text-surface-300 hover:bg-surface-600'
                          }`}
                        >
                          {preset.charAt(0).toUpperCase() + preset.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="border-t border-surface-700/50 pt-2 space-y-1.5">
                    <label className="text-[10px] text-surface-500 block font-semibold">Manual Adjustments</label>
                    <div>
                      <label className="text-[10px] text-surface-500 block mb-0.5">Brightness: {brightness}%</label>
                      <input
                        type="range"
                        min={0}
                        max={200}
                        value={brightness}
                        onChange={e => {
                          setBrightness(Number(e.target.value));
                          setFilterPreset('none');
                        }}
                        className="w-full text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-surface-500 block mb-0.5">Contrast: {contrast}%</label>
                      <input
                        type="range"
                        min={0}
                        max={200}
                        value={contrast}
                        onChange={e => {
                          setContrast(Number(e.target.value));
                          setFilterPreset('none');
                        }}
                        className="w-full text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-surface-500 block mb-0.5">Saturation: {saturation}%</label>
                      <input
                        type="range"
                        min={0}
                        max={200}
                        value={saturation}
                        onChange={e => {
                          setSaturation(Number(e.target.value));
                          setFilterPreset('none');
                        }}
                        className="w-full text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-surface-500 block mb-0.5">Hue Shift: {hueRotate}°</label>
                      <input
                        type="range"
                        min={-180}
                        max={180}
                        value={hueRotate}
                        onChange={e => {
                          setHueRotate(Number(e.target.value));
                          setFilterPreset('none');
                        }}
                        className="w-full text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-surface-500 block mb-0.5">Blur: {blur}px</label>
                      <input
                        type="range"
                        min={0}
                        max={10}
                        value={blur}
                        onChange={e => {
                          setBlur(Number(e.target.value));
                          setFilterPreset('none');
                        }}
                        className="w-full text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-surface-500 block mb-0.5">Grayscale: {grayscaleAmt}%</label>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={grayscaleAmt}
                        onChange={e => {
                          setGrayscaleAmt(Number(e.target.value));
                          setFilterPreset('none');
                        }}
                        className="w-full text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-surface-500 block mb-0.5">Sepia: {sepiaAmt}%</label>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={sepiaAmt}
                        onChange={e => {
                          setSepiaAmt(Number(e.target.value));
                          setFilterPreset('none');
                        }}
                        className="w-full text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-surface-500 block mb-0.5">Invert: {invertAmt}%</label>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={invertAmt}
                        onChange={e => {
                          setInvertAmt(Number(e.target.value));
                          setFilterPreset('none');
                        }}
                        className="w-full text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-surface-500 block mb-0.5">Opacity: {opacityAmt}%</label>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={opacityAmt}
                        onChange={e => {
                          setOpacityAmt(Number(e.target.value));
                          setFilterPreset('none');
                        }}
                        className="w-full text-xs"
                      />
                    </div>
                  </div>
                </div>
              )}

              <button
                onClick={() => setPrintTarget(selected)}
                className="btn-primary text-xs w-full flex items-center justify-center gap-1.5"
              >
                <Printer size={12} /> Create Print
              </button>

              <button onClick={() => { setSelected(null); setIsEditing(false); setIsPhotoEditing(false); }} className="btn-ghost text-xs w-full">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Photo Print Creator */}
      {printTarget && (
        <PhotoPrintCreator
          screenshot={printTarget}
          onClose={() => setPrintTarget(null)}
        />
      )}
    </div>
  );
}
