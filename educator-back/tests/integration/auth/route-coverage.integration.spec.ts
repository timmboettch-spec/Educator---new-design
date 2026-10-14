import {
  ExecutionContext,
  HttpException,
  INestApplication,
  RequestMethod,
  VersioningType,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { MODULE_PATH, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ConfigService } from '@nestjs/config';
import { DiscoveryService, MetadataScanner, ModulesContainer, Reflector } from '@nestjs/core';
import { SchedulerRegistry } from '@nestjs/schedule';
import { PrometheusController } from '@willsoto/nestjs-prometheus';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import * as jwt from 'jsonwebtoken';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from 'src/app.module';
import { ALLOW_ROLE_SELECTION_TOKEN_KEY } from 'src/common/decorators/allow-role-selection-token.decorator';
import { IS_PUBLIC_KEY } from 'src/common/decorators/public.decorator';
import { ROLES_KEY } from 'src/common/decorators/required-roles.decorator';
import { AuthGuard } from 'src/common/guards/auth.guard';
import { AuthThrottlerGuard } from 'src/common/guards/auth-throttler.guard';
import { RoleSlug, TokenPurposeType, UserTokenType } from 'src/common/constants';
import { CommonStatus } from 'src/common/enums/status.enum';
import { LtiKeyService } from 'src/lti/lti-key.service';
import { MailService } from 'src/mail/mail.service';
import { NotificationDigestService } from 'src/notifications/notification-digest.service';
import { UploadsService } from 'src/student-backend/modules/uploads/uploads.service';
import { StudentRepository, UserRepository, UserRoleRepository } from 'src/database/repositories';
import { User, UserRole } from 'src/database/entities';
import { STUDENT_REPOSITORY, USER_REPOSITORY, USER_ROLE_REPOSITORY } from 'src/database/tokens';
import { REDIS_CLIENT } from 'src/redis/redis.constants';
import { RedisService } from 'src/redis/redis.service';

// `AppModule` validates env and reads config when it is imported, so these are mocked (jest hoists
// them above the imports) instead of requiring a real `.env`.
jest.mock('src/common/dtos/env.validation', () => ({
  ...jest.requireActual<object>('src/common/dtos/env.validation'),
  validateEnv: (config: Record<string, unknown>): Record<string, unknown> => config,
}));
jest.mock('src/common/config/jwt.config', () => {
  const { registerAs } = jest.requireActual<typeof import('@nestjs/config')>('@nestjs/config');
  return {
    __esModule: true,
    default: registerAs('jwt', () => ({
      accessSecret: 'route-coverage-jwt-secret',
      accessExpiresIn: 3600,
    })),
  };
});

/**
 * Route-coverage test for the single global default-deny `AuthGuard` (ADR-0005 / ADR-0006).
 *
 * Fully dynamic: every HTTP route is discovered from Nest's own controller metadata, and the
 * expected outcome for each caller is derived from that route's decorators — there is no
 * hand-maintained route list besides the `@Public()` allowlist. What is asserted is the guard's
 * own decision (allow / 401 / 403), captured by wrapping `AuthGuard.canActivate`. Once the guard
 * allows a request, the wrapper ends it with a sentinel status, so CSRF, pipes, interceptors and the
 * controller method itself never run — only routing and authorization are exercised.
 *
 * No `.env` or backing service is needed: env validation and the JWT config are mocked, the TypeORM
 * `DataSource` only builds entity metadata instead of connecting, and the Redis client is `null`
 * (the app's in-memory fallback).
 * No real data is read or written: startup hooks that touch the database, Azure Blob or the mail
 * transport are stubbed before the app compiles, the account lookups `JwtStrategy` performs
 * are stubbed, and scheduled jobs are stopped.
 */

const GLOBAL_PREFIX = 'api';
const PREFIX_EXCLUDED = new Set(['health', 'healthz', 'readyz']);
const PARAM_VALUE = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const REQUEST_TIMEOUT_MS = 3000;
/** Status the request is ended with once the guard allows it, before any controller logic runs. */
const HANDLER_SKIPPED_STATUS = 299;
const SWEEP_TIMEOUT_MS = 600000;

/**
 * Providers whose `onModuleInit` reaches a real backing service (schema change, DB reads/writes,
 * Azure Blob, mail transport). Stubbed on the prototype before `compile()`, since the generic
 * controller-dependency mocks are only applied after `app.init()` has already run these hooks.
 */
const SIDE_EFFECTING_INIT_HOOKS: Array<{ prototype: { onModuleInit(): void } }> = [
  NotificationDigestService, // queries classes, creates reminder notifications
  UploadsService, // createIfNotExists() on a blob container
  MailService, // builds the mail provider and pre-fetches its auth token
  LtiKeyService, // resolves base URL from config
];

/**
 * Third-party controllers this repo cannot decorate, exempt from the one-marker rule only — they
 * are still swept, so the guard's real behaviour on them stays asserted (authenticated, any role).
 */
const UNDECORATABLE_CONTROLLERS: unknown[] = [PrometheusController];

/** ADR-0005's public-route rule, made explicit — adding a `@Public()` route must update this. */
const PUBLIC_ALLOWLIST = [
  // Health
  'GET /api',
  'GET /health',
  'GET /healthz',
  'GET /readyz',
  'GET /api/students-backend/healthz',
  'GET /api/students-backend/readyz',
  'GET /api/students-backend/server-time',
  // Auth
  'POST /api/auth/signup',
  'POST /api/auth/login',
  'POST /api/auth/forgot-password',
  'POST /api/auth/resend-otp',
  'POST /api/auth/verify-otp',
  'POST /api/auth/reset-password',
  // Google OAuth
  'GET /api/auth/google/student/start',
  'GET /api/auth/google/classroom/launch',
  'GET /api/auth/google/callback',
  // Invites (credential-issuing, emailed link)
  'POST /api/invites/verify-token',
  'POST /api/invites/accept-invite',
  // Simulations / students
  'GET /api/simulations/:scenarioId/public',
  'GET /api/students/login',
  // LTI (controller-level)
  'GET /api/lti/jwks',
  'GET /api/lti/studentjwks',
  'POST /api/lti/session/exchange',
  'GET /api/lti/deep-linking/picker',
  'GET /api/lti/deep-linking/simulations',
  'POST /api/lti/deep-linking/exchange',
  'POST /api/lti/deep-linking/submit',
  'GET /api/lti/metadata',
  'ALL /api/lti/login',
  'ALL /api/lti/studentlogin',
  'POST /api/lti/callback',
  'POST /api/lti/studentcallback',
  'ALL /api/lti/launch',
  'ALL /api/lti/studentlaunch',
  // Telemetry (tracked exception)
  'POST /api/students-backend/telemetry/login-session-started',
  'POST /api/students-backend/telemetry/login-session-ended',
  'POST /api/students-backend/telemetry/page-view',
  'POST /api/students-backend/telemetry/scenario-started',
  'POST /api/students-backend/telemetry/scenario-completed',
  'POST /api/students-backend/telemetry/subsystem-lifecycle',
  'GET /api/students-backend/telemetry/analytics',
  'GET /api/students-backend/telemetry/analytics/export',
  'GET /api/students-backend/telemetry/analytics/export/excel',
];

interface DiscoveredRoute {
  key: string;
  method: string;
  path: string;
  handler: object;
  controller: unknown;
  isPublic: boolean;
  allowsRoleSelectionToken: boolean;
  requiredRoles: RoleSlug[] | undefined;
  /** `@RequiredRoles` on the route itself, or inherited from a controller it does not override. */
  declaresRequiredRoles: boolean;
}

/** `allow`, or the HTTP status the guard rejected with; `null` if the guard never ran. */
type GuardDecision = 'allow' | number;

interface GuardOutcome {
  decision: GuardDecision | null;
  handler: object | null;
}

/** One account that holds every staff role, so each token tests only its *selected* role. */
const MULTI_ROLE_ACCOUNT = {
  sub: '550e8400-e29b-41d4-a716-446655440101',
  email: 'rc-multi-role@test.com',
  roles: [RoleSlug.EDUCATOR, RoleSlug.DISTRICT_ADMIN, RoleSlug.SCENARIO_ADMIN],
};

const STAFF_ROLE_TOKEN_TYPES: Array<[RoleSlug, UserTokenType]> = [
  [RoleSlug.EDUCATOR, UserTokenType.EDUCATOR],
  [RoleSlug.DISTRICT_ADMIN, UserTokenType.ADMIN],
  [RoleSlug.SCENARIO_ADMIN, UserTokenType.SCENARIO_ADMIN],
];

function joinPath(...segments: string[]): string {
  const joined = segments
    .flatMap((segment) => segment.split('/'))
    .filter(Boolean)
    .join('/');
  return `/${joined}`;
}

function discoverRoutes(app: INestApplication): DiscoveredRoute[] {
  const discovery = app.get(DiscoveryService);
  const scanner = app.get(MetadataScanner);
  const reflector = app.get(Reflector);
  const applicationId = app.get(ModulesContainer).applicationId;
  const routes: DiscoveredRoute[] = [];

  for (const wrapper of discovery.getControllers()) {
    const controller = wrapper.metatype as (new (...args: unknown[]) => unknown) | undefined;
    if (!controller || !wrapper.instance) continue;

    const modulePath =
      (Reflect.getMetadata(MODULE_PATH + applicationId, wrapper.host!.metatype) as
        string | undefined) ?? '';
    const controllerPaths = [Reflect.getMetadata(PATH_METADATA, controller) as string | string[]]
      .flat()
      .map((path) => path ?? '');
    const prototype = controller.prototype as Record<string, unknown>;

    for (const name of scanner.getAllMethodNames(prototype)) {
      const handler = prototype[name] as object;
      const handlerPath = Reflect.getMetadata(PATH_METADATA, handler) as
        string | string[] | undefined;
      if (handlerPath === undefined) continue;
      const method = RequestMethod[Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod];
      const targets = [handler, controller] as Parameters<Reflector['getAllAndOverride']>[1];

      for (const controllerPath of controllerPaths) {
        for (const path of [handlerPath].flat()) {
          const local = joinPath(modulePath, controllerPath, path);
          const firstSegment = local.split('/')[1] ?? '';
          const full =
            !modulePath && PREFIX_EXCLUDED.has(firstSegment) && local === `/${firstSegment}`
              ? local
              : joinPath(GLOBAL_PREFIX, local);
          const isPublic = !!reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets);
          const allowsRoleSelectionToken = !!reflector.getAllAndOverride<boolean>(
            ALLOW_ROLE_SELECTION_TOKEN_KEY,
            targets,
          );
          const routeRoles = Reflect.getMetadata(ROLES_KEY, handler) as RoleSlug[] | undefined;
          const controllerRoles = Reflect.getMetadata(ROLES_KEY, controller) as
            RoleSlug[] | undefined;
          // A route-level @Public()/@AllowRoleSelectionToken() replaces an inherited
          // controller-level @RequiredRoles, so only a route-level one counts alongside them.
          const overridesControllerRoles =
            !!Reflect.getMetadata(IS_PUBLIC_KEY, handler) ||
            !!Reflect.getMetadata(ALLOW_ROLE_SELECTION_TOKEN_KEY, handler);
          routes.push({
            key: `${method} ${full}`,
            method,
            path: full,
            handler,
            controller,
            isPublic,
            allowsRoleSelectionToken,
            requiredRoles: reflector.getAllAndOverride<RoleSlug[] | undefined>(ROLES_KEY, targets),
            declaresRequiredRoles:
              !!routeRoles?.length || (!!controllerRoles?.length && !overridesControllerRoles),
          });
        }
      }
    }
  }

  return routes;
}

