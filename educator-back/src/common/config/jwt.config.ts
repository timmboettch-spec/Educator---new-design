import { registerAs } from '@nestjs/config';
import { parseExpiresInSeconds } from '../utils/duration.util';

/**
 * Backs TokenService's `jwt.*` config lookups. Deliberately reuses JWT_SECRET (rather than
 * introducing a distinct access/refresh secret pair) so tokens TokenService signs keep
 * validating against JwtStrategy/getJwtSecret(), which verify against JWT_SECRET everywhere
 * in both the root app and student-backend.
 */
export default registerAs('jwt', () => ({
  accessSecret: process.env.JWT_SECRET,
  accessExpiresIn: parseExpiresInSeconds(process.env.JWT_EXPIRES_IN, 86400),
}));
