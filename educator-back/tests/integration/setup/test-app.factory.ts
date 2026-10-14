import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ModuleMetadata } from '@nestjs/common/interfaces';
import { PassportModule } from '@nestjs/passport';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ClsService } from 'nestjs-cls';
import { I18nService } from 'nestjs-i18n';
import { AuthService } from 'src/auth/auth.service';
import { AuthGuard } from 'src/common/guards/auth.guard';
import { RedisService } from 'src/redis/redis.service';
import { REDIS_CLIENT } from 'src/redis/redis.constants';
import { EducatorSessionService } from 'src/session/educator-session.service';
import { HttpExceptionFilter } from 'src/common/filters/http-exception.filter';
import { ResponseInterceptor } from 'src/common/interceptors/response.interceptor';
import { createValidationPipe } from 'src/common/pipes/validation.pipe';
import { AzureBlobService, LoggerService } from 'src/common/services';
import { TokenService } from 'src/common/services/token.service';
import {
  EDUCATOR_REPOSITORY,
  STUDENT_REPOSITORY,
  USER_REPOSITORY,
  USER_ROLE_REPOSITORY,
} from 'src/database/tokens';
import { LmsGradeService } from 'src/lms/services/lms-grade.service';
import { LmsAssignmentService } from 'src/lms/services/lms-assignment.service';
import { GoogleGradePassbackService } from 'src/google/google-grade-passback.service';
import { ForgotPasswordRateLimiterService } from 'src/auth/services/forgot-password-rate-limiter.service';
import { ForgotPasswordThrottleGuard } from 'src/auth/guards/forgot-password-throttle.guard';
import { RoleSlug, TokenPurposeType, UserTokenType } from 'src/common/constants';
import { CommonStatus } from 'src/common/enums/status.enum';
import { UserRole } from 'src/database/entities';

export const lmsGradePassbackProviders = [
  {
    provide: GoogleGradePassbackService,
    useValue: {
      submitScore: jest.fn().mockResolvedValue({ success: true, syncLogId: null, skipped: true }),
      getLastSuccessfulScore: jest.fn().mockResolvedValue(null),
    },
  },
  {
    provide: LmsGradeService,
    useValue: {
      submitScore: jest.fn().mockResolvedValue({ success: true, syncLogId: 'test-sync-log' }),
      getLastSuccessfulScore: jest.fn().mockResolvedValue(null),
    },
  },
  {
    provide: LmsAssignmentService,
    useValue: {
      findMapping: jest.fn().mockResolvedValue(null),
      upsertMapping: jest.fn().mockResolvedValue(null),
      inferSingleClassSimulation: jest.fn().mockResolvedValue(null),
      linkSimulationToMapping: jest.fn().mockResolvedValue(null),
      findByClass: jest.fn().mockResolvedValue([]),
    },
  },
];

const testLogger = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
} as unknown as LoggerService;

export const TEST_JWT_SECRET = 'test-integration-secret-key';

export interface TestUser {
  sub: string;
  email: string;
  roles: RoleSlug[];
  type: UserTokenType;
  purpose: TokenPurposeType;
  /** Only meaningful for `type: UserTokenType.ADMIN` — backs `matchedUserRole.districtAdmin`. */
  districtAdminId?: string;
  /** Only meaningful for `type: UserTokenType.EDUCATOR` — backs `matchedUserRole.educator.id`. */
  educatorId?: string;
}

/**
 * Real (v2) `UserTokenType`/`RoleSlug`/`TokenPurposeType` values — a token signed from one of
 * these round-trips through the live `AuthService.validateUserToken()` (see `jwtProviders` below), which
 * re-checks the account/role against `USER_REPOSITORY`/`USER_ROLE_REPOSITORY` on every request.
 * `superAdmin` here is just a *second, distinct* District Admin account (there is no separate
 * "Super Admin" role in the v2 model — `auth-guard-v2.md` confirms the old `'Super Admin'`
 * string check was dead code, never seeded) — useful for "a different admin" ownership tests.
 */
