'use client';

import loginImage from '@/assets/redeem/RW AI UI orange gradient -07.jpg';
import { AuthLanguageSwitcher } from '@/components/auth/AuthLanguageSwitcher';
import { useAuthLanguage } from '@/hooks/useAuthLanguage';
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import { useNavigate, useLocation } from 'react-router-dom';
import ConfirmModal from '../../../components/modal/ConfirmationModal';
import Logo from '../../../components/logo/Logo';
import { Button } from '../../../components/ui/Button';
import Checkbox from '../../../components/ui/Checkbox';
import InputField from '../../../components/ui/Input';
import {
  toast,
  SESSION_TOAST_KEY,
  sonnerToast,
} from '../../../components/common/Toast';
import loginEn from '../../../locales/auth/login/en.json';
import loginEs from '../../../locales/auth/login/es.json';
import {
  LoginRequest,
  selectLoginStatus,
  selectRememberedEmail,
  setRememberedEmail,
  restoreSession,
  type EducatorUser,
} from '../../../redux/auth/LoginRedux';
import { SelectRoleRequest } from '../../../redux/auth/SelectRoleRedux';
import { clearPendingToast } from '../../../redux/loader/loaderSlice';
import { refreshCsrfToken } from '../../../redux/api';
import { useAppDispatch } from '../../../store/hooks';
import { isValidEmail } from '../../../utils/validation';
import { COMMON_VALIDATION } from '../../../utils/messages/common';
import {
  findRoleById,
  getActiveRole,
  getUserRoles,
  isSupportedRoleSlug,
  normalizeAuthUser,
  type AuthUserRole,
} from '../../../utils/normalizeAuthUser';
import { setAuthData, setSecondaryAuthData } from '../../../utils/storage';
import { translateApiMessage } from '../../../utils/translateMessage';

import {
  hasUnsafePasswordPattern,
  sanitizePasswordForTyping,
} from '../../../utils/inputSecurity';

