import { render, screen, fireEvent } from '@testing-library/react';
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

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

describe('Sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    mockedGetParsedUser.mockReturnValue(null);
  });

  test('renders admin menu items', () => {
    mockedGetParsedUser.mockReturnValue({ role: 'admin' });
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    );
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Schools')).toBeInTheDocument();
    expect(screen.getByText('Educators')).toBeInTheDocument();
    expect(screen.getByText('My Products')).toBeInTheDocument();
  });

  test('renders educator menu items', () => {
    mockedGetParsedUser.mockReturnValue({ role: 'educator' });
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    );
    expect(screen.getByText('Class Management')).toBeInTheDocument();
    expect(screen.getByText('My Simulation Library')).toBeInTheDocument();
    expect(screen.getByText('Simulation Catalog')).toBeInTheDocument();
  });

  test('renders trial user menu items', () => {
    sessionStorage.setItem('skipped_redeem', 'true');
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    );
    expect(screen.getByText('Simulation Catalog')).toBeInTheDocument();
    expect(screen.getByText('My Products')).toBeInTheDocument();
    expect(screen.getByText('Account')).toBeInTheDocument();
  });

  test('collapses sidebar when collapse button clicked', () => {
    mockedGetParsedUser.mockReturnValue({ role: 'admin' });
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByLabelText('Collapse sidebar'));
    expect(screen.getByLabelText('Expand sidebar')).toBeInTheDocument();
  });

  test('expands sidebar when expand button clicked', () => {
    mockedGetParsedUser.mockReturnValue({ role: 'admin' });
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByLabelText('Collapse sidebar'));
    fireEvent.click(screen.getByLabelText('Expand sidebar'));
    expect(screen.getByLabelText('Collapse sidebar')).toBeInTheDocument();
  });

  test('highlights active menu item', () => {
    mockedGetParsedUser.mockReturnValue({ role: 'admin' });
    render(
      <MemoryRouter initialEntries={['/schools']}>
        <Sidebar />
      </MemoryRouter>,
    );
    const schoolsLink = screen.getByText('Schools');
    expect(schoolsLink.closest('a')).toHaveClass('bg-primary-200');
  });
});
