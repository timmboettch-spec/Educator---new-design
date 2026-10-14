import type { MouseEvent, ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiGet = vi.fn();
const apiPost = vi.fn();
const apiDelete = vi.fn();

vi.mock('../../../src/redux/api', () => ({
  default: {
    get: (...args: unknown[]) => apiGet(...args),
    post: (...args: unknown[]) => apiPost(...args),
    delete: (...args: unknown[]) => apiDelete(...args),
    request: vi.fn(),
  },
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('../../../src/components/common/Toast', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

import { useCatalogFavorite } from '../../../src/hooks/useCatalogFavorite';
import myLibraryReducer, {
  fetchMyLibrary,
} from '../../../src/redux/simulation/MyLibraryRedux';
import type { SectionItem } from '../../../src/types';

// What GET /my-library returns: one row per saved entry.
const savedRow = (scenarioId: string) => ({
  educator_id: 'educator-1',
  unit_id: 'u-1',
  scenario_id: scenarioId,
  scenario: { title: `Sim ${scenarioId}` },
});

const buildStore = () =>
  configureStore({
    reducer: {
      myLibrary: myLibraryReducer,
      // Only the reducers the hook reads or writes; the catalogue's own copy
      // of the flag isn't what the hearts show.
      simulationCatalog: (state: Record<string, unknown> = {}) => state,
      Login: (state: Record<string, unknown> = {}) => state,
    },
  });

type Store = ReturnType<typeof buildStore>;

const renderFavorite = (store: Store) =>
  renderHook(() => useCatalogFavorite(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <Provider store={store}>{children}</Provider>
    ),
  });

/** A catalogue card whose `myFavorite` flag is wrong, as `/combined` sends it. */
const card = (scenarioId: string, myFavorite = false): SectionItem =>
  ({
    id: 0,
    scenarioId,
    title: `Sim ${scenarioId}`,
    unit: 'u-1',
    myFavorite,
  }) as SectionItem;

const click = { stopPropagation: () => {} } as MouseEvent;

const serveLibrary = (ids: string[]) =>
  apiGet.mockResolvedValue({ data: { data: ids.map(savedRow) } });

describe('useCatalogFavorite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a saved simulation as in the library even when the catalogue flag says no', async () => {
    serveLibrary(['s1']);
    const store = buildStore();
    await store.dispatch(fetchMyLibrary());
    const { result } = renderFavorite(store);

    expect(result.current.isInLibrary(card('s1', false))).toBe(true);
    expect(result.current.isInLibrary(card('s2', true))).toBe(false);
  });

  it('uses the catalogue flag until the library has loaded', () => {
    const { result } = renderFavorite(buildStore());
    expect(result.current.isInLibrary(card('s1', true))).toBe(true);
    expect(result.current.isInLibrary(card('s2', false))).toBe(false);
  });

  it('removes, rather than re-adds, a saved simulation the catalogue flag missed', async () => {
    serveLibrary(['s1']);
    apiDelete.mockResolvedValue({ data: {} });
    const store = buildStore();
    await store.dispatch(fetchMyLibrary());
    const { result } = renderFavorite(store);

    await act(() => result.current.handleAddSim(click, card('s1', false)));

    expect(apiPost).not.toHaveBeenCalled();
    // The config base URLs are unset in tests; the id is what matters.
    expect(apiDelete).toHaveBeenCalledWith(expect.stringMatching(/\/s1$/));
  });

  it('refreshes the saved library with a single request per click', async () => {
    serveLibrary(['s1']);
    apiDelete.mockResolvedValue({ data: {} });
    const store = buildStore();
    await store.dispatch(fetchMyLibrary());
    const { result } = renderFavorite(store);
    expect(apiGet).toHaveBeenCalledTimes(1);

    await act(() => result.current.handleAddSim(click, card('s1')));

    await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(2));
  });

  it('keeps a removal even when a fetch that started before it lands after it', async () => {
    serveLibrary(['s1', 's2']);
    apiDelete.mockResolvedValue({ data: {} });
    const store = buildStore();
    await store.dispatch(fetchMyLibrary());
    const { result } = renderFavorite(store);

    // A fetch starts (e.g. on another screen) and answers only after the
    // removal, with the library as it was before it.
    let answerOldFetch: (value: unknown) => void = () => {};
    apiGet.mockReturnValueOnce(new Promise((r) => (answerOldFetch = r)));
    let oldFetch: Promise<unknown> = Promise.resolve();
    act(() => {
      oldFetch = store.dispatch(fetchMyLibrary());
    });

    serveLibrary(['s1']);
    await act(() => result.current.handleAddSim(click, card('s2')));
    await act(async () => {
      answerOldFetch({ data: { data: ['s1', 's2'].map(savedRow) } });
      await oldFetch;
    });
    expect(result.current.isInLibrary(card('s2'))).toBe(false);

    // A fetch made after the removal confirms it; nothing is left pending.
    await act(() => store.dispatch(fetchMyLibrary()));
    expect(result.current.isInLibrary(card('s2'))).toBe(false);
    expect(store.getState().myLibrary.pendingRemoveIds).toEqual([]);
  });

  it('trusts a fetch made after a removal, even when the BE kept the simulation', async () => {
    serveLibrary(['s1', 's2']);
    apiDelete.mockResolvedValue({ data: {} });
    const store = buildStore();
    await store.dispatch(fetchMyLibrary());
    const { result } = renderFavorite(store);

    // The remove succeeds, but the BE still lists s2 afterwards.
    await act(() => result.current.handleAddGroup(click, [card('s2')]));
    await waitFor(() => expect(store.getState().myLibrary.loading).toBe(false));

    expect(result.current.isInLibrary(card('s2'))).toBe(true);
    expect(store.getState().myLibrary.pendingRemoveIds).toEqual([]);
  });

  it('shows the heart filled as soon as an add starts', async () => {
    serveLibrary([]);
    let finishAdd: (value: unknown) => void = () => {};
    apiPost.mockReturnValue(new Promise((resolve) => (finishAdd = resolve)));
    const store = buildStore();
    await store.dispatch(fetchMyLibrary());
    const { result } = renderFavorite(store);

    let adding: Promise<void> = Promise.resolve();
    act(() => {
      adding = result.current.handleAddSim(click, card('s2'));
    });
    expect(result.current.isInLibrary(card('s2'))).toBe(true);

    serveLibrary(['s2']);
    await act(async () => {
      finishAdd({ data: {} });
      await adding;
    });
    await waitFor(() =>
      expect(result.current.isInLibrary(card('s2'))).toBe(true)
    );
    expect(toastSuccess).toHaveBeenCalled();
  });

  it('treats "already exists" as added and keeps the heart filled', async () => {
    serveLibrary([]);
    apiPost.mockRejectedValue({
      response: {
        status: 409,
        data: { message: 'Simulation already exists in library' },
      },
    });
    const store = buildStore();
    await store.dispatch(fetchMyLibrary());
    const { result } = renderFavorite(store);

    serveLibrary(['s2']);
    await act(() => result.current.handleAddSim(click, card('s2')));

    await waitFor(() =>
      expect(result.current.isInLibrary(card('s2'))).toBe(true)
    );
    expect(toastError).not.toHaveBeenCalled();
    // It resyncs with what the BE actually has (beyond the first load).
    expect(apiGet.mock.calls.length).toBeGreaterThan(1);
  });

  it('puts the heart back when an add fails', async () => {
    serveLibrary([]);
    apiPost.mockRejectedValue({
      response: { status: 500, data: { message: 'Something went wrong' } },
    });
    const store = buildStore();
    await store.dispatch(fetchMyLibrary());
    const { result } = renderFavorite(store);

    await act(() => result.current.handleAddSim(click, card('s2')));

    expect(result.current.isInLibrary(card('s2'))).toBe(false);
    expect(toastError).toHaveBeenCalledWith('Something went wrong');
  });

  it('adds only the unsaved simulations of a group', async () => {
    serveLibrary(['s1']);
    apiPost.mockResolvedValue({ data: {} });
    const store = buildStore();
    await store.dispatch(fetchMyLibrary());
    const { result } = renderFavorite(store);
    const group = [card('s1', false), card('s2', false)];

    expect(result.current.isGroupInLibrary(group)).toBe(false);
    // The refresh after the add lists what the BE now holds.
    serveLibrary(['s1', 's2']);
    await act(() => result.current.handleAddGroup(click, group));

    // Only the body: the config base URLs are unset in tests.
    expect(apiPost).toHaveBeenCalledTimes(1);
    expect(apiPost.mock.calls[0]?.[1]).toEqual({ scenario_ids: ['s2'] });
    expect(result.current.isGroupInLibrary(group)).toBe(true);
  });
});
