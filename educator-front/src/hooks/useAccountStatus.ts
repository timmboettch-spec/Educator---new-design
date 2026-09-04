import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { getParsedUser } from '../utils/storage';
import { forceLogout, LOGOUT_MESSAGES, registerSocketDisconnect, unregisterSocketDisconnect } from '../utils/forceLogout';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? import.meta.env.VITE_API_URL ?? '';

export const SCHOOL_STATUS_CHANNEL = 'school_status_channel';
export const ACCOUNT_STATUS_CHANNEL = 'account_status_channel';

export interface AccountStatusMessage {
  type: 'account-deactivated';
}

export interface SchoolStatusMessage {
  type: 'school-deactivated' | 'school_inactivated';
  schoolId: string;
}

function getStoredEducatorSchoolIds(): string[] {
  try {
    const user = getParsedUser();
    if (!user) return [];
    const schools = user.schools;
    if (Array.isArray(schools) && schools.length > 0) {
      return (schools as Array<Record<string, unknown>>)
        .map((s) => (s.id as string) || '')
        .filter(Boolean);
    }
    const school = user.school;
    if (!school) return [];
    if (typeof school === 'string') return [school];
    if (typeof school === 'object') {
      const s = school as Record<string, unknown>;
      const id = (s.id as string) || (s.school_id as string) || '';
      return id ? [id] : [];
    }
    return [];
  } catch {
    return [];
  }
}

export function useAccountStatus(role: string | undefined, token: string | null) {
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
    if (!token || role !== 'educator') {
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
    registerSocketDisconnect(() => socket.disconnect());

    socket.on('connect_error', (error: Error) => {
      
      
      if (!isAuthSocketError(error?.message)) {
        return;
      }

      socket.io.opts.reconnection = false;
      socket.disconnect();
      forceLogout(LOGOUT_MESSAGES.SESSION_EXPIRED);
    });

    socket.on('account-deactivated', () => {
      try {
        const bc = new BroadcastChannel(ACCOUNT_STATUS_CHANNEL);
        bc.postMessage({ type: 'account-deactivated' } satisfies AccountStatusMessage);
        bc.close();
      } catch {
        return;
      }
      forceLogout(LOGOUT_MESSAGES.ACCOUNT_DEACTIVATED);
    });

    let accountChannel: BroadcastChannel | null = null;
    try {
      accountChannel = new BroadcastChannel(ACCOUNT_STATUS_CHANNEL);
      accountChannel.onmessage = (e: MessageEvent<AccountStatusMessage>) => {
        if (e.data?.type === 'account-deactivated') {
          forceLogout(LOGOUT_MESSAGES.ACCOUNT_DEACTIVATED);
        }
      };
    } catch {
      return;
    }

    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(SCHOOL_STATUS_CHANNEL);
      channel.onmessage = (e: MessageEvent<SchoolStatusMessage>) => {
        try {
          const type = e.data?.type;
          if (type !== 'school-deactivated' && type !== 'school_inactivated') return;
          const userSchoolIds = getStoredEducatorSchoolIds();
          if (!userSchoolIds.length || !userSchoolIds.includes(e.data.schoolId)) return;

          forceLogout(
            type === 'school_inactivated'
              ? LOGOUT_MESSAGES.SCHOOL_INACTIVE
              : LOGOUT_MESSAGES.SCHOOL_DEACTIVATED,
          );
        } catch {
          return;
        }
      };
    } catch { 
      return;
    }
    return () => {
      unregisterSocketDisconnect();
      socket.disconnect();
      socketRef.current = null;
      accountChannel?.close();
      channel?.close();
    };
  }, [token, role]);
}
