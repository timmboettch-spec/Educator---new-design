import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

const apiRequest = vi.fn();

vi.mock('../../../src/redux/api', () => ({
  default: {
    request: (...args: unknown[]) => apiRequest(...args),
  },
}));

import { classSimulationsApi } from '../../../src/redux/api/classSimulations/classSimulationsApi';
import {
  ClassSimulationSortField,
  type ClassSimulationListItemResDto,
} from '../../../src/redux/api/classSimulations/classSimulations.types';
import { buildClassSimulationsInfiniteArg } from '../../../src/redux/api/classSimulations/classSimulationsService';

const buildStore = () =>
  configureStore({
    reducer: {
      [classSimulationsApi.reducerPath]: classSimulationsApi.reducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(classSimulationsApi.middleware),
  });

const item = (
  overrides: Partial<ClassSimulationListItemResDto> = {}
): ClassSimulationListItemResDto => ({
  classSimulationId: 'cs-1',
  simId: 'colostomy-care',
  simName: 'Colostomy Care',
  isArchived: false,
  startDate: '2026-01-01',
  dueDate: '2026-01-15',
  closeDate: '2026-01-31',
  startedCount: 4,
  completedCount: 2,
  averageScore: 78,
  avatarEnabled: true,
  unitId: 'gastrointestinal-care',
  unitName: 'Gastrointestinal Care',
  ...overrides,
});

const page = (
  data: ClassSimulationListItemResDto[],
  pageNumber: number,
  hasNextPage: boolean
) => ({
  data: {
    message: 'Class simulations fetched successfully',
    data,
    meta: {
      total: 11,
      page: pageNumber,
      pageSize: 10,
      totalPages: 2,
      hasNextPage,
      hasPrevPage: pageNumber > 1,
    },
  },
});

describe('classSimulationsApi', () => {
  beforeEach(() => {
    apiRequest.mockReset();
  });

  it('getClassSimulationsInfinite sends the class, sort and page and returns data + meta', async () => {
    apiRequest.mockResolvedValue(page([item()], 1, true));
    const arg = buildClassSimulationsInfiniteArg(
      'class-1',
      ClassSimulationSortField.DUE_DATE,
      'desc'
    );

    const store = buildStore();
    const result = await store.dispatch(
      classSimulationsApi.endpoints.getClassSimulationsInfinite.initiate(arg)
    );

    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/class-simulations',
        method: 'GET',
        params: {
          classId: 'class-1',
          pageSize: 10,
          sortBy: 'dueDate',
          sortDir: 'desc',
          page: 1,
        },
      })
    );
    expect(result.data?.pages[0]?.data).toEqual([item()]);
    expect(result.data?.pages[0]?.meta.total).toBe(11);
    expect(result.hasNextPage).toBe(true);
  });

  it('loads the next page and stops when the BE reports no more', async () => {
    apiRequest
      .mockResolvedValueOnce(page([item()], 1, true))
      .mockResolvedValueOnce(
        page([item({ classSimulationId: 'cs-2' })], 2, false)
      );
    const arg = buildClassSimulationsInfiniteArg('class-1');

    const store = buildStore();
    await store.dispatch(
      classSimulationsApi.endpoints.getClassSimulationsInfinite.initiate(arg)
    );
    const second = await store.dispatch(
      classSimulationsApi.endpoints.getClassSimulationsInfinite.initiate(arg, {
        direction: 'forward',
      })
    );

    expect(apiRequest).toHaveBeenLastCalledWith(
      expect.objectContaining({
        params: { classId: 'class-1', pageSize: 10, page: 2 },
      })
    );
    expect(
      second.data?.pages.flatMap((p) => p.data).map((s) => s.classSimulationId)
    ).toEqual(['cs-1', 'cs-2']);
    expect(second.hasNextPage).toBe(false);
  });

  it('passes a refused request through as { status, data }', async () => {
    apiRequest.mockRejectedValue({
      response: { status: 403, data: { message: 'Insufficient role' } },
    });

    const store = buildStore();
    const result = await store.dispatch(
      classSimulationsApi.endpoints.getClassSimulationsInfinite.initiate(
        buildClassSimulationsInfiniteArg('class-1')
      )
    );

    expect(result.error).toEqual({
      status: 403,
      data: { message: 'Insufficient role' },
    });
  });

  it('refetches when the ClassSimulations tag is invalidated', async () => {
    apiRequest.mockResolvedValue(page([item()], 1, false));
    const store = buildStore();
    const sub = store.dispatch(
      classSimulationsApi.endpoints.getClassSimulationsInfinite.initiate(
        buildClassSimulationsInfiniteArg('class-1')
      )
    );
    await sub;

    store.dispatch(
      classSimulationsApi.util.invalidateTags(['ClassSimulations'])
    );

    await vi.waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(2));
    sub.unsubscribe();
  });

  describe('updateClassSimulation', () => {
    const updated = {
      id: 'cs-1',
      classId: 'class-1',
      simulationId: 'colostomy-care',
      startDate: '2026-01-01',
      dueDate: '2026-01-20',
      endDate: '2026-01-31',
    };

    it('PUTs the body to /api/class-simulations/:id and unwraps data', async () => {
      apiRequest.mockResolvedValue({
        data: {
          message: 'Class simulation updated successfully',
          data: updated,
        },
      });

      const store = buildStore();
      const result = await store.dispatch(
        classSimulationsApi.endpoints.updateClassSimulation.initiate({
          id: 'cs-1',
          body: { dueDate: '2026-01-20' },
        })
      );

      expect(apiRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/api/class-simulations/cs-1',
          method: 'PUT',
          data: { dueDate: '2026-01-20' },
        })
      );
      expect(result.data).toEqual(updated);
    });

    it('passes a refused save through as { status, data }', async () => {
      apiRequest.mockRejectedValue({
        response: {
          status: 400,
          data: { message: 'Class is archived' },
        },
      });

      const store = buildStore();
      const result = await store.dispatch(
        classSimulationsApi.endpoints.updateClassSimulation.initiate({
          id: 'cs-1',
          body: { startDate: '2026-01-02' },
        })
      );

      expect(result.error).toEqual({
        status: 400,
        data: { message: 'Class is archived' },
      });
    });

    it('refetches the assignments list after a save', async () => {
      apiRequest.mockResolvedValue(page([item()], 1, false));
      const store = buildStore();
      const sub = store.dispatch(
        classSimulationsApi.endpoints.getClassSimulationsInfinite.initiate(
          buildClassSimulationsInfiniteArg('class-1')
        )
      );
      await sub;

      apiRequest.mockResolvedValueOnce({
        data: { message: 'ok', data: updated },
      });
      await store.dispatch(
        classSimulationsApi.endpoints.updateClassSimulation.initiate({
          id: 'cs-1',
          body: { dueDate: '2026-01-20' },
        })
      );

      await vi.waitFor(() =>
        expect(apiRequest).toHaveBeenLastCalledWith(
          expect.objectContaining({
            url: '/api/class-simulations',
            method: 'GET',
          })
        )
      );
      expect(apiRequest).toHaveBeenCalledTimes(3);
      sub.unsubscribe();
    });
  });

  describe('bulkAssignClassSimulations', () => {
    const body = {
      schoolId: 'school-1',
      classIds: ['class-1', 'class-2'],
      simulationIds: ['colostomy-care'],
      startDate: '2026-09-01',
      dueDate: '2026-10-16',
      endDate: '2026-12-15',
    };
    const created = {
      total: 2,
      created: 2,
      seatsCharged: 0,
      remainingSeats: 52,
      results: [],
    };

    it('POSTs the body to /api/class-simulations/bulk and unwraps data', async () => {
      apiRequest.mockResolvedValue({
        data: { message: '2 simulation assignment(s) created.', data: created },
      });

      const store = buildStore();
      const result = await store.dispatch(
        classSimulationsApi.endpoints.bulkAssignClassSimulations.initiate(body)
      );

      expect(apiRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/api/class-simulations/bulk',
          method: 'POST',
          data: body,
        })
      );
      expect(result.data).toEqual(created);
    });

    it('passes a 422 through with the per-pair results', async () => {
      const failure = {
        message: 'One or more class/simulation pairs failed.',
        error: {
          total: 2,
          failed: 1,
          results: [
            {
              classId: 'class-1',
              simulationId: 'colostomy-care',
              status: 'FAILED',
              reason: 'ALREADY_ASSIGNED_OVERLAP',
              message: 'Already assigned for an overlapping range.',
            },
            {
              classId: 'class-2',
              simulationId: 'colostomy-care',
              status: 'VALID',
            },
          ],
        },
      };
      apiRequest.mockRejectedValue({
        response: { status: 422, data: failure },
      });

      const store = buildStore();
      const result = await store.dispatch(
        classSimulationsApi.endpoints.bulkAssignClassSimulations.initiate(body)
      );

      expect(result.error).toEqual({ status: 422, data: failure });
    });

    it('refetches the assignments list after assigning', async () => {
      apiRequest.mockResolvedValue(page([item()], 1, false));
      const store = buildStore();
      const sub = store.dispatch(
        classSimulationsApi.endpoints.getClassSimulationsInfinite.initiate(
          buildClassSimulationsInfiniteArg('class-1')
        )
      );
      await sub;

      apiRequest.mockResolvedValueOnce({
        data: { message: 'ok', data: created },
      });
      await store.dispatch(
        classSimulationsApi.endpoints.bulkAssignClassSimulations.initiate(body)
      );

      await vi.waitFor(() =>
        expect(apiRequest).toHaveBeenLastCalledWith(
          expect.objectContaining({
            url: '/api/class-simulations',
            method: 'GET',
          })
        )
      );
      expect(apiRequest).toHaveBeenCalledTimes(3);
      sub.unsubscribe();
    });
  });
});