export const TEST_USERS = {
  districtAdmin: {
    sub: '550e8400-e29b-41d4-a716-446655440001',
    email: 'admin@test.com',
    roles: [RoleSlug.DISTRICT_ADMIN],
    type: UserTokenType.ADMIN,
    purpose: TokenPurposeType.ACCESS,
    districtAdminId: '550e8400-e29b-41d4-a716-446655440011',
  },
  superAdmin: {
    sub: '550e8400-e29b-41d4-a716-446655440002',
    email: 'super@test.com',
    roles: [RoleSlug.DISTRICT_ADMIN],
    type: UserTokenType.ADMIN,
    purpose: TokenPurposeType.ACCESS,
    districtAdminId: '550e8400-e29b-41d4-a716-446655440012',
  },
  educator: {
    sub: '550e8400-e29b-41d4-a716-446655440003',
    email: 'educator@test.com',
    roles: [RoleSlug.EDUCATOR],
    type: UserTokenType.EDUCATOR,
    purpose: TokenPurposeType.ACCESS,
    // Deliberately DISTINCT from `sub`: `req.user.userId` is the account's `users.id` while
    // `req.user.educatorId` is the `educators.id`. Keeping them equal would let code that
    // queries the educators table with a `users.id` pass its tests and fail in production.
    educatorId: '550e8400-e29b-41d4-a716-446655440013',
  },
  /**
   * A second, distinct Educator for suites that write `educator_simulations` rows while another
   * suite asserts the first educator's library is empty (integration suites run in parallel
   * against one database).
   */
  secondEducator: {
    sub: '550e8400-e29b-41d4-a716-446655440008',
    email: 'educator2@test.com',
    roles: [RoleSlug.EDUCATOR],
    type: UserTokenType.EDUCATOR,
    purpose: TokenPurposeType.ACCESS,
    educatorId: '550e8400-e29b-41d4-a716-446655440016',
  },
  /**
   * A third, distinct Educator, for the dropdown suites that save library entries while the
   * filter suites assert exact lists for the second one.
   */
  thirdEducator: {
    sub: '550e8400-e29b-41d4-a716-446655440007',
    email: 'educator3@test.com',
    roles: [RoleSlug.EDUCATOR],
    type: UserTokenType.EDUCATOR,
    purpose: TokenPurposeType.ACCESS,
    educatorId: '550e8400-e29b-41d4-a716-446655440017',
  },
  /**
   * One account holding both the educator and district admin roles. The default token acts as an
   * educator; sign it with `{ type: UserTokenType.ADMIN }` to act as the district admin.
   */
  dualRole: {
    sub: '550e8400-e29b-41d4-a716-446655440004',
    email: 'dual@test.com',
    roles: [RoleSlug.EDUCATOR, RoleSlug.DISTRICT_ADMIN],
    type: UserTokenType.EDUCATOR,
    purpose: TokenPurposeType.ACCESS,
    districtAdminId: '550e8400-e29b-41d4-a716-446655440014',
    educatorId: '550e8400-e29b-41d4-a716-446655440015',
  },
  scenarioAdmin: {
    sub: '550e8400-e29b-41d4-a716-446655440005',
    email: 'scenario-admin@test.com',
    roles: [RoleSlug.SCENARIO_ADMIN],
    type: UserTokenType.SCENARIO_ADMIN,
    purpose: TokenPurposeType.ACCESS,
  },
  student: {
    sub: '550e8400-e29b-41d4-a716-446655440006',
    email: 'student@test.com',
    roles: [RoleSlug.STUDENT],
    type: UserTokenType.STUDENT,
    purpose: TokenPurposeType.ACCESS,
  },
} satisfies Record<string, TestUser>;

const TEST_USERS_BY_SUB = new Map<string, TestUser>(
  Object.values(TEST_USERS).map((user) => [user.sub, user]),
);

/**
 * Builds the `UserRole[]` shape `UserRoleRepository.findByUserId` returns for a given
 * `TestUser` — matches what `AuthService.validateUserToken()` reads (`activeUserRoles`, `.role.slug`,
 * `.districtAdmin.districtAdminId`, `.educator?.id`).
 */
