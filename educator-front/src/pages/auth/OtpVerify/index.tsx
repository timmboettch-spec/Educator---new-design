import loginImage from '@/assets/redeem/RW AI UI orange gradient -07.jpg';
import { useAuthLanguage } from '@/hooks/useAuthLanguage';
import { useTranslation } from 'react-i18next';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { useLocation, useNavigate } from 'react-router-dom';
import loginEn from '../../../locales/auth/login/en.json';
import loginEs from '../../../locales/auth/login/es.json';
import Logo from '../../../components/logo/Logo';
import { Button } from '../../../components/ui/Button';
import { toast } from '../../../components/common/Toast';
import { useAppDispatch } from '../../../store/hooks';
import {
  VerifyOTPRequest,
  verifyOTP,
  selectVerifyOTPStatus,
} from '../../../redux/auth/VerifyOTPRedux';
import { AUTH_MESSAGES } from '../../../utils/messages/auth';
import { ResendOTPRequest } from '../../../redux/auth/ResendOTPRedux';
import { ROUTE_PATHS } from '../../../routes/routePath';

const RESEND_COOLDOWN_SECONDS = 300;

export default function OtpVerify() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const location = useLocation();
  const { language } = useAuthLanguage();
  const { t } = useTranslation(['common', 'auth']);

  const locale = useMemo(
    () => (language === 'es' ? loginEs : loginEn),
    [language]
  );

  const email: string | undefined = location.state?.email;
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const status = useSelector(selectVerifyOTPStatus);
  const [timeLeft, setTimeLeft] = useState(RESEND_COOLDOWN_SECONDS);
  const [isResending, setIsResending] = useState(false);
  const isSubmittingRef = useRef(false);

  useEffect(() => {
    if (timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft]);

  useEffect(() => {
    if (!email) {
      navigate(ROUTE_PATHS.auth.login);
    }
  }, []);

  const handleSubmit = async () => {
    if (isSubmittingRef.current) return;

    if (status === 'succeeded') {
      toast.error(
        locale.otpVerify.otpAlreadyUsed ||
          'OTP has already been used. Please reset a new OTP.'
      );
      return;
    }

    const otpValue = otp.join('');

    // Validate OTP is not empty
    if (!otpValue.trim()) {
      toast.error(
        locale.otpVerify.otpRequired || AUTH_MESSAGES.VALIDATION.OTP_REQUIRED
      );
      return;
    }

    if (!email) return;

    isSubmittingRef.current = true;
    try {
      const res = await dispatch(
        VerifyOTPRequest({
          email,
          otp: otpValue,
        })
      ).unwrap();
      const message =
        language === 'es'
          ? locale.otpVerify.otpVerifiedSuccess || 'OTP verificado con éxito'
          : res.message ||
            locale.otpVerify.otpVerifiedSuccess ||
            'OTP verified successfully';
      toast.success(message);

      setOtp(['', '', '', '', '', '']);
      dispatch(verifyOTP());

      navigate(ROUTE_PATHS.auth.resetPassword, {
        state: { email, otp: otpValue },
        replace: true,
      });
    } catch (err: unknown) {
      let msg =
        (err as { message?: string })?.message ||
        locale.otpVerify.otpVerifyFailed ||
        'OTP verification failed';
      msg = msg.replace(/\botp\b/gi, 'OTP');
      toast.error(msg);
      setOtp(['', '', '', '', '', '']);
      setTimeout(() => {
        document.getElementById('otp-0')?.focus();
      }, 0);
    } finally {
      isSubmittingRef.current = false;
    }
  };

  const handleResend = async () => {
    if (!email || isResending) return;
    setIsResending(true);
    try {
      const res = await dispatch(
        ResendOTPRequest({
          email,
        })
      ).unwrap();

      const message =
        language === 'es'
          ? locale.otpVerify.otpResentSuccess || 'OTP reenviado con éxito'
          : (res as { message?: string })?.message ||
            locale.otpVerify.otpResentSuccess ||
            'OTP resent successfully';
      toast.success(message);
      // Restart the cooldown only once a new code is actually on its way, so a
      // failed resend can be retried straight away.
      setTimeLeft(RESEND_COOLDOWN_SECONDS);
      setOtp(['', '', '', '', '', '']);
      setTimeout(() => {
        document.getElementById('otp-0')?.focus();
      }, 0);
    } catch (err: unknown) {
      // Backend prefixes mail-provider failures with a fixed English string, followed by a
      // provider error detail — translate both the prefix and any known detail phrase.
      const emailFailurePrefix =
        'Email delivery failed (Azure Communication Services):';
      const knownReasons: Record<string, string | undefined> = {
        'Denied by the resource provider.':
          locale.otpVerify.reasonDeniedByProvider,
      };
      const rawMsg = (err as { message?: string })?.message;
      let msg = rawMsg?.startsWith(emailFailurePrefix)
        ? (() => {
            const detail = rawMsg.slice(emailFailurePrefix.length).trim();
            return `${locale.otpVerify.emailDeliveryFailedPrefix} ${knownReasons[detail] ?? detail}`;
          })()
        : language === 'es'
          ? locale.otpVerify.otpResendFailed
          : rawMsg || locale.otpVerify.otpResendFailed;
      msg = msg.replace(/\botp\b/gi, 'OTP');
      toast.error(msg);
    } finally {
      setIsResending(false);
    }
  };

  const formatTime = (seconds: number) => {
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
  };

  const handleChange = (value: string, index: number) => {
    if (!/^\d?$/.test(value)) return; // allow only single digit

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    if (value && index < 5) {
      document.getElementById(`otp-${index + 1}`)?.focus();
    }
  };

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    index: number
  ) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      document.getElementById(`otp-${index - 1}`)?.focus();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const isOtpComplete = otp.every((digit) => digit !== '');
      if (isOtpComplete && status !== 'loading') {
        handleSubmit();
      }
    }
  };
  const handlePaste = (
    e: React.ClipboardEvent<HTMLInputElement>,
    index: number
  ) => {
    e.preventDefault();
    const pastedData = e.clipboardData
      .getData('text')
      .replace(/\D/g, '')
      .slice(0, 6);
    if (!pastedData) return;

    const newOtp = [...otp];
    for (let i = 0; i < pastedData.length; i++) {
      if (index + i < 6) {
        newOtp[index + i] = pastedData.charAt(i);
      }
    }
    setOtp(newOtp);

    const nextIndex = Math.min(index + pastedData.length, 5);
    document.getElementById(`otp-${nextIndex}`)?.focus();
  };

  return (
    <div className="h-screen flex items-center justify-center p-6 overflow-y-auto no-scrollbar">
      <div className="flex w-full max-w-[900px] min-h-[420px] overflow-hidden rounded-[35px] bg-white shadow-2xl">
        <div className="flex flex-col justify-center px-10 py-10 w-full lg:w-1/2">
          <div className="mb-5 flex justify-center">
            <Logo />
          </div>
          <h2 className="text-2xl font-bold mb-6 text-center lg:text-left pb-3 text-primary-500 border-b-[0.76px] border-[#E2E1E1]">
            {locale.otpVerify.title}
          </h2>
          <div className="flex flex-col gap-3">
            <div
              role="group"
              aria-label={t('common:a11y.otpCode')}
              className="flex gap-2 sm:gap-3 justify-center lg:justify-start"
            >
              {otp.map((digit, index) => (
                <input
                  key={index}
                  id={`otp-${index}`}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={1}
                  value={digit}
                  aria-label={t('common:a11y.otpDigit', {
                    index: index + 1,
                    total: otp.length,
                  })}
                  onChange={(e) => handleChange(e.target.value, index)}
                  onKeyDown={(e) => handleKeyDown(e, index)}
                  onPaste={(e) => handlePaste(e, index)}
                  className="min-w-0 flex-1 max-w-[48px] aspect-square sm:flex-none sm:w-12 sm:h-12 text-center text-lg font-semibold border-2 border-gray-300 rounded-md focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-400"
                />
              ))}
            </div>
          </div>
          {timeLeft > 0 ? (
            <p className="mt-5 text-sm text-gray-500">
              {(locale.otpVerify.resendTimer ?? 'Resend OTP in {time}').replace(
                '{time}',
                formatTime(timeLeft)
              )}
            </p>
          ) : (
            <button
              type="button"
              className="mt-5 text-left font-semibold text-gray-800 hover:underline disabled:cursor-not-allowed disabled:text-gray-500 disabled:no-underline"
              onClick={() => void handleResend()}
              disabled={isResending}
              aria-busy={isResending}
            >
              {isResending
                ? t('auth:otp.resending')
                : locale.otpVerify.resendButton}
            </button>
          )}
          <div className="flex justify-center mt-6 lg:justify-start">
            <Button
              variant="gradient"
              onClick={handleSubmit}
              loading={status === 'loading'}
              loadingText={locale.otpVerify.loadingSubmit}
            >
              {locale.otpVerify.submit}
            </Button>
          </div>
          <p className="mt-5 text-sm text-center text-gray-500">
            {locale.otpVerify.backTo}{' '}
            <button
              type="button"
              className="font-semibold text-gray-800 hover:underline"
              onClick={() => navigate(ROUTE_PATHS.auth.login)}
            >
              {locale.otpVerify.signIn}
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
