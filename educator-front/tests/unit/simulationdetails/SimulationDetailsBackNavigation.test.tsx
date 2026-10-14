import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

const mockNavigate = vi.fn();
const mockGet = vi.hoisted(() => vi.fn());

vi.mock('react-router-dom', async () => {
  const actual =
    await vi.importActual<typeof import('react-router-dom')>(
      'react-router-dom'
    );
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('@/redux/config', () => ({
  default: {
    SimulationCatalogDetailAPI: 'http://mock/catalog',
  },
}));

vi.mock('axios', () => ({
  default: {
    create: () => ({
      get: mockGet,
    }),
  },
}));

vi.mock('@/components/simulation/Simulationdetail', () => ({
  default: ({
    onBack,
    backLabel,
    detailsStatus,
    onRetryDetails,
  }: {
    onBack: () => void;
    backLabel?: string;
    detailsStatus?: string;
    onRetryDetails?: () => void;
  }) => (
    <div>
      <button type="button" onClick={onBack}>
        {backLabel ?? 'Back'}
      </button>
      <output data-testid="details-status">{detailsStatus}</output>
      <button type="button" onClick={onRetryDetails}>
        Retry details
      </button>
    </div>
  ),
}));

vi.mock('@/store/hooks', () => ({
  useAppDispatch: () => vi.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({
      simulationCatalog: { selectedItem: null },
      SimulationLibrary: { responseSimulationLibrary: { data: [] } },
    }),
}));

vi.mock('@/redux/dashboard/simulationlibrary/GetSimulationRedux', () => ({
  selectSimulationLibraryData: () => [],
}));

vi.mock('@/redux/loader/loaderSlice', () => ({
  setLoading: vi.fn((payload: boolean) => ({
    type: 'loader/setLoading',
    payload,
  })),
}));

import '../../../src/i18n';
import SimulationDetail from '../../../src/pages/Simulation/simulationdetails/index';

const initialData = {
  id: 1,
  scenarioId: 'sim-123',
  title: 'Test Sim',
  image: '',
  cta: 'View',
};

function renderDetails(state: Record<string, unknown> | null) {
  const store = configureStore({
    reducer: {
      simulationCatalog: () => ({ selectedItem: null }),
      SimulationLibrary: () => ({ responseSimulationLibrary: { data: [] } }),
    },
  });

  return render(
    <Provider store={store}>
      <MemoryRouter
        initialEntries={[{ pathname: '/simulationdetails/sim-123', state }]}
      >
        <Routes>
          <Route
            path="/simulationdetails/:simulationId"
            element={<SimulationDetail />}
          />
        </Routes>
      </MemoryRouter>
    </Provider>
  );
}

function renderFromClasses() {
  const store = configureStore({
    reducer: {
      simulationCatalog: () => ({ selectedItem: null }),
      SimulationLibrary: () => ({ responseSimulationLibrary: { data: [] } }),
    },
  });

  return render(
    <Provider store={store}>
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/simulationdetails/sim-123',
            state: {
              simulationId: 'sim-123',
              fromClasses: true,
              classId: 'class-1',
              expandType: 'sims',
              initialData,
            },
          },
        ]}
      >
        <Routes>
          <Route
            path="/simulationdetails/:simulationId"
            element={<SimulationDetail />}
          />
        </Routes>
      </MemoryRouter>
    </Provider>
  );
}

describe('Simulation Details – back from Class Management', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockGet.mockReset().mockResolvedValue({ data: { data: null } });
  });

  it('navigates back to Class Management with sims list restore state', () => {
    renderFromClasses();

    fireEvent.click(screen.getByRole('button', { name: /back/i }));

    expect(mockNavigate).toHaveBeenCalledWith('/classes', {
      state: {
        classId: 'class-1',
        expandType: 'sims',
        simulationId: 'sim-123',
      },
    });
  });
});

describe('Simulation Details – back to the Simulation Library', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockGet.mockReset().mockResolvedValue({ data: { data: null } });
  });

  it('returns to the library view it came from and asks it to restore its state', () => {
    renderDetails({
      simulationId: 'sim-123',
      fromLibrary: true,
      returnTo: '/simulationlibrary?view=list&difficulty=Easy',
      initialData,
    });

    fireEvent.click(screen.getByRole('button', { name: /back/i }));

    expect(mockNavigate).toHaveBeenCalledWith(
      '/simulationlibrary?view=list&difficulty=Easy',
      { state: { restoreLibrary: true, preserveScroll: true } }
    );
  });

  it('falls back to the plain library path without a saved view', () => {
    renderDetails({ simulationId: 'sim-123', fromLibrary: true, initialData });

    fireEvent.click(screen.getByRole('button', { name: /back/i }));

    expect(mockNavigate).toHaveBeenCalledWith('/simulationlibrary', {
      state: { restoreLibrary: true, preserveScroll: true },
    });
  });
});

describe('Simulation Details – loading and unavailable states', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockGet.mockReset();
  });

  it('shows a loading state while the details load', () => {
    mockGet.mockReturnValue(new Promise(() => {}));
    renderDetails({ simulationId: 'sim-123', fromLibrary: true });

    expect(
      screen.getByRole('status', { name: 'Loading simulation details' })
    ).toBeInTheDocument();
  });

  it('shows an error with Retry that fetches again and recovers', async () => {
    mockGet.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({
      data: { data: { id: 'sim-123', title: 'Recovered Sim' } },
    });
    renderDetails({ simulationId: 'sim-123', fromLibrary: true });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Simulation not found.'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
    expect(
      await screen.findByRole('button', { name: 'Back' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('offers Back to the library from the unavailable state', async () => {
    mockGet.mockRejectedValue(new Error('network'));
    renderDetails({
      simulationId: 'sim-123',
      fromLibrary: true,
      returnTo: '/simulationlibrary?view=list',
    });

    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(mockNavigate).toHaveBeenCalledWith('/simulationlibrary?view=list', {
      state: { restoreLibrary: true, preserveScroll: true },
    });
  });
});

describe('Simulation Details – full-details status with fallback data', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockGet.mockReset();
  });

  it('renders the page at once and reports the request as loading', () => {
    mockGet.mockReturnValue(new Promise(() => {}));
    renderDetails({ simulationId: 'sim-123', fromLibrary: true, initialData });

    expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument();
    expect(screen.getByTestId('details-status')).toHaveTextContent('loading');
  });

  it('reports a failed request instead of hiding it, and Retry recovers', async () => {
    mockGet.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({
      data: { data: { id: 'sim-123', title: 'Test Sim' } },
    });
    renderDetails({ simulationId: 'sim-123', fromLibrary: true, initialData });

    await waitFor(() =>
      expect(screen.getByTestId('details-status')).toHaveTextContent('failed')
    );
    // The fallback still renders the page; no full-page error replaces it.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry details' }));
    await waitFor(() =>
      expect(screen.getByTestId('details-status')).toHaveTextContent('ready')
    );
    expect(mockGet).toHaveBeenCalledTimes(2);
  });
});
