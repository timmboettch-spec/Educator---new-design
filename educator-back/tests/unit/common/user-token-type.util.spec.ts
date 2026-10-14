import { ForbiddenException } from '@nestjs/common';
import { RoleSlug, UserTokenType } from 'src/common/constants';
import type { ICurrentUser } from 'src/common/interfaces';
import { resolveSelectedRole } from 'src/common/utils/user-token-type.util';

const userWithType = (type?: UserTokenType): ICurrentUser => ({
  userId: '11111111-1111-1111-1111-111111111111',
  type,
});

describe('resolveSelectedRole', () => {
  it.each([
    [UserTokenType.EDUCATOR, RoleSlug.EDUCATOR],
    [UserTokenType.ADMIN, RoleSlug.DISTRICT_ADMIN],
    [UserTokenType.SCENARIO_ADMIN, RoleSlug.SCENARIO_ADMIN],
    [UserTokenType.STUDENT, RoleSlug.STUDENT],
  ])('maps the %s token type to the %s role', (type, expected) => {
    expect(resolveSelectedRole(userWithType(type))).toBe(expected);
  });

  it('ignores the account roles — the selected role alone decides', () => {
    const user: ICurrentUser = {
      ...userWithType(UserTokenType.ADMIN),
      roles: [RoleSlug.EDUCATOR, RoleSlug.DISTRICT_ADMIN],
    };

    expect(resolveSelectedRole(user)).toBe(RoleSlug.DISTRICT_ADMIN);
  });

  it('refuses a caller with no selected role instead of defaulting to educator', () => {
    expect(() => resolveSelectedRole(userWithType(undefined))).toThrow(ForbiddenException);
  });
});
