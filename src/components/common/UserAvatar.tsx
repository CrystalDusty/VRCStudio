import type { UserStatus } from '../../types/vrchat';
import clsx from 'clsx';

const statusColors: Record<UserStatus, string> = {
  'join me': 'bg-status-joinme',
  'active': 'bg-status-online',
  'ask me': 'bg-status-askme',
  'busy': 'bg-status-busy',
  'offline': 'bg-status-offline',
};

interface Props {
  src: string;
  status?: UserStatus;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizes = {
  sm: 'w-8 h-8',
  md: 'w-10 h-10',
  lg: 'w-14 h-14',
  xl: 'w-20 h-20',
};

const dotSizes = {
  sm: 'w-2 h-2 -bottom-0 -right-0',
  md: 'w-2.5 h-2.5 -bottom-0.5 -right-0.5',
  lg: 'w-3 h-3 -bottom-0.5 -right-0.5',
  xl: 'w-3.5 h-3.5 -bottom-0.5 -right-0.5',
};

export default function UserAvatar({ src, status, size = 'md', className }: Props) {
  return (
    <div className={clsx('relative flex-shrink-0', className)}>
      <img
        src={src}
        alt=""
        className={clsx(sizes[size], 'rounded-full object-cover bg-surface-800')}
        loading="lazy"
        onError={(e) => {
          (e.target as HTMLImageElement).src =
            'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect fill="%231e293b" width="40" height="40" rx="20"/></svg>';
        }}
      />
      {status && status !== 'offline' && (
        <div
          className={clsx(
            'absolute rounded-full ring-2 ring-surface-900',
            dotSizes[size],
            statusColors[status]
          )}
        />
      )}
    </div>
  );
}
