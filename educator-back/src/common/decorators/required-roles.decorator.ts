import { CustomDecorator, SetMetadata } from '@nestjs/common';
import { RoleSlug } from '../constants';

export const ROLES_KEY = 'requiredRoles';

/**
 * Role gate enforced by the global `AuthGuard` (ADR-0005): the caller passes if its account
 * `roles[]` contains any of the listed roles, otherwise 403. The selected role (`type`) is never
 * consulted. Apply on the `@Controller()` class or on a route; a route-level `@RequiredRoles`
 * replaces (does not merge with) the controller-level one. Without it, any authenticated caller
 * is allowed. Never pair it with a per-route auth guard.
 */
export const RequiredRoles = (...roles: RoleSlug[]): CustomDecorator => SetMetadata(ROLES_KEY, roles);
