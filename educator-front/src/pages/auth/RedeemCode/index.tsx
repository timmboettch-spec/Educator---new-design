import { useFormik } from 'formik';
import { type ClipboardEvent, useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import * as Yup from 'yup';
import RedeemKeyIcon from '@/assets/redeem/redeemKey.png';
import RedeemHeader from '@/components/common/RedeemHeader';
import { toast, sonnerToast } from '../../../components/common/Toast';
import { Button } from '@/components/ui/Button';
import {
  clearRedeemError,
  RedeemRequest,
  selectRedeemError,
} from '@/redux/auth/RedeemRedux';
import { useAppDispatch } from '@/store/hooks';
import { fetchCurrentUser } from '../../../redux/auth/MeRedux';
import { AUTH_MESSAGES } from '../../../utils/messages/auth';
import {
  updateStoredUser,
  clearAuthData,
  getToken,
  getParsedUser,
  setAuthData,
  isRememberMe,
} from '../../../utils/storage';
import { restoreSession } from '../../../redux/auth/LoginRedux';
import { useNavigate } from 'react-router-dom';
import Input from '@/components/ui/Input';
import loginEn from '../../../locales/auth/login/en.json';
import loginEs from '../../../locales/auth/login/es.json';
import {
  clearRedeemSkipped,
  markRedeemSkipped,
} from '../../../utils/trialState';

type SupportedLang = 'en' | 'es';

const LANGUAGE_STORAGE_KEY = 'app_language';

const getStoredLanguage = (): SupportedLang => {
  if (typeof window === 'undefined') {
    return 'en';
  }

  const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY)?.toLowerCase();
  return saved === 'es' ? 'es' : 'en';
};

interface RedeemCodeProps {
  isModal?: boolean;
  onSubmitSubscribe?: (code: string) => void;
  isLoading?: boolean;
}

