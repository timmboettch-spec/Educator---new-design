import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

const apiRequest = vi.fn();

vi.mock('../../../src/redux/api', () => ({
  default: {
    request: (...args: unknown[]) => apiRequest(...args),
  },
}));

import { guidedPathApi } from '../../../src/redux/api/guidedPath/guidedPathApi';
import { ROLE } from '../../../src/features/auth/model/roles';

const row = (over: Record<string, unknown> = {}) => ({
  guidedPathId: 'g1',
  userId: 'u1',
  roleType: 'educator',
  state: {},
  completed: false,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...over,
});

const buildStore = () =>
  configureStore({
    reducer: { [guidedPathApi.reducerPath]: guidedPathApi.reducer },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(guidedPathApi.middleware),
  });

const cached = (store: ReturnType<typeof buildStore>) =>
  guidedPathApi.endpoints.getGuidedPath.select(ROLE.EDUCATOR)(store.getState())
    .data;

describe('guidedPathApi', () => {
  beforeEach(() => {
    apiRequest.mockReset();
  });

  it('getGuidedPath GETs /api/guided-path and unwraps the envelope', async () => {
    apiRequest.mockResolvedValue({ data: { message: 'ok', data: row() } });
    const store = buildStore();

    const result = await store.dispatch(
      guidedPathApi.endpoints.getGuidedPath.initiate(ROLE.EDUCATOR)
    );

    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/api/guided-path', method: 'GET' })
    );
    expect(result.data?.guidedPathId).toBe('g1');
  });

  it('updateGuidedPath PUTs state only, without the cache-key role', async () => {
    apiRequest.mockResolvedValueOnce({ data: { message: 'ok', data: row() } });
    const store = buildStore();
    await store.dispatch(
      guidedPathApi.endpoints.getGuidedPath.initiate(ROLE.EDUCATOR)
    );
    apiRequest.mockResolvedValue({
      data: {
        message: 'ok',
        data: row({ state: { visited: { dashboard: true } } }),
      },
    });

    await store.dispatch(
      guidedPathApi.endpoints.updateGuidedPath.initiate({
        role: ROLE.EDUCATOR,
        state: { visited: { dashboard: true } },
      })
    );

    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/guided-path',
        method: 'PUT',
        data: { state: { visited: { dashboard: true } }, completed: undefined },
      })
    );
  });

  it('updateGuidedPath PUTs completed only', async () => {
    apiRequest.mockResolvedValue({ data: { message: 'ok', data: row() } });
    const store = buildStore();

    await store.dispatch(
      guidedPathApi.endpoints.updateGuidedPath.initiate({
        role: ROLE.EDUCATOR,
        completed: true,
      })
    );

    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'PUT',
        data: { state: undefined, completed: true },
      })
    );
  });

  it('patches the cache optimistically and rolls back when the PUT fails', async () => {
    apiRequest.mockResolvedValueOnce({ data: { message: 'ok', data: row() } });
    const store = buildStore();
    await store.dispatch(
      guidedPathApi.endpoints.getGuidedPath.initiate(ROLE.EDUCATOR)
    );

    // Hold the PUT open so the optimistic value is observable.
    let rejectPut: (reason: unknown) => void = () => {};
    apiRequest.mockImplementationOnce(
      () => new Promise((_, reject) => (rejectPut = reject))
    );

    const pending = store.dispatch(
      guidedPathApi.endpoints.updateGuidedPath.initiate({
        role: ROLE.EDUCATOR,
        completed: true,
      })
    );
    await vi.waitFor(() => expect(cached(store)?.completed).toBe(true));

    rejectPut({ response: { status: 500, data: { message: 'boom' } } });
    await pending;

    await vi.waitFor(() => expect(cached(store)?.completed).toBe(false));
  });

  it('stores the PUT response in the cache without a refetch GET', async () => {
    apiRequest.mockResolvedValueOnce({ data: { message: 'ok', data: row() } });
    const store = buildStore();
    await store.dispatch(
      guidedPathApi.endpoints.getGuidedPath.initiate(ROLE.EDUCATOR)
    );
    apiRequest.mockClear();
    apiRequest.mockResolvedValue({
      data: {
        message: 'ok',
        data: row({
          state: { visited: { dashboard: true } },
          updatedAt: '2026-02-02T00:00:00Z',
        }),
      },
    });

    await store.dispatch(
      guidedPathApi.endpoints.updateGuidedPath.initiate({
        role: ROLE.EDUCATOR,
        state: { visited: { dashboard: true } },
      })
    );
    await new Promise((r) => setTimeout(r, 0));

    expect(apiRequest).toHaveBeenCalledTimes(1);
    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'PUT' })
    );
    expect(cached(store)?.updatedAt).toBe('2026-02-02T00:00:00Z');
  });

  describe('out-of-order responses', () => {
    const hold = () => {
      let resolve: (v: unknown) => void = () => {};
      apiRequest.mockImplementationOnce(
        () => new Promise((res) => (resolve = res))
      );
      return (data: Record<string, unknown>) =>
        resolve({ data: { message: 'ok', data: row(data) } });
    };

    it('a late, older PUT response does not overwrite a newer one', async () => {
      apiRequest.mockResolvedValueOnce({
        data: { message: 'ok', data: row() },
      });
      const store = buildStore();
      await store.dispatch(
        guidedPathApi.endpoints.getGuidedPath.initiate(ROLE.EDUCATOR)
      );

      const answerFirst = hold();
      const answerSecond = hold();
      const first = store.dispatch(
        guidedPathApi.endpoints.updateGuidedPath.initiate({
          role: ROLE.EDUCATOR,
          state: { visited: { dashboard: true } },
        })
      );
      const second = store.dispatch(
        guidedPathApi.endpoints.updateGuidedPath.initiate({
          role: ROLE.EDUCATOR,
          state: { visited: { dashboard: true, catalog: true } },
        })
      );

      answerSecond({
        state: { visited: { dashboard: true, catalog: true } },
        updatedAt: '2026-01-01T00:00:02Z',
      });
      await second;
      answerFirst({
        state: { visited: { dashboard: true } },
        updatedAt: '2026-01-01T00:00:01Z',
      });
      await first;

      expect(cached(store)?.state).toEqual({
        visited: { dashboard: true, catalog: true },
      });
    });

    it('a late step response does not undo a hide', async () => {
      apiRequest.mockResolvedValueOnce({
        data: { message: 'ok', data: row() },
      });
      const store = buildStore();
      await store.dispatch(
        guidedPathApi.endpoints.getGuidedPath.initiate(ROLE.EDUCATOR)
      );

      const answerStep = hold();
      const answerHide = hold();
      const step = store.dispatch(
        guidedPathApi.endpoints.updateGuidedPath.initiate({
          role: ROLE.EDUCATOR,
          state: { visited: { account: true } },
        })
      );
      const hide = store.dispatch(
        guidedPathApi.endpoints.updateGuidedPath.initiate({
          role: ROLE.EDUCATOR,
          completed: true,
        })
      );

      answerHide({
        state: { visited: { account: true } },
        completed: true,
        updatedAt: '2026-01-01T00:00:02Z',
      });
      await hide;
      answerStep({
        state: { visited: { account: true } },
        completed: false,
        updatedAt: '2026-01-01T00:00:01Z',
      });
      await step;

      expect(cached(store)?.completed).toBe(true);
    });
  });

  describe('completed cache', () => {
    const KEY = 'rw_edu_guide_completed_u1_educator';

    beforeEach(() => window.localStorage.clear());

    it('a GET with completed: true writes the key', async () => {
      apiRequest.mockResolvedValue({
        data: { message: 'ok', data: row({ completed: true }) },
      });
      await buildStore().dispatch(
        guidedPathApi.endpoints.getGuidedPath.initiate(ROLE.EDUCATOR)
      );
      expect(window.localStorage.getItem(KEY)).toBe('1');
    });

    it('a GET with completed: false does not', async () => {
      apiRequest.mockResolvedValue({ data: { message: 'ok', data: row() } });
      await buildStore().dispatch(
        guidedPathApi.endpoints.getGuidedPath.initiate(ROLE.EDUCATOR)
      );
      expect(window.localStorage.getItem(KEY)).toBeNull();
    });

    it('a successful hide PUT writes the key', async () => {
      apiRequest.mockResolvedValue({
        data: { message: 'ok', data: row({ completed: true }) },
      });
      await buildStore().dispatch(
        guidedPathApi.endpoints.updateGuidedPath.initiate({
          role: ROLE.EDUCATOR,
          completed: true,
        })
      );
      expect(window.localStorage.getItem(KEY)).toBe('1');
    });

    it('a failed hide PUT does not write the key', async () => {
      apiRequest.mockRejectedValue({
        response: { status: 500, data: { message: 'boom' } },
      });
      await buildStore().dispatch(
        guidedPathApi.endpoints.updateGuidedPath.initiate({
          role: ROLE.EDUCATOR,
          completed: true,
        })
      );
      expect(window.localStorage.getItem(KEY)).toBeNull();
    });
  });
});
