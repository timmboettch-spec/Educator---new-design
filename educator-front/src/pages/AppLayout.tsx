import type { ReactNode } from 'react';

interface AppLayoutProps {
  children: ReactNode;
  isAuthenticated: boolean;
}

export default function AppLayout({
  children,
  isAuthenticated,
}: AppLayoutProps) {
  return (
    <div
      className="h-full w-full overflow-hidden"
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
