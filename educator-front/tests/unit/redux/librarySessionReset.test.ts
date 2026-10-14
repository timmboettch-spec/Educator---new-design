import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

const apiGet = vi.fn();

vi.mock('../../../src/redux/api', () => ({
  default: {
    get: (...args: unknown[]) => apiGet(...args),
    request: vi.fn(),
  },
}));

import { LoginRequest, logout } from '../../../src/redux/auth/LoginRedux';
import simulationLibraryReducer, {
  fetchMyLibrarySimulations,
} from '../../../src/redux/dashboard/simulationlibrary/GetSimulationRedux';
import { sessionResetMiddleware } from '../../../src/redux/sessionResetMiddleware';
import myLibraryReducer, {
  fetchMyLibrary,
  selectLibraryLoaded,
  selectLibrarySimulationIds,
} from '../../../src/redux/simulation/MyLibraryRedux';
import type { AppDispatch, RootState } from '../../../src/store';

// What GET /my-library returns: one row per saved entry.
const library = (...ids: string[]) => ({
  data: {
    data: ids.map((id) => ({
      educator_id: 'educator-1',
      unit_id: 'u-1',
      scenario_id: id,
      unit: { name: 'Unit One' },
      scenario: { title: `Sim ${id}` },
    })),
  },
});

const buildStore = () => {
  const store = configureStore({
    reducer: {
      myLibrary: myLibraryReducer,
      SimulationLibrary: simulationLibraryReducer,
      simulationCatalog: (state: Record<string, unknown> = {}) => state,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().prepend(sessionResetMiddleware.middleware),
  });
  // The thunks and selectors are typed against the app's full store; this one
  // holds only the slices they use.
  return {
    store,
    dispatch: store.dispatch as AppDispatch,
    state: () => store.getState() as unknown as RootState,
  };
};

/** Serves the next library request only when `answer` is called. */
const holdNextResponse = () => {
  let answer: (value: unknown) => void = () => {};
  apiGet.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
  return (value: unknown) => answer(value);
};

describe('library state across a session change', () => {
  beforeEach(() => {
    apiGet.mockReset();
  });

  it.each([
    ['logout', () => logout()],
    ['login', () => ({ type: LoginRequest.fulfilled.type })],
  ])(
    "%s clears the previous educator's saved ids and full library",
    async (_name, sessionChange) => {
      const { dispatch, state } = buildStore();
      apiGet.mockResolvedValue(library('s1'));
      await dispatch(fetchMyLibrary());
      await dispatch(fetchMyLibrarySimulations({ skipImages: true }));
      expect(selectLibrarySimulationIds(state()).has('s1')).toBe(true);
      expect(state().SimulationLibrary.status).toBe('succeeded');

      dispatch(sessionChange());

      expect(selectLibraryLoaded(state())).toBe(false);
      expect(selectLibrarySimulationIds(state()).size).toBe(0);
      expect(state().SimulationLibrary.status).toBe('idle');
      expect(state().SimulationLibrary.responseSimulationLibrary).toBeNull();
    }
  );

  it('drops a saved-library answer to a fetch made before logout', async () => {
    const { dispatch, state } = buildStore();
    const answer = holdNextResponse();
    const oldFetch = dispatch(fetchMyLibrary());

    dispatch(logout());
    answer(library('previous-educators-sim'));
    await oldFetch;

    expect(selectLibraryLoaded(state())).toBe(false);
    expect(selectLibrarySimulationIds(state()).size).toBe(0);

    // A fetch made in the new session still applies.
    apiGet.mockResolvedValue(library('s2'));
    await dispatch(fetchMyLibrary());
    expect(selectLibrarySimulationIds(state()).has('s2')).toBe(true);
  });

  it('drops a full-library answer to a load made before logout', async () => {
    const { dispatch, state } = buildStore();
    const answer = holdNextResponse();
    const oldLoad = dispatch(fetchMyLibrarySimulations({ skipImages: true }));

    dispatch(logout());
    answer(library('previous-educators-sim'));
    await oldLoad;

    expect(state().SimulationLibrary.status).toBe('idle');
    expect(state().SimulationLibrary.responseSimulationLibrary).toBeNull();

    // A load made in the new session still applies.
    apiGet.mockResolvedValue(library('s2'));
    await dispatch(fetchMyLibrarySimulations({ skipImages: true }));
    expect(state().SimulationLibrary.status).toBe('succeeded');
  });
});
