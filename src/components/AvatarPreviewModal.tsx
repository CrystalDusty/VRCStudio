import { useState, useEffect } from 'react';
import { X, Download, Copy, Check, ExternalLink, Folder, AlertCircle, Loader, Archive, FolderOpen } from 'lucide-react';
import type { VRCAvatar } from '../types/vrchat';
import { extractAvatarBundle, openBundleFolder, isBundleDownloaded, addBundleToStore } from '../utils/avatarBundle';
import { downloadBundleDirectly } from '../utils/directDownload';
import { downloadAvatarExtract, browseCacheFile } from '../utils/avatarExtractor';
import BundleLoader from './BundleLoader';

interface AvatarPreviewModalProps {
  avatar: VRCAvatar;
  onClose: () => void;
}

export default function AvatarPreviewModal({ avatar, onClose }: AvatarPreviewModalProps) {
  const [copied, setCopied] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isExtracted, setIsExtracted] = useState(false);
  const [extractedPath, setExtractedPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(
    avatar.unityPackages?.[0]?.id || null
  );
  const [isExtracting2, setIsExtracting2] = useState(false);

  // Check if bundle is already downloaded
  useEffect(() => {
    setIsExtracted(isBundleDownloaded(avatar.id));
  }, [avatar.id]);

  const handleExtractAvatar = async () => {
    setIsExtracting2(true);
    setError(null);

    try {
      const result = await downloadAvatarExtract(avatar);
      if (result.success) {
        if (!result.bundleFound) {
          setError(result.error || 'Bundle not found in VRChat cache - download still completed with metadata and images');
          console.warn('[AvatarPreview] Bundle not in cache:', result.error);
        } else {
          setError(null);
        }
      } else {
        setError(result.error || 'Failed to extract avatar');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setError(`Extraction failed: ${errorMsg}`);
    } finally {
      setIsExtracting2(false);
    }
  };

  const handleCopyId = () => {
    navigator.clipboard.writeText(avatar.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleViewInVRChat = () => {
    window.open(`https://vrchat.com/home/avatar/${avatar.id}`, '_blank');
  };

  const handleDownloadImage = async () => {
    try {
      const response = await fetch(avatar.imageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${avatar.name}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download image:', error);
    }
  };

  const handleDownloadBundle = async () => {
    if (!selectedPackageId) {
      setError('No package selected');
      return;
    }

    setIsDownloading(true);
    setError(null);
    setDownloadProgress(0);

    console.log('[AvatarPreview] Starting direct download for package:', selectedPackageId);

    try {
      // Use direct download with the URL from VRChat API
      const result = await downloadBundleDirectly(
        avatar,
        selectedPackageId,
        (current, total) => {
          setDownloadProgress(Math.round((current / total) * 100));
        }
      );

      if (result.success && result.path) {
        // Extract the bundle
        setIsExtracting(true);
        const extractResult = await extractAvatarBundle(result.path, avatar.id);

        if (extractResult.success && extractResult.extractedPath) {
          // Get bundle info for store
          const selectedPackage = avatar.unityPackages?.find(p => p.id === selectedPackageId);
          if (selectedPackage) {
            addBundleToStore(
              avatar.id,
              avatar.name,
              selectedPackage.platform,
              result.path,
              0,
              selectedPackage.unityVersion,
              selectedPackageId
            );
          }
          setExtractedPath(extractResult.extractedPath);
          setIsExtracted(true);
          setError(null);
          console.log(`[AvatarPreview] Successfully downloaded and extracted`);
        } else {
          setError(extractResult.error || 'Failed to extract bundle');
        }

        setIsExtracting(false);
      } else {
        setError(result.error || 'Failed to download bundle');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setError(`Download error: ${errorMsg}`);
    }

    setIsDownloading(false);
  };

  const handleOpenBundleFolder = async () => {
    try {
      await openBundleFolder(avatar.id);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to open folder');
    }
  };

  const handleBrowseCache = async () => {
    setIsExtracting2(true);
    setError(null);

    try {
      const browseResult = await browseCacheFile();
      if (!browseResult.success || !browseResult.path) {
        setError(browseResult.error || 'No file selected');
        setIsExtracting2(false);
        return;
      }

      console.log('[AvatarPreview] User selected file:', browseResult.path);

      // Extract the selected file to Downloads
      const electronAPI = (window as any).electronAPI;
      const extractResult = await electronAPI.extractAvatarToDownloads(browseResult.path, avatar.id);

      if (extractResult.success) {
        setError(null);
        console.log('[AvatarPreview] Successfully extracted bundle to:', extractResult.path);
      } else {
        setError(extractResult.error || 'Failed to extract bundle');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setError(`Browse failed: ${errorMsg}`);
    } finally {
      setIsExtracting2(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-surface-900 rounded-xl max-w-md w-full glass-panel-solid overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Close button */}
        <div className="absolute top-3 right-3 z-10">
          <button
            onClick={onClose}
            className="btn-ghost rounded-lg"
          >
            <X size={18} />
          </button>
        </div>

        {/* Avatar image */}
        <div className="aspect-square overflow-hidden">
          <img
            src={avatar.imageUrl}
            alt={avatar.name}
            className="w-full h-full object-cover"
          />
        </div>

        {/* Avatar details */}
        <div className="p-4 space-y-3">
          <div>
            <h2 className="text-lg font-bold truncate">{avatar.name}</h2>
            <p className="text-sm text-surface-400">by {avatar.authorName}</p>
          </div>

          {avatar.description && (
            <p className="text-xs text-surface-400 line-clamp-3">
              {avatar.description}
            </p>
          )}

          {/* Avatar ID */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-surface-500">Avatar ID</label>
            <div className="flex gap-2">
              <code className="flex-1 bg-surface-800 px-2 py-1.5 rounded text-xs font-mono text-surface-300 truncate">
                {avatar.id}
              </code>
              <button
                onClick={handleCopyId}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
                  copied
                    ? 'bg-green-500/80 text-white'
                    : 'bg-surface-800 text-surface-300 hover:bg-surface-700'
                }`}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
          </div>

          {/* Metadata */}
          <div className="grid grid-cols-2 gap-2 text-xs text-surface-400">
            <div>
              <span className="text-surface-500">Version:</span> {avatar.version}
            </div>
            <div>
              <span className="text-surface-500">Status:</span> {avatar.releaseStatus}
            </div>
          </div>

          {/* Tags */}
          {avatar.tags && avatar.tags.length > 0 && (
            <div>
              <label className="text-xs font-semibold text-surface-500 block mb-1.5">Tags</label>
              <div className="flex flex-wrap gap-1">
                {avatar.tags
                  .filter(t => !t.startsWith('system_') && !t.startsWith('admin_'))
                  .map(tag => (
                    <span key={tag} className="badge bg-surface-800 text-surface-400 text-[10px]">
                      {tag.replace('author_tag_', '')}
                    </span>
                  ))}
              </div>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="flex gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-400">
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Package selector (Windows only) */}
          {typeof window !== 'undefined' && (window as any).electronAPI && avatar.unityPackages && avatar.unityPackages.length > 0 && (
            <div>
              <label className="text-xs font-semibold text-surface-500 block mb-1.5">Package</label>
              <select
                value={selectedPackageId || ''}
                onChange={e => setSelectedPackageId(e.target.value)}
                disabled={isDownloading || isExtracting}
                className="w-full px-3 py-2 bg-surface-800 border border-surface-700 rounded text-xs text-surface-300 hover:bg-surface-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {avatar.unityPackages.map(pkg => (
                  <option key={pkg.id} value={pkg.id}>
                    {pkg.platform} (Unity {pkg.unityVersion})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Bundle download progress */}
          {(isDownloading || isExtracting) && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-surface-400">
                <span>{isExtracting ? 'Extracting...' : 'Downloading...'}</span>
                {!isExtracting && <span>{downloadProgress}%</span>}
              </div>
              <div className="w-full bg-surface-800 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-accent-600 h-full rounded-full transition-all duration-300"
                  style={{ width: `${isExtracting ? 100 : downloadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="space-y-2 mt-4">
            <button
              onClick={handleViewInVRChat}
              className="btn-primary w-full text-sm flex items-center justify-center gap-2"
            >
              <ExternalLink size={14} /> View in VRChat
            </button>

            {/* Bundle download/open buttons (Windows only) */}
            {typeof window !== 'undefined' && (window as any).electronAPI && (
              <>
                {!isExtracted ? (
                  <button
                    onClick={handleDownloadBundle}
                    disabled={isDownloading || isExtracting || !selectedPackageId}
                    className="btn-secondary w-full text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isDownloading || isExtracting ? (
                      <>
                        <Loader size={14} className="animate-spin" /> Preparing...
                      </>
                    ) : (
                      <>
                        <Download size={14} /> Download Bundle
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    onClick={handleOpenBundleFolder}
                    className="btn-secondary w-full text-sm flex items-center justify-center gap-2"
                  >
                    <Folder size={14} /> Open in File Explorer
                  </button>
                )}
              </>
            )}

            <button
              onClick={handleDownloadImage}
              className="btn-secondary w-full text-sm flex items-center justify-center gap-2"
            >
              <Download size={14} /> Download Image
            </button>

            <button
              onClick={handleExtractAvatar}
              disabled={isExtracting2}
              className="btn-secondary w-full text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Extract avatar metadata and images for download"
            >
              {isExtracting2 ? (
                <>
                  <Loader size={14} className="animate-spin" /> Extracting...
                </>
              ) : (
                <>
                  <Archive size={14} /> Extract Avatar Data
                </>
              )}
            </button>

            <button
              onClick={handleBrowseCache}
              disabled={isExtracting2}
              className="btn-secondary w-full text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Manually select _data file from VRChat cache"
            >
              {isExtracting2 ? (
                <>
                  <Loader size={14} className="animate-spin" /> Processing...
                </>
              ) : (
                <>
                  <FolderOpen size={14} /> Browse Cache File
                </>
              )}
            </button>
          </div>

          {/* Bundle Loader - Show after extraction */}
          {isExtracted && extractedPath && (
            <div className="border-t border-surface-700 pt-4 mt-4">
              <BundleLoader bundlePath={extractedPath} avatarName={avatar.name} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
