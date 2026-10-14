import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useAppDispatch } from '../store/hooks';
import type { AppDispatch } from '../store';
import {
  addNotification,
  fetchNotifications,
  type AppNotification,
  type NotificationType,
} from '../redux/notifications/NotificationsRedux';
import { updateEducatorStatusInStore } from '../redux/educator/GetEducatorRedux';
import { logout } from '../redux/auth/LoginRedux';
import { clearAuthData, getToken, getParsedUser } from '../utils/storage';
import { FetchClassesRequest } from '../redux/class/GetClassRedux';
import { GetEducatorSimulationReports } from '../redux/reports/EducatorReportsRedux';
import { syncEducatorProfile } from '../utils/syncEducatorProfile';
import { getEducatorId } from '../utils/normalizeAuthUser';

const EDUCATOR_REFRESH_COOLDOWN_MS = 60_000;

const refreshState: {
  running: boolean;
  needsRerun: boolean;
  lastReason: string;
  lastCompletedAt: number;
} = { running: false, needsRerun: false, lastReason: '', lastCompletedAt: 0 };

async function runEducatorRefresh(
  dispatch: AppDispatch,
  reason: string
): Promise<void> {
  refreshState.running = true;
  try {
    const parsed = getParsedUser();
    if (parsed) {
      await syncEducatorProfile(parsed);
    }
    await dispatch(FetchClassesRequest());

    const educatorId = getEducatorId(parsed);
    if (educatorId) {
      await dispatch(GetEducatorSimulationReports({ educatorId }));
    }
  } catch {
    return;
  } finally {
    refreshState.running = false;
    refreshState.lastCompletedAt = Date.now();

    if (refreshState.needsRerun) {
      refreshState.needsRerun = false;
      scheduleEducatorRefresh(dispatch, `${reason}+coalesced`);
    }
  }
}

function scheduleEducatorRefresh(dispatch: AppDispatch, reason: string): void {
  const token = getToken();
  if (!token) return;

  const tt = getTokenType(token);
  if (tt !== 'educator') return;

  if (refreshState.running) {
    refreshState.needsRerun = true;
    refreshState.lastReason = reason;
    return;
  }

  const msSinceLast = Date.now() - refreshState.lastCompletedAt;
  if (msSinceLast < EDUCATOR_REFRESH_COOLDOWN_MS) {
    return;
  }

  refreshState.lastReason = reason;
  void runEducatorRefresh(dispatch, reason);
}

const SOCKET_URL = import.meta.env.VITE_API_URL ?? '';
const NOTIFICATION_POLL_INTERVAL_MS = 30_000;
const NOTIFICATION_REFRESH_MIN_GAP_MS = 5_000;

const EVENT_TYPE_MAP: Record<string, NotificationType> = {
  'educator-registered': 'EDUCATOR_REGISTERED',
  'tokens-allocated': 'TOKENS_ALLOCATED',
  'class-created': 'CLASS_CREATED',
  'class-transferred': 'CLASS_TRANSFERRED',
  'class-transferred-source': 'CLASS_TRANSFERRED',
  'class-transferred-target': 'CLASS_TRANSFERRED',
  'class-start-date-reminder': 'CLASS_START_DATE_REMINDER',
  'class-end-date-reminder': 'CLASS_END_DATE_REMINDER',
  'educator-low-seat-warning': 'EDUCATOR_LOW_SEAT_WARNING',
  'token-low-warning': 'EDUCATOR_LOW_SEAT_WARNING',
  'low-seat-warning': 'EDUCATOR_LOW_SEAT_WARNING',
  'school-low-seat-warning': 'SCHOOL_LOW_SEAT_WARNING',
  'school-seat-low-warning': 'SCHOOL_LOW_SEAT_WARNING',
  'educator-seat-request': 'EDUCATOR_SEAT_REQUEST',
  'student-report-available': 'STUDENT_REPORT_AVAILABLE',
  'student-report-completed': 'STUDENT_REPORT_AVAILABLE',
  'lms-grade-sync-failed': 'LMS_GRADE_SYNC_FAILED',
  'simulation-start-date-reminder': 'SIMULATION_START_DATE_REMINDER',
  'simulation-due-date-reminder': 'SIMULATION_DUE_DATE_REMINDER',
  'simulation-end-date-reminder': 'SIMULATION_END_DATE_REMINDER',
  'due-date-reminder': 'SIMULATION_DUE_DATE_REMINDER',
};

