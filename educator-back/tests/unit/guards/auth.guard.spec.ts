import {
  Controller,
  ExecutionContext,
  ForbiddenException,
  Get,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JsonWebTokenError, TokenExpiredError } from '@nestjs/jwt';
import { AuthGuard } from '../../../src/common/guards/auth.guard';
import { Public } from '../../../src/common/decorators/public.decorator';
import { RequiredRoles } from '../../../src/common/decorators/required-roles.decorator';
import { AllowRoleSelectionToken } from '../../../src/common/decorators/allow-role-selection-token.decorator';
import { RoleSlug, TokenPurposeType, UserTokenType } from '../../../src/common/constants';
import { ICurrentUser } from '../../../src/common/interfaces';
import { ERROR_MSG } from '../../../src/common/messages/error.message';
import { decodeUnverifiedJwtPayload } from '../../../src/common/utils/token-extractor.util';
import { AUTH_MSG } from 'src/common/messages/auth.message';

@Controller()
class OpenController {
  @Get() plain(): void { }
  @Public() @Get() publicRoute(): void { }
  @AllowRoleSelectionToken() @Get() roleSelection(): void { }
  @RequiredRoles(RoleSlug.EDUCATOR) @Get() educatorOnly(): void { }
}

@Public()
@Controller()
class PublicController {
  @Get() anything(): void { }
}

@RequiredRoles(RoleSlug.DISTRICT_ADMIN)
@Controller()
class DistrictAdminController {
  @Get() inherited(): void { }
  @RequiredRoles(RoleSlug.STUDENT) @Get() studentOverride(): void { }
}

type Handler = (...args: unknown[]) => unknown;

