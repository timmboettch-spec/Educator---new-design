import { CustomDecorator, SetMetadata } from '@nestjs/common';

export const ALLOW_ROLE_SELECTION_TOKEN_KEY = 'allowRoleSelectionToken';

/**
 * Marks a route as reachable with a `purpose: 'login'` token — the short-lived, role-selection-only
 * token `AuthService.login()` issues for a multi-role account.
 *
 * The global `AuthGuard` rejects such a token (401) everywhere else, so this must stay limited to the handful of
 * routes that exist to get the caller *out* of that half-authenticated state: picking a role
 * (`select-role`), restoring the session to re-render the role picker (`me`), and abandoning it
 * (`logout`). Applying it to a resource route would hand full access to an account that has not
 * finished logging in.
 */
export const AllowRoleSelectionToken = (): CustomDecorator =>
  SetMetadata(ALLOW_ROLE_SELECTION_TOKEN_KEY, true);
