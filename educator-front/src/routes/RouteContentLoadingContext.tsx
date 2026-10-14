import { createContext, useContext } from 'react';

const RouteContentLoadingContext = createContext(false);

export const RouteContentLoadingProvider = RouteContentLoadingContext.Provider;

export function useRouteContentLoading() {
  return useContext(RouteContentLoadingContext);
}
