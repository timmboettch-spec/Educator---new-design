import { configureStore } from '@reduxjs/toolkit';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import simulationLibraryReducer, {
  fetchMyLibrarySimulations,
} from '../../../src/redux/dashboard/simulationlibrary/GetSimulationRedux';
import api from '../../../src/redux/api';
import type { AppDispatch } from '../../../src/store';

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

  describe('image lookup', () => {
    // A library row with no image anywhere, so the catalogue lookup would run.
    const rowWithoutImage = {
      data: {
        data: [
          {
            educator_id: 'edu-1',
            unit_id: 'unit-1',
            scenario_id: 'scn-1',
            unit: { name: 'Unit' },
            scenario: { title: 'No Image Sim' },
          },
        ],
      },
    };

    const buildStore = () =>
      configureStore({
        reducer: {
          SimulationLibrary: simulationLibraryReducer,
          simulationCatalog: () => ({}),
        },
      });

    // The thunk is typed against the app's RootState; this store holds only
    // the slices it reads.
    const dispatchOn = (store: ReturnType<typeof buildStore>) =>
      store.dispatch as AppDispatch;

    it('fills missing images from the catalogue by default', async () => {
      const mockedGet = vi.mocked(api.get);
      mockedGet.mockResolvedValueOnce(rowWithoutImage);
      mockedGet.mockResolvedValue({ data: { data: [] } });

      const store = buildStore();
      await dispatchOn(store)(fetchMyLibrarySimulations());

      expect(mockedGet).toHaveBeenCalledTimes(3);
      expect(store.getState().SimulationLibrary.hasImages).toBe(true);
    });

    it('skips the catalogue requests with skipImages and records it', async () => {
      const mockedGet = vi.mocked(api.get);
      mockedGet.mockResolvedValueOnce(rowWithoutImage);

      const store = buildStore();
      await dispatchOn(store)(fetchMyLibrarySimulations({ skipImages: true }));

      expect(mockedGet).toHaveBeenCalledTimes(1);
      const state = store.getState().SimulationLibrary;
      expect(state.hasImages).toBe(false);
      expect(state.responseSimulationLibrary?.data?.[0]?.title).toBe(
        'No Image Sim'
      );
    });
  });
});