const RedeemCode = ({
  isModal = false,
  onSubmitSubscribe,
  isLoading = false,
}: RedeemCodeProps) => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const language = getStoredLanguage();
  const locale = language === 'es' ? loginEs : loginEn;
  const redeemCopy = {
    title:
      locale?.redeem?.title ??
      AUTH_MESSAGES.TITLES.ENTER_REDEEM_CODE ??
      'Enter Your Redeem Code',
    subtitle:
      locale?.redeem?.subtitle ??
      AUTH_MESSAGES.LABELS.ENTER_REDEEM_CODE_SUBTITLE ??
      'Your account has been provisioned with full access privileges.',
    trial:
      locale?.redeem?.trial ?? AUTH_MESSAGES.BUTTONS.TRIAL ?? 'Start Trial',
    activeLicense:
      locale?.redeem?.activeLicense ?? AUTH_MESSAGES.BUTTONS.ACTIVE_LICENSE,
    licenseActivated: locale?.redeem?.licenseActivated ?? 'License Activated',
    loading: locale?.redeem?.loading ?? 'Loading...',
    requiredError:
      locale?.redeem?.requiredError ??
      AUTH_MESSAGES.VALIDATION.REDEEM_CODE_REQUIRED,
    lengthError:
      locale?.redeem?.lengthError ??
      AUTH_MESSAGES.VALIDATION.REDEEM_CODE_LENGTH,
  };
  const redeemError = useSelector(selectRedeemError);
  const [redeemCodeSegments, setRedeemCodeSegments] = useState([
    '',
    '',
    '',
    '',
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([
    null,
    null,
    null,
    null,
  ]);

  const normalizeRedeemValue = (rawValue: string) =>
    rawValue
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 16);

  useEffect(() => {
    (async () => {
      await dispatch(clearRedeemError());
    })();
  }, []);

  const handleLogin = async () => {
    try {
      const res = await dispatch(
        RedeemRequest({
          code: redeemCodeFormik.values.code,
        })
      ).unwrap();
      // Redeem can rotate the access token when the license activates; persist
      // it before the follow-up authenticated call below or that call 401s
      // with the stale token and forceLogout wins the race against navigate().
      if (res.token) {
        setAuthData(
          { accessToken: res.token },
          getParsedUser() ?? {},
          isRememberMe()
        );
      }
      updateStoredUser({ is_license_active: true });
      try {
        // fetchCurrentUser stores the refreshed profile (seats included).
        await dispatch(fetchCurrentUser()).unwrap();
        updateStoredUser({ is_license_active: true });
      } catch {
        // non-critical, ignore
      }
      // Sync Redux state immediately so route guards see the updated license
      const token = getToken();
      const updatedUser = getParsedUser();
      if (token && updatedUser) {
        dispatch(
          restoreSession({
            data: { tokens: { accessToken: token }, user: updatedUser },
            message: '',
            status: 'success',
          })
        );
      }
      const successMsg =
        (res as { message?: string })?.message ??
        (language === 'es'
          ? 'Licencia activada con éxito'
          : 'License activated successfully');
      sonnerToast.success(successMsg);
      setIsSuccess(true);
      setTimeout(() => {
        navigate('/admin-dashboard', { replace: true });
      }, 2000);
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message;
      toast.error(
        msg ||
          (language === 'es' ? 'Error al canjear el código' : 'Redeem failed')
      );
      setRedeemCodeSegments(['', '', '', '']);
      redeemCodeFormik.setFieldValue('code', '');
      redeemCodeFormik.setFieldTouched('code', false);
      await dispatch(clearRedeemError());
      setIsSubmitting(false);
      setTimeout(() => {
        inputRefs.current[0]?.focus();
      }, 0);
    }
  };

  const redeemCodeFormik = useFormik({
    initialValues: { code: '' },
    validationSchema: Yup.object().shape({
      code: Yup.string()
        .length(16, redeemCopy.lengthError)
        .required(redeemCopy.requiredError),
    }),
    onSubmit: async () => {
      if (isSubmitting) return;
      setIsSubmitting(true);
      if (onSubmitSubscribe) {
        try {
          await onSubmitSubscribe(redeemCodeFormik.values.code);
        } catch {
          setIsSubmitting(false);
        }
      } else {
        await handleLogin();
      }
    },
  });

  const handleRedeemChange = async (value: string, index: number) => {
    const normalizedValue = normalizeRedeemValue(value);

    // Full-code paste fallback: distribute across all 4 inputs.
    if (normalizedValue.length > 4) {
      const distributedSegments = [0, 1, 2, 3].map((i) =>
        normalizedValue.slice(i * 4, i * 4 + 4)
      );
      setRedeemCodeSegments(distributedSegments);
      redeemCodeFormik.setFieldValue('code', distributedSegments.join(''));

      if (redeemError) await dispatch(clearRedeemError());
      const nextInputIndex = Math.min(Math.ceil(normalizedValue.length / 4), 3);
      inputRefs.current[nextInputIndex]?.focus();
      return;
    }

    const newSegments = [...redeemCodeSegments];
    newSegments[index] = normalizedValue.slice(0, 4);
    setRedeemCodeSegments(newSegments);
    redeemCodeFormik.setFieldValue('code', newSegments.join(''));

    if (redeemError) await dispatch(clearRedeemError());
    if (normalizedValue.length >= 4 && index < 3) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleRedeemPaste = async (
    e: ClipboardEvent<HTMLInputElement>,
    index: number
  ) => {
    const pastedText = e.clipboardData.getData('text');
    const normalizedValue = normalizeRedeemValue(pastedText);
    if (!normalizedValue) return;

    e.preventDefault();

    const newSegments = [...redeemCodeSegments];

    if (normalizedValue.length > 4) {
      for (let i = 0; i < 4; i += 1) {
        newSegments[i] = normalizedValue.slice(i * 4, i * 4 + 4);
      }
    } else {
      newSegments[index] = normalizedValue;
    }

    setRedeemCodeSegments(newSegments);
    redeemCodeFormik.setFieldValue('code', newSegments.join(''));

    if (redeemError) await dispatch(clearRedeemError());
    const nextInputIndex = Math.min(
      Math.ceil(newSegments.join('').length / 4),
      3
    );
    inputRefs.current[nextInputIndex]?.focus();
  };

  return (
    <div className={isModal ? '' : 'min-h-screen flex flex-col'}>
      {!isModal && (
        <RedeemHeader
          onClickSignout={() => {
            clearAuthData();
            clearRedeemSkipped();
            window.location.href = '/login';
          }}
        />
      )}

      <div
        className={`flex flex-col items-center justify-center px-4 py-10 ${!isModal ? 'flex-1' : ''}`}
      >
        <div className="bg-white rounded-[32px] shadow-[0_20px_60px_rgba(0,0,0,0.07)] w-full max-w-[500px] px-8 py-10 flex flex-col items-center">
          <div className="w-14 h-14 bg-[#FFF5ED] rounded-full flex items-center justify-center mb-5 border border-primary-50">
            <img
              src={RedeemKeyIcon}
              alt="Redeem Key Icon"
              className="w-12 h-12"
            />
          </div>

          <h3 className="font-bold text-[22px] text-primary-500 mb-2 text-center">
            {redeemCopy.title}
          </h3>
          <p className="text-gray-500 text-sm mb-7 text-center max-w-[356px] leading-relaxed">
            {redeemCopy.subtitle}
          </p>

          <form
            onSubmit={redeemCodeFormik.handleSubmit}
            className="w-full flex flex-col items-center"
          >
            <div className="flex items-center gap-2 mb-3">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    id={`redeem-${i}`}
                    ref={(el) => {
                      inputRefs.current[i] = el;
                    }}
                    type="text"
                    maxLength={4}
                    placeholder="XXXX"
                    value={redeemCodeSegments[i]}
                    onChange={(e) => handleRedeemChange(e.target.value, i)}
                    onPaste={(e) => {
                      void handleRedeemPaste(e, i);
                    }}
                    onKeyDown={(e) => {
                      if (
                        e.key === 'Backspace' &&
                        !redeemCodeSegments[i] &&
                        i > 0
                      ) {
                        inputRefs.current[i - 1]?.focus();
                      }
                    }}
                    className="w-auto"
                    inputClassName={`!px-0 w-[90px] h-[38px] text-center font-bold text-sm
                        uppercase rounded-xl bg-white leading-[38px] placeholder:text-gray-300
                        placeholder:text-center placeholder:tracking-normal tracking-[2px] transition-all
                        shadow-sm
                        ${
                          redeemError
                            ? 'border-red-300 bg-red-50'
                            : 'border border-dashed border-gray-300 focus:border-primary-400 focus:border-solid'
                        }
                        `}
                  />
                  {i < 3 && (
                    <span className="text-gray-300 text-lg select-none font-light">
                      ·
                    </span>
                  )}
                </div>
              ))}
            </div>
            {redeemCodeFormik.errors.code && redeemCodeFormik.touched.code && (
              <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-yellow-50 border border-yellow-100 rounded-xl w-full">
                <svg
                  className="w-4 h-4 text-yellow-400 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                  />
                </svg>
                <p className="text-yellow-600 text-xs font-medium">
                  {redeemCodeFormik.errors.code}
                </p>
              </div>
            )}
            <div
              className={`flex w-full mt-4 ${isModal ? 'justify-end' : 'items-center justify-between'}`}
            >
              {!isModal && (
                <button
                  type="button"
                  onClick={() => {
                    markRedeemSkipped();
                    window.location.href = '/simulation-catalog';
                  }}
                  className="px-6 h-[44px] rounded-full bg-[#BEC1C4] hover:bg-[#aeb1b4] text-gray-700 font-semibold text-sm transition-colors"
                >
                  {redeemCopy.trial}
                </button>
              )}
              <Button
                type="submit"
                disabled={isLoading || isSubmitting || isSuccess}
                className="px-7 h-[44px] bg-primary-500 hover:bg-primary-600 rounded-full text-white font-bold text-sm flex items-center gap-2 shadow-[0_8px_20px_rgba(249,115,22,0.3)] hover:scale-[1.02] active:scale-95 transition-all"
              >
                {isSuccess
                  ? redeemCopy.licenseActivated
                  : isLoading || isSubmitting
                    ? redeemCopy.loading
                    : redeemCopy.activeLicense}
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M14 5l7 7m0 0l-7 7m7-7H3"
                  />
                </svg>
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default RedeemCode;
