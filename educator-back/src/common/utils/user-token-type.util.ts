import { ForbiddenException } from '@nestjs/common';
import { RoleSlug, UserTokenType } from 'src/common/constants';
import type { ICurrentUser } from 'src/common/interfaces';
import { ERROR_MSG } from 'src/common/messages/error.message';

/**
 * Maps a `user_roles.role.slug` to the JWT `type` claim a v2 token signs it as. The mapping is
 * one-to-one: `RoleSlug.DISTRICT_ADMIN` → `UserTokenType.ADMIN` and `RoleSlug.SCENARIO_ADMIN` →
 * `UserTokenType.SCENARIO_ADMIN` are distinct token types.
 */
const ROLE_SLUG_TO_TOKEN_TYPE: Record<RoleSlug, UserTokenType> = {
  [RoleSlug.DISTRICT_ADMIN]: UserTokenType.ADMIN,
  [RoleSlug.SCENARIO_ADMIN]: UserTokenType.SCENARIO_ADMIN,
  [RoleSlug.EDUCATOR]: UserTokenType.EDUCATOR,
  [RoleSlug.STUDENT]: UserTokenType.STUDENT,
};

export function mapRoleSlugToUserTokenType(slug: string): UserTokenType | undefined {
  return ROLE_SLUG_TO_TOKEN_TYPE[slug as RoleSlug];
}

/** Inverse of `mapRoleSlugToUserTokenType` — every RoleSlug whose token `type` matches. Used by
 * `JwtStrategyV2` to confirm a token's claimed `type` still corresponds to one of the account's
 * currently active roles. */
export function mapUserTokenTypeToRoleSlugs(type: UserTokenType): RoleSlug[] {
  return (Object.keys(ROLE_SLUG_TO_TOKEN_TYPE) as RoleSlug[]).filter(
    (slug) => ROLE_SLUG_TO_TOKEN_TYPE[slug] === type,
  );
}

/** The single role the caller is acting as (their token's `type`). Never falls back to a default
 * role: a caller with no selected role is refused rather than treated as an educator. */
export function resolveSelectedRole(currentUser: ICurrentUser): RoleSlug {
  const [selectedRole] = currentUser.type ? mapUserTokenTypeToRoleSlugs(currentUser.type) : [];
  if (!selectedRole) {
    throw new ForbiddenException(ERROR_MSG.COMMON.FORBIDDEN);
  }
  return selectedRole;
}
