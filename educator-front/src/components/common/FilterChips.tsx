import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';

export interface ActiveFilter {
  key: string;
  label: string;
  value: string;
  displayValue: string;
}

interface FilterChipsProps {
  filters: ActiveFilter[];
  onRemoveFilter: (key: string) => void;
  onClearAll: () => void;
  /** Visible text of the clear button; defaults to the translated "Clear All". */
  clearAllLabel?: string;
  /** Extra classes on the outer container — e.g. `px-6` to match a screen's content padding. */
  className?: string;
}

export default function FilterChips({
  filters,
  onRemoveFilter,
  onClearAll,
  clearAllLabel,
  className,
}: FilterChipsProps) {
  const { t } = useTranslation('common');
  const regionRef = useRef<HTMLDivElement>(null);
  // Index of a chip just removed, so focus can land on its neighbour instead
  // of being lost with the removed button.
  const removedIndexRef = useRef<number | null>(null);

  useEffect(() => {
    const index = removedIndexRef.current;
    if (index === null) return;
    removedIndexRef.current = null;
    const region = regionRef.current;
    if (!region) return; // last chip removed: the chips are gone entirely
    const removeButtons =
      region.querySelectorAll<HTMLButtonElement>('[data-chip-remove]');
    const next =
      removeButtons[Math.min(index, removeButtons.length - 1)] ??
      region.querySelector<HTMLButtonElement>('[data-chip-clear-all]');
    next?.focus();
  }, [filters]);

  if (filters.length === 0) return null;

  return (
    <div
      className={cn(
        'mt-4 mb-4 flex flex-wrap items-center justify-between gap-2',
        className
      )}
      ref={regionRef}
      role="region"
      aria-label={t('filterChips.region')}
    >
      <div className="flex flex-wrap items-center gap-2">
        {filters.map((filter, index) => (
          <div
            key={filter.key}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#e9e9e9] border border-gray-300 rounded-full text-sm text-[#5f6060]"
          >
            <span className="font-medium">{filter.label}:</span>
            <span>{filter.displayValue}</span>
            <button
              data-chip-remove
              onClick={() => {
                removedIndexRef.current = index;
                onRemoveFilter(filter.key);
              }}
              className="ml-1 p-0.5 hover:bg-gray-300 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-400 focus:ring-offset-1"
              aria-label={t('filterChips.remove', {
                label: filter.label,
                value: filter.displayValue,
              })}
              type="button"
            >
              <X size={14} strokeWidth={2.5} />
            </button>
          </div>
        ))}
      </div>
      <button
        data-chip-clear-all
        onClick={onClearAll}
        className="px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-primary-600 hover:bg-[#e9e9e9] rounded-full border border-slate-300 hover:border-gray-400 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-400 focus:ring-offset-1"
        type="button"
        aria-label={t('filterChips.clearAllAria')}
      >
        {clearAllLabel ?? t('filterChips.clearAll')}
      </button>
    </div>
  );
}
