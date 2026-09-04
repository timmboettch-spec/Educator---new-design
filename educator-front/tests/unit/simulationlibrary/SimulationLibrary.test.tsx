import { render, screen, fireEvent } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';

type SimulationItem = {
  id: string;
  title: string;
  unit?: string;
  category?: string;
  avatarEnabled?: boolean;
};

type SimulationLibraryState = {
  filtered: SimulationItem[];
  loading: boolean;
  error: string | null;
  viewMode: 'grid' | 'list';
  activeFilter: string;
  responseSimulationLibrary: {
    data: SimulationItem[];
  };
  appliedFilters: {
    product: string;
    topic: string;
    unit: string;
    learnerLevel: string;
    difficulty: string;
    duration: string;
  };
};

type RootState = {
  SimulationLibrary: SimulationLibraryState;
};

let mockState: RootState = {
  SimulationLibrary: {
    filtered: [],
    loading: false,
    error: null,
    viewMode: 'grid',
    activeFilter: 'all',
    responseSimulationLibrary: { data: [] },
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

const mockDispatch = vi.fn();

vi.mock('react-redux', async () => {
  const actual = await vi.importActual<typeof import('react-redux')>('react-redux');
  return {
    ...actual,
    useDispatch: () => mockDispatch,
  };
});

vi.mock('../../../src/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: RootState) => unknown) => selector(mockState),
}));

vi.mock('../../../src/redux/dashboard/simulationlibrary/GetSimulationRedux', () => ({
  fetchSimulationLibraryWithDetails: vi.fn(() => ({ type: 'sim/fetchWithDetails' })),
  fetchMyLibrarySimulations: vi.fn(() => ({ type: 'sim/fetchMyLibrary' })),
  fetchSimulationLibrary: vi.fn(() => ({ type: 'sim/fetchLibrary' })),

  selectFilteredSimulations: (s: RootState) => s.SimulationLibrary.filtered ?? [],
  selectSimulationLoading: (s: RootState) => s.SimulationLibrary.loading ?? false,
  selectSimulationError: (s: RootState) => s.SimulationLibrary.error ?? null,
  selectViewMode: (s: RootState) => s.SimulationLibrary.viewMode ?? 'grid',
  selectActiveFilter: (s: RootState) => s.SimulationLibrary.activeFilter ?? 'all',
  selectSimulationLibraryData: (s: RootState) =>
    s.SimulationLibrary.responseSimulationLibrary?.data ?? [],
  selectAppliedFilters: (s: RootState) => s.SimulationLibrary.appliedFilters ?? {
    product: '',
    topic: '',
    unit: '',
    learnerLevel: '',
    difficulty: '',
    duration: '',
  },

  setActiveFilter: vi.fn((f: string) => ({ type: 'sim/setFilter', payload: f })),
  setViewMode: vi.fn((m: string) => ({ type: 'sim/setViewMode', payload: m })),
  applyPanelFilter: vi.fn((f: unknown) => ({ type: 'sim/applyPanel', payload: f })),
  clearPanelFilter: vi.fn(() => ({ type: 'sim/clearPanel' })),
  clearSimulationLibraryState: vi.fn(() => ({ type: 'sim/clearState' })),
  removeFilter: vi.fn((key: string) => ({ type: 'sim/removeFilter', payload: key })),
}));

vi.mock('../../../src/components/modal/AddSimulationModal', () => ({
  default: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) =>
    isOpen ? (
      <div data-testid="add-simulation-modal">
        <button onClick={onClose}>Close Modal</button>
      </div>
    ) : null,
}));

vi.mock('../../../src/components/common/AppLoader', () => ({
  default: ({ loading }: { loading?: boolean }) =>
    loading ? <div data-testid="app-loader" /> : null,
}));

vi.mock('../../../src/components/simulation/LoadingState', () => ({
  default: () => <div data-testid="loading-state">Loading...</div>,
}));

