import {
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Routes, useLocation } from 'react-router-dom';
import AppLayout from '../pages/AppLayout';
import Toast from '../components/common/Toast';
import AppLoader from '../components/common/AppLoader';
import { usePageLoader } from '../hooks/usePageLoader';
import { useLtiLaunchHandler } from '../hooks/useLtiLaunchHandler';
import { useAccountStatus } from '../hooks/useAccountStatus';
import { useHealthCheck } from '../hooks/useHealthCheck';
import { useNotifications } from '../hooks/useNotifications';
import {
  isLtiSessionHandoff,
  subscribeLtiSessionHandoff,
} from '../utils/sessionState';
import {
  toast,
  SESSION_TOAST_KEY,
  sonnerToast,
} from '../components/common/Toast';
import { translateApiMessage } from '../utils/translateMessage';
import { store } from '../store';
import { clearPendingToast } from '../redux/loader/loaderSlice';
import type { PendingToast } from '../redux/loader/loaderSlice';
import ContentLoader from '../components/layout/ContentLoader';
import { RouteContentLoadingProvider } from './RouteContentLoadingContext';
import { renderRoutes } from './renderRoutes';
import { buildRouteTree } from './routeTree';
import { useSessionIdentity } from '../features/auth/model/useSessionIdentity';

// Auth
// LTI
// Dashboards
// Schools / Classes / Educators
// Simulation
// Account / LMS
// Reports
// Support / Legal

export function AppRouter() {
  // Handle LTI launches regardless of auth state
  useLtiLaunchHandler();

  const pageLoading = usePageLoader();
  const [initialLoading, setInitialLoading] = useState(true);
  const [routeLoading, setRouteLoading] = useState(true);
  const [ltiHandoff, setLtiHandoff] = useState(() => isLtiSessionHandoff());
  const location = useLocation();
  const isFirstMount = useRef(true);
  const apiStarted = useRef(false);
  const fallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const safetyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageLoadingRef = useRef(false);
  const identity = useSessionIdentity();

  useLayoutEffect(() => {
    setLtiHandoff(isLtiSessionHandoff());
    return subscribeLtiSessionHandoff(() => {
      setLtiHandoff(isLtiSessionHandoff());
    });
  }, []);

  // URL still has the launch param before useLayoutEffect clears auth — treat as handoff.
  const ltiLaunchParam = new URLSearchParams(location.search).get('lti_launch');
  const suppressAuthRouting = ltiHandoff || ltiLaunchParam === 'success';

  /**
   * Everything below now comes from the one identity hook rather than being
   * re-derived here. `role` is the canonical slug instead of a lowercased display
   * name: `'educator'` is unchanged, and every other value — including a role this
   * portal does not serve — still falls through the `!== 'educator'` branches
   * exactly as the display name did, so the guards below behave identically.
   *
   * `isAuthenticated` re-applies the LTI suppression that the guards here expect.
   * The identity hook expresses a handoff as `isResolved: false` instead, which is
   * what the new guard layer reads; the two are reconciled when those land.
   */
  const role = identity.role ?? undefined;
  const isAuthenticated = !suppressAuthRouting && identity.isAuthenticated;

  /**
   * Rebuilt only when the authentication state flips, because one route — the
   * simulation detail page — is registered in a different place depending on it.
   * Everything else in the tree is static, and rebuilding it per render would hand
   * React new component identities and remount the page on every pass.
   */
  const routeTree = useMemo(
    () => buildRouteTree(isAuthenticated),
    [isAuthenticated]
  );

  useAccountStatus(role, isAuthenticated ? identity.accessToken : null);
  useNotifications(isAuthenticated ? role : undefined);
  useHealthCheck();

  useEffect(() => {
    const timer = setTimeout(() => {
      setInitialLoading(false);
      setRouteLoading(false);
    }, 800);
    return () => clearTimeout(timer);
  }, []);

  // Keep ref in sync so useLayoutEffect can read current pageLoading without stale closure.
  useEffect(() => {
    pageLoadingRef.current = pageLoading;
  }, [pageLoading]);

  useLayoutEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }
    setRouteLoading(true);

    // Clear any existing timers.
    if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
    if (safetyTimer.current) clearTimeout(safetyTimer.current);

    if (pageLoadingRef.current) {
      // A non-silent API call is already in-flight.  Preserve apiStarted so
      // the pageLoading effect will clear routeLoading when the call lands.
      apiStarted.current = true;
    } else {
      // No API call in-flight — use the 600 ms fallback.
      apiStarted.current = false;
      fallbackTimer.current = setTimeout(() => {
        setRouteLoading(false);
      }, 600);
    }

    // Safety valve: force-clear the route loader after 5 s regardless, so a
    // stuck thunk can never keep the screen blank indefinitely.
    safetyTimer.current = setTimeout(() => {
      setRouteLoading(false);
    }, 5000);

    return () => {
      if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
      if (safetyTimer.current) clearTimeout(safetyTimer.current);
    };
  }, [location.pathname]);

  useEffect(() => {
    pageLoadingRef.current = pageLoading;
    if (pageLoading) {
      apiStarted.current = true;
      if (fallbackTimer.current) {
        clearTimeout(fallbackTimer.current);
        fallbackTimer.current = null;
      }
    } else if (apiStarted.current) {
      apiStarted.current = false;
      setRouteLoading(false);
    }
  }, [pageLoading]);

  // Full-screen overlay: only for the initial app mount and LTI handoff, where
  // there's no sidebar/header yet to keep visible.
  const isLoading = initialLoading || suppressAuthRouting;
  // In-app navigation: scoped to the content area only (see RouteContentLoadingContext),
  // so the sidebar/header stay visible and interactive during route transitions.
  const contentLoading = pageLoading || routeLoading;
  const [loaderVisible, setLoaderVisible] = useState(true);

  const handleLoaderHidden = () => {
    setLoaderVisible(false);
    const pending = store.getState().loader.pendingToast;
    if (pending) {
      toast[pending.type](pending.message);
      store.dispatch(clearPendingToast());
    }
    try {
      const stored = sessionStorage.getItem(SESSION_TOAST_KEY);
      if (stored) {
        sessionStorage.removeItem(SESSION_TOAST_KEY);
        const { type, message } = JSON.parse(stored) as PendingToast;
        sonnerToast[type](translateApiMessage(message));
      }
    } catch {
      // malformed sessionStorage entry — ignore
    }
  };

  useEffect(() => {
    if (isLoading) setLoaderVisible(true);
  }, [isLoading]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <AppLoader loading={isLoading} onHidden={handleLoaderHidden} />
      <Toast />
      <div
        className="h-full w-full overflow-hidden"
        style={{ visibility: loaderVisible ? 'hidden' : 'visible' }}
      >
        <AppLayout isAuthenticated={isAuthenticated}>
          <RouteContentLoadingProvider value={contentLoading}>
            <Suspense fallback={<ContentLoader />}>
              <Routes>{renderRoutes(routeTree)}</Routes>
            </Suspense>
          </RouteContentLoadingProvider>
        </AppLayout>
      </div>
    </div>
  );
}
