import { useState } from 'react';
import { X, Download, Copy, Check, ExternalLink } from 'lucide-react';
import type { VRCAvatar } from '../types/vrchat';

interface AvatarPreviewModalProps {
  avatar: VRCAvatar;
  onClose: () => void;
}

export default function AvatarPreviewModal({ avatar, onClose }: AvatarPreviewModalProps) {
  const [copied, setCopied] = useState(false);

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

          {/* Action buttons */}
          <div className="space-y-2 mt-4">
            <button
              onClick={handleViewInVRChat}
              className="btn-primary w-full text-sm flex items-center justify-center gap-2"
            >
              <ExternalLink size={14} /> View in VRChat
            </button>
            <button
              onClick={handleDownloadImage}
              className="btn-secondary w-full text-sm flex items-center justify-center gap-2"
            >
              <Download size={14} /> Download Image
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
