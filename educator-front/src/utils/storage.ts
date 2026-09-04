import { clearLmsLaunchSession, clearLmsLaunchStorage } from './lmsLaunchSync';

const TOKEN_COOKIE = 'auth_token';
const CSRF_COOKIE = 'csrfToken';
const USER_COOKIE = 'auth_user';
const USER_SUBS_COOKIE = 'auth_user_subs';
const REMEMBER_FLAG = 'auth_remember';
const SESSION_ACTIVE_KEY = 'session_active';
const SESSION_COOKIE = 'auth_session_active';
const SECONDARY_TOKEN_COOKIE = 'auth_token_2';
const SECONDARY_USER_COOKIE = 'auth_user_2';
const SECONDARY_CSRF_COOKIE = 'auth_csrf_2';

const setCookie = (name: string, value: string, days?: number): void => {
  let expires = '';
  if (days !== undefined) {
    const d = new Date();
    d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
    expires = `; expires=${d.toUTCString()}`;
  }
  document.cookie = `${name}=${encodeURIComponent(value)}${expires}; path=/; SameSite=Strict`;
};

const getCookie = (name: string): string | null => {
  if (typeof document === 'undefined') return null;
  const prefix = `${name}=`;
  for (const part of document.cookie.split(';')) {
    const c = part.trim();
    if (c.startsWith(prefix)) return decodeURIComponent(c.slice(prefix.length));
  }
  return null;
};

