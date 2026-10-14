# ADR-0005: Single Global Default-Deny Auth Guard

## Status

Accepted, implemented (RWAI-3087, parent epic RWAI-2952). Spec: [`docs/specs/RWAI-3087-global-auth-guard.md`](../specs/RWAI-3087-global-auth-guard.md).

## Context

Today a route is authenticated only if its controller remembers to add `@UseGuards(JwtAuthGuard)`, so authentication is opt-in. Some routes are unprotected by omission, such as Google OAuth and telemetry.

`RolesGuard` is registered as an `APP_GUARD`, but it returns `true` before it evaluates `@RequiredRoles`, so none of the 23 annotations has ever been enforced. A comment in `src/app.module.ts` says the guard is "deliberately NOT registered", which contradicts the registration directly above it.

`JwtStrategy` never checks `TokenBlacklistService`, and it is provided in seven different modules.

The root app and `/students-backend` run in one Nest instance: `StudentBackend` is mounted via `RouterModule` and there is a single `NestFactory.create` in `src/main.ts`. Both already share the one `JwtStrategy`.

## Decision

**One `AuthGuard`, registered once as an `APP_GUARD` in the root `AppModule`.** It covers every HTTP route in both apps. Nothing is registered per module, and no route or controller ever adds an auth guard via `@UseGuards`. `JwtAuthGuard` and `RolesGuard` are deleted.

**Default-deny.** Every HTTP route requires a valid, non-blacklisted access token unless the route or its controller is marked `@Public()`. The guard checks in this order:

1. `@Public()` → allow.
2. Passport authentication and a blacklist check. A missing, invalid, expired or blacklisted token, or an unknown or inactive account or student, → 401.
3. A `purpose: 'login'` token on a route without `@AllowRoleSelectionToken()` → 401. Student tokens have no `purpose` claim and are treated as full-access; token issuance is unchanged.
4. **Role gate:** if `@RequiredRoles(...)` is set, at least one required role must appear in the caller's **account roles** (`roles[]`, meaning every active role on the account). The check is any-of. A route-level `@RequiredRoles` replaces the controller-level one. For student tokens, the strategy sets `roles: ['student']`.
5. Allow. A route with no `@RequiredRoles` accepts any authenticated caller.

~~**The role gate deliberately ignores the selected role** (the token's `type`). For example, a district admin who also holds the educator role passes educator-only routes without switching role. Restricting access by the selected role is left to the RBAC ticket.~~

> **Superseded by [ADR-0006](0006-selected-role-rbac.md) (RE-202).** The role gate now matches the **selected role** (`type`), not the account's `roles[]`. Step 4 below reads accordingly, and a route with no `@RequiredRoles` is now a test failure rather than an accepted default.

**Global guard order:** `AuthThrottlerGuard` → `AuthGuard` → `CsrfGuard`. Throttling still applies to public routes. An unauthenticated request to a protected route gets 401 before CSRF can return 403.

**Public-route rule.** `@Public()` is legitimate only when the route:

- issues credentials (signup, login, OTP, forgot or reset password, student login, invite verify-token and accept-invite);
- is an infrastructure probe (health, liveness, readiness, server time);
- is called by a third party that verifies itself (LTI, Google OAuth; both are public at controller level);
- serves content that is shareable by design (the single public-simulation route).

The student-backend telemetry controller is the one documented exception. [ADR-0006](0006-selected-role-rbac.md) re-justified and retained it, rather than protecting it.

**Decorator-only.** All auth behaviour is expressed through `@Public()`, `@RequiredRoles(...)` and `@AllowRoleSelectionToken()`. A controller that moves between the root app and student-backend (RWAI-3153) carries its decorators with it and needs no guard wiring. Whichever of RWAI-3087 and RWAI-3153 lands second rebases and re-runs the route-coverage test.

## Consequences

- Role checks are enforced for the first time. All 23 existing `@RequiredRoles` annotations must be reviewed, because annotations that were wrong have been silently harmless until now.
- ~~The selected role doesn't restrict access, so a multi-role user can use every role's routes in one session. The RBAC ticket may revisit this.~~ Resolved by [ADR-0006](0006-selected-role-rbac.md): the selected role now restricts access.
- The blacklist is in memory and per instance: a logged-out token is only rejected on the instance that handled the logout, until a Redis-backed store replaces it.
- The route-coverage test (every route with no token → 401 unless it's on the allowlist) is where the public-route rule is enforced. Any new public route shows up as an explicit change to that allowlist.
- WebSocket gateways aren't covered by HTTP global guards and keep their own handshake checks.
