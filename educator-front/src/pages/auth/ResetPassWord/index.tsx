'use client';

import loginImage from '@/assets/redeem/RW AI UI orange gradient -07.jpg';
import { useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';

import Logo from '../../../components/logo/Logo';
import { Button } from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import { toast, sonnerToast } from '../../../components/common/Toast';
import { useAppDispatch } from '../../../store/hooks';
import {
  ResetPasswordRequest,
  selectResetPasswordStatus,
} from '../../../redux/auth/ResetPasswordRedux';
import { useLocation } from 'react-router-dom';
import { isValidPassword } from '../../../utils/validation';
import { COMMON_VALIDATION } from '../../../utils/messages/common';
import {
  hasUnsafePasswordPattern,
  sanitizePasswordForTyping,
} from '../../../utils/inputSecurity';

export default function ResetPassWord() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const status = useSelector(selectResetPasswordStatus);
  const location = useLocation();
  const token = location.state?.verified_token;
  const isSubmittingRef = useRef(false);
  const activeToastIdRef = useRef<string | number | undefined>(undefined);

  useEffect(() => {
    if (!token) navigate('/signin');
  }, [token, navigate]);

  const showError = (msg: string) => {
    if (activeToastIdRef.current !== undefined) {
      sonnerToast.dismiss(activeToastIdRef.current);
    }
    activeToastIdRef.current = sonnerToast.error(msg);
  };

  const handleSubmit = async () => {
    if (isSubmittingRef.current) return;

    if (!password) { showError('Password is required'); return; }
    if (hasUnsafePasswordPattern(password) || hasUnsafePasswordPattern(confirmPassword)) {
      showError('Password cannot include HTML or script-like content'); return;
    }
    if (!isValidPassword(password)) { showError(COMMON_VALIDATION.PASSWORD_COMPLEXITY); return; }
    if (password !== confirmPassword) { showError('Password not matched'); return; }

    isSubmittingRef.current = true;
    try {
      const res = await dispatch(
        ResetPasswordRequest({ verified_token: token, new_password: password }),
      ).unwrap();
      toast.success(res.message || 'Password reset successfully');
      navigate('/signin');
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message || 'Password reset failed';
      showError(msg);
    } finally {
      isSubmittingRef.current = false;
    }
  };

  return (
    <>
      <div className="h-screen flex items-center justify-center p-6 overflow-y-auto no-scrollbar">
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
              RESET PASSWORD
            </h2>
            <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} noValidate className="flex flex-col gap-3">
              <Input
                name="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(sanitizePasswordForTyping(e.target.value))}
                placeholder="New Password"
              />
              <Input
                name="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(sanitizePasswordForTyping(e.target.value))}
                placeholder="Confirm Password"
              />
              <div className="flex justify-center mt-6 lg:justify-start">
                <Button
                  type="submit"
                  variant="gradient"
                  loading={status === 'loading'}
                  loadingText="Signing up..."
                >
                  Set Password →
                </Button>
              </div>
            </form>
            <p className="mt-5 text-sm text-center text-gray-500">
              Back to{' '}
              <button
                type="button"
                className="font-semibold text-gray-800 hover:underline"
                onClick={() => navigate('/signin')}
              >
                Sign In
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
      </div>
    </>
  );
}