function buildActiveUserRoles(user: TestUser): Partial<UserRole>[] {
  return user.roles.map((slug) => ({
    userRoleId: `${user.sub}-${slug}`,
    userId: user.sub,
    status: CommonStatus.ACTIVE,
    role: { id: `role-${slug}`, role_name: slug, slug } as UserRole['role'],
    districtAdmin:
      slug === RoleSlug.DISTRICT_ADMIN
        ? ({ districtAdminId: user.districtAdminId } as UserRole['districtAdmin'])
        : undefined,
    educator:
      slug === RoleSlug.EDUCATOR ? ({ id: user.educatorId } as UserRole['educator']) : undefined,
  }));
}

/**
 * Default `USER_REPOSITORY` mock backing `AuthService.validateUserToken()` — resolves any `TEST_USERS`
 * entry's `sub` to a minimal `{ id, email }` record (all `validateUserToken` reads off `userRepo`),
 * and `null` for anything else (an "account not found" 401). Suites that need their OWN
 * `USER_REPOSITORY` mock for business logic (e.g. `InvitesService.findCreatorById`) should
 * layer their business-only ids on top of this via `findOne.mockImplementation`, rather than a
 * blanket `mockResolvedValue`, so JWT auth for the `TEST_USERS` tokens they sign keeps working —
 * see the per-suite specs for the established pattern.
 */
function defaultUserRepositoryFindOne(options: {
  where?: { id?: string };
}): Promise<{ id: string; email: string } | null> {
  const id = options?.where?.id;
  const user = id ? TEST_USERS_BY_SUB.get(id) : undefined;
  return Promise.resolve(user ? { id: user.sub, email: user.email } : null);
}

/**
 * Default `USER_ROLE_REPOSITORY.findByUserId` mock backing `AuthService.validateUserToken()` — exported
 * so a suite that must override the `USER_ROLE_REPOSITORY` token for its own business logic
 * (e.g. `InvitesService.userRoleRepo.activate`) can still wire this in for the JWT auth path,
 * e.g. `{ activate: jest.fn(), findByUserId: jest.fn().mockImplementation(defaultUserRoleRepositoryFindByUserId) }`.
 */
export function defaultUserRoleRepositoryFindByUserId(userId: string): Promise<UserRole[]> {
  const user = TEST_USERS_BY_SUB.get(userId);
  return Promise.resolve(user ? (buildActiveUserRoles(user) as UserRole[]) : []);
}

