import React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface LibrarySelectionToolbarProps {
  visibleCount: number;
  selectedCount: number;
  allSelected: boolean;
  onSelectAll: () => void;
  onClear: () => void;
  onAssign: () => void;
}

const linkButtonClass =
  'text-sm rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400';

/** Bulk-select controls and the hand-off of the selection into assignment. */
export const LibrarySelectionToolbar: React.FC<
  LibrarySelectionToolbarProps
> = ({
  visibleCount,
  selectedCount,
  allSelected,
  onSelectAll,
  onClear,
  onAssign,
}) => {
  const { t } = useTranslation('simulationLibrary');

  return (
    <div
      role="region"
      aria-label={t('selection.toolbarLabel')}
      className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-2.5"
    >
      <button
        type="button"
        onClick={allSelected ? onClear : onSelectAll}
        className={cn(
          linkButtonClass,
          'font-semibold text-neutral-strong hover:text-primary-600'
        )}
      >
        {allSelected
          ? t('selection.clearAll')
          : t('selection.selectAll', { count: visibleCount })}
      </button>
      <span className="text-sm text-gray-500" aria-live="polite">
        {t('selection.selected', { count: selectedCount })}
      </span>
      {selectedCount > 0 && (
        <button
          type="button"
          onClick={onClear}
          className={cn(
            linkButtonClass,
            'font-medium text-gray-500 hover:text-primary-600 underline-offset-2 hover:underline'
          )}
        >
          {t('selection.clearSelection')}
        </button>
      )}
      <button
        type="button"
        onClick={onAssign}
        disabled={selectedCount === 0}
        className="w-full sm:w-auto sm:ml-auto px-4 py-2 rounded-full text-sm font-semibold text-white bg-gradient-btn hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2"
      >
        {t('selection.assign', { count: selectedCount })}
      </button>
    </div>
  );
};
