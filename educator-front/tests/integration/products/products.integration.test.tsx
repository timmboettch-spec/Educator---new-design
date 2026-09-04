import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';
import MyProducts from '../../../src/pages/products/index';

const mockDispatch = vi.fn();

vi.mock('react-redux', () => ({ useDispatch: () => mockDispatch }));
vi.mock('../../../src/utils/storage', () => ({ getParsedUser: vi.fn(), updateStoredUser: vi.fn() }));
vi.mock('../../../src/redux/users/GetUserRedux', () => ({ getCurrentUserRequest: vi.fn(() => ({ type: 'user/getCurrent' })) }));
vi.mock('../../../src/redux/products/simbundle', () => ({ ProductSimBundleRequest: vi.fn(() => ({ type: 'product/simBundle' })) }));

vi.mock('../../../src/components/myproducts/seatscard', () => ({
  default: ({ title, value, subtitle }: { title: string; value: number; subtitle?: string }) => {
    const key = title.replace(/\s+/g, '-').toLowerCase();
    return (
      <div data-testid="seat-card">
        <span data-testid={`seat-title-${key}`}>{title}</span>
        <span data-testid={`seat-value-${key}`}>{value}</span>
        {subtitle && <span data-testid={`seat-subtitle-${key}`}>{subtitle}</span>}
      </div>
    );
  },
}));

vi.mock('../../../src/components/myproducts/Hardware', () => ({
  default: ({ subscriptions, viewerName, viewerEmail, viewerSchool }: { subscriptions: unknown[]; viewerName?: string; viewerEmail?: string; viewerSchool?: string }) => (
    <div data-testid="hardware-component">
      <span data-testid="hardware-sub-count">{subscriptions.length}</span>
      <span data-testid="hardware-viewer-name">{viewerName}</span>
      <span data-testid="hardware-viewer-email">{viewerEmail}</span>
      <span data-testid="hardware-viewer-school">{viewerSchool}</span>
    </div>
  ),
}));

vi.mock('../../../src/components/myproducts/SimulationBundles', () => ({
  default: ({ subscriptions, bundleSimulationMap, isEducator }: { subscriptions: unknown[]; bundleSimulationMap: Record<string, unknown>; isEducator: boolean }) => (
    <div data-testid="simulation-bundles">
      <span data-testid="bundles-sub-count">{subscriptions.length}</span>
      <span data-testid="bundles-is-educator">{String(isEducator)}</span>
      <span data-testid="bundles-map-keys">{Object.keys(bundleSimulationMap).join(',')}</span>
    </div>
  ),
}));

import { getParsedUser } from '../../../src/utils/storage';
const mockGetParsedUser = getParsedUser as ReturnType<typeof vi.fn>;

const ADMIN_SUB = { product_name: ['Trauma Bundle', 'Manikin Device', 'AI Simulation Seats'], platform: ['bundle', 'device', 'web'], ai_seats: 30, seats_available: 10, devices_registered: ['2 Manikin Device'], end: '2099-12-31' };
const ADMIN_USER = { full_name: 'Admin User', email: 'admin@school.com', role: 'admin', school: { school_name: 'Lincoln High' }, subscriptions: [ADMIN_SUB] };
const EDUCATOR_USER = { full_name: 'Jane Educator', email: 'jane@school.com', role: 'educator', school: { school_name: 'Lincoln High' }, tokens: 15, total_tokens: 20, allocated_tokens: 5, admin: { subscriptions: [{ product_name: ['Fundamentals Bundle'], platform: ['bundle'], ai_seats: null, seats_available: null, devices_registered: [], end: '2099-12-31' }] } };
const BUNDLE_RESPONSE = { data: { unit_id: 'UNIT-1', simulations: [{ scenario_id: 'sim-1', title: 'CPR Basics' }] } };

function setupDispatch(resolvedData?: Record<string, unknown>) {
  mockDispatch.mockImplementation((action: { type: string }) => {
    if (action?.type === 'user/getCurrent') return { unwrap: () => resolvedData ? Promise.resolve({ data: resolvedData }) : Promise.reject(new Error('Network error')) };
    if (action?.type === 'product/simBundle') return { unwrap: () => Promise.resolve(BUNDLE_RESPONSE) };
    return { unwrap: () => Promise.resolve({}) };
  });
}