export const jwtProviders = [
  // Mirrors the root AppModule: the single global default-deny guard (ADR-0005).
  { provide: APP_GUARD, useClass: AuthGuard },
  // Mirrors the root AppModule: the single global exception filter.
  { provide: APP_FILTER, useClass: HttpExceptionFilter },
  // Mirrors the root AppModule: the single global response envelope interceptor.
  { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
  // The global `AuthGuard` resolves identity through `AuthService.validateUserToken`, which only
  // touches the token service and the user/user-role/student repositories — so a real instance is
  // built over those (mockable) tokens instead of wiring `AuthService`'s full dependency graph.
  // A suite that provides its own `AuthService` overrides this (its providers come last).
  {
    provide: AuthService,
    useFactory: (
      tokenService: TokenService,
      userRepo: unknown,
      userRoleRepo: unknown,
      studentRepo: unknown,
    ): AuthService =>
      Object.assign(Object.create(AuthService.prototype) as AuthService, {
        tokenService,
        userRepo,
        userRoleRepo,
        studentRepo,
      }),
    inject: [TokenService, USER_REPOSITORY, USER_ROLE_REPOSITORY, STUDENT_REPOSITORY],
  },
  TokenService,
  // TokenService's blacklist is Redis-backed; a null client puts RedisService in its in-memory mode.
  { provide: REDIS_CLIENT, useValue: null },
  RedisService,
  ForgotPasswordRateLimiterService,
  ForgotPasswordThrottleGuard,
  { provide: I18nService, useValue: { t: jest.fn((key: string) => key) } },
  {
    provide: AzureBlobService,
    useValue: { uploadFile: jest.fn(), generateSasUrl: jest.fn().mockResolvedValue('') },
  },
  {
    provide: EducatorSessionService,
    useValue: {
      isTokenInvalidated: jest.fn().mockResolvedValue(false),
      invalidateEducator: jest.fn().mockResolvedValue(undefined),
      invalidateBySchool: jest.fn().mockResolvedValue([]),
      evictCache: jest.fn(),
    },
  },
  {
    provide: EDUCATOR_REPOSITORY,
    useValue: {
      findOne: jest.fn().mockImplementation(async (options: any) => {
        // Return a valid active educator by default for JWT strategy to validate
        if (options?.where?.id) {
          return {
            id: options.where.id,
            is_active: true,
            status: 'ACTIVE',
          };
        }
        return null;
      }),
    },
  },
  {
    provide: STUDENT_REPOSITORY,
    useValue: {
      findOne: jest.fn().mockImplementation(async (options: any) => {
        if (options?.where) {
          return {
            id: 'student-id',
            is_active: true,
            deleted_at: null,
            status: 'ACTIVE',
            class: { is_active: true, deleted_at: null, status: 'ACTIVE' },
            educator: { is_active: true, deleted_at: null, status: 'ACTIVE' },
          };
        }
        return null;
      }),
    },
  },
  {
    provide: USER_REPOSITORY,
    useValue: {
      findOne: jest.fn().mockImplementation(defaultUserRepositoryFindOne),
    },
  },
  {
    provide: USER_ROLE_REPOSITORY,
    useValue: {
      findByUserId: jest.fn().mockImplementation(defaultUserRoleRepositoryFindByUserId),
    },
  },
  // Backs the global `ResponseInterceptor`/`HttpExceptionFilter`; `t()` just echoes the
  // key back untranslated for tests.
  {
    provide: I18nService,
    useValue: {
      t: jest.fn().mockImplementation((key: string) => key),
      translate: jest.fn().mockImplementation((key: string) => key),
    },
  },
  {
    provide: ClsService,
    useValue: {
      set: jest.fn(),
      get: jest.fn(),
      isActive: jest.fn().mockReturnValue(false),
      getId: jest.fn(),
    },
  },
  {
    provide: ConfigService,
    useValue: {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'JWT_SECRET' || key === 'jwt.accessSecret') return TEST_JWT_SECRET;
        if (key === 'JWT_EXPIRES_IN') return '1h';
        if (key === 'jwt.accessExpiresIn') return 3600;
        if (key === 'FRONTEND_URL' || key === 'app.frontendUrl') return 'http://localhost:5173';
        if (key === 'CRYPTO_SECRET' || key === 'app.cryptoSecret')
          return 'test-invite-token-secret';
        return null;
      }),
    },
  },
  {
    provide: LoggerService,
    useValue: testLogger,
  },
  {
    // Needed by ResponseInterceptor and the global HttpExceptionFilter.
    provide: I18nService,
    useValue: { t: jest.fn((key: string) => key) },
  },
];

export const jwtImports = [
  PassportModule.register({ defaultStrategy: 'jwt' }),
  JwtModule.register({ secret: TEST_JWT_SECRET, signOptions: { expiresIn: '1h' } }),
];

export async function buildTestApp(meta: ModuleMetadata): Promise<{
  app: INestApplication;
  module: TestingModule;
  signToken: (user?: Partial<TestUser>) => string;
}> {
  const module: TestingModule = await Test.createTestingModule({
    imports: [...jwtImports, ...(meta.imports ?? [])],
    controllers: meta.controllers ?? [],
    providers: [...jwtProviders, ...(meta.providers ?? [])],
  }).compile();

  const app = module.createNestApplication();
  app.useLogger(false);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(createValidationPipe());
  await app.init();

  const jwtService = module.get(JwtService);

  function signToken(user: Partial<TestUser> = TEST_USERS.districtAdmin): string {
    const payload = { ...TEST_USERS.districtAdmin, ...user };
    return jwtService.sign({
      sub: payload.sub,
      email: payload.email,
      roles: payload.roles,
      type: payload.type,
      purpose: payload.purpose,
    });
  }

  return { app, module, signToken };
}
