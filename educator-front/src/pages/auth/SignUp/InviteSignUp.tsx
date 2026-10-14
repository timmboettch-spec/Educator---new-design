'use client';

import loginImage from '@/assets/redeem/RW AI UI orange gradient -07.jpg';
import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import Logo from '../../../components/logo/Logo';
import { Button } from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import {
  AcceptInviteRequest,
  logout as logoutAcceptInvite,
  selectAcceptInviteStatus,
} from '../../../redux/auth/AcceptInviteRedux';
import { useAppDispatch } from '../../../store/hooks';
import { COMMON_VALIDATION } from '../../../utils/messages/common';
import { VerifyInviteRequest } from '../../../redux/auth/VerifyInviteRedux';
import { toast } from '../../../components/common/Toast';
import { isValidPassword } from '../../../utils/validation';
import {
  hasUnsafePasswordPattern,
  sanitizePasswordForTyping,
} from '../../../utils/inputSecurity';
import {
  clearAuthData,
  getToken,
  setAuthData,
  setSecondaryAuthData,
} from '@/utils/storage';
import { getStoredUser } from '@/utils/storage';
import ConfirmModal from '@/components/modal/ConfirmationModal';
import { DualRoleSignUpRequest } from '@/redux/auth/DualRoleSignUpRedux';
import { logout as logoutLogin, restoreSession } from '@/redux/auth/LoginRedux';
import loginEn from '../../../locales/auth/login/en.json';
import loginEs from '../../../locales/auth/login/es.json';

type InviteStatus = 'verifying' | 'ready' | 'unavailable';

const initialFormData = {
  full_name: '',
  email: '',
  password: '',
  confirmPassword: '',
  phoneNumber: '',
  rememberMe: false,
};

