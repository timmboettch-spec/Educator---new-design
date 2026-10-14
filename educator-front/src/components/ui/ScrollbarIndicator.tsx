import * as React from 'react';
import type { ScrollProgress } from '../../hooks/useScrollbarIndicator';

interface ScrollbarIndicatorProps {
  scrollProgress: ScrollProgress;
  isScrolling: boolean;
  showArrows?: boolean;
  /** Container being scrolled; enables dragging the thumb to scroll. */
  scrollContainerRef?: React.RefObject<HTMLElement | null>;
}

/** Always-visible custom scrollbar overlay; use with `useScrollbarIndicator` on a
 *  native-scrollbar-hidden container so scrolling works on Chromebook/ChromeOS. */
export default function ScrollbarIndicator({
  scrollProgress,
  isScrolling,
  showArrows = true,
  scrollContainerRef,
}: ScrollbarIndicatorProps) {
  const trackRef = React.useRef<HTMLDivElement>(null);
  const dragStateRef = React.useRef<{
    startY: number;
    startScrollTop: number;
    trackHeight: number;
    thumbHeight: number;
  } | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);

  const handlePointerMove = React.useCallback(
    (e: PointerEvent) => {
      const drag = dragStateRef.current;
      const container = scrollContainerRef?.current;
      if (!drag || !container) return;
      const maxThumbTop = Math.max(drag.trackHeight - drag.thumbHeight, 1);
      const maxScrollTop = Math.max(
        container.scrollHeight - container.clientHeight,
        0
      );
      const deltaY = e.clientY - drag.startY;
      const deltaScroll = (deltaY / maxThumbTop) * maxScrollTop;
      container.scrollTop = Math.min(
        Math.max(drag.startScrollTop + deltaScroll, 0),
        maxScrollTop
      );
    },
    [scrollContainerRef]
  );

  const stopDragging = React.useCallback(() => {
    dragStateRef.current = null;
    setIsDragging(false);
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', stopDragging);
  }, [handlePointerMove]);

  const handleThumbPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const container = scrollContainerRef?.current;
    if (!container || !trackRef.current) return;
    e.preventDefault();
    dragStateRef.current = {
      startY: e.clientY,
      startScrollTop: container.scrollTop,
      trackHeight: trackRef.current.clientHeight,
      thumbHeight: scrollProgress.height,
    };
    setIsDragging(true);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopDragging);
  };

  React.useEffect(() => {
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopDragging);
    };
  }, [handlePointerMove, stopDragging]);

  if (!scrollProgress.isScrollable || scrollProgress.height <= 0) {
    return null;
  }

  const draggable = Boolean(scrollContainerRef);

  return (
    <div
      className={`absolute right-0 top-0 bottom-0 w-2.5 bg-transparent flex flex-col justify-between items-center py-1 z-30 select-none transition-opacity duration-300 ${
        draggable ? 'pointer-events-auto' : 'pointer-events-none'
      } ${isScrolling || isDragging ? 'opacity-100' : 'opacity-90'}`}
    >
      {showArrows && (
        <svg
          className="w-1.5 h-1.5 text-primary-500 flex-shrink-0 pointer-events-none"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <polygon points="12,5 4,19 20,19" />
        </svg>
      )}
      <div ref={trackRef} className="relative flex-1 w-full my-0.5">
        <div
          onPointerDown={draggable ? handleThumbPointerDown : undefined}
          className={`w-1.5 mx-auto bg-primary-500 hover:bg-[#b45e20] rounded-full transition-transform duration-75 ${
            draggable ? 'cursor-default' : ''
          }`}
          style={{
            height: `${scrollProgress.height}px`,
            transform: `translateY(${scrollProgress.top}px)`,
          }}
        />
      </div>
      {showArrows && (
        <svg
          className="w-1.5 h-1.5 text-primary-500 flex-shrink-0 pointer-events-none"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <polygon points="12,19 4,5 20,5" />
        </svg>
      )}
    </div>
  );
}
