export const AuthConstants = {
  SALT_ROUNDS: 10,
  BCRYPT_PREFIX: '$2b$',
  CODE_CLEAN_REGEX: /[^A-Z0-9]/gi,
  LICENSE_EXPIRY_YEARS: 1,
  MASTER_REDEEM_CODE: 'RWMASTER20250617',
  MASTER_REDEEM_AI_SEATS: 100,

  OTP_EXPIRY_MINUTES: 5,
  OTP_RESEND_COOLDOWN_MINUTES: 5,

  ROUTES: {
    AUTH: 'auth',
    SIGNUP: 'signup',
    LOGIN: 'login',
    CSRF_TOKEN: 'csrf-token',
    REDEEM: 'redeem',
    LOGOUT: 'logout',
    FORGOT_PASSWORD: 'forgot-password',
    VERIFY_OTP: 'verify-otp',
    RESEND_OTP: 'resend-otp',
    RESET_PASSWORD: 'reset-password',
    CHANGE_PASSWORD: 'change-password',
    /** Combined role-selection/switch endpoint — accepts either a login-purpose or an
     * access-purpose token (see AuthController.selectRole). */
    SELECT_ROLE: 'select-role',
    ME: 'me',
  },

  SWAGGER: {
    TAG: 'Auth',
    JWT_AUTH: 'JWT-auth',
  },

  STRATEGY: {
    JWT: 'jwt',
  },

  /** Expiry for a `TokenPurposeType.LOGIN` token — deliberately much shorter than a normal access token. */
  LOGIN_TOKEN_EXPIRES_IN_SECONDS: 120,

  VERIFIED_TOKEN_EXPIRES: '15m' as const,
  TOKEN_EXPIRED_ERROR: 'TokenExpiredError',
  UNEXPECTED_ERROR: 'Unexpected error',

  EMAIL: {
    OTP_SUBJECT: 'Password Reset OTP',
    ACCOUNT_CREATED_SUBJECT: 'Your RealityWorks AI Account Has Been Created',
  },

  MESSAGES: {
    EDUCATOR_REGISTERED: 'Educator registered successfully',
    ADMIN_REGISTERED: 'Admin registered successfully',
    INVITE_EMAIL_MISMATCH: 'Email does not match the invite',
    INVALID_INVITE_ID: 'This invite id has invalid',
    EDUCATOR_RECORD_NOT_FOUND: 'Educator record not found for this invite',
    INVITE_ALREADY_USED: 'This invite has already been used',
    EDUCATOR_ACCOUNT_INACTIVE:
      'Your account is not active. Please complete registration via the invite link.',
    EDUCATOR_PASSWORD_NOT_SET:
      'Password not set for this educator account. Please use Forgot Password to set your password.',
    ACCOUNT_DEACTIVATED: 'Your account has been deactivated. Please contact your administrator.',
    NO_TOKEN_PROVIDED: 'No token provided',
    LOGOUT_SUCCESS: 'Logged out successfully',
    OTP_SENT: 'OTP sent to your email',
    OTP_RESENT: 'OTP resent to your email',
    OTP_INVALID: 'Invalid or expired OTP',
    OTP_ALREADY_USED: 'OTP has already been used',
    OTP_EXPIRED: 'OTP has expired. Please request a new one using resend-otp',
    OTP_RESEND_TOO_SOON: 'Please wait 5 minutes before requesting a new OTP',
    OTP_VERIFIED: 'OTP verified successfully',
    VERIFIED_TOKEN_EXPIRED: 'Reset session expired. Please request a new OTP',
    VERIFIED_TOKEN_INVALID: 'Invalid reset token. Please verify your OTP first',
    VERIFIED_TOKEN_ALREADY_USED: 'This reset token has already been used. Please request a new OTP',
    PASSWORD_RESET_SUCCESS: 'Password reset successfully',
    SAME_PASSWORD: 'New password cannot be the same as your current password',
    DUAL_ROLE_SELECT: 'Multiple accounts found. Please select a role.',
    DUAL_ROLE_INVALID: 'Please specify a role: admin or educator',
    DUAL_ROLE_NOT_FOUND: 'No account found for the selected role',
    DUAL_ROLE_ROLES_KEY: 'roles',
    ACCOUNT_NOT_FOUND: 'No account found with this email address',
    EMAIL_DELIVERY_FAILED_PREFIX: 'Email delivery failed (Azure Communication Services)',
  },

  LOG: {
    EMAIL_SEND_FAILED: 'email-send-failed',
  },

  VALIDATION: {
    EMAIL_INVALID: 'Please provide a valid email address',
    EMAIL_REQUIRED: 'Email is required',
    PASSWORD_REQUIRED: 'Password is required',
    PASSWORD_LENGTH: 'Password must be between 8 and 20 characters',
    FULL_NAME_REQUIRED: 'Full name is required',
    CODE_REQUIRED: 'Activation code is required',
    CODE_MUST_BE_STRING: 'Code must be a string',
    PASSWORD_MIN: 8,
    PASSWORD_MAX: 20,
  },

  LTI: {
    SCHOOL_NOT_CONFIGURED: 'LTI_SCHOOL_NOT_CONFIGURED',
    SCHOOL_MISMATCH: 'LTI_SCHOOL_MISMATCH',
    SCHOOL_RECORD_MISSING: 'LTI_SCHOOL_RECORD_MISSING',
    EDUCATOR_NOT_REGISTERED: 'LTI_EDUCATOR_NOT_REGISTERED',
  },
};
