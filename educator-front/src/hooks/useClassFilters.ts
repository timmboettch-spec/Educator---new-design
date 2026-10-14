import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDisplayDate } from '../utils/displayDate';
import type { FilterState } from '../types/Class_types';
import {
  EMPTY_PANEL_FILTERS,
  resetClassListPanelFilters,
  selectClassListQuery,
  setClassListPanelFilters,
  setClassListSearch,
} from '../redux/api/classes/classesSlice';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { useClassFilterOptions } from './useClassFilterOptions';

/**
 * The class page's search box, Filter Classes panel and applied-filter chips.
 * Search and the applied panel filters live in the class list query (Redux);
 * the panel's open state and unapplied (draft) values are local. Dropdown options come from the classes API and load
 * lazily per dropdown (see `useClassFilterOptions`).
 * Filtering itself happens on the BE: callers turn the applied state into
 * list params (see `classesService`).
 */
export function useClassFilters() {
  const { t } = useTranslation('classManagement');
  const dispatch = useAppDispatch();
  const { search: searchTerm, panelFilters: appliedFilter } =
    useAppSelector(selectClassListQuery);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterValues, setFilterValues] = useState<FilterState>(appliedFilter);

  const setSearchTerm = useCallback(
    (term: string) => dispatch(setClassListSearch(term)),
    [dispatch]
  );
  const setAppliedFilter = useCallback(
    (filters: FilterState) => dispatch(setClassListPanelFilters(filters)),
    [dispatch]
  );

  const {
    schoolField,
    classNameField,
    statusField,
    schoolLabels,
    classLabels,
    getStatusLabel,
  } = useClassFilterOptions({
    selectedSchoolIds: filterValues.schools ?? [],
    panelOpen: filterOpen,
  });

  // Applied-filter chips (rendered below the header) — each chip removes just
  // that value; Clear All resets everything.
  const activeFilterChips = useMemo(() => {
    const chips: Array<{
      key: string;
      label: string;
      value: string;
      displayValue: string;
    }> = [];

    (appliedFilter.schools ?? []).forEach((schoolId) =>
      chips.push({
        key: `schools::${schoolId}`,
        label: t('filters.school'),
        value: schoolId,
        displayValue: schoolLabels[schoolId] ?? schoolId,
      })
    );
    (appliedFilter.classIds ?? []).forEach((classId) =>
      chips.push({
        key: `classIds::${classId}`,
        label: t('filters.className'),
        value: classId,
        displayValue: classLabels[classId] ?? classId,
      })
    );
    (appliedFilter.statuses ?? []).forEach((status) =>
      chips.push({
        key: `statuses::${status}`,
        label: t('filters.status'),
        value: status,
        displayValue: getStatusLabel(status),
      })
    );
    if (appliedFilter.startDate) {
      chips.push({
        key: `startDate::${appliedFilter.startDate}`,
        label: t('filters.startDate'),
        value: appliedFilter.startDate,
        displayValue: formatDisplayDate(appliedFilter.startDate),
      });
    }
    if (appliedFilter.endDate) {
      chips.push({
        key: `endDate::${appliedFilter.endDate}`,
        label: t('filters.endDate'),
        value: appliedFilter.endDate,
        displayValue: formatDisplayDate(appliedFilter.endDate),
      });
    }

    return chips;
  }, [appliedFilter, schoolLabels, classLabels, getStatusLabel, t]);

  const handleRemoveFilter = (key: string) => {
    const sep = key.indexOf('::');
    const field = key.slice(0, sep);
    const value = key.slice(sep + 2);
    const updater = (f: FilterState): FilterState => {
      if (field === 'schools') {
        return { ...f, schools: (f.schools ?? []).filter((v) => v !== value) };
      }
      if (field === 'classIds') {
        return {
          ...f,
          classIds: (f.classIds ?? []).filter((v) => v !== value),
        };
      }
      if (field === 'statuses') {
        return {
          ...f,
          statuses: (f.statuses ?? []).filter((v) => v !== value),
        };
      }
      if (field === 'startDate') return { ...f, startDate: '' };
      if (field === 'endDate') return { ...f, endDate: '' };
      return f;
    };
    setFilterValues(updater);
    setAppliedFilter(updater(appliedFilter));
  };

  // Clears the panel's fields (draft and applied) only; search and the
  // attention quick filter stay.
  const handleClearAllFilters = useCallback(() => {
    setFilterValues(EMPTY_PANEL_FILTERS);
    dispatch(resetClassListPanelFilters());
  }, [dispatch]);

  return {
    searchTerm,
    setSearchTerm,
    filterOpen,
    setFilterOpen,
    filterValues,
    setFilterValues,
    appliedFilter,
    setAppliedFilter,
    activeFilterChips,
    schoolField,
    classNameField,
    statusField,
    handleRemoveFilter,
    handleClearAllFilters,
  };
}
