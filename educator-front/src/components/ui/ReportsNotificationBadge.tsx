/**
 * ReportsNotificationBadge
 *
 * Renders a pill-shaped button (or a plain inline badge when `asButton=false`).
 * When `hasNew` is true a pill-shaped brand "NEW" chip is anchored to the
 * top-right corner of the badge, slightly overlapping the border — exactly like
 * a notification indicator chip.
 *
 * Usage — Class Management table (Reports column):
 *   <ReportsNotificationBadge count={4} hasNew showIcon selected={…} onClick={…} />
 *
 * Usage — Student sub-table Reports cell:
 *   <ReportsNotificationBadge count={2} hasNew onClick={…} />
 */

import { FileText } from 'lucide-react';
import loginEn from '../../locales/auth/login/en.json';
import loginEs from '../../locales/auth/login/es.json';

interface ReportsNotificationBadgeProps {
  /** Total report count shown inside the badge. */
  count: number;
  /** Whether report data is currently loading. */
  loading?: boolean;
  /** Whether there are unread/new reports. */
  hasNew: boolean;
  /** Whether the badge is in the "selected / expanded" state (active brand fill). */
  selected?: boolean;
  /** When false the component renders a <span> instead of a <button>. Defaults to true. */
  asButton?: boolean;
  /** Show the FileText icon (used in the class-level badge). Defaults to false. */
  showIcon?: boolean;
  onClick?: (e: React.MouseEvent | React.KeyboardEvent) => void;
  /** Accessible name for the button (the visible content is only a count). */
  ariaLabel?: string;
  className?: string;
}

export default function ReportsNotificationBadge({
  count,
  loading = false,
  hasNew,
  selected = false,
  asButton = true,
  showIcon = false,
  onClick,
  ariaLabel,
  className = '',
}: ReportsNotificationBadgeProps) {
  const badgeNewLabel = (
    localStorage.getItem('app_language')?.toLowerCase() === 'es'
      ? loginEs
      : loginEn
  ).reportSubTable.badgeNew;

  const pillBase =
    'relative inline-flex items-center justify-center px-3 py-1 rounded-full border-2 w-fit transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-1 mt-2';

  const pillColor = selected
    ? 'bg-primary-500 text-white border-primary-500'
    : hasNew
      ? 'bg-transparent border-primary-400 hover:border-primary-500'
      : 'bg-transparent border-gray-300 hover:border-primary-300';

  const countColor = selected
    ? 'text-white'
    : hasNew
      ? 'text-primary-600'
      : 'text-[#5f6060]';

  const inner = (
    <>
      {/*
        NEW chip — anchored to the top-right corner of the badge.
        -top-[18px] : floats the chip ~5px above the top border, leaving a
                      clean visible gap between the chip bottom and badge edge.
        -right-[18px]: pulls it outside the right edge so it floats near the corner.
        Hidden when the badge is in the selected (active-brand) state because
        the whole pill already signals the active state.
      */}
      {hasNew && !selected && (
        <span className="absolute -top-[18px] -right-[18px] inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-primary-500 text-white leading-none tracking-wide whitespace-nowrap pointer-events-none z-10 shadow-sm">
          {badgeNewLabel}
        </span>
      )}
      {/* Icon + count — always horizontally centred inside the pill */}
      <span
        className={`inline-flex items-center gap-1.5 text-xs font-semibold ${countColor}`}
      >
        {showIcon && (
          <FileText
            size={13}
            aria-hidden="true"
            className={
              selected
                ? 'text-white'
                : hasNew
                  ? 'text-primary-500'
                  : 'text-[#5f6060]'
            }
          />
        )}
        {loading && (
          <span
            className={`inline-block h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin ${selected ? 'text-white' : 'text-primary-500'}`}
            aria-hidden="true"
          />
        )}
        {Number.isFinite(count) ? count : 0}
      </span>
    </>
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === 'Enter' || e.key === ' ') && onClick) {
      e.preventDefault();
      e.stopPropagation();
      onClick(e);
    }
  };

  if (!asButton) {
    return (
      <span className={`${pillBase} ${pillColor} ${className}`}>{inner}</span>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
      }}
      onKeyDown={handleKeyDown}
      aria-busy={loading}
      aria-label={ariaLabel}
      aria-expanded={selected}
      className={`cursor-pointer focus-visible:border-primary-400 ${pillBase} ${pillColor} ${className}`}
    >
      {inner}
    </button>
  );
}
