import { useState, useEffect } from 'react';
import { X, Download, Copy, Check, ExternalLink, Folder, AlertCircle, Loader, Archive, FolderOpen, Save, Unlock, Key } from 'lucide-react';
import type { VRCAvatar } from '../types/vrchat';
import { extractAvatarBundle, openBundleFolder, isBundleDownloaded, addBundleToStore } from '../utils/avatarBundle';
import { downloadBundleDirectly } from '../utils/directDownload';
import { browseCacheFile } from '../utils/avatarExtractor';
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
  const [selectedCacheFile, setSelectedCacheFile] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [encryptionStatus, setEncryptionStatus] = useState<'unknown' | 'encrypted' | 'not_encrypted'>('unknown');
  const [isVRChatRunning, setIsVRChatRunning] = useState(false);

  // Check if bundle is already downloaded
  useEffect(() => {
    setIsExtracted(isBundleDownloaded(avatar.id));
  }, [avatar.id]);

  // Check VRChat running status periodically
  useEffect(() => {
    const checkVRChat = async () => {
      const electronAPI = (window as any).electronAPI;
      if (electronAPI?.decryptIsVRChatRunning) {
        const result = await electronAPI.decryptIsVRChatRunning();
        setIsVRChatRunning(result.running);
      }
    };
    checkVRChat();
    const interval = setInterval(checkVRChat, 5000);
    return () => clearInterval(interval);
  }, []);

  // Check encryption status when cache file is selected
  useEffect(() => {
    const checkEncryption = async () => {
      if (!selectedCacheFile) {
        setEncryptionStatus('unknown');
        return;
      }
      const electronAPI = (window as any).electronAPI;
      if (electronAPI?.decryptCheckEncryption) {
        const result = await electronAPI.decryptCheckEncryption(selectedCacheFile);
        if (result.success) {
          setEncryptionStatus(result.encrypted ? 'encrypted' : 'not_encrypted');
        }
      }
    };
    checkEncryption();
  }, [selectedCacheFile]);

  const handleDecryptBundle = async () => {
    setIsDecrypting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const electronAPI = (window as any).electronAPI;
      let cacheFile = selectedCacheFile;

      // If no cache file selected, try auto-search
      if (!cacheFile) {
        const searchResult = await electronAPI.searchCacheForDataFiles(avatar.id, selectedPackageId || undefined);
        if (searchResult.success && searchResult.bundles?.length > 0) {
          cacheFile = searchResult.bundles[0];
          setSelectedCacheFile(cacheFile);
        } else {
          setError('No cache file found. Use "Browse Cache File" to select one manually.');
          setIsDecrypting(false);
          return;
        }
      }

      // Run full decryption pipeline
      const result = await electronAPI.decryptFullPipeline(cacheFile);

      if (result.success) {
        if (result.encrypted && result.decrypted) {
          setSuccessMessage(`Decrypted and patched! Saved to: ${result.outputPath}`);
        } else if (!result.encrypted) {
          setSuccessMessage(`File was not encrypted. Version patched: ${result.outputPath}`);
        }
        setEncryptionStatus('not_encrypted');
        
        // Open the output folder
        if (result.outputPath) {
          try {
            await electronAPI.openBundleFolder(result.outputPath);
          } catch { /* non-critical */ }
        }
      } else {
        if (result.needsVRChat) {
          setError(`VRChat must be running to extract decryption keys.\n\n1. Start VRChat\n2. Log in\n3. Load any avatar\n4. Try again`);
        } else {
          setError(result.error || result.instructions || 'Decryption failed');
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Decryption failed');
    } finally {
      setIsDecrypting(false);
    }
  };

  const handleExtractKeys = async () => {
    setError(null);
    setSuccessMessage(null);

    try {
      const electronAPI = (window as any).electronAPI;
      const result = await electronAPI.decryptExtractKeys(selectedCacheFile);

      if (result.success && result.keys?.length > 0) {
        setSuccessMessage(`Extracted ${result.keys.length} potential decryption keys. Try decrypting now!`);
      } else {
        setError(result.error || result.instructions || 'No keys found');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Key extraction failed');
    }
  };

  const handleExtractAvatar = async () => {
    setIsExtracting2(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const electronAPI = (window as any).electronAPI;
      let cacheFile = selectedCacheFile;

      // If no cache file selected, try auto-search
      if (!cacheFile) {
        console.log('[AvatarPreview] No cache file selected, searching cache...');
        const searchResult = await electronAPI.searchCacheForDataFiles(avatar.id, selectedPackageId || undefined);

        if (searchResult.success && searchResult.bundles && searchResult.bundles.length > 0) {
          cacheFile = searchResult.bundles[0];
          console.log('[AvatarPreview] Found cache bundle:', cacheFile);
        } else {
          setError('No avatar bundle found in VRChat cache. Use "Browse Cache File" to select one manually.');
          return;
        }
      }

      console.log('[AvatarPreview] Creating .unitypackage from:', cacheFile);
      const result = await electronAPI.extractAvatarToDownloads(cacheFile, avatar.id);

      if (result.success) {
        setError(null);
        setSuccessMessage(`Saved to Downloads: ${avatar.id}.unitypackage`);
        console.log('[AvatarPreview] .unitypackage saved to:', result.path);

        // Open the file in Explorer so user can see it
        try {
          await electronAPI.openBundleFolder(result.path);
        } catch { /* non-critical */ }
      } else {
        setError(result.error || 'Failed to create .unitypackage');
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
              extractResult.extractedPath,
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
          setError(extractResult.error || 'Failed to create .unitypackage');
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
    setError(null);

    try {
      const browseResult = await browseCacheFile();
      if (!browseResult.success || !browseResult.path) {
        setError(browseResult.error || 'No file selected');
        return;
      }

      console.log('[AvatarPreview] User selected cache file:', browseResult.path);
      setSelectedCacheFile(browseResult.path);
      setError(null);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setError(`Browse failed: ${errorMsg}`);
    }
  };

  const handleSaveRawBundle = async () => {
    if (!selectedCacheFile) {
      setError('Please select a cache file first using "Browse Cache File"');
      return;
    }

    try {
      const electronAPI = (window as any).electronAPI;
      const readResult = await electronAPI.readFile(selectedCacheFile, false); // false = no auto-decompress

      if (!readResult.success) {
        setError(readResult.error || 'Failed to read cache file');
        return;
      }

      // Convert base64 to blob and trigger browser download as .vrca
      const binaryString = atob(readResult.content);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const blob = new Blob([bytes], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${avatar.id}.vrca`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save raw bundle');
    }
  };

  const handleOpenInAssetRipper = async () => {
    setError(null);
    setSuccessMessage(null);
    try {
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.launchAssetRipper) {
        setError('AssetRipper launcher is not available in this build.');
        return;
      }

      let bundlePath = selectedCacheFile;
      if (!bundlePath) {
        const searchResult = await electronAPI.searchCacheForDataFiles(avatar.id, selectedPackageId || undefined);
        if (searchResult.success && searchResult.bundles?.length) {
          bundlePath = searchResult.bundles[0];
        }
      }

      if (!bundlePath) {
        setError('No cache bundle found. Click "Browse Cache File" first.');
        return;
      }

      const launchResult = await electronAPI.launchAssetRipper(bundlePath, avatar.id);
      if (launchResult.success) {
        setSuccessMessage(launchResult.message || 'AssetRipper launched.');
      } else {
        setError(launchResult.error || 'Failed to launch AssetRipper.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to launch AssetRipper');
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

          {/* Success message */}
          {successMessage && (
            <div className="flex gap-2 p-3 bg-green-500/10 border border-green-500/30 rounded-lg text-xs text-green-400">
              <Check size={14} className="flex-shrink-0 mt-0.5" />
              <span>{successMessage}</span>
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
                <span>{isExtracting ? 'Creating .unitypackage...' : 'Downloading...'}</span>
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
              className="btn-primary w-full text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Create .unitypackage from cache file (saves to Downloads)"
            >
              {isExtracting2 ? (
                <>
                  <Loader size={14} className="animate-spin" /> Creating .unitypackage...
                </>
              ) : (
                <>
                  <Archive size={14} /> Create .unitypackage
                </>
              )}
            </button>

            <button
              onClick={handleBrowseCache}
              disabled={isExtracting2}
              className={`w-full text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                selectedCacheFile
                  ? 'btn-success'
                  : 'btn-secondary'
              }`}
              title={selectedCacheFile ? `Cache file selected: ${selectedCacheFile}` : "Manually select _data file from VRChat cache"}
            >
              {isExtracting2 ? (
                <>
                  <Loader size={14} className="animate-spin" /> Processing...
                </>
              ) : selectedCacheFile ? (
                <>
                  <Check size={14} /> Cache File Selected
                </>
              ) : (
                <>
                  <FolderOpen size={14} /> Browse Cache File
                </>
              )}
            </button>

            {selectedCacheFile && (
              <button
                onClick={handleSaveRawBundle}
                className="btn-secondary w-full text-sm flex items-center justify-center gap-2"
                title="Save the raw AssetBundle (.vrca) for use with AssetRipper or other tools"
              >
                <Save size={14} /> Save Raw Bundle (.vrca)
              </button>
            )}

            {/* Decrypt Bundle - Shows when encrypted or cache file selected */}
            {selectedCacheFile && (
              <div className="space-y-2 pt-2 border-t border-surface-700">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-surface-500">Encryption Status:</span>
                  <span className={`font-medium ${
                    encryptionStatus === 'encrypted' ? 'text-yellow-400' :
                    encryptionStatus === 'not_encrypted' ? 'text-green-400' :
                    'text-surface-400'
                  }`}>
                    {encryptionStatus === 'encrypted' ? '🔒 Encrypted' :
                     encryptionStatus === 'not_encrypted' ? '🔓 Not Encrypted' :
                     'Unknown'}
                  </span>
                </div>

                {encryptionStatus === 'encrypted' && (
                  <div className="text-xs text-surface-400 bg-surface-800 p-2 rounded">
                    <div className="flex items-center gap-1 mb-1">
                      <span className={`w-2 h-2 rounded-full ${isVRChatRunning ? 'bg-green-500' : 'bg-red-500'}`} />
                      <span>VRChat: {isVRChatRunning ? 'Running' : 'Not Running'}</span>
                    </div>
                    {!isVRChatRunning && (
                      <p className="text-yellow-400/80">
                        Start VRChat & log in to extract decryption keys
                      </p>
                    )}
                  </div>
                )}

                <button
                  onClick={handleDecryptBundle}
                  disabled={isDecrypting}
                  className={`w-full text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                    encryptionStatus === 'encrypted' ? 'btn-accent' : 'btn-secondary'
                  }`}
                  title="Decrypt the bundle (requires VRChat to be running for key extraction)"
                >
                  {isDecrypting ? (
                    <>
                      <Loader size={14} className="animate-spin" /> Decrypting...
                    </>
                  ) : (
                    <>
                      <Unlock size={14} /> Decrypt & Patch Version
                    </>
                  )}
                </button>

                {encryptionStatus === 'encrypted' && isVRChatRunning && (
                  <button
                    onClick={handleExtractKeys}
                    className="btn-secondary w-full text-sm flex items-center justify-center gap-2"
                    title="Extract decryption keys from running VRChat process"
                  >
                    <Key size={14} /> Extract Keys from VRChat
                  </button>
                )}
              </div>
            )}

            <button
              onClick={handleOpenInAssetRipper}
              className="btn-secondary w-full text-sm flex items-center justify-center gap-2"
              title="Launch AssetRipper directly from VRC Studio using the selected/auto-detected cache bundle"
            >
              <ExternalLink size={14} /> Open in AssetRipper
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
