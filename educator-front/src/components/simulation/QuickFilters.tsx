import React, { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { FilterToggleButton } from '../common/FilterToggleButton';
import {
  DEFAULT_DIFFICULTIES,
  LEARNER_LEVELS,
  MODALITIES,
  type LibraryFilterField,
} from '@/utils/libraryFilters';

const QUICK_GROUPS: { field: LibraryFilterField; values: readonly string[] }[] =
  [
    { field: 'learnerLevel', values: LEARNER_LEVELS },
    { field: 'modality', values: MODALITIES },
    { field: 'difficulty', values: DEFAULT_DIFFICULTIES },
  ];

interface QuickFiltersProps {
  isActive: (field: LibraryFilterField, value: string) => boolean;
  onToggle: (field: LibraryFilterField, value: string) => void;
  fieldLabel: (field: LibraryFilterField) => string;
  valueLabel: (value: string) => string;
  /**
   * Renders the filter-panel button after the pills. Leave it out when the
   * page places its own FilterToggleButton elsewhere (e.g. beside search).
   */
  filterButton?: {
    activeCount: number;
    isPanelOpen: boolean;
    onTogglePanel: () => void;
    /** id of the filter panel, for `aria-controls`. */
    panelId: string;
  };
  /** Pill size: `md` (library, catalogue sub-pages) or `lg` (catalogue page). */
  size?: 'md' | 'lg';
  /** Keep the group dividers on narrow screens too (hidden there by default). */
  showDividersOnMobile?: boolean;
  /** Layout classes for the row, replacing the default bottom margin. */
  className?: string;
}

const pillClass = (active: boolean, size: 'md' | 'lg') =>
  cn(
    'rounded-full text-sm font-semibold border-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-1',
    size === 'lg' ? 'px-5 py-2.5' : 'px-4 py-2',
    active
      ? 'bg-primary-500 border-primary-500 text-white'
      : 'bg-white border-gray-300 text-neutral-strong hover:border-primary-300 hover:bg-neutral-active'
  );

/**
 * One-tap filters for the most common fields, optionally followed by the shared
 * FilterToggleButton that opens the full filter panel. Pills apply straight away and share state with the panel.
 */
export const QuickFilters: React.FC<QuickFiltersProps> = ({
  isActive,
  onToggle,
  fieldLabel,
  valueLabel,
  filterButton,
  size = 'md',
  showDividersOnMobile = false,
  className = 'mb-3',
}) => {
  const { t } = useTranslation('common');

  return (
    <div
      role="group"
      aria-label={t('simulationFilters.quickFilters')}
      className={cn('flex flex-wrap items-center gap-2', className)}
    >
      {QUICK_GROUPS.map(({ field, values }, groupIndex) => (
        <Fragment key={field}>
          {groupIndex > 0 && (
            <span
              className={cn(
                'mx-1 h-6 w-px bg-gray-300',
                !showDividersOnMobile && 'hidden sm:block'
              )}
              aria-hidden="true"
            />
          )}
          <div
            role="group"
            aria-label={fieldLabel(field)}
            className="flex flex-wrap items-center gap-2"
          >
            {values.map((value) => {
              const active = isActive(field, value);
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onToggle(field, value)}
                  className={pillClass(active, size)}
                >
                  {valueLabel(value)}
                </button>
              );
            })}
          </div>
        </Fragment>
      ))}
      {filterButton && (
        <FilterToggleButton
          activeCount={filterButton.activeCount}
          isOpen={filterButton.isPanelOpen}
          onClick={filterButton.onTogglePanel}
          panelId={filterButton.panelId}
          className="ml-auto"
        />
      )}
    </div>
  );
};