const EVENT_TITLES: Record<string, string> = {
  'educator-registered': 'New Educator Registered',
  'tokens-allocated': 'AI Seats Allocated',
  'class-created': 'Class Created',
  'class-transferred': 'Class Transferred',
  'class-transferred-source': 'Class Transferred',
  'class-transferred-target': 'New Class Assigned',
  'class-start-date-reminder': 'Class Starting Soon',
  'class-end-date-reminder': 'Class Ending Soon',
  'educator-low-seat-warning': 'Low Educator Seat Warning',
  'token-low-warning': 'Low Educator Seat Warning',
  'low-seat-warning': 'Low Educator Seat Warning',
  'school-low-seat-warning': 'Low School Seat Warning',
  'school-seat-low-warning': 'Low School Seat Warning',
  'educator-seat-request': 'Educator Requested More Seats',
  'student-report-available': 'Student Reports Available',
  'student-report-completed': 'Student Reports Available',
  'lms-grade-sync-failed': 'LMS Grade Sync Failed',
  'simulation-start-date-reminder': 'Simulation Starting Soon',
  'simulation-due-date-reminder': 'Simulation Due Date Reminder',
  'simulation-end-date-reminder': 'Simulation Closing Soon',
  'due-date-reminder': 'Simulation Due Date Reminder',
};

const KNOWN_NOTIFICATION_TYPES: NotificationType[] = [
  'EDUCATOR_REGISTERED',
  'TOKENS_ALLOCATED',
  'CLASS_CREATED',
  'CLASS_TRANSFERRED',
  'EDUCATOR_LOW_SEAT_WARNING',
  'SCHOOL_LOW_SEAT_WARNING',
  'EDUCATOR_SEAT_REQUEST',
  'STUDENT_REPORT_AVAILABLE',
  'LMS_GRADE_SYNC_FAILED',
  'SIMULATION_DUE_DATE_REMINDER',
  'SIMULATION_START_DATE_REMINDER',
  'SIMULATION_END_DATE_REMINDER',
  'CLASS_START_DATE_REMINDER',
  'CLASS_END_DATE_REMINDER',
  'GENERAL',
];

function normalizeSocketNotification(
  event: string,
  data: Record<string, unknown> | undefined,
  fallbackRecipientType: 'admin' | 'educator'
): AppNotification {
  const source = data ?? {};
  const payloadType = String(source.type ?? '').toUpperCase();
  const type = KNOWN_NOTIFICATION_TYPES.includes(
    payloadType as NotificationType
  )
    ? (payloadType as NotificationType)
    : (EVENT_TYPE_MAP[event] ?? 'GENERAL');

  const title =
    (typeof source.title === 'string' && source.title.trim()) ||
    EVENT_TITLES[event] ||
    'Notification';
  const message =
    (typeof source.message === 'string' && source.message.trim()) || title;
  const metadataFromPayload =
    source.metadata && typeof source.metadata === 'object'
      ? (source.metadata as Record<string, unknown>)
      : undefined;

  const metadata = metadataFromPayload ?? source;

  return {
    id:
      (typeof source.id === 'string' && source.id.trim()) ||
      `ws-${Date.now()}-${Math.random()}`,
    type,
    title,
    message,
    recipientId:
      (typeof source.recipientId === 'string' && source.recipientId) || '',
    recipientType:
      source.recipientType === 'admin' || source.recipientType === 'educator'
        ? source.recipientType
        : fallbackRecipientType,
    isRead: Boolean(source.isRead ?? false),
    metadata,
    createdAt:
      (typeof source.createdAt === 'string' && source.createdAt) ||
      (typeof source.created_at === 'string' && source.created_at) ||
      new Date().toISOString(),
  };
}

