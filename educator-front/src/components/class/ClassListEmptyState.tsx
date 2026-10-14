import { useTranslation } from 'react-i18next';
import { Button } from '../ui/Button';
import {
  hasClassFilters,
  hasClassSearch,
  type ClassListFilters,
} from '../../redux/api/classes/classesService';

export interface ClassListEmptyStateProps {
  filters: ClassListFilters;
  /** Shown when nothing narrows the list, i.e. there is genuinely no data. */
  emptyMessage: string;
  onClearSearch: () => void;
  onClearFilters: () => void;
}

/**
 * The class list's empty state. With a search or filters active it is a
 * no-result message with an action that clears whichever of them is active.
 */
export function ClassListEmptyState({
  filters,
  emptyMessage,
  onClearSearch,
  onClearFilters,
}: ClassListEmptyStateProps) {
  const { t } = useTranslation('classManagement');
  const isSearching = hasClassSearch(filters);
  const isFiltering = hasClassFilters(filters);

  if (!isSearching && !isFiltering) {
    return (
      <p className="px-4 py-8 text-center text-sm text-gray-500">
        {emptyMessage}
      </p>
    );
  }

  const clearLabel =
    isSearching && isFiltering
      ? t('table.clearSearchAndFilters')
      : isSearching
        ? t('table.clearSearch')
        : t('table.clearFilters');

  const handleClear = () => {
    if (isSearching) onClearSearch();
    if (isFiltering) onClearFilters();
  };

  return (
    <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
      <p className="text-sm text-gray-500">{t('table.noResults')}</p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="px-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-1"
        onClick={handleClear}
      >
        {clearLabel}
      </Button>
    </div>
  );
}
