import {
  createAsyncThunk,
  createSlice,
  type PayloadAction,
} from '@reduxjs/toolkit';
import type { RootState } from '../../store';
import { FAILED, IDLE, LOADING, SUCCEEDED } from '../../utils/constants';
import config from '../config';
import api from '../api';

// ── Types ──────────────────────────────────────────────────────────────────

export type NotificationType =
  | 'EDUCATOR_REGISTERED'
  | 'TOKENS_ALLOCATED'
  | 'CLASS_CREATED'
  | 'CLASS_TRANSFERRED'
  | 'EDUCATOR_LOW_SEAT_WARNING'
  | 'SCHOOL_LOW_SEAT_WARNING'
  | 'EDUCATOR_SEAT_REQUEST'
  | 'STUDENT_REPORT_AVAILABLE'
  | 'LMS_GRADE_SYNC_FAILED'
  | 'SIMULATION_DUE_DATE_REMINDER'
  | 'SIMULATION_START_DATE_REMINDER'
  | 'SIMULATION_END_DATE_REMINDER'
  | 'CLASS_START_DATE_REMINDER'
  | 'CLASS_END_DATE_REMINDER'
  | 'SCHOOL_STATUS_CHANGED'
  | 'SCHOOL_REMOVED'
  | 'EMAIL_REPORT'
  | 'ASSESSMENT_REPORT'
  | 'BATCH_EMAIL'
  | 'SEND_STUDENT_CODE'
  | 'ACCOUNT_REACTIVATED'
  | 'FORGOT_PASSWORD'
  | 'INVITE'
  | 'GENERAL';

export type NotificationChannel = 'IN_APP' | 'EMAIL';
export type NotificationFrequency =
  'IMMEDIATE' | 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'NEVER';

export interface NotificationPreference {
  id?: string;
  notificationType: NotificationType;
  channel: NotificationChannel;
  enabled: boolean;
  frequency?: NotificationFrequency;
}

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  recipientId: string;
  recipientType: 'admin' | 'educator';
  isRead: boolean;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

interface NotificationsState {
  notifications: AppNotification[];
  unreadCount: number;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
  lastFetchedAt: number | null;
  preferences: NotificationPreference[];
  preferencesStatus: 'idle' | 'loading' | 'succeeded' | 'failed';
}

const initialState: NotificationsState = {
  notifications: [],
  unreadCount: 0,
  status: IDLE,
  error: null,
  lastFetchedAt: null,
  preferences: [],
  preferencesStatus: IDLE,
};

const NOTIFICATIONS_FETCH_DEDUPE_WINDOW_MS = 5000;
let inFlightFetchNotifications: Promise<AppNotification[]> | null = null;
// Module-scoped timestamp of the last kicked-off fetch.  Reset to 0 by
// `resetNotifications` so a role switch (which clears the slice) is never
// silently short-circuited by the dedupe window and the new role always gets
// a fresh network request.
let lastFetchStartedAt = 0;

const selectNotificationsState = (state: RootState): NotificationsState =>
  (state as RootState & { Notifications?: NotificationsState }).Notifications ??
  initialState;

type ApiEnvelope<T> = {
  data?: T;
  message?: string;
  status?: string;
};

type RawNotification = Partial<AppNotification> & {
  recipient_id?: string;
  recipient_type?: 'admin' | 'educator';
  is_read?: boolean;
  created_at?: string;
};

const unwrapApiData = <T>(payload: unknown): T => {
  if (
    payload &&
    typeof payload === 'object' &&
    'data' in (payload as Record<string, unknown>)
  ) {
    return (payload as ApiEnvelope<T>).data as T;
  }
  return payload as T;
};

const normalizeNotification = (item: RawNotification): AppNotification => ({
  id: String(item.id ?? ''),
  type: (item.type ?? 'GENERAL') as NotificationType,
  title: String(item.title ?? 'Notification'),
  message: String(item.message ?? ''),
  recipientId: String(item.recipientId ?? item.recipient_id ?? ''),
  recipientType:
    String(
      item.recipientType ?? item.recipient_type ?? 'admin'
    ).toLowerCase() === 'educator'
      ? 'educator'
      : 'admin',
  isRead: Boolean(item.isRead ?? item.is_read ?? false),
  metadata: item.metadata,
  createdAt: String(
    item.createdAt ?? item.created_at ?? new Date().toISOString()
  ),
});

