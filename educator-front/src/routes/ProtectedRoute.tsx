import { useEffect } from 'react';
import { useAppDispatch } from '../store/hooks';
import { restoreSession, markSessionChecked } from '../redux/auth/LoginRedux';
import {
  getToken,
  getParsedUser,
  isRememberMe,
  isSessionActive,
  markTabSessionActive,
  clearAuthData,
} from '../utils/storage';

const AUTH_CHANNEL = 'auth_session';

function createChannel(): BroadcastChannel | null {
  try {
    return new BroadcastChannel(AUTH_CHANNEL);
  } catch {
    return null;
  }
}

export default function SessionRestorer() {
  const dispatch = useAppDispatch();

  useEffect(() => {
    const channel = createChannel();
    if (!channel) return;

    channel.onmessage = (e: MessageEvent<string>) => {
      try {
        if (e.data === 'session_ping' && isSessionActive()) {
          channel.postMessage('session_alive');
        }
      } catch {
        // ignore
      }
    };

    return () => {
      try {
        channel.close();
      } catch {
        // ignore
      }
    };
  }, []);

  useEffect(() => {
    const restoreUserSession = async () => {
      let token: string | null = null;
      let user: ReturnType<typeof getParsedUser> = null;
      let persistent = false;
      let sameTab = false;

      try {
        token = getToken();
        user = getParsedUser();
        persistent = isRememberMe();
        sameTab = isSessionActive();
      } catch {
        clearAuthData();
        await dispatch(markSessionChecked());
        return;
      }

      if (!token || !user) {
        if (token || user) {
          clearAuthData();
        }
        await dispatch(markSessionChecked());
        return;
      }

      const buildPayload = () => ({
        data: {
          tokens: {
            accessToken: token!,
          },
          user: user as {
            id: string;
            email: string;
            full_name: string;
            is_license_active: boolean;
          },
        },
        message: '',
        status: 'success',
      });

      if (persistent || sameTab) {
        await dispatch(restoreSession(buildPayload()));
        return;
      }

      const channel = createChannel();

      if (!channel) {
        clearAuthData();
        await dispatch(markSessionChecked());
        return;
      }

      let settled = false;

      const settle = async (alive: boolean) => {
        if (settled) return;
        settled = true;

        channel.close();

        if (alive) {
          markTabSessionActive();
          await dispatch(restoreSession(buildPayload()));
        } else {
          clearAuthData();
          await dispatch(markSessionChecked());
        }
      };

      channel.onmessage = (e: MessageEvent<string>) => {
        if (e.data === 'session_alive') {
          void settle(true);
        }
      };

      channel.postMessage('session_ping');

      const timer = setTimeout(() => {
        void settle(false);
      }, 300);

      return () => {
        clearTimeout(timer);

        if (!settled) {
          settled = true;
          channel.close();
        }
      };
    };

    void restoreUserSession();
  }, [dispatch]);

  return null;
}
