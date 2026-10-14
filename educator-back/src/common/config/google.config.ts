import { registerAs } from '@nestjs/config';
import { GOOGLE_CLASSROOM_DEFAULT_SCOPES } from 'src/google/google.constants';

export default registerAs('google', () => ({
  clientId: process.env.GOOGLE_CLASSROOM_CLIENT_ID?.trim() || '',
  clientSecret: process.env.GOOGLE_CLASSROOM_CLIENT_SECRET?.trim() || '',
  redirectUri:
    process.env.GOOGLE_CLASSROOM_REDIRECT_URI?.trim() ||
    'http://localhost:3000/api/auth/google/callback',
  scopes: (
    process.env.GOOGLE_CLASSROOM_SCOPES?.trim() || GOOGLE_CLASSROOM_DEFAULT_SCOPES.join(' ')
  )
    .split(/\s+/)
    .map((scope) => scope.trim())
    .filter(Boolean),
  successRedirectPath:
    process.env.GOOGLE_CLASSROOM_SUCCESS_REDIRECT_PATH?.trim() || '/google-classroom',
  // Incremental Google scopes. Default true (current behavior); set false to disable.
  includeGrantedScopes: !['0', 'false', 'no'].includes(
    (process.env.GOOGLE_CLASSROOM_INCLUDE_GRANTED_SCOPES ?? 'true').trim().toLowerCase(),
  ),
  authUrl:
    process.env.GOOGLE_CLASSROOM_AUTH_URL?.trim() || 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl:
    process.env.GOOGLE_CLASSROOM_TOKEN_URL?.trim() || 'https://oauth2.googleapis.com/token',
  userInfoUrl:
    process.env.GOOGLE_CLASSROOM_USERINFO_URL?.trim() ||
    'https://openidconnect.googleapis.com/v1/userinfo',
}));