// ── Thunks ─────────────────────────────────────────────────────────────────

export const fetchNotifications = createAsyncThunk<
  AppNotification[],
  void,
  { rejectValue: { message: string }; state: RootState }
>(
  'notifications/fetchAll',
  async (_, thunkAPI) => {
    try {
      if (!inFlightFetchNotifications) {
        inFlightFetchNotifications = (async () => {
          const res = await api.get(config.NotificationsAPI);
          const list = unwrapApiData<RawNotification[]>(res.data);
          return Array.isArray(list) ? list.map(normalizeNotification) : [];
        })();
      }

      return await inFlightFetchNotifications;
    } catch (err: unknown) {
      // The dedupe window collapses in-flight and just-succeeded fetches; a
      // failure mustn't block the next attempt (e.g. an immediate Retry).
      lastFetchStartedAt = 0;
      const error = err as { response?: { data?: { message?: string } } };
      return thunkAPI.rejectWithValue({
        message:
          error.response?.data?.message ?? 'Failed to fetch notifications',
      });
    } finally {
      inFlightFetchNotifications = null;
    }
  },
  {
    condition: (_, { getState }) => {
      const state = getState();
      const notifications = selectNotificationsState(state);

      if (notifications.status === LOADING) {
        return false;
      }

      const now = Date.now();

      if (
        lastFetchStartedAt &&
        now - lastFetchStartedAt < NOTIFICATIONS_FETCH_DEDUPE_WINDOW_MS
      ) {
        return false;
      }

      lastFetchStartedAt = now;

      return true;
    },
  }
);

export const fetchUnreadCount = createAsyncThunk<
  number,
  void,
  { rejectValue: { message: string } }
>('notifications/fetchUnreadCount', async (_, thunkAPI) => {
  try {
    const res = await api.get(`${config.NotificationsAPI}/unread-count`);
    const payload = unwrapApiData<{ count?: number }>(res.data) ?? {};
    return Number(payload.count ?? 0);
  } catch (err: unknown) {
    const error = err as { response?: { data?: { message?: string } } };
    return thunkAPI.rejectWithValue({
      message: error.response?.data?.message ?? 'Failed to fetch unread count',
    });
  }
});

export const markNotificationRead = createAsyncThunk<
  AppNotification,
  string,
  { rejectValue: { message: string } }
>('notifications/markRead', async (id, thunkAPI) => {
  try {
    const res = await api.patch(`${config.NotificationsAPI}/${id}/read`);
    const payload = unwrapApiData<RawNotification>(res.data);
    return normalizeNotification(payload ?? {});
  } catch (err: unknown) {
    const error = err as { response?: { data?: { message?: string } } };
    return thunkAPI.rejectWithValue({
      message: error.response?.data?.message ?? 'Failed to mark as read',
    });
  }
});

export const markNotificationUnread = createAsyncThunk<
  AppNotification,
  string,
  { rejectValue: { message: string } }
>('notifications/markUnread', async (id, thunkAPI) => {
  try {
    const res = await api.patch(`${config.NotificationsAPI}/${id}/unread`);
    const payload = unwrapApiData<RawNotification>(res.data);
    return normalizeNotification(payload ?? {});
  } catch (err: unknown) {
    const error = err as { response?: { data?: { message?: string } } };
    return thunkAPI.rejectWithValue({
      message: error.response?.data?.message ?? 'Failed to mark as unread',
    });
  }
});

export const markAllNotificationsRead = createAsyncThunk<
  { updated: number },
  void,
  { rejectValue: { message: string } }
