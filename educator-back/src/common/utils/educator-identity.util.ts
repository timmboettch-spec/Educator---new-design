import { FindOptionsSelect } from 'typeorm';
import { Educator, User } from 'src/database/entities';
import { CommonStatus } from 'src/common/enums/status.enum';
import { EducatorResponse } from 'src/common/interfaces';

/**
 * The only `userRole.user` fields any educator-loading query needs to select — `email`/`password`
 * because `resolveEducatorEmail`/`resolveEducatorPassword` below read them, `id` because TypeORM
 * needs the relation's own primary key to hydrate it. `password` is `select: false` on `User`, so
 * every call site that loads `educator.userRole.user` must pass this explicitly as its `select`
 * to opt it back in — keep it here, next to the resolvers that depend on it, instead of
 * duplicating the field list at each call site.
 */
export const EDUCATOR_USER_SELECT: FindOptionsSelect<User> = {
  id: true,
  email: true,
  password: true,
};

/** Resolves the v2-linked `users.email` (via `userRole.user`). */
export function resolveEducatorEmail(educator: Educator): string | null {
  return educator.userRole?.user?.email ?? null;
}

/** Resolves the v2-linked `users.password` (via `userRole.user`). */
export function resolveEducatorPassword(educator: Educator): string | null {
  return educator.userRole?.user?.password ?? null;
}

/** Resolves `userRole.status` — `user_roles.status` is `CommonStatus`-typed directly, no mapping needed. */
export function resolveEducatorStatus(educator: Educator): CommonStatus | null {
  return educator.userRole?.status ?? null;
}

/**
 * Shapes an `Educator` for an API response: drops the raw `userRole` relation (which would
 * otherwise leak the linked `users` row, password hash included) and surfaces `email`/`status`
 * at the educator root, resolved via the `userRole.user`/`userRole.status` chain — the shape the
 * frontend still expects now that `Educator.email`/`.password`/`.status` no longer exist as
 * columns. `schools`/`primarySchool` are re-attached explicitly since they're prototype getters
 * that a plain object spread would otherwise silently drop.
 */
export function toEducatorResponse(educator: Educator): EducatorResponse {
  const { userRole, ...rest } = educator;
  void userRole;
  return {
    ...rest,
    schools: educator.schools,
    primarySchool: educator.primarySchool,
    email: resolveEducatorEmail(educator),
    status: resolveEducatorStatus(educator),
  };
}

/** `toEducatorResponse` mapped over a list. */
export function toEducatorResponseList(educators: Educator[]): EducatorResponse[] {
  return educators.map(toEducatorResponse);
}
