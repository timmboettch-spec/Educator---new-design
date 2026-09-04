import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useAppDispatch } from '../store/hooks';
import { updateEducatorStatusInStore } from '../redux/educator/GetEducatorRedux';
import { logout } from '../redux/auth/LoginRedux';
import { clearAuthData } from '../utils/storage';

const SOCKET_URL = import.meta.env.VITE_API_URL ?? '';

const normalizeEducatorStatus = (value: unknown): string => {
  const raw = String(value ?? '').trim();
  const normalized = raw.toUpperCase();
  if (normalized === 'ACCEPTED' || normalized === 'REGISTERED') {
    return 'ACTIVE';
  }
  return normalized || 'ACTIVE';
};

const extractEducatorId = (payload: Record<string, unknown>): string | null => {
  const direct = payload.educatorId ?? payload.educator_id ?? payload.userId ?? payload.user_id;
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

export function useAdminNotifications(role: string | undefined, token: string | null) {
  const dispatch = useAppDispatch();
  const socketRef = useRef<Socket | null>(null);

  const isAuthSocketError = (message?: string): boolean => {
    const m = (message ?? '').toLowerCase();
    return (
      m.includes('invalid signature') ||
      m.includes('jwt malformed') ||
      m.includes('jwt expired') ||
      m.includes('invalid token')
    );
  };

  useEffect(() => {
    if (!token || !role || role === 'educator') {
      return;
    }
    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    });

    socketRef.current = socket;

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

    socket.on('educator-registered', (data?: Record<string, unknown>) => {
      try {
        if (!data) return;
        const educatorId = extractEducatorId(data);
        if (!educatorId) return;
        dispatch(updateEducatorStatusInStore({ educatorId, status: 'ACTIVE' }));
      } catch {
        // dispatch errors are non-critical
      }
    });

    socket.on('educator-status-updated', (data?: Record<string, unknown>) => {
      try {
        if (!data) return;
        const educatorId = extractEducatorId(data);
        if (!educatorId) return;
        const status = normalizeEducatorStatus(data.status);
        dispatch(updateEducatorStatusInStore({ educatorId, status }));
      } catch {
        // dispatch errors are non-critical
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, role, dispatch]);
}
