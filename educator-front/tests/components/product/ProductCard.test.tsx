import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom';
import ProductCard from '../../../src/components/myproducts/ProductCard';

describe('ProductCard Component', () => {
  const baseSubscription = {
    start: '2025-01-01',
    end: '2025-12-31',
    platform: ['Web'],
    ai: [true],
    redeem_code: 'ABC123',
    netsuite_id: 'NS-1001',
  };

  it('renders product name', () => {
    render(
      <ProductCard
        productName="AI Simulation Seats"
        productIndex={0}
        subscription={baseSubscription}
      />,
    );

    expect(screen.getByText('AI Simulation Seats')).toBeInTheDocument();
  });

  it('renders AI Seats badge', () => {
    render(
      <ProductCard
        productName="AI Simulation Seats"
        productIndex={0}
        subscription={baseSubscription}
      />,
    );

    expect(screen.getByText('AI Seats')).toBeInTheDocument();
  });

  it('renders AI Enabled badge when ai is true', () => {
    render(
      <ProductCard
        productName="AI Simulation Seats"
        productIndex={0}
        subscription={baseSubscription}
      />,
    );

    expect(screen.getByText('AI Enabled')).toBeInTheDocument();
  });

  it('does not render AI Enabled badge when ai is false', () => {
    render(
      <ProductCard
        productName="AI Simulation Seats"
        productIndex={0}
        subscription={{
          ...baseSubscription,
          ai: [false],
        }}
      />,
    );

    expect(screen.queryByText('AI Enabled')).not.toBeInTheDocument();
  });

  it('renders start and end dates', () => {
    render(
      <ProductCard
        productName="AI Simulation Seats"
        productIndex={0}
        subscription={baseSubscription}
      />,
    );

    expect(screen.getByText('Jan 1, 2025')).toBeInTheDocument();
    expect(screen.getByText('Dec 31, 2025')).toBeInTheDocument();
  });

  it('expands details when expand button is clicked', () => {
    render(
      <ProductCard
        productName="AI Simulation Seats"
        productIndex={0}
        subscription={baseSubscription}
      />,
    );

    fireEvent.click(screen.getByRole('button'));

    expect(screen.getByText('Redeem Code')).toBeInTheDocument();
    expect(screen.getByText('NetSuite ID')).toBeInTheDocument();
  });

  it('collapses details when button clicked twice', () => {
    render(
      <ProductCard
        productName="AI Simulation Seats"
        productIndex={0}
        subscription={baseSubscription}
      />,
    );

    const button = screen.getByRole('button');

    fireEvent.click(button);
    fireEvent.click(button);

    expect(screen.queryByText('Redeem Code')).not.toBeInTheDocument();
  });

  it('renders redeem code and netsuite id', () => {
    render(
      <ProductCard
        productName="AI Simulation Seats"
        productIndex={0}
        subscription={baseSubscription}
      />,
    );

    fireEvent.click(screen.getByRole('button'));

    expect(screen.getByText('ABC123')).toBeInTheDocument();
    expect(screen.getByText('NS-1001')).toBeInTheDocument();
  });

  it('renders seat allocation section', () => {
    render(
      <ProductCard
        productName="AI Simulation Seats"
        productIndex={0}
        subscription={{
          ...baseSubscription,
          ai_seats: 20,
          seats_available: 8,
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button'));

    expect(screen.getByText('Seat Allocation')).toBeInTheDocument();
    expect(screen.getByText('Total Seats')).toBeInTheDocument();
    expect(screen.getByText('Used Seats')).toBeInTheDocument();
    expect(screen.getByText('Available Seats')).toBeInTheDocument();
  });

  it('calculates seat usage correctly', () => {
    render(
      <ProductCard
        productName="AI Simulation Seats"
        productIndex={0}
        subscription={{
          ...baseSubscription,
          ai_seats: 20,
          seats_available: 5,
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button'));

    expect(screen.getByText('75% utilized')).toBeInTheDocument();
    expect(screen.getByText('15 / 20 used')).toBeInTheDocument();
  });

  it('renders AI simulation groups', () => {
    render(
      <ProductCard
        productName="AI Simulation Seats"
        productIndex={0}
        subscription={{
          ...baseSubscription,
          ai_seats: 20,
          seats_available: 10,
          ai_simulation_groups: [
            'Critical_Care',
            'Emergency_Medicine',
          ],
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button'));

    expect(screen.getByText('Critical Care')).toBeInTheDocument();
    expect(screen.getByText('Emergency Medicine')).toBeInTheDocument();
  });

  it('renders hardware badge', () => {
    render(
      <ProductCard
        productName="Manikin Device"
        productIndex={0}
        subscription={baseSubscription}
      />,
    );

    expect(screen.getByText('Hardware')).toBeInTheDocument();
  });

  it('renders hardware details section', () => {
    render(
      <ProductCard
        productName="Manikin Device"
        productIndex={0}
        subscription={{
          ...baseSubscription,
          devices_registered: ['Device A', 'Device B'],
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button'));

    expect(screen.getByText('Hardware Details')).toBeInTheDocument();
    expect(screen.getByText('Device A')).toBeInTheDocument();
    expect(screen.getByText('Device B')).toBeInTheDocument();
  });

  it('shows no devices registered message', () => {
    render(
      <ProductCard
        productName="Manikin Device"
        productIndex={0}
        subscription={baseSubscription}
      />,
    );

    fireEvent.click(screen.getByRole('button'));

    expect(
      screen.getByText('No devices registered.'),
    ).toBeInTheDocument();
  });

  it('renders hardware support date', () => {
    render(
      <ProductCard
        productName="Manikin Device"
        productIndex={0}
        subscription={{
          ...baseSubscription,
          hw_support_until: '2026-06-30',
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button'));

    expect(
      screen.getByText(/Hardware Support Until/i),
    ).toBeInTheDocument();
  });

  it('renders simulation bundle badge', () => {
    render(
      <ProductCard
        productName="Trauma Bundle"
        productIndex={0}
        subscription={baseSubscription}
      />,
    );

    expect(
      screen.getByText('Simulation Bundle'),
    ).toBeInTheDocument();
  });

  it('renders bundle information section', () => {
    render(
      <ProductCard
        productName="Trauma Bundle"
        productIndex={0}
        subscription={baseSubscription}
      />,
    );

    fireEvent.click(screen.getByRole('button'));

    expect(
      screen.getByText(
        'Simulation Bundle — access granted for the subscription period.',
      ),
    ).toBeInTheDocument();
  });

  it('shows default values when data missing', () => {
    render(
      <ProductCard
        productName="AI Simulation Seats"
        productIndex={0}
        subscription={{}}
      />,
    );

    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('shows platform value', () => {
    render(
      <ProductCard
        productName="AI Simulation Seats"
        productIndex={0}
        subscription={{
          ...baseSubscription,
          platform: ['Cloud'],
        }}
      />,
    );

    expect(screen.getByText('Cloud')).toBeInTheDocument();
  });

  it('shows AI value as No', () => {
    render(
      <ProductCard
        productName="AI Simulation Seats"
        productIndex={0}
        subscription={{
          ...baseSubscription,
          ai: [false],
        }}
      />,
    );

    expect(screen.getByText('No')).toBeInTheDocument();
  });
});