import { useEffect, useRef, useState } from 'react';

/**
 * How many items the last "load more" added, for announcing newly loaded rows
 * to screen readers. `null` until a next page has loaded.
 */
export function useLoadedMoreCount(
  itemCount: number,
  isFetchingNextPage: boolean
): number | null {
  const [loadedMore, setLoadedMore] = useState<number | null>(null);
  // The item count when the in-flight next page was requested.
  const countBeforeFetch = useRef<number | null>(null);

  useEffect(() => {
    if (isFetchingNextPage) {
      countBeforeFetch.current ??= itemCount;
      return;
    }
    if (countBeforeFetch.current === null) return;
    const added = itemCount - countBeforeFetch.current;
    countBeforeFetch.current = null;
    if (added > 0) setLoadedMore(added);
  }, [isFetchingNextPage, itemCount]);

  return loadedMore;
}
