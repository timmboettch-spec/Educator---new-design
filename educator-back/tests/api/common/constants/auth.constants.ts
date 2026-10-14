/**
 * Auth transport constants shared by the API suites.
 *
 * The backend delivers the access token as an httpOnly `accessToken` cookie
 * (`TokenService.setAuthCookies`) rather than in the login/signup response
 * body, and protects every state-changing request with a global `CsrfGuard`.
 * These names mirror `COOKIE_KEYS.ACCESS_TOKEN` in
 * `src/common/constants/app.constants.ts` and the header `CsrfGuard` reads.
 */
export const AuthTransportConstants = {
  /** Cookie the server sets the access token on. */
  ACCESS_TOKEN_COOKIE: 'accessToken',
  /** Header `CsrfGuard` reads the CSRF token from. */
  CSRF_HEADER: 'x-csrf-token',
  /** HTTP methods `CsrfGuard` requires a CSRF token for. */
  CSRF_PROTECTED_METHODS: ['post', 'put', 'patch', 'delete'],
} as const;

/** `accessStatus` values returned by `POST /auth/login`. */
export enum LoginAccessStatus {
  ACCESS_GRANTED = 'access_granted',
  REQUIRED_ROLE_SELECTION = 'required_role_selection',
}
