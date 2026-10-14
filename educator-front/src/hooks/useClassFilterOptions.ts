import { useCallback, useEffect, useMemo, useState } from 'react';
import { skipToken } from '@reduxjs/toolkit/query/react';
import { useTranslation } from 'react-i18next';
import {
  useGetClassOptionsInfiniteQuery,
  useGetSchoolOptionsInfiniteQuery,
} from '../redux/api/classes/classesApi';
import {
  buildClassOptionsArg,
  buildSchoolOptionsArg,
} from '../redux/api/classes/classesService';
import {
  CommonStatus,
  SELECTABLE_CLASS_STATUSES,
  type SelectableClassStatus,
} from '../redux/api/classes/classes.types';
import type {
  MultiSelectOptionsSource,
  MultiSelectServerOptions,
} from '../components/ui/FilterMultiSelect';
import { useDebouncedValue } from './useDebouncedValue';

interface Option {
  value: string;
  label: string;
}

/** The options and loading hooks one filter-panel dropdown needs. */
export interface FilterOptionsField extends MultiSelectOptionsSource {
  options: Option[];
}

interface OptionPages<Row> {
  pages: Array<{ data: Row[] }>;
}

interface InfiniteOptionsResult<Row> {
  currentData?: OptionPages<Row>;
  isFetching: boolean;
  isFetchingNextPage: boolean;
  isError: boolean;
  isFetchNextPageError?: boolean;
  hasNextPage: boolean;
  fetchNextPage: () => unknown;
  refetch: () => unknown;
}

export const rowsOf = <Row>(data: OptionPages<Row> | undefined) =>
  data?.pages.flatMap((page) => page.data) ?? [];

export const toServerOptions = <Row>(
  result: InfiniteOptionsResult<Row>,
  onSearchChange: (search: string) => void
): MultiSelectServerOptions => ({
  onSearchChange,
  onLoadMore: () => {
    if (result.hasNextPage && !result.isFetching) void result.fetchNextPage();
  },
  hasMore: result.hasNextPage,
  isFetchingMore: result.isFetchingNextPage,
  isError: result.isError,
  onRetry: () => {
    void (result.isFetchNextPageError
      ? result.fetchNextPage()
      : result.refetch());
  },
});

/** Adds newly seen id → label pairs; keeps the same object when nothing is new. */
const mergeLabels = (
  prev: Record<string, string>,
  options: Option[]
): Record<string, string> => {
  const added = options.filter((o) => prev[o.value] !== o.label);
  if (!added.length) return prev;
  const next = { ...prev };
  added.forEach((o) => {
    next[o.value] = o.label;
  });
  return next;
};

/** Remembers the label of every option loaded so far (for chips and selections). */
export function useLabelCache(options: Option[]) {
  const [labels, setLabels] = useState<Record<string, string>>({});
  useEffect(() => {
    setLabels((prev) => mergeLabels(prev, options));
  }, [options]);
  return labels;
}

export interface UseClassFilterOptionsParams {
  /** Schools picked in the panel (not yet applied); classes are listed for these. */
  selectedSchoolIds: string[];
  /** Whether the filter panel is open; search terms reset when it closes. */
  panelOpen: boolean;
}

/**
 * Options for the class filter panel's dropdowns, loaded lazily: nothing is
 * requested until a dropdown is first opened, and loaded pages stay cached.
 * - School / Class Name: server-side search (debounced) and infinite scroll.
 *   Class Name lists the classes of the picked schools; changing the schools
 *   drops the loaded classes, and the next open fetches them again.
 * - Status: the fixed `SELECTABLE_CLASS_STATUSES`, searched on the client.
 * Labels of every option loaded so far are kept, so chips and selections show
 * names without loading the full lists.
 */
export function useClassFilterOptions({
  selectedSchoolIds,
  panelOpen,
}: UseClassFilterOptionsParams) {
  const { t } = useTranslation('classManagement');

  const [schoolRequested, setSchoolRequested] = useState(false);
  const [schoolSearch, setSchoolSearch] = useState('');
  const debouncedSchoolSearch = useDebouncedValue(schoolSearch);
  const schoolResult = useGetSchoolOptionsInfiniteQuery(
    schoolRequested ? buildSchoolOptionsArg(debouncedSchoolSearch) : skipToken
  );

  // Classes are requested for one school selection at a time; a different
  // selection skips the query until the dropdown is opened again.
  const schoolKey = [...selectedSchoolIds].sort().join(',');
  const [classRequestedFor, setClassRequestedFor] = useState<string | null>(
    null
  );
  const [classSearch, setClassSearch] = useState('');
  const debouncedClassSearch = useDebouncedValue(classSearch);
  const classResult = useGetClassOptionsInfiniteQuery(
    classRequestedFor === schoolKey
      ? buildClassOptionsArg(debouncedClassSearch, selectedSchoolIds)
      : skipToken
  );

  useEffect(() => {
    if (panelOpen) return;
    setSchoolSearch('');
    setClassSearch('');
  }, [panelOpen]);

  const schoolOptions = useMemo(
    () =>
      rowsOf(schoolResult.currentData).flatMap((school) =>
        school.schoolId
          ? [{ value: school.schoolId, label: school.schoolName }]
          : []
      ),
    [schoolResult.currentData]
  );
  const classOptions = useMemo(
    () =>
      rowsOf(classResult.currentData).map((cls) => ({
        value: cls.classId,
        label: cls.className,
      })),
    [classResult.currentData]
  );

  const getStatusLabel = useCallback(
    (status: string) => {
      const statusLabelMap: Record<SelectableClassStatus, string> = {
        [CommonStatus.ACTIVE]: t('table.status.active'),
        [CommonStatus.INACTIVE]: t('table.status.inactive'),
        [CommonStatus.ARCHIEVED]: t('table.status.archived'),
      };
      // Stale stored filter values (not selectable any more) get a generated label.
      const selectable = SELECTABLE_CLASS_STATUSES.find(
        (value) => value === status
      );
      return selectable
        ? statusLabelMap[selectable]
        : status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
    },
    [t]
  );
  const statusOptions = useMemo(
    () =>
      SELECTABLE_CLASS_STATUSES.map((status) => ({
        value: status,
        label: getStatusLabel(status),
      })),
    [getStatusLabel]
  );

  const schoolLabels = useLabelCache(schoolOptions);
  const classLabels = useLabelCache(classOptions);

  const schoolField: FilterOptionsField = {
    options: schoolOptions,
    onOpen: () => setSchoolRequested(true),
    loading: !schoolResult.currentData && schoolResult.isFetching,
    selectedLabels: schoolLabels,
    server: toServerOptions(schoolResult, setSchoolSearch),
  };
  const classNameField: FilterOptionsField = {
    options: classOptions,
    onOpen: () => setClassRequestedFor(schoolKey),
    loading: !classResult.currentData && classResult.isFetching,
    selectedLabels: classLabels,
    server: toServerOptions(classResult, setClassSearch),
  };
  const statusField: FilterOptionsField = { options: statusOptions };

  return {
    schoolField,
    classNameField,
    statusField,
    schoolLabels,
    classLabels,
    getStatusLabel,
  };
}