vi.mock('../../../src/components/simulation/ErrorState', () => ({
  default: ({ message, onRetry }: { message: string; onRetry: () => void }) => (
    <div data-testid="error-state">
      <p>{message}</p>
      <button onClick={onRetry}>Retry</button>
    </div>
  ),
}));

vi.mock('../../../src/components/simulation/SimulationGrid', () => ({
  default: ({
    simulations,
    onAssignClass,
  }: {
    simulations?: SimulationItem[];
    viewMode?: string;
    onAssignClass?: (id: string, category: string) => void;
    onMoreInfo?: () => void;
  }) => (
    <div data-testid="simulation-grid">
      {(simulations ?? []).map((s) => (
        <div key={s.id} data-testid={`sim-card-${s.id}`}>
          <span>{s.title}</span>
          <button onClick={() => onAssignClass?.(s.id, '')}>
            Assign Class
          </button>
        </div>
      ))}
    </div>
  ),
}));

vi.mock('../../../src/components/simulation/FilterBar', () => ({
  default: ({
    activeFilter,
    onFilterChange,
    onFiltersClick,
  }: {
    activeFilter: string;
    onFilterChange: (filter: string) => void;
    onFiltersClick: () => void;
    isFilterPanelOpen?: boolean;
  }) => (
    <div data-testid="filter-bar">
      <button onClick={() => onFilterChange('all')}>All</button>
      <button onClick={() => onFilterChange('recent')}>Recent</button>
      <button onClick={onFiltersClick}>Filters</button>
      <span data-testid="active-filter">{activeFilter}</span>
    </div>
  ),
}));

vi.mock('../../../src/components/common/FilterPanel', () => ({
  default: ({
    onClose,
    onApply,
    onReset,
  }: {
    onClose: () => void;
    onApply: (filters: unknown) => void;
    onReset: () => void;
    title?: string;
    fields?: unknown[];
  }) => (
    <div data-testid="filter-panel">
      <button onClick={onClose}>Close Panel</button>
      <button onClick={() => onApply({})}>Apply</button>
      <button onClick={onReset}>Remove</button>
    </div>
  ),
}));

vi.mock('../../../src/components/simulation/ViewToggle', () => ({
  default: ({
    viewMode,
    onViewModeChange,
  }: {
    viewMode: string;
    onViewModeChange: (mode: string) => void;
  }) => (
    <div data-testid="view-toggle">
      <button aria-label="Grid View" aria-pressed={viewMode === 'grid'} onClick={() => onViewModeChange('grid')}>
        Grid
      </button>
      <button aria-label="List View" aria-pressed={viewMode === 'list'} onClick={() => onViewModeChange('list')}>
        List
      </button>
      <span data-testid="current-view">{viewMode}</span>
    </div>
  ),
}));

import MyLibraryPage from '../../../src/pages/Simulation/simulationlibrary/index';

const mockSims: SimulationItem[] = [
  { id: 'sim-1', title: 'Baby Sim Pro', unit: 'unit-1', avatarEnabled: true },
  { id: 'sim-2', title: 'Nursing Sim', unit: 'unit-2', avatarEnabled: false },
];

const buildStore = () =>
  configureStore({
    reducer: {
      SimulationLibrary: () => mockState.SimulationLibrary,
    },
  });

const renderPage = (stateOverrides: Partial<SimulationLibraryState> = {}) => {
  mockState = {
    SimulationLibrary: {
      filtered: mockSims,
      loading: false,
      error: null,
      viewMode: 'grid',
      activeFilter: 'all',
      responseSimulationLibrary: { data: mockSims },
      appliedFilters: {
        product: '',
        topic: '',
        unit: '',
        learnerLevel: '',
        difficulty: '',
        duration: '',
      },
      ...stateOverrides,
    },
  };

  return render(
    <Provider store={buildStore()}>
      <MemoryRouter>
        <MyLibraryPage />
      </MemoryRouter>
    </Provider>,
  );
};

