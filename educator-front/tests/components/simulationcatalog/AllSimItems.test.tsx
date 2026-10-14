import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AllSimItems } from '../../../src/components/simulationcatalog/AllSimItems';
import type { SectionItem } from '../../../src/redux/simulation/FetchSimulationCatalogRedux';
import { renderWithProviders } from '../../../src/test/testUtils';

const item = (overrides: Partial<SectionItem>): SectionItem => ({
  id: 1,
  scenarioId: 's-1',
  title: 'Airway Management',
  image: '',
  cta: 'View',
  ...overrides,
});

describe('AllSimItems', () => {
  // AnimatedCard fades cards in via IntersectionObserver, which jsdom lacks.
  beforeEach(() => {
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
    vi.unstubAllGlobals();
  });

  it('shows learner level, modality and difficulty chips', () => {
    renderWithProviders(
      <AllSimItems
        item={item({
          targetAudience: ['High School'],
          avatarEnabled: true,
          difficulty: 'Easy',
        })}
        idx={0}
      />
    );

    expect(screen.getByText('Secondary')).toBeInTheDocument();
    expect(screen.getByText('Avatar')).toBeInTheDocument();
    expect(screen.getByText('Easy')).toBeInTheDocument();
  });

  it('leaves out the learner level and difficulty chips when unknown', () => {
    renderWithProviders(<AllSimItems item={item({})} idx={0} />);

    expect(screen.getByText('Workstation')).toBeInTheDocument();
    expect(screen.queryByText('Secondary')).not.toBeInTheDocument();
    expect(screen.queryByText('Post-Secondary')).not.toBeInTheDocument();
    expect(screen.queryByText('Easy')).not.toBeInTheDocument();
  });

  it('labels the heart and View buttons with the simulation title', () => {
    renderWithProviders(<AllSimItems item={item({})} idx={0} />);

    expect(
      screen.getByRole('button', {
        name: 'Add Airway Management to My Library',
      })
    ).toHaveAttribute('aria-pressed', 'false');
    expect(
      screen.getByRole('button', { name: 'View Airway Management' })
    ).toBeInTheDocument();
  });

  it('shows a filled, pressed heart for a favourite', () => {
    renderWithProviders(
      <AllSimItems item={item({ myFavorite: true })} idx={0} />
    );

    expect(
      screen.getByRole('button', {
        name: 'Remove Airway Management from My Library',
      })
    ).toHaveAttribute('aria-pressed', 'true');
  });
});
