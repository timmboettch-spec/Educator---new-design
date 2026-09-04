import { getCsrfToken, getToken, setCsrfToken } from "@/utils/storage";
import { forceLogout, LOGOUT_MESSAGES } from "@/utils/forceLogout";
import { isSessionReady } from '../utils/sessionState';
import axios, { type AxiosRequestConfig, type AxiosResponse } from "axios";

const API_BASE_URL = (import.meta.env.VITE_API_URL as string | undefined)?.trim() || 'http://localhost:3000';

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use(
  (config) => {
    const token = getToken();
     const csrfToken = getCsrfToken();
     
    if (token) {
      config.headers["Authorization"] = `Bearer ${token}`;
    }
      if (csrfToken) {
      config.headers["X-CSRF-Token"] = csrfToken;
      }

    return config;
  },
  (error) => Promise.reject(error),
);


type RetryableConfig = AxiosRequestConfig & { _csrfRetried?: boolean };

const CSRF_TOKEN_URL = '/api/auth/csrf-token';

let csrfRefreshInFlight: Promise<string | null> | null = null;

const refreshCsrfToken = async (): Promise<string | null> => {
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
        },
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
    const message = ((error?.response?.data?.message ?? '') as string).toLowerCase();
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
      (message.includes('csrf token invalid') || message.includes('csrf token missing'));

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

    if (!isAuthEndpoint) {
      if (status === 401 || status === 403) {
        if (isSessionReady()) {
          forceLogout(LOGOUT_MESSAGES.SESSION_EXPIRED);
        }
        return Promise.reject({ message: 'Session expired' });
      }
    }

    return Promise.reject(error);
  },
);

export default api;