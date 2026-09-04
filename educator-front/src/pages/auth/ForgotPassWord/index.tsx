'use client';

import loginImage from '@/assets/redeem/RW AI UI orange gradient -07.jpg';
import { useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { toast } from '../../../components/common/Toast';
import Logo from '../../../components/logo/Logo';
import { Button } from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import { useAppDispatch } from '../../../store/hooks';
import { isValidEmail } from '../../../utils/validation';
import { COMMON_VALIDATION } from '../../../utils/messages/common';
import {
  ForgotPasswordRequest,
  selectForgotPasswordStatus,
  selectForgotPasswordError,
  resetError,
} from '../../../redux/auth/ForgotPasswordRedux';

export default function ForgotPassWord() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [email, setEmail] = useState('');
  const status = useSelector(selectForgotPasswordStatus);
  const apiError = useSelector(selectForgotPasswordError);
  const [validationError, setValidationError] = useState('');

  const handleSubmit = async (roleOverride?: string) => {
    setValidationError('');
    if (!isValidEmail(email)) {
      setValidationError(COMMON_VALIDATION.FORGOT_EMAIL);
      return;
    }
    dispatch(resetError());
    try {
      const res = await dispatch(
        ForgotPasswordRequest(roleOverride ? { email, role: roleOverride } : { email }),
      ).unwrap();
      toast.success(res.message || 'OTP sent successfully to your email');
      navigate('/otpverify', { state: { token: res.data.reset_token } });
    } catch (err: unknown) {
      const error = err as { message?: string };
      toast.error(error.message || 'Failed to send OTP');
    }
  };
  return (
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
            FORGOT PASSWORD
          </h2>
          <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} noValidate className="flex flex-col gap-3">
            <Input
              name="email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setValidationError('');
                dispatch(resetError());
              }}
              label="Email"
              placeholder="Email"
              required
            />
          {validationError && <p className="mt-2 text-xs text-red-500">{validationError}</p>}
          {apiError && status === 'failed' && (
            <p className="mt-2 text-xs text-red-500">{apiError}</p>
          )}
          <div className="flex justify-center mt-6 lg:justify-start">
            <Button
              type="submit"
              variant="gradient"
              loading={status === 'loading'}
              loadingText="Signing up..."
            >
              Send OTP →
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
  );
}
