# ADR-0006: Selected-Role RBAC Across All Endpoints

## Status

Accepted (RE-202, cloned from RWAI-3088). Supersedes the selected-role paragraph of
[ADR-0005](0005-single-global-default-deny-auth-guard.md), which deferred this decision.
Role matrix: [`docs/rbac-role-matrix.md`](../rbac-role-matrix.md).

## Context

ADR-0005 delivered the mechanism — one global default-deny `AuthGuard` evaluating
`@RequiredRoles(...)` — but deliberately left two things open.

**The role gate ignored the selected role.** It matched against `roles[]`, every active
role on the account. A user holding both `district_admin` and `educator` therefore passed
educator-only routes while acting as district admin, and one session could exercise every
role's routes. This made `POST /auth/select-role` cosmetic: the product asks the user which
role they are acting as, and the security model then ignored the answer.

**Most routes had no role decision at all.** Only 5 of 33 controllers declared
`@RequiredRoles`. An audit of all ~190 routes across both apps found the rest authenticated
but open to any role, including students — most severely
`src/student-backend/modules/admin`, where 14 scenario- and unit-CRUD routes (including
delete and publish) were callable with a student token.

## Decision

**The role gate matches the selected role (`type`), not the account's roles (`roles[]`).**
`@RequiredRoles` continues to take `RoleSlug` values; the guard maps the token's `type` claim
to its slug via the existing `mapUserTokenTypeToRoleSlugs`
(`src/common/utils/user-token-type.util.ts`), so `type: 'admin'` satisfies
`@RequiredRoles(RoleSlug.DISTRICT_ADMIN)` and the historical naming mismatch stays an
implementation detail. Role selection becomes load-bearing: to use an educator route you
must be acting as an educator.

**Flat, not hierarchical.** No role implicitly contains another. `district_admin` does not
inherit `educator`. Where both are genuinely allowed, the route lists both —
`@RequiredRoles(RoleSlug.EDUCATOR, RoleSlug.DISTRICT_ADMIN)` — so the allowance is visible
in the diff and in the matrix rather than implied by a hierarchy.

**Every route states its roles explicitly.** There is no "open to all authenticated roles"
marker; a route is either `@Public()`, or `@AllowRoleSelectionToken()`, or it names its
roles. The runtime default is unchanged (a route with no `@RequiredRoles` still admits any
authenticated caller), because a missed annotation should surface as a failing test rather
than a production 403. `tests/integration/auth/route-coverage.integration.spec.ts` is
extended to fail when a route carries none of the three markers.

**Role-selection routes are the one role-exempt case.** A `purpose: 'login'` token proves
identity but has no `type` yet, so a role gate is meaningless on the routes that accept one.
`@AllowRoleSelectionToken()` therefore implies "roles not applicable", and the guard skips
the role check there. This covers `POST auth/select-role`, `GET auth/me` and
`POST auth/logout`.

**Role branching in service helpers follows the same rule.** `isDistrictAdminRequest()`
(`src/educators/utils/educator-school-access.util.ts`) reads the selected `type` rather than
`roles[]`, so a dual-role user acting as educator does not take the district-admin branch in
`resolveSchoolIdFromRequest` / `assertGoogleClassroomEnabledForSchool` and thereby skip the
school-membership check.

**Imperative role checks are replaced by the decorator.** `assertEducatorOrAdminRole` is
purely vertical and is deleted in favour of `@RequiredRoles(EDUCATOR, DISTRICT_ADMIN)` on
the `google` and `lms` controllers. Its file-neighbours stay: `resolveActingEducatorId` /
`resolveActingAdminId` resolve identifiers (400, not 403), and `resolveSchoolIdFromRequest`
/ `assertGoogleClassroomEnabledForSchool` are horizontal scoping, not role checks.

**The telemetry carve-out is retained.** `src/student-backend/modules/telemetry` stays
`@Public()`, including its `analytics` and `analytics/export` routes. This is a deliberate
re-justification of ADR-0005's documented exception, not an oversight.

## Consequences

- **Role-gated is not row-scoped.** This ADR governs _which role may call a route_, never
  _which rows that caller may read_. Several routes are role-correct and still return data
  belonging to other users; the audit that produced this ADR found reports, transcripts and
  logs readable across students. Those are tracked separately in
  `docs-local/student-data-horizontal-access/issues/01-student-report-log-idor.md`. A complete
  matrix is not evidence of data isolation.
- **Multi-role accounts change behaviour.** A user who previously reached every role's routes
  from one session must now switch roles. This is the intended break and is the reason the
  ticket calls for a regression pass.
- `notifications` already branched on `req.user.type`, so it was written to these semantics
  before they were decided; nothing changes there.
- Students can no longer reach scenario/unit CRUD in student-backend admin, nor global
  platform statistics.
- Routes roled `DISTRICT_ADMIN` that take an `:adminId` path parameter still accept _any_
  district admin's token, because the parameter is never compared to the caller. The matrix
  notes these; the fix belongs to the horizontal-access ticket.
- The four `@AllowRoleSelectionToken()` routes are the only ones a reader cannot determine
  an allowed-role set for from the decorators alone. That is recorded in the matrix rather
  than papered over with a full-role annotation.