export default function SignUpPage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const status = useSelector(selectAcceptInviteStatus);
  const { t, i18n } = useTranslation('auth');
  const [formData, setFormData] = useState(initialFormData);
  const [validationError, setValidationError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [isOpen, setOpen] = useState(false);
  const { invite_id } = useParams();
  const [inviteStatus, setInviteStatus] = useState<InviteStatus>(
    invite_id ? 'verifying' : 'unavailable'
  );
  const token = getToken();
  const userData = getStoredUser();
  const user = userData && JSON.parse(userData);
  const language =
    localStorage.getItem('app_language')?.toLowerCase() === 'es' ? 'es' : 'en';
  const locale = language === 'es' ? loginEs : loginEn;
  const isEmail = user?.email;
  const isAuthenticated = !!token && token !== 'undefined' && token !== 'null';

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    let sanitized: string | boolean = type === 'checkbox' ? checked : value;
    if (name === 'password' || name === 'confirmPassword') {
      sanitized = sanitizePasswordForTyping(value);
    }
    setFormData((prev) => ({ ...prev, [name]: sanitized }));
  };

  useEffect(() => {
    if (invite_id) {
      handleVerify();
    }
  }, [invite_id]);

  // Backend messages are English-only, so Spanish users get the translated
  // fallback instead of untranslated text.
  const getFailureMessage = (err: unknown) => {
    const message = (err as { message?: string } | undefined)?.message;
    return i18n.language === 'es' || !message
      ? t('invite.acceptFailed')
      : message;
  };

  const handleVerify = async () => {
    if (!invite_id) {
      setInviteStatus('unavailable');
      return;
    }
    setInviteStatus('verifying');
    try {
      const res = await dispatch(
        VerifyInviteRequest({
          token: invite_id,
        })
      ).unwrap();
      const email = res.data.email;
      const fullName = res.data.full_name;
      if (isAuthenticated && isEmail === email) {
        setOpen(true);
      } else if (isAuthenticated && isEmail !== email) {
        clearAuthData();
      }
      setFormData((prev) => ({
        ...prev,
        email: email,
        full_name: fullName,
      }));
      setInviteStatus('ready');
    } catch {
      setInviteStatus('unavailable');
    }
  };

  const handleSignup = async () => {
    setValidationError('');
    setSubmitError('');
    if (!invite_id) return;

    if (!formData.password || !formData.confirmPassword) {
      setValidationError(COMMON_VALIDATION.REQUIRED);
      return;
    }

    if (!isValidPassword(formData.password)) {
      setValidationError(COMMON_VALIDATION.PASSWORD_COMPLEXITY);
      return;
    }

    if (hasUnsafePasswordPattern(formData.password)) {
      setValidationError('Password cannot include HTML or script-like content');
      return;
    }

    if (!isValidPassword(formData.confirmPassword)) {
      setValidationError(COMMON_VALIDATION.PASSWORD_COMPLEXITY);
      return;
    }

    if (hasUnsafePasswordPattern(formData.confirmPassword)) {
      setValidationError('Password cannot include HTML or script-like content');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setValidationError('Passwords do not match');
      return;
    }
    try {
      // Name and email come from the invite itself; accept-invite only needs
      // the token and the password being set.
      const res = await dispatch(
        AcceptInviteRequest({
          token: invite_id,
          password: formData.password,
        })
      ).unwrap();
      dispatch(logoutAcceptInvite());
      // accept-invite no longer signs the user in — they log in with the
      // password they just set.
      clearAuthData();
      dispatch(logoutLogin());
      toast.success(res.message || locale.toast.inviteAcceptedSignIn);
      navigate('/login', { replace: true });
    } catch (err: unknown) {
      const message = getFailureMessage(err);
      setSubmitError(message);
      toast.error(message);
    }
  };

  const onConfirm = async () => {
    try {
      const res = await dispatch(
        DualRoleSignUpRequest({
          full_name: user?.full_name,
          email: user?.email,
          invite_id: invite_id || undefined,
        })
      ).unwrap();

      if (
        res.data?.has_dual_role &&
        res.data?.educator_tokens &&
        res.data?.educator_user
      ) {
        setSecondaryAuthData(
          {
            accessToken: res.data.tokens.accessToken,
            csrfToken: '',
          },
          res.data.user,
          false
        );
        setAuthData(
          {
            accessToken: res.data.educator_tokens.accessToken,
            csrfToken: '',
          },
          res.data.educator_user,
          false
        );
        dispatch(
          restoreSession({
            data: {
              tokens: { accessToken: res.data.educator_tokens.accessToken },
              user: res.data.educator_user as unknown as Record<
                string,
                unknown
              >,
            },
            message: '',
            status: 'success',
          })
        );

        setOpen(false);
        window.dispatchEvent(new Event('profile-updated'));
        navigate('/educator-dashboard', { replace: true });
        return;
      }
      toast.success(res.message);
      navigate('/login');
    } catch (err: unknown) {
      toast.error(getFailureMessage(err));
    }
  };

  return (
    <>
      <ConfirmModal
        title="This email address is already associated with an Admin account."
        message="Would you like to set up the Educator role for this existing account?"
        onConfirm={onConfirm}
        onCancel={() => setOpen(false)}
        isOpen={isOpen}
        onClose={() => setOpen(false)}
        cancelText="Cancel"
        confirmText="Yes, Set Up Educator"
      />
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="flex w-full max-w-[900px] min-h-[420px] overflow-hidden rounded-[35px] bg-white shadow-2xl">
          <div className="flex flex-col justify-center px-10 py-10 w-full lg:w-1/2">
            <div className="mb-5 flex justify-center">
              <Logo />
            </div>
            <h2 className="text-2xl font-bold mb-6 text-center lg:text-left pb-3 text-primary-500 border-b-[0.76px] border-[#E2E1E1]">
              SIGN UP
            </h2>
            {inviteStatus === 'verifying' && (
              <p
                role="status"
                className="flex items-center gap-3 py-6 text-sm text-gray-500"
              >
                <span
                  aria-hidden="true"
                  className="h-5 w-5 animate-spin rounded-full border-2 border-primary-200 border-t-primary-500"
                />
                {t('invite.verifying')}
              </p>
            )}

            {inviteStatus === 'unavailable' && (
              <div role="alert" className="flex flex-col gap-2 py-2">
                <h3 className="text-base font-semibold text-gray-800">
                  {t('invite.unavailableTitle')}
                </h3>
                <p className="text-sm text-gray-500">
                  {t('invite.unavailableBody')}
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-3 lg:justify-start">
                  {invite_id && (
                    <Button
                      variant="gradient"
                      onClick={() => void handleVerify()}
                    >
                      {t('invite.retry')}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    className="rounded-full px-8 text-[16px] font-semibold"
                    onClick={() => navigate('/login', { replace: true })}
                  >
                    {t('invite.goToSignIn')}
                  </Button>
                </div>
              </div>
            )}

            {inviteStatus === 'ready' && (
              <>
                <div className="flex flex-col gap-3">
                  <Input
                    name="full_name"
                    type="text"
                    value={formData.full_name}
                    onChange={handleChange}
                    placeholder="Full Name *"
                    required
                    disabled
                  />
                  <Input
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="Email *"
                    required
                    disabled
                  />
                  <Input
                    name="password"
                    type="password"
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="Password"
                  />
                  <Input
                    name="confirmPassword"
                    type="password"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    placeholder="Confirm Password"
                  />
                </div>

                {validationError && (
                  <p role="alert" className="mt-2 text-sm text-red-500">
                    {validationError}
                  </p>
                )}

                {submitError && (
                  <p role="alert" className="mt-2 text-sm text-red-500">
                    {submitError}
                  </p>
                )}

                {/* Submit Button */}
                <div className="flex justify-center mt-6 lg:justify-start">
                  <Button
                    variant="gradient"
                    onClick={handleSignup}
                    loading={status === 'loading'}
                    loadingText={locale.signup.loadingSubmit}
                  >
                    Sign Up →
                  </Button>
                </div>
              </>
            )}

            {/* Sign In Link */}
            <p className="mt-5 text-sm text-center text-gray-500">
              Already have an account?{' '}
              <button
                type="button"
                className="font-semibold text-gray-800 hover:underline"
                onClick={() => navigate('/login')}
              >
                Sign In
              </button>
            </p>
          </div>

          {/* Right: Image */}
          <div className="hidden md:block md:w-1/2">
            <img
              src={loginImage}
              alt=""
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      </div>
    </>
  );
}
