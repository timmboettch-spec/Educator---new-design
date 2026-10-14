import React from 'react';
import { Filter } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface FilterToggleButtonProps {
  /** Number of applied filter values; shown as a badge when above zero. */
  activeCount: number;
  /** Whether the filter panel this button controls is open. */
  isOpen: boolean;
  onClick: () => void;
  /** id of the filter panel, for `aria-controls` while it's open. */
  panelId?: string;
  /** Layout classes from the caller, e.g. `ml-auto`. */
  className?: string;
  /**
   * Whether an open panel alone turns the button grey. The catalogue page's
   * design only highlights it while filters are applied.
   */
  highlightWhenOpen?: boolean;
}

/**
 * The round filter button that opens a page's FilterPanel, with a count badge
 * for applied filters. It turns solid grey while filters are applied or the
 * panel is open. Pair it with `FilterPanel` and `FilterChips`.
 */
export const FilterToggleButton: React.FC<FilterToggleButtonProps> = ({
  activeCount,
  isOpen,
  onClick,
  panelId,
  className,
  highlightWhenOpen = true,
}) => {
  const { t } = useTranslation('common');
  const isHighlighted = activeCount > 0 || (highlightWhenOpen && isOpen);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={
        activeCount > 0
          ? t('filterButton.openWithCount', { count: activeCount })
          : t('filterButton.open')
      }
      aria-expanded={isOpen}
      aria-controls={isOpen ? panelId : undefined}
      className={cn(
        'relative w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-1',
        isHighlighted
          ? 'bg-neutral-strong border-neutral-strong'
          : 'border-gray-400 hover:bg-neutral-active',
        className
      )}
    >
      <Filter
        size={16}
        aria-hidden="true"
        className={isHighlighted ? 'text-white' : 'text-gray-500'}
      />
      {activeCount > 0 && (
        <span
          aria-hidden="true"
          className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-primary-500 text-white text-[10px] font-bold flex items-center justify-center"
        >
          {activeCount}
        </span>
      )}
    </button>
  );
};
