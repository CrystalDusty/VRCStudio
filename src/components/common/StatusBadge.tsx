import type { UserStatus } from '../../types/vrchat';
import clsx from 'clsx';

const statusColors: Record<UserStatus, string> = {
  'join me': 'bg-status-joinme',
  'active': 'bg-status-online',
  'ask me': 'bg-status-askme',
  'busy': 'bg-status-busy',
  'offline': 'bg-status-offline',
};

const statusLabels: Record<UserStatus, string> = {
  'join me': 'Join Me',
  'active': 'Online',
  'ask me': 'Ask Me',
  'busy': 'Busy',
  'offline': 'Offline',
};

interface Props {
  status: UserStatus;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export default function StatusBadge({ status, size = 'md', showLabel = false }: Props) {
  const dotSize = size === 'sm' ? 'w-2 h-2' : size === 'md' ? 'w-2.5 h-2.5' : 'w-3 h-3';

  return (
    <div className="flex items-center gap-1.5">
      <div className={clsx(dotSize, 'rounded-full', statusColors[status])} />
      {showLabel && (
        <span className="text-xs text-surface-400">{statusLabels[status]}</span>
      )}
    </div>
  );
}
