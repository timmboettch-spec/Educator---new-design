import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

const apiRequest = vi.fn();
const apiPost = vi.fn();
const apiDelete = vi.fn();

vi.mock('../../../src/redux/api', () => ({
  default: {
    request: (...args: unknown[]) => apiRequest(...args),
    post: (...args: unknown[]) => apiPost(...args),
    delete: (...args: unknown[]) => apiDelete(...args),
  },
}));

import { myLibraryApi } from '../../../src/redux/api/myLibrary/myLibraryApi';
import simulationLibraryReducer from '../../../src/redux/dashboard/simulationlibrary/GetSimulationRedux';
import { AddToLibraryRequest } from '../../../src/redux/simulation/AddToLibraryRequestRedux';
import { AddToBulkLibraryRequest } from '../../../src/redux/simulation/AddToBulkLibraryRequestRedux';
import { RemoveFromLibraryRequest } from '../../../src/redux/simulation/RemoveFromLibraryRedux';
import { RemoveBulkLibraryRequest } from '../../../src/redux/simulation/RemoveBulkLibraryRedux';

const buildStore = () =>
  configureStore({
    reducer: {
      [myLibraryApi.reducerPath]: myLibraryApi.reducer,
      // The full library copy the assign modal uses, already loaded.
      SimulationLibrary: simulationLibraryReducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(myLibraryApi.middleware),
    preloadedState: {
      SimulationLibrary: {
        responseSimulationLibrary: { data: [], message: '', status: 'success' },
        hasImages: false,
        status: 'succeeded' as const,
        error: null,
      },
    },
  });

/** Opens the paged list, as the library page does, and counts its requests. */
const openList = async (store: ReturnType<typeof buildStore>) => {
  const sub = store.dispatch(
    myLibraryApi.endpoints.getMyLibraryInfinite.initiate({})
  );
  await sub;
  // Wrapped: an async function would unwrap the thenable subscription.
  return { unsubscribe: () => sub.unsubscribe() };
};

type Store = ReturnType<typeof buildStore>;

// Every thunk that changes what is saved in the library.
const CHANGES: [string, (store: Store) => Promise<unknown>][] = [
  [
    'adding one simulation',
    (store) =>
      store.dispatch(AddToLibraryRequest({ scenario_id: 's1', unit_id: 'u1' })),
  ],
  [
    'adding several simulations',
    (store) => store.dispatch(AddToBulkLibraryRequest({ scenarioIds: ['s1'] })),
  ],
  [
    'removing one simulation',
    (store) => store.dispatch(RemoveFromLibraryRequest({ scenario_id: 's1' })),
  ],
  [
    'removing several simulations',
    (store) =>
      store.dispatch(RemoveBulkLibraryRequest({ scenarioIds: ['s1'] })),
  ],
];

describe('library changes refresh the paged My Library list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiRequest.mockResolvedValue({
      data: {
        message: 'ok',
        data: [],
        meta: {
          total: 0,
          page: 1,
          pageSize: 24,
          totalPages: 0,
          hasNextPage: false,
          hasPrevPage: false,
        },
      },
    });
  });

  it.each(CHANGES)('%s refetches the open list', async (_name, change) => {
    apiPost.mockResolvedValue({ data: { status: 'SUCCESS' } });
    apiDelete.mockResolvedValue({ data: { status: 'SUCCESS' } });
    const store = buildStore();
    const sub = await openList(store);
    expect(apiRequest).toHaveBeenCalledTimes(1);

    await change(store);

    await vi.waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(2));
    sub.unsubscribe();
  });

  it.each(CHANGES)(
    "%s drops the assign modal's out-of-date full copy",
    async (_name, change) => {
      apiPost.mockResolvedValue({ data: { status: 'SUCCESS' } });
      apiDelete.mockResolvedValue({ data: { status: 'SUCCESS' } });
      const store = buildStore();

      await change(store);

      // Idle: the modal loads it again on its next open.
      expect(store.getState().SimulationLibrary.status).toBe('idle');
    }
  );

  it.each(CHANGES)(
    '%s that fails leaves the list alone',
    async (_name, change) => {
      apiPost.mockRejectedValue(new Error('Network Error'));
      apiDelete.mockRejectedValue(new Error('Network Error'));
      const store = buildStore();
      const sub = await openList(store);

      await change(store);

      expect(apiRequest).toHaveBeenCalledTimes(1);
      expect(store.getState().SimulationLibrary.status).toBe('succeeded');
      sub.unsubscribe();
    }
  );
});
