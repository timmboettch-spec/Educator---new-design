import { useEffect, useRef, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import Header from './Header';

interface CustomerSupportLayoutProps {
  children: ReactNode;
}

export default function CustomerSupportLayout({ children }: CustomerSupportLayoutProps) {
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    mainRef.current?.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <div className="h-screen w-full min-h-0">
        <Header />
        <main ref={mainRef} className="overflow-y-auto overflow-x-hidden min-w-0 min-h-0">
          {children}
        </main>
      </div>
  );
}
