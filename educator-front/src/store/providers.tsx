'use client';

// import { ThemeProvider } from "next-themes";
import { Provider } from 'react-redux';

import { store } from '.';

interface ProvidersProps {
  children: React.ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <Provider store={store}>
      {/* <ThemeProvider attribute="class" defaultTheme="system" enableSystem> */}
      {children}
      {/* </ThemeProvider> */}
    </Provider>
  );
}
