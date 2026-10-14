import { Controller, Get, INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { buildTestApp, TEST_USERS } from '../setup/test-app.factory';
import { AllowRoleSelectionToken } from 'src/common/decorators/allow-role-selection-token.decorator';
import { RequiredRoles } from 'src/common/decorators/required-roles.decorator';
import { RoleSlug, TokenPurposeType } from 'src/common/constants';
import { CommonStatus } from 'src/common/enums/status.enum';
import { AUTH_MSG } from 'src/common/messages/auth.message';
import { ERROR_MSG } from 'src/common/messages/error.message';
import { USER_ROLE_REPOSITORY } from 'src/database/tokens';

@Controller('role-selection-probe')
class RoleSelectionProbeController {
  @Get('educator')
  @RequiredRoles(RoleSlug.EDUCATOR)
  educatorOnly(): string {
    return 'ok';
  }

  @Get('select')
  @AllowRoleSelectionToken()
  select(): string {
    return 'ok';
  }
}

/**
 * The 401 a role-selection (`purpose: 'login'`) token gets on a full-access route, end to end
 * through the real `JwtStrategy` + `AuthGuard` + `HttpExceptionFilter`. The test i18n mock
 * returns the key itself, so `message` is asserted as the `AUTH_MSG` key.
 */
describe('Role-selection token rejections (Integration)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  const educatorUrl = '/api/role-selection-probe/educator';
  const httpServer = (): Parameters<typeof request>[0] =>
    app.getHttpServer() as Parameters<typeof request>[0];
  const signLoginToken = (expiresIn: number): string =>
    jwtService.sign(
      { sub: TEST_USERS.educator.sub, purpose: TokenPurposeType.LOGIN },
      { expiresIn },
    );

  beforeAll(async () => {
    ({ app } = await buildTestApp({
      controllers: [RoleSelectionProbeController],
      providers: [
        {
          // A two-role account — the only kind that is ever issued a role-selection token.
          provide: USER_ROLE_REPOSITORY,
          useValue: {
            findByUserId: jest.fn().mockResolvedValue(
              [RoleSlug.EDUCATOR, RoleSlug.DISTRICT_ADMIN].map((slug) => ({
                status: CommonStatus.ACTIVE,
                role: { slug },
                educator: { id: TEST_USERS.educator.educatorId },
                districtAdmin: { districtAdminId: 'district-admin-1' },
              })),
            ),
          },
        },
      ],
    }));
    jwtService = app.get(JwtService);
  });

  afterAll(async () => app.close());

  it('INTEGRATION: tells a valid role-selection token to select a role', async () => {
    const res = await request(httpServer())
      .get(educatorUrl)
      .set('Authorization', `Bearer ${signLoginToken(120)}`)
      .expect(401);
    expect((res.body as { message: string }).message).toBe(AUTH_MSG.ROLE_SELECTION_REQUIRED);
  });

  it('INTEGRATION: still accepts a valid role-selection token on an @AllowRoleSelectionToken route', () => {
    return request(httpServer())
      .get('/api/role-selection-probe/select')
      .set('Authorization', `Bearer ${signLoginToken(120)}`)
      .expect(200);
  });

  it('INTEGRATION: keeps the generic 401 for an expired access token and for no token', async () => {
    const expiredAccess = jwtService.sign(
      { ...TEST_USERS.educator, purpose: TokenPurposeType.ACCESS },
      { expiresIn: -10 },
    );
    const expiredRes = await request(httpServer())
      .get(educatorUrl)
      .set('Authorization', `Bearer ${expiredAccess}`)
      .expect(401);
    const noTokenRes = await request(httpServer()).get(educatorUrl).expect(401);

    expect((expiredRes.body as { message: string }).message).toBe(ERROR_MSG.COMMON.UNAUTHORIZED);
    expect((noTokenRes.body as { message: string }).message).toBe(ERROR_MSG.COMMON.UNAUTHORIZED);
  });
});