export default function SignIn() {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useAppDispatch();
  const { language, setLanguage: handleSetLanguage } = useAuthLanguage();
  const rememberedEmail = useSelector(selectRememberedEmail);
  const [email, setEmail] = useState(rememberedEmail || '');
  const [password, setPassword] = useState('');
  const status = useSelector(selectLoginStatus);
  const [successMessage, setSuccessMessage] = useState('');
  const [rememberMe, setRememberMe] = useState(!!rememberedEmail);
  const isSubmittingRef = useRef(false);
  const { t } = useTranslation('common');
  // The box launcher (:7700) is only reachable from the box itself, so the Home link is local-only.
  const isLocalBox = ['localhost', '127.0.0.1'].includes(window.location.hostname);

  // Demo prefill (SALES3 launcher): /login#email=...&pw=... fills the form. The fragment is never
  // sent to a server, and it is stripped from the address bar as soon as it has been read.
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const prefillEmail = hash.get('email');
    const prefillPassword = hash.get('pw');
    if (prefillEmail || prefillPassword) {
      if (prefillEmail) setEmail(prefillEmail);
      if (prefillPassword) setPassword(prefillPassword);
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      return;
    }
    // Offline demo front door (:7001) serves this; elsewhere it falls through to index.html and is ignored.
    let cancelled = false;
    fetch('/demo-login.json', { cache: 'no-store' })
      .then((r) => (r.ok && (r.headers.get('content-type') ?? '').includes('json') ? r.json() : null))
      .then((login: { email?: string; password?: string } | null) => {
        if (cancelled || !login?.email) return;
        setEmail((cur) => cur || login.email || '');
        setPassword((cur) => cur || login.password || '');
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const clearQueuedToasts = () => {
    dispatch(clearPendingToast());
    sessionStorage.removeItem(SESSION_TOAST_KEY);
    sonnerToast.dismiss();
  };

  const locale = useMemo(
    () => (language === 'es' ? loginEs : loginEn),
    [language]
  );
  const [validationError, setValidationError] = useState<string>('');

  const [dualRoleModal, setDualRoleModal] = useState<{
    adminTokens: { accessToken: string; csrfToken?: string };
    adminUser: Record<string, unknown>;
    educatorTokens: { accessToken: string; csrfToken?: string };
    educatorUser: EducatorUser;
    rememberMe: boolean;
    message: string;
  } | null>(null);

  const [roleSelection, setRoleSelection] = useState<{
    adminRole: AuthUserRole;
    educatorRole: AuthUserRole;
    tokens?: { accessToken: string; csrfToken?: string };
    rememberMe: boolean;
    message: string;
  } | null>(null);
  const [pendingRoleId, setPendingRoleId] = useState<string | null>(null);

  const finishLogin = async (
    tokens: { accessToken: string; csrfToken?: string },
    user: Record<string, unknown>,
    remember: boolean,
    message: string
  ) => {
    setAuthData(tokens, user as Parameters<typeof setAuthData>[1], remember);
    if (!tokens.csrfToken) {
      // Not every login response still bundles a CSRF token — fetch one
      // explicitly instead of waiting for the first mutating request to 403
      // and self-heal via the axios interceptor's retry path.
      void refreshCsrfToken();
    }
    dispatch(
      restoreSession({
        data: { tokens, user },
        message: '',
        status: 'success',
      })
    );
    dispatch(setRememberedEmail(remember ? email : ''));

    const from =
      (location.state as { from?: string } | null)?.from ||
      new URLSearchParams(location.search).get('redirect') ||
      null;

    const userRole =
      typeof user.role === 'string' ? user.role.toLowerCase() : '';

    if (userRole === 'educator') {
      setSuccessMessage(message);
      sessionStorage.setItem(
        SESSION_TOAST_KEY,
        JSON.stringify({ type: 'success', message })
      );
      navigate(from || '/educator-dashboard', { replace: true });
    } else if (user.is_license_active === true) {
      setSuccessMessage(message);
      sessionStorage.setItem(
        SESSION_TOAST_KEY,
        JSON.stringify({ type: 'success', message })
      );
      navigate(from || '/admin-dashboard', { replace: true });
    } else {
      navigate('/redeem');
    }
  };

  const handleDualRoleEducator = async () => {
    if (!dualRoleModal) return;
    const data = dualRoleModal;
    setDualRoleModal(null);
    // Store the inactive Administrator credentials in the secondary slot so
    // the user can switch back without re-logging in.
    setSecondaryAuthData(data.adminTokens, data.adminUser, data.rememberMe);
    await finishLogin(
      data.educatorTokens,
      data.educatorUser as unknown as Record<string, unknown>,
      data.rememberMe,
      data.message
    );
  };

  const handleDualRoleAdmin = async () => {
    if (!dualRoleModal) return;
    const data = dualRoleModal;
    setDualRoleModal(null);
    // Store the inactive Educator credentials in the secondary slot so the
    // user can switch to Educator later without re-logging in.
    setSecondaryAuthData(
      data.educatorTokens,
      data.educatorUser as unknown as Record<string, unknown>,
      data.rememberMe
    );
    await finishLogin(
      data.adminTokens,
      data.adminUser,
      data.rememberMe,
      data.message
    );
  };

  const handleDualRoleCancel = () => {
    // Close the modal without selecting a role or authenticating
    setDualRoleModal(null);
    // Clear any pending state
    isSubmittingRef.current = false;
    // User stays on the login page - no navigation or authentication
  };

  const handleRoleSelect = async (role: AuthUserRole) => {
    if (!roleSelection || pendingRoleId) return;

    setPendingRoleId(role.id);
    try {
      const res = await dispatch(
        SelectRoleRequest({
          roleId: role.id,
          accessToken: roleSelection.tokens?.accessToken,
          csrfToken: roleSelection.tokens?.csrfToken,
        })
      ).unwrap();

      // The response still lists every role, so `userRoles[0]` says nothing
      // about the choice: trust an explicit `activeRole`, else the one picked.
      const activeRole =
        (res.data.activeRole
          ? getActiveRole(res.data.user, res.data.activeRole)
          : null) ??
        findRoleById(res.data.user, role.id) ??
        role;

      if (!isSupportedRoleSlug(activeRole.slug)) {
        toast.error(locale.toast.roleNotSupported);
        return;
      }

      if (!res.data.tokens?.accessToken) {
        toast.error(locale.toast.genericError);
        return;
      }

      setRoleSelection(null);
      await finishLogin(
        res.data.tokens,
        normalizeAuthUser(res.data.user, activeRole) ?? {},
        roleSelection.rememberMe,
        translateApiMessage(res.message || roleSelection.message, language)
      );
    } catch (err: unknown) {
      const { message: msg, status } = err as {
        message?: string;
        status?: number;
      };
      // 401 means the ~120s login token lapsed or the role is gone; either
      // way the only way forward is a fresh sign-in.
      if (status === 401) {
        toast.error(locale.toast.roleSelectionExpired);
        setRoleSelection(null);
        isSubmittingRef.current = false;
      } else {
        toast.error(msg || locale.toast.roleSelectionFailed);
      }
    } finally {
      setPendingRoleId(null);
    }
  };

  const handleRoleSelectionClose = () => {
    // Ignore close while a selection is in flight: ConfirmModal disables its
    // buttons, but Escape and the backdrop still fire onClose.
    if (pendingRoleId) return;
    setRoleSelection(null);
    isSubmittingRef.current = false;
  };

  const handleLogin = async () => {
    if (isSubmittingRef.current || status === 'loading') {
      return;
    }

    setValidationError('');
    setSuccessMessage('');
    if (!email && !password) {
      setValidationError(COMMON_VALIDATION.EMAIL_AND_PASSWORD_REQUIRED);
      return;
    }
    if (!email) {
      setValidationError(COMMON_VALIDATION.EMAIL_REQUIRED);
      return;
    }
    if (!isValidEmail(email)) {
      setValidationError(COMMON_VALIDATION.INVALID_EMAIL);
      return;
    }
    if (!password) {
      setValidationError(COMMON_VALIDATION.PASSWORD_REQUIRED);
      return;
    }
    if (hasUnsafePasswordPattern(password)) {
      setValidationError('Password cannot include HTML or script-like content');
      return;
    }
    clearQueuedToasts();

    isSubmittingRef.current = true;

    try {
      const res = await dispatch(
        LoginRequest({
          email,
          password,
        })
      ).unwrap();
      const message = translateApiMessage(
        res.message || locale.toast?.loginSuccess || 'Login successful',
        language
      );

      // Multi-role account: the cookie currently holds a short-lived
      // (~120s) login-purpose token that only select-role accepts, so no
      // session is committed until a role is picked.
      if (res.data.accessStatus === 'required_role_selection') {
        // Only district admin + educator can share a login, so the picker
        // is a fixed two-choice prompt.
        const roles = getUserRoles(res.data.user);
        const adminRole = roles.find((r) => r.slug === 'district_admin');
        const educatorRole = roles.find((r) => r.slug === 'educator');
        if (!adminRole || !educatorRole) {
          toast.error(locale.toast.genericError);
          return;
        }
        setRoleSelection({
          adminRole,
          educatorRole,
          tokens: res.data.tokens,
          rememberMe,
          message,
        });
        return;
      }

      const activeRole = getActiveRole(res.data.user, res.data.activeRole);
      if (activeRole && !isSupportedRoleSlug(activeRole.slug)) {
        toast.error(locale.toast.roleNotSupported);
        return;
      }

      if (!res.data.tokens?.accessToken) {
        toast.error(locale.toast.genericError);
        return;
      }

      // Dual-role: show popup before committing any session data
      if (
        res.data.has_dual_role &&
        res.data.educator_tokens &&
        res.data.educator_user
      ) {
        setDualRoleModal({
          adminTokens: res.data.tokens,
          adminUser: res.data.user as Record<string, unknown>,
          educatorTokens: res.data.educator_tokens,
          educatorUser: res.data.educator_user,
          rememberMe,
          message,
        });
        return;
      }

      await finishLogin(
        res.data.tokens,
        normalizeAuthUser(res.data.user, res.data.activeRole) ?? {},
        rememberMe,
        message
      );
    } catch (err: unknown) {
      clearQueuedToasts();
      const msg = (err as { message?: string })?.message;
      toast.error(msg || locale.toast.loginFailed);
      return;
    } finally {
      isSubmittingRef.current = false;
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    await handleLogin();
  };

  return (
    <div className="relative h-screen flex items-center justify-center p-6 overflow-y-auto no-scrollbar">
      {isLocalBox && (
        <a
          href="http://localhost:7700/"
          className="absolute top-6 right-6 flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:border-primary-500 hover:text-primary-500"
        >
          <span aria-hidden="true">&larr;</span>
          {t('actions.home')}
        </a>
      )}
      <div className="flex w-full max-w-[900px] min-h-[420px] overflow-hidden rounded-[35px] bg-white shadow-2xl">
        <div className="flex flex-col justify-center px-10 py-10 w-full lg:w-1/2">
          <div className="mb-6">
            <div className="flex justify-center lg:justify-start">
              <Logo />
            </div>
            <AuthLanguageSwitcher
              language={language}
              onChange={handleSetLanguage}
              label={locale.login.languageLabel}
              englishLabel={locale.login.languageEnglish}
              spanishLabel={locale.login.languageSpanish}
            />
          </div>
          <h2 className="text-2xl font-bold mb-6 text-center lg:text-left pb-3 text-primary-500 border-b-[0.76px] border-[#E2E1E1]">
            {locale.login.title}
          </h2>
          <form onSubmit={handleSubmit} noValidate className="flex flex-col">
            <div className="flex flex-col gap-3">
              <InputField
                name="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleLogin();
                  }
                }}
                label={locale.login.emailLabel}
                placeholder={locale.login.emailPlaceholder}
                required
              />
              <InputField
                name="password"
                type="password"
                value={password}
                onChange={(e) =>
                  setPassword(sanitizePasswordForTyping(e.target.value))
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleLogin();
                  }
                }}
                label={locale.login.passwordLabel}
                placeholder={locale.login.passwordPlaceholder}
                required
              />
            </div>

            {validationError && (
              <p role="alert" className="mt-2 text-xs text-red-500">
                {validationError}
              </p>
            )}
            {successMessage && (
              <p className="mt-2 text-xs text-green-500">{successMessage}</p>
            )}

            <div className="flex items-center justify-between mt-4">
              <button
                type="button"
                className="text-sm text-red-500 hover:underline"
                onClick={() => navigate('/forgotpassword')}
              >
                {locale.login.forgotPassword}
              </button>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Checkbox
                  name="rememberMe"
                  checked={rememberMe}
                  onChange={() => setRememberMe(!rememberMe)}
                />
                <span>{locale.login.rememberMe}</span>
              </div>
            </div>
            <div className="flex justify-center mt-6 lg:justify-start">
              <Button
                type="submit"
                variant="gradient"
                loading={status === 'loading'}
                loadingText={locale.login.loadingSubmit}
              >
                {locale.login.submit}
              </Button>
            </div>
          </form>
          <p className="mt-5 text-sm text-center text-gray-500">
            {locale.login.noAccount}{' '}
            <button
              type="button"
              className="font-semibold text-gray-800 hover:underline"
              onClick={() => navigate('/signup')}
            >
              {locale.login.signUp}
            </button>
          </p>
        </div>
        <div className="hidden md:block md:w-1/2">
          <img src={loginImage} alt="" className="w-full h-full object-cover" />
        </div>
      </div>

      {/* Dual-role popup — shown when the same email+password authenticates both an Administrator and an active Educator */}
      <ConfirmModal
        isOpen={!!dualRoleModal}
        title={locale.login.dualRoleTitle}
        message={locale.login.dualRoleMessage}
        cancelText={locale.login.dualRoleAdmin}
        confirmText={locale.login.dualRoleEducator}
        onConfirm={() => void handleDualRoleEducator()}
        onCancel={() => void handleDualRoleAdmin()}
        onClose={handleDualRoleCancel}
      />

      {/* Multi-role picker — shown when login returns required_role_selection */}
      <ConfirmModal
        isOpen={!!roleSelection}
        title={locale.login.dualRoleTitle}
        message={locale.login.dualRoleMessage}
        cancelText={locale.login.dualRoleAdmin}
        confirmText={locale.login.dualRoleEducator}
        isLoading={!!pendingRoleId}
        onCancel={() =>
          roleSelection && void handleRoleSelect(roleSelection.adminRole)
        }
        onConfirm={() =>
          roleSelection && void handleRoleSelect(roleSelection.educatorRole)
        }
        onClose={handleRoleSelectionClose}
      />
    </div>
  );
}
