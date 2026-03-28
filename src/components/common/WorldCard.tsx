import { Users, Star, Heart } from 'lucide-react';
import type { VRCWorld } from '../../types/vrchat';

interface Props {
  world: VRCWorld;
  onClick?: () => void;
  compact?: boolean;
}

export default function WorldCard({ world, onClick, compact = false }: Props) {
  const imgUrl = world.thumbnailImageUrl || world.imageUrl;

  if (compact) {
    return (
      <button
        onClick={onClick}
        className="flex items-center gap-3 p-2 rounded-lg hover:bg-surface-800/60 transition-colors w-full text-left"
      >
        <img
          src={imgUrl}
          alt=""
          className="w-12 h-9 rounded object-cover bg-surface-800 flex-shrink-0"
          loading="lazy"
        />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">{world.name}</div>
          <div className="text-xs text-surface-500 truncate">{world.authorName}</div>
        </div>
        <div className="flex items-center gap-1 text-xs text-surface-500">
          <Users size={12} />
          {world.occupants}
        </div>
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className="glass-panel-solid overflow-hidden card-hover group text-left"
    >
      <div className="relative aspect-video overflow-hidden">
        <img
          src={imgUrl}
          alt=""
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
          <span className="text-xs bg-black/50 px-1.5 py-0.5 rounded backdrop-blur-sm flex items-center gap-1">
            <Users size={11} /> {world.occupants}
          </span>
          <span className="text-xs bg-black/50 px-1.5 py-0.5 rounded backdrop-blur-sm flex items-center gap-1">
            <Heart size={11} /> {world.favorites}
          </span>
        </div>
      </div>
      <div className="p-3">
        <h3 className="text-sm font-semibold truncate">{world.name}</h3>
        <p className="text-xs text-surface-400 mt-0.5 truncate">by {world.authorName}</p>
        {world.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {world.tags
              .filter(t => !t.startsWith('system_') && !t.startsWith('admin_'))
              .slice(0, 3)
              .map(tag => (
                <span key={tag} className="badge bg-surface-800 text-surface-400">
                  {tag.replace('author_tag_', '')}
                </span>
              ))}
          </div>
        )}
      </div>
    </button>
  );
}
