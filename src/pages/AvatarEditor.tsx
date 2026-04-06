import { useState, useRef, useCallback } from 'react';
import {
  Paintbrush, Copy, Check, Download, Upload, FileCode, X,
  Sparkles, Eye, Flame, Box, Droplets, ChevronDown, ChevronUp,
} from 'lucide-react';
import { builtInShaders, downloadShaderFile, type ShaderInfo } from '../data/shaders';

const categoryIcons: Record<string, typeof Sparkles> = {
  toon: Paintbrush,
  effect: Sparkles,
  utility: Box,
  transparent: Droplets,
};

const categoryLabels: Record<string, string> = {
  toon: 'Toon',
  effect: 'Effects',
  utility: 'Utility',
  transparent: 'Transparent',
};

interface ImportedFile {
  name: string;
  size: number;
  type: 'asset' | 'shader';
  extension: string;
}

export default function AvatarEditor() {
  const [selectedShader, setSelectedShader] = useState<ShaderInfo | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [importedAssets, setImportedAssets] = useState<ImportedFile[]>([]);
  const [importedShaders, setImportedShaders] = useState<ImportedFile[]>([]);
  const [expandedSection, setExpandedSection] = useState<string>('shaders');
  const assetInputRef = useRef<HTMLInputElement>(null);
  const shaderInputRef = useRef<HTMLInputElement>(null);

  const handleCopyCode = (shader: ShaderInfo) => {
    navigator.clipboard.writeText(shader.code);
    setCopiedId(shader.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleAssetImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newAssets: ImportedFile[] = Array.from(files).map(f => ({
      name: f.name,
      size: f.size,
      type: 'asset',
      extension: f.name.split('.').pop()?.toLowerCase() || '',
    }));
    setImportedAssets(prev => [...prev, ...newAssets]);
    e.target.value = '';
  };

  const handleShaderImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newShaders: ImportedFile[] = Array.from(files).map(f => ({
      name: f.name,
      size: f.size,
      type: 'shader',
      extension: f.name.split('.').pop()?.toLowerCase() || '',
    }));
    setImportedShaders(prev => [...prev, ...newShaders]);
    e.target.value = '';
  };

  const removeAsset = (index: number) => {
    setImportedAssets(prev => prev.filter((_, i) => i !== index));
  };

  const removeShader = (index: number) => {
    setImportedShaders(prev => prev.filter((_, i) => i !== index));
  };

  const handleDrop = useCallback((e: React.DragEvent, type: 'asset' | 'shader') => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (!files.length) return;
    const newFiles: ImportedFile[] = Array.from(files).map(f => ({
      name: f.name,
      size: f.size,
      type,
      extension: f.name.split('.').pop()?.toLowerCase() || '',
    }));
    if (type === 'asset') {
      setImportedAssets(prev => [...prev, ...newFiles]);
    } else {
      setImportedShaders(prev => [...prev, ...newFiles]);
    }
  }, []);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? '' : section);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Paintbrush size={24} /> Avatar Editor
        </h1>
        <p className="text-surface-400 text-sm mt-1">
          Custom shaders, asset management, and shader importing for your VRChat avatars
        </p>
      </div>

      {/* Custom Shaders Section */}
      <section className="glass-panel-solid">
        <button
          onClick={() => toggleSection('shaders')}
          className="w-full flex items-center justify-between p-4"
        >
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-accent-400" />
            <h2 className="text-lg font-semibold">Custom Shaders</h2>
            <span className="text-xs text-surface-500 ml-2">{builtInShaders.length} shaders</span>
          </div>
          {expandedSection === 'shaders' ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>

        {expandedSection === 'shaders' && (
          <div className="px-4 pb-4">
            <p className="text-xs text-surface-500 mb-4">
              Ready-to-use Unity shaders for VRChat avatars. Copy the code or download the .shader file to import into your Unity project.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {builtInShaders.map(shader => {
                const CategoryIcon = categoryIcons[shader.category] || Box;
                return (
                  <div
                    key={shader.id}
                    className={`rounded-lg border transition-all cursor-pointer ${
                      selectedShader?.id === shader.id
                        ? 'border-accent-500 bg-accent-500/5'
                        : 'border-surface-800 bg-surface-800/30 hover:border-surface-700 hover:bg-surface-800/50'
                    }`}
                    onClick={() => setSelectedShader(selectedShader?.id === shader.id ? null : shader)}
                  >
                    <div className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: shader.color + '20' }}
                          >
                            <CategoryIcon size={16} style={{ color: shader.color }} />
                          </div>
                          <div className="min-w-0">
                            <h3 className="text-sm font-semibold truncate">{shader.name}</h3>
                            <span className="text-[10px] text-surface-500 uppercase tracking-wide">
                              {categoryLabels[shader.category]}
                            </span>
                          </div>
                        </div>
                        <div
                          className="w-4 h-4 rounded-full flex-shrink-0 mt-1 ring-1 ring-surface-700"
                          style={{ backgroundColor: shader.color }}
                        />
                      </div>
                      <p className="text-xs text-surface-400 mt-2 line-clamp-2">{shader.description}</p>

                      <div className="flex gap-1.5 mt-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopyCode(shader);
                          }}
                          className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs font-medium transition-all ${
                            copiedId === shader.id
                              ? 'bg-green-500/20 text-green-400'
                              : 'bg-surface-800 text-surface-300 hover:bg-surface-700'
                          }`}
                        >
                          {copiedId === shader.id ? <Check size={12} /> : <Copy size={12} />}
                          {copiedId === shader.id ? 'Copied' : 'Copy'}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            downloadShaderFile(shader);
                          }}
                          className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs font-medium bg-surface-800 text-surface-300 hover:bg-surface-700 transition-all"
                        >
                          <Download size={12} /> Download
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Shader Code Preview */}
            {selectedShader && (
              <div className="mt-4 rounded-lg border border-surface-800 overflow-hidden animate-fade-in">
                <div className="flex items-center justify-between px-4 py-2 bg-surface-800/50 border-b border-surface-800">
                  <div className="flex items-center gap-2">
                    <FileCode size={14} className="text-accent-400" />
                    <span className="text-sm font-medium">{selectedShader.name}</span>
                    <span className="text-xs text-surface-500">.shader</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleCopyCode(selectedShader)}
                      className="btn-ghost text-xs flex items-center gap-1 px-2 py-1"
                    >
                      {copiedId === selectedShader.id ? <Check size={12} /> : <Copy size={12} />}
                      {copiedId === selectedShader.id ? 'Copied' : 'Copy Code'}
                    </button>
                    <button
                      onClick={() => setSelectedShader(null)}
                      className="btn-ghost p-1"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
                <pre className="p-4 text-xs text-surface-300 overflow-auto max-h-96 bg-surface-950/50 font-mono leading-relaxed">
                  {selectedShader.code}
                </pre>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Asset Importing Section */}
      <section className="glass-panel-solid">
        <button
          onClick={() => toggleSection('assets')}
          className="w-full flex items-center justify-between p-4"
        >
          <div className="flex items-center gap-2">
            <Upload size={18} className="text-blue-400" />
            <h2 className="text-lg font-semibold">Asset Library</h2>
            {importedAssets.length > 0 && (
              <span className="text-xs bg-blue-500/15 text-blue-400 px-1.5 py-0.5 rounded-full font-semibold">
                {importedAssets.length}
              </span>
            )}
          </div>
          {expandedSection === 'assets' ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>

        {expandedSection === 'assets' && (
          <div className="px-4 pb-4">
            <p className="text-xs text-surface-500 mb-3">
              Import 3D models, textures, and materials to organize for your avatar projects.
            </p>

            {/* Drop zone */}
            <div
              onDrop={(e) => handleDrop(e, 'asset')}
              onDragOver={handleDragOver}
              className="border-2 border-dashed border-surface-700 rounded-lg p-6 text-center hover:border-surface-600 hover:bg-surface-800/20 transition-all cursor-pointer"
              onClick={() => assetInputRef.current?.click()}
            >
              <Upload size={24} className="mx-auto text-surface-500 mb-2" />
              <p className="text-sm text-surface-400">Drop files here or click to browse</p>
              <p className="text-xs text-surface-600 mt-1">.fbx, .obj, .png, .tga, .mat, .prefab</p>
            </div>
            <input
              ref={assetInputRef}
              type="file"
              multiple
              accept=".fbx,.obj,.png,.tga,.jpg,.jpeg,.mat,.prefab,.asset,.blend"
              onChange={handleAssetImport}
              className="hidden"
            />

            {/* Imported assets list */}
            {importedAssets.length > 0 && (
              <div className="mt-3 space-y-1">
                {importedAssets.map((asset, idx) => (
                  <div key={idx} className="flex items-center justify-between px-3 py-2 bg-surface-800/40 rounded-lg group">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-mono text-surface-500 uppercase w-8">.{asset.extension}</span>
                      <span className="text-sm text-surface-300 truncate">{asset.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-surface-500">{formatSize(asset.size)}</span>
                      <button
                        onClick={() => removeAsset(idx)}
                        className="opacity-0 group-hover:opacity-100 text-surface-500 hover:text-red-400 transition-all"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Shader Importing Section */}
      <section className="glass-panel-solid">
        <button
          onClick={() => toggleSection('shader-import')}
          className="w-full flex items-center justify-between p-4"
        >
          <div className="flex items-center gap-2">
            <FileCode size={18} className="text-purple-400" />
            <h2 className="text-lg font-semibold">Shader Library</h2>
            {importedShaders.length > 0 && (
              <span className="text-xs bg-purple-500/15 text-purple-400 px-1.5 py-0.5 rounded-full font-semibold">
                {importedShaders.length}
              </span>
            )}
          </div>
          {expandedSection === 'shader-import' ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>

        {expandedSection === 'shader-import' && (
          <div className="px-4 pb-4">
            <p className="text-xs text-surface-500 mb-3">
              Import your own custom shaders to organize and manage across projects.
            </p>

            {/* Drop zone */}
            <div
              onDrop={(e) => handleDrop(e, 'shader')}
              onDragOver={handleDragOver}
              className="border-2 border-dashed border-surface-700 rounded-lg p-6 text-center hover:border-surface-600 hover:bg-surface-800/20 transition-all cursor-pointer"
              onClick={() => shaderInputRef.current?.click()}
            >
              <FileCode size={24} className="mx-auto text-surface-500 mb-2" />
              <p className="text-sm text-surface-400">Drop shader files here or click to browse</p>
              <p className="text-xs text-surface-600 mt-1">.shader, .cginc, .hlsl, .glsl, .compute</p>
            </div>
            <input
              ref={shaderInputRef}
              type="file"
              multiple
              accept=".shader,.cginc,.hlsl,.glsl,.compute"
              onChange={handleShaderImport}
              className="hidden"
            />

            {/* Imported shaders list */}
            {importedShaders.length > 0 && (
              <div className="mt-3 space-y-1">
                {importedShaders.map((shader, idx) => (
                  <div key={idx} className="flex items-center justify-between px-3 py-2 bg-surface-800/40 rounded-lg group">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-mono text-purple-400 uppercase w-12">.{shader.extension}</span>
                      <span className="text-sm text-surface-300 truncate">{shader.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-surface-500">{formatSize(shader.size)}</span>
                      <button
                        onClick={() => removeShader(idx)}
                        className="opacity-0 group-hover:opacity-100 text-surface-500 hover:text-red-400 transition-all"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
