import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';

const mocks = vi.hoisted(() => ({ useSessionIdentity: vi.fn() }));

vi.mock('../../../../src/features/auth/model/useSessionIdentity', () => ({
  useSessionIdentity: mocks.useSessionIdentity,
}));

vi.mock('../../../../src/components/layout/ContentLoader', () => ({
  default: () => <div data-testid="loader" />,
}));

import {
  AuthOnly,
  Can,
  GuestOnly,
  RequireUsableAccount,
  requireEntitlement,
  requireFeature,
  requireRole,
} from '../../../../src/features/auth/access/guards';
import { ROLE } from '../../../../src/features/auth/model/roles';
import { ROUTE_PATHS } from '../../../../src/routes/routePath';

type Identity = {
  role: 'district_admin' | 'educator' | null;
  isLicenseActive: boolean;
  skippedRedeem: boolean;
  isAuthenticated: boolean;
  isResolved: boolean;
  googleClassroomEnabled: boolean;
};

const identity = (o: Partial<Identity> = {}): Identity => ({
  role: ROLE.DISTRICT_ADMIN,
  isLicenseActive: true,
  skippedRedeem: false,
  isAuthenticated: true,
  isResolved: true,
  googleClassroomEnabled: true,
  ...o,
});

/** Renders a guard at /start, with every redirect target reachable and labelled. */
const renderGuard = (guarded: ReactNode) =>
  render(
    <MemoryRouter initialEntries={['/start']}>
      <Routes>
        <Route path="/start" element={guarded} />
        <Route path={ROUTE_PATHS.auth.login} element={<p>login</p>} />
        <Route path={ROUTE_PATHS.auth.redeem} element={<p>redeem</p>} />
        <Route path={ROUTE_PATHS.auth.noAccess} element={<p>no-access</p>} />
        <Route path={ROUTE_PATHS.dashboard.admin} element={<p>admin</p>} />
        <Route
          path={ROUTE_PATHS.dashboard.educator}
          element={<p>educator</p>}
        />
        <Route path="/elsewhere" element={<p>elsewhere</p>} />
      </Routes>
    </MemoryRouter>
  );

const Protected = () => <p>protected</p>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('requireRole — layer 4, authorization', () => {
  const AdminOnly = requireRole([ROLE.DISTRICT_ADMIN]);

  it('renders a loader while the session is still resolving', () => {
    // Never deny on unresolved state: that is what bounces users to login on refresh.
    mocks.useSessionIdentity.mockReturnValue(identity({ isResolved: false }));
    renderGuard(
      <AdminOnly>
        <Protected />
      </AdminOnly>
    );
    expect(screen.getByTestId('loader')).toBeInTheDocument();
    expect(screen.queryByText('protected')).not.toBeInTheDocument();
  });

  it('renders the page for an allowed role', () => {
    mocks.useSessionIdentity.mockReturnValue(identity());
    renderGuard(
      <AdminOnly>
        <Protected />
      </AdminOnly>
    );
    expect(screen.getByText('protected')).toBeInTheDocument();
  });

  it('sends a denied identity to a route it can actually reach', () => {
    // An educator denied /schools lands on the educator dashboard, not on a page that
    // would deny them in turn.
    mocks.useSessionIdentity.mockReturnValue(identity({ role: ROLE.EDUCATOR }));
    renderGuard(
      <AdminOnly>
        <Protected />
      </AdminOnly>
    );
    expect(screen.getByText('educator')).toBeInTheDocument();
  });

  it('honours a caller-supplied denial target', () => {
    mocks.useSessionIdentity.mockReturnValue(identity({ role: ROLE.EDUCATOR }));
    renderGuard(
      <AdminOnly redirect={{ to: '/elsewhere' }}>
        <Protected />
      </AdminOnly>
    );
    expect(screen.getByText('elsewhere')).toBeInTheDocument();
  });

  it('admits either role when a route serves both', () => {
    const Shared = requireRole([ROLE.DISTRICT_ADMIN, ROLE.EDUCATOR]);
    for (const role of [ROLE.DISTRICT_ADMIN, ROLE.EDUCATOR] as const) {
      mocks.useSessionIdentity.mockReturnValue(identity({ role }));
      const { unmount } = renderGuard(
        <Shared>
          <Protected />
        </Shared>
      );
      expect(screen.getByText('protected')).toBeInTheDocument();
      unmount();
    }
  });

  it('exposes its rule so navigation can read it without rendering', () => {
    // This is what lets the sidebar derive from the route tree instead of duplicating it.
    expect(AdminOnly.rules).toEqual([
      { kind: 'role', roles: [ROLE.DISTRICT_ADMIN] },
    ]);
  });
});

