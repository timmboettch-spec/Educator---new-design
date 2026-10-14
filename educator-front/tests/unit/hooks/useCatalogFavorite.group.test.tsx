import { act, renderHook } from '@testing-library/react';
import type { MouseEvent, ReactNode } from 'react';
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
  },
}));

vi.mock('../../../src/components/common/Toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { useCatalogFavorite } from '../../../src/hooks/useCatalogFavorite';
import { fetchSimulationCatalog } from '../../../src/redux/simulation/FetchSimulationCatalogRedux';
// The thunks are typed against the app's RootState, so use the real store.
import { store } from '../../../src/store';

const event = { stopPropagation: vi.fn() } as unknown as MouseEvent;

const catalogItems = () =>
  store.getState().simulationCatalog.catalogData?.sections[0]?.items ?? [];

const renderFavorite = () =>
  renderHook(() => useCatalogFavorite(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <Provider store={store}>{children}</Provider>
    ),
  });

describe('useCatalogFavorite group actions', () => {
  beforeEach(async () => {
    apiGet.mockReset();
    apiPost.mockReset();
    apiDelete.mockReset();
    apiGet.mockResolvedValue({
      data: {
        data: {
          catalog: [],
          scenarios: [
            { id: 's-1', title: 'Airway' },
            { id: 's-2', title: 'Burns' },
          ],
        },
      },
    });
    await store.dispatch(fetchSimulationCatalog('en'));
  });

  it('does nothing for an empty group', async () => {
    const { result } = renderFavorite();

    await act(() => result.current.handleAddGroup(event, []));

    expect(apiPost).not.toHaveBeenCalled();
    expect(apiDelete).not.toHaveBeenCalled();
  });

  it('leaves the hearts unfilled when adding a group fails', async () => {
    apiPost.mockRejectedValue(new Error('Server error'));
    const { result } = renderFavorite();

    await act(() => result.current.handleAddGroup(event, catalogItems()));

    expect(apiPost).toHaveBeenCalledTimes(1);
    expect(catalogItems().map((item) => item.myFavorite)).toEqual([
      false,
      false,
    ]);
  });
});
