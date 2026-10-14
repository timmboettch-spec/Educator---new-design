import { registerAs } from '@nestjs/config';
import {
  AuthThrottleConstants,
  RATE_LIMIT,
  DEFAULT_THROTTLE,
  RATE_LIMIT_FALLBACK_RETRY_AFTER_SECONDS,
} from '../constants/throttle.constants';

/**
 * Thin ConfigService-facing wrapper — the actual env parsing lives in
 * throttle.constants.ts, since ThrottlerModule.forRoot() and the throttle
 * guards need these values synchronously, outside DI.
 */
export default registerAs('throttle', () => ({
  authLogin: {
    limit: AuthThrottleConstants.LOGIN.LIMIT,
    ttlMs: AuthThrottleConstants.LOGIN.TTL,
  },
  authForgotPassword: {
    limit: AuthThrottleConstants.FORGOT_PASSWORD.LIMIT,
    ttlMs: AuthThrottleConstants.FORGOT_PASSWORD.TTL,
    cooldownSeconds: AuthThrottleConstants.FORGOT_PASSWORD.COOLDOWN_SECONDS,
    ipLimit: AuthThrottleConstants.FORGOT_PASSWORD.IP_LIMIT,
    ipTtlMs: AuthThrottleConstants.FORGOT_PASSWORD.IP_TTL,
  },
  authVerifyOtp: {
    limit: AuthThrottleConstants.VERIFY_OTP.LIMIT,
    ttlMs: AuthThrottleConstants.VERIFY_OTP.TTL,
  },
  authResetPassword: {
    limit: AuthThrottleConstants.RESET_PASSWORD.LIMIT,
    ttlMs: AuthThrottleConstants.RESET_PASSWORD.TTL,
  },
  ltiSessionExchange: {
    limit: AuthThrottleConstants.LTI_SESSION_EXCHANGE.LIMIT,
    ttlMs: AuthThrottleConstants.LTI_SESSION_EXCHANGE.TTL,
  },
  rateLimitAuthenticated: {
    limit: RATE_LIMIT.AUTHENTICATED.LIMIT,
    ttlSeconds: RATE_LIMIT.AUTHENTICATED.TTL,
  },
  rateLimitPublic: {
    limit: RATE_LIMIT.PUBLIC.LIMIT,
    ttlSeconds: RATE_LIMIT.PUBLIC.TTL,
  },
  rateLimitLtiLaunch: {
    limit: RATE_LIMIT.LTI_LAUNCH.LIMIT,
    ttlSeconds: RATE_LIMIT.LTI_LAUNCH.TTL,
  },
  defaultThrottle: {
    limit: DEFAULT_THROTTLE.LIMIT,
    ttlMs: DEFAULT_THROTTLE.TTL_MS,
  },
  fallbackRetryAfterSeconds: RATE_LIMIT_FALLBACK_RETRY_AFTER_SECONDS,
}));
