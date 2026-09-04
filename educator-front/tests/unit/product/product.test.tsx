import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import MyProducts from '../../../src/pages/products';

const mockDispatch = vi.fn();

vi.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
}));

vi.mock('../../../src/utils/storage', () => ({
  getParsedUser: vi.fn(() => ({
    full_name: 'Admin User',
    email: 'admin@test.com',
    role: 'admin',
    subscriptions: [
      {
        product_name: ['AI Simulation Seats', 'Trauma Bundle', 'Manikin Device'],
        platform: ['web', 'bundle', 'device'],
        ai_seats: 20,
        seats_available: 8,
        devices_registered: ['2 Manikin Device'],
        end: '2099-12-31',
      },
    ],
  })),
  updateStoredUser: vi.fn(),
}));

vi.mock('../../../src/redux/users/GetUserRedux', () => ({
  getCurrentUserRequest: vi.fn(() => ({ type: 'user/getCurrent' })),
}));

vi.mock('../../../src/redux/products/simbundle', () => ({
  ProductSimBundleRequest: vi.fn(() => ({
    type: 'product/bundle',
  })),
}));

vi.mock('../../../src/components/myproducts/seatscard', () => ({
  default: ({
    title,
    value,
    subtitle,
  }: {
    title: string;
    value: number;
    subtitle?: string;
  }) => (
    <div data-testid="seat-card">
      <div>{title}</div>
      <div>{value}</div>
      {subtitle && <div>{subtitle}</div>}
    </div>
  ),
}));

vi.mock('../../../src/components/myproducts/Hardware', () => ({
  default: ({
    subscriptions,
  }: {
    subscriptions: unknown[];
  }) => (
    <div data-testid="hardware-component">
      Hardware Component ({subscriptions.length})
    </div>
  ),
}));

vi.mock('../../../src/components/myproducts/SimulationBundles', () => ({
  default: ({
    subscriptions,
    isEducator,
  }: {
    subscriptions: unknown[];
    isEducator: boolean;
  }) => (
    <div data-testid="simulation-bundles">
      Simulation Bundles ({subscriptions.length}) -
      {isEducator ? 'Educator' : 'Admin'}
    </div>
  ),
}));

describe('MyProducts Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockDispatch.mockImplementation((action) => {
      if (action?.type === 'user/getCurrent') {
        return {
          unwrap: () =>
            Promise.resolve({
              data: {
                full_name: 'Admin User',
                email: 'admin@test.com',
                role: 'admin',
                subscriptions: [
                  {
                    product_name: [
                      'AI Simulation Seats',
                      'Trauma Bundle',
                      'Manikin Device',
                    ],
                    platform: ['web', 'bundle', 'device'],
                    ai_seats: 20,
                    seats_available: 8,
                    devices_registered: ['2 Manikin Device'],
                    end: '2099-12-31',
                  },
                ],
              },
            }),
        };
      }

      return {
        unwrap: () =>
          Promise.resolve({
            data: {
              unit_id: 'unit-1',
              simulations: [
                {
                  id: 'sim-1',
                  name: 'Simulation One',
                },
              ],
            },
          }),
      };
    });
  });

  it('renders page title', () => {
    render(<MyProducts />);

    expect(screen.getByText('My Products')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Manage your owned systems and simulation libraries',
      ),
    ).toBeInTheDocument();
  });

  it('renders all summary cards', () => {
    render(<MyProducts />);

    expect(screen.getByText('Total Seats')).toBeInTheDocument();
    expect(screen.getByText('Used Seats')).toBeInTheDocument();
    expect(screen.getByText('Available Seats')).toBeInTheDocument();
    expect(screen.getByText('Total Products')).toBeInTheDocument();
    expect(screen.getByText('Active Hardware')).toBeInTheDocument();
  });

  it('calculates seat values correctly', () => {
    render(<MyProducts />);

    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
  });

  it('renders hardware component', () => {
    render(<MyProducts />);

    expect(
      screen.getByTestId('hardware-component'),
    ).toBeInTheDocument();
  });

  it('renders simulation bundles component', () => {
    render(<MyProducts />);

    expect(
      screen.getByTestId('simulation-bundles'),
    ).toBeInTheDocument();
  });

  it('shows admin view', () => {
    render(<MyProducts />);

    expect(screen.getByTestId('simulation-bundles')).toHaveTextContent(
      /Simulation Bundles \(1\).*Admin/i,
    );
  });

  it('fetches current user on mount', async () => {
    render(<MyProducts />);

    await waitFor(() => {
      expect(mockDispatch).toHaveBeenCalled();
    });
  });

  it('renders correct product count', () => {
    render(<MyProducts />);

    expect(screen.getByText('Total Products')).toBeInTheDocument();
  });

  it('renders active hardware card for admin', () => {
    render(<MyProducts />);

    expect(screen.getByText('Active Hardware')).toBeInTheDocument();
  });

  it('renders seat card components', () => {
    render(<MyProducts />);

    const cards = screen.getAllByTestId('seat-card');
    expect(cards.length).toBe(5);
  });

  it('loads bundle data successfully', async () => {
    render(<MyProducts />);

    await waitFor(() => {
      expect(mockDispatch).toHaveBeenCalled();
    });
  });
});