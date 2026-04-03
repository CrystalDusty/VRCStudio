import { useEffect, useState } from 'react';
import { FolderOpen, FileJson, Package, AlertCircle, Loader } from 'lucide-react';

interface BundleLoaderProps {
  bundlePath: string;
  avatarName: string;
}

interface BundleFile {
  name: string;
  path: string;
  size: number;
  type: 'file' | 'directory';
  extension?: string;
}

export default function BundleLoader({ bundlePath, avatarName }: BundleLoaderProps) {
  const [files, setFiles] = useState<BundleFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadBundleContents();
  }, [bundlePath]);

  const loadBundleContents = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.listDir) {
        throw new Error('Electron API not available');
      }

      // Recursively list bundle contents
      const contents = await electronAPI.listDir(bundlePath);
      setFiles(parseContents(contents, bundlePath));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load bundle contents');
    } finally {
      setIsLoading(false);
    }
  };

  const parseContents = (entries: any[], basePath: string): BundleFile[] => {
    return entries.map(entry => ({
      name: entry.name || entry,
      path: `${basePath}/${entry.name || entry}`,
      size: entry.size || 0,
      type: entry.isDirectory ? 'directory' : 'file',
      extension: entry.name ? entry.name.split('.').pop() : undefined,
    }));
  };

  const toggleDir = (dirPath: string) => {
    const newExpanded = new Set(expandedDirs);
    if (newExpanded.has(dirPath)) {
      newExpanded.delete(dirPath);
    } else {
      newExpanded.add(dirPath);
    }
    setExpandedDirs(newExpanded);
  };

  const getFileIcon = (extension?: string) => {
    switch (extension?.toLowerCase()) {
      case 'json':
      case 'yaml':
      case 'yml':
        return 'text-yellow-400';
      case 'cs':
      case 'cpp':
      case 'ts':
      case 'js':
        return 'text-blue-400';
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'mat':
        return 'text-purple-400';
      default:
        return 'text-surface-400';
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader size={20} className="text-accent-500 animate-spin mr-2" />
        <span className="text-sm text-surface-400">Loading bundle contents...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex gap-3">
        <AlertCircle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-red-400">Failed to load bundle</p>
          <p className="text-xs text-red-400/70 mt-1">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Bundle Info Header */}
      <div className="glass-panel p-3">
        <div className="flex items-start gap-3">
          <Package size={16} className="text-accent-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm text-surface-100">{avatarName}</h3>
            <p className="text-xs text-surface-400 mt-1">
              Bundle extracted and ready to load in Unity
            </p>
            <div className="mt-2 text-xs text-surface-500 font-mono break-all">
              {bundlePath}
            </div>
          </div>
        </div>
      </div>

      {/* Bundle Contents */}
      <div className="glass-panel p-3 max-h-96 overflow-y-auto">
        <div className="text-xs font-semibold text-surface-400 mb-2">
          Bundle Contents ({files.length} items)
        </div>

        {files.length === 0 ? (
          <p className="text-xs text-surface-500 text-center py-4">
            Bundle is empty or could not be read
          </p>
        ) : (
          <div className="space-y-1 font-mono text-[11px]">
            {files.map((file, idx) => (
              <div key={idx} className="flex items-center gap-2 px-2 py-1 hover:bg-surface-800/50 rounded">
                {file.type === 'directory' ? (
                  <>
                    <button
                      onClick={() => toggleDir(file.path)}
                      className="text-surface-500 hover:text-surface-300 flex-shrink-0"
                    >
                      {expandedDirs.has(file.path) ? '📂' : '📁'}
                    </button>
                    <span className="text-surface-300">{file.name}/</span>
                  </>
                ) : (
                  <>
                    <span className="text-surface-600">📄</span>
                    <span className={`${getFileIcon(file.extension)}`}>{file.name}</span>
                    <span className="text-surface-600 ml-auto text-[10px]">
                      {formatSize(file.size)}
                    </span>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="text-xs text-surface-400 space-y-1">
        <p className="font-semibold text-surface-300">How to use in Unity:</p>
        <ol className="space-y-0.5 list-decimal list-inside">
          <li>Open Unity and navigate to the Assets folder</li>
          <li>Go to: Assets → Import Package → Custom Package</li>
          <li>Navigate to: <code className="bg-surface-800 px-1 rounded text-[10px]">{bundlePath}</code></li>
          <li>Click Import to add the avatar to your project</li>
        </ol>
      </div>

      {/* Open Folder Button */}
      <button
        onClick={() => {
          const electronAPI = (window as any).electronAPI;
          if (electronAPI?.openBundleFolder) {
            electronAPI.openBundleFolder(bundlePath).catch((e: Error) =>
              console.error('Failed to open folder:', e)
            );
          }
        }}
        className="w-full py-2 px-3 rounded-lg bg-accent-600/20 text-accent-400 hover:bg-accent-600/30 transition-colors text-sm font-medium flex items-center justify-center gap-2"
      >
        <FolderOpen size={14} />
        Open in File Explorer
      </button>
    </div>
  );
}