describe('requireEntitlement — layer 5', () => {
  it('renders a loader while resolving', () => {
    mocks.useSessionIdentity.mockReturnValue(identity({ isResolved: false }));
    renderGuard(<>{requireEntitlement({ children: <Protected /> })}</>);
    expect(screen.getByTestId('loader')).toBeInTheDocument();
  });

  it('admits a licensed account', () => {
    mocks.useSessionIdentity.mockReturnValue(
      identity({ isLicenseActive: true })
    );
    renderGuard(<>{requireEntitlement({ children: <Protected /> })}</>);
    expect(screen.getByText('protected')).toBeInTheDocument();
  });

  // Regression: a started trial used to be admitted here too, which let a trial admin
  // reach /admin-dashboard, /schools and /educators directly by URL even though the
  // sidebar never links them there. The trial is the catalogue, not a license.
  it('sends a started trial to redeem — a trial is not a license', () => {
    mocks.useSessionIdentity.mockReturnValue(
      identity({ isLicenseActive: false, skippedRedeem: true })
    );
    renderGuard(<>{requireEntitlement({ children: <Protected /> })}</>);
    expect(screen.getByText('redeem')).toBeInTheDocument();
  });

  it('sends an unlicensed account to redeem, not to its landing page', () => {
    // A missing license is a prompt, not a refusal — which is why this is a separate
    // layer from the role check.
    mocks.useSessionIdentity.mockReturnValue(
      identity({ isLicenseActive: false, skippedRedeem: false })
    );
    renderGuard(<>{requireEntitlement({ children: <Protected /> })}</>);
    expect(screen.getByText('redeem')).toBeInTheDocument();
  });

  it('exposes its rule', () => {
    expect(requireEntitlement.rules).toEqual([{ kind: 'entitlement' }]);
  });
});

describe('requireFeature', () => {
  const GoogleClassroomOnly = requireFeature('googleClassroom');

  it('renders a loader while resolving', () => {
    mocks.useSessionIdentity.mockReturnValue(identity({ isResolved: false }));
    renderGuard(
      <GoogleClassroomOnly>
        <Protected />
      </GoogleClassroomOnly>
    );
    expect(screen.getByTestId('loader')).toBeInTheDocument();
  });

  it('admits when the feature is enabled', () => {
    mocks.useSessionIdentity.mockReturnValue(
      identity({ role: ROLE.EDUCATOR, googleClassroomEnabled: true })
    );
    renderGuard(
      <GoogleClassroomOnly>
        <Protected />
      </GoogleClassroomOnly>
    );
    expect(screen.getByText('protected')).toBeInTheDocument();
  });

  it('redirects when the feature is off for this account', () => {
    mocks.useSessionIdentity.mockReturnValue(
      identity({ role: ROLE.EDUCATOR, googleClassroomEnabled: false })
    );
    renderGuard(
      <GoogleClassroomOnly>
        <Protected />
      </GoogleClassroomOnly>
    );
    expect(screen.getByText('educator')).toBeInTheDocument();
  });

  it('exposes its rule', () => {
    expect(GoogleClassroomOnly.rules).toEqual([
      { kind: 'feature', feature: 'googleClassroom' },
    ]);
  });
});

describe('AuthOnly — layer 2', () => {
  it('renders a loader while resolving', () => {
    mocks.useSessionIdentity.mockReturnValue(identity({ isResolved: false }));
    renderGuard(
      <AuthOnly>
        <Protected />
      </AuthOnly>
    );
    expect(screen.getByTestId('loader')).toBeInTheDocument();
  });

  it('admits a signed-in identity', () => {
    mocks.useSessionIdentity.mockReturnValue(identity());
    renderGuard(
      <AuthOnly>
        <Protected />
      </AuthOnly>
    );
    expect(screen.getByText('protected')).toBeInTheDocument();
  });

  it('sends a signed-out visitor to login', () => {
    mocks.useSessionIdentity.mockReturnValue(
      identity({ isAuthenticated: false, role: null })
    );
    renderGuard(
      <AuthOnly>
        <Protected />
      </AuthOnly>
    );
    expect(screen.getByText('login')).toBeInTheDocument();
  });
});

describe('GuestOnly — layer 2, mirrored', () => {
  it('renders a loader while resolving', () => {
    mocks.useSessionIdentity.mockReturnValue(identity({ isResolved: false }));
    renderGuard(
      <GuestOnly>
        <Protected />
      </GuestOnly>
    );
    expect(screen.getByTestId('loader')).toBeInTheDocument();
  });

  it('admits a signed-out visitor', () => {
    mocks.useSessionIdentity.mockReturnValue(
      identity({ isAuthenticated: false, role: null })
    );
    renderGuard(
      <GuestOnly>
        <Protected />
      </GuestOnly>
    );
    expect(screen.getByText('protected')).toBeInTheDocument();
  });

  it('sends a signed-in identity to its own landing page', () => {
    mocks.useSessionIdentity.mockReturnValue(identity({ role: ROLE.EDUCATOR }));
    renderGuard(
      <GuestOnly>
        <Protected />
      </GuestOnly>
    );
    expect(screen.getByText('educator')).toBeInTheDocument();
  });

  it('never bounces an authenticated identity back to login', () => {
    // Otherwise login redirects here and this redirects to login, forever.
    mocks.useSessionIdentity.mockReturnValue(
      identity({ role: ROLE.DISTRICT_ADMIN, isLicenseActive: false })
    );
    renderGuard(
      <GuestOnly>
        <Protected />
      </GuestOnly>
    );
    expect(screen.queryByText('login')).not.toBeInTheDocument();
    expect(screen.getByText('redeem')).toBeInTheDocument();
  });
});

