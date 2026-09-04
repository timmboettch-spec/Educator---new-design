import { configureStore } from '@reduxjs/toolkit';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the axios instance BEFORE importing the slice so the slice picks up
// the mock when it resolves `../api`.
const mockPost = vi.fn();
vi.mock('../../../src/redux/api', () => ({
  default: {
    post: (...args: unknown[]) => mockPost(...args),
  },
}));

import RequestMoreSeatsReducer, {
  RequestMoreSeats,
  clearRequestMoreSeatsState,
} from '../../../src/redux/educator/RequestMoreSeatsRedux';

const createStore = () =>
  configureStore({ reducer: { RequestMoreSeats: RequestMoreSeatsReducer } });

describe('RequestMoreSeatsRedux', () => {
  beforeEach(() => {
    mockPost.mockReset();
  });

  it('sends POST with requested_seats + trimmed note and marks state succeeded', async () => {
    mockPost.mockResolvedValueOnce({
      data: {
        status: 'success',
        message: 'ok',
        data: { requestedAt: '2026-01-01T00:00:00Z', cooldownSeconds: 3600 },
      },
    });

    const store = createStore();
    await store
      .dispatch(RequestMoreSeats({ requested_seats: 20, note: '  need more  ' }))
      .unwrap();

    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost.mock.calls[0][1]).toEqual({
      requested_seats: 20,
      note: 'need more',
    });
    const s = store.getState().RequestMoreSeats;
    expect(s.status).toBe('succeeded');
    expect(s.lastRequestedAt).toBe('2026-01-01T00:00:00Z');
  });

  it('omits requested_seats and note when they are absent/blank', async () => {
    mockPost.mockResolvedValueOnce({ data: { status: 'success', message: 'ok' } });
    const store = createStore();
    await store.dispatch(RequestMoreSeats({ note: '   ' })).unwrap();
    expect(mockPost.mock.calls[0][1]).toEqual({});
    expect(store.getState().RequestMoreSeats.status).toBe('succeeded');
  });

  it('surfaces backend error message on rejection', async () => {
    mockPost.mockRejectedValueOnce({
      response: { data: { message: 'Cooldown active' } },
    });
    const store = createStore();
    const result = await store.dispatch(RequestMoreSeats({}));
    expect(RequestMoreSeats.rejected.match(result)).toBe(true);
    const s = store.getState().RequestMoreSeats;
    expect(s.status).toBe('failed');
    expect(s.error).toBe('Cooldown active');
  });

  it('clearRequestMoreSeatsState resets to idle', async () => {
    mockPost.mockResolvedValueOnce({ data: { status: 'success', message: 'ok' } });
    const store = createStore();
    await store.dispatch(RequestMoreSeats({}));
    store.dispatch(clearRequestMoreSeatsState());
    const s = store.getState().RequestMoreSeats;
    expect(s.status).toBe('idle');
    expect(s.response).toBeNull();
    expect(s.error).toBeNull();
  });
});
