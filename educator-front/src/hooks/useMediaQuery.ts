import { useCallback, useSyncExternalStore } from 'react';

/**
 * Whether a CSS media query currently matches, updating on change. When
 * `matchMedia` isn't available (SSR, jsdom) it returns `fallback`.
 */
export function useMediaQuery(query: string, fallback = true): boolean {
  const hasMatchMedia =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function';

  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!hasMatchMedia) return () => undefined;
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    [hasMatchMedia, query]
  );

  return useSyncExternalStore(
    subscribe,
    () => (hasMatchMedia ? window.matchMedia(query).matches : fallback),
    () => fallback
  );
}
