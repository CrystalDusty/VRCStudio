import type { LucideIcon } from 'lucide-react';

interface Props {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export default function EmptyState({ icon: Icon, title, description, action }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center animate-fade-in">
      <div className="w-16 h-16 rounded-2xl bg-surface-800/50 flex items-center justify-center mb-4">
        <Icon size={28} className="text-surface-500" />
      </div>
      <h3 className="text-lg font-semibold text-surface-300 mb-1">{title}</h3>
      {description && <p className="text-sm text-surface-500 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
