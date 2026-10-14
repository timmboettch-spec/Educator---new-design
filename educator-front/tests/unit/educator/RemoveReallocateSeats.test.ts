import { configureStore } from '@reduxjs/toolkit';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPost = vi.fn();
vi.mock('../../../src/redux/api', () => ({
  default: {
    post: (...args: unknown[]) => mockPost(...args),
  },
}));

import RemoveReallocateSeatsReducer, {
  RemoveSeats,
  ReallocateSeats,
  clearRemoveSeatsState,
  clearReallocateSeatsState,
  clearAllRemoveReallocateState,
} from '../../../src/redux/educator/RemoveReallocateSeatsRedux';

const createStore = () =>
  configureStore({
    reducer: { RemoveReallocateSeats: RemoveReallocateSeatsReducer },
  });

describe('RemoveReallocateSeatsRedux', () => {
  beforeEach(() => {
    mockPost.mockReset();
  });

  // ── RemoveSeats ────────────────────────────────────────────────────────────

  describe('RemoveSeats', () => {
    it('POSTs to the correct endpoint with amount and marks state succeeded', async () => {
      mockPost.mockResolvedValueOnce({
        data: {
          status: 'success',
          message: 'Seats removed successfully',
          data: { remainingTokens: 15 },
        },
      });

      const store = createStore();
      await store
        .dispatch(RemoveSeats({ educatorId: 'edu-123', amount: 10 }))
        .unwrap();

      expect(mockPost).toHaveBeenCalledTimes(1);
      const [url, body] = mockPost.mock.calls[0] as [
        string,
        { amount: number },
      ];
      expect(url).toContain('edu-123/remove-seats');
      expect(body).toEqual({ amount: 10 });

      const s = store.getState().RemoveReallocateSeats;
      expect(s.removeStatus).toBe('succeeded');
      expect(s.removeError).toBeNull();
    });

    it('sets removeStatus to failed and stores error message on rejection', async () => {
      mockPost.mockRejectedValueOnce({
        response: {
          data: { message: 'You can remove a maximum of 5 available tokens' },
        },
      });

      const store = createStore();
      await expect(
        store
          .dispatch(RemoveSeats({ educatorId: 'edu-123', amount: 99 }))
          .unwrap()
      ).rejects.toMatchObject({
        message: 'You can remove a maximum of 5 available tokens',
      });

      const s = store.getState().RemoveReallocateSeats;
      expect(s.removeStatus).toBe('failed');
      expect(s.removeError).toBe(
        'You can remove a maximum of 5 available tokens'
      );
    });

    it('uses fallback error message when backend provides none', async () => {
      mockPost.mockRejectedValueOnce({ response: { data: {} } });
      const store = createStore();
      await store.dispatch(RemoveSeats({ educatorId: 'edu-123', amount: 5 }));
      expect(store.getState().RemoveReallocateSeats.removeError).toBe(
        'Failed to remove seats'
      );
    });

    it('sets removeStatus to loading while the request is in flight', () => {
      mockPost.mockReturnValueOnce(new Promise(() => {}));
      const store = createStore();
      void store.dispatch(RemoveSeats({ educatorId: 'edu-abc', amount: 3 }));
      expect(store.getState().RemoveReallocateSeats.removeStatus).toBe(
        'loading'
      );
    });
  });

  // ── ReallocateSeats ────────────────────────────────────────────────────────

  describe('ReallocateSeats', () => {
    it('POSTs to the correct endpoint with target_educator_id and amount and marks state succeeded', async () => {
      mockPost.mockResolvedValueOnce({
        data: {
          status: 'success',
          message: 'Seats reallocated successfully',
          data: { sourceRemainingTokens: 12, targetRemainingTokens: 13 },
        },
      });

      const store = createStore();
      await store
        .dispatch(
          ReallocateSeats({
            sourceEducatorId: 'edu-src',
            targetEducatorId: 'edu-tgt',
            amount: 8,
          })
        )
        .unwrap();

      expect(mockPost).toHaveBeenCalledTimes(1);
      const [url, body] = mockPost.mock.calls[0] as [
        string,
        { target_educator_id: string; amount: number },
      ];
      expect(url).toContain('edu-src/reallocate-seats');
      expect(body).toEqual({ target_educator_id: 'edu-tgt', amount: 8 });

      const s = store.getState().RemoveReallocateSeats;
      expect(s.reallocateStatus).toBe('succeeded');
      expect(s.reallocateError).toBeNull();
    });

    it('sets reallocateStatus to failed on rejection', async () => {
      mockPost.mockRejectedValueOnce({
        response: {
          data: {
            message: 'You can reallocate a maximum of 20 available tokens',
          },
        },
      });

      const store = createStore();
      await expect(
        store
          .dispatch(
            ReallocateSeats({
              sourceEducatorId: 'edu-src',
              targetEducatorId: 'edu-tgt',
              amount: 99,
            })
          )
          .unwrap()
      ).rejects.toMatchObject({
        message: 'You can reallocate a maximum of 20 available tokens',
      });

      const s = store.getState().RemoveReallocateSeats;
      expect(s.reallocateStatus).toBe('failed');
    });

    it('uses fallback error message when backend provides none', async () => {
      mockPost.mockRejectedValueOnce({});
      const store = createStore();
      await store.dispatch(
        ReallocateSeats({
          sourceEducatorId: 'a',
          targetEducatorId: 'b',
          amount: 1,
        })
      );
      expect(store.getState().RemoveReallocateSeats.reallocateError).toBe(
        'Failed to reallocate seats'
      );
    });

    it('sets reallocateStatus to loading while in flight', () => {
      mockPost.mockReturnValueOnce(new Promise(() => {}));
      const store = createStore();
      void store.dispatch(
        ReallocateSeats({
          sourceEducatorId: 'a',
          targetEducatorId: 'b',
          amount: 5,
        })
      );
      expect(store.getState().RemoveReallocateSeats.reallocateStatus).toBe(
        'loading'
      );
    });
  });

  // ── Sync reducers ──────────────────────────────────────────────────────────

  describe('clearRemoveSeatsState', () => {
    it('resets only remove state', async () => {
      mockPost.mockRejectedValueOnce({
        response: { data: { message: 'err' } },
      });
      const store = createStore();
      await store.dispatch(RemoveSeats({ educatorId: 'x', amount: 1 }));
      expect(store.getState().RemoveReallocateSeats.removeStatus).toBe(
        'failed'
      );

      store.dispatch(clearRemoveSeatsState());
      const s = store.getState().RemoveReallocateSeats;
      expect(s.removeStatus).toBe('idle');
      expect(s.removeError).toBeNull();
    });
  });

  describe('clearReallocateSeatsState', () => {
    it('resets only reallocate state', async () => {
      mockPost.mockRejectedValueOnce({
        response: { data: { message: 'err' } },
      });
      const store = createStore();
      await store.dispatch(
        ReallocateSeats({
          sourceEducatorId: 'a',
          targetEducatorId: 'b',
          amount: 1,
        })
      );
      expect(store.getState().RemoveReallocateSeats.reallocateStatus).toBe(
        'failed'
      );

      store.dispatch(clearReallocateSeatsState());
      const s = store.getState().RemoveReallocateSeats;
      expect(s.reallocateStatus).toBe('idle');
      expect(s.reallocateError).toBeNull();
    });
  });

  describe('clearAllRemoveReallocateState', () => {
    it('resets both remove and reallocate state', async () => {
      mockPost
        .mockRejectedValueOnce({
          response: { data: { message: 'err-remove' } },
        })
        .mockRejectedValueOnce({
          response: { data: { message: 'err-reallocate' } },
        });

      const store = createStore();
      await store.dispatch(RemoveSeats({ educatorId: 'x', amount: 1 }));
      await store.dispatch(
        ReallocateSeats({
          sourceEducatorId: 'a',
          targetEducatorId: 'b',
          amount: 1,
        })
      );

      store.dispatch(clearAllRemoveReallocateState());
      const s = store.getState().RemoveReallocateSeats;
      expect(s.removeStatus).toBe('idle');
      expect(s.removeError).toBeNull();
      expect(s.reallocateStatus).toBe('idle');
      expect(s.reallocateError).toBeNull();
    });
  });
});
