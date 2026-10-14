import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SimulationAllView from '../../../src/components/simulation/SimulationAllView';
import type { SectionItem } from '../../../src/redux/simulation/FetchSimulationCatalogRedux';
import { renderWithProviders } from '../../../src/test/testUtils';

const ITEMS: SectionItem[] = [
  {
    id: 1,
    scenarioId: 's-1',
    title: 'Airway',
    image: '',
    cta: 'View',
    targetAudience: ['High School'],
    avatarEnabled: true,
  },
  {
    id: 2,
    scenarioId: 's-2',
    title: 'Burns',
    image: '',
    cta: 'View',
    targetAudience: ['BSN'],
    avatarEnabled: false,
  },
];

const renderView = (onBack = vi.fn()) =>
  renderWithProviders(
    <SimulationAllView
      items={ITEMS}
      title="Secondary Avatar Simulation Pack"
      onBack={onBack}
      resolveUnitName={() => ''}
    />
  );

describe('SimulationAllView', () => {
  // AnimatedCard fades cards in via IntersectionObserver, which jsdom lacks.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe = vi.fn();
        disconnect = vi.fn();
        unobserve = vi.fn();
      }
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('shows the pack name, count and every simulation', () => {
    renderView();

    expect(
      screen.getByRole('heading', { name: 'Secondary Avatar Simulation Pack' })
    ).toBeInTheDocument();
    expect(screen.getByText('2 simulations')).toBeInTheDocument();
    expect(screen.getByText('Airway')).toBeInTheDocument();
    expect(screen.getByText('Burns')).toBeInTheDocument();
  });

  it('narrows the list with its own quick filters', () => {
    renderView();

    const modality = screen.getByRole('group', { name: 'Modality' });
    fireEvent.click(
      Array.from(modality.querySelectorAll('button')).find(
        (button) => button.textContent === 'Workstation'
      )!
    );

    expect(screen.queryByText('Airway')).not.toBeInTheDocument();
    expect(screen.getByText('Burns')).toBeInTheDocument();
    expect(screen.getByText('1 simulation')).toBeInTheDocument();
  });

  it('shows an empty message when the search matches nothing', () => {
    renderView();

    fireEvent.change(screen.getByPlaceholderText('Search...'), {
      target: { value: 'zzz' },
    });
    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(screen.getByText('No simulations found.')).toBeInTheDocument();
  });

  it('goes back from the Back button', () => {
    const onBack = vi.fn();
    renderView(onBack);

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
