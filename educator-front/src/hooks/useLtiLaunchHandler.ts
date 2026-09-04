import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppDispatch } from '../store/hooks';
import { setRememberedEmail } from '../redux/auth/LoginRedux';
import { setAuthData } from '../utils/storage';
import { beginLmsLaunchSession, runLtiLaunchSyncIfNeeded } from '../utils/lmsLaunchSync';
import { toast } from '../components/common/Toast';

const LTI_ERROR_MESSAGES: Record<string, string> = {
  educator_role_required:
    'Access denied: This tool is for instructors only. Students should use the Student App.',
  not_course_instructor:
    'Access denied: You are not an instructor for this course. You must be enrolled as a teacher in Moodle to launch this tool.',
  nrps_required:
    'NRPS is not enabled on this Moodle educator tool. Contact your administrator to enable Names and Role Provisioning before launching.',
  educator_not_registered:
    'Access denied: Your educator account has not been set up yet. Contact your administrator to be invited before launching from Moodle.',
  email_required_from_lms: 'Email address required from your LMS for login',
  school_not_configured:
    'LTI is not configured for this Moodle site. Contact your administrator.',
  school_mismatch:
    'Access denied: Your educator account is not assigned to this school. Contact your administrator to add you to the correct school before launching from this LMS.',
  user_not_found: 'User account not found',
  invalid_token: 'LTI authentication failed',
  decode_failed: 'LTI launch data invalid',
};

function ltiReasonToMessage(reason: string): string {
  return (
    LTI_ERROR_MESSAGES[reason] ?? `LTI login failed: ${reason.replace(/_/g, ' ')}`
  );
}

/** Strip LTI query params from the address bar so codes never linger in history/referrer. */
function stripLtiParamsFromUrl(): void {
  if (typeof window === 'undefined') return;
  const path = window.location.pathname || '/login';
  window.history.replaceState(window.history.state, '', path);
}

/**
 * Processes LTI launch redirect params regardless of authentication state.
 * Uses one-time code exchange to avoid exposing tokens in URL.
 */
export function useLtiLaunchHandler() {
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const exchangeInFlight = useRef(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const ltiLaunch = params.get('lti_launch');

    if (ltiLaunch === 'success') {
      const code = params.get('code');

      if (!code) {
        toast.error('LTI login failed — missing session code');
        stripLtiParamsFromUrl();
        return;
      }

      if (exchangeInFlight.current) {
        return;
      }
      exchangeInFlight.current = true;

      // Remove code from URL immediately — exchange uses in-memory value only
      stripLtiParamsFromUrl();

      const apiBase =
        (import.meta.env.VITE_API_URL as string | undefined)?.trim() || 'http://localhost:3000';

      fetch(`${apiBase}/api/lti/session/exchange`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ code, audience: 'educator' }),
      })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error('Session exchange failed');
          }
          return response.json();
        })
        .then(async (data: {
          accessToken: string;
          csrfToken: string;
          user: Record<string, unknown>;
          schoolId?: string | null;
          nrpsUrl: string;
          lmsCourseId: string | null;
          lmsCourseName: string;
          provisioningStatus: string;
          courseSource: string;
          lmsAccessToken?: string;
          /** @deprecated Backend may still return this during rollout */
          moodleAccessToken?: string;
        }) => {
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

          const lmsAccessToken = data.lmsAccessToken ?? data.moodleAccessToken;
          if (lmsAccessToken) {
            localStorage.setItem('lmsAccessToken', lmsAccessToken);
            localStorage.setItem('moodleAccessToken', lmsAccessToken);
          }

          localStorage.setItem('accessToken', data.accessToken);
          setAuthData(
            { accessToken: data.accessToken, csrfToken: data.csrfToken },
            data.user as Parameters<typeof setAuthData>[1],
            false,
          );

          try {
            await runLtiLaunchSyncIfNeeded(dispatch);
          } catch {
            // Dashboard will retry sync if this attempt fails.
          }

          dispatch(setRememberedEmail(''));
          navigate('/educator-dashboard', { replace: true });
        })
        .catch(() => {
          exchangeInFlight.current = false;
          toast.error('LTI login failed — session expired');
        });

      return;
    }

    if (ltiLaunch === 'error') {
      const reason = params.get('reason') ?? 'unknown';
      stripLtiParamsFromUrl();
      toast.error(ltiReasonToMessage(reason));
    }
  }, [location.search, navigate, dispatch]);
}
