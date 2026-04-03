import { useState, useRef, useCallback, useEffect } from 'react';
import { Camera, Upload, FolderOpen, X, Globe, Calendar, Printer, Download, Type, Paintbrush, Undo, Redo, RotateCcw, Palette } from 'lucide-react';
import { format } from 'date-fns';
import EmptyState from '../components/common/EmptyState';
import { useAuthStore } from '../stores/authStore';
import { PRESET_FILTERS, applyAdjustments, applyFilters, drawBorder, type CanvasEditState } from '../utils/canvasFilters';
import { PRESET_THEMES, getThemeNames, applyThemeToCanvas, getFontString, type PrintTheme } from '../utils/printThemes';

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

interface PrintSettings {
  showUsername: boolean;
  showDate: boolean;
  showWorldName: boolean;
  showCustomText: boolean;
  customText: string;
  position: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';
  style: 'classic' | 'polaroid' | 'minimal' | 'strip';
  fontSize: number;
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
};

// Photo Editor Canvas Component
function PhotoEditorCanvas({
  imageSrc,
  editState,
  canvasRef,
}: {
  imageSrc: string;
  editState: CanvasEditState;
  canvasRef: React.RefObject<HTMLCanvasElement>;
}) {
  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      // Set canvas size to image size
      canvas.width = img.width;
      canvas.height = img.height;

      // Draw the original image
      ctx.drawImage(img, 0, 0);

      // Apply adjustments (brightness, contrast, saturation)
      applyAdjustments(
        ctx,
        editState.brightness,
        editState.contrast,
        editState.saturation,
        canvas.width,
        canvas.height
      );

      // Apply filters (grayscale, sepia, blur, temperature)
      applyFilters(
        ctx,
        editState.filters.grayscale,
        editState.filters.sepia,
        editState.filters.blur,
        editState.filters.temperature,
        canvas.width,
        canvas.height
      );

      // Apply border
      if (editState.borderStyle.width > 0) {
        drawBorder(
          ctx,
          canvas.width,
          canvas.height,
          editState.borderStyle.width,
          editState.borderStyle.color,
          editState.borderStyle.style,
          editState.borderStyle.radius
        );
      }
    };
    img.src = imageSrc;
  }, [imageSrc, editState, canvasRef]);

  return <canvas ref={canvasRef} className="w-full rounded-xl shadow-2xl" />;
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
  const [selectedTheme, setSelectedTheme] = useState<string>('classic');
  const [customizing, setCustomizing] = useState(false);
  const [currentTheme, setCurrentTheme] = useState<PrintTheme>(PRESET_THEMES.classic);

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

    setPreviewUrl(canvas.toDataURL('image/png'));
    setRendering(false);
  }, [screenshot, settings, user]);

  // Auto-render on settings change or theme change
  useEffect(() => {
    setTimeout(renderPrint, 100);
  }, [renderPrint, settings, currentTheme]);

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

          {/* Theme Selection */}
          <div>
            <label className="text-xs text-surface-500 block mb-1.5">Preset Themes</label>
            <div className="grid grid-cols-2 gap-1.5">
              {getThemeNames().map(({ id, name }) => (
                <button
                  key={id}
                  onClick={() => {
                    setSelectedTheme(id);
                    setCurrentTheme(PRESET_THEMES[id]);
                    setCustomizing(false);
                  }}
                  className={`px-2 py-1.5 rounded text-xs font-medium transition-colors ${
                    selectedTheme === id && !customizing
                      ? 'bg-accent-600 text-white'
                      : 'bg-surface-800 text-surface-400 hover:bg-surface-700'
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>

          {/* Customize Theme */}
          <div>
            <button
              onClick={() => setCustomizing(!customizing)}
              className="w-full btn-secondary text-xs flex items-center justify-center gap-1.5"
            >
              <Palette size={12} /> {customizing ? 'Done Customizing' : 'Customize Theme'}
            </button>
          </div>

          {customizing && (
            <div className="space-y-2">
              <div>
                <label className="text-xs text-surface-500 block mb-1">Background Color</label>
                <input
                  type="color"
                  value={currentTheme.backgroundColor === 'transparent' ? '#000000' : currentTheme.backgroundColor}
                  onChange={e => setCurrentTheme(t => ({ ...t, backgroundColor: e.target.value }))}
                  className="w-full h-6 rounded cursor-pointer"
                />
              </div>

              <div>
                <label className="text-xs text-surface-500 block mb-1">Border Width</label>
                <input
                  type="range"
                  min={0}
                  max={10}
                  value={currentTheme.borderWidth}
                  onChange={e => setCurrentTheme(t => ({ ...t, borderWidth: Number(e.target.value) }))}
                  className="w-full accent-accent-500"
                />
                <div className="text-[10px] text-surface-600 mt-0.5">{currentTheme.borderWidth}px</div>
              </div>

              <div>
                <label className="text-xs text-surface-500 block mb-1">Border Color</label>
                <input
                  type="color"
                  value={currentTheme.borderColor}
                  onChange={e => setCurrentTheme(t => ({ ...t, borderColor: e.target.value }))}
                  className="w-full h-6 rounded cursor-pointer"
                />
              </div>

              <div>
                <label className="text-xs text-surface-500 block mb-1">Border Radius</label>
                <input
                  type="range"
                  min={0}
                  max={20}
                  value={currentTheme.borderRadius}
                  onChange={e => setCurrentTheme(t => ({ ...t, borderRadius: Number(e.target.value) }))}
                  className="w-full accent-accent-500"
                />
                <div className="text-[10px] text-surface-600 mt-0.5">{currentTheme.borderRadius}px</div>
              </div>

              <div>
                <label className="text-xs text-surface-500 block mb-1">Text Color</label>
                <input
                  type="color"
                  value={currentTheme.usernameStyle.color}
                  onChange={e => setCurrentTheme(t => ({
                    ...t,
                    usernameStyle: { ...t.usernameStyle, color: e.target.value },
                  }))}
                  className="w-full h-6 rounded cursor-pointer"
                />
              </div>

              <div>
                <label className="text-xs text-surface-500 block mb-1">Padding</label>
                <input
                  type="range"
                  min={0}
                  max={40}
                  value={currentTheme.padding}
                  onChange={e => setCurrentTheme(t => ({ ...t, padding: Number(e.target.value) }))}
                  className="w-full accent-accent-500"
                />
                <div className="text-[10px] text-surface-600 mt-0.5">{currentTheme.padding}px</div>
              </div>
            </div>
          )}

          {/* Original Style */}
          <div>
            <label className="text-xs text-surface-500 block mb-1.5">Original Layout</label>
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
  const [editState, setEditState] = useState<CanvasEditState>({
    brightness: 100,
    contrast: 100,
    saturation: 100,
    filters: { grayscale: 0, sepia: 0, blur: 0, temperature: 0 },
    borderStyle: { width: 0, color: '#ffffff', style: 'solid', radius: 0 },
  });
  const photoCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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
          onClick={() => { setSelected(null); setIsEditing(false); setIsPhotoEditing(false); }}
        >
          <div className="relative max-w-6xl w-full mx-4 flex gap-4 items-start max-h-[90vh]" onClick={e => e.stopPropagation()}>
            {/* Image / Editor */}
            <div className="flex-1 flex items-center justify-center overflow-auto">
              {isPhotoEditing ? (
                <div className="flex flex-col gap-3 w-full">
                  <PhotoEditorCanvas
                    imageSrc={selected.src}
                    editState={editState}
                    canvasRef={photoCanvasRef}
                  />
                  <div className="flex gap-2 justify-center">
                    <button className="btn-secondary text-xs flex items-center gap-1" disabled>
                      <Undo size={12} /> Undo
                    </button>
                    <button className="btn-secondary text-xs flex items-center gap-1" disabled>
                      <Redo size={12} /> Redo
                    </button>
                    <button
                      onClick={() => setIsPhotoEditing(false)}
                      className="btn-primary text-xs flex items-center gap-1"
                    >
                      Done Editing
                    </button>
                  </div>
                </div>
              ) : (
                <img src={selected.src} alt="" className="w-full rounded-xl shadow-2xl" />
              )}
            </div>

            {/* Info panel */}
            <div className="w-72 flex-shrink-0 glass-panel p-4 space-y-3 overflow-y-auto max-h-full">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold truncate flex-1">{selected.name}</h3>
                <button onClick={() => { setSelected(null); setIsEditing(false); setIsPhotoEditing(false); }} className="btn-ghost p-1">
                  <X size={14} />
                </button>
              </div>
              <div className="text-xs text-surface-400 space-y-1">
                <div className="flex items-center gap-1.5">
                  <Calendar size={12} />
                  {format(selected.takenAt, 'MMM d, yyyy HH:mm')}
                </div>
                <div>{(selected.size / 1024).toFixed(0)} KB</div>
              </div>

              {isPhotoEditing ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-surface-500 block mb-1.5">Brightness</label>
                    <input
                      type="range"
                      min={0}
                      max={200}
                      value={editState.brightness}
                      onChange={e => setEditState(prev => ({ ...prev, brightness: Number(e.target.value) }))}
                      className="w-full accent-accent-500 text-xs"
                    />
                    <div className="text-[10px] text-surface-600 mt-1">{editState.brightness}%</div>
                  </div>

                  <div>
                    <label className="text-xs text-surface-500 block mb-1.5">Contrast</label>
                    <input
                      type="range"
                      min={0}
                      max={200}
                      value={editState.contrast}
                      onChange={e => setEditState(prev => ({ ...prev, contrast: Number(e.target.value) }))}
                      className="w-full accent-accent-500 text-xs"
                    />
                    <div className="text-[10px] text-surface-600 mt-1">{editState.contrast}%</div>
                  </div>

                  <div>
                    <label className="text-xs text-surface-500 block mb-1.5">Saturation</label>
                    <input
                      type="range"
                      min={0}
                      max={200}
                      value={editState.saturation}
                      onChange={e => setEditState(prev => ({ ...prev, saturation: Number(e.target.value) }))}
                      className="w-full accent-accent-500 text-xs"
                    />
                    <div className="text-[10px] text-surface-600 mt-1">{editState.saturation}%</div>
                  </div>

                  <div>
                    <label className="text-xs text-surface-500 block mb-1.5">Filters</label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {Object.entries(PRESET_FILTERS).map(([key, filter]) => (
                        <button
                          key={key}
                          onClick={() => setEditState(prev => ({
                            ...prev,
                            filters: filter.state,
                          }))}
                          className="px-2 py-1 rounded text-[10px] font-medium bg-surface-800 text-surface-400 hover:bg-surface-700 transition-colors"
                          title={filter.name}
                        >
                          {filter.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-surface-500 block mb-1.5">Border</label>
                    <input
                      type="range"
                      min={0}
                      max={20}
                      value={editState.borderStyle.width}
                      onChange={e => setEditState(prev => ({
                        ...prev,
                        borderStyle: { ...prev.borderStyle, width: Number(e.target.value) },
                      }))}
                      className="w-full accent-accent-500 text-xs"
                    />
                    <div className="text-[10px] text-surface-600 mt-1">{editState.borderStyle.width}px</div>
                  </div>
                </div>
              ) : isEditing ? (
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

                  <button
                    onClick={() => setIsPhotoEditing(true)}
                    className="btn-secondary text-xs w-full flex items-center justify-center gap-1.5"
                  >
                    <Paintbrush size={12} /> Photo Editor
                  </button>
                </>
              )}

              {!isPhotoEditing && (
                <button
                  onClick={() => setPrintTarget(selected)}
                  className="btn-primary text-xs w-full flex items-center justify-center gap-1.5"
                >
                  <Printer size={12} /> Create Print
                </button>
              )}
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
