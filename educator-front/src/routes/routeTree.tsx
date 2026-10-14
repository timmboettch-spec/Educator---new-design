import { lazy } from 'react';
import {
  BookOpen,
  CircleUser,
  GraduationCap,
  Home,
  Library,
  Plug,
  Presentation,
  School,
  Users,
} from 'lucide-react';
import {
  RequireUsableAccount,
  requireEntitlement,
  requireRole,
} from '../features/auth/access/guards';
import { ROLE } from '../features/auth/model/roles';
import {
  GoogleClassroomGuard,
  IdentityLanding,
  InviteSignUpGuard,
  LmsIntegrationGuard,
} from './crossRedirectGuards';
import type { RouteNode } from './renderRoutes';
import { ROUTE_PATHS } from './routePath';

// Auth
const SignIn = lazy(() => import('../pages/auth/SignIn'));
const SignUp = lazy(() => import('../pages/auth/SignUp'));
const InviteSignUp = lazy(() => import('../pages/auth/SignUp/InviteSignUp'));
const ForgotPassWord = lazy(() => import('../pages/auth/ForgotPassWord'));
const OtpVerify = lazy(() => import('../pages/auth/OtpVerify'));
const ResetPassWord = lazy(() => import('../pages/auth/ResetPassWord'));
const RedeemCode = lazy(() => import('../pages/auth/RedeemCode'));
const NoAccess = lazy(() => import('../pages/auth/NoAccess'));
// LTI
const DeepLinkingPickerPage = lazy(() => import('../pages/lti/deep-linking'));
// Layouts
const DashboardLayout = lazy(
  () => import('../components/layout/DashboardLayout')
);
const CustomerSupportLayout = lazy(
  () => import('../components/layout/CustomerSupportLayout')
);
// Dashboards
const AdminDashboard = lazy(() => import('../pages/dashboard/admin'));
const EducatorDashboard = lazy(() => import('../pages/dashboard/educator'));
// Schools / Classes / Educators
const Schools = lazy(() => import('../pages/schools'));
const Classes = lazy(() => import('../pages/class'));
const Educators = lazy(() => import('../pages/educator'));
// Simulation
const SimulationLibrary = lazy(
  () => import('../pages/Simulation/simulationlibrary')
);
const SimulationCatalog = lazy(
  () => import('../pages/Simulation/simulationcatalog')
);
const SimulationDetail = lazy(
  () => import('@/pages/Simulation/simulationdetails')
);
// Account / LMS
const Account = lazy(() => import('../pages/app/account'));
const LMSIntegration = lazy(() => import('../pages/app/lms-integration'));
const GoogleClassroomPage = lazy(() => import('../pages/app/google-classroom'));
// Reports
const SimulationReportPage = lazy(
  () => import('../pages/class/SimulationReportPage')
);
const UserTranscriptPage = lazy(
  () => import('../pages/class/UserTranscriptPage')
);
// Support / legal
const CustomerSupport = lazy(() => import('@/pages/customersupport'));
const PrivacyPolicy = lazy(() => import('../pages/privacypolicy'));
const TermsOfUse = lazy(() => import('@/pages/TermsOfUse'));

/** The signed-out variant of the simulation detail page, as its own component. */
const PublicSimulationDetail = () => <SimulationDetail isPublic />;

// Guard instances are created once, at module scope. Calling a guard factory during
// render produces a new component type on every pass, which remounts the whole subtree
// underneath it — losing child state, refiring effects and re-running queries.
const adminOnly = requireRole([ROLE.DISTRICT_ADMIN]);
const educatorOnly = requireRole([ROLE.EDUCATOR]);
const anyRole = requireRole([ROLE.DISTRICT_ADMIN, ROLE.EDUCATOR]);

/**
 * The application's routes, as data.
 *
 * Each node's guards are transcribed from the guard props and inline ternaries the
 * previous router used, so this is behaviour-preserving by construction rather than by
 * reinterpretation. Where the old code carried an "intentional exception" comment, the
 * exception is now a named guard in `crossRedirectGuards.tsx`.
 *
 * Built as a function of `isAuthenticated` for one reason only: the simulation detail
 * page is registered twice, once inside the dashboard chrome for signed-in visitors and
 * once bare for everyone else. That is a structural difference, not an access rule, so
 * it is selected at composition time rather than expressed as a guard.
 */
