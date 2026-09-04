import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAppSelector } from "../store/hooks";
import Classes from "../pages/class";
import Educators from "../pages/educator";
import SimulationLibrary from "../pages/Simulation/simulationlibrary";
import SimulationCatalog from "../pages/Simulation/simulationcatalog";
import Account from "../pages/app/account";
import LMSIntegration from "../pages/app/lms-integration";
import SupportConsole from "../pages/support";
import SignIn from "../pages/auth/SignIn";
import SignUp from "../pages/auth/SignUp";
import InviteSignUp from "../pages/auth/SignUp/InviteSignUp";
import ForgotPassWord from "../pages/auth/ForgotPassWord";
import OtpVerify from "../pages/auth/OtpVerify";
import ResetPassWord from "../pages/auth/ResetPassWord";
import RedeemCode from "../pages/auth/RedeemCode";
import AdminDashboard from "../pages/dashboard/admin";
import EducatorDashboard from "../pages/dashboard/educator";
import Schools from "../pages/schools";
import DashboardLayout from "../components/layout/DashboardLayout";
import AppLayout from "../pages/AppLayout";
import Toast from "../components/common/Toast";
import AppLoader from "../components/common/AppLoader";
import { usePageLoader } from "../hooks/usePageLoader";
import { useLtiLaunchHandler } from "../hooks/useLtiLaunchHandler";
import { selectLoginResponse } from "../redux/auth/LoginRedux";
import { selectSignUpResponse } from "../redux/auth/SignUpRedux";
import { useAccountStatus } from "../hooks/useAccountStatus";
import { useHealthCheck } from "../hooks/useHealthCheck";
import { useNotifications } from "../hooks/useNotifications";
import { getToken, getParsedUser } from "../utils/storage";
import { toast, SESSION_TOAST_KEY, sonnerToast } from "../components/common/Toast";
import { store } from "../store";
import { clearPendingToast } from "../redux/loader/loaderSlice";
import type { PendingToast } from "../redux/loader/loaderSlice";
import SimulationDetail from "@/pages/Simulation/simulationdetails";
import SimulationReportPage from "../pages/class/SimulationReportPage";
import UserTranscriptPage from "../pages/class/UserTranscriptPage";
import TermsOfUse from "@/pages/TermsOfUse";
import CustomerSupport from '@/pages/customersupport';
import CustomerSupportLayout from '@/components/layout/CustomerSupportLayout';
import PrivacyPolicy from "../pages/privacypolicy";
import MyProducts from "../pages/products";

