import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
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
      get: vi.fn().mockResolvedValue({ data: { data: null } }),
    }),
  },
}));

vi.mock('@/components/simulation/Simulationdetail', () => ({
  default: ({
    onBack,
    backLabel,
  }: {
    onBack: () => void;
    backLabel?: string;
  }) => (
    <div>
      <button type="button" onClick={onBack}>
        {backLabel ?? 'Back'}
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
  setLoading: vi.fn((payload: boolean) => ({ type: 'loader/setLoading', payload })),
}));

import SimulationDetail from '../../../src/pages/Simulation/simulationdetails/index';

const initialData = {
  id: 1,
  scenarioId: 'sim-123',
  title: 'Test Sim',
  image: '',
  cta: 'View',
};

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
          <Route path="/simulationdetails/:simulationId" element={<SimulationDetail />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
}

describe('Simulation Details – back from Class Management', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
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