>('notifications/markAllRead', async (_, thunkAPI) => {
  try {
    const res = await api.patch(`${config.NotificationsAPI}/read-all`);
    return res.data as { updated: number };
  } catch (err: unknown) {
    const error = err as { response?: { data?: { message?: string } } };
    return thunkAPI.rejectWithValue({
      message: error.response?.data?.message ?? 'Failed to mark all as read',
    });
  }
});

export const markAllNotificationsUnread = createAsyncThunk<
  { updated: number },
  void,
  { rejectValue: { message: string } }
>('notifications/markAllUnread', async (_, thunkAPI) => {
  try {
    const res = await api.patch(`${config.NotificationsAPI}/unread-all`);
    return res.data as { updated: number };
  } catch (err: unknown) {
    const error = err as { response?: { data?: { message?: string } } };
    return thunkAPI.rejectWithValue({
      message: error.response?.data?.message ?? 'Failed to mark all as unread',
    });
  }
});

export const deleteNotification = createAsyncThunk<
  string,
  string,
  { rejectValue: { message: string } }
>('notifications/deleteOne', async (id, thunkAPI) => {
  try {
    await api.delete(`${config.NotificationsAPI}/${id}`);
    return id;
  } catch (err: unknown) {
    const error = err as { response?: { data?: { message?: string } } };
    return thunkAPI.rejectWithValue({
      message: error.response?.data?.message ?? 'Failed to delete notification',
    });
  }
});

export const clearAllNotifications = createAsyncThunk<
  void,
  void,
  { rejectValue: { message: string } }
>('notifications/clearAll', async (_, thunkAPI) => {
  try {
    await api.delete(config.NotificationsAPI);
  } catch (err: unknown) {
    const error = err as { response?: { data?: { message?: string } } };
    return thunkAPI.rejectWithValue({
      message: error.response?.data?.message ?? 'Failed to clear notifications',
    });
  }
});

let inFlightFetchPreferences: Promise<NotificationPreference[]> | null = null;

export const fetchPreferences = createAsyncThunk<
  NotificationPreference[],
  void,
  { rejectValue: { message: string }; state: RootState }
>(
  'notifications/fetchPreferences',
  async (_, thunkAPI) => {
    try {
      if (!inFlightFetchPreferences) {
        inFlightFetchPreferences = (async () => {
          const res = await api.get(`${config.NotificationsAPI}/preferences`);
          return (res.data as NotificationPreference[]) ?? [];
        })();
      }
      return await inFlightFetchPreferences;
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      return thunkAPI.rejectWithValue({
        message: error.response?.data?.message ?? 'Failed to fetch preferences',
      });
    } finally {
      inFlightFetchPreferences = null;
    }
  },
  {
    condition: (_, { getState }) => {
      const state = getState();
      const s = selectNotificationsState(state);
      return s.preferencesStatus !== 'loading';
    },
  }
);

export const savePreferences = createAsyncThunk<
  NotificationPreference[],
  NotificationPreference[],
  { rejectValue: { message: string } }
>('notifications/savePreferences', async (preferences, thunkAPI) => {
  try {
    const res = await api.put(`${config.NotificationsAPI}/preferences`, {
      preferences,
    });
    return (res.data as NotificationPreference[]) ?? [];
  } catch (err: unknown) {
    const error = err as { response?: { data?: { message?: string } } };
    return thunkAPI.rejectWithValue({
      message: error.response?.data?.message ?? 'Failed to save preferences',
    });
  }
});

// ── Slice ──────────────────────────────────────────────────────────────────

const countUnread = (list: AppNotification[]): number =>
  list.filter((n) => !n.isRead).length;

