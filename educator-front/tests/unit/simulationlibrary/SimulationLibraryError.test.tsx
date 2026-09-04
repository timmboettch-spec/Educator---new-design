import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { RootState } from '../../../src/store/index';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockState = {
  SimulationLibrary: {
    responseSimulationLibrary: null,
    status: 'failed',
    error: 'Something went wrong',
    viewMode: 'grid',
    activeFilter: 'All',
    panelFilteredSimulations: null,
    appliedFilters: {
      product: '',
      topic: '',
      unit: '',
      learnerLevel: '',
      difficulty: '',
      duration: '',
    },
  },
};

const mockDispatch = vi.fn(() => ({ unwrap: () => Promise.resolve() }));

vi.mock('../../../src/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: RootState) => unknown) => selector(mockState as RootState),
}));

vi.mock('../../../src/redux/dashboard/simulationlibrary/GetSimulationRedux', () => ({
  fetchMyLibrarySimulations: vi.fn(() => ({ type: 'sim/fetchMyLibrary', unwrap: () => Promise.resolve() })),
  clearSimulationLibraryState: vi.fn(() => ({ type: 'sim/clearState' })),
  clearPanelFilter: vi.fn(() => ({ type: 'sim/clearPanel' })),
  applyPanelFilter: vi.fn(() => ({ type: 'sim/applyPanel' })),
  setActiveFilter: vi.fn(() => ({ type: 'sim/setFilter' })),
  removeFilter: vi.fn(() => ({ type: 'sim/removeFilter' })),
  selectFilteredSimulations: (_s: RootState) => [],
  selectSimulationLoading: (s: RootState) => s.SimulationLibrary.status === 'loading',
  selectSimulationError: (s: RootState) => s.SimulationLibrary.error,
  selectActiveFilter: (s: RootState) => s.SimulationLibrary.activeFilter,
  selectSimulationLibraryData: (_s: RootState) => [],
  selectAppliedFilters: (s: RootState) => s.SimulationLibrary.appliedFilters,
}));

vi.mock('../../../src/components/simulation/FilterBar', () => ({ default: () => null }));
vi.mock('../../../src/components/simulation/FilterPanel', () => ({ default: () => null }));
vi.mock('../../../src/components/common/FilterPanel', () => ({ default: () => null }));
vi.mock('../../../src/components/simulation/FilterChips', () => ({ default: () => null }));
vi.mock('../../../src/components/simulation/SimulationGrid', () => ({ default: () => null }));
vi.mock('../../../src/components/simulation/ViewToggle', () => ({ default: () => null }));
vi.mock('../../../src/pages/Simulation/addsimulation', () => ({ default: () => null }));
vi.mock('../../../src/components/modal/AddSimulationModal', () => ({ default: () => null }));

import MyLibraryPage from '../../../src/pages/Simulation/simulationlibrary/index';
describe('SimulationLibraryError', () => {
  beforeEach(() => mockDispatch.mockClear());

  it('renders the error message', () => {
    render(<MyLibraryPage />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('renders the Try Again button', () => {
    render(<MyLibraryPage />);
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('dispatches fetchSimulationLibraryWithDetails on retry click', () => {
    render(<MyLibraryPage />);
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(mockDispatch).toHaveBeenCalled();
  });
});
