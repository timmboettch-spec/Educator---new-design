import { useEffect, useState, type RefObject } from 'react';

/**
 * The element's current rendered height, kept up to date as it resizes (e.g.
 * a header whose labels wrap). `undefined` until measured, or where
 * `ResizeObserver` isn't available.
 */
export function useElementHeight(
  ref: RefObject<HTMLElement | null>
): number | undefined {
  const [height, setHeight] = useState<number>();

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setHeight(el.offsetHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);

  return height;
}
