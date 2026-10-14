import { useEffect, useLayoutEffect } from 'react';
import {
  useLocation,
  useNavigate,
  type NavigateFunction,
} from 'react-router-dom';
import { useAppDispatch } from '../store/hooks';
import {
  logout as logoutLogin,
  restoreSession,
  setRememberedEmail,
} from '../redux/auth/LoginRedux';
import { logout as logoutSignUp } from '../redux/auth/SignUpRedux';
import { resetNotifications } from '../redux/notifications/NotificationsRedux';
import {
  clearAuthData,
  clearSecondaryAuthData,
  getCsrfToken,
  getParsedUser,
  getToken,
  setAuthData,
} from '../utils/storage';
import {
  beginLtiSessionHandoff,
  endLtiSessionHandoff,
} from '../utils/sessionState';
import {
  beginLmsLaunchSession,
  runLtiLaunchSyncIfNeeded,
} from '../utils/lmsLaunchSync';
import { getApiBase } from '../utils/apiBase';
import { toast } from '../components/common/Toast';
import loginEn from '../locales/auth/login/en.json';
import loginEs from '../locales/auth/login/es.json';

type SupportedLang = 'en' | 'es';
const getStoredLanguage = (): SupportedLang => {
  if (typeof window === 'undefined') return 'en';
  const saved = localStorage.getItem('app_language')?.toLowerCase();
  return saved === 'es' ? 'es' : 'en';
};

/** Max wait for session exchange before clearing handoff and unblocking AppRouter. */
export const LTI_SESSION_EXCHANGE_TIMEOUT_MS = 30_000;

/** Module-level guards survive React StrictMode dev remounts (one-time LTI codes). */
let handoffStartedForCode: string | null = null;
let exchangeStartedForCode: string | null = null;
let capturedPriorToken: string | null = null;
let capturedPriorCsrf: string | null = null;
let capturedPriorUser: Record<string, unknown> | null = null;
let exchangeTimeoutId: ReturnType<typeof setTimeout> | null = null;
let exchangeAbortController: AbortController | null = null;

/** @internal Resets module state between unit tests. */
export function resetLtiLaunchHandlerStateForTests(): void {
  handoffStartedForCode = null;
  exchangeStartedForCode = null;
  capturedPriorToken = null;
  capturedPriorCsrf = null;
  capturedPriorUser = null;
  if (exchangeTimeoutId) {
    clearTimeout(exchangeTimeoutId);
    exchangeTimeoutId = null;
  }
  if (exchangeAbortController) {
    exchangeAbortController.abort();
    exchangeAbortController = null;
  }
}

function assignDeepLink(path: string): void {
  window.location.assign(`${window.location.origin}${path}`);
}

function clearExchangeTimeout(): void {
  if (exchangeTimeoutId) {
    clearTimeout(exchangeTimeoutId);
    exchangeTimeoutId = null;
  }
}

function abortInFlightExchange(): void {
  clearExchangeTimeout();
  if (exchangeAbortController) {
    exchangeAbortController.abort();
    exchangeAbortController = null;
  }
}

function finishHandoff(): void {
  clearExchangeTimeout();
  // Do not abort a successful/in-flight exchange — StrictMode remount must not
  // consume the one-time code twice or kill the only in-flight request.
  exchangeAbortController = null;
  endLtiSessionHandoff();
}

const LTI_ERROR_MESSAGES: Record<string, string> = {
  educator_role_required:
    'Access denied: This tool is for instructors only. Students should use the Student App.',
  not_course_instructor:
    'Access denied: You are not an instructor for this course. You must be enrolled as a teacher in your LMS to launch this tool.',
  nrps_required:
    'Names and Role Provisioning Services (NRPS) is not enabled on this educator tool. Contact your administrator to enable it.',
  educator_not_registered:
    'Access denied: Your educator account has not been set up yet. Contact your administrator to be invited before launching from your LMS.',
  email_required_from_lms: 'Email address required from your LMS for login',
  school_not_configured:
    'LTI is not configured for this LMS site. Contact your administrator.',
  school_mismatch:
    'Access denied: Your educator account is not assigned to this school. Contact your administrator to add you to the correct school before launching from this LMS.',
  user_not_found: 'User account not found',
  invalid_token: 'LTI authentication failed',
  decode_failed: 'LTI launch data invalid',
  deployment_mismatch:
    'This Canvas tool is not configured correctly for this school (Deployment ID mismatch). Ask your administrator to check the Deployment ID from the school setup email.',
};