export function buildRouteTree(isAuthenticated: boolean): RouteNode[] {
  return [
    // ── Auth: signed-out visitors only ──────────────────────────────────────
    { path: ROUTE_PATHS.auth.login, component: SignIn, requiresAuth: false },
    { path: ROUTE_PATHS.auth.signup, component: SignUp, requiresAuth: false },
    {
      path: ROUTE_PATHS.auth.forgotPassword,
      component: ForgotPassWord,
      requiresAuth: false,
    },
    {
      path: ROUTE_PATHS.auth.otpVerify,
      component: OtpVerify,
      requiresAuth: false,
    },
    {
      path: ROUTE_PATHS.auth.resetPassword,
      component: ResetPassWord,
      requiresAuth: false,
    },

    // Renders for signed-in and signed-out visitors alike, so neither wrapper applies.
    {
      path: ROUTE_PATHS.auth.inviteSignup,
      component: InviteSignUp,
      guards: [InviteSignUpGuard],
    },

    // ── Signed-in, but outside the dashboard chrome ─────────────────────────
    // These are the targets the readiness gateway redirects to, so they must sit
    // outside the subtree it guards — otherwise each redirect re-enters the guard and
    // loops.
    {
      path: ROUTE_PATHS.auth.redeem,
      component: RedeemCode,
      requiresAuth: true,
      guards: [adminOnly],
    },
    {
      path: ROUTE_PATHS.auth.noAccess,
      component: NoAccess,
      requiresAuth: true,
    },

    // Intentionally open: an LMS deep-link picker is reached before any session exists.
    { path: ROUTE_PATHS.lti.deepLinking, component: DeepLinkingPickerPage },

    { path: ROUTE_PATHS.dashboard.root, component: IdentityLanding },

    // ── Everything inside the persistent dashboard chrome ───────────────────
    // Authentication and readiness are declared once, on the layout; descendants
    // inherit both through the outlet and declare only what is specific to them.
    {
      component: DashboardLayout,
      requiresAuth: true,
      guards: [RequireUsableAccount],
      children: [
        {
          path: ROUTE_PATHS.dashboard.admin,
          nav: {
            labelKey: 'dashboard',
            icon: Home,
            order: 10,
            only: { licensed: true },
          },
          component: AdminDashboard,
          guards: [adminOnly, requireEntitlement],
        },
        {
          path: ROUTE_PATHS.dashboard.educator,
          nav: { labelKey: 'dashboard', icon: Home, order: 20 },
          component: EducatorDashboard,
          guards: [educatorOnly],
        },
        {
          path: ROUTE_PATHS.schoolsEducators.schools,
          nav: {
            labelKey: 'schools',
            icon: School,
            order: 30,
            only: { licensed: true },
          },
          component: Schools,
          guards: [adminOnly, requireEntitlement],
        },
        {
          path: ROUTE_PATHS.schoolsEducators.classes,
          nav: { labelKey: 'classManagement', icon: Presentation, order: 40 },
          component: Classes,
          guards: [educatorOnly],
        },
        {
          path: ROUTE_PATHS.schoolsEducators.educators,
          nav: {
            labelKey: 'educators',
            icon: Users,
            order: 50,
            only: { licensed: true },
          },
          component: Educators,
          guards: [adminOnly, requireEntitlement],
        },
        {
          path: ROUTE_PATHS.simulation.library,
          // Reachable by an admin, but only offered to educators — an admin
          // browses through the catalogue instead.
          nav: {
            labelKey: 'mySimulationLibrary',
            icon: Library,
            order: 60,
            only: { roles: [ROLE.EDUCATOR] },
          },
          component: SimulationLibrary,
          guards: [anyRole],
        },
        {
          path: ROUTE_PATHS.simulation.catalog,
          // The catalogue is an educator's everyday browsing and an unlicensed
          // admin's trial experience; a licensed admin has no use for the link.
          nav: {
            labelKey: 'simulationCatalog',
            icon: BookOpen,
            order: 70,
            only: { licensed: false },
          },
          component: SimulationCatalog,
          guards: [anyRole],
        },
        {
          path: ROUTE_PATHS.accountLms.account,
          nav: { labelKey: 'account', icon: CircleUser, order: 100 },
          component: Account,
          guards: [anyRole],
        },
        {
          path: ROUTE_PATHS.accountLms.lmsIntegration,
          // Admin-only page, and not part of the trial menu.
          nav: {
            labelKey: 'lmsIntegration',
            icon: Plug,
            order: 90,
            only: { licensed: true },
          },
          component: LMSIntegration,
          guards: [LmsIntegrationGuard],
        },
        {
          path: ROUTE_PATHS.accountLms.googleClassroom,
          nav: { labelKey: 'googleClassroom', icon: GraduationCap, order: 80 },
          component: GoogleClassroomPage,
          guards: [GoogleClassroomGuard],
        },
        {
          path: ROUTE_PATHS.reports.reportDetail,
          component: SimulationReportPage,
          guards: [anyRole],
        },
        {
          path: ROUTE_PATHS.reports.transcript,
          component: UserTranscriptPage,
          guards: [anyRole],
        },
        {
          path: ROUTE_PATHS.supportLegal.privacyPolicy,
          component: PrivacyPolicy,
          guards: [anyRole],
        },
        {
          path: ROUTE_PATHS.supportLegal.terms,
          component: TermsOfUse,
          guards: [anyRole],
        },
        // Signed-in visitors see the detail page inside the chrome, with no role
        // restriction — matching the previous conditional registration.
        ...(isAuthenticated
          ? [
              {
                path: ROUTE_PATHS.simulation.details,
                component: SimulationDetail,
              },
            ]
          : []),
      ],
    },

    // Signed-out visitors get the same page bare, outside the chrome.
    ...(isAuthenticated
      ? []
      : [
          {
            path: ROUTE_PATHS.simulation.details,
            component: PublicSimulationDetail,
          },
        ]),

    {
      component: CustomerSupportLayout,
      requiresAuth: true,
      guards: [RequireUsableAccount],
      children: [
        {
          path: ROUTE_PATHS.supportLegal.customerSupport,
          component: CustomerSupport,
          guards: [anyRole],
        },
      ],
    },

    // Unmatched paths go wherever this identity belongs. Previously this always sent
    // people to /login, which then bounced signed-in users back out again.
    { path: '*', component: IdentityLanding },
  ];
}
