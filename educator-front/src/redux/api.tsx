import { getCsrfToken, getToken, setCsrfToken } from '@/utils/storage';
import { forceLogout, LOGOUT_MESSAGES } from '@/utils/forceLogout';
import { isLtiSessionHandoff, isSessionReady } from '../utils/sessionState';
import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios';

const API_BASE_URL =
  (import.meta.env.VITE_API_URL as string | undefined)?.trim() ||
  'http://localhost:3000';

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(
  (config) => {
    const token = getToken();
    const csrfToken = getCsrfToken();

    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    if (csrfToken) {
      config.headers['X-CSRF-Token'] = csrfToken;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

type RetryableConfig = AxiosRequestConfig & {
  _csrfRetried?: boolean;
  _rateLimitRetried?: boolean;
};

const CSRF_TOKEN_URL = '/api/auth/csrf-token';

let csrfRefreshInFlight: Promise<string | null> | null = null;

/**
 * Fetches a fresh CSRF token and stores it. Used both by the 403 CSRF-retry
 * path below and explicitly right after login, since the token is no longer
 * always bundled into the login response body.
 */
export const refreshCsrfToken = async (): Promise<string | null> => {
  if (csrfRefreshInFlight) {
    return csrfRefreshInFlight;
  }
  csrfRefreshInFlight = (async (): Promise<string | null> => {
    try {
      const res = await axios.get<{ data?: { csrfToken?: string } }>(
        `${API_BASE_URL}${CSRF_TOKEN_URL}`,
        {
          withCredentials: true,
          headers: {
            Authorization: `Bearer ${getToken() ?? ''}`,
            'ngrok-skip-browser-warning': 'true',
          },
        }
      );
      const fresh = res.data?.data?.csrfToken;
      if (fresh) {
        setCsrfToken(fresh);
        return fresh;
      }
      return null;
    } catch {
      return null;
    } finally {
      csrfRefreshInFlight = null;
    }
  })();
  return csrfRefreshInFlight;
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error?.response?.status;
    const message = (
      (error?.response?.data?.message ?? '') as string
    ).toLowerCase();
    const isAuthEndpoint = (() => {
      const url: string = error?.config?.url ?? '';
      return (
        url.includes('/auth/login') ||
        url.includes('/auth/logout') ||
        url.includes('/auth/signup')
      );
    })();

    const isCsrfError =
      status === 403 &&
      (message.includes('invalid csrf') ||
        message.includes('csrf token invalid') ||
        message.includes('csrf token missing') ||
        message.includes('csrf token'));

    const cfg = error?.config as RetryableConfig | undefined;
    if (
      isCsrfError &&
      !isAuthEndpoint &&
      cfg &&
      !cfg._csrfRetried &&
      getToken()
    ) {
      cfg._csrfRetried = true;
      const fresh = await refreshCsrfToken();
      if (fresh) {
        cfg.headers = {
          ...(cfg.headers ?? {}),
          'X-CSRF-Token': fresh,
        };
        try {
          const replay: AxiosResponse = await api.request(cfg);
          return replay;
        } catch (retryErr) {
          return Promise.reject(retryErr);
        }
      }
    }

    if (status === 429 && cfg && !cfg._rateLimitRetried && !isAuthEndpoint) {
      cfg._rateLimitRetried = true;
      const retryAfterHeader = Number(
        error?.response?.headers?.['retry-after']
      );
      const waitMs =
        Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
          ? Math.min(retryAfterHeader * 1000, 1500)
          : 1100;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      return api.request(cfg);
    }

    if (!isAuthEndpoint) {
      const requestUrl = String(error?.config?.url ?? '');
      const isGoogleClassroomApi =
        requestUrl.includes('/api/google/') ||
        requestUrl.includes('/google/schools');
      // GC OAuth reauth + feature-disabled (admin toggle) are not session expiry.
      // A 403 from these APIs must not forceLogout the educator portal session.
      const isGoogleClassroomNonSessionError =
        isGoogleClassroomApi &&
        (status === 403 ||
          (status === 401 &&
            (message.includes('reconnect google classroom') ||
              message.includes('authorization expired') ||
              message.includes('not enabled for this school'))));

      if (isGoogleClassroomNonSessionError) {
        return Promise.reject(error);
      }

      // select-role answers 401 when the chosen role is gone or the short-lived
      // login token lapsed; its callers decide what to do (show the message,
      // send the user back to sign in) rather than being logged out here.
      if (requestUrl.includes('/auth/select-role')) {
        return Promise.reject(error);
      }

      // change-password answers 401 for a wrong current password — a
      // business-logic failure, not proof of an expired session. Typing the
      // wrong current password must not log the user out; the Account page
      // shows the backend's message directly instead.
      if (requestUrl.includes('/auth/change-password')) {
        return Promise.reject(error);
      }

      // redeem answers 401/403 for a bad/expired/already-used code — a
      // business-logic failure, not proof of an expired session. RedeemCode's
      // own catch block shows the message and lets the user retry.
      if (requestUrl.includes('/auth/redeem')) {
        return Promise.reject(error);
      }

      if (status === 401 || status === 403) {
        const failedAuth = String(error?.config?.headers?.Authorization ?? '');
        const failedToken = failedAuth.replace(/^Bearer\s+/i, '').trim();
        const currentToken = getToken();
        const isStalePriorToken =
          Boolean(failedToken) &&
          Boolean(currentToken) &&
          failedToken !== currentToken;

        if (isSessionReady() && !isLtiSessionHandoff() && !isStalePriorToken) {
          forceLogout(LOGOUT_MESSAGES.SESSION_EXPIRED);
        }
        return Promise.reject({ message: 'Session expired' });
      }
    }

    return Promise.reject(error);
  }
);

export default api;
