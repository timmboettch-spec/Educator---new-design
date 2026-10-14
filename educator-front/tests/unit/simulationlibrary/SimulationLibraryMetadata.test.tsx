import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual =
    await vi.importActual<typeof import('react-router-dom')>(
      'react-router-dom'
    );
  return { ...actual, useNavigate: () => mockNavigate };
});

import '../../../src/i18n';
import SimulationGrid from '../../../src/components/simulation/SimulationGrid';
import SimulationCard from '../../../src/components/simulation/Simulationcard';
import MyLibraryModal from '../../../src/components/modal/MyLibraryModal';
import type { Simulation } from '../../../src/types/simulation.types';

const mockDispatch = vi.fn(() => ({ unwrap: () => Promise.resolve() }));

vi.mock('../../../src/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: unknown) => unknown) => selector({}),
}));

vi.mock('../../../src/redux/simulation/MyLibraryRedux', () => ({
  fetchMyLibrary: vi.fn(() => ({ type: 'myLibrary/fetch' })),
}));

vi.mock('../../../src/redux/simulation/RemoveFromLibraryRedux', () => ({
  RemoveFromLibraryRequest: vi.fn(() => ({ type: 'myLibrary/remove' })),
}));

vi.mock('../../../src/components/common/Toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock(
  '../../../src/redux/dashboard/simulationlibrary/addsimulationredux',
  () => ({
    fetchSimulationsByUnit: vi.fn(() => ({ type: 'unit/fetch' })),
    selectUnitSimLoading: () => false,
    selectUnitSimulations: () => [],
  })
);

const baseSimulation: Simulation = {
  id: 'scn-101',
  simulation_id: 'scn-101',
  title: 'UAT-Bias-Free Assessment',
  unit: 'unit-002',
  unit_name: 'UAT Unit 002',
  duration: '20 minutes',
  image: '/assets/fake.png',
  description: 'Simulation description',
  assigned: false,
  rating: 0,
  difficulty: 'Easy',
  learnerLevel: 'BSN',
  targetAudience: 'BSN',
  learningObjectives: ['Objective A', 'Objective B'],
  topicsAddressed: 'Non-stigmatizing communication',
  productName: 'Bariatric Nursing Manikin',
  clinicalSetting: 'Med Surg',
  avatarEnabled: true,
};

describe('My Simulation Library metadata rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows Duration column and value in list view', () => {
    render(
      <SimulationGrid
        simulations={[baseSimulation]}
        viewMode="list"
        isSelected={() => false}
        onToggleSelect={vi.fn()}
        allSelected={false}
        someSelected={false}
        onToggleSelectAll={vi.fn()}
        onAssignClass={vi.fn()}
        onMoreInfo={vi.fn()}
        onRemoveFromLibrary={vi.fn()}
        removingId={null}
      />
    );

    expect(screen.getByText('Duration')).toBeInTheDocument();
    expect(screen.getByText('20 minutes')).toBeInTheDocument();
  });

  it('shows level, modality, duration and difficulty metadata in grid card, without product name or In Library badge', () => {
    render(
      <SimulationCard
        simulation={baseSimulation}
        onAssignClass={vi.fn()}
        onRemoveFromLibrary={vi.fn()}
        onMoreInfo={vi.fn()}
      />
    );

    // "BSN" doesn't read as secondary, so it's bucketed as Post-Secondary.
    expect(screen.getByText('Post-Secondary')).toBeInTheDocument();
    expect(screen.getByText('Avatar')).toBeInTheDocument();
    expect(screen.getByText('AI Seats Required')).toBeInTheDocument();
    expect(screen.getByText('20 minutes')).toBeInTheDocument();
    expect(screen.getByText('Easy')).toBeInTheDocument();
    expect(
      screen.queryByText('Bariatric Nursing Manikin')
    ).not.toBeInTheDocument();
    expect(screen.queryByText('In Library')).not.toBeInTheDocument();
  });

  it('shows expanded More Info metadata including Product Name and a catalog details link', () => {
    render(
      <MyLibraryModal
        simulation={baseSimulation}
        onClose={vi.fn()}
        onAssign={vi.fn()}
      />
    );

    expect(screen.getByText('Unit: UAT Unit 002')).toBeInTheDocument();
    expect(screen.getByText('Simulation description')).toBeInTheDocument();
    expect(screen.getByText('Learning Objectives')).toBeInTheDocument();
    expect(screen.getByText('Topics Addressed')).toBeInTheDocument();
    expect(screen.getByText('Product Name')).toBeInTheDocument();
    expect(screen.getByText('Bariatric Nursing Manikin')).toBeInTheDocument();
    expect(screen.getByText('Clinical Setting')).toBeInTheDocument();

    const catalogLink = screen.getByRole('link', {
      name: /view full simulation details in simulation catalog/i,
    });
    expect(catalogLink).toHaveAttribute('href', '/simulationdetails/scn-101');
  });
});
