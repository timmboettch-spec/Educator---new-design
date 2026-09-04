'use client';

import loginImage from '@/assets/redeem/RW AI UI orange gradient -07.jpg';
import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate, useParams } from 'react-router-dom';
import Logo from '../../../components/logo/Logo';
import { Button } from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import {
  selectSignUpError,
  selectSignUpStatus,
  SignUpRequest,
} from '../../../redux/auth/SignUpRedux';
import { useAppDispatch } from '../../../store/hooks';
import { COMMON_VALIDATION } from '../../../utils/messages/common';
import { VerifyInviteRequest } from '../../../redux/auth/VerifyInviteRedux';
import { toast } from '../../../components/common/Toast';
import { isValidPassword } from '../../../utils/validation';
import {
  hasUnsafeMarkupOrScriptPattern,
  hasDisallowedClassNameChars,
  hasSqlInjectionLikePattern,
  hasBlockedCodingKeyword,
  hasCodeLikeSyntaxPattern,
  hasNameCodeLikePattern,
  hasUnsafePasswordPattern,
  sanitizeTextForTyping,
  trimBoundaryWhitespace,
  sanitizePasswordForTyping,
} from '../../../utils/inputSecurity';
import { getToken, setAuthData, setSecondaryAuthData } from '@/utils/storage';
import { getStoredUser } from '@/utils/storage';
import ConfirmModal from '@/components/modal/ConfirmationModal';
import { DualRoleSignUpRequest } from '@/redux/auth/DualRoleSignUpRedux';
import { restoreSession } from '@/redux/auth/LoginRedux';

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
  const status = useSelector(selectSignUpStatus);
  const apiError = useSelector(selectSignUpError);
  const [formData, setFormData] = useState(initialFormData);
  const [validationError, setValidationError] = useState('');
  const [isOpen, setOpen] = useState(false);
  const { invite_id } = useParams();
  const SIGNUP_NAME_MAX_LENGTH = 50;
  const token = getToken();
  const userData = getStoredUser();
  const user = userData && JSON.parse(userData);
  const isEmail = user?.email;
  const isAuthenticated = !!token && token !== "undefined" && token !== "null";

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    let sanitized: string | boolean = type === 'checkbox' ? checked : value;
    if (name === 'full_name' && typeof sanitized === 'string') {
      sanitized = sanitizeTextForTyping(sanitized, SIGNUP_NAME_MAX_LENGTH)
        .replace(/^ /, '')
        .replace(/  +/g, ' ');
      if (sanitized.length === 1) sanitized = sanitized.toUpperCase();
      if (
        hasUnsafeMarkupOrScriptPattern(sanitized as string) ||
        hasBlockedCodingKeyword(sanitized as string) ||
        hasCodeLikeSyntaxPattern(sanitized as string) ||
        hasNameCodeLikePattern(sanitized as string)
      ) return;
    } else if (name === 'password' || name === 'confirmPassword') {
      sanitized = sanitizePasswordForTyping(value);
    }
    setFormData((prev) => ({ ...prev, [name]: sanitized }));
  };

  useEffect(() => {
    if (status === 'succeeded') {
      navigate('/login', { replace: true });
    }
  }, [status]);

  useEffect(() => {
    if (invite_id) {
      handleVerify();
    }
  }, [invite_id]);

  const handleVerify = async () => {
    if (!invite_id) {
      return;
    }
    try {
      const res = await dispatch(
        VerifyInviteRequest({
          invite_id: invite_id,
        }),
      ).unwrap();
      const email = res.data.email;
      const fullName = res.data.full_name;
      if (isAuthenticated && isEmail === email) {
        setOpen(true);
      }
      setFormData((prev) => ({
        ...prev,
        email: email,
        full_name: fullName,
      }));
    } catch (err: unknown) {
      const msg =
        (err as { message?: string })?.message ||
        'This invitation link is invalid or has expired.';
      toast.error(msg);
      navigate('/login', { replace: true });
      return;
    }
  };

  const handleSignup = async () => {
    setValidationError('');
    const fullName = trimBoundaryWhitespace(formData.full_name);

    if (!formData.full_name || !formData.email || !formData.password || !formData.confirmPassword) {
      setValidationError(COMMON_VALIDATION.REQUIRED);
      return;
    }

    if (
      hasUnsafeMarkupOrScriptPattern(fullName) ||
      hasDisallowedClassNameChars(fullName) ||
      hasSqlInjectionLikePattern(fullName) ||
      hasBlockedCodingKeyword(fullName) ||
      hasCodeLikeSyntaxPattern(fullName) ||
      hasNameCodeLikePattern(fullName)
    ) {
      setValidationError('Full name cannot include HTML, script, or code-like content');
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
      const res = await dispatch(
        SignUpRequest({
          full_name: fullName,
          email: formData.email,
          password: formData.password,
          invite_id: invite_id || undefined,
        }),
      ).unwrap();
      if (res.message) toast.success(res.message);
    } catch (err: unknown) {
      toast.error((err as Error)?.message || 'Something went wrong');
    }
  };

  const onConfirm = async () => {
    try {
      const res = await dispatch(
        DualRoleSignUpRequest({
          full_name: user?.full_name,
          email: user?.email,
          invite_id: invite_id || undefined,
        }),
      ).unwrap();

      if (
        res.data?.has_dual_role &&
        res.data?.educator_tokens &&
        res.data?.educator_user
      ) {
        // Store admin credentials in secondary slot
        setSecondaryAuthData(
          {
            accessToken: res.data.tokens.accessToken,
            csrfToken: '',
          },
          res.data.user,
          false,
        );

        // Set educator as primary
        setAuthData(
          {
            accessToken: res.data.educator_tokens.accessToken,
            csrfToken: '',
          },
          res.data.educator_user,
          false,
        );

        // Update Redux state to reflect educator role
        dispatch(restoreSession({
          data: {
            tokens: { accessToken: res.data.educator_tokens.accessToken },
            user: res.data.educator_user as unknown as Record<string, unknown>,
          },
          message: '',
          status: 'success',
        }));

        setOpen(false);
        window.dispatchEvent(new Event('profile-updated'));
        navigate('/educator-dashboard', { replace: true });
        return;
      }
      toast.success(res.message);
      navigate('/login');
    } catch (err: unknown) {
      toast.error(
        (err as { message?: string })?.message ||
        'Something went wrong',
      );
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
            <h2
              className="text-2xl font-bold mb-6 text-center lg:text-left pb-3"
              style={{
                borderBottom: '0.76px solid #E2E1E1',
                color: '#db8833',
                fontWeight: 700,
              }}
            >
              SIGN UP
            </h2>
            <div className="flex flex-col gap-3">
              <Input
                name="full_name"
                type="text"
                value={formData.full_name}
                onChange={handleChange}
                placeholder="Full Name *"
                required
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

            {validationError && <p className="mt-2 text-sm text-red-500">{validationError}</p>}

            {apiError && status === 'failed' && (
              <p className="mt-2 text-sm text-red-500">{apiError}</p>
            )}

            {/* Submit Button */}
            <div className="flex justify-center mt-6 lg:justify-start">
              <Button
                variant="gradient"
                onClick={handleSignup}
                loading={status === 'loading'}
                loadingText="Signing up..."
              >
                Sign Up →
              </Button>
            </div>

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

