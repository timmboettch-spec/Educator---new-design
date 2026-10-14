---
paths:
  - 'src/auth/**'
  - 'src/csrf/**'
  - 'src/common/guards/**'
  - 'src/common/decorators/**'
  - 'src/common/services/token.service.ts'
  - 'src/common/utils/token-extractor.util.ts'
  - 'src/common/utils/user-token-type.util.ts'
  - 'tests/integration/auth/**'
  - 'docs/rbac-role-matrix.md'
---

# Rules: Auth internals

Extends the Auth bullet of root `CLAUDE.md` ([ADR-0005](../../docs/adr/0005-single-global-default-deny-auth-guard.md), [ADR-0006](../../docs/adr/0006-selected-role-rbac.md), [ADR-0007](../../docs/adr/0007-service-key-auth-for-machine-callers.md)).

## Request flow (`src/common/guards/auth.guard.ts`)

1. `@Public()` → allow.
2. `@ServiceAuth()` route with a valid `x-service-key` (constant-time compare against `AVATAR_SERVICE_KEY`) → allow. An invalid key **falls through** to the JWT path; it never throws. Per route only, never per controller; never `@Public()`; not on the route-coverage allowlist. `CsrfGuard` skips valid service callers.
3. Otherwise: `extractAccessToken()` → `AuthService.validateUserToken()` → `TokenService.verifyToken()` (signature, expiry, Redis `jti` blacklist via `isBlackListed`). Roles are re-derived from the account's current `user_roles`, so a revoked role takes effect on the next request. The user goes on `request.user` and into CLS (`'user'`).
4. `assertPurposeAllowed`: a `purpose: 'login'` (role-selection) token is 401 except on `@AllowRoleSelectionToken()` routes.
5. `assertRolesAllowed`: any-of match of `mapUserTokenTypeToRoleSlugs(user.type)` against `@RequiredRoles`, else 403. No `@RequiredRoles` → any authenticated caller (which is why the route-coverage test enforces explicit markers).

There is no Passport `JwtStrategy`; the guard verifies tokens itself.

## Tokens and cookies (`src/common/services/token.service.ts`)

- `TokenService` is the single source of truth: `generateTokens`, `verifyToken`, `setAuthCookies`/`clearAuthCookies`, blacklisting. Used by signup/signin/refresh/logout — never sign or set cookies elsewhere.
- Access token travels in the `accessToken` cookie (`COOKIE_KEYS.ACCESS_TOKEN`, `src/common/constants/app.constants.ts`), `maxAge` = token `expires_in`.
- Cookie options (`cookieOptions()`): `httpOnly: true` always; `secure: true` and `sameSite: 'none'` everywhere except `Env.LOCAL` (`secure: false`, `sameSite: 'lax'`). The frontend is on a separate origin (Azure Static Web Apps), so do **not** switch to `'strict'`.
- Extraction is cookie-first with `Authorization: Bearer` fallback (`src/common/utils/token-extractor.util.ts`: `extractAccessToken`, `…FromCookies`, `…FromCookieHeader`, `…FromAuthHeader`, `…ForSocket`). `cookie-parser` is mounted in `src/main.ts`.

## Role matrix

- `docs/rbac-role-matrix.md` and `ROLE_MATRIX` in `tests/integration/auth/route-coverage.integration.spec.ts` must change together.
- Roles are flat (`district_admin` does not inherit `educator`).
