import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

// ── Hooks: neutralize side effects unrelated to route guard wiring ──────────
vi.mock('../../src/hooks/usePageLoader', () => ({
  usePageLoader: () => false,
}));
vi.mock('../../src/hooks/useLtiLaunchHandler', () => ({
  useLtiLaunchHandler: () => undefined,
}));
vi.mock('../../src/hooks/useAccountStatus', () => ({
  useAccountStatus: () => undefined,
}));
vi.mock('../../src/hooks/useHealthCheck', () => ({
  useHealthCheck: () => undefined,
}));
vi.mock('../../src/hooks/useNotifications', () => ({
  useNotifications: () => undefined,
}));

// ── Auth state: controlled per-test via these mutable mocks ─────────────────
let mockToken: string | null = null;
let mockUser: Record<string, unknown> | null = null;
let mockSkippedRedeem = false;

vi.mock('../../src/utils/storage', () => ({
  getToken: () => mockToken,
  getParsedUser: () => mockUser,
}));

vi.mock('../../src/utils/sessionState', () => ({
  isLtiSessionHandoff: () => false,
  subscribeLtiSessionHandoff: () => () => undefined,
}));

// The trial flag is a subscribable store now, not a bare sessionStorage read.
vi.mock('../../src/utils/trialState', () => ({
  hasSkippedRedeem: () => mockSkippedRedeem,
  subscribeRedeemSkipped: () => () => undefined,
}));

vi.mock('../../src/redux/auth/LoginRedux', () => ({
  selectLoginResponse: () => null,
  // Without this the identity hook never resolves and every guard renders a loader.
  selectSessionChecked: () => true,
}));
vi.mock('../../src/redux/auth/SignUpRedux', () => ({
  selectSignUpResponse: () => null,
}));
vi.mock('../../src/store/hooks', () => ({
  useAppSelector: (selector: (s: unknown) => unknown) => selector(undefined),
}));
vi.mock('../../src/store', () => ({
  store: {
    getState: () => ({ loader: { pendingToast: null } }),
    dispatch: vi.fn(),
  },
}));
vi.mock('../../src/redux/loader/loaderSlice', () => ({
  clearPendingToast: () => ({ type: 'loader/clearPendingToast' }),
}));

// ── Layouts: stub to keep this a guard-wiring smoke test, not a chrome test ──
vi.mock('../../src/components/layout/DashboardLayout', async () => {
  const { Outlet } =
    await vi.importActual<typeof import('react-router-dom')>(
      'react-router-dom'
    );
  return {
    default: () => (
      <div data-testid="dashboard-layout">
        <Outlet />
      </div>
    ),
  };
});
vi.mock('../../src/components/layout/CustomerSupportLayout', async () => {
  const { Outlet } =
    await vi.importActual<typeof import('react-router-dom')>(
      'react-router-dom'
    );
  return {
    default: () => (
      <div data-testid="customer-support-layout">
        <Outlet />
      </div>
    ),
  };
});
vi.mock('../../src/pages/AppLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// ── Representative pages only — routes not exercised below never trigger
// their real lazy import, so they don't need mocking here. ─────────────────
vi.mock('../../src/pages/auth/SignIn', () => ({
  default: () => <div>Sign In Page</div>,
}));
vi.mock('../../src/pages/dashboard/admin', () => ({
  default: () => <div>Admin Dashboard Page</div>,
}));
vi.mock('../../src/pages/dashboard/educator', () => ({
  default: () => <div>Educator Dashboard Page</div>,
}));

import { AppRouter } from '../../src/routes/AppRouter';

async function renderAppAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRouter />
    </MemoryRouter>
  );
  // Flush the lazy() Suspense boundary.
  await screen.findByText(/Page$/);
}

describe('AppRouter guard wiring (smoke)', () => {
  beforeEach(() => {
    mockToken = null;
    mockUser = null;
    mockSkippedRedeem = false;
  });

  it('renders the public login page when unauthenticated', async () => {
    await renderAppAt('/login');
    expect(screen.getByText('Sign In Page')).toBeInTheDocument();
  });

  it('redirects an unauthenticated user away from a protected route to /login', async () => {
    await renderAppAt('/admin-dashboard');
    expect(screen.getByText('Sign In Page')).toBeInTheDocument();
  });

  it('renders the admin dashboard for an authenticated non-educator with an active license', async () => {
    mockToken = 'a-valid-token';
    mockUser = { role: 'admin', is_license_active: true };
    await renderAppAt('/admin-dashboard');
    expect(screen.getByTestId('dashboard-layout')).toBeInTheDocument();
    expect(screen.getByText('Admin Dashboard Page')).toBeInTheDocument();
  });

  it('redirects an authenticated educator away from admin-dashboard to educator-dashboard', async () => {
    mockToken = 'a-valid-token';
    mockUser = { role: 'educator' };
    await renderAppAt('/admin-dashboard');
    expect(screen.getByText('Educator Dashboard Page')).toBeInTheDocument();
  });

  it('redirects the root path based on auth/role state', async () => {
    mockToken = 'a-valid-token';
    mockUser = { role: 'educator' };
    await renderAppAt('/');
    expect(screen.getByText('Educator Dashboard Page')).toBeInTheDocument();
  });

  it('sends unmatched paths to /login via the wildcard route', async () => {
    await renderAppAt('/some/nonexistent/path');
    expect(screen.getByText('Sign In Page')).toBeInTheDocument();
  });
});
