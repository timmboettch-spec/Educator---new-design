import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

const apiRequest = vi.fn();

vi.mock('../../../src/redux/api', () => ({
  default: {
    request: (...args: unknown[]) => apiRequest(...args),
  },
}));

import {
  invalidateMyLibraryList,
  myLibraryApi,
} from '../../../src/redux/api/myLibrary/myLibraryApi';
import {
  LibraryLearnerLevel,
  LibraryModality,
  type MyLibraryItemResDto,
} from '../../../src/redux/api/myLibrary/myLibrary.types';

const buildStore = () =>
  configureStore({
    reducer: { [myLibraryApi.reducerPath]: myLibraryApi.reducer },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(myLibraryApi.middleware),
  });

const meta = (page: number, hasNextPage: boolean) => ({
  total: 30,
  page,
  pageSize: 24,
  totalPages: 2,
  hasNextPage,
  hasPrevPage: page > 1,
});

const item = (id: string, title: string): MyLibraryItemResDto => ({
  id: `entry-${id}`,
  unitId: 'adult-health',
  unit: {
    id: 'adult-health',
    name: 'Adult Health',
    imageUrl: 'https://cdn/unit.png',
  },
  scenario: {
    id,
    title,
    description: 'About it',
    learnerLevel: 'BSN',
    difficulty: 'Easy',
    avatarEnabled: true,
    estimatedDuration: '15-20 minutes',
    timeAllotment: null,
    scenarioImage: null,
    productName: null,
    clinicalSetting: 'Medical-Surgical Unit',
    learningObjectives: ['Recognise cardiac arrest'],
  },
});

const LIST_URL = '/api/educator-simulations/my-library/list';

describe('myLibraryApi.getMyLibraryInfinite', () => {
  beforeEach(() => {
    apiRequest.mockReset();
  });

  it('requests page 1 of the list, then the next page from meta', async () => {
    apiRequest
      .mockResolvedValueOnce({
        data: {
          message: 'ok',
          data: [item('s1', 'Airway')],
          meta: meta(1, true),
        },
      })
      .mockResolvedValueOnce({
        data: {
          message: 'ok',
          data: [item('s2', 'Burns')],
          meta: meta(2, false),
        },
      });

    const store = buildStore();
    const first = await store.dispatch(
      myLibraryApi.endpoints.getMyLibraryInfinite.initiate({})
    );
    expect(apiRequest).toHaveBeenLastCalledWith(
      expect.objectContaining({
        url: LIST_URL,
        method: 'GET',
        params: { pageSize: 24, page: 1 },
      })
    );
    expect(first.hasNextPage).toBe(true);

    const second = await store.dispatch(
      myLibraryApi.endpoints.getMyLibraryInfinite.initiate(
        {},
        { direction: 'forward' }
      )
    );
    expect(apiRequest).toHaveBeenLastCalledWith(
      expect.objectContaining({ params: { pageSize: 24, page: 2 } })
    );
    expect(second.data?.pages.flatMap((p) => p.data).map((s) => s.id)).toEqual([
      's1',
      's2',
    ]);
    expect(second.data?.pages[0]?.meta.total).toBe(30);
    expect(second.hasNextPage).toBe(false);
  });

  it('sends filters as repeated keys and never a language param', async () => {
    apiRequest.mockResolvedValue({
      data: { message: 'ok', data: [], meta: meta(1, false) },
    });

    const store = buildStore();
    await store.dispatch(
      myLibraryApi.endpoints.getMyLibraryInfinite.initiate({
        search: 'cardiac',
        learnerLevel: [LibraryLearnerLevel.SECONDARY],
        modality: [LibraryModality.AVATAR, LibraryModality.WORKSTATION],
        productName: ['Knee Set, Large'],
        unitId: ['adult-health'],
      })
    );

    const [args] = apiRequest.mock.calls[0] as [Record<string, unknown>];
    expect(args).toEqual(
      expect.objectContaining({
        url: LIST_URL,
        params: {
          pageSize: 24,
          search: 'cardiac',
          learnerLevel: ['Secondary'],
          modality: ['Avatar', 'Workstation'],
          productName: ['Knee Set, Large'],
          unitId: ['adult-health'],
          page: 1,
        },
        paramsSerializer: { indexes: null },
      })
    );
    expect(args.params).not.toHaveProperty('ls');
  });

  it('maps each item to the simulation shape the library renders', async () => {
    apiRequest.mockResolvedValue({
      data: {
        message: 'ok',
        data: [item('s1', 'Airway')],
        meta: meta(1, false),
      },
    });

    const store = buildStore();
    const result = await store.dispatch(
      myLibraryApi.endpoints.getMyLibraryInfinite.initiate({})
    );

    expect(result.data?.pages[0]?.data[0]).toEqual(
      expect.objectContaining({
        id: 's1',
        simulation_id: 's1',
        title: 'Airway',
        unit: 'adult-health',
        unit_name: 'Adult Health',
        image: 'https://cdn/unit.png',
        duration: '15-20 minutes',
        learnerLevel: 'BSN',
        targetAudience: 'BSN',
        avatarEnabled: true,
        clinicalSetting: 'Medical-Surgical Unit',
        learningObjectives: ['Recognise cardiac arrest'],
      })
    );
  });

  it('refetches an open list when the library changes elsewhere', async () => {
    apiRequest.mockResolvedValue({
      data: { message: 'ok', data: [], meta: meta(1, false) },
    });
    const store = buildStore();
    const sub = store.dispatch(
      myLibraryApi.endpoints.getMyLibraryInfinite.initiate({})
    );
    await sub;
    expect(apiRequest).toHaveBeenCalledTimes(1);

    store.dispatch(invalidateMyLibraryList());

    await vi.waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(2));
    sub.unsubscribe();
  });
});

