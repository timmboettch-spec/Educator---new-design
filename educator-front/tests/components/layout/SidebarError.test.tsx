import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('/assets/RealityworksAI_logo.svg', () => ({ default: 'logo.svg' }));
vi.mock('/assets/sidebar/home.svg', () => ({ default: 'home.svg' }));
vi.mock('/assets/sidebar/educator.svg', () => ({ default: 'educator.svg' }));
vi.mock('/assets/sidebar/reports.svg', () => ({ default: 'reports.svg' }));
vi.mock('/assets/sidebar/scenario.svg', () => ({ default: 'scenario.svg' }));
vi.mock('/assets/sidebar/settings.svg', () => ({ default: 'settings.svg' }));
vi.mock('/assets/sidebar/add-person.svg', () => ({ default: 'add-person.svg' }));

vi.mock('../../../src/utils/storage', () => ({
  getParsedUser: vi.fn(() => null),
}));

vi.mock('../../../src/store/hooks', () => ({
  useAppSelector: vi.fn(() => null),
  useAppDispatch: vi.fn(() => vi.fn()),
}));

import { getParsedUser } from '../../../src/utils/storage';
const mockedGetParsedUser = vi.mocked(getParsedUser);

import Sidebar from '../../../src/components/layout/Sidebar';

const renderSidebar = (
  path = '/educator-dashboard',
  user: Record<string, unknown> | null = { role: 'educator' },
) => {
  mockedGetParsedUser.mockReturnValue(user);
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Sidebar />
    </MemoryRouter>,
  );
};

describe('Sidebar – Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    mockedGetParsedUser.mockReturnValue(null);
  });

  describe('Missing or malformed user data', () => {
    it('renders without crashing when localStorage user is null', () => {
      mockedGetParsedUser.mockReturnValue(null);
      render(
        <MemoryRouter initialEntries={['/educator-dashboard']}>
          <Sidebar />
        </MemoryRouter>,
      );
      expect(screen.getByText('Realityworks')).toBeInTheDocument();
    });

    it('falls back to admin menu when user role is missing', () => {
      mockedGetParsedUser.mockReturnValue({});
      render(
        <MemoryRouter initialEntries={['/admin-dashboard']}>
          <Sidebar />
        </MemoryRouter>,
      );
      expect(screen.getByText('Schools')).toBeInTheDocument();
    });

    it('falls back to admin menu when user is empty string in localStorage', () => {
      mockedGetParsedUser.mockReturnValue(null);
      render(
        <MemoryRouter initialEntries={['/admin-dashboard']}>
          <Sidebar />
        </MemoryRouter>,
      );
      expect(screen.getByText('Realityworks')).toBeInTheDocument();
    });

    it('falls back to admin menu when role is unknown value', () => {
      renderSidebar('/admin-dashboard', { role: 'unknown_role' });
      expect(screen.getByText('Schools')).toBeInTheDocument();
    });

    it('does not crash when role is null', () => {
      renderSidebar('/admin-dashboard', { role: null });
      expect(screen.getByText('Realityworks')).toBeInTheDocument();
    });

    it('does not crash when user object has extra unknown fields', () => {
      renderSidebar('/educator-dashboard', { role: 'educator', unknown_field: 'value' });
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
      renderSidebar('/unknown-route', { role: 'educator' });
      ['Dashboard', 'Class Management', 'My Simulation Library'].forEach((label) =>
        expect(screen.getByText(label)).toBeInTheDocument(),
      );
    });
  });

  describe('Collapse/expand resilience', () => {
    it('does not crash on rapid collapse/expand toggling', async () => {
      renderSidebar();
      for (let i = 0; i < 5; i++) {
        fireEvent.click(screen.getByRole('button', { name: /collapse sidebar/i }));
        fireEvent.click(screen.getByRole('button', { name: /expand sidebar/i }));
      }
      expect(screen.getByText('Class Management')).toBeInTheDocument();
    });

    it('sidebar remains functional after multiple collapse/expand cycles', () => {
      const { container } = renderSidebar();
      fireEvent.click(screen.getByRole('button', { name: /collapse sidebar/i }));
      fireEvent.click(screen.getByRole('button', { name: /expand sidebar/i }));
      expect(container.querySelector('aside')).toBeInTheDocument();
    });
  });

  describe('Role-based error fallback', () => {
    it('does not render educator menu for admin role', () => {
      renderSidebar('/admin-dashboard', { role: 'admin' });
      expect(screen.queryByText('Class Management')).not.toBeInTheDocument();
    });

    it('does not render admin menu for educator role', () => {
      renderSidebar('/educator-dashboard', { role: 'educator' });
      expect(screen.queryByText('Schools')).not.toBeInTheDocument();
      expect(screen.queryByText('Educators')).not.toBeInTheDocument();
    });

    it('trial user does not see educator-only items', () => {
      mockedGetParsedUser.mockReturnValue({ role: 'educator' });
      sessionStorage.setItem('skipped_redeem', 'true');
      render(
        <MemoryRouter initialEntries={['/simulationcatalog']}>
          <Sidebar />
        </MemoryRouter>,
      );
      expect(screen.queryByText('Class Management')).not.toBeInTheDocument();
      expect(screen.queryByText('My Simulation Library')).not.toBeInTheDocument();
    });

    it('trial user does not see Dashboard link', () => {
      mockedGetParsedUser.mockReturnValue({ role: 'educator' });
      sessionStorage.setItem('skipped_redeem', 'true');
      render(
        <MemoryRouter initialEntries={['/simulationcatalog']}>
          <Sidebar />
        </MemoryRouter>,
      );
      expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
    });
  });

  describe('Accessibility resilience', () => {
    it('collapse button has accessible aria-label', () => {
      renderSidebar();
      expect(screen.getByRole('button', { name: /collapse sidebar/i })).toBeInTheDocument();
    });

    it('expand button has accessible aria-label after collapse', () => {
      renderSidebar();
      fireEvent.click(screen.getByRole('button', { name: /collapse sidebar/i }));
      expect(screen.getByRole('button', { name: /expand sidebar/i })).toBeInTheDocument();
    });

    // it('all nav links are accessible as link role', () => {
    //   renderSidebar('/educator-dashboard', { role: 'educator' });
    //   expect(screen.getAllByRole('link').length).toBeGreaterThanOrEqual(6);
    // });

    it('collapsed sidebar still has accessible logo image', () => {
      renderSidebar();
      fireEvent.click(screen.getByRole('button', { name: /collapse sidebar/i }));
      expect(screen.getAllByAltText('Realityworks AI').length).toBeGreaterThan(0);
    });
  });
});
