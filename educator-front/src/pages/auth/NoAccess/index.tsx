import { useTranslation } from 'react-i18next';
import { logout } from '../../../redux/auth/LoginRedux';
import { useAppDispatch } from '../../../store/hooks';
import { clearAuthData } from '../../../utils/storage';

/**
 * Shown when an account authenticates successfully but holds no role this portal
 * serves — a `student` or `scenario_admin` signing in here, for instance.
 *
 * It exists because the alternative is worse: guards fail closed, and a closed guard
 * with nowhere to send the visitor renders an empty shell, which reads as a broken
 * app rather than as the wrong account.
 *
 * The only action offered is a real sign-out. A link to `/login` would be a trap —
 * the visitor *is* authenticated, so the guest-only guard would bounce them straight
 * back here.
 */
export default function NoAccess() {
  const dispatch = useAppDispatch();
  const { t } = useTranslation('system');

  const signOut = () => {
    try {
      // Storage access can throw in a blocked third-party iframe or a locked-down
      // private window (the same class of failure `useSessionIdentity`'s `safely()`
      // guards against). Swallowed rather than left to propagate: a session that
      // could not be fully cleared from storage is still a session this app must
      // stop treating as valid, so `logout()` and the redirect below must run
      // regardless — the alternative traps the user on this screen with a dead
      // button.
      clearAuthData();
    } catch {
      // Nothing to do — best-effort cleanup; the redirect below still discards the
      // in-memory session either way.
    }
    dispatch(logout());
    // A full document load rather than a client-side navigation, so nothing from
    // the rejected session survives in memory.
    window.location.replace('/login');
  };

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-xl font-semibold text-gray-900">
        {t('noAccess.title')}
      </h1>
      <p className="max-w-md text-sm text-gray-600">{t('noAccess.body')}</p>
      <button
        type="button"
        onClick={signOut}
        className="mt-2 rounded-full border border-gray-300 px-6 h-[44px] text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
      >
        {t('noAccess.signOut')}
      </button>
    </div>
  );
}
