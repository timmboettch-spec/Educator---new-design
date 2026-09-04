import { Logger } from '@nestjs/common';

const LMS_KEY = 'LMS_SECRETS_ENCRYPTION_KEY';
const LMS_KEY_PREVIOUS = 'LMS_SECRETS_ENCRYPTION_KEY_PREVIOUS';

const logger = new Logger('EnvValidation');

export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const key = config[LMS_KEY];
  if (typeof key !== 'string' || !key.trim()) {
    logger.warn(
      `${LMS_KEY} is not set. LMS and LTI operations that read or write stored secrets ` +
        'will fail until it is provided; the rest of the app is unaffected. ' +
        'Generate a value with: openssl rand -base64 32',
    );
  }

  const previous = config[LMS_KEY_PREVIOUS];
  if (typeof previous === 'string' && previous.trim()) {
    logger.warn(
      `${LMS_KEY_PREVIOUS} is set — an LMS secret key rotation is in progress and the retired ` +
        'key still decrypts. Run "npm run reencrypt:lms-secrets", then remove this variable.',
    );
  }

  return config;
}
