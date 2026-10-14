import { Suspense, useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Header from './Header';
import ScrollbarIndicator from '../ui/ScrollbarIndicator';
import ContentLoader from './ContentLoader';
import { useScrollbarIndicator } from '../../hooks/useScrollbarIndicator';
import { useRouteContentLoading } from '../../routes/RouteContentLoadingContext';

export default function CustomerSupportLayout() {
  const location = useLocation();
  const contentLoading = useRouteContentLoading();
  const mainRef = useRef<HTMLElement>(null);
  const isFirstRender = useRef(true);
  const { scrollContainerRef, scrollProgress, isScrolling, handleScroll } =
    useScrollbarIndicator<HTMLElement>();

  useEffect(() => {
    mainRef.current?.scrollTo(0, 0);
    // Move focus to the content landmark on navigation (not on first mount).
    if (isFirstRender.current) {
      isFirstRender.current = false;
    } else {
      mainRef.current?.focus();
    }
  }, [location.pathname]);

  return (
    <div className="h-screen w-full min-h-0 flex flex-col">
      <Header />
      <div className="relative flex-1 min-h-0">
        <main
          ref={(el) => {
            mainRef.current = el;
            scrollContainerRef.current = el;
          }}
          onScroll={handleScroll}
          tabIndex={-1}
          aria-label="Page content"
          className="h-full w-full overflow-y-auto overflow-x-hidden min-w-0 min-h-0 scrollbar-hide focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300 focus:ring-2 focus:ring-orange-300"
        >
          <Suspense fallback={<ContentLoader />}>
            <Outlet />
          </Suspense>
        </main>
        <ContentLoader visible={contentLoading} />
        <ScrollbarIndicator
          scrollProgress={scrollProgress}
          isScrolling={isScrolling}
          showArrows={false}
          scrollContainerRef={scrollContainerRef}
        />
      </div>
    </div>
  );
}
