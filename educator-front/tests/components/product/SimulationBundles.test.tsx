import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import SimulationBundles from '../../../src/components/myproducts/SimulationBundles';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

describe('SimulationBundles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const subscriptions = [
    {
      product_name: ['Trauma Bundle'],
      platform: ['bundle'],
    },
  ];

  const bundleSimulationMap = {
    trauma_bundle: {
      unit_id: 'UNIT001',
      simulations: [
        {
          id: 'sim1',
          title: 'Cardiac Arrest',
          scenario_id: 'scenario-1',
        },
        {
          id: 'sim2',
          title: 'Trauma Assessment',
          scenario_id: 'scenario-2',
        },
      ],
    },
  };

  it('renders simulations header', () => {
    render(
      <SimulationBundles
        subscriptions={subscriptions}
        bundleSimulationMap={bundleSimulationMap}
      />,
    );

    expect(screen.getByText('Simulations')).toBeInTheDocument();
  });

  it('renders bundle count', () => {
    render(
      <SimulationBundles
        subscriptions={subscriptions}
        bundleSimulationMap={bundleSimulationMap}
      />,
    );

    expect(screen.getByText('1 bundle')).toBeInTheDocument();
  });

  it('renders bundle name', () => {
    render(
      <SimulationBundles
        subscriptions={subscriptions}
        bundleSimulationMap={bundleSimulationMap}
      />,
    );

    expect(screen.getByText('Trauma Bundle')).toBeInTheDocument();
  });

  it('expands bundle when clicked', () => {
    render(
      <SimulationBundles
        subscriptions={subscriptions}
        bundleSimulationMap={bundleSimulationMap}
      />,
    );

    fireEvent.click(screen.getByRole('button'));

    expect(screen.getByText('Cardiac Arrest')).toBeInTheDocument();
    expect(screen.getByText('Trauma Assessment')).toBeInTheDocument();
  });

  it('collapses expanded bundle', () => {
    render(
      <SimulationBundles
        subscriptions={subscriptions}
        bundleSimulationMap={bundleSimulationMap}
      />,
    );

    const button = screen.getByRole('button');

    fireEvent.click(button);
    fireEvent.click(button);

    expect(screen.queryByText('Cardiac Arrest')).not.toBeVisible();
  });

  it('shows simulation count', () => {
    render(
      <SimulationBundles
        subscriptions={subscriptions}
        bundleSimulationMap={bundleSimulationMap}
      />,
    );

    expect(screen.getByText('2 simulations')).toBeInTheDocument();
  });

  it('shows no simulations message when bundle has no simulations', () => {
    render(
      <SimulationBundles
        subscriptions={subscriptions}
        bundleSimulationMap={{
          trauma_bundle: {
            unit_id: 'UNIT001',
            simulations: [],
          },
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button'));

    expect(
      screen.getByText(
        'No simulations available for this bundle yet.',
      ),
    ).toBeInTheDocument();
  });

  it('shows empty state when no bundles exist', () => {
    render(
      <SimulationBundles
        subscriptions={[]}
        bundleSimulationMap={{}}
      />,
    );

    expect(
      screen.getByText('No simulation bundles found.'),
    ).toBeInTheDocument();
  });

  it('renders View Details button for educator', () => {
    render(
      <SimulationBundles
        subscriptions={subscriptions}
        bundleSimulationMap={bundleSimulationMap}
        isEducator
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /trauma bundle/i }));

    expect(
      screen.getAllByText('View Details')[0],
    ).toBeInTheDocument();
  });

  it('navigates to simulation details page', () => {
    render(
      <SimulationBundles
        subscriptions={subscriptions}
        bundleSimulationMap={bundleSimulationMap}
        isEducator
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /trauma bundle/i }));

    fireEvent.click(screen.getAllByText('View Details')[0]);

    expect(mockNavigate).toHaveBeenCalledWith(
      '/simulationdetails/scenario-1',
      expect.objectContaining({
        state: expect.objectContaining({
          simulationId: 'scenario-1',
        }),
      }),
    );
  });

  it('navigates when simulation card is clicked', () => {
    render(
      <SimulationBundles
        subscriptions={subscriptions}
        bundleSimulationMap={bundleSimulationMap}
        isEducator
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /trauma bundle/i }));

    fireEvent.click(screen.getByText('Cardiac Arrest'));

    expect(mockNavigate).toHaveBeenCalled();
  });
});