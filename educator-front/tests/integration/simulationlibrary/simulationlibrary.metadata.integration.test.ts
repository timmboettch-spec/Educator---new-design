import { configureStore } from '@reduxjs/toolkit';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import simulationLibraryReducer, {
  fetchMyLibrarySimulations,
} from '../../../src/redux/dashboard/simulationlibrary/GetSimulationRedux';
import api from '../../../src/redux/api';

vi.mock('../../../src/redux/api', () => ({
  default: {
    get: vi.fn(),
  },
}));

describe('Simulation library metadata retrieval integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps duration/category metadata from API payload for My Library views', async () => {
    const mockedGet = vi.mocked(api.get);

    mockedGet.mockResolvedValueOnce({
      data: {
        data: [
          {
            educator_id: 'edu-1',
            unit_id: 'unit-1',
            scenario_id: 'scn-1',
            unit: {
              name: 'UAT Unit',
              imageUrl: 'https://img.example/unit.png',
            },
            scenario: {
              title: 'UAT-Bias-Free Assessment',
              estimated_duration: '20 minutes',
              difficulty: 'Easy',
              learnerLevel: 'BSN',
              description: 'Practice communication',
              topics_addressed: 'Bias-free care',
              department: 'Med Surg',
              productSetup: { title: 'Bariatric Nursing Manikin' },
              learning_objectives: ['Objective A'],
              avatarEnabled: true,
            },
          },
        ],
      },
    });

    const store = configureStore({
      reducer: {
        SimulationLibrary: simulationLibraryReducer,
        simulationCatalog: () => ({}),
      },
    });

    await store.dispatch(fetchMyLibrarySimulations());

    const state = store.getState().SimulationLibrary;
    const sim = state.responseSimulationLibrary?.data?.[0];

    expect(sim).toBeDefined();
    expect(sim?.duration).toBe('20 minutes');
    expect(sim?.difficulty).toBe('Easy');
    expect(sim?.learnerLevel).toBe('BSN');
    expect(sim?.avatarEnabled).toBe(true);
    expect(sim?.topicsAddressed).toBe('Bias-free care');
  });
});