describe('myLibraryApi filter dropdowns', () => {
  beforeEach(() => {
    apiRequest.mockReset();
  });

  const dropdownMeta = (page: number, hasNextPage: boolean) => ({
    total: 3,
    page,
    pageSize: 100,
    totalPages: hasNextPage ? 2 : 1,
    hasNextPage,
    hasPrevPage: page > 1,
  });

  const ARG = { pageSize: 100, search: 'nurse' };

  /** Answers page 1 with `rows` (and more to come), then an empty last page. */
  const serveTwoPages = (rows: unknown[]) =>
    apiRequest
      .mockResolvedValueOnce({
        data: { message: 'ok', data: rows, meta: dropdownMeta(1, true) },
      })
      .mockResolvedValueOnce({
        data: { message: 'ok', data: [], meta: dropdownMeta(2, false) },
      });

  const expectRequested = (url: string, page: number) =>
    expect(apiRequest).toHaveBeenLastCalledWith(
      expect.objectContaining({
        url,
        method: 'GET',
        params: { pageSize: 100, search: 'nurse', page },
      })
    );

  it('Unit options: requests the units page by page with the search', async () => {
    const url = '/api/units/my-library/dropdown';
    const rows = [{ id: 'adult-health', name: 'Adult Health' }];
    serveTwoPages(rows);
    const store = buildStore();
    const { initiate } = myLibraryApi.endpoints.getMyLibraryUnitOptionsInfinite;

    const first = await store.dispatch(initiate(ARG));
    expectRequested(url, 1);
    expect(first.data?.pages[0]?.data).toEqual(rows);
    expect(first.hasNextPage).toBe(true);

    await store.dispatch(initiate(ARG, { direction: 'forward' }));
    expectRequested(url, 2);
  });

  it('Target Audience options: requests them page by page with the search', async () => {
    const url = '/api/simulations/target-audiences/my-library/dropdown';
    serveTwoPages(['Registered Nurse']);
    const store = buildStore();
    const { initiate } =
      myLibraryApi.endpoints.getMyLibraryTargetAudienceOptionsInfinite;

    const first = await store.dispatch(initiate(ARG));
    expectRequested(url, 1);
    expect(first.data?.pages[0]?.data).toEqual(['Registered Nurse']);

    await store.dispatch(initiate(ARG, { direction: 'forward' }));
    expectRequested(url, 2);
  });

  it('Required Product Name options: requests them page by page with the search', async () => {
    const url = '/api/simulations/product-names/my-library/dropdown';
    serveTwoPages(['Sim Mannequin Pro']);
    const store = buildStore();
    const { initiate } =
      myLibraryApi.endpoints.getMyLibraryProductNameOptionsInfinite;

    const first = await store.dispatch(initiate(ARG));
    expectRequested(url, 1);
    expect(first.data?.pages[0]?.data).toEqual(['Sim Mannequin Pro']);

    await store.dispatch(initiate(ARG, { direction: 'forward' }));
    expectRequested(url, 2);
  });

  it('refetches open dropdown options when the library changes elsewhere', async () => {
    apiRequest.mockResolvedValue({
      data: { message: 'ok', data: [], meta: dropdownMeta(1, false) },
    });
    const store = buildStore();
    const sub = store.dispatch(
      myLibraryApi.endpoints.getMyLibraryUnitOptionsInfinite.initiate({
        pageSize: 100,
      })
    );
    await sub;
    expect(apiRequest).toHaveBeenCalledTimes(1);

    store.dispatch(invalidateMyLibraryList());

    await vi.waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(2));
    sub.unsubscribe();
  });
});
