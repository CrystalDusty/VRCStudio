import { useState, useMemo } from 'react';
import {
  FolderHeart, Plus, X, Star, Globe, Edit3, Trash2,
  ChevronRight, ArrowLeft, SortAsc, Tag, Search,
} from 'lucide-react';
import { format } from 'date-fns';
import EmptyState from '../components/common/EmptyState';
import SearchInput from '../components/common/SearchInput';

interface WorldEntry {
  worldId: string;
  worldName: string;
  worldImage: string;
  authorName: string;
  rating: number; // 1-5
  notes: string;
  tags: string[];
  addedAt: number;
  lastVisited?: number;
  visitCount: number;
}

interface WorldCollection {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  worlds: WorldEntry[];
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = 'vrcstudio_world_collections';

const COLLECTION_ICONS = ['🌍', '🎮', '🎵', '🏠', '🎭', '🏰', '🌌', '🎪', '⭐', '🔥', '💫', '🎯'];
const COLLECTION_COLORS = [
  'border-blue-500/40',
  'border-purple-500/40',
  'border-emerald-500/40',
  'border-amber-500/40',
  'border-red-500/40',
  'border-pink-500/40',
  'border-cyan-500/40',
  'border-indigo-500/40',
];

function loadCollections(): WorldCollection[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveCollections(cols: WorldCollection[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cols));
}

function StarRating({ rating, onChange, readonly }: { rating: number; onChange?: (r: number) => void; readonly?: boolean }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <button
          key={i}
          onClick={() => onChange?.(i)}
          disabled={readonly}
          className={`transition-colors ${
            i <= rating ? 'text-amber-400' : 'text-surface-700'
          } ${readonly ? '' : 'hover:text-amber-300 cursor-pointer'}`}
        >
          <Star size={14} fill={i <= rating ? 'currentColor' : 'none'} />
        </button>
      ))}
    </div>
  );
}

