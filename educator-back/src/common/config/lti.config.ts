import { registerAs } from '@nestjs/config';

export default registerAs('lti', () => ({
  fallbackKeyId: process.env.LTI_FALLBACK_KEY_ID,
  fallbackPrivateKeyPem: process.env.LTI_FALLBACK_PRIVATE_KEY_PEM,
  studentCodeSecret: process.env.LTI_STUDENT_CODE_SECRET,
}));
