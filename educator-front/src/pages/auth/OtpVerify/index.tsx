'use client';

import loginImage from '@/assets/redeem/RW AI UI orange gradient -07.jpg';
import { useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import Logo from '../../../components/logo/Logo';
import { Button } from '../../../components/ui/Button';
import { toast } from '../../../components/common/Toast';
import { useAppDispatch } from '../../../store/hooks';
import { VerifyOTPRequest, verifyOTP, selectVerifyOTPStatus } from '../../../redux/auth/VerifyOTPRedux';
import { AUTH_MESSAGES } from '../../../utils/messages/auth';
import { useLocation } from 'react-router-dom';
import { ResendOTPRequest, selectResendOTPResponse } from '../../../redux/auth/ResendOTPRedux';
import { useEffect } from 'react';

export default function OtpVerify() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const location = useLocation();
  const isToken = useSelector(selectResendOTPResponse);
  const token = isToken?.data.reset_token ?? location.state?.token;
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const status = useSelector(selectVerifyOTPStatus);
  const [timeLeft, setTimeLeft] = useState(300);
  const isSubmittingRef = useRef(false);

  useEffect(() => {
    if (timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft]);

  useEffect(() => {
    if (!token) {
      navigate('/signin');
    }
  }, []);

  const handleSubmit = async () => {
    if (isSubmittingRef.current) return;

    if (status === 'succeeded') {
      toast.error('OTP has already been used. Please reset a new OTP.');
      return;
    }

    const otpValue = otp.join('');
    
    // Validate OTP is not empty
    if (!otpValue.trim()) {
      toast.error(AUTH_MESSAGES.VALIDATION.OTP_REQUIRED);
      return;
    }

    isSubmittingRef.current = true;
    try {
      const res = await dispatch(
        VerifyOTPRequest({
          reset_token: token,
          otp: otpValue,
        }),
      ).unwrap();
      const message = res.message || 'OTP verified successfully';
      toast.success(message);
      const verified_token = res.data.verified_token;
      
      setOtp(['', '', '', '', '', '']);
      dispatch(verifyOTP());

      navigate('/resetpassword', { state: { verified_token }, replace: true });
    } catch (err: unknown) {
      let msg = (err as { message?: string })?.message || 'OTP verification failed';
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
    try {
      const res = await dispatch(
        ResendOTPRequest({
          reset_token: token,
        }),
      ).unwrap();

      const message = (res as { message?: string })?.message || 'OTP resent successfully';
      toast.success(message);
      setOtp(['', '', '', '', '', '']);
      setTimeout(() => {
        document.getElementById('otp-0')?.focus();
      }, 0);
    } catch (err: unknown) {
      let msg = (err as { message?: string })?.message || 'Failed to resend OTP';
      msg = msg.replace(/\botp\b/gi, 'OTP');
      toast.error(msg);
      return;
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      document.getElementById(`otp-${index - 1}`)?.focus();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const isOtpComplete = otp.every(digit => digit !== '');
      if (isOtpComplete && status !== 'loading') {
        handleSubmit();
      }
    }
  };
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>, index: number) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pastedData) return;

    const newOtp = [...otp];
    for (let i = 0; i < pastedData.length; i++) {
      if (index + i < 6) {
        newOtp[index + i] = pastedData[i];
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
          <h2
            className="text-2xl font-bold mb-6 text-center lg:text-left pb-3"
            style={{
              borderBottom: '0.76px solid #E2E1E1',
              color: '#db8833',
              fontWeight: 700,
            }}
          >
            OTP VERIFY
          </h2>
          <div className="flex flex-col gap-3">
            <div className="flex gap-3 justify-center lg:justify-start">
              {otp.map((digit, index) => (
                <input
                  key={index}
                  id={`otp-${index}`}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleChange(e.target.value, index)}
                  onKeyDown={(e) => handleKeyDown(e, index)}
                  onPaste={(e) => handlePaste(e, index)}
                  className="w-12 h-12 text-center text-lg font-semibold border-2 border-gray-300 rounded-md focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-400"
                />
              ))}
            </div>
          </div>
          {timeLeft > 0 ? (
            <p className="mt-5 text-sm text-gray-500">Resend OTP in {formatTime(timeLeft)}</p>
          ) : (
            <button
              type="button"
              className="mt-5 text-left font-semibold text-gray-800 hover:underline"
              onClick={() => {
                handleResend();
                setTimeLeft(300);
              }}
            >
              Resend OTP
            </button>
          )}
          <div className="flex justify-center mt-6 lg:justify-start">
            <Button
              variant="gradient"
              onClick={handleSubmit}
              loading={status === 'loading'}
              loadingText="Signing up..."
            >
              Verify →
            </Button>
          </div>
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
