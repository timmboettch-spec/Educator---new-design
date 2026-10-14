import { useEffect, useRef, type RefObject } from 'react';

export interface UseInfiniteScrollTriggerParams {
  /** Called when the sentinel scrolls into view. */
  onLoadMore: () => void;
  /** Only observe while there is more to load and no page is in flight. */
  enabled: boolean;
  /** How early to trigger before the sentinel is actually visible. */
  rootMargin?: string;
  /** Scroll container to observe within (e.g. a dropdown list); the viewport by default. */
  rootRef?: RefObject<Element | null>;
}

/**
 * Infinite scroll: attach the returned ref to a sentinel element placed after
 * the last item; `onLoadMore` fires whenever it comes into view while enabled.
 */
export function useInfiniteScrollTrigger<T extends Element = HTMLDivElement>({
  onLoadMore,
  enabled,
  rootMargin = '200px',
  rootRef,
}: UseInfiniteScrollTriggerParams) {
  const sentinelRef = useRef<T>(null);
  const onLoadMoreRef = useRef(onLoadMore);
  onLoadMoreRef.current = onLoadMore;

  useEffect(() => {
    const el = sentinelRef.current;
    if (!enabled || !el || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          onLoadMoreRef.current();
        }
      },
      { root: rootRef?.current ?? null, rootMargin }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [enabled, rootMargin, rootRef]);

  return sentinelRef;
}
