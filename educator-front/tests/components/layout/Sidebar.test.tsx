import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import i18n from '../../../src/i18n';

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

describe('Sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    asAdmin();
  });

  test('renders admin menu items without My Products', () => {
    asAdmin();
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    );
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Schools')).toBeInTheDocument();
    expect(screen.getByText('Educators')).toBeInTheDocument();
    expect(screen.queryByText('My Products')).not.toBeInTheDocument();
  });

  test('renders educator menu items without My Products', () => {
    asEducator();
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    );
    expect(screen.getByText('Class Management')).toBeInTheDocument();
    expect(screen.getByText('My Simulation Library')).toBeInTheDocument();
    expect(screen.getByText('Simulation Catalog')).toBeInTheDocument();
    expect(screen.queryByText('My Products')).not.toBeInTheDocument();
  });

  test('renders trial user menu items without My Products', () => {
    asTrial();
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    );
    expect(screen.getByText('Simulation Catalog')).toBeInTheDocument();
    expect(screen.queryByText('My Products')).not.toBeInTheDocument();
    expect(screen.getByText('Account')).toBeInTheDocument();
  });

  test('collapses sidebar when collapse button clicked', () => {
    asAdmin();
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByLabelText('Collapse sidebar'));
    expect(screen.getByLabelText('Expand sidebar')).toBeInTheDocument();
  });

  test('expands sidebar when expand button clicked', () => {
    asAdmin();
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByLabelText('Collapse sidebar'));
    fireEvent.click(screen.getByLabelText('Expand sidebar'));
    expect(screen.getByLabelText('Collapse sidebar')).toBeInTheDocument();
  });

  test('highlights active menu item', () => {
    asAdmin();
    render(
      <MemoryRouter initialEntries={['/schools']}>
        <Sidebar />
      </MemoryRouter>
    );
    const schoolsLink = screen.getByText('Schools').closest('a');
    expect(schoolsLink).toHaveClass('bg-neutral-active', 'border-primary');
    expect(screen.getByText('Educators').closest('a')).toHaveClass(
      'border-transparent'
    );
  });

  test('renders a decorative svg icon for every menu item', () => {
    asAdmin();
    render(
      <MemoryRouter initialEntries={['/schools']}>
        <Sidebar />
      </MemoryRouter>
    );
    const links = within(screen.getByRole('navigation')).getAllByRole('link');
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    }
  });

  test('labels the navigation landmark in the active language', async () => {
    asAdmin();
    const previous = i18n.language;
    try {
      const { unmount } = render(
        <MemoryRouter initialEntries={['/schools']}>
          <Sidebar />
        </MemoryRouter>
      );
      expect(screen.getByRole('navigation', { name: 'Primary' })).toBeVisible();
      unmount();

      await i18n.changeLanguage('es');
      render(
        <MemoryRouter initialEntries={['/schools']}>
          <Sidebar />
        </MemoryRouter>
      );
      expect(
        screen.getByRole('navigation', { name: 'Principal' })
      ).toBeVisible();
    } finally {
      await i18n.changeLanguage(previous);
    }
  });

  test('shows Google Classroom for educators when enabled or unset', () => {
    asEducator();
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    );
    expect(screen.getByText('Google Classroom')).toBeInTheDocument();
  });

  test('hides Google Classroom for educators when disabled', () => {
    asEducator({ googleClassroomEnabled: false });
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    );
    expect(screen.queryByText('Google Classroom')).not.toBeInTheDocument();
  });

  describe('student app card', () => {
    const renderSidebar = () =>
      render(
        <I18nextProvider i18n={i18n}>
          <MemoryRouter>
            <Sidebar />
          </MemoryRouter>
        </I18nextProvider>
      );

    test('shows for an educator', () => {
      asEducator();
      renderSidebar();
      expect(screen.getByText('Student App')).toBeInTheDocument();
    });

    test('stays hidden for a licensed admin', () => {
      asAdmin();
      renderSidebar();
      expect(screen.queryByText('Student App')).not.toBeInTheDocument();
    });

    test('stays hidden for a trial admin', () => {
      asTrial();
      renderSidebar();
      expect(screen.queryByText('Student App')).not.toBeInTheDocument();
    });

    test('shrinks to an icon link when the sidebar is collapsed', () => {
      asEducator();
      renderSidebar();
      fireEvent.click(screen.getByLabelText('Collapse sidebar'));
      expect(screen.queryByText('Student App')).not.toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: 'Open the student app' })
      ).toBeInTheDocument();
    });
  });
});
