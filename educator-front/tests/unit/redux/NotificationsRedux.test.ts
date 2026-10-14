import { configureStore } from '@reduxjs/toolkit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import notificationsReducer, {
  fetchNotifications,
  resetNotifications,
  selectNotifications,
  selectNotificationsStatus,
} from '@/redux/notifications/NotificationsRedux';
import type { AppDispatch, RootState } from '@/store';

const mockGet = vi.fn();

vi.mock('@/redux/api', () => ({
  default: { get: (...args: unknown[]) => mockGet(...args) },
}));

const NOTIFICATION = {
  id: 'n1',
  type: 'GENERAL',
  title: 'Hello',
  message: 'World',
  recipientId: 'r1',
  recipientType: 'educator',
  isRead: false,
  createdAt: '2026-10-01T00:00:00.000Z',
};

const makeStore = () => {
  const store = configureStore({
    reducer: { Notifications: notificationsReducer },
  });
  // Clears the module-level dedupe state left by earlier tests.
  store.dispatch(resetNotifications());
  // The thunks are typed for the app store; only their slice is needed here.
  return Object.assign(store, {
    dispatch: store.dispatch as unknown as AppDispatch,
  });
};

const state = (store: ReturnType<typeof makeStore>) =>
  store.getState() as unknown as RootState;

describe('fetchNotifications dedupe', () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it('lets an immediate retry through after a failed fetch', async () => {
    const store = makeStore();
    mockGet
      .mockRejectedValueOnce({ response: { data: { message: 'Down' } } })
      .mockResolvedValueOnce({ data: { data: [NOTIFICATION] } });

    await store.dispatch(fetchNotifications());
    expect(selectNotificationsStatus(state(store))).toBe('failed');

    await store.dispatch(fetchNotifications());

    expect(mockGet).toHaveBeenCalledTimes(2);
    expect(selectNotificationsStatus(state(store))).toBe('succeeded');
    expect(selectNotifications(state(store))).toHaveLength(1);
  });

  it('still skips a repeat fetch straight after a successful one', async () => {
    const store = makeStore();
    mockGet.mockResolvedValue({ data: { data: [NOTIFICATION] } });

    await store.dispatch(fetchNotifications());
    await store.dispatch(fetchNotifications());

    expect(mockGet).toHaveBeenCalledTimes(1);
  });
});
