import { Filter } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getDateRangeErrors,
  type DateRangeErrors,
} from '../../utils/schema-utils/dateRules';
import { cn } from '../../lib/utils';
import { SearchBar } from '../common/SearchBar';
import { Button } from '../ui/Button';
import FilterPanel from '../common/FilterPanel';
import FilterChips from '../common/FilterChips';
import type { FilterState } from '../../types/Class_types';
import type { FilterOptionsField } from '../../hooks/useClassFilterOptions';
import {
  AttentionFilterChip,
  type ClassListFilterMeasure,
} from './AttentionFilterChip';

interface FilterChip {
  key: string;
  label: string;
  value: string;
  displayValue: string;
}

export interface ClassToolbarProps {
  searchTerm: string;
  onSearch: (term: string) => void;

  filterOpen: boolean;
  onFilterToggle: () => void;

  activeFilterChips: FilterChip[];
  onRemoveFilter: (key: string) => void;
  onClearAllFilters: () => void;

  filterValues: FilterState;
  setFilterValues: (updater: (f: FilterState) => FilterState) => void;
  appliedFilter: FilterState;
  setAppliedFilter: (value: FilterState) => void;
  setFilterOpen: (value: boolean) => void;
  schoolField: FilterOptionsField;
  classNameField: FilterOptionsField;
  statusField: FilterOptionsField;

  /** Active attention drill-down (?measure=); `count` is undefined while loading. */
  attentionFilter: { measure: ClassListFilterMeasure; count?: number } | null;
  onClearAttentionFilter: () => void;
}

export function ClassToolbar({
  searchTerm,
  onSearch,
  filterOpen,
  onFilterToggle,
  activeFilterChips,
  onRemoveFilter,
  onClearAllFilters,
  filterValues,
  setFilterValues,
  appliedFilter,
  setAppliedFilter,
  setFilterOpen,
  schoolField,
  classNameField,
  statusField,
  attentionFilter,
  onClearAttentionFilter,
}: ClassToolbarProps) {
  const { t } = useTranslation('classManagement');
  const hasActiveFilters = activeFilterChips.length > 0;
  // Shown after an Apply with a bad date range; editing a date clears it.
  const [dateErrors, setDateErrors] = useState<DateRangeErrors>({});
  const filterButtonRef = useRef<HTMLButtonElement>(null);

  // Closing the panel (Apply, close, Escape) returns focus to the funnel
  // button instead of dropping it to the page.
  const closePanel = () => {
    setFilterOpen(false);
    filterButtonRef.current?.focus();
  };
  // Closing without applying (close, Escape, the funnel button) drops the
  // draft and any date error, so the panel reopens on the applied filters.
  const discardDraftAndClose = () => {
    setDateErrors({});
    setFilterValues(() => ({ ...appliedFilter }));
    closePanel();
  };
  const dateError = dateErrors.start ?? dateErrors.end;

  const handleApply = () => {
    const errors = getDateRangeErrors(
      filterValues.startDate ?? '',
      filterValues.endDate ?? ''
    );
    setDateErrors(errors);
    if (errors.start || errors.end) return;
    setAppliedFilter({ ...filterValues });
    closePanel();
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 px-3 sm:px-4 py-3 sm:py-4 border-b border-gray-100">
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0 ml-auto">
          <div className="w-32 sm:w-52 md:w-64 min-w-0">
            <SearchBar
              value={searchTerm}
              onSearch={onSearch}
              placeholder={t('page.searchPlaceholder')}
              className="w-full"
            />
          </div>
          <Button
            ref={filterButtonRef}
            variant="outline"
            // A disclosure for the filter panel; the label carries the applied count.
            aria-expanded={filterOpen}
            aria-label={
              hasActiveFilters
                ? t('filters.appliedCount', { count: activeFilterChips.length })
                : t('filters.filterClasses')
            }
            title={
              hasActiveFilters
                ? t('filters.appliedCount', { count: activeFilterChips.length })
                : t('filters.filterClasses')
            }
            className={cn(
              'relative w-10 h-10 sm:w-11 sm:h-11 flex-shrink-0 flex items-center justify-center rounded-full border focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-1',
              hasActiveFilters
                ? 'bg-[#5f6060] border-[#5f6060] text-white hover:bg-[#4f5050]'
                : 'border-gray-400'
            )}
            onClick={(e) => {
              e.stopPropagation();
              if (filterOpen) discardDraftAndClose();
              else onFilterToggle();
            }}
          >
            <Filter size={20} strokeWidth={2.5} aria-hidden="true" />
            {hasActiveFilters && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-primary-500 text-white text-[10px] font-bold leading-none">
                {activeFilterChips.length}
              </span>
            )}
          </Button>
        </div>
      </div>

      {filterOpen && (
        <div className="px-4 pt-4 py-2" onClick={(e) => e.stopPropagation()}>
          <FilterPanel
            title={t('filters.title')}
            applyLabel={t('filters.apply')}
            resetLabel={t('filters.reset')}
            noFiltersMessage={t('filters.noFiltersApplied')}
            onApply={handleApply}
            // Clears the panel fields only; search and the quick filter stay.
            onReset={() => {
              setDateErrors({});
              onClearAllFilters();
            }}
            onClose={discardDraftAndClose}
            fields={[
              {
                label: t('filters.school'),
                placeholder: t('filters.schoolPlaceholder'),
                multiple: true,
                values: filterValues.schools ?? [],
                onValuesChange: (vals: string[]) =>
                  setFilterValues((f) => ({ ...f, schools: vals })),
                ...schoolField,
                searchable: true,
              },
              {
                label: t('filters.className'),
                placeholder: t('filters.classNamePlaceholder'),
                multiple: true,
                values: filterValues.classIds ?? [],
                onValuesChange: (vals: string[]) =>
                  setFilterValues((f) => ({ ...f, classIds: vals })),
                ...classNameField,
                searchable: true,
              },
              {
                label: t('filters.classStatus'),
                placeholder: t('filters.statusPlaceholder'),
                multiple: true,
                values: filterValues.statuses ?? [],
                onValuesChange: (vals: string[]) =>
                  setFilterValues((f) => ({ ...f, statuses: vals })),
                ...statusField,
                searchable: true,
              },
              {
                label: t('filters.startDate'),
                type: 'date',
                value: filterValues.startDate ?? '',
                placeholder: '',
                onChange: (val: string) => {
                  setDateErrors({});
                  setFilterValues((f) => ({ ...f, startDate: val }));
                },
                options: [],
              },
              {
                label: t('filters.endDate'),
                type: 'date',
                value: filterValues.endDate ?? '',
                placeholder: '',
                onChange: (val: string) => {
                  setDateErrors({});
                  setFilterValues((f) => ({ ...f, endDate: val }));
                },
                options: [],
              },
            ]}
          />
          {dateError && (
            <p
              role="alert"
              className="mx-2 sm:mx-4 -mt-2 mb-2 text-xs text-red-600"
            >
              {dateError === 'endBeforeStart'
                ? t('filters.errors.endBeforeStart')
                : t('filters.errors.invalidDate')}
            </p>
          )}
        </div>
      )}

      {attentionFilter && (
        <AttentionFilterChip
          measure={attentionFilter.measure}
          count={attentionFilter.count}
          onClear={onClearAttentionFilter}
        />
      )}

      {hasActiveFilters && (
        <div className="px-4">
          <FilterChips
            filters={activeFilterChips}
            onRemoveFilter={onRemoveFilter}
            onClearAll={onClearAllFilters}
          />
        </div>
      )}
    </>
  );
}