export function AppRouter() {
  // Handle LTI launches regardless of auth state
  useLtiLaunchHandler();

  const pageLoading = usePageLoader();
  const [initialLoading, setInitialLoading] = useState(true);
  const [routeLoading, setRouteLoading] = useState(true);
  const location = useLocation();
  const isFirstMount = useRef(true);
  const apiStarted = useRef(false);
  const fallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const safetyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageLoadingRef = useRef(false);
  const loginResponse = useAppSelector(selectLoginResponse);
  const signUpResponse = useAppSelector(selectSignUpResponse);

  type UserRole =
    | string
    | {
      role_name?: string;
    };

  type User = {
    id?: string;
    email?: string;
    full_name?: string;
    role?: UserRole;
    is_license_active?: boolean;
    isLicenseActive?: boolean;
  };

  const user = (loginResponse?.data?.user ||
    signUpResponse?.data?.user ||
    getParsedUser()) as User | null;

  const role = (
    typeof user?.role === "string" ? user.role : user?.role?.role_name
  )?.toLowerCase();

  const token =
    loginResponse?.data?.tokens?.accessToken ||
    signUpResponse?.data?.tokens?.accessToken ||
    getToken();
  const isAuthenticated = !!token && token !== "undefined" && token !== "null";
  const hasActiveLicense =
    user?.is_license_active || user?.isLicenseActive || false;
  const skippedRedeem = sessionStorage.getItem("skipped_redeem") === "true";

  useAccountStatus(role, isAuthenticated ? token : null);
  useNotifications(role);
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

  const getRedirectPath = () => {
    if (!isAuthenticated) return "/login";
    if (role === "educator") return "/educator-dashboard";
    if (hasActiveLicense || skippedRedeem) return "/admin-dashboard";
    return "/redeem";
  };

  const isLoading = initialLoading || pageLoading || routeLoading;
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
        sonnerToast[type](message);
      }
    } catch {
      // malformed sessionStorage entry — ignore
    }
  };

  useEffect(() => {
    if (isLoading) setLoaderVisible(true);
  }, [isLoading]);

  return (
    <div className="relative">
      <AppLoader loading={isLoading} onHidden={handleLoaderHidden} />
      <Toast />
      <div style={{ visibility: loaderVisible ? 'hidden' : 'visible' }}>
        <AppLayout isAuthenticated={isAuthenticated}>
          <Routes>
            <Route
              path="/login"
              element={
                !isAuthenticated ? (
                  <SignIn />
                ) : (
                  <Navigate to={getRedirectPath()} replace />
                )
              }
            />
            <Route
              path="/forgotpassword"
              element={
                !isAuthenticated ? (
                  <ForgotPassWord />
                ) : role === "educator" ? (
                  <Navigate to="/educator-dashboard" replace />
                ) : hasActiveLicense || skippedRedeem ? (
                  <Navigate to="/admin-dashboard" replace />
                ) : (
                  <Navigate to="/redeem" replace />
                )
              }
            />
            <Route
              path="/otpverify"
              element={
                !isAuthenticated ? (
                  <OtpVerify />
                ) : role === "educator" ? (
                  <Navigate to="/educator-dashboard" replace />
                ) : hasActiveLicense || skippedRedeem ? (
                  <Navigate to="/admin-dashboard" replace />
                ) : (
                  <Navigate to="/redeem" replace />
                )
              }
            />
            <Route
              path="/resetpassword"
              element={
                !isAuthenticated ? (
                  <ResetPassWord />
                ) : role === "educator" ? (
                  <Navigate to="/educator-dashboard" replace />
                ) : hasActiveLicense || skippedRedeem ? (
                  <Navigate to="/admin-dashboard" replace />
                ) : (
                  <Navigate to="/redeem" replace />
                )
              }
            />
            <Route
              path="/signup"
              element={
                !isAuthenticated ? (
                  <SignUp />
                ) : role === "educator" ? (
                  <Navigate to="/educator-dashboard" replace />
                ) : hasActiveLicense || skippedRedeem ? (
                  <Navigate to="/admin-dashboard" replace />
                ) : (
                  <Navigate to="/redeem" replace />
                )
              }
            />
            <Route
              path="/signup/:invite_id"
              element={
                !isAuthenticated ? (
                  <InviteSignUp />
                ) : role === "educator" ? (
                  <Navigate to="/educator-dashboard" replace />
                ) : hasActiveLicense || skippedRedeem ? (
                  <InviteSignUp />
                ) : (
                  <Navigate to="/redeem" replace />
                )
              }
            />
            <Route
              path="/redeem"
              element={
                !isAuthenticated ? (
                  <Navigate to="/login" replace />
                ) : role === "educator" ? (
                  <Navigate to="/educator-dashboard" replace />
                ) : (
                  <RedeemCode />
                )
              }
            />
            <Route
              path="/admin-dashboard"
              element={
                !isAuthenticated ? (
                  <Navigate to="/login" replace />
                ) : hasActiveLicense || skippedRedeem ? (
                  <DashboardLayout>
                    <AdminDashboard />
                  </DashboardLayout>
                ) : (
                  <Navigate to="/redeem" replace />
                )
              }
            />
            <Route
              path="/educator-dashboard"
              element={
                !isAuthenticated ? (
                  <Navigate to="/login" replace />
                ) : (
                  <DashboardLayout>
                    <EducatorDashboard />
                  </DashboardLayout>
                )
              }
            />
            <Route
              path="/schools"
              element={
                !isAuthenticated ? (
                  <Navigate to="/login" replace />
                ) : hasActiveLicense || skippedRedeem ? (
                  <DashboardLayout>
                    <Schools />
                  </DashboardLayout>
                ) : (
                  <Navigate to="/redeem" replace />
                )
              }
            />
            <Route
              path="/classes"
              element={
                !isAuthenticated ? (
                  <Navigate to="/login" replace />
                ) : role === "educator" ? (
                  <DashboardLayout>
                    <Classes />
                  </DashboardLayout>
                ) : hasActiveLicense || skippedRedeem ? (
                  <Navigate to="/admin-dashboard" replace />
                ) : (
                  <Navigate to="/redeem" replace />
                )
              }
            />
            <Route
              path="/educators"
              element={
                !isAuthenticated ? (
                  <Navigate to="/login" replace />
                ) : hasActiveLicense || skippedRedeem ? (
                  <DashboardLayout>
                    <Educators />
                  </DashboardLayout>
                ) : (
                  <Navigate to="/redeem" replace />
                )
              }
            />
            <Route
              path="/simulationlibrary"
              element={
                !isAuthenticated ? (
                  <Navigate to="/login" />
                ) : (
                  <DashboardLayout>
                    <SimulationLibrary />
                  </DashboardLayout>
                )
              }
            />
            <Route
              path="/simulation-catalog"
              element={
                !isAuthenticated ? (
                  <Navigate to="/login" replace />
                ) : (
                  <DashboardLayout>
                    <SimulationCatalog />
                  </DashboardLayout>
                )
              }
            />
            <Route
              path="/simulationdetails/:simulationId"
              element={
                isAuthenticated ? (
                  <DashboardLayout>
                    <SimulationDetail />
                  </DashboardLayout>
                ) : (
                  <SimulationDetail isPublic />
                )
              }
            />
            <Route
              path="/products"
              element={
                !isAuthenticated ? (
                  <Navigate to="login" replace />
                ) : (
                  <DashboardLayout>
                    <MyProducts />
                  </DashboardLayout>
                )
              }
            />
            <Route
              path="/account"
              element={
                !isAuthenticated ? (
                  <Navigate to="/login" replace />
                ) : (
                  <DashboardLayout>
                    <Account />
                  </DashboardLayout>
                )
              }
            />
            {/* Support Console - Realityworks staff tool. Public route: the console
                ships its own sign-in, so it is intentionally NOT behind the educator/
                admin app session. */}
            <Route path="/support" element={<SupportConsole />} />
            <Route
              path="/lms-integration"
              element={
                !isAuthenticated ? (
                  <Navigate to="/login" replace />
                ) : (
                  <DashboardLayout>
                    <LMSIntegration />
                  </DashboardLayout>
                )
              }
            />
            <Route
              path="/"
              element={
                !isAuthenticated ? (
                  <Navigate to="/login" />
                ) : role === "educator" ? (
                  <Navigate to="/educator-dashboard" />
                ) : hasActiveLicense || skippedRedeem ? (
                  <Navigate to="/admin-dashboard" />
                ) : (
                  <Navigate to="/redeem" />
                )
              }
            />
            <Route
              path="/report-detail"
              element={
                !isAuthenticated ? (
                  <Navigate to="/login" replace />
                ) : (
                  <DashboardLayout>
                    <SimulationReportPage />
                  </DashboardLayout>
                )
              }
            />
            <Route
              path="/transcript/:attemptId"
              element={
                !isAuthenticated ? (
                  <Navigate to="/login" replace />
                ) : (
                  <DashboardLayout>
                    <UserTranscriptPage />
                  </DashboardLayout>
                )
              }
            />
            <Route
              path="/customersupport"
              element={
                !isAuthenticated ? (
                  <Navigate to="/login" replace />
                ) : (
                  <CustomerSupportLayout>
                    <CustomerSupport />
                  </CustomerSupportLayout>
                )
              }
            />
            <Route
              path="/privacypolicy"
              element={
                !isAuthenticated ? (
                  <Navigate to="/login" replace />
                ) : (
                  <DashboardLayout>
                    <PrivacyPolicy />
                  </DashboardLayout>
                )
              }
            />
            <Route path="*" element={<Navigate to="/login" replace />} />
            <Route
              path="/terms"
              element={
                !isAuthenticated ? (
                  <Navigate to="/login" replace />
                ) : (
                  <DashboardLayout>
                    <TermsOfUse />
                  </DashboardLayout>
                )
              }
            />
          </Routes>
        </AppLayout>
      </div>
    </div>
  );
}
