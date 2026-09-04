'use client';

import loginImage from '@/assets/redeem/RW AI UI orange gradient -07.jpg';
import { FormEvent, useMemo, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate, useLocation } from 'react-router-dom';
import ConfirmModal from '../../../components/modal/ConfirmationModal';
import Logo from '../../../components/logo/Logo';
import { Button } from '../../../components/ui/Button';
import Checkbox from '../../../components/ui/Checkbox';
import InputField from '../../../components/ui/Input';
import { toast, SESSION_TOAST_KEY, sonnerToast } from '../../../components/common/Toast';
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
import { clearPendingToast } from '../../../redux/loader/loaderSlice';
import { useAppDispatch } from '../../../store/hooks';
import { isValidEmail } from '../../../utils/validation';
import { COMMON_VALIDATION } from '../../../utils/messages/common';
import { setAuthData, setSecondaryAuthData } from '../../../utils/storage';

import {
  hasUnsafePasswordPattern,
  sanitizePasswordForTyping,
} from '../../../utils/inputSecurity';

type SupportedLang = 'en' | 'es';
const LANGUAGE_STORAGE_KEY = 'app_language';
const getInitialLanguage = (): SupportedLang => {
  if (typeof window === 'undefined') {
    return 'en';
  }

  const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY)?.toLowerCase();
  if (saved === 'es' || saved === 'en') {
    return saved;
  }

  const browserLang = window.navigator.language.toLowerCase();
  return browserLang.startsWith('es') ? 'es' : 'en';
};

export default function SignIn() {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useAppDispatch();
  const [language, setLanguage] = useState<SupportedLang>(getInitialLanguage);

  const handleSetLanguage = (lang: SupportedLang) => {
    setLanguage(lang);
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  };
  const rememberedEmail = useSelector(selectRememberedEmail);
  const [email, setEmail] = useState(rememberedEmail || '');
  const [password, setPassword] = useState('');
  const status = useSelector(selectLoginStatus);
  const [successMessage, setSuccessMessage] = useState('');
  const [rememberMe, setRememberMe] = useState(!!rememberedEmail);
  const isSubmittingRef = useRef(false);

  const clearQueuedToasts = () => {
    dispatch(clearPendingToast());
    sessionStorage.removeItem(SESSION_TOAST_KEY);
    sonnerToast.dismiss();
  };

  const locale = useMemo(() => (language === 'es' ? loginEs : loginEn), [language]);
  const [validationError, setValidationError] = useState<string>('');

  const [dualRoleModal, setDualRoleModal] = useState<{
    adminTokens: { accessToken: string; csrfToken: string };
    adminUser: Record<string, unknown>;
    educatorTokens: { accessToken: string; csrfToken: string };
    educatorUser: EducatorUser;
    rememberMe: boolean;
    message: string;
  } | null>(null);

  const finishLogin = async (
    tokens: { accessToken: string; csrfToken: string },
    user: Record<string, unknown>,
    remember: boolean,
    message: string,
  ) => {
    setAuthData(tokens, user as Parameters<typeof setAuthData>[1], remember);
    dispatch(
      restoreSession({
        data: { tokens, user },
        message: '',
        status: 'success',
      }),
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
      sessionStorage.setItem(SESSION_TOAST_KEY, JSON.stringify({ type: 'success', message }));
      navigate(from || '/educator-dashboard', { replace: true });
    } else if (user.is_license_active === true) {
      setSuccessMessage(message);
      sessionStorage.setItem(SESSION_TOAST_KEY, JSON.stringify({ type: 'success', message }));
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
      data.message,
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
      data.rememberMe,
    );
    await finishLogin(data.adminTokens, data.adminUser, data.rememberMe, data.message);
  };

  const handleDualRoleCancel = () => {
    // Close the modal without selecting a role or authenticating
    setDualRoleModal(null);
    // Clear any pending state
    isSubmittingRef.current = false;
    // User stays on the login page - no navigation or authentication
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
        }),
      ).unwrap();
      const message = res.message || locale.toast.loginSuccess;

      // Dual-role: show popup before committing any session data
      if (res.data.has_dual_role && res.data.educator_tokens && res.data.educator_user) {
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
        res.data.user as Record<string, unknown>,
        rememberMe,
        message,
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
    <div className="h-screen flex items-center justify-center p-6 overflow-y-auto no-scrollbar">
      <div className="flex w-full max-w-[900px] min-h-[420px] overflow-hidden rounded-[35px] bg-white shadow-2xl">
        <div className="flex flex-col justify-center px-10 py-10 w-full lg:w-1/2">
          <div className="mb-6">
            <div className="flex justify-center lg:justify-start">
              <Logo />
            </div>
            <div className="mt-3 flex items-center justify-center gap-2 lg:justify-end">
              <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
                {locale.login.languageLabel}
              </span>
              <div className="inline-flex rounded-full border border-[#F4C6AD] bg-[#FFF7F2] p-1">
                <button
                  type="button"
                  onClick={() => handleSetLanguage('en')}
                  aria-pressed={language === 'en'}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${language === 'en'
                      ? 'bg-[#db8833] text-white'
                      : 'text-[#A6522A] hover:bg-[#FFE6D8]'
                    }`}
                >
                  {locale.login.languageEnglish}
                </button>
                <button
                  type="button"
                  onClick={() => handleSetLanguage('es')}
                  aria-pressed={language === 'es'}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${language === 'es'
                      ? 'bg-[#db8833] text-white'
                      : 'text-[#A6522A] hover:bg-[#FFE6D8]'
                    }`}
                >
                  {locale.login.languageSpanish}
                </button>
              </div>
            </div>
          </div>
          <h2
            className="text-2xl font-bold mb-6 text-center lg:text-left pb-3"
            style={{
              borderBottom: '0.76px solid #E2E1E1',
              color: '#db8833',
              fontWeight: 700,
            }}
          >
            {locale.login.title}
          </h2>
          <form onSubmit={handleSubmit} noValidate className="flex flex-col">
            <div className="flex flex-col gap-3">
              <InputField
                name="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleLogin(); } }}
                label={locale.login.emailLabel}
                placeholder={locale.login.emailPlaceholder}
                required
              />
              <InputField
                name="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(sanitizePasswordForTyping(e.target.value))}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleLogin(); } }}
                label={locale.login.passwordLabel}
                placeholder={locale.login.passwordPlaceholder}
                required
              />
            </div>

            {validationError && <p className="mt-2 text-xs text-red-500">{validationError}</p>}
            {successMessage && <p className="mt-2 text-xs text-green-500">{successMessage}</p>}

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
          <img
            src={loginImage}
            alt=""
            className="w-full h-full object-cover"
          />
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
    </div>
  );
}
