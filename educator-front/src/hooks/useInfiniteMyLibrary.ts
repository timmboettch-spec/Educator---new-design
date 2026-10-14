import { useMemo } from 'react';
import {
  useGetMyLibraryInfiniteQuery,
  type MyLibraryInfiniteArg,
} from '../redux/api/myLibrary/myLibraryApi';

/**
 * The educator's library loaded page by page as it scrolls
 * (GET /api/educator-simulations/my-library/list), flattened into rows, with
 * the states `InfiniteListFooter` needs. A change to `params` (search,
 * filters) starts again from the first page. With `skip` the request waits
 * (e.g. until the params can be worked out) and the list reads as loading.
 */
export function useInfiniteMyLibrary(
  params: MyLibraryInfiniteArg,
  { skip = false }: { skip?: boolean } = {}
) {
  const {
    currentData,
    isFetching,
    isError,
    direction,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    refetch,
  } = useGetMyLibraryInfiniteQuery(params, { skip });

  // `currentData` belongs to the current params only, so a search or filter
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
    // Unknown until the current params' first page arrives: not 0, which a
    // count would show (and announce) while a new search is loading.
    total: currentData?.pages[0]?.meta.total,
    hasLoaded: currentData !== undefined,
    isInitialLoading: !currentData && (isFetching || skip),
    // Nothing to show: the first page failed, or a refresh of an empty result did.
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
