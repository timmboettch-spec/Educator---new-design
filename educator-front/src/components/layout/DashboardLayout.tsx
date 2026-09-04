import { useEffect, useRef, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import Header from './Header';
import Sidebar from './Sidebar';
import AdminSetupTracker from '../onboarding/AdminSetupTracker';
import EducatorSetupTracker from '../onboarding/EducatorSetupTracker';

interface DashboardLayoutProps {
  children: ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const location = useLocation();

  // Document-flow layout: the page (body) scrolls and grows to fit the content,
  // so reset the window scroll on navigation.
  useEffect(() => {
    window.scrollTo(0, 0);
    const t = setTimeout(() => window.scrollTo(0, 0), 50);
    return () => clearTimeout(t);
  }, [location.pathname]);

  return (
    <div className="grid grid-cols-layout w-full min-h-screen">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-600 focus:shadow-lg focus:ring-2 focus:ring-primary-400"
      >
        Skip to main content
      </a>
      <Sidebar />
      <div className="flex flex-col min-w-0">
        {/* Top bar stays pinned while the page scrolls. */}
        <div className="sticky top-0 z-30 bg-white">
          <Header />
        </div>
        <main
          id="main-content"
          tabIndex={-1}
          className="min-w-0 overflow-x-hidden focus:outline-none"
        >
          <AdminSetupTracker />
          <EducatorSetupTracker />
          {children}
        </main>
      </div>
    </div>
  );
}
