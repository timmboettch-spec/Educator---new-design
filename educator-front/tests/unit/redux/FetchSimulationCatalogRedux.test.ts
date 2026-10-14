import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiGet = vi.fn();

vi.mock('../../../src/redux/api', () => ({
  default: {
    get: (...args: unknown[]) => apiGet(...args),
    post: vi.fn(),
  },
}));

import { fetchSimulationCatalog } from '../../../src/redux/simulation/FetchSimulationCatalogRedux';
// The thunk is typed against the app's RootState, so use the real store.
import { store } from '../../../src/store';

const loadItems = async (scenarios: Record<string, unknown>[]) => {
  apiGet.mockResolvedValue({ data: { data: { scenarios, catalog: [] } } });
  await store.dispatch(fetchSimulationCatalog('en'));
  return store.getState().simulationCatalog.catalogData?.sections[0]?.items;
};

describe('fetchSimulationCatalog normalisation', () => {
  beforeEach(() => {
    apiGet.mockReset();
  });

  it('reads the required product name from productSetup.title, like the library', async () => {
    const items = await loadItems([
      { id: 's-1', title: 'Airway', productSetup: { title: 'Manikin X' } },
    ]);

    expect(items?.[0]?.productName).toBe('Manikin X');
  });

  it('falls back to the flat product name fields', async () => {
    const items = await loadItems([
      { id: 's-1', title: 'Airway', productName: 'Baby' },
      { id: 's-2', title: 'Burns', product_name: 'Adult' },
      { id: 's-3', title: 'Cardiac' },
    ]);

    expect(items?.map((item) => item.productName)).toEqual([
      'Baby',
      'Adult',
      undefined,
    ]);
  });

  it('keeps the learner level and a boolean avatarEnabled', async () => {
    const items = await loadItems([
      {
        id: 's-1',
        title: 'Airway',
        learnerLevel: 'Novice',
        avatarEnabled: true,
      },
      { id: 's-2', title: 'Burns', avatarEnabled: 'false' },
    ]);

    expect(items?.[0]).toMatchObject({
      learnerLevel: 'Novice',
      avatarEnabled: true,
    });
    // A non-boolean flag is unknown rather than truthy.
    expect(items?.[1]?.avatarEnabled).toBeUndefined();
  });
});
