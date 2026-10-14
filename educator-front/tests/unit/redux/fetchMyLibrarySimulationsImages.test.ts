import { configureStore } from '@reduxjs/toolkit';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiGet = vi.fn();
vi.mock('../../../src/redux/api', () => ({
  default: { get: (...args: unknown[]) => apiGet(...args) },
}));

import simulationLibraryReducer, {
  fetchMyLibrarySimulations,
} from '../../../src/redux/dashboard/simulationlibrary/GetSimulationRedux';
import config from '../../../src/redux/config';
import type { AppDispatch } from '../../../src/store';

// A saved simulation with no image anywhere: the case that triggers the
// catalogue image lookup.
const LIBRARY_WITHOUT_IMAGES = {
  data: {
    data: [
      {
        educator_id: 'edu-1',
        unit_id: 'unit-1',
        scenario_id: 'scn-1',
        unit: { name: 'Adult Health' },
        scenario: { title: 'Cardiac Arrest', difficulty: 'Easy' },
      },
    ],
  },
};

const buildStore = () => {
  const store = configureStore({
    reducer: {
      SimulationLibrary: simulationLibraryReducer,
      // No catalogue loaded yet, as when My Library is opened directly.
      simulationCatalog: (state: Record<string, unknown> = {}) => state,
    },
  });
  // The thunk is typed against the app's full store; this one holds only the
  // slices it reads.
  return { store, dispatch: store.dispatch as AppDispatch };
};

const requestedUrls = () => apiGet.mock.calls.map(([url]) => url as string);

describe('fetchMyLibrarySimulations image lookup', () => {
  beforeEach(() => {
    apiGet.mockReset();
    apiGet.mockImplementation((url: string) =>
      Promise.resolve(
        url === config.MyLibraryAPI ? LIBRARY_WITHOUT_IMAGES : { data: [] }
      )
    );
  });

  it('makes no catalogue requests with skipImages, even when images are missing', async () => {
    const { store, dispatch } = buildStore();
    await dispatch(fetchMyLibrarySimulations({ skipImages: true }));

    // Only the library itself: no catalogue route of any kind.
    expect(requestedUrls()).toEqual([config.MyLibraryAPI]);
    expect(store.getState().SimulationLibrary.hasImages).toBe(false);
  });

  it('looks images up in the catalogue without it (why callers that show no images skip it)', async () => {
    const { dispatch } = buildStore();
    await dispatch(fetchMyLibrarySimulations());

    expect(requestedUrls()).toEqual(
      expect.arrayContaining([
        config.MyLibraryAPI,
        config.SimulationCatalogScenariosAPI,
        config.SimulationCatalogDetailAPI,
      ])
    );
  });
});
