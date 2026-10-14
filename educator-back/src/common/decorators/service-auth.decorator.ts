import { SetMetadata, type CustomDecorator } from '@nestjs/common';

export const SERVICE_AUTH_KEY = 'serviceAuth';

/**
 * Marks a route as callable by a MACHINE holding the service key, in addition
 * to its normal role-gated human access.
 *
 * Why this exists: the avatar build pipeline uploads a package to blob and then
 * has to create the matching catalog row. It runs on a GitHub Actions runner,
 * which holds no session — the session is an httpOnly cookie issued to a
 * browser — so every `@RequiredRoles` route is closed to it.
 *
 * What it does, across both global guards:
 *
 *   AuthGuard  a valid `x-service-key` short-circuits BEFORE the role check.
 *              It has to: `assertRolesAllowed` derives roles from `user.type`
 *              on the JWT, and a service caller has no JWT, so any
 *              `@RequiredRoles` on the route would fail on an empty list.
 *
 *   CsrfGuard  skipped. CSRF defends against a browser being tricked into
 *              sending a request with cookies it already holds; a secret in a
 *              header cannot be attached that way, so there is nothing to
 *              defend. Requiring a CSRF token of a machine caller would just
 *              mean inventing one.
 *
 * Deliberately NOT `@Public()`. Public means "no credential at all". This means
 * "a different credential", and a route carrying it is still closed to an
 * anonymous caller.
 *
 * Apply it per route, never to a whole controller. On the avatar catalog that
 * is `POST`, `PATCH` and both `GET`s -- but NOT `DELETE`, which stays closed to
 * machines: nothing automated has a reason to remove a catalog row, and the
 * blast radius if a key leaked is the difference between a wrong value and a
 * missing avatar.
 *
 * The `GET`s were deliberately excluded at first, on the grounds that a CI key
 * should not read the whole catalog. They were added once a second machine
 * caller appeared that is not CI: the scenario app's server-side catalog proxy,
 * which backs the avatar picker and cannot reach the avatar platform's own
 * /v1/avatars (ClusterIP inside AKS, no public route). The key is therefore no
 * longer write-only. That is a real widening, and the reason to accept it is
 * that the alternative was a hand-maintained avatar list that had already
 * drifted from the platform without anyone noticing.
 */
export const ServiceAuth = (): CustomDecorator => SetMetadata(SERVICE_AUTH_KEY, true);