export default function WorldCollectionsPage() {
  const [collections, setCollections] = useState<WorldCollection[]>(loadCollections());
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);
  const [isCreatingCollection, setIsCreatingCollection] = useState(false);
  const [isAddingWorld, setIsAddingWorld] = useState(false);
  const [editingWorldIdx, setEditingWorldIdx] = useState<number | null>(null);
  const [search, setSearch] = useState('');

  // Collection form
  const [colName, setColName] = useState('');
  const [colDesc, setColDesc] = useState('');
  const [colIcon, setColIcon] = useState('🌍');
  const [colColorIdx, setColColorIdx] = useState(0);

  // World form
  const [worldName, setWorldName] = useState('');
  const [worldId, setWorldId] = useState('');
  const [worldImage, setWorldImage] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [worldRating, setWorldRating] = useState(0);
  const [worldNotes, setWorldNotes] = useState('');
  const [worldTags, setWorldTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  const save = (updated: WorldCollection[]) => {
    setCollections(updated);
    saveCollections(updated);
  };

  const activeCollection = collections.find(c => c.id === selectedCollection);

  const filteredWorlds = useMemo(() => {
    if (!activeCollection) return [];
    if (!search) return activeCollection.worlds;
    const q = search.toLowerCase();
    return activeCollection.worlds.filter(w =>
      w.worldName.toLowerCase().includes(q) ||
      w.authorName.toLowerCase().includes(q) ||
      w.notes.toLowerCase().includes(q) ||
      w.tags.some(t => t.toLowerCase().includes(q))
    );
  }, [activeCollection, search]);

  // Create collection
  const createCollection = () => {
    if (!colName.trim()) return;
    const col: WorldCollection = {
      id: `col_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      name: colName.trim(),
      description: colDesc.trim(),
      icon: colIcon,
      color: COLLECTION_COLORS[colColorIdx],
      worlds: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    save([col, ...collections]);
    setIsCreatingCollection(false);
    setColName('');
    setColDesc('');
  };

  const deleteCollection = (id: string) => {
    save(collections.filter(c => c.id !== id));
    if (selectedCollection === id) setSelectedCollection(null);
  };

  // Add/edit world
  const resetWorldForm = () => {
    setWorldName('');
    setWorldId('');
    setWorldImage('');
    setAuthorName('');
    setWorldRating(0);
    setWorldNotes('');
    setWorldTags([]);
    setTagInput('');
  };

  const openAddWorld = () => {
    resetWorldForm();
    setEditingWorldIdx(null);
    setIsAddingWorld(true);
  };

  const openEditWorld = (idx: number) => {
    const w = activeCollection!.worlds[idx];
    setWorldName(w.worldName);
    setWorldId(w.worldId);
    setWorldImage(w.worldImage);
    setAuthorName(w.authorName);
    setWorldRating(w.rating);
    setWorldNotes(w.notes);
    setWorldTags(w.tags);
    setEditingWorldIdx(idx);
    setIsAddingWorld(true);
  };

  const saveWorld = () => {
    if (!worldName.trim() || !activeCollection) return;
    const entry: WorldEntry = {
      worldId: worldId.trim(),
      worldName: worldName.trim(),
      worldImage: worldImage.trim(),
      authorName: authorName.trim(),
      rating: worldRating,
      notes: worldNotes.trim(),
      tags: worldTags,
      addedAt: editingWorldIdx !== null ? activeCollection.worlds[editingWorldIdx].addedAt : Date.now(),
      visitCount: editingWorldIdx !== null ? activeCollection.worlds[editingWorldIdx].visitCount : 0,
    };

    const updatedWorlds = [...activeCollection.worlds];
    if (editingWorldIdx !== null) {
      updatedWorlds[editingWorldIdx] = entry;
    } else {
      updatedWorlds.unshift(entry);
    }

    save(collections.map(c =>
      c.id === activeCollection.id
        ? { ...c, worlds: updatedWorlds, updatedAt: Date.now() }
        : c
    ));
    setIsAddingWorld(false);
    resetWorldForm();
  };

  const removeWorld = (idx: number) => {
    if (!activeCollection) return;
    const updatedWorlds = activeCollection.worlds.filter((_, i) => i !== idx);
    save(collections.map(c =>
      c.id === activeCollection.id
        ? { ...c, worlds: updatedWorlds, updatedAt: Date.now() }
        : c
    ));
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !worldTags.includes(t)) setWorldTags(prev => [...prev, t]);
    setTagInput('');
  };

  // --- Detail view (inside a collection) ---
  if (activeCollection) {
    return (
      <div className="max-w-5xl mx-auto space-y-4 animate-fade-in">
        <div className="flex items-center gap-3">
          <button onClick={() => { setSelectedCollection(null); setIsAddingWorld(false); }} className="btn-ghost p-1.5">
            <ArrowLeft size={16} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold flex items-center gap-2">
              <span className="text-2xl">{activeCollection.icon}</span>
              {activeCollection.name}
            </h1>
            {activeCollection.description && (
              <p className="text-sm text-surface-400 mt-0.5">{activeCollection.description}</p>
            )}
          </div>
          <button onClick={openAddWorld} className="btn-primary text-sm flex items-center gap-1.5">
            <Plus size={14} /> Add World
          </button>
        </div>

        {/* Search within collection */}
        {activeCollection.worlds.length > 3 && (
          <SearchInput value={search} onChange={setSearch} placeholder="Search this collection..." className="max-w-sm" />
        )}

        {/* Add/Edit world form */}
        {isAddingWorld && (
          <div className="glass-panel-solid p-5 space-y-3 border border-accent-500/20">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">{editingWorldIdx !== null ? 'Edit World' : 'Add World'}</h3>
              <button onClick={() => setIsAddingWorld(false)} className="btn-ghost p-1"><X size={14} /></button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-surface-500 block mb-1">World Name *</label>
                <input type="text" value={worldName} onChange={e => setWorldName(e.target.value)}
                  placeholder="e.g., The Great Pug" className="input-field text-sm" autoFocus />
              </div>
              <div>
                <label className="text-xs text-surface-500 block mb-1">Author</label>
                <input type="text" value={authorName} onChange={e => setAuthorName(e.target.value)}
                  placeholder="Creator name" className="input-field text-sm" />
              </div>
              <div>
                <label className="text-xs text-surface-500 block mb-1">World ID</label>
                <input type="text" value={worldId} onChange={e => setWorldId(e.target.value)}
                  placeholder="wrld_..." className="input-field text-sm font-mono" />
              </div>
              <div>
                <label className="text-xs text-surface-500 block mb-1">Image URL</label>
                <input type="text" value={worldImage} onChange={e => setWorldImage(e.target.value)}
                  placeholder="https://..." className="input-field text-sm" />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs text-surface-500 block mb-1">Rating</label>
                <StarRating rating={worldRating} onChange={setWorldRating} />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs text-surface-500 block mb-1">Notes</label>
                <textarea value={worldNotes} onChange={e => setWorldNotes(e.target.value)}
                  placeholder="Your thoughts on this world..." className="input-field text-sm h-16 resize-none" />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs text-surface-500 block mb-1">Tags</label>
                <div className="flex gap-2">
                  <input type="text" value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                    placeholder="Add tag..." className="input-field text-sm flex-1" />
                  <button onClick={addTag} className="btn-secondary text-xs">+</button>
                </div>
                {worldTags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {worldTags.map(t => (
                      <span key={t} className="badge bg-accent-600/20 text-accent-400 flex items-center gap-1">
                        {t} <button onClick={() => setWorldTags(prev => prev.filter(x => x !== t))}><X size={8} /></button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-2 border-t border-surface-800">
              <button onClick={() => setIsAddingWorld(false)} className="btn-secondary text-sm">Cancel</button>
              <button onClick={saveWorld} disabled={!worldName.trim()} className="btn-primary text-sm">
                {editingWorldIdx !== null ? 'Save' : 'Add World'}
              </button>
            </div>
          </div>
        )}

        {/* World list */}
        {filteredWorlds.length === 0 ? (
          <EmptyState
            icon={Globe}
            title={search ? 'No matching worlds' : 'No worlds in this collection'}
            description={search ? 'Try different search terms' : 'Add worlds to build your curated list'}
          />
        ) : (
          <div className="space-y-2">
            {filteredWorlds.map((world, idx) => {
              const realIdx = activeCollection.worlds.indexOf(world);
              return (
                <div key={`${world.worldId}_${idx}`} className="glass-panel-solid p-3 flex items-center gap-3 card-hover group">
                  {world.worldImage ? (
                    <img src={world.worldImage} alt="" className="w-20 h-14 rounded-lg object-cover flex-shrink-0 bg-surface-800" />
                  ) : (
                    <div className="w-20 h-14 rounded-lg bg-surface-800 flex items-center justify-center flex-shrink-0">
                      <Globe size={20} className="text-surface-600" />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold truncate">{world.worldName}</span>
                      <StarRating rating={world.rating} readonly />
                    </div>
                    {world.authorName && (
                      <div className="text-xs text-surface-500 mt-0.5">by {world.authorName}</div>
                    )}
                    {world.notes && (
                      <div className="text-xs text-surface-400 mt-1 line-clamp-1">{world.notes}</div>
                    )}
                    {world.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {world.tags.map(t => (
                          <span key={t} className="badge bg-surface-800 text-surface-400 text-[10px]">
                            <Tag size={8} className="mr-0.5" /> {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button onClick={() => openEditWorld(realIdx)} className="btn-ghost p-1.5" title="Edit">
                      <Edit3 size={12} />
                    </button>
                    <button onClick={() => removeWorld(realIdx)} className="btn-ghost p-1.5 text-red-400" title="Remove">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // --- Collection list view ---
  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FolderHeart size={24} className="text-accent-400" /> World Collections
          </h1>
          <p className="text-sm text-surface-400 mt-0.5">
            Curate personal world lists with ratings, notes, and tags
          </p>
        </div>
        <button onClick={() => setIsCreatingCollection(true)} className="btn-primary text-sm flex items-center gap-1.5">
          <Plus size={14} /> New Collection
        </button>
      </div>

      {/* Create collection form */}
      {isCreatingCollection && (
        <div className="glass-panel-solid p-5 space-y-3 border border-accent-500/20">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">New Collection</h3>
            <button onClick={() => setIsCreatingCollection(false)} className="btn-ghost p-1"><X size={14} /></button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="text-xs text-surface-500 block mb-1">Collection Name *</label>
              <input type="text" value={colName} onChange={e => setColName(e.target.value)}
                placeholder="e.g., Horror Worlds, Chill Spots..."
                className="input-field text-sm" autoFocus />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-surface-500 block mb-1">Description</label>
              <input type="text" value={colDesc} onChange={e => setColDesc(e.target.value)}
                placeholder="What's this collection about?"
                className="input-field text-sm" />
            </div>
            <div>
              <label className="text-xs text-surface-500 block mb-1">Icon</label>
              <div className="flex flex-wrap gap-1.5">
                {COLLECTION_ICONS.map(icon => (
                  <button
                    key={icon}
                    onClick={() => setColIcon(icon)}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center text-lg transition-all ${
                      colIcon === icon ? 'bg-accent-600/30 ring-1 ring-accent-500' : 'bg-surface-800 hover:bg-surface-700'
                    }`}
                  >
                    {icon}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-surface-500 block mb-1">Color</label>
              <div className="flex flex-wrap gap-1.5">
                {COLLECTION_COLORS.map((color, i) => (
                  <button
                    key={i}
                    onClick={() => setColColorIdx(i)}
                    className={`w-8 h-8 rounded-lg border-2 ${color} transition-all ${
                      colColorIdx === i ? 'ring-1 ring-white' : 'opacity-50 hover:opacity-100'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-2 border-t border-surface-800">
            <button onClick={() => setIsCreatingCollection(false)} className="btn-secondary text-sm">Cancel</button>
            <button onClick={createCollection} disabled={!colName.trim()} className="btn-primary text-sm">
              Create Collection
            </button>
          </div>
        </div>
      )}

      {/* Collections grid */}
      {collections.length === 0 && !isCreatingCollection ? (
        <EmptyState
          icon={FolderHeart}
          title="No collections yet"
          description="Create collections to organize and rate your favorite VRChat worlds"
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {collections.map(col => (
            <button
              key={col.id}
              onClick={() => setSelectedCollection(col.id)}
              className={`glass-panel-solid p-4 text-left card-hover border ${col.color} group relative`}
            >
              <div className="flex items-center gap-3 mb-2">
                <span className="text-2xl">{col.icon}</span>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold truncate">{col.name}</h3>
                  <div className="text-xs text-surface-500">{col.worlds.length} world{col.worlds.length !== 1 ? 's' : ''}</div>
                </div>
                <ChevronRight size={14} className="text-surface-600 group-hover:text-surface-400 transition-colors" />
              </div>
              {col.description && (
                <p className="text-xs text-surface-400 line-clamp-2">{col.description}</p>
              )}
              {/* Preview thumbnails */}
              {col.worlds.length > 0 && (
                <div className="flex gap-1 mt-3">
                  {col.worlds.slice(0, 4).map((w, i) => (
                    w.worldImage ? (
                      <img key={i} src={w.worldImage} alt="" className="w-10 h-7 rounded object-cover bg-surface-800" />
                    ) : (
                      <div key={i} className="w-10 h-7 rounded bg-surface-800 flex items-center justify-center">
                        <Globe size={10} className="text-surface-600" />
                      </div>
                    )
                  ))}
                  {col.worlds.length > 4 && (
                    <div className="w-10 h-7 rounded bg-surface-800 flex items-center justify-center text-[10px] text-surface-500">
                      +{col.worlds.length - 4}
                    </div>
                  )}
                </div>
              )}
              <div className="text-[10px] text-surface-600 mt-2">
                Updated {format(col.updatedAt, 'MMM d')}
              </div>

              {/* Delete button */}
              <button
                onClick={(e) => { e.stopPropagation(); deleteCollection(col.id); }}
                className="absolute top-2 right-2 btn-ghost p-1 opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300"
              >
                <Trash2 size={12} />
              </button>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
