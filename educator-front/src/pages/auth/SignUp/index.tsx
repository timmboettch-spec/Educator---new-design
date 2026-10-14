'use client';

import loginImage from '@/assets/redeem/RW AI UI orange gradient -07.jpg';
import React, { useMemo, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import Logo from '../../../components/logo/Logo';
import { Button } from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import loginEn from '../../../locales/auth/login/en.json';
import loginEs from '../../../locales/auth/login/es.json';
import {
  selectSignUpStatus,
  SignUpRequest,
} from '../../../redux/auth/SignUpRedux';
import { useAppDispatch } from '../../../store/hooks';
import { isValidEmail, isValidPassword } from '../../../utils/validation';
import { toast } from '../../../components/common/Toast';
import { setAuthData } from '../../../utils/storage';
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

type SupportedLang = 'en' | 'es';
type ValidationErrorKey = keyof typeof loginEn.validation;

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

const initialFormData = {
  full_name: '',
  email: '',
  password: '',
  confirmPassword: '',
  rememberMe: false,
};

export default function SignUpPage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const status = useSelector(selectSignUpStatus);
  const [language] = useState<SupportedLang>(getInitialLanguage);
  const [formData, setFormData] = useState(initialFormData);
  const [validationErrorKey, setValidationErrorKey] = useState<
    ValidationErrorKey | ''
  >('');
  const isSubmittingRef = useRef(false);
  const SIGNUP_NAME_MAX_LENGTH = 50;

  const locale = useMemo(
    () => (language === 'es' ? loginEs : loginEn),
    [language]
  );
  const errorMsg = validationErrorKey
    ? locale.validation[validationErrorKey]
    : '';

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
      )
        return;
    } else if (name === 'email' && typeof sanitized === 'string') {
      sanitized = sanitizeTextForTyping(sanitized, 254).replace(/[<>"'`]/g, '');
    } else if (name === 'password' || name === 'confirmPassword') {
      sanitized = sanitizePasswordForTyping(value);
    }
    setFormData((prev) => ({ ...prev, [name]: sanitized }));
    if (validationErrorKey) setValidationErrorKey('');
  };

  const handleSignup = async () => {
    if (isSubmittingRef.current || status === 'loading') {
      return;
    }

    const fullName = trimBoundaryWhitespace(formData.full_name);
    if (!fullName) {
      setValidationErrorKey('fullNameRequired');
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
      setValidationErrorKey('fullNameUnsafe');
      return;
    }
    if (!formData.email.trim()) {
      setValidationErrorKey('emailRequired');
      return;
    }
    if (!isValidEmail(formData.email)) {
      setValidationErrorKey('invalidEmail');
      return;
    }
    if (
      hasUnsafeMarkupOrScriptPattern(formData.email) ||
      hasBlockedCodingKeyword(formData.email) ||
      hasCodeLikeSyntaxPattern(formData.email)
    ) {
      setValidationErrorKey('emailUnsafe');
      return;
    }
    if (!formData.password) {
      setValidationErrorKey('passwordRequired');
      return;
    }
    if (hasUnsafePasswordPattern(formData.password)) {
      setValidationErrorKey('unsafePassword');
      return;
    }
    if (!isValidPassword(formData.password)) {
      setValidationErrorKey('passwordLength');
      return;
    }
    if (!formData.confirmPassword) {
      setValidationErrorKey('confirmPasswordRequired');
      return;
    }
    if (hasUnsafePasswordPattern(formData.confirmPassword)) {
      setValidationErrorKey('unsafePassword');
      return;
    }
    if (!isValidPassword(formData.confirmPassword)) {
      setValidationErrorKey('confirmPasswordLength');
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      setValidationErrorKey('passwordMismatch');
      return;
    }
    setValidationErrorKey('');
    isSubmittingRef.current = true;

    try {
      const res = await dispatch(
        SignUpRequest({
          fullName,
          email: formData.email,
          password: formData.password,
        })
      ).unwrap();
      // Signup auto-authenticates (see SignUpRedux) and AppRouter's
      // isAuthenticated check lets that carry the user past /login while
      // Redux state is alive — but without persisting it here, any hard
      // navigation (e.g. redeem's "Start Trial") wipes that in-memory state
      // and strands the user back on /login.
      if (res.data?.tokens?.accessToken && res.data?.user) {
        setAuthData(res.data.tokens, res.data.user, false);
      }
      toast.success(res.message || locale.toast.accountCreated);
      navigate('/login', { replace: true });
    } catch (err: unknown) {
      const msg =
        typeof err === 'string'
          ? err
          : (err as { message?: string })?.message || locale.toast.genericError;
      toast.error(msg);
    } finally {
      isSubmittingRef.current = false;
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
            {locale.signup.title}
          </h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSignup();
            }}
            noValidate
          >
            <div className="flex flex-col gap-3">
              <Input
                name="full_name"
                type="text"
                value={formData.full_name}
                onChange={handleChange}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSignup();
                  }
                }}
                label={locale.signup.fullNameLabel}
                placeholder={locale.signup.fullNamePlaceholder}
                required
              />
              <Input
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSignup();
                  }
                }}
                label={locale.signup.emailLabel}
                placeholder={locale.signup.emailPlaceholder}
                required
              />
              <Input
                name="password"
                type="password"
                value={formData.password}
                onChange={handleChange}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSignup();
                  }
                }}
                label={locale.signup.passwordLabel}
                placeholder={locale.signup.passwordPlaceholder}
                required
              />
              <Input
                name="confirmPassword"
                type="password"
                value={formData.confirmPassword}
                onChange={handleChange}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSignup();
                  }
                }}
                label={locale.signup.confirmPasswordLabel}
                placeholder={locale.signup.confirmPasswordPlaceholder}
                required
              />
              {errorMsg && (
                <p role="alert" className="mt-1 text-xs text-red-500">
                  {errorMsg}
                </p>
              )}
            </div>

            {/* Submit Button */}
            <div className="flex justify-center mt-6 lg:justify-start">
              <Button
                variant="gradient"
                type="submit"
                loading={status === 'loading'}
                loadingText={locale.signup.loadingSubmit}
              >
                {locale.signup.submit}
              </Button>
            </div>
          </form>

          {/* Sign In Link */}
          <p className="mt-5 text-sm text-center text-gray-500">
            {locale.signup.haveAccount}{' '}
            <button
              type="button"
              className="font-semibold text-gray-800 hover:underline"
              onClick={() => navigate('/login')}
            >
              {locale.signup.signIn}
            </button>
          </p>
        </div>

        {/* Right: Image */}
        <div className="hidden md:block md:w-1/2">
          <img src={loginImage} alt="" className="w-full h-full object-cover" />
        </div>
      </div>
    </div>
  );
}