const notificationsSlice = createSlice({
  name: 'notifications',
  initialState,
  reducers: {
    /** Push a real-time notification; removes any existing entry with the same ID first so consolidated updates surface at the top */
    addNotification(state, action: PayloadAction<AppNotification>) {
      state.notifications = state.notifications.filter(
        (n) => n.id !== action.payload.id
      );
      state.notifications.unshift(action.payload);
      state.unreadCount = countUnread(state.notifications);
    },
    /** Reset all notification state on role switch so the new role starts clean */
    resetNotifications(state) {
      state.notifications = [];
      state.unreadCount = 0;
      state.status = IDLE;
      state.error = null;
      state.lastFetchedAt = null;
      // Also clear the module-scoped dedupe timestamp and abandon any in-flight
      // request so the very next fetch (for the newly active role) is not
      // silently dropped by the 5-second dedupe window.
      lastFetchStartedAt = 0;
      inFlightFetchNotifications = null;
    },
  },
  extraReducers: (builder) => {
    // fetch
    builder.addCase(fetchNotifications.pending, (state) => {
      state.status = LOADING;
    });
    builder.addCase(fetchNotifications.fulfilled, (state, action) => {
      state.status = SUCCEEDED;
      state.notifications = action.payload;
      state.unreadCount = countUnread(action.payload);
      state.lastFetchedAt = Date.now();
    });
    builder.addCase(fetchNotifications.rejected, (state, action) => {
      state.status = FAILED;
      state.error = action.payload?.message ?? 'Error';
    });

    builder.addCase(fetchUnreadCount.fulfilled, (state, action) => {
      state.unreadCount = action.payload;
    });

    // mark one read
    builder.addCase(markNotificationRead.fulfilled, (state, action) => {
      const idx = state.notifications.findIndex(
        (n) => n.id === action.payload.id
      );
      if (idx !== -1) state.notifications[idx] = action.payload;
      state.unreadCount = countUnread(state.notifications);
    });

    // mark one unread
    builder.addCase(markNotificationUnread.fulfilled, (state, action) => {
      const idx = state.notifications.findIndex(
        (n) => n.id === action.payload.id
      );
      if (idx !== -1) state.notifications[idx] = action.payload;
      state.unreadCount = countUnread(state.notifications);
    });

    // mark all read
    builder.addCase(markAllNotificationsRead.fulfilled, (state) => {
      state.notifications.forEach((n) => {
        n.isRead = true;
      });
      state.unreadCount = 0;
    });

    // mark all unread
    builder.addCase(markAllNotificationsUnread.fulfilled, (state) => {
      state.notifications.forEach((n) => {
        n.isRead = false;
      });
      state.unreadCount = state.notifications.length;
    });

    // delete one
    builder.addCase(deleteNotification.fulfilled, (state, action) => {
      state.notifications = state.notifications.filter(
        (n) => n.id !== action.payload
      );
      state.unreadCount = countUnread(state.notifications);
    });

    // clear all
    builder.addCase(clearAllNotifications.fulfilled, (state) => {
      state.notifications = [];
      state.unreadCount = 0;
    });

    // preferences
    builder.addCase(fetchPreferences.pending, (state) => {
      state.preferencesStatus = LOADING;
    });
    builder.addCase(fetchPreferences.fulfilled, (state, action) => {
      state.preferencesStatus = SUCCEEDED;
      state.preferences = action.payload;
    });
    builder.addCase(fetchPreferences.rejected, (state) => {
      state.preferencesStatus = FAILED;
    });
    builder.addCase(savePreferences.fulfilled, (state, action) => {
      // Merge saved rows back into preferences
      action.payload.forEach((saved) => {
        const idx = state.preferences.findIndex(
          (p) =>
            p.notificationType === saved.notificationType &&
            p.channel === saved.channel
        );
        if (idx !== -1) state.preferences[idx] = saved;
        else state.preferences.push(saved);
      });
    });
  },
});

export const { addNotification, resetNotifications } =
  notificationsSlice.actions;
export default notificationsSlice.reducer;

// ── Selectors ──────────────────────────────────────────────────────────────

export const selectNotifications = (state: RootState) =>
  selectNotificationsState(state).notifications;
export const selectUnreadCount = (state: RootState) =>
  selectNotificationsState(state).unreadCount;
export const selectNotificationsStatus = (state: RootState) =>
  selectNotificationsState(state).status;
export const selectPreferences = (state: RootState) =>
  selectNotificationsState(state).preferences;
export const selectPreferencesStatus = (state: RootState) =>
  selectNotificationsState(state).preferencesStatus;