function concretePath(path: string): string {
  return path.replace(/:[A-Za-z0-9_]+/g, PARAM_VALUE).replace(/\*[A-Za-z0-9_]*/g, 'x');
}

function expectedDecision(route: DiscoveredRoute, role: RoleSlug): GuardDecision {
  if (route.isPublic) return 'allow';
  if (!route.requiredRoles?.length || route.requiredRoles.includes(role)) return 'allow';
  return 403;
}

describe('Global AuthGuard — route coverage (INTEGRATION)', () => {
  let app: INestApplication;
  let routes: DiscoveredRoute[];
  let sign: (payload: Record<string, unknown>) => string;
  let outcome: GuardOutcome = { decision: null, handler: null };

  beforeAll(async () => {
    // Keep the sweep from tripping the rate limiter; it is not under test here.
    jest.spyOn(AuthThrottlerGuard.prototype, 'canActivate').mockResolvedValue(true);

    // Record the guard's own verdict for each request, before CSRF/pipes/handler run.
    const originalCanActivate = AuthGuard.prototype.canActivate;
    jest.spyOn(AuthGuard.prototype, 'canActivate').mockImplementation(async function (
      this: AuthGuard,
      context: ExecutionContext,
    ) {
      outcome.handler = context.getHandler();
      try {
        const allowed = await originalCanActivate.call(this, context);
        outcome.decision = allowed ? 'allow' : 403;
      } catch (error) {
        outcome.decision = error instanceof HttpException ? error.getStatus() : 500;
        throw error;
      }
      // Verdict recorded — stop here so no controller logic (or anything after the guard) runs.
      throw new HttpException('route-coverage: handler skipped', HANDLER_SKIPPED_STATUS);
    });

    // Build entity metadata (so repositories resolve) without ever opening a DB connection.
    jest.spyOn(DataSource.prototype, 'initialize').mockImplementation(async function (
      this: DataSource,
    ) {
      await (this as unknown as { buildMetadatas(): Promise<void> }).buildMetadatas();
      Object.defineProperty(this, 'isInitialized', { value: true, configurable: true });
      return this;
    });
    jest.spyOn(DataSource.prototype, 'destroy').mockResolvedValue(undefined);

    for (const { prototype } of SIDE_EFFECTING_INIT_HOOKS) {
      jest.spyOn(prototype, 'onModuleInit').mockImplementation(() => undefined);
    }

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(REDIS_CLIENT)
      .useValue(null)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.use(cookieParser());
    app.setGlobalPrefix(GLOBAL_PREFIX, {
      exclude: ['api-docs', 'api-docs/*path', ...PREFIX_EXCLUDED],
    });
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: VERSION_NEUTRAL });
    await app.init();

    const scheduler = app.get(SchedulerRegistry);
    scheduler.getCronJobs().forEach((job) => void job.stop());
    scheduler.getIntervals().forEach((name) => scheduler.deleteInterval(name));
    scheduler.getTimeouts().forEach((name) => scheduler.deleteTimeout(name));

    // Account lookups JwtStrategy performs while authenticating; nothing else is reached.
    // `TokenService.verifyToken` checks the jti blacklist via RedisService.get — report "not blacklisted".
    jest.spyOn(app.get(RedisService), 'get').mockResolvedValue(null);
    jest
      .spyOn(app.get<UserRepository>(USER_REPOSITORY), 'findOne')
      .mockImplementation(async (options) =>
        (options?.where as { id?: string } | undefined)?.id === MULTI_ROLE_ACCOUNT.sub
          ? ({ id: MULTI_ROLE_ACCOUNT.sub, email: MULTI_ROLE_ACCOUNT.email } as User)
          : null,
      );
    jest
      .spyOn(app.get<UserRoleRepository>(USER_ROLE_REPOSITORY), 'findByUserId')
      .mockImplementation(async (userId) =>
        userId !== MULTI_ROLE_ACCOUNT.sub
          ? []
          : (MULTI_ROLE_ACCOUNT.roles.map((slug) => ({
              userRoleId: `${userId}-${slug}`,
              status: CommonStatus.ACTIVE,
              role: { slug },
              districtAdmin:
                slug === RoleSlug.DISTRICT_ADMIN ? { districtAdminId: userId } : undefined,
              educator: slug === RoleSlug.EDUCATOR ? { id: userId } : undefined,
            })) as unknown as UserRole[]),
      );
    jest.spyOn(app.get<StudentRepository>(STUDENT_REPOSITORY), 'findOne').mockResolvedValue({
      id: 'rc-student',
      student_id: 'RC0001',
      is_active: true,
      deleted_at: null,
      status: CommonStatus.ACTIVE,
    });

    const secret = app.get(ConfigService).get<string>('jwt.accessSecret') as string;
    sign = (payload) => jwt.sign(payload, secret, { algorithm: 'HS256', expiresIn: '1h' });
    routes = discoverRoutes(app);
  }, 120000);

  afterAll(async () => {
    jest.restoreAllMocks();
    await app?.close();
  });

  const staffToken = (type: UserTokenType): string =>
    sign({
      sub: MULTI_ROLE_ACCOUNT.sub,
      email: MULTI_ROLE_ACCOUNT.email,
      roles: MULTI_ROLE_ACCOUNT.roles,
      type,
      purpose: TokenPurposeType.ACCESS,
    });
  const roleSelectionToken = (): string =>
    sign({
      sub: MULTI_ROLE_ACCOUNT.sub,
      email: MULTI_ROLE_ACCOUNT.email,
      roles: MULTI_ROLE_ACCOUNT.roles,
      purpose: TokenPurposeType.LOGIN,
    });
  const studentToken = (): string =>
    sign({ sub: 'RC0001', student_id: 'RC0001', type: UserTokenType.STUDENT });

  /** Sends one request and returns what the guard decided for it (and which handler it routed to). */
  const guardOutcome = async (route: DiscoveredRoute, token?: string): Promise<GuardOutcome> => {
    outcome = { decision: null, handler: null };
    const verb = (route.method === 'ALL' ? 'GET' : route.method).toLowerCase() as
      'get' | 'post' | 'put' | 'patch' | 'delete';
    const req = request(app.getHttpServer())
      [verb](concretePath(route.path))
      .timeout(REQUEST_TIMEOUT_MS);
    if (token) req.set('Authorization', `Bearer ${token}`);
    // Allowed requests come back as HANDLER_SKIPPED_STATUS; the guard's verdict is what is asserted.
    await req.then(
      () => undefined,
      () => undefined,
    );
    return { ...outcome };
  };

  /** Runs `token` against `candidates` and lists every route whose guard verdict differs. */
  const sweep = async (
    candidates: DiscoveredRoute[],
    token: string | undefined,
    expected: (route: DiscoveredRoute) => GuardDecision,
  ): Promise<string[]> => {
    const failures: string[] = [];
    for (const route of candidates) {
      const { decision, handler } = await guardOutcome(route, token);
      if (handler !== route.handler) continue; // shadowed — reported by its own test
      if (decision !== expected(route)) {
        failures.push(`${route.key} → expected ${expected(route)}, guard said ${decision}`);
      }
    }
    return failures;
  };

  it('discovers every route, and exactly the allowlisted ones are @Public()', () => {
    expect(routes.length).toBeGreaterThan(200);
    const publicRoutes = routes.filter((route) => route.isPublic).map((route) => route.key);
    expect(publicRoutes.sort()).toEqual([...PUBLIC_ALLOWLIST].sort());
  });

  it('every route declares exactly one of @Public(), @AllowRoleSelectionToken(), @RequiredRoles()', () => {
    const offenders = routes
      .filter((route) => !UNDECORATABLE_CONTROLLERS.includes(route.controller))
      .map((route) => ({
        key: route.key,
        markers: [
          route.isPublic && '@Public',
          route.allowsRoleSelectionToken && '@AllowRoleSelectionToken',
          route.declaresRequiredRoles && '@RequiredRoles',
        ].filter(Boolean),
      }))
      .filter(({ markers }) => markers.length !== 1)
      .map(({ key, markers }) => `${key} → [${markers.join(', ') || 'none'}]`);
    expect(offenders).toEqual([]);
  });

  it(
    'routes each discovered path to its own handler (no route shadowed by another)',
    async () => {
      const shadowed: string[] = [];
      for (const route of routes) {
        const { handler } = await guardOutcome(route);
        if (handler !== route.handler) shadowed.push(route.key);
      }
      expect(shadowed).toEqual([]);
    },
    SWEEP_TIMEOUT_MS,
  );

  it(
    'without credentials: @Public() routes are let through, every other route is 401',
    async () => {
      const failures = await sweep(routes, undefined, (route) => (route.isPublic ? 'allow' : 401));
      expect(failures).toEqual([]);
    },
    SWEEP_TIMEOUT_MS,
  );

  it(
    'a role-selection token is accepted only on @AllowRoleSelectionToken() routes',
    async () => {
      const failures = await sweep(routes, roleSelectionToken(), (route) =>
        route.isPublic || route.allowsRoleSelectionToken ? 'allow' : 401,
      );
      expect(failures).toEqual([]);
    },
    SWEEP_TIMEOUT_MS,
  );

  it.each(STAFF_ROLE_TOKEN_TYPES)(
    'a multi-role account acting as %s is allowed/403 exactly per @RequiredRoles',
    async (role, type) => {
      const failures = await sweep(
        routes.filter((route) => !route.allowsRoleSelectionToken),
        staffToken(type),
        (route) => expectedDecision(route, role),
      );
      expect(failures).toEqual([]);
    },
    SWEEP_TIMEOUT_MS,
  );

  it(
    'a student is allowed/403 exactly per @RequiredRoles',
    async () => {
      const failures = await sweep(
        routes.filter((route) => !route.allowsRoleSelectionToken),
        studentToken(),
        (route) => expectedDecision(route, RoleSlug.STUDENT),
      );
      expect(failures).toEqual([]);
    },
    SWEEP_TIMEOUT_MS,
  );
});
