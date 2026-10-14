import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '../../../src/i18n';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('/assets/RealityworksAI_logo.svg', () => ({ default: 'logo.svg' }));

/**
 * The sidebar no longer derives the role, the licence or the feature flags itself —
 * it asks the identity hook and renders whatever the route tree says that identity may
 * navigate to. So these drive the identity directly; resolving a stored user *into* an
 * identity is covered by useSessionIdentity.test.tsx.
 */
vi.mock('../../../src/features/auth/model/useSessionIdentity', () => ({
  useSessionIdentity: () => mockIdentity,
}));

vi.mock('../../../src/store/hooks', () => ({
  useAppSelector: vi.fn(() => null),
  useAppDispatch: vi.fn(() => vi.fn()),
}));

type TestIdentity = {
  role: 'district_admin' | 'educator' | null;
  isLicenseActive: boolean;
  skippedRedeem: boolean;
  isAuthenticated: boolean;
  isResolved: boolean;
  googleClassroomEnabled: boolean;
  accessToken: string | null;
};

const BASE_IDENTITY: TestIdentity = {
  role: 'district_admin',
  isLicenseActive: true,
  skippedRedeem: false,
  isAuthenticated: true,
  isResolved: true,
  googleClassroomEnabled: true,
  accessToken: 'test-token',
};

let mockIdentity: TestIdentity = { ...BASE_IDENTITY };

/** Licensed District Admin — the old `{ role: 'admin' }` fixture. */
const asAdmin = (o: Partial<TestIdentity> = {}) => {
  mockIdentity = { ...BASE_IDENTITY, ...o };
};

/** Educator — licence is not a concept for this role. */
const asEducator = (o: Partial<TestIdentity> = {}) => {
  mockIdentity = {
    ...BASE_IDENTITY,
    role: 'educator',
    isLicenseActive: false,
    ...o,
  };
};

/** District Admin who chose "Start Trial" rather than redeeming a code. */
const asTrial = (o: Partial<TestIdentity> = {}) => {
  mockIdentity = {
    ...BASE_IDENTITY,
    isLicenseActive: false,
    skippedRedeem: true,
    ...o,
  };
};

import Sidebar from '../../../src/components/layout/Sidebar';

const renderSidebar = (
  path = '/educator-dashboard',
  setUp: () => void = asEducator
) => {
  setUp();
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Sidebar />
    </MemoryRouter>
  );
};

