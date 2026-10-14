import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios';
import { getCsrfToken, getToken, setCsrfToken } from '../utils/storage';
import { forceLogout, LOGOUT_MESSAGES } from '../utils/forceLogout';
import { isLtiSessionHandoff, isSessionReady } from '../utils/sessionState';

const axiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true,
});

axiosInstance.interceptors.request.use((config) => {
  const token = typeof window !== 'undefined' ? getToken() : null;
  const csrfToken = typeof window !== 'undefined' ? getCsrfToken() : null;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  if (csrfToken) {
    config.headers['X-CSRF-Token'] = csrfToken;
  }
  return config;
});

type RetryableConfig = AxiosRequestConfig & {
  _csrfRetried?: boolean;
  _rateLimitRetried?: boolean;
};

const CSRF_TOKEN_URL = '/api/auth/csrf-token';
const API_BASE_URL_FOR_CSRF =
  (import.meta.env.VITE_API_URL as string | undefined)?.trim() ||
  'http://localhost:3000';

let csrfRefreshInFlight: Promise<string | null> | null = null;

const refreshCsrfToken = async (): Promise<string | null> => {
  if (csrfRefreshInFlight) return csrfRefreshInFlight;
  csrfRefreshInFlight = (async (): Promise<string | null> => {
    try {
      const res = await axios.get<{ data?: { csrfToken?: string } }>(
        `${API_BASE_URL_FOR_CSRF}${CSRF_TOKEN_URL}`,
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

axiosInstance.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    const err = error as {
      response?: { status: number; data?: { message?: string } };
      config?: RetryableConfig;
    };

    const status = err.response?.status;
    const message = (err.response?.data?.message ?? '').toLowerCase();
    const url = err.config?.url ?? '';

    const isSchoolError =
      message.includes('school') ||
      message.includes('inactive') ||
      message.includes('deactivated') ||
      message.includes('school_inactive');

    const isCsrfError =
      status === 403 &&
      (message.includes('invalid csrf') ||
        message.includes('csrf token invalid') ||
        message.includes('csrf token missing') ||
        message.includes('csrf token'));

    const isSessionAuthError =
      message.includes('jwt') ||
      message.includes('csrf token') ||
      message.includes('invalid token') ||
      message.includes('token expired') ||
      message.includes('token missing') ||
      message.includes('token invalid') ||
      message.includes('invalid signature') ||
      message.includes('forbidden: invalid') ||
      message.includes('authentication required');

    const isAuthEndpoint =
      url.includes('/auth/login') ||
      url.includes('/auth/logout') ||
      url.includes('/auth/signup');

    const cfg = err.config;
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
          const replay: AxiosResponse = await axiosInstance.request(cfg);
          return replay;
        } catch (retryErr) {
          return Promise.reject(retryErr);
        }
      }
    }

    if (status === 429 && cfg && !cfg._rateLimitRetried && !isAuthEndpoint) {
      cfg._rateLimitRetried = true;
      const retryAfterHeader = Number(
        (err.response as { headers?: { 'retry-after'?: string } } | undefined)
          ?.headers?.['retry-after']
      );
      const waitMs =
        Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
          ? Math.min(retryAfterHeader * 1000, 1500)
          : 1100;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      return axiosInstance.request(cfg);
    }

    if (!isAuthEndpoint) {
      if (status === 401) {
        // Cross-tab / LTI handoff: a revoked prior JWT may 401 after cookies were
        // already replaced with the new session — never wipe the newer session.
        const failedAuth = String(cfg?.headers?.Authorization ?? '');
        const failedToken = failedAuth.replace(/^Bearer\s+/i, '').trim();
        const currentToken = getToken();
        const isStalePriorToken =
          Boolean(failedToken) &&
          Boolean(currentToken) &&
          failedToken !== currentToken;

        if (isSessionReady() && !isLtiSessionHandoff() && !isStalePriorToken) {
          forceLogout(LOGOUT_MESSAGES.SESSION_EXPIRED);
        }
      } else if (status === 403) {
        if (isSchoolError) {
          if (isSessionReady() && !isLtiSessionHandoff()) {
            forceLogout(LOGOUT_MESSAGES.SCHOOL_INACTIVE);
          }
        } else if (isSessionAuthError) {
          if (isSessionReady() && !isLtiSessionHandoff()) {
            forceLogout(LOGOUT_MESSAGES.SESSION_EXPIRED);
          }
        }
      }
    }

    return Promise.reject(error);
  }
);

export default axiosInstance;
