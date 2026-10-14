import { useCallback, useMemo, useState } from 'react';
import type { SortDir } from '../redux/api/classes/classes.types';
import { useGetClassSimulationsInfiniteQuery } from '../redux/api/classSimulations/classSimulationsApi';
import {
  buildClassSimulationsInfiniteArg,
  mapClassSimulationStats,
  mapClassSimulationToSimItem,
} from '../redux/api/classSimulations/classSimulationsService';
import type { ClassSimulationSortField } from '../redux/api/classSimulations/classSimulations.types';
import type { SimStats } from '../utils/simAssignment';

/**
 * One class's simulation assignments from `/api/class-simulations`, sorted by
 * the BE and loaded page by page as it scrolls. Each column cycles unsorted →
 * ascending → descending → unsorted; unsorted keeps the BE default (simName asc).
 */
export function useClassSimulations(classId: string) {
  const [sortField, setSortField] = useState<ClassSimulationSortField | null>(
    null
  );
  const [sortDirection, setSortDirection] = useState<SortDir | null>(null);

  const handleSort = useCallback(
    (field: ClassSimulationSortField) => {
      if (sortField === field && sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortField === field) {
        setSortField(null);
        setSortDirection(null);
      } else {
        setSortField(field);
        setSortDirection('asc');
      }
    },
    [sortField, sortDirection]
  );

  // A new sort is a new cache entry, so it always starts from page 1.
  const queryArg = buildClassSimulationsInfiniteArg(
    classId,
    sortField ?? undefined,
    sortDirection ?? undefined
  );
  const {
    currentData,
    isFetching,
    isError,
    direction,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    refetch,
  } = useGetClassSimulationsInfiniteQuery(queryArg);

  // `currentData` belongs to the current sort only, so a sort change shows the
  // loader instead of rows in the previous order.
  const { rows, statsById } = useMemo(() => {
    const items = (currentData?.pages ?? []).flatMap((page) => page.data);
    return {
      rows: items.map((item) => mapClassSimulationToSimItem(item, classId)),
      statsById: new Map<string, SimStats>(
        items.map((item) => [
          item.classSimulationId,
          mapClassSimulationStats(item),
        ])
      ),
    };
  }, [currentData, classId]);

  // A next-page request is `direction: 'forward'`; a refresh (refetch, tag
  // invalidation) has no direction and keeps the loaded pages.
  const isFetchNextPageError = isError && direction === 'forward';
  const isRefreshError = isError && !!currentData && !isFetchNextPageError;

  // Stable, so effects (e.g. a deep link loading pages) can depend on them.
  const loadNextPage = useCallback(() => void fetchNextPage(), [fetchNextPage]);
  const reload = useCallback(() => void refetch(), [refetch]);

  return {
    rows,
    statsById,
    queryArg,
    sortField,
    sortDirection,
    handleSort,
    isLoading: !currentData && isFetching,
    // A loaded, empty list. It stays up while a refresh runs.
    isEmpty: !!currentData && !isError && rows.length === 0,
    // The first page or a refresh of an empty list failed. With no rows the
    // footer (and its Retry) isn't shown, so this is the only retry.
    hasLoadFailed: isError && !isFetching && rows.length === 0,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    isRefreshError,
    fetchNextPage: loadNextPage,
    refetch: reload,
  };
}