function getTokenType(token: string): 'admin' | 'educator' | undefined {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return undefined;
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const payload = JSON.parse(atob(padded)) as { type?: string };
    if (payload.type === 'admin' || payload.type === 'educator') {
      return payload.type;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

type RoleLike = string | { role_name?: string } | undefined;

const normalizeRole = (role: RoleLike): string | undefined => {
  if (typeof role === 'string') return role.toLowerCase();
  if (role && typeof role === 'object' && typeof role.role_name === 'string') {
    return role.role_name.toLowerCase();
  }
  return undefined;
};

const normalizeEducatorStatus = (value: unknown): string => {
  const raw = String(value ?? '').trim();
  const normalized = raw.toUpperCase();
  if (normalized === 'ACCEPTED' || normalized === 'REGISTERED') {
    return 'ACTIVE';
  }
  return normalized || 'ACTIVE';
};

const extractEducatorId = (payload: Record<string, unknown>): string | null => {
  const direct =
    payload.educatorId ??
    payload.educator_id ??
    payload.userId ??
    payload.user_id;
  if (direct !== undefined && direct !== null && String(direct).trim()) {
    return String(direct).trim();
  }

  const metadata = payload.metadata;
  if (metadata && typeof metadata === 'object') {
    const m = metadata as Record<string, unknown>;
    const nested = m.educatorId ?? m.educator_id ?? m.userId ?? m.user_id;
    if (nested !== undefined && nested !== null && String(nested).trim()) {
      return String(nested).trim();
    }
  }

  return null;
};

export function useNotifications(role: RoleLike) {
  const dispatch = useAppDispatch();
  const socketRef = useRef<Socket | null>(null);
  const hasHydratedRef = useRef(false);
  const knownNotificationIdsRef = useRef<Set<string>>(new Set());
  const isRefreshingRef = useRef(false);
  const socketConnectedRef = useRef(false);
  const lastRefreshAtRef = useRef(0);

  const isAuthSocketError = (message?: string): boolean => {
    const m = (message ?? '').toLowerCase();
    return (
      m.includes('invalid signature') ||
      m.includes('jwt malformed') ||
      m.includes('jwt expired') ||
      m.includes('invalid token')
    );
  };

  const refreshNotifications = (force = false) => {
    const token = getToken();
    if (!token || isRefreshingRef.current) return;

    const now = Date.now();
    if (
      !force &&
      now - lastRefreshAtRef.current < NOTIFICATION_REFRESH_MIN_GAP_MS
    ) {
      return;
    }

    isRefreshingRef.current = true;
    lastRefreshAtRef.current = now;

    void dispatch(fetchNotifications())
      .unwrap()
      .then((list) => {
        if (!hasHydratedRef.current) {
          knownNotificationIdsRef.current = new Set(list.map((n) => n.id));
          hasHydratedRef.current = true;
          return;
        }

        list.forEach((n) => {
          knownNotificationIdsRef.current.add(n.id);
        });
      })
      .catch(() => {
        return;
      })
      .finally(() => {
        isRefreshingRef.current = false;
      });
  };

  const initializedRef = useRef(false);
  const activeRoleRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const normalizedRole = normalizeRole(role);
    if (normalizedRole !== activeRoleRef.current && initializedRef.current) {
      initializedRef.current = false;
    }
    if (initializedRef.current) return;
    const token = getToken();
    if (!token) return;
    initializedRef.current = true;
    refreshNotifications(true);
  }, [role]);

  useEffect(() => {
    const refresh = () => {
      if (!getToken()) return;
      if (document.visibilityState !== 'visible') return;
      if (isRefreshingRef.current) return;
      if (socketConnectedRef.current) return;
      refreshNotifications(true);
    };

    const intervalId = window.setInterval(
      refresh,
      NOTIFICATION_POLL_INTERVAL_MS
    );
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [dispatch]);

  useEffect(() => {
    const normalizedRole = normalizeRole(role);
    if (socketRef.current && normalizedRole !== activeRoleRef.current) {
      const stale = socketRef.current;
      stale.removeAllListeners();
      stale.disconnect();
      socketRef.current = null;
      socketConnectedRef.current = false;
    }

    if (socketRef.current) return;

    const token = getToken();
    if (!token) return;

    activeRoleRef.current = normalizedRole;

    const tokenType = getTokenType(token);
    const recipientType: 'admin' | 'educator' =
      tokenType ??
      (normalizedRole?.includes('educator') ? 'educator' : 'admin');

    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {});
    socket.on('disconnect', () => {});

    socket.on('connect_error', (error: Error) => {
      if (!isAuthSocketError(error?.message)) {
        return;
      }

      socket.io.opts.reconnection = false;
      socket.disconnect();
      clearAuthData();
      dispatch(logout());
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    });

    socket.on('connect', () => {
      socketConnectedRef.current = true;
      refreshNotifications(true);
    });

    socket.on('disconnect', () => {
      socketConnectedRef.current = false;
    });

    Object.keys(EVENT_TYPE_MAP).forEach((event) => {
      socket.on(event, (data?: Record<string, unknown>) => {
        const notification = normalizeSocketNotification(
          event,
          data,
          recipientType
        );
        dispatch(addNotification(notification));

        if (event === 'educator-registered') {
          try {
            if (!data) return;
            const educatorId = extractEducatorId(data);
            if (!educatorId) return;
            dispatch(
              updateEducatorStatusInStore({ educatorId, status: 'ACTIVE' })
            );
          } catch {
            return;
          }
        }

        if (event === 'educator-status-updated') {
          try {
            if (!data) return;
            const educatorId = extractEducatorId(data);
            if (!educatorId) return;
            const status = normalizeEducatorStatus(data.status);
            dispatch(updateEducatorStatusInStore({ educatorId, status }));
          } catch {
            return;
          }
        }
      });
    });

    socket.on('educator-school-removed', () => {
      scheduleEducatorRefresh(dispatch, 'educator-school-removed');
    });

    socket.on('educator-school-added', () => {
      scheduleEducatorRefresh(dispatch, 'educator-school-added');
    });

    socket.on('school-status-changed', () => {
      scheduleEducatorRefresh(dispatch, 'school-status-changed');
    });

    socket.on('student-report-available', () => {
      const currentToken = getToken();
      if (!currentToken || getTokenType(currentToken) !== 'educator') return;
      const parsed = getParsedUser();
      const educatorId = getEducatorId(parsed);
      if (educatorId) {
        void dispatch(GetEducatorSimulationReports({ educatorId }));
      }
    });

    return () => {
      socketConnectedRef.current = false;
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [dispatch, role]);
}
