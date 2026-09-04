import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import Hardware from '../../../src/components/myproducts/Hardware';

vi.mock('../../../src/utils/storage', () => ({
  getParsedUser: vi.fn(() => ({
    role: 'admin',
  })),
}));

vi.mock('../../../src/components/myproducts/SeatConsumptionByClass', () => ({
  default: ({
    usageRows,
    isAdmin,
  }: {
    usageRows: unknown[];
    isAdmin: boolean;
  }) => (
    <div data-testid="seat-consumption">
      Seat Consumption - {usageRows.length} - {isAdmin ? 'Admin' : 'Educator'}
    </div>
  ),
}));

describe('Hardware Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when no subscriptions are provided', () => {
    const { container } = render(<Hardware subscriptions={[]} />);

    expect(container.firstChild).toBeNull();
  });

  it('renders hardware section title', () => {
    render(
      <Hardware
        subscriptions={[
          {
            product_name: ['Manikin Device'],
            platform: ['device'],
            devices_registered: ['1 Manikin Device'],
            end: '2099-12-31',
          },
        ]}
      />,
    );

    expect(screen.getByText('Hardware')).toBeInTheDocument();
  });

  it('renders hardware product name', () => {
    render(
      <Hardware
        subscriptions={[
          {
            product_name: ['Manikin Device'],
            platform: ['device'],
            devices_registered: ['1 Manikin Device'],
            end: '2099-12-31',
          },
        ]}
      />,
    );

    expect(screen.getByText('Manikin Device')).toBeInTheDocument();
  });

  it('renders netsuite id', () => {
    render(
      <Hardware
        subscriptions={[
          {
            product_name: ['Manikin Device'],
            platform: ['device'],
            netsuite_id: 'NS-1001',
            devices_registered: ['1 Manikin Device'],
            end: '2099-12-31',
          },
        ]}
      />,
    );

    expect(screen.getByText('PRODUCT NS-1001')).toBeInTheDocument();
  });

  it('shows N/A when netsuite id is missing', () => {
    render(
      <Hardware
        subscriptions={[
          {
            product_name: ['Manikin Device'],
            platform: ['device'],
            devices_registered: ['1 Manikin Device'],
            end: '2099-12-31',
          },
        ]}
      />,
    );

    expect(screen.getByText('PRODUCT N/A')).toBeInTheDocument();
  });

  it('shows active badge when assignment rows exist', () => {
    render(
      <Hardware
        subscriptions={[
          {
            product_name: ['Manikin Device'],
            platform: ['device'],
            devices_registered: ['1 Manikin Device'],
            hardware_assignment_rows: [
              {
                product_name: 'Manikin Device',
                school_name: 'Test School',
                educator_count: 5,
              },
            ],
            end: '2099-12-31',
          },
        ]}
      />,
    );

    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('shows not assigned badge when no assignments exist', () => {
    render(
      <Hardware
        subscriptions={[
          {
            product_name: ['Manikin Device'],
            platform: ['device'],
            devices_registered: ['1 Manikin Device'],
            end: '2099-12-31',
          },
        ]}
      />,
    );

    expect(screen.getByText('Not Assigned')).toBeInTheDocument();
  });

  it('renders SeatConsumptionByClass component', () => {
    render(
      <Hardware
        subscriptions={[
          {
            product_name: ['Manikin Device'],
            platform: ['device'],
            devices_registered: ['1 Manikin Device'],
            end: '2099-12-31',
          },
        ]}
      />,
    );

    expect(
      screen.getByTestId('seat-consumption'),
    ).toBeInTheDocument();
  });

  it('does not render expired subscriptions', () => {
    const { container } = render(
      <Hardware
        subscriptions={[
          {
            product_name: ['Manikin Device'],
            platform: ['device'],
            devices_registered: ['1 Manikin Device'],
            end: '2020-01-01',
          },
        ]}
      />,
    );

    expect(container.firstChild).toBeNull();
  });

  it('renders multiple hardware units based on quantity', () => {
    render(
      <Hardware
        subscriptions={[
          {
            product_name: ['2 Manikin Device'],
            platform: ['device'],
            devices_registered: ['2 Manikin Device'],
            end: '2099-12-31',
          },
        ]}
      />,
    );

    expect(screen.getAllByText('Manikin Device')).toHaveLength(2);
  });

  it('renders only hardware products', () => {
    render(
      <Hardware
        subscriptions={[
          {
            product_name: ['Simulation Bundle', 'Manikin Device'],
            platform: ['bundle', 'device'],
            devices_registered: ['1 Manikin Device'],
            end: '2099-12-31',
          },
        ]}
      />,
    );

    expect(screen.queryByText('Simulation Bundle')).not.toBeInTheDocument();
    expect(screen.getByText('Manikin Device')).toBeInTheDocument();
  });

  it('passes admin mode to SeatConsumptionByClass', () => {
    render(
      <Hardware
        subscriptions={[
          {
            product_name: ['Manikin Device'],
            platform: ['device'],
            devices_registered: ['1 Manikin Device'],
            end: '2099-12-31',
          },
        ]}
      />,
    );

    expect(
      screen.getByText(/Seat Consumption - 0 - Admin/i),
    ).toBeInTheDocument();
  });

  it('renders assignment row count correctly', () => {
    render(
      <Hardware
        subscriptions={[
          {
            product_name: ['Manikin Device'],
            platform: ['device'],
            devices_registered: ['1 Manikin Device'],
            hardware_assignment_rows: [
              {
                product_name: 'Manikin Device',
                school_name: 'School A',
                educator_count: 3,
              },
              {
                product_name: 'Manikin Device',
                school_name: 'School B',
                educator_count: 2,
              },
            ],
            end: '2099-12-31',
          },
        ]}
      />,
    );

    expect(
      screen.getByText(/Seat Consumption - 2 - Admin/i),
    ).toBeInTheDocument();
  });
});