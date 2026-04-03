import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  subtext?: string;
  color?: 'green' | 'blue' | 'amber' | 'purple' | 'rose' | 'cyan';
  trend?: {
    direction: 'up' | 'down';
    value: string;
  };
}

const colorClasses = {
  green: 'bg-green-500/10 text-green-400',
  blue: 'bg-blue-500/10 text-blue-400',
  amber: 'bg-amber-500/10 text-amber-400',
  purple: 'bg-purple-500/10 text-purple-400',
  rose: 'bg-rose-500/10 text-rose-400',
  cyan: 'bg-cyan-500/10 text-cyan-400',
};

export default function StatCard({
  icon: Icon,
  label,
  value,
  subtext,
  color = 'blue',
  trend,
}: StatCardProps) {
  return (
    <div className="stat-card">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${colorClasses[color]}`}>
        <Icon size={18} />
      </div>
      <div className="flex-1">
        <div className="text-2xl font-bold text-surface-100 tabular-nums">{value}</div>
        <div className="text-xs text-surface-500">{label}</div>
        {subtext && <div className="text-[10px] text-surface-600 mt-0.5">{subtext}</div>}
      </div>
      {trend && (
        <div className={`text-right flex-shrink-0 ${trend.direction === 'up' ? 'text-green-400' : 'text-rose-400'}`}>
          <div className="text-xs font-semibold">{trend.direction === 'up' ? '↑' : '↓'} {trend.value}</div>
        </div>
      )}
    </div>
  );
}
