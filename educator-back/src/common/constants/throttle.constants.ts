const num = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const AuthThrottleConstants = {
  LOGIN: {
    LIMIT: num(process.env.AUTH_LOGIN_LIMIT, 5),
    TTL: num(process.env.AUTH_LOGIN_TTL, 60_000),
  },

  FORGOT_PASSWORD: {
    LIMIT: num(process.env.AUTH_FORGOT_PASSWORD_LIMIT, 6),
    TTL: num(process.env.AUTH_FORGOT_PASSWORD_TTL, 900_000),
  },

  VERIFY_OTP: {
    LIMIT: num(process.env.AUTH_VERIFY_OTP_LIMIT, 5),
    TTL: num(process.env.AUTH_VERIFY_OTP_TTL, 600_000),
  },

  RESET_PASSWORD: {
    LIMIT: num(process.env.AUTH_RESET_PASSWORD_LIMIT, 3),
    TTL: num(process.env.AUTH_RESET_PASSWORD_TTL, 900_000),
  },

  LTI_SESSION_EXCHANGE: {
    LIMIT: num(process.env.LTI_SESSION_EXCHANGE_LIMIT, 10),
    TTL: num(process.env.LTI_SESSION_EXCHANGE_TTL, 60_000),
  },
} as const;

export type AuthThrottleKey = keyof typeof AuthThrottleConstants;

export const RATE_LIMIT = {
  AUTHENTICATED: {
    LIMIT: Number(process.env.RATE_LIMIT_AUTH_LIMIT ?? 5),
    TTL: Number(process.env.RATE_LIMIT_AUTH_TTL ?? 1),
  },

  PUBLIC: {
    LIMIT: Number(process.env.RATE_LIMIT_PUBLIC_LIMIT ?? 3),
    TTL: Number(process.env.RATE_LIMIT_PUBLIC_TTL ?? 1),
  },
} as const;

export const DEFAULT_THROTTLE = {
  LIMIT: Number(process.env.DEFAULT_THROTTLE_LIMIT ?? 5),
  TTL_MS: Number(process.env.DEFAULT_THROTTLE_TTL_MS ?? 1_000),
} as const;

export const RATE_LIMIT_FALLBACK_RETRY_AFTER_SECONDS = Number(
  process.env.RATE_LIMIT_FALLBACK_RETRY_AFTER_SECONDS ?? 60,
);