function ltiReasonToMessage(reason: string): string {
  return (
    LTI_ERROR_MESSAGES[reason] ??
    `LTI login failed: ${reason.replace(/_/g, ' ')}`
  );
}

function stripLtiParamsFromUrl(
  navigate: NavigateFunction,
  pathname: string
): void {
  navigate(pathname || '/login', { replace: true });
}

/**
 * Processes LTI launch redirect params regardless of authentication state.
 * Uses one-time code exchange to avoid exposing tokens in URL.
 */
export function useLtiLaunchHandler() {
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const language = getStoredLanguage();
  const locale = language === 'es' ? loginEs : loginEn;

  // Run before paint: clear prior portal session and raise handoff flag so
  // AppRouter never redirects admin→dashboard before educator exchange finishes.
  useLayoutEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('lti_launch') !== 'success') return;
    const code = params.get('code');
    if (!code) return;
    if (handoffStartedForCode === code) return;
    handoffStartedForCode = code;

    capturedPriorToken = getToken();
    capturedPriorCsrf = getCsrfToken();
    capturedPriorUser = getParsedUser();
    beginLtiSessionHandoff();
    dispatch(logoutLogin());
    dispatch(logoutSignUp());
    dispatch(resetNotifications());
    clearSecondaryAuthData();
    clearAuthData();
  }, [location.search, dispatch]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const ltiLaunch = params.get('lti_launch');

    if (ltiLaunch === 'success') {
      const code = params.get('code');

      if (!code) {
        toast.error(locale.toast.ltiLoginFailedMissingCode);
        stripLtiParamsFromUrl(navigate, location.pathname);
        finishHandoff();
        return;
      }

      if (exchangeStartedForCode === code) {
        return;
      }
      exchangeStartedForCode = code;

      const redirectFromUrl = (params.get('redirect') ?? '').trim();

      // Remove code from URL immediately — exchange uses in-memory value only
      stripLtiParamsFromUrl(navigate, location.pathname);

      const apiBase = getApiBase();

      const priorAccessToken = capturedPriorToken;
      const priorCsrf = capturedPriorCsrf;
      const priorUser = capturedPriorUser;
      capturedPriorToken = null;
      capturedPriorCsrf = null;
      capturedPriorUser = null;

      const exchangeHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (priorAccessToken) {
        exchangeHeaders.Authorization = `Bearer ${priorAccessToken}`;
      }

      const restorePriorPortalSession = (): boolean => {
        if (!priorAccessToken) return false;
        localStorage.setItem('accessToken', priorAccessToken);
        setAuthData(
          {
            accessToken: priorAccessToken,
            csrfToken: priorCsrf ?? undefined,
          },
          (priorUser ?? {}) as Parameters<typeof setAuthData>[1],
          false
        );
        dispatch(
          restoreSession({
            data: {
              tokens: {
                accessToken: priorAccessToken,
                csrfToken: priorCsrf ?? '',
              },
              user: priorUser ?? {},
            },
            message: '',
            status: 'success',
          })
        );
        return true;
      };

      // Clear any prior exchange timeout/controller so a second launch cannot
      // leave a stale timer that aborts the new request.
      abortInFlightExchange();

      const abortController = new AbortController();
      exchangeAbortController = abortController;
      exchangeTimeoutId = setTimeout(() => {
        abortInFlightExchange();
      }, LTI_SESSION_EXCHANGE_TIMEOUT_MS);

      fetch(`${apiBase}/api/lti/session/exchange`, {
        method: 'POST',
        headers: exchangeHeaders,
        credentials: 'include',
        body: JSON.stringify({ code, audience: 'educator' }),
        signal: abortController.signal,
      })
        .then(async (response) => {
          if (
            exchangeAbortController !== abortController &&
            exchangeAbortController !== null
          ) {
            return null;
          }
          if (!response.ok) {
            throw new Error('Session exchange failed');
          }
          return response.json();
        })
        .then(
          (
            data: {
              accessToken: string;
              csrfToken: string;
              user: Record<string, unknown>;
              schoolId?: string | null;
              nrpsUrl: string;
              lmsCourseId: string | null;
              lmsCourseName: string;
              provisioningStatus: string;
              courseSource: string;
              redirectPath?: string | null;
            } | null
          ) => {
            if (
              !data ||
              (exchangeAbortController !== abortController &&
                exchangeAbortController !== null)
            ) {
              return;
            }
            if (data.lmsCourseId) {
              localStorage.setItem('lti_course_id', data.lmsCourseId);
              localStorage.setItem('lti_course_name', data.lmsCourseName || '');
            }

            if (data.schoolId) {
              localStorage.setItem('lti_school_id', data.schoolId);
            } else {
              localStorage.removeItem('lti_school_id');
            }

            beginLmsLaunchSession();
            localStorage.setItem('nrpsUrl', data.nrpsUrl || '');

            localStorage.setItem('accessToken', data.accessToken);
            setAuthData(
              { accessToken: data.accessToken, csrfToken: data.csrfToken },
              data.user as Parameters<typeof setAuthData>[1],
              false
            );

            dispatch(
              restoreSession({
                data: {
                  tokens: {
                    accessToken: data.accessToken,
                    csrfToken: data.csrfToken,
                  },
                  user: data.user,
                },
                message: '',
                status: 'success',
              })
            );

            dispatch(setRememberedEmail(''));
            const redirectPath =
              (typeof data.redirectPath === 'string'
                ? data.redirectPath.trim()
                : '') || redirectFromUrl;
            const target = redirectPath.startsWith('/')
              ? redirectPath
              : '/educator-dashboard';

            // Deep link (SpeedGrader report): leave immediately. Do not await LMS
            // sync or end the handoff flag first — either lets GuestOnly bounce
            // /login → /educator-dashboard before report-detail loads. Full-page
            // assign resets module handoff state on the next document.
            if (redirectPath.startsWith('/')) {
              void runLtiLaunchSyncIfNeeded(dispatch).catch(() => {
                // Report page / dashboard can retry sync if this attempt fails.
              });
              assignDeepLink(target);
              return;
            }

            void (async () => {
              try {
                await runLtiLaunchSyncIfNeeded(dispatch);
              } catch {
                // Dashboard will retry sync if this attempt fails.
              }
              finishHandoff();
              navigate(target, { replace: true });
            })();
          }
        )
        .catch(() => {
          if (
            exchangeAbortController !== abortController &&
            exchangeAbortController !== null
          ) {
            return;
          }
          exchangeStartedForCode = null;
          abortInFlightExchange();

          // Canvas keeps the same interstitial URL after the first click, so the
          // one-time code is already spent. Restore the portal session we cleared
          // at launch start and honor the report redirect when present.
          const restored = restorePriorPortalSession();
          if (restored && redirectFromUrl.startsWith('/')) {
            assignDeepLink(redirectFromUrl);
            return;
          }

          finishHandoff();
          if (restored) {
            navigate('/educator-dashboard', { replace: true });
            return;
          }

          toast.error(locale.toast.ltiLoginFailedExpired);
        });

      return;
    }

    if (ltiLaunch === 'error') {
      const reason = params.get('reason') ?? 'unknown';
      stripLtiParamsFromUrl(navigate, location.pathname);
      finishHandoff();
      toast.error(ltiReasonToMessage(reason));
    }
  }, [location.search, location.pathname, navigate, dispatch]);
}
