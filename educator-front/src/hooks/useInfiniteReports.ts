import { useMemo } from 'react';
import {
  useGetReportsInfiniteQuery,
  type ReportsInfiniteArg,
} from '../redux/api/reports/reportsApi';

/**
 * A reports list loaded page by page as it scrolls (GET /api/simulation-reports/list),
 * flattened into rows, with the states `InfiniteListFooter` needs. A change to `params`
 * (filter, sort) starts again from the first page.
 */
export function useInfiniteReports(params: ReportsInfiniteArg) {
  const {
    currentData,
    isFetching,
    isError,
    direction,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    refetch,
  } = useGetReportsInfiniteQuery(params);

  // `currentData` belongs to the current params only, so a sort or filter
  // change shows the loader instead of the previous params' rows.
  const rows = useMemo(
    () => (currentData?.pages ?? []).flatMap((page) => page.data),
    [currentData]
  );

  // A next-page request is `direction: 'forward'`; a refresh (refetch, tag
  // invalidation) has none and keeps the cached pages. Either failure waits
  // for Retry rather than being re-requested in a loop.
  const isFetchNextPageError = isError && direction === 'forward';
  const isRefreshError = isError && !!currentData && !isFetchNextPageError;

  return {
    rows,
    total: currentData?.pages[0]?.meta.total,
    isInitialLoading: !currentData && isFetching,
    // Nothing to show: the first page failed, or a refresh of an empty result did
    // (a cached empty result would otherwise read as "No reports found").
    isLoadError: rows.length === 0 && isError && !isFetching,
    isFetching,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    isRefreshError,
    fetchNextPage,
    refetch,
  };
}
