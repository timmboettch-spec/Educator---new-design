// `AppModule` validates the real environment when it is imported. Unit tests run without a real
// env, and the assertion below only inspects module metadata, so validation is a no-op here —
// stubbing the validator (rather than stubbing each required var) keeps this test from breaking
// every time a new env var becomes required.
jest.mock('../../../src/common/dtos/env.validation', () => ({
  ...jest.requireActual<object>('../../../src/common/dtos/env.validation'),
  validateEnv: (config: Record<string, unknown>): Record<string, unknown> => config,
}));

import { Controller, Get, Global, INestApplication, Module, UseGuards } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { Response } from 'express';
import { ClsService } from 'nestjs-cls';
import request from 'supertest';
import { AuthModule } from '../../../src/auth/auth.module';
import { AuthService } from '../../../src/auth/auth.service';
import { ClassTransferModule } from '../../../src/class-transfer/class-transfer.module';
import { ClassesModule } from '../../../src/class/classes.module';
import { EducatorsModule } from '../../../src/educators/educators.module';
import { SchoolsModule } from '../../../src/schools/schools.module';
import { StudentsModule } from '../../../src/students/students.module';
import { UsersModule } from '../../../src/users/users.module';
import { AuthGuard } from '../../../src/common/guards/auth.guard';
import { TokenService } from '../../../src/common/services/token.service';
import { RedisService } from '../../../src/redis/redis.service';
import { CommonStatus } from '../../../src/common/enums/status.enum';
import { RoleSlug, TokenPurposeType, UserTokenType } from '../../../src/common/constants';
import { ICurrentUser } from '../../../src/common/interfaces';
import {
  STUDENT_REPOSITORY,
  USER_REPOSITORY,
  USER_ROLE_REPOSITORY,
} from '../../../src/database/tokens';

const SECRET = 'wiring-test-secret-key-32-chars!!';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const configStub = { get: (key: string): unknown => (key.startsWith('redis.') ? undefined : SECRET) };
const loggerStub = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
// No Redis client configured, so RedisService runs in its in-memory fallback mode.
const redisService = new RedisService(null, configStub as never, loggerStub as never);
const tokenService = new TokenService(
  new JwtService({ secret: SECRET }),
  configStub as never,
  redisService,
);

/** Stands in for the global `DatabaseModule`/`ConfigModule`/`ClsModule` the strategy relies on. */
@Global()
@Module({
  providers: [
    { provide: ConfigService, useValue: configStub },
    { provide: TokenService, useValue: tokenService },
    { provide: ClsService, useValue: { isActive: () => false, set: jest.fn() } },
    {
      provide: USER_REPOSITORY,
      useValue: { findOne: jest.fn().mockResolvedValue({ id: USER_ID, email: 'e@test.com' }) },
    },
    {
      provide: USER_ROLE_REPOSITORY,
      useValue: {
        findByUserId: jest
          .fn()
          .mockResolvedValue([
            {
              status: CommonStatus.ACTIVE,
              role: { slug: RoleSlug.EDUCATOR },
              educator: { id: 'e1' },
            },
          ]),
      },
    },
    { provide: STUDENT_REPOSITORY, useValue: { findOne: jest.fn() } },
  ],
  exports: [ConfigService, TokenService, ClsService, USER_REPOSITORY, USER_ROLE_REPOSITORY, STUDENT_REPOSITORY],
})
class GlobalDepsStubModule { }

@Controller('protected')
@UseGuards(AuthGuard)
class ProtectedProbeController {
  @Get()
  get(): string {
    return 'ok';
  }
}

/**
 * RWAI-3087 ticket 01 — the blacklist lives in the shared `TokenService`/Redis store, so a token
 * blacklisted by the real logout path is what `AuthGuard` (via `AuthService.validateUserToken`)
 * consults.
 */
describe('AuthGuard wiring', () => {
  let app: INestApplication;
  let authService: AuthService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [GlobalDepsStubModule],
      controllers: [ProtectedProbeController],
      // AuthGuard resolves identity through AuthService, which shares the TokenService with
      // logout — every other dependency is irrelevant to logout and auto-mocked.
      providers: [AuthService, AuthGuard],
    })
      .useMocker(() => ({}))
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
    authService = moduleRef.get(AuthService);
  });

  afterAll(async () => {
    await app.close();
  });

  const signAccessToken = (): string =>
    new JwtService({ secret: SECRET }).sign({
      sub: USER_ID,
      email: 'e@test.com',
      purpose: TokenPurposeType.ACCESS,
      type: UserTokenType.EDUCATOR,
      jti: `${Date.now()}-${Math.random()}`,
    });

  it('rejects a token on a protected route after logout through AuthService', async () => {
    const token = signAccessToken();
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    await request(server).get('/protected').set('Authorization', `Bearer ${token}`).expect(200);

    await authService.logout({ userId: USER_ID } as ICurrentUser, token, {
      clearCookie: jest.fn(),
    } as unknown as Response);

    await request(server).get('/protected').set('Authorization', `Bearer ${token}`).expect(401);
  });

  it('keeps accepting a different, non-blacklisted token', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    await request(server)
      .get('/protected')
      .set('Authorization', `Bearer ${signAccessToken()}`)
      .expect(200);
  });

  describe('provided exactly once', () => {
    const providersOf = (moduleClass: object): unknown[] =>
      (Reflect.getMetadata(MODULE_METADATA.PROVIDERS, moduleClass) as unknown[] | undefined) ?? [];
    const isAuthGuardGlobal = (provider: unknown): boolean =>
      typeof provider === 'object' &&
      provider !== null &&
      (provider as { provide?: unknown }).provide === APP_GUARD &&
      (provider as { useClass?: unknown }).useClass === AuthGuard;

    it.each([
      AuthModule,
      UsersModule,
      SchoolsModule,
      EducatorsModule,
      ClassesModule,
      ClassTransferModule,
      StudentsModule,
    ])('%p does not register AuthGuard as a global guard itself', (moduleClass) => {
      expect(providersOf(moduleClass).some(isAuthGuardGlobal)).toBe(false);
    });

    it('AppModule registers AuthGuard as the global guard', () => {
      // `AppModule` runs `ConfigModule.forRoot({ validate: validateEnv })` at import time, so it is
      // loaded lazily here, with env validation stubbed out above — this assertion is about module
      // metadata only and must not depend on which env vars the app happens to require.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { AppModule } = require('../../../src/app.module') as { AppModule: object };

      expect(providersOf(AppModule).filter(isAuthGuardGlobal)).toHaveLength(1);
    });
  });
});
