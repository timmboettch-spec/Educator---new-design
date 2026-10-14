import * as React from 'react';

export interface ScrollProgress {
  top: number;
  height: number;
  isScrollable: boolean;
}

/**
 * Tracks scroll position of a container and derives thumb top/height for a
 * custom-rendered scrollbar indicator. Native overlay scrollbars auto-hide on
 * ChromeOS/touch devices, so pair this with `ScrollbarIndicator` instead of
 * relying on the browser's own scrollbar to stay visible.
 */
export function useScrollbarIndicator<T extends HTMLElement>(
  arrowHeightReserve = 24
) {
  const scrollContainerRef = React.useRef<T>(null);
  const [scrollProgress, setScrollProgress] = React.useState<ScrollProgress>({
    top: 0,
    height: 0,
    isScrollable: false,
  });
  const [isScrolling, setIsScrolling] = React.useState(false);
  const hideTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const handleScroll = React.useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) {
      return;
    }
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollHeight <= clientHeight + 10) {
      setScrollProgress({ top: 0, height: 0, isScrollable: false });
      setIsScrolling(false);
      return;
    }
    const usableTrackHeight = Math.max(clientHeight - arrowHeightReserve, 40);
    const thumbH = Math.max(
      (clientHeight / scrollHeight) * usableTrackHeight,
      30
    );
    const maxTop = Math.max(0, usableTrackHeight - thumbH);
    const scrollRatio =
      scrollHeight > clientHeight
        ? scrollTop / (scrollHeight - clientHeight)
        : 0;
    const thumbT = Math.min(Math.max(0, scrollRatio * maxTop), maxTop);
    setScrollProgress({ top: thumbT, height: thumbH, isScrollable: true });

    setIsScrolling(true);
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
    }
    hideTimeoutRef.current = setTimeout(() => {
      setIsScrolling(false);
    }, 1200);
  }, [arrowHeightReserve]);

  React.useEffect(() => {
    const el = scrollContainerRef.current;
    handleScroll();
    window.addEventListener('resize', handleScroll);

    let ro: ResizeObserver | null = null;
    let mo: MutationObserver | null = null;
    if (el && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => handleScroll());
      ro.observe(el);
      // Re-observe children on every mutation since route changes swap
      // content and the previous firstElementChild is no longer mounted.
      const observeChildren = () => {
        if (!el.firstElementChild || !ro) return;
        ro.observe(el.firstElementChild);
      };
      observeChildren();
      if (typeof MutationObserver !== 'undefined') {
        mo = new MutationObserver(() => {
          observeChildren();
          handleScroll();
        });
        mo.observe(el, { childList: true, subtree: true });
      }
    }

    const timer = setTimeout(handleScroll, 150);
    return () => {
      window.removeEventListener('resize', handleScroll);
      if (ro) {
        ro.disconnect();
      }
      if (mo) {
        mo.disconnect();
      }
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
      clearTimeout(timer);
    };
  }, [handleScroll]);

  return { scrollContainerRef, scrollProgress, isScrolling, handleScroll };
}
