import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

interface AppLayoutProps {
  children: ReactNode;
  isAuthenticated: boolean;
}

export default function AppLayout({ children, isAuthenticated }: AppLayoutProps) {
  const location = useLocation();
  return (
    <div
      className={`min-h-screen ${
        isAuthenticated && location.pathname !== '/redeem' ? 'bg-white' : ''
      }`}
      style={{
        backgroundImage: `
      url('/assets/common/background.png'),
      url('/assets/common/background.png')
    `,
        backgroundPosition: isAuthenticated
          ? '100px 100px, bottom right'
          : 'top left, bottom right',
        backgroundRepeat: 'no-repeat, no-repeat',
        backgroundSize: isAuthenticated ? '300px, 300px' : '300px, 300px',
      }}
    >
      {children}
    </div>
  );
}