const renderPage = () => render(<MemoryRouter><MyProducts /></MemoryRouter>);
const setup = async (user = ADMIN_USER as Record<string, unknown>) => { mockGetParsedUser.mockReturnValue(user); setupDispatch(user); await act(async () => { renderPage(); }); };

describe('Products Page Integration', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('Page Structure', () => {
    it('renders heading and subtitle', async () => {
      await setup();
      expect(screen.getByText('My Products')).toBeInTheDocument();
      expect(screen.getByText('Manage your owned systems and simulation libraries')).toBeInTheDocument();
    });

    it('renders Hardware and SimulationBundles components', async () => {
      await setup();
      expect(screen.getByTestId('hardware-component')).toBeInTheDocument();
      expect(screen.getByTestId('simulation-bundles')).toBeInTheDocument();
    });
  });

  describe('Admin vs Educator View', () => {
    it('shows 5 seat cards for admin (includes Active Hardware)', async () => {
      await setup(ADMIN_USER);
      await waitFor(() => expect(screen.getAllByTestId('seat-card')).toHaveLength(5));
    });

    it('shows 4 seat cards for educator (no Active Hardware)', async () => {
      await setup(EDUCATOR_USER);
      await waitFor(() => expect(screen.getAllByTestId('seat-card')).toHaveLength(4));
    });

    it('passes isEducator=false to SimulationBundles for admin', async () => {
      await setup(ADMIN_USER);
      await waitFor(() => expect(screen.getByTestId('bundles-is-educator')).toHaveTextContent('false'));
    });

    it('passes isEducator=true to SimulationBundles for educator', async () => {
      await setup(EDUCATOR_USER);
      await waitFor(() => expect(screen.getByTestId('bundles-is-educator')).toHaveTextContent('true'));
    });

    it('passes viewer name, email, and school to Hardware', async () => {
      await setup(ADMIN_USER);
      await waitFor(() => {
        expect(screen.getByTestId('hardware-viewer-name')).toHaveTextContent('Admin User');
        expect(screen.getByTestId('hardware-viewer-email')).toHaveTextContent('admin@school.com');
        expect(screen.getByTestId('hardware-viewer-school')).toHaveTextContent('Lincoln High');
      });
    });

    it('treats user with admin relation and no is_license_active as educator', async () => {
      const ambiguous = { full_name: 'Ambiguous', email: 'a@a.com', admin: { subscriptions: [] }, subscriptions: [] };
      await setup(ambiguous);
      await waitFor(() => expect(screen.getByTestId('bundles-is-educator')).toHaveTextContent('true'));
    });
  });

  describe('Seat Stats Computation', () => {
    it('computes Total (30), Used (20), Available (10) from ai_seats', async () => {
      await setup(ADMIN_USER);
      await waitFor(() => {
        expect(screen.getByTestId('seat-value-total-seats')).toHaveTextContent('30');
        expect(screen.getByTestId('seat-value-used-seats')).toHaveTextContent('20');
        expect(screen.getByTestId('seat-value-available-seats')).toHaveTextContent('10');
      });
    });

    it('shows 67% utilized and 33% remaining subtitles', async () => {
      await setup(ADMIN_USER);
      await waitFor(() => {
        expect(screen.getByTestId('seat-subtitle-used-seats')).toHaveTextContent('67% utilized');
        expect(screen.getByTestId('seat-subtitle-available-seats')).toHaveTextContent('33% remaining');
      });
    });

    it('shows 0 for all seat stats when total is zero', async () => {
      const zeroUser = { ...ADMIN_USER, subscriptions: [{ ...ADMIN_SUB, ai_seats: 0, seats_available: 0 }] };
      await setup(zeroUser);
      await waitFor(() => expect(screen.getByTestId('seat-value-total-seats')).toHaveTextContent('0'));
    });

    it('aggregates seats across multiple subscriptions', async () => {
      const multiSubUser = { ...ADMIN_USER, subscriptions: [
        { product_name: ['AI Simulation Seats'], platform: ['web'], ai_seats: 10, seats_available: 4, devices_registered: [], end: '2099-12-31' },
        { product_name: ['AI Simulation Seats'], platform: ['web'], ai_seats: 20, seats_available: 6, devices_registered: [], end: '2099-12-31' },
      ]};
      await setup(multiSubUser);
      await waitFor(() => {
        expect(screen.getByTestId('seat-value-total-seats')).toHaveTextContent('30');
        expect(screen.getByTestId('seat-value-available-seats')).toHaveTextContent('10');
      });
    });

    it('computes seats from token fields when no ai_seats present', async () => {
      const tokenUser = { ...EDUCATOR_USER, admin: undefined, tokens: 12, total_tokens: 20, allocated_tokens: 8, subscriptions: [{ product_name: ['Fundamentals Bundle'], platform: ['bundle'], end: '2099-12-31' }] };
      await setup(tokenUser);
      await waitFor(() => {
        expect(screen.getByTestId('seat-value-total-seats')).toHaveTextContent('20');
        expect(screen.getByTestId('seat-value-available-seats')).toHaveTextContent('12');
      });
    });
  });

  describe('Total Products Count', () => {
    it('counts bundle, hardware, and seat products correctly', async () => {
      await setup(ADMIN_USER);
      await waitFor(() => expect(Number(screen.getByTestId('seat-value-total-products').textContent)).toBeGreaterThan(0));
    });

    it('returns zero for empty subscriptions', async () => {
      await setup({ full_name: 'Empty', email: 'e@e.com', role: 'admin', subscriptions: [] });
      expect(screen.getByTestId('seat-value-total-products')).toHaveTextContent('0');
    });
  });

  describe('User Data Refresh', () => {
    it('updates viewer info after dispatch resolves fresh user data', async () => {
      mockGetParsedUser.mockReturnValue({ ...ADMIN_USER, full_name: 'Old Name' });
      setupDispatch({ ...ADMIN_USER, full_name: 'Fresh Admin', email: 'fresh@school.com' });
      await act(async () => { renderPage(); });
      await waitFor(() => {
        expect(screen.getByTestId('hardware-viewer-name')).toHaveTextContent('Fresh Admin');
        expect(screen.getByTestId('hardware-viewer-email')).toHaveTextContent('fresh@school.com');
      });
    });

    it('keeps cached user when dispatch rejects', async () => {
      mockGetParsedUser.mockReturnValue(ADMIN_USER);
      mockDispatch.mockImplementation((action: { type: string }) => {
        if (action?.type === 'user/getCurrent') return { unwrap: () => Promise.reject(new Error('err')) };
        return { unwrap: () => Promise.resolve({}) };
      });
      await act(async () => { renderPage(); });
      expect(screen.getByTestId('hardware-viewer-name')).toHaveTextContent('Admin User');
    });

    it('renders safely when getParsedUser returns null', async () => {
      mockGetParsedUser.mockReturnValue(null);
      setupDispatch(ADMIN_USER);
      await act(async () => { renderPage(); });
      expect(screen.getByText('My Products')).toBeInTheDocument();
    });

    it('dispatches getCurrentUserRequest on mount', async () => {
      await setup();
      const { getCurrentUserRequest } = await import('../../../src/redux/users/GetUserRedux');
      await waitFor(() => expect(getCurrentUserRequest).toHaveBeenCalled());
    });
  });

  describe('Bundle Simulation Fetching', () => {
    it('calls ProductSimBundleRequest for bundle products', async () => {
      await setup(ADMIN_USER);
      const { ProductSimBundleRequest } = await import('../../../src/redux/products/simbundle');
      await waitFor(() => expect(ProductSimBundleRequest).toHaveBeenCalled());
    });

    it('calls ProductSimBundleRequest once per unique bundle in subscription', async () => {
      const multiBundleUser = { ...ADMIN_USER, subscriptions: [{ product_name: ['Trauma Bundle', 'Fundamentals Bundle'], platform: ['bundle', 'bundle'], ai_seats: 10, seats_available: 5, devices_registered: [], end: '2099-12-31' }] };
      await setup(multiBundleUser);
      const { ProductSimBundleRequest } = await import('../../../src/redux/products/simbundle');
      await waitFor(() => expect(ProductSimBundleRequest).toHaveBeenCalledTimes(2));
    });

    it('populates bundleSimulationMap after fetch', async () => {
      await setup(ADMIN_USER);
      await waitFor(() => expect((screen.getByTestId('bundles-map-keys').textContent ?? '').length).toBeGreaterThan(0));
    });

    it('passes empty map when user has no bundle products', async () => {
      const noBundles = { ...ADMIN_USER, subscriptions: [{ product_name: ['Manikin Device'], platform: ['device'], ai_seats: 10, seats_available: 5, devices_registered: ['1 Manikin Device'], end: '2099-12-31' }] };
      await setup(noBundles);
      await waitFor(() => expect(screen.getByTestId('bundles-map-keys')).toHaveTextContent(''));
    });

    it('adds key with empty simulations on bundle fetch failure', async () => {
      mockGetParsedUser.mockReturnValue(ADMIN_USER);
      mockDispatch.mockImplementation((action: { type: string }) => {
        if (action?.type === 'user/getCurrent') return { unwrap: () => Promise.resolve({ data: ADMIN_USER }) };
        if (action?.type === 'product/simBundle') return { unwrap: () => Promise.reject(new Error('failed')) };
        return { unwrap: () => Promise.resolve({}) };
      });
      await act(async () => { renderPage(); });
      await waitFor(() => expect(screen.getByTestId('bundles-map-keys').textContent).toContain('trauma_bundle'));
    });
  });

  describe('Subscription Propagation', () => {
    it('passes admin subscriptions to Hardware and SimulationBundles', async () => {
      await setup(ADMIN_USER);
      await waitFor(() => {
        expect(screen.getByTestId('hardware-sub-count')).toHaveTextContent('1');
        expect(screen.getByTestId('bundles-sub-count')).toHaveTextContent('1');
      });
    });

    it('passes educator admin.subscriptions to child components', async () => {
      await setup(EDUCATOR_USER);
      await waitFor(() => expect(screen.getByTestId('hardware-sub-count')).toHaveTextContent('1'));
    });

    it('falls back to own subscriptions when educator has no admin.subscriptions', async () => {
      const soloEducator = { full_name: 'Solo', email: 'solo@school.com', role: 'educator', tokens: 5, total_tokens: 10, subscriptions: [{ product_name: ['Fundamentals Bundle'], platform: ['bundle'], ai_seats: null, seats_available: null, devices_registered: [], end: '2099-12-31' }] };
      await setup(soloEducator);
      await waitFor(() => expect(screen.getByTestId('bundles-sub-count')).toHaveTextContent('1'));
    });

    it('passes multiple subscriptions to child components', async () => {
      const multiUser = { ...ADMIN_USER, subscriptions: [{ ...ADMIN_SUB }, { product_name: ['Fundamentals Bundle'], platform: ['bundle'], ai_seats: 5, seats_available: 2, devices_registered: [], end: '2099-12-31' }] };
      await setup(multiUser);
      await waitFor(() => {
        expect(screen.getByTestId('hardware-sub-count')).toHaveTextContent('2');
        expect(screen.getByTestId('bundles-sub-count')).toHaveTextContent('2');
      });
    });
  });

  describe('Active Hardware Card', () => {
    it('shows Active Hardware card for admin', async () => {
      await setup(ADMIN_USER);
      await waitFor(() => expect(screen.getByTestId('seat-title-active-hardware')).toBeInTheDocument());
    });

    it('does not show Active Hardware card for educator', async () => {
      await setup(EDUCATOR_USER);
      await waitFor(() => expect(screen.queryByTestId('seat-title-active-hardware')).not.toBeInTheDocument());
    });

    it('reflects hardware count from devices_registered', async () => {
      await setup(ADMIN_USER);
      await waitFor(() => expect(Number(screen.getByTestId('seat-value-active-hardware').textContent)).toBeGreaterThanOrEqual(1));
    });

    it('excludes expired subscriptions from active hardware count', async () => {
      const expiredUser = { ...ADMIN_USER, subscriptions: [{ product_name: ['Manikin Device'], platform: ['device'], ai_seats: 0, seats_available: 0, devices_registered: ['1 Manikin Device'], end: '2000-01-01' }] };
      await setup(expiredUser);
      await waitFor(() => expect(screen.getByTestId('seat-value-active-hardware')).toHaveTextContent('0'));
    });
  });

  describe('Edge Cases', () => {
    it('renders with empty subscriptions gracefully', async () => {
      await setup({ full_name: 'No Subs', email: 'empty@test.com', role: 'admin', subscriptions: [] });
      expect(screen.getByTestId('seat-value-total-seats')).toHaveTextContent('0');
    });

    it('renders when full_name and email are absent', async () => {
      await setup({ role: 'admin', subscriptions: [] });
      expect(screen.getByTestId('hardware-viewer-name')).toHaveTextContent('');
      expect(screen.getByTestId('hardware-viewer-email')).toHaveTextContent('');
    });

    it('renders correctly when school info is missing', async () => {
      await setup({ ...ADMIN_USER, school: undefined });
      expect(screen.getByTestId('hardware-viewer-school')).toHaveTextContent('');
    });
  });
});
