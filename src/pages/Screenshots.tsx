import { useState, useRef, useCallback } from 'react';
import { Camera, Upload, FolderOpen, X, ExternalLink, Globe, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import EmptyState from '../components/common/EmptyState';

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

export default function ScreenshotsPage() {
  const [screenshots, setScreenshots] = useState<ScreenshotEntry[]>([]);
  const [selected, setSelected] = useState<ScreenshotEntry | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [editingNote, setEditingNote] = useState('');
  const [editingWorld, setEditingWorld] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [meta, setMeta] = useState(loadMeta());
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
            Load your VRChat screenshots folder to browse and annotate them
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
                    <button
                      onClick={() => removeScreenshot(ss.id)}
                      className="absolute top-1 right-1 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X size={10} className="text-white" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {selected && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center"
          onClick={() => { setSelected(null); setIsEditing(false); }}
        >
          <div className="relative max-w-5xl w-full mx-4 flex gap-4 items-start" onClick={e => e.stopPropagation()}>
            {/* Image */}
            <div className="flex-1">
              <img src={selected.src} alt="" className="w-full rounded-xl shadow-2xl" />
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

              <button onClick={() => { setSelected(null); setIsEditing(false); }} className="btn-ghost text-xs w-full">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
