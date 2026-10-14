import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { skipToken } from '@reduxjs/toolkit/query/react';
import { useTranslation } from 'react-i18next';
import { Accordion } from '../common/Accordion';
import {
  SchoolClassesTable,
  type SchoolClassesTableRowProps,
} from './SchoolClassesTable';
import { ClassListEmptyState } from './ClassListEmptyState';
import { InfiniteListFooter, LoadErrorMessage } from './InfiniteListFooter';
import { useGetSchoolGroupsInfiniteQuery } from '../../redux/api/classes/classesApi';
import {
  buildSchoolGroupsInfiniteArg,
  getSchoolGroupId,
  type ClassListFilters,
} from '../../redux/api/classes/classesService';
import type { ClassWithStudents } from '../../types/Class_types';

export interface SchoolAccordionListProps {
  filters: ClassListFilters;
  classById: Map<string, ClassWithStudents>;
  tableProps: SchoolClassesTableRowProps;
  /** Opens this school once (e.g. the school of a deep-linked class). */
  autoOpenSchoolId?: string | null;
  /** Holds the request (shown as loading) while the filters are settling. */
  paused?: boolean;
  /** The no-result state's actions. */
  onClearSearch: () => void;
  onClearFilters: () => void;
  /** The element the list scrolls in, so pages load before the end shows. */
  scrollRootRef?: RefObject<Element | null>;
  /** Height of the pinned table header, so school bars stick just below it. */
  stickyBarTop?: number;
}

/**
 * The educator's schools from `/api/classes/schools`, loaded page by page as
 * the user scrolls. Each school is an accordion and the first one starts open;
 * expanding one loads its classes and collapses any other open school.
 */
export function SchoolAccordionList({
  filters,
  classById,
  tableProps,
  autoOpenSchoolId,
  paused = false,
  onClearSearch,
  onClearFilters,
  scrollRootRef,
  stickyBarTop = 60,
}: SchoolAccordionListProps) {
  const { t } = useTranslation('classManagement');
  // Only one school is expanded at a time; opening another closes it.
  const [openSchoolId, setOpenSchoolId] = useState<string | null>(null);
  // The result the first school was last auto-opened for, so a refetch of the
  // same result doesn't reopen it after the user collapsed it.
  const autoOpenedResultKey = useRef<string | null>(null);

  const queryArg = paused ? skipToken : buildSchoolGroupsInfiniteArg(filters);
  const {
    currentData,
    isFetching,
    isError,
    direction,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    refetch,
  } = useGetSchoolGroupsInfiniteQuery(queryArg);

  // `currentData` belongs to the current filters only, so a filter change shows
  // the loader instead of the previous filters' schools.
  // Includes the BE's no-school group (`schoolId: null`), already named by the BE.
  const schools = useMemo(
    () => (currentData?.pages ?? []).flatMap((page) => page.data),
    [currentData]
  );

  useEffect(() => {
    if (autoOpenSchoolId) setOpenSchoolId(autoOpenSchoolId);
  }, [autoOpenSchoolId]);

  // The request carries every list filter, so its key identifies the result.
  const queryKey = queryArg === skipToken ? null : JSON.stringify(queryArg);

  // Open the first school once per search/filter result, unless a deep link
  // chooses the school. A single-school educator's school is the first one.
  const firstSchoolId = schools[0]
    ? getSchoolGroupId(schools[0].schoolId)
    : null;
  useEffect(() => {
    if (autoOpenSchoolId || !queryKey || !firstSchoolId) return;
    if (autoOpenedResultKey.current === queryKey) return;
    autoOpenedResultKey.current = queryKey;
    setOpenSchoolId(firstSchoolId);
  }, [autoOpenSchoolId, queryKey, firstSchoolId]);

  // RTK marks a next-page request `direction: 'forward'` (its own
  // `isFetchNextPageError`, which the hook's types don't expose); a refresh
  // (refetch, tag invalidation) has no direction and keeps the cached pages.
  // Either failure waits for Retry instead of being re-requested in a loop.
  const isFetchNextPageError = isError && direction === 'forward';
  const isRefreshError = isError && !!currentData && !isFetchNextPageError;
  const canLoadMore =
    hasNextPage &&
    !isFetchingNextPage &&
    !isFetchNextPageError &&
    !isRefreshError;

  // Deep link: keep loading pages until the school to open is in the list.
  const isAutoOpenSchoolLoaded =
    !autoOpenSchoolId ||
    schools.some(
      (school) => getSchoolGroupId(school.schoolId) === autoOpenSchoolId
    );
  useEffect(() => {
    if (!paused && !isAutoOpenSchoolLoaded && canLoadMore) {
      void fetchNextPage();
    }
  }, [paused, isAutoOpenSchoolLoaded, canLoadMore, fetchNextPage]);

  const toggleSchool = (schoolId: string) =>
    setOpenSchoolId((prev) => (prev === schoolId ? null : schoolId));

  if (paused || (!currentData && isFetching)) {
    return (
      <p role="status" className="px-4 py-8 text-center text-sm text-gray-500">
        {t('table.loadingSchools')}
      </p>
    );
  }

  if (!schools.length) {
    return isError ? (
      <LoadErrorMessage
        message={t('toast.fetchError')}
        onRetry={() => void refetch()}
      />
    ) : (
      <ClassListEmptyState
        filters={filters}
        emptyMessage={t('table.noSchoolsYet')}
        onClearSearch={onClearSearch}
        onClearFilters={onClearFilters}
      />
    );
  }

  return (
    <>
      {schools.map((school) => {
        const schoolId = getSchoolGroupId(school.schoolId);
        const isOpen = openSchoolId === schoolId;
        return (
          <Accordion
            key={schoolId}
            // The BE names the no-school group ("Classes without a school").
            title={t('table.schoolGroupCount', {
              name: school.schoolName,
              count: school.classCount,
            })}
            isOpen={isOpen}
            onToggle={() => toggleSchool(schoolId)}
            barClassName="sticky z-10"
            barStyle={{ top: stickyBarTop }}
          >
            <SchoolClassesTable
              school={school}
              filters={filters}
              classById={classById}
              tableProps={tableProps}
              onClearSearch={onClearSearch}
              onClearFilters={onClearFilters}
              scrollRootRef={scrollRootRef}
            />
          </Accordion>
        );
      })}
      <InfiniteListFooter
        key={queryKey}
        itemCount={schools.length}
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        isFetchNextPageError={isFetchNextPageError}
        fetchNextPage={() => void fetchNextPage()}
        isRefreshError={isRefreshError}
        refetch={() => void refetch()}
        endMessage={t('table.endOfSchools')}
        loadedMoreMessage={(count) => t('table.loadedMoreSchools', { count })}
        scrollRootRef={scrollRootRef}
      />
    </>
  );
}