describe('AuthGuard', () => {
  let guard: AuthGuard;
  let validateUserToken: jest.Mock;
  let cls: { isActive: jest.Mock; set: jest.Mock };

  const educator: ICurrentUser = {
    userId: 'u1',
    roles: [RoleSlug.EDUCATOR],
    purpose: TokenPurposeType.ACCESS,
    type: UserTokenType.EDUCATOR,
  };

  const buildContext = (cls: object, handler: Handler, user?: ICurrentUser): ExecutionContext => {
    const request = { headers: { authorization: 'Bearer test-token' }, cookies: {}, user };
    return {
      switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({}) }),
      getHandler: () => handler,
      getClass: () => cls,
    } as unknown as ExecutionContext;
  };

  /** Simulates `AuthService.validateUserToken`: resolves the identity, or rejects like a bad token. */
  const authenticateAs = (user: ICurrentUser | Error): void => {
    if (user instanceof Error) validateUserToken.mockRejectedValue(user);
    else validateUserToken.mockResolvedValue(user);
  };

  beforeEach(() => {
    validateUserToken = jest.fn();
    cls = { isActive: jest.fn().mockReturnValue(false), set: jest.fn() };
    guard = new AuthGuard(new Reflector(), { validateUserToken } as never, cls as never);
  });

  describe('@Public()', () => {
    it('bypasses authentication on a public route', async () => {
      authenticateAs(new UnauthorizedException());
      const proto = OpenController.prototype;
      await expect(
        guard.canActivate(buildContext(OpenController, proto.publicRoute)),
      ).resolves.toBe(true);
      expect(validateUserToken).not.toHaveBeenCalled();
    });

    it('bypasses authentication on every route of a public controller', async () => {
      authenticateAs(new UnauthorizedException());
      const proto = PublicController.prototype;
      await expect(guard.canActivate(buildContext(PublicController, proto.anything))).resolves.toBe(
        true,
      );
    });
  });

  describe('authentication', () => {
    it('rejects a missing token with 401 without validating', async () => {
      const ctx = buildContext(OpenController, OpenController.prototype.plain);
      ctx.switchToHttp().getRequest<{ headers: object }>().headers = {};
      await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(validateUserToken).not.toHaveBeenCalled();
    });

    it.each(['invalid', 'expired', 'blacklisted'])(
      'rejects a %s token with 401',
      async () => {
        authenticateAs(new UnauthorizedException());
        const proto = OpenController.prototype;
        await expect(
          guard.canActivate(buildContext(OpenController, proto.plain)),
        ).rejects.toBeInstanceOf(UnauthorizedException);
      },
    );

    it('allows any authenticated caller on a route without @RequiredRoles', async () => {
      authenticateAs({ userId: 's1', roles: [RoleSlug.STUDENT], type: UserTokenType.STUDENT });
      const proto = OpenController.prototype;
      await expect(guard.canActivate(buildContext(OpenController, proto.plain))).resolves.toBe(
        true,
      );
    });
  });

  describe('role-selection token', () => {
    const loginToken: ICurrentUser = {
      userId: 'u1',
      roles: [RoleSlug.EDUCATOR, RoleSlug.DISTRICT_ADMIN],
      purpose: TokenPurposeType.LOGIN,
    };

    it('rejects a login-purpose token with 401 on a normal route', async () => {
      authenticateAs(loginToken);
      const proto = OpenController.prototype;
      await expect(
        guard.canActivate(buildContext(OpenController, proto.plain)),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('tells a login-purpose caller to select a role, not a bare "Unauthorized"', async () => {
      authenticateAs(loginToken);
      const proto = OpenController.prototype;
      await expect(
        guard.canActivate(buildContext(OpenController, proto.educatorOnly)),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ message: AUTH_MSG.ROLE_SELECTION_REQUIRED }),
      });
    });

    it('allows a login-purpose token on an @AllowRoleSelectionToken route', async () => {
      authenticateAs(loginToken);
      const proto = OpenController.prototype;
      await expect(
        guard.canActivate(buildContext(OpenController, proto.roleSelection)),
      ).resolves.toBe(true);
    });
  });

  describe('@RequiredRoles()', () => {
    it('returns 403 when no required role is in the account roles', async () => {
      authenticateAs({ userId: 's1', roles: [RoleSlug.STUDENT], type: UserTokenType.STUDENT });
      const proto = OpenController.prototype;
      await expect(
        guard.canActivate(buildContext(OpenController, proto.educatorOnly)),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects a dual-role account acting as district admin from an educator-only route, even though the account also holds educator', async () => {
      authenticateAs({
        userId: 'u1',
        roles: [RoleSlug.DISTRICT_ADMIN, RoleSlug.EDUCATOR],
        purpose: TokenPurposeType.ACCESS,
        type: UserTokenType.ADMIN,
      });
      const proto = OpenController.prototype;
      await expect(
        guard.canActivate(buildContext(OpenController, proto.educatorOnly)),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allows a dual-role account when the selected role (type) matches, regardless of the full roles list', async () => {
      authenticateAs({
        userId: 'u1',
        roles: [RoleSlug.DISTRICT_ADMIN, RoleSlug.EDUCATOR],
        purpose: TokenPurposeType.ACCESS,
        type: UserTokenType.EDUCATOR,
      });
      const proto = OpenController.prototype;
      await expect(
        guard.canActivate(buildContext(OpenController, proto.educatorOnly)),
      ).resolves.toBe(true);
    });

    it('maps the district-admin token type (admin) to RoleSlug.DISTRICT_ADMIN', async () => {
      authenticateAs({
        userId: 'u1',
        roles: [RoleSlug.DISTRICT_ADMIN],
        purpose: TokenPurposeType.ACCESS,
        type: UserTokenType.ADMIN,
      });
      const proto = DistrictAdminController.prototype;
      await expect(
        guard.canActivate(buildContext(DistrictAdminController, proto.inherited)),
      ).resolves.toBe(true);
    });

    it('forces a student token to RoleSlug.STUDENT regardless of a mismatched roles claim', async () => {
      authenticateAs({
        userId: 's1',
        roles: [RoleSlug.STUDENT],
        purpose: TokenPurposeType.ACCESS,
        type: UserTokenType.STUDENT,
      });
      const proto = DistrictAdminController.prototype;
      await expect(
        guard.canActivate(buildContext(DistrictAdminController, proto.studentOverride)),
      ).resolves.toBe(true);
    });

    it('applies controller-level roles to routes without their own', async () => {
      authenticateAs(educator);
      const proto = DistrictAdminController.prototype;
      await expect(
        guard.canActivate(buildContext(DistrictAdminController, proto.inherited)),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('lets route-level roles replace controller-level roles', async () => {
      authenticateAs({ userId: 's1', roles: [RoleSlug.STUDENT], type: UserTokenType.STUDENT });
      const proto = DistrictAdminController.prototype;
      await expect(
        guard.canActivate(buildContext(DistrictAdminController, proto.studentOverride)),
      ).resolves.toBe(true);

      authenticateAs({ ...educator, roles: [RoleSlug.DISTRICT_ADMIN] });
      await expect(
        guard.canActivate(buildContext(DistrictAdminController, proto.studentOverride)),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('token validation failures', () => {
    const run = (): Promise<boolean> =>
      guard.canActivate(buildContext(OpenController, OpenController.prototype.plain));

    it('populates request.user and the CLS store for an authenticated caller', async () => {
      authenticateAs(educator);
      cls.isActive.mockReturnValue(true);
      const ctx = buildContext(OpenController, OpenController.prototype.plain);
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(ctx.switchToHttp().getRequest<{ user: ICurrentUser }>().user).toBe(educator);
      expect(cls.set).toHaveBeenCalledWith('user', educator);
    });

    it('keeps a generic 401 for a token that fails signature verification', async () => {
      authenticateAs(new JsonWebTokenError('invalid signature'));
      await expect(run()).rejects.toEqual(new UnauthorizedException(ERROR_MSG.COMMON.UNAUTHORIZED));
    });

    it('keeps a generic 401 for an expired token', async () => {
      authenticateAs(new TokenExpiredError('jwt expired', new Date()));
      await expect(run()).rejects.toEqual(new UnauthorizedException(ERROR_MSG.COMMON.UNAUTHORIZED));
    });

    it('keeps a generic 401 when validation fails unexpectedly', async () => {
      authenticateAs(new Error('db down'));
      await expect(run()).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('propagates a 403 from validation unchanged', async () => {
      const forbidden = new ForbiddenException('nope');
      authenticateAs(forbidden);
      await expect(run()).rejects.toBe(forbidden);
    });
  });
});

describe('decodeUnverifiedJwtPayload', () => {
  it('reads the payload of a JWT-shaped token', () => {
    const token = ['e30', Buffer.from('{"purpose":"login"}').toString('base64url'), 's'].join('.');
    expect(decodeUnverifiedJwtPayload(token)).toEqual({ purpose: 'login' });
  });

  it.each(['', 'not-a-jwt', 'a.!!!.c', `a.${Buffer.from('"str"').toString('base64url')}.c`])(
    'returns null for %p',
    (token) => {
      expect(decodeUnverifiedJwtPayload(token)).toBeNull();
    },
  );
});