describe('RequireUsableAccount — layer 3', () => {
  it('renders a loader while resolving', () => {
    mocks.useSessionIdentity.mockReturnValue(identity({ isResolved: false }));
    renderGuard(
      <RequireUsableAccount>
        <Protected />
      </RequireUsableAccount>
    );
    expect(screen.getByTestId('loader')).toBeInTheDocument();
  });

  it('admits an account with a role this portal serves', () => {
    mocks.useSessionIdentity.mockReturnValue(identity());
    renderGuard(
      <RequireUsableAccount>
        <Protected />
      </RequireUsableAccount>
    );
    expect(screen.getByText('protected')).toBeInTheDocument();
  });

  it('explains itself to an account holding no serveable role', () => {
    // A student or scenario_admin authenticates fine and has nowhere to go. Rendering
    // nothing would be a bug at route level.
    mocks.useSessionIdentity.mockReturnValue(identity({ role: null }));
    renderGuard(
      <RequireUsableAccount>
        <Protected />
      </RequireUsableAccount>
    );
    expect(screen.getByText('no-access')).toBeInTheDocument();
  });

  it('does not intercept role selection — that never reaches routing here', () => {
    // No session is committed while a role choice is outstanding, so such a
    // session is simply unauthenticated and is handled by the sign-in modal.
    mocks.useSessionIdentity.mockReturnValue(
      identity({ isAuthenticated: false })
    );
    renderGuard(
      <RequireUsableAccount>
        <Protected />
      </RequireUsableAccount>
    );
    expect(screen.getByText('login')).toBeInTheDocument();
  });

  it('does not block an unlicensed admin — entitlement is a per-route concern', () => {
    mocks.useSessionIdentity.mockReturnValue(
      identity({ isLicenseActive: false, skippedRedeem: false })
    );
    renderGuard(
      <RequireUsableAccount>
        <Protected />
      </RequireUsableAccount>
    );
    expect(screen.getByText('protected')).toBeInTheDocument();
  });

  it('remains correct when used outside the route config', () => {
    mocks.useSessionIdentity.mockReturnValue(
      identity({ isAuthenticated: false, role: null })
    );
    renderGuard(
      <RequireUsableAccount>
        <Protected />
      </RequireUsableAccount>
    );
    expect(screen.getByText('login')).toBeInTheDocument();
  });
});

describe('Can — action-level gating', () => {
  const renderCan = (node: ReactNode) =>
    render(<MemoryRouter>{node}</MemoryRouter>);

  it('hides the control while the session is resolving', () => {
    // Briefly showing an action the user turns out not to have is worse than briefly
    // showing nothing.
    mocks.useSessionIdentity.mockReturnValue(identity({ isResolved: false }));
    renderCan(
      <Can roles={[ROLE.DISTRICT_ADMIN]}>
        <button>Add subscription</button>
      </Can>
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows the control to an allowed role', () => {
    mocks.useSessionIdentity.mockReturnValue(identity());
    renderCan(
      <Can roles={[ROLE.DISTRICT_ADMIN]}>
        <button>Add subscription</button>
      </Can>
    );
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('hides the control from a disallowed role', () => {
    mocks.useSessionIdentity.mockReturnValue(identity({ role: ROLE.EDUCATOR }));
    renderCan(
      <Can roles={[ROLE.DISTRICT_ADMIN]}>
        <button>Add subscription</button>
      </Can>
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders a fallback when one is given', () => {
    mocks.useSessionIdentity.mockReturnValue(identity({ role: ROLE.EDUCATOR }));
    renderCan(
      <Can roles={[ROLE.DISTRICT_ADMIN]} fallback={<p>ask an admin</p>}>
        <button>Add subscription</button>
      </Can>
    );
    expect(screen.getByText('ask an admin')).toBeInTheDocument();
  });

  it('gates on entitlement', () => {
    mocks.useSessionIdentity.mockReturnValue(
      identity({ isLicenseActive: false, skippedRedeem: false })
    );
    renderCan(
      <Can entitled>
        <button>Invite educator</button>
      </Can>
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('gates on a feature flag', () => {
    mocks.useSessionIdentity.mockReturnValue(
      identity({ googleClassroomEnabled: false })
    );
    renderCan(
      <Can feature="googleClassroom">
        <button>Sync roster</button>
      </Can>
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('requires every stated condition, not just one', () => {
    mocks.useSessionIdentity.mockReturnValue(
      identity({ role: ROLE.DISTRICT_ADMIN, isLicenseActive: false })
    );
    renderCan(
      <Can roles={[ROLE.DISTRICT_ADMIN]} entitled>
        <button>Add subscription</button>
      </Can>
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
