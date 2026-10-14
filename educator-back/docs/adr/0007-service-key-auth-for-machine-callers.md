# ADR-0007: Service-Key Auth for Machine Callers

## Status

Accepted, implemented. Extends [ADR-0005](0005-single-global-default-deny-auth-guard.md) and [ADR-0006](0006-selected-role-rbac.md).

## Context

The avatar build pipeline uploads an avatar package to blob storage and then has to create the matching catalog row in this backend, and PATCH it to `ready` once the upload verifies. Without that, a package exists in blob that nothing in the product knows about, and someone has to add the row by hand for every avatar — which is the manual step the pipeline exists to remove.

The pipeline runs on a GitHub Actions runner. It holds no session. Under ADR-0005 every route is default-deny, and under ADR-0006 the role gate matches the caller's **selected role** (`type`) on the JWT. A runner has no JWT at all, so `POST /avatars` and `PATCH /avatars/:avatarId` — both `@RequiredRoles(SCENARIO_ADMIN)` — are closed to it, and no amount of role configuration opens them, because there is no token to carry a role on.

The session credential cannot be reused. It is an httpOnly cookie issued to a browser, deliberately not readable by script and not something CI can hold.

Three options were considered:

- **A service account with a real login.** Rejected: it needs a password or refresh token in CI, it appears in the accounts table as a user who can be assigned things, and it inherits every route `SCENARIO_ADMIN` can reach rather than the two the pipeline needs.
- **Managed identity**, as [ADR-0001](0001-mail-service-managed-identity.md) uses for mail. Rejected here: the caller is a GitHub-hosted runner, not an Azure workload, so there is no identity for Entra to federate against without also standing up OIDC federation for the runner — more moving parts than the problem warrants. Managed identity remains the right answer where the caller *is* in Azure, and is already live for the session-router's Postgres connection; this is a different use case, not a replacement for it.
- **A shared secret in a header.** Chosen.

## Decision

**A `@ServiceAuth()` route decorator** marking a route as callable by a machine holding the service key, **in addition to** its existing role-gated human access.

**Checked before the JWT path, not after.** `AuthGuard` evaluates a valid `x-service-key` and returns immediately. It has to be in that order: `assertRolesAllowed()` derives roles from `user.type` on the JWT, and a service caller has no JWT, so a `@RequiredRoles` route would reject it on an empty role list regardless of whether the key was correct.

**A failed key falls through rather than throwing.** The decorator *adds* a way in; it does not replace the existing one. A human with a session uses the route exactly as before, and a bad key simply leaves the request to the normal JWT path, which 401s it.

**Deliberately not `@Public()`.** Public means "no credential at all". This means "a different credential", and a route carrying `@ServiceAuth()` stays shut to an anonymous caller. It does not appear on, and must not be added to, the ADR-0005 route-coverage allowlist: with no key presented it still returns 401.

**CSRF is skipped for a valid service caller.** CSRF defends against a browser being tricked into sending a request with cookies it already holds; a secret in a header cannot be attached that way, so there is nothing to defend. `CsrfGuard` injects `Reflector` and skips `@ServiceAuth()` routes.

**Comparison is constant-time.** `timingSafeEqual`, with lengths compared first because it throws on a length mismatch — and that comparison leaks only the key's length, which is not secret. A plain `===` short-circuits on the first differing byte and leaks the key's *content* to anyone who can time the response.

**Per route, never per controller.** `POST /avatars`, `PATCH /avatars/:avatarId`, and both `GET`s carry it. `DELETE /avatars/:avatarId` does not, deliberately: nothing automated has a reason to remove a catalog row, and a missing avatar is a worse failure than a wrong field.

The `GET`s were withheld at first, on the grounds that a CI key should not read the whole catalog. They were added once a second machine caller appeared that is not CI: the scenario app's server-side catalog proxy, which backs the avatar picker and cannot reach the avatar platform's own `/v1/avatars` (ClusterIP inside AKS, no public route). The pipeline itself also reads the row's status through `GET /avatars/:avatarId` before promoting it to `ready`. The key is therefore no longer write-only. That is a real widening, and the reason to accept it is that the alternative was a hand-maintained avatar list that had already drifted from the platform without anyone noticing.

**`AVATAR_SERVICE_KEY` is optional in `env.validation.ts`, minimum 32 characters.** Optional so an environment with no pipeline pointed at it still starts. An unset value means *no service caller is valid* — never *everyone is* — so leaving it out shuts the door rather than opening it.

## Consequences

- Nothing changes in any environment until `AVATAR_SERVICE_KEY` is set there. Dev is the first; qa and prod follow when the pipeline is pointed at them.
- The key is a bearer secret with no expiry and no per-caller identity: anyone holding it is the pipeline or the scenario app's proxy. Rotation is manual, by changing the value in the environment and in the pipeline's secrets. If the pipeline ever needs more than these four routes, revisit rather than widen the decorator — at that point a federated OIDC identity for the runner is the better shape.
- Audit rows for pipeline-created avatars have no human actor behind them. Anything that reports "who created this avatar" has to tolerate that.
- Two machine callers now share one key: the pipeline and the scenario app's server-side proxy. Both are the product's own automation behind admin-gated surfaces, and the key's reach is four routes on one resource, so per-caller secrets are deferred — the trigger to split remains a *third* caller, a caller outside the product's own code, or a need to audit the two separately.
- The four marked routes are no longer covered by the "every route 401s without a token" test in its plain form — they 401 without the key, which is the same property by a different credential. The unit suite in `tests/unit/guards/service-auth.guard.spec.ts` covers the key paths: valid key, wrong key, absent key, unset secret, and that CSRF is skipped only for a valid one.
