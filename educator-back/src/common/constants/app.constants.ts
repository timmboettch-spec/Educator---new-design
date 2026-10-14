import dotenv from 'dotenv';

dotenv.config();

// Values match `nodeEnv` as actually deployed (`infra/env/*.bicepparam`), not a generic
// local/dev/qa/prod naming — 'qa'/'prod' never matched `nodeEnv=staging`/`nodeEnv=production`
// on any real deployment, so environment-gated logic keyed off them silently never ran.
export enum Env {
  LOCAL = 'local',
  DEV = 'development',
  QA = 'staging',
  PRODUCTION = 'production',
}

export const isProduction = process.env.NODE_ENV === Env.PRODUCTION;

export const COOKIE_KEYS = {
  ACCESS_TOKEN: 'accessToken',
};

export enum CookieSameSite {
  LAX = 'lax',
  STRICT = 'strict',
  NONE = 'none',
}

export const SENSITIVE_KEYS = [
  // Authentication & authorization
  'password',
  'confirmPassword',
  'oldPassword',
  'newPassword',
  'token',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'idToken',
  'id_token',
  'authorization',
  'auth',
  'bearer',
  'jwt',
  'sessionId',
  'session_id',
  'cookie',
  'cookies',
  'apiKey',
  'api_key',
  'secret',
  'clientSecret',
  'client_secret',
  'privateKey',
  'private_key',
  'publicKey', // often fine, but some teams redact by default
  'otp',
  'otpCode',
  'pin',
  'securityCode',
  'verificationCode',
  'mfaCode',
  'twoFactorCode',
  'recoveryCode',
  'resetToken',
  'reset_token',
  'signature',

  // Payment / financial
  'cardNumber',
  'card_number',
  'cvv',
  'cvc',
  'expiryDate',
  'accountNumber',
  'account_number',
  'routingNumber',
  'iban',
  'swift',
  'bankDetails',
  'billingAddress', // debatable — some teams keep this, mask card fields only

  // PII (personally identifiable information)
  'ssn',
  'socialSecurityNumber',
  'nationalId',
  'national_id',
  'passportNumber',
  'driverLicense',
  'taxId',
  'dateOfBirth',
  'dob',

  // Third-party / infra secrets
  'awsSecretAccessKey',
  'aws_secret_access_key',
  'dbPassword',
  'db_password',
  'connectionString',
  'connection_string',
  'smtpPassword',
  'webhookSecret',
  'webhook_secret',
  'encryptionKey',
  'encryption_key',
];

export const TokenBlacklistConstants = {
  REDIS_KEY_PREFIX: 'auth:blacklist:',
  /** Used when a token carries no `exp` claim. */
  DEFAULT_TTL_SECONDS: 86_400,
};
