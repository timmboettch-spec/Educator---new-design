import type { LucideIcon } from 'lucide-react';

interface MetricsCardProps {
  label: string;
  value: number | string;
  icon: LucideIcon;
}

export default function MetricsCard({ label, value, icon: Icon }: MetricsCardProps) {
  return (
    <div
      className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 sm:p-5 flex items-center gap-2 sm:gap-4 overflow-hidden"
      role="region"
      aria-label={label}
    >
      {/* Brand-orange icon, no background (metric cards aren't clickable). */}
      <Icon
        className="w-8 h-8 sm:w-10 sm:h-10 text-primary-500 flex-shrink-0"
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1 overflow-hidden">
        <p className="text-xs sm:text-sm text-gray-500 font-medium truncate">{label}</p>
        <p className="text-lg sm:text-2xl font-bold text-gray-800 truncate">{value}</p>
      </div>
    </div>
  );
}
