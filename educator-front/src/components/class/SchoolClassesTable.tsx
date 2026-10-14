import { useEffect, useMemo, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import ClassTable, { type ClassTableProps } from './ClassTable';
import { ClassListEmptyState } from './ClassListEmptyState';
import { InfiniteListFooter, LoadErrorMessage } from './InfiniteListFooter';
import { useGetClassesInfiniteQuery } from '../../redux/api/classes/classesApi';
import {
  buildClassesInfiniteArg,
  getSchoolGroupId,
  mapClassSummaryToRow,
  type ClassListFilters,
} from '../../redux/api/classes/classesService';
import type { SchoolGroupResDto } from '../../redux/api/classes/classes.types';
import type { ClassWithStudents } from '../../types/Class_types';

/** ClassTable props shared by every school's table (everything but the rows). */
export type SchoolClassesTableRowProps = Omit<
  ClassTableProps,
  'data' | 'loading' | 'hideHeader' | 'paginated' | 'emptyMessage'
>;

export interface SchoolClassesTableProps {
  school: SchoolGroupResDto;
  filters: ClassListFilters;
  /** Full class data by id (students, sims) that the list rows don't carry. */
  classById: Map<string, ClassWithStudents>;
  tableProps: SchoolClassesTableRowProps;
  /** The no-result state's actions. */
  onClearSearch: () => void;
  onClearFilters: () => void;
  /** The element the list scrolls in, so pages load before the end shows. */
  scrollRootRef?: RefObject<Element | null>;
}

/**
 * One school's classes, loaded page by page from `/api/classes` as the user
 * scrolls. Mounted only while the school's accordion is open.
 */
export function SchoolClassesTable({
  school,
  filters,
  classById,
  tableProps,
  onClearSearch,
  onClearFilters,
  scrollRootRef,
}: SchoolClassesTableProps) {
  const { t } = useTranslation('classManagement');
  const schoolGroupId = getSchoolGroupId(school.schoolId);
  const queryArg = buildClassesInfiniteArg(filters, schoolGroupId);
  const {
    currentData,
    isFetching,
    isError,
    direction,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    refetch,
  } = useGetClassesInfiniteQuery(queryArg);

  // `currentData` belongs to the current filters only, so a filter change shows
  // the loader instead of the previous filters' rows.
  const rows = useMemo(
    () =>
      (currentData?.pages ?? [])
        .flatMap((page) => page.data)
        .map((summary) =>
          mapClassSummaryToRow(summary, school, classById.get(summary.classId))
        ),
    [currentData, school, classById]
  );

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

  // Deep link: keep loading pages until the target class is in the list.
  const { targetClassId } = tableProps;
  const isTargetLoaded =
    !targetClassId || rows.some((row) => row.id === targetClassId);
  const targetClass = targetClassId ? classById.get(targetClassId) : undefined;
  const targetInSchool =
    !!targetClass && getSchoolGroupId(targetClass.school_id) === schoolGroupId;
  useEffect(() => {
    if (targetInSchool && !isTargetLoaded && canLoadMore) {
      void fetchNextPage();
    }
  }, [targetInSchool, isTargetLoaded, canLoadMore, fetchNextPage]);

  const isLoading = !currentData && isFetching;
  // A loaded, empty result: no classes at all, or none matching. It stays up
  // while a refresh runs.
  const isEmpty = !!currentData && !isError && rows.length === 0;
  // The first page or a refresh of an empty list failed. With no rows the
  // footer (and its Retry) isn't shown, so this is the only retry.
  const hasLoadFailed = isError && !isFetching && rows.length === 0;

  return (
    <>
      {/* The table's loading skeleton is visual only; announce it too. */}
      {isLoading && (
        <p role="status" className="sr-only">
          {t('table.loadingClasses')}
        </p>
      )}
      {hasLoadFailed ? (
        <LoadErrorMessage
          message={t('toast.fetchError')}
          onRetry={() => void refetch()}
        />
      ) : isEmpty ? (
        <ClassListEmptyState
          filters={filters}
          emptyMessage={t('table.noClassesInSchool')}
          onClearSearch={onClearSearch}
          onClearFilters={onClearFilters}
        />
      ) : (
        <ClassTable
          {...tableProps}
          data={rows}
          loading={isLoading}
          hideHeader
          paginated={false}
          emptyMessage={t('page.noDataFound')}
          scrollRootRef={scrollRootRef}
        />
      )}
      {rows.length > 0 && (
        <InfiniteListFooter
          key={JSON.stringify(queryArg)}
          itemCount={rows.length}
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          isFetchNextPageError={isFetchNextPageError}
          fetchNextPage={() => void fetchNextPage()}
          isRefreshError={isRefreshError}
          refetch={() => void refetch()}
          endMessage={t('table.endOfClasses')}
          loadedMoreMessage={(count) => t('table.loadedMoreClasses', { count })}
          scrollRootRef={scrollRootRef}
        />
      )}
    </>
  );
}
