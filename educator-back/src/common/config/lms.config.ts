import { registerAs } from '@nestjs/config';

export default registerAs('lms', () => ({
  secretsEncryptionKey: process.env.LMS_SECRETS_ENCRYPTION_KEY,
  secretsEncryptionKeyPrevious: process.env.LMS_SECRETS_ENCRYPTION_KEY_PREVIOUS,
  enableLtiAutoProvision: process.env.LMS_ENABLE_LTI_AUTO_PROVISION === 'true',
  moodleUrl: process.env.MOODLE_URL || '',
  moodleWsToken: process.env.MOODLE_WS_TOKEN || '',
}));