const removeCookie = (name: string): void => {
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Strict`;
};

const SLIM_USER_KEYS = [
  'id',
  'email',
  'full_name',
  'fullname',
  'role',
  'school',
  'schools',
  'tokens',
  'total_tokens',
  'is_license_active',
  'profile_picture',
  'profile_image',
  'status',
] as const;

const slimUser = (user: object): { base: object; subscriptions: unknown } => {
  const u = user as Record<string, unknown>;
  const base = Object.fromEntries(SLIM_USER_KEYS.filter((k) => k in u).map((k) => [k, u[k]]));
  return { base, subscriptions: u['subscriptions'] ?? null };
};

export const setAuthData = (tokens: { accessToken: string; csrfToken: string }, user: object, rememberMe: boolean): void => {
  const days = rememberMe ? 30 : undefined;
  setCookie(TOKEN_COOKIE, tokens.accessToken, days);
  setCookie(CSRF_COOKIE, tokens.csrfToken, days);
  setCookie(REMEMBER_FLAG, rememberMe ? '1' : '0', 30);
  const { base, subscriptions } = slimUser(user);
  setCookie(USER_COOKIE, JSON.stringify(base), days);
  if (subscriptions !== null) {
    setCookie(USER_SUBS_COOKIE, JSON.stringify(subscriptions), days);
  }
  if (!rememberMe) {
    sessionStorage.setItem(SESSION_ACTIVE_KEY, '1');
    setCookie(SESSION_COOKIE, '1');
  }
};

export const getToken = (): string | null => getCookie(TOKEN_COOKIE);
export const getCsrfToken = (): string | null => {
  const token = getCookie(CSRF_COOKIE);
  return token;
};
export const getStoredUser = (): string | null => getCookie(USER_COOKIE);

export const setCsrfToken = (token: string): void => {
  const rememberMe = getCookie(REMEMBER_FLAG) === '1';
  const days = rememberMe ? 30 : undefined;
  setCookie(CSRF_COOKIE, token, days);
};

export const getParsedUser = (): Record<string, unknown> | null => {
  const raw = getStoredUser();
  if (!raw) return null;
  try {
    const base = JSON.parse(raw) as Record<string, unknown>;
    const rawSubs = getCookie(USER_SUBS_COOKIE);
    if (rawSubs) {
      try {
        base['subscriptions'] = JSON.parse(rawSubs);
      } catch {
        /* ignore */
      }
    }
    return base;
  } catch {
    return null;
  }
};

export const updateStoredUser = (updates: Record<string, unknown>): void => {
  const current = getParsedUser() ?? {};
  const rememberMe = getCookie(REMEMBER_FLAG) === '1';
  const days = rememberMe ? 30 : undefined;
  const mergedUser = {
    ...current,
    ...updates,
  };
  const { base, subscriptions } = slimUser(mergedUser);
  setCookie(USER_COOKIE, JSON.stringify(base), days);
  if (subscriptions !== null) {
    setCookie(USER_SUBS_COOKIE, JSON.stringify(subscriptions), days);
  }
};

export const isRememberMe = (): boolean => getCookie(REMEMBER_FLAG) === '1';
export const isSessionActive = (): boolean => sessionStorage.getItem(SESSION_ACTIVE_KEY) === '1';
export const isSessionCookieActive = (): boolean => getCookie(SESSION_COOKIE) === '1';
export const markTabSessionActive = (): void => {
  sessionStorage.setItem(SESSION_ACTIVE_KEY, '1');
  setCookie(SESSION_COOKIE, '1');
};

export const clearAuthData = (): void => {
  removeCookie(TOKEN_COOKIE);
  removeCookie(CSRF_COOKIE);
  removeCookie(USER_COOKIE);
  removeCookie(USER_SUBS_COOKIE);
  removeCookie(REMEMBER_FLAG);
  removeCookie(SESSION_COOKIE);
  removeCookie(SECONDARY_TOKEN_COOKIE);
  removeCookie(SECONDARY_USER_COOKIE);
  removeCookie(SECONDARY_CSRF_COOKIE);
  sessionStorage.removeItem(SESSION_ACTIVE_KEY);
  sessionStorage.removeItem('skipped_redeem');
  clearLmsLaunchSession();
  clearLmsLaunchStorage();
  localStorage.removeItem('remembered_email');
};

export const setSecondaryAuthData = (
  tokens: { accessToken: string; csrfToken?: string },
  user: object,
  rememberMe: boolean,
): void => {
  const days = rememberMe ? 30 : undefined;
  setCookie(SECONDARY_TOKEN_COOKIE, tokens.accessToken, days);
  if (tokens.csrfToken) setCookie(SECONDARY_CSRF_COOKIE, tokens.csrfToken, days);
  const { base } = slimUser(user);
  setCookie(SECONDARY_USER_COOKIE, JSON.stringify(base), days);
};

export const getSecondaryToken = (): string | null => getCookie(SECONDARY_TOKEN_COOKIE);
export const getSecondaryCsrfToken = (): string | null => getCookie(SECONDARY_CSRF_COOKIE);

export const getSecondaryUser = (): Record<string, unknown> | null => {
  const raw = getCookie(SECONDARY_USER_COOKIE);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
};

export const clearSecondaryAuthData = (): void => {
  removeCookie(SECONDARY_TOKEN_COOKIE);
  removeCookie(SECONDARY_USER_COOKIE);
  removeCookie(SECONDARY_CSRF_COOKIE);
};

export const storeDualRoleData = (
  primaryToken: string,
  primaryUser: unknown,
  secondaryToken?: string,
  secondaryUser?: unknown,
) => {
  localStorage.setItem('token', primaryToken);
  localStorage.setItem('user', JSON.stringify(primaryUser));

  if (secondaryToken && secondaryUser) {
    localStorage.setItem('secondary_token', secondaryToken);
    localStorage.setItem('secondary_user', JSON.stringify(secondaryUser));
  }
};

export const swapRoles = (): boolean => {
  const primaryToken = getCookie(TOKEN_COOKIE);
  const primaryUser = getCookie(USER_COOKIE);
  const primaryCsrf = getCookie(CSRF_COOKIE);
  const secondaryToken = getCookie(SECONDARY_TOKEN_COOKIE);
  const secondaryUser = getCookie(SECONDARY_USER_COOKIE);
  const secondaryCsrf = getCookie(SECONDARY_CSRF_COOKIE);

  if (!primaryToken || !primaryUser || !secondaryToken || !secondaryUser) return false;

  const rememberMe = getCookie(REMEMBER_FLAG) === '1';
  const days = rememberMe ? 30 : undefined;
  setCookie(TOKEN_COOKIE, secondaryToken, days);
  setCookie(USER_COOKIE, secondaryUser, days);
  if (secondaryCsrf) setCookie(CSRF_COOKIE, secondaryCsrf, days);
  setCookie(SECONDARY_TOKEN_COOKIE, primaryToken, days);
  setCookie(SECONDARY_USER_COOKIE, primaryUser, days);
  if (primaryCsrf) setCookie(SECONDARY_CSRF_COOKIE, primaryCsrf, days);
  return true;
};

/** @deprecated */
export const initSessionFromCookie = (): void => {};