describe('MyLibraryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDispatch.mockReturnValue({ unwrap: () => Promise.resolve() });
  });

  describe('Success States', () => {
    it('renders page heading correctly', () => {
      renderPage();
    });

    it('renders subtitle text', () => {
      renderPage();
    });

    it('renders FilterBar', () => {
      renderPage();
      expect(screen.getByTestId('filter-bar')).toBeInTheDocument();
    });

    it('renders ViewToggle', () => {
      renderPage();
      expect(screen.getByTestId('view-toggle')).toBeInTheDocument();
    });

    it('renders SimulationGrid when not loading and no error', () => {
      renderPage();
      expect(screen.getByTestId('simulation-grid')).toBeInTheDocument();
    });

    it('renders all simulation cards', () => {
      renderPage();
      expect(screen.getByTestId('sim-card-sim-1')).toBeInTheDocument();
      expect(screen.getByTestId('sim-card-sim-2')).toBeInTheDocument();
      expect(screen.getByText('Baby Sim Pro')).toBeInTheDocument();
      expect(screen.getByText('Nursing Sim')).toBeInTheDocument();
    });

    it('dispatches fetchSimulationLibraryWithDetails on mount', () => {
      renderPage();
      expect(mockDispatch).toHaveBeenCalled();
    });

    it('shows "grid" as the default view mode in ViewToggle', () => {
      renderPage();
      expect(screen.getByTestId('current-view').textContent).toBe('grid');
      expect(screen.getByRole('button', { name: 'Grid View' })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('button', { name: 'List View' })).toHaveAttribute('aria-pressed', 'false');
    });

    it('shows "all" as the default active filter', () => {
      renderPage();
      expect(screen.getByTestId('active-filter').textContent).toBe('all');
    });
  });

  describe('Loading State', () => {
    it('shows LoadingState skeleton when loading is true', () => {
      renderPage({ loading: true, filtered: [] });
      expect(screen.getByTestId('loading-state')).toBeInTheDocument();
    });

    it('hides SimulationGrid while loading', () => {
      renderPage({ loading: true, filtered: [] });
      expect(screen.queryByTestId('simulation-grid')).not.toBeInTheDocument();
    });
  });

  describe('Error State', () => {
    it('shows ErrorState when error is set', () => {
      renderPage({ error: 'Failed to load simulations', filtered: [] });
      expect(screen.getByTestId('error-state')).toBeInTheDocument();
      expect(screen.getByText('Failed to load simulations')).toBeInTheDocument();
    });

    it('hides SimulationGrid on error', () => {
      renderPage({ error: 'Oops', filtered: [] });
      expect(screen.queryByTestId('simulation-grid')).not.toBeInTheDocument();
    });

    it('dispatches fetchSimulationLibraryWithDetails when Retry is clicked', () => {
      renderPage({ error: 'Fetch error', filtered: [] });
      fireEvent.click(screen.getByText('Retry'));
      expect(mockDispatch).toHaveBeenCalledTimes(4); // mount: clearState + fetchMyLibrary + clearPanelFilter, retry: fetchMyLibrary
    });
  });

  describe('FilterBar interactions', () => {
    it('dispatches setActiveFilter when a filter button is clicked', async () => {
      const { setActiveFilter } =
        await import('../../../src/redux/dashboard/simulationlibrary/GetSimulationRedux');
      renderPage();
      fireEvent.click(screen.getByText('Recent'));
      expect(setActiveFilter).toHaveBeenCalledWith('recent');
      expect(mockDispatch).toHaveBeenCalled();
    });

    it('opens FilterPanel when Filters button is clicked', () => {
      renderPage();
      expect(screen.queryByTestId('filter-panel')).not.toBeInTheDocument();
      fireEvent.click(screen.getByText('Filters'));
      expect(screen.getByTestId('filter-panel')).toBeInTheDocument();
    });

    it('closes FilterPanel when Close Panel is clicked', () => {
      renderPage();
      fireEvent.click(screen.getByText('Filters'));
      fireEvent.click(screen.getByText('Close Panel'));
      expect(screen.queryByTestId('filter-panel')).not.toBeInTheDocument();
    });
  });

  describe('FilterPanel interactions', () => {
    it('dispatches applyPanelFilter when Apply is clicked', async () => {
      const { applyPanelFilter } =
        await import('../../../src/redux/dashboard/simulationlibrary/GetSimulationRedux');
      renderPage();
      fireEvent.click(screen.getByText('Filters'));
      fireEvent.click(screen.getByText('Apply'));
      expect(applyPanelFilter).toHaveBeenCalledWith(expect.any(Object));
      expect(mockDispatch).toHaveBeenCalled();
    });

    it('dispatches clearPanelFilter and closes panel when Remove is clicked', async () => {
      const { clearPanelFilter } =
        await import('../../../src/redux/dashboard/simulationlibrary/GetSimulationRedux');
      renderPage();
      fireEvent.click(screen.getByText('Filters'));
      fireEvent.click(screen.getByText('Remove'));
      expect(clearPanelFilter).toHaveBeenCalled();
      expect(mockDispatch).toHaveBeenCalled();
    });
  });

  describe('ViewToggle interactions', () => {
    it('switches current view to list when List is clicked', () => {
      renderPage();
      expect(screen.getByTestId('current-view')).toHaveTextContent('grid');
      fireEvent.click(screen.getByText('List'));
      expect(screen.getByTestId('current-view')).toHaveTextContent('list');
    });

    it('switches current view to grid when Grid is clicked', () => {
      renderPage();
      fireEvent.click(screen.getByText('List'));
      expect(screen.getByTestId('current-view')).toHaveTextContent('list');
      fireEvent.click(screen.getByText('Grid'));
      expect(screen.getByTestId('current-view')).toHaveTextContent('grid');
    });

    it('keeps rendered simulation data intact when switching views', () => {
      renderPage();
      expect(screen.getByText('Baby Sim Pro')).toBeInTheDocument();
      expect(screen.getByText('Nursing Sim')).toBeInTheDocument();

      fireEvent.click(screen.getByText('List'));
      expect(screen.getByTestId('current-view')).toHaveTextContent('list');
      expect(screen.getByText('Baby Sim Pro')).toBeInTheDocument();
      expect(screen.getByText('Nursing Sim')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Grid'));
      expect(screen.getByTestId('current-view')).toHaveTextContent('grid');
      expect(screen.getByText('Baby Sim Pro')).toBeInTheDocument();
      expect(screen.getByText('Nursing Sim')).toBeInTheDocument();
    });
  });

  describe('AddSimulationModal', () => {
    it('modal is hidden by default', () => {
      renderPage();
      expect(screen.queryByTestId('add-simulation-modal')).not.toBeInTheDocument();
    });

    it('opens AddSimulationModal when Assign Class is clicked', () => {
      renderPage();
      fireEvent.click(screen.getAllByText('Assign Class')[0]);
    });

    it('closes AddSimulationModal when Close Modal is clicked', () => {
      renderPage();
      fireEvent.click(screen.getAllByText('Assign Class')[0]);
      expect(screen.queryByTestId('add-simulation-modal')).toBeInTheDocument();
      fireEvent.click(screen.getByText('Close Modal'));
      expect(screen.queryByTestId('add-simulation-modal')).not.toBeInTheDocument();
    });
  });

  describe('Empty simulations', () => {
    it('renders SimulationGrid with no cards when filtered list is empty', () => {
      renderPage({ filtered: [] });
      expect(screen.getByTestId('simulation-grid')).toBeInTheDocument();
      expect(screen.queryByTestId('sim-card-sim-1')).not.toBeInTheDocument();
    });
  });
});
