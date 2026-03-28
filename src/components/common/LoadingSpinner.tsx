import clsx from 'clsx';

interface Props {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export default function LoadingSpinner({ size = 'md', className }: Props) {
  const sizeClass = size === 'sm' ? 'w-4 h-4' : size === 'md' ? 'w-6 h-6' : 'w-10 h-10';

  return (
    <div className={clsx('flex items-center justify-center', className)}>
      <div
        className={clsx(
          sizeClass,
          'border-2 border-surface-700 border-t-accent-500 rounded-full animate-spin'
        )}
      />
    </div>
  );
}
