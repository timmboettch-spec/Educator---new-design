import { Suspense, useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Header from './Header';
import Sidebar from './Sidebar';
import ScrollbarIndicator from '../ui/ScrollbarIndicator';
import ContentLoader from './ContentLoader';
import AdminSetupTracker from '../onboarding/AdminSetupTracker';
import EducatorSetupTracker from '../onboarding/EducatorSetupTracker';
import { useScrollbarIndicator } from '../../hooks/useScrollbarIndicator';
import { useRouteContentLoading } from '../../routes/RouteContentLoadingContext';
import type { LibraryReturnNavState } from '../../hooks/useLibraryReturnState';

export default function DashboardLayout() {
  const location = useLocation();
  const contentLoading = useRouteContentLoading();
  const mainRef = useRef<HTMLElement>(null);
  const isFirstRender = useRef(true);
  const { scrollContainerRef, scrollProgress, isScrolling, handleScroll } =
    useScrollbarIndicator<HTMLElement>();

  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    // The page restores its own scroll position and focus (e.g. the library
    // after Back from a simulation's details).
    if ((location.state as LibraryReturnNavState | null)?.preserveScroll) {
      isFirstRender.current = false;
      const sync = setTimeout(handleScroll, 50);
      return () => clearTimeout(sync);
    }
    el.scrollTop = 0;
    // Move focus to the content landmark on navigation (not on first mount)
    // so keyboard/screen-reader users land on the new page instead of a stale
    // sidebar link, now that the layout persists across route changes.
    if (isFirstRender.current) {
      isFirstRender.current = false;
    } else {
      el.focus();
    }
    const t = setTimeout(() => {
      el.scrollTop = 0;
      handleScroll();
    }, 50);
    return () => clearTimeout(t);
  }, [location.pathname, handleScroll]);

  return (
    <div className="grid grid-cols-layout h-screen w-full min-h-0 overflow-hidden">
      <Sidebar />
      <div className="flex flex-col h-full min-w-0 overflow-hidden min-h-0">
        <Header />
        <div className="relative flex-1 min-w-0 min-h-0">
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
              <EducatorSetupTracker />
              <AdminSetupTracker />
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
    </div>
  );
}
