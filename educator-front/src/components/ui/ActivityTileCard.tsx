import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ActivityTileCardProps {
  label: string;
  value: number;
  icon: LucideIcon;
  onClick?: () => void;
  // Accessible name for the clickable tile; defaults to the label.
  ariaLabel?: string;
}

const TILE_CLASSES =
  'activity-tile rounded-xl border border-gray-100 bg-white p-3 flex items-start gap-2.5 min-w-0 overflow-hidden min-h-[72px] h-full';

export function ActivityTileCard({
  label,
  value,
  icon: Icon,
  onClick,
  ariaLabel,
}: ActivityTileCardProps) {
  const content = (
    <>
      <Icon
        className="activity-tile-icon w-6 h-6 flex-shrink-0 text-primary-500"
        aria-hidden="true"
      />
      <div className="min-w-0 text-left">
        <p className="text-xl font-bold text-[#5f6060] tabular-nums leading-none">
          {value.toLocaleString()}
        </p>
        <p className="text-[11px] text-gray-500 mt-1 leading-tight">{label}</p>
      </div>
    </>
  );

  if (!onClick) {
    return <div className={TILE_CLASSES}>{content}</div>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel ?? label}
      className={cn(
        TILE_CLASSES,
        'w-full cursor-pointer transition hover:border-primary-300 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400'
      )}
    >
      {content}
    </button>
  );
}
