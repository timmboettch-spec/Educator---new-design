'use client';

import loginImage from '@/assets/redeem/RW AI UI orange gradient -07.jpg';
import { useAuthLanguage } from '@/hooks/useAuthLanguage';
import { useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import loginEn from '../../../locales/auth/login/en.json';
import loginEs from '../../../locales/auth/login/es.json';
import { toast } from '../../../components/common/Toast';
import Logo from '../../../components/logo/Logo';
import { Button } from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import { useAppDispatch } from '../../../store/hooks';
import { ROUTE_PATHS } from '../../../routes/routePath';
import { isValidEmail } from '../../../utils/validation';
import { COMMON_VALIDATION } from '../../../utils/messages/common';
import {
  ForgotPasswordRequest,
  selectForgotPasswordStatus,
  resetError,
} from '../../../redux/auth/ForgotPasswordRedux';

export default function ForgotPassWord() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { language } = useAuthLanguage();
  const [email, setEmail] = useState('');
  const status = useSelector(selectForgotPasswordStatus);
  const [validationError, setValidationError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const emailErrorId = 'forgot-password-email-error';

  const locale = useMemo(
    () => (language === 'es' ? loginEs : loginEn),
    [language]
  );

  const handleSubmit = async () => {
    setValidationError('');
    setSubmitError('');
    if (!isValidEmail(email)) {
      setValidationError(
        locale.forgotPassword.emailInvalid || COMMON_VALIDATION.FORGOT_EMAIL
      );
      return;
    }
    dispatch(resetError());
    try {
      const res = await dispatch(ForgotPasswordRequest({ email })).unwrap();
      toast.success(
        language === 'es'
          ? locale.forgotPassword.otpSentSuccess ||
              'OTP enviado con éxito a tu correo electrónico'
          : res.message ||
              locale.forgotPassword.otpSentSuccess ||
              'OTP sent successfully to your email'
      );
      navigate(ROUTE_PATHS.auth.otpVerify, { state: { email } });
    } catch (err: unknown) {
      const error = err as { message?: string };
      const knownMessages: Record<string, string | undefined> = {
        'No account found with this email address':
          locale.forgotPassword.accountNotFound,
        'No account found for the selected role':
          locale.forgotPassword.dualRoleNotFound,
      };
      // Backend prefixes mail-provider failures with a fixed English string, followed by a
      // provider error detail — translate both the prefix and any known detail phrase.
      const emailFailurePrefix =
        'Email delivery failed (Azure Communication Services):';
      const knownReasons: Record<string, string | undefined> = {
        'Denied by the resource provider.':
          locale.forgotPassword.reasonDeniedByProvider,
      };
      const mapped = error.message
        ? error.message.startsWith(emailFailurePrefix)
          ? (() => {
              const detail = error
                .message!.slice(emailFailurePrefix.length)
                .trim();
              return `${locale.forgotPassword.emailDeliveryFailedPrefix} ${knownReasons[detail] ?? detail}`;
            })()
          : knownMessages[error.message]
        : undefined;
      // Backend errors are English-only otherwise — fall back to the localized
      // generic message in Spanish instead of leaking raw English text.
      const fallback =
        language === 'es' ? locale.forgotPassword.otpSendFailed : error.message;
      const message = mapped || fallback || locale.forgotPassword.otpSendFailed;
      setSubmitError(message);
      toast.error(message);
    }
  };

  return (
    <div className="h-screen flex items-center justify-center p-6 overflow-y-auto no-scrollbar">
      <div className="flex w-full max-w-[900px] min-h-[420px] overflow-hidden rounded-[35px] bg-white shadow-2xl">
        <div className="flex flex-col justify-center px-10 py-10 w-full lg:w-1/2">
          <div className="mb-5 flex justify-center">
            <Logo />
          </div>
          <h2 className="text-2xl font-bold mb-6 text-center lg:text-left pb-3 text-primary-500 border-b-[0.76px] border-[#E2E1E1]">
            {locale.forgotPassword.title}
          </h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSubmit();
            }}
            noValidate
            className="flex flex-col gap-3"
          >
            <Input
              name="email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setValidationError('');
                setSubmitError('');
                dispatch(resetError());
              }}
              aria-invalid={validationError ? true : undefined}
              aria-describedby={validationError ? emailErrorId : undefined}
              label={locale.forgotPassword.emailLabel}
              placeholder={locale.forgotPassword.emailPlaceholder}
              required
            />
            {validationError && (
              <p
                id={emailErrorId}
                role="alert"
                className="mt-2 text-xs text-red-500"
              >
                {validationError}
              </p>
            )}
            {submitError && (
              <p role="alert" className="mt-2 text-xs text-red-500">
                {submitError}
              </p>
            )}
            <div className="flex justify-center mt-6 lg:justify-start">
              <Button
                type="submit"
                variant="gradient"
                loading={status === 'loading'}
                loadingText={locale.forgotPassword.loadingSubmit}
              >
                {locale.forgotPassword.submit}
              </Button>
            </div>
          </form>
          <p className="mt-5 text-sm text-center text-gray-500">
            {locale.forgotPassword.backTo}{' '}
            <button
              type="button"
              className="font-semibold text-gray-800 hover:underline"
              onClick={() => navigate(ROUTE_PATHS.auth.login)}
            >
              {locale.forgotPassword.signIn}
            </button>
          </p>
        </div>
        <div className="hidden md:block md:w-1/2">
          <img src={loginImage} alt="" className="w-full h-full object-cover" />
        </div>
      </div>
    </div>
  );
}
