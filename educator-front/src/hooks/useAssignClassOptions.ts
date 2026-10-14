import { useEffect, useMemo, useState } from 'react';
import { skipToken } from '@reduxjs/toolkit/query/react';
import type { MultiSelectOption } from '../components/ui/MultiSelect';
import {
  useGetAssignClassOptionsInfiniteQuery,
  useGetSchoolOptionsInfiniteQuery,
} from '../redux/api/classes/classesApi';
import {
  buildAssignClassOptionsArg,
  buildSchoolOptionsArg,
  getSchoolGroupId,
} from '../redux/api/classes/classesService';
import type { AssignableClass } from '../types/simulationAssignment.types';
import { formatSimDate } from '../utils/simAssignment';
import { useDebouncedValue } from './useDebouncedValue';

interface InfiniteOptionsResult<Row> {
  currentData?: { pages: Array<{ data: Row[] }> };
  isFetching: boolean;
  isFetchingNextPage: boolean;
  isError: boolean;
  hasNextPage: boolean;
  fetchNextPage: () => unknown;
}

/** The props one lazily loaded, server-searched MultiSelect needs. */
export interface LazyOptionsField {
  options: MultiSelectOption[];
  searchValue: string;
  onSearchChange: (search: string) => void;
  onOpen: () => void;
  onLoadMore: () => void;
  hasMore: boolean;
  isFetchingMore: boolean;
  loading: boolean;
  isError: boolean;
  /** `options` aren't the results for `searchValue` yet (debounce or request in flight). */
  isSearchPending: boolean;
}

const rowsOf = <Row>(result: InfiniteOptionsResult<Row>) =>
  result.currentData?.pages.flatMap((page) => page.data) ?? [];

const toField = <Row>(
  result: InfiniteOptionsResult<Row>,
  options: MultiSelectOption[],
  search: string,
  appliedSearch: string,
  onSearchChange: (search: string) => void,
  onOpen: () => void
): LazyOptionsField => ({
  options,
  searchValue: search,
  onSearchChange,
  onOpen,
  onLoadMore: () => {
    if (result.hasNextPage && !result.isFetching) void result.fetchNextPage();
  },
  hasMore: result.hasNextPage,
  isFetchingMore: result.isFetchingNextPage,
  loading: !result.currentData && result.isFetching,
  isError: result.isError,
  isSearchPending:
    search !== appliedSearch ||
    (result.isFetching && !result.isFetchingNextPage),
});

interface AssignClassOptionsConfig {
  /** Load the schools now instead of when the dropdown is first opened. */
  preloadSchools?: boolean;
}

/**
 * School and Class Name options for the assign modal, loaded lazily like the
 * class filter panel's: nothing is requested until a dropdown is first opened
 * (or, with `preloadSchools`, the schools right away), search runs on the
 * server (debounced) and more pages load on scroll.
 * - School: `/api/classes/schools`; the no-school group is the BE's `unassigned`.
 *   `onlySchool` is the school when the full, unsearched list has just one.
 * - Class Name: `/api/classes` for the chosen school, archived classes left out.
 *   Choosing another school drops the loaded classes until the list is reopened.
 * Every class loaded so far is kept by id, for the dates and student counts of
 * the selected classes.
 */
export function useAssignClassOptions(
  schoolId: string,
  { preloadSchools = false }: AssignClassOptionsConfig = {}
) {
  const [schoolRequested, setSchoolRequested] = useState(false);
  const [schoolSearch, setSchoolSearch] = useState('');
  const debouncedSchoolSearch = useDebouncedValue(schoolSearch);
  const schoolResult = useGetSchoolOptionsInfiniteQuery(
    schoolRequested || preloadSchools
      ? buildSchoolOptionsArg(debouncedSchoolSearch)
      : skipToken
  );

  const [classRequestedFor, setClassRequestedFor] = useState<string | null>(
    null
  );
  const [classSearch, setClassSearch] = useState('');
  const debouncedClassSearch = useDebouncedValue(classSearch);
  const classResult = useGetAssignClassOptionsInfiniteQuery(
    schoolId && classRequestedFor === schoolId
      ? buildAssignClassOptionsArg(debouncedClassSearch, schoolId)
      : skipToken
  );

  // A new school starts its class search afresh.
  useEffect(() => {
    setClassSearch('');
  }, [schoolId]);

  const schoolOptions = useMemo(
    () =>
      rowsOf(schoolResult).map((school) => ({
        value: getSchoolGroupId(school.schoolId),
        label: school.schoolName,
      })),
    [schoolResult.currentData]
  );
  const onlySchool =
    schoolSearch === '' &&
    debouncedSchoolSearch === '' &&
    !schoolResult.hasNextPage &&
    schoolOptions.length === 1
      ? (schoolOptions[0] ?? null)
      : null;

  const classRows = useMemo(
    () => rowsOf(classResult),
    [classResult.currentData]
  );
  const classOptions = useMemo(
    () =>
      classRows.map((cls) => ({
        value: cls.classId,
        label: cls.className,
        description: `${formatSimDate(cls.startDate)} – ${formatSimDate(cls.endDate)}`,
      })),
    [classRows]
  );

  const [classesById, setClassesById] = useState<
    Record<string, AssignableClass>
  >({});
  useEffect(() => {
    if (classRows.length === 0) return;
    setClassesById((prev) => {
      const next = { ...prev };
      for (const cls of classRows) {
        next[cls.classId] = {
          id: cls.classId,
          name: cls.className,
          startDate: cls.startDate,
          endDate: cls.endDate,
          studentsCount: cls.studentsCount,
        };
      }
      return next;
    });
  }, [classRows]);

  const resetSearches = () => {
    setSchoolSearch('');
    setClassSearch('');
  };

  return {
    schoolField: toField(
      schoolResult,
      schoolOptions,
      schoolSearch,
      debouncedSchoolSearch,
      setSchoolSearch,
      () => setSchoolRequested(true)
    ),
    classField: toField(
      classResult,
      classOptions,
      classSearch,
      debouncedClassSearch,
      setClassSearch,
      () => setClassRequestedFor(schoolId)
    ),
    onlySchool,
    classesById,
    resetSearches,
  };
}