describe('Sidebar – Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    asEducator();
  });

  describe('Missing or malformed user data', () => {
    it('renders without crashing when there is no session yet', () => {
      asAdmin({ isAuthenticated: false, role: null });
      render(
        <MemoryRouter initialEntries={['/educator-dashboard']}>
          <Sidebar />
        </MemoryRouter>
      );
      expect(screen.getByText('Realityworks')).toBeInTheDocument();
    });

    /**
     * Behaviour change, deliberate. These used to assert that an unresolvable role
     * fell back to the *admin* menu, because the old check was `role !== 'educator'`
     * and everything — including a missing role — landed in the else branch. Showing
     * an unknown account the full district-admin menu was never right; the links all
     * lead to pages its guards would bounce it from.
     *
     * Now an unserved role gets no links, and never sees this component anyway:
     * `RequireUsableAccount` sends it to `/no-access` before the layout mounts. What
     * is asserted here is the part that still matters — the shell renders rather than
     * crashing.
     */
    it('shows no navigation for a role this portal does not serve', () => {
      renderSidebar('/admin-dashboard', () => asAdmin({ role: null }));
      expect(screen.getByText('Realityworks')).toBeInTheDocument();
      expect(screen.queryByText('Schools')).not.toBeInTheDocument();
      expect(screen.queryByText('Class Management')).not.toBeInTheDocument();
    });

    it('shows no navigation until the session has resolved', () => {
      // Guards render a loader in this window; the menu must not flash first.
      renderSidebar('/admin-dashboard', () => asAdmin({ isResolved: false }));
      expect(screen.getByText('Realityworks')).toBeInTheDocument();
      expect(screen.queryByText('Schools')).not.toBeInTheDocument();
    });

    it('shows the admin menu for a licensed district admin', () => {
      renderSidebar('/admin-dashboard', asAdmin);
      expect(screen.getByText('Schools')).toBeInTheDocument();
      expect(screen.getByText('Educators')).toBeInTheDocument();
    });

    it('does not crash when the identity carries extra unknown fields', () => {
      renderSidebar('/educator-dashboard', () =>
        asEducator({ extraField: 'ignored' } as Partial<TestIdentity>)
      );
      expect(screen.getByText('Class Management')).toBeInTheDocument();
    });
  });

  describe('Unknown route fallback', () => {
    it('renders without crashing on unknown route', () => {
      renderSidebar('/unknown-route');
      expect(screen.getByText('Realityworks')).toBeInTheDocument();
    });

    it('no link is active on unknown route', () => {
      const { container } = renderSidebar('/unknown-route');
      expect(container.querySelectorAll('a.border-l-4').length).toBe(0);
    });

    it('all menu items still render on unknown route', () => {
      renderSidebar('/unknown-route', asEducator);
      ['Dashboard', 'Class Management', 'My Simulation Library'].forEach(
        (label) => expect(screen.getByText(label)).toBeInTheDocument()
      );
    });
  });

  describe('Collapse/expand resilience', () => {
    it('does not crash on rapid collapse/expand toggling', async () => {
      renderSidebar();
      for (let i = 0; i < 5; i++) {
        fireEvent.click(
          screen.getByRole('button', { name: /collapse sidebar/i })
        );
        fireEvent.click(
          screen.getByRole('button', { name: /expand sidebar/i })
        );
      }
      expect(screen.getByText('Class Management')).toBeInTheDocument();
    });

    it('sidebar remains functional after multiple collapse/expand cycles', () => {
      const { container } = renderSidebar();
      fireEvent.click(
        screen.getByRole('button', { name: /collapse sidebar/i })
      );
      fireEvent.click(screen.getByRole('button', { name: /expand sidebar/i }));
      expect(container.querySelector('aside')).toBeInTheDocument();
    });
  });

  describe('Role-based error fallback', () => {
    it('does not render educator menu for admin role', () => {
      renderSidebar('/admin-dashboard', asAdmin);
      expect(screen.queryByText('Class Management')).not.toBeInTheDocument();
    });

    it('does not render admin menu for educator role', () => {
      renderSidebar('/educator-dashboard', asEducator);
      expect(screen.queryByText('Schools')).not.toBeInTheDocument();
      expect(screen.queryByText('Educators')).not.toBeInTheDocument();
    });

    it('trial user does not see educator-only items', () => {
      asTrial();
      render(
        <MemoryRouter initialEntries={['/simulationcatalog']}>
          <Sidebar />
        </MemoryRouter>
      );
      expect(screen.queryByText('Class Management')).not.toBeInTheDocument();
      expect(
        screen.queryByText('My Simulation Library')
      ).not.toBeInTheDocument();
    });

    it('trial user does not see Dashboard link', () => {
      asTrial();
      render(
        <MemoryRouter initialEntries={['/simulationcatalog']}>
          <Sidebar />
        </MemoryRouter>
      );
      expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
    });
  });

  describe('Accessibility resilience', () => {
    it('collapse button has accessible aria-label', () => {
      renderSidebar();
      expect(
        screen.getByRole('button', { name: /collapse sidebar/i })
      ).toBeInTheDocument();
    });

    it('expand button has accessible aria-label after collapse', () => {
      renderSidebar();
      fireEvent.click(
        screen.getByRole('button', { name: /collapse sidebar/i })
      );
      expect(
        screen.getByRole('button', { name: /expand sidebar/i })
      ).toBeInTheDocument();
    });

    it('all nav links are accessible as link role', () => {
      renderSidebar('/educator-dashboard', asEducator);
      expect(screen.getAllByRole('link').length).toBeGreaterThanOrEqual(5);
    });

    it('collapsed sidebar still has accessible logo image', () => {
      renderSidebar();
      fireEvent.click(
        screen.getByRole('button', { name: /collapse sidebar/i })
      );
      expect(screen.getAllByAltText('Realityworks AI').length).toBeGreaterThan(
        0
      );
    });
  });
});
