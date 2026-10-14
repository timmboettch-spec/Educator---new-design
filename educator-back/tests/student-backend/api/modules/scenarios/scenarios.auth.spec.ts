/// <reference types="jest" />
import type { INestApplication } from '@nestjs/common';
import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import * as jwt from 'jsonwebtoken';
import { ConfigModule } from '@nestjs/config';
import { envConfig } from '../../../../../src/common/config';

import { PassportModule } from '@nestjs/passport';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from '../../../../../src/common/guards/auth.guard';
import { ClsModule } from 'nestjs-cls';
import { RedisModule } from '../../../../../src/redis/redis.module';
import {
  STUDENT_REPOSITORY,
  USER_REPOSITORY,
  USER_ROLE_REPOSITORY,
} from '../../../../../src/database/tokens';
import { JwtStrategy } from '../../../../../src/common/strategy/jwt.strategy';
import { TokenService } from '../../../../../src/common/services/token.service';
import { LoggerService } from '../../../../../src/common/services';
import { ScenariosController } from '../../../../../src/student-backend/modules/scenarios/scenarios.controller';
import { ScenariosService } from '../../../../../src/student-backend/modules/scenarios/scenarios.service';
import { closeTestApp, createTestApp } from '../../common/setup/supertest.setup';
import { STATUS } from '../../common/constants/status-codes';
import { apiGet } from '../../common/utils/api.helper';

/**
 * Positive- and negative-path tests that exercise the REAL root-app
 * global {@link AuthGuard}
 * (no override) to prove that Scenario endpoints are actually protected.
 *
 * Uses a dedicated `JWT_SECRET` seeded via `process.env` before the test module
 * is compiled so the root `jwt` strategy instantiates with a known, controllable
 * secret.
 *
 * Note: these endpoints are no longer restricted to student-typed tokens. The
 * student-only `educator-jwt` strategy was removed in favour of the shared root
 * `JwtStrategy`, so any authenticated principal may reach them — see the
 * non-student-token case below.
 */
describe('Scenarios API — real global AuthGuard enforcement', () => {
  const TEST_SECRET = 'unit-test-scenario-token-secret-do-not-use-in-prod';
  let app: INestApplication;

  const mockScenariosService = {
    findAll: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue({ id: 's-1', title: 'x', unitId: 'u-1' }),
    findByUnit: jest.fn().mockResolvedValue([]),
    getDefaultScenario: jest.fn().mockResolvedValue(undefined),
    createScenario: jest.fn(),
    updateScenario: jest.fn(),
  };

  const mockStudentRepository = {
    findOne: jest.fn().mockResolvedValue({
      id: 'stu-1',
      student_id: '11683005',
      is_active: true,
    }),
  };

  // The root JwtStrategy injects STUDENT_REPOSITORY / USER_REPOSITORY /
  // USER_ROLE_REPOSITORY, normally supplied by the app-wide @Global()
  // DatabaseModule — not part of this test module's graph. The two user repos
  // are only touched by the non-student branch; returning null there is what
  // makes a non-student token 401 in this isolated graph.
  @Global()
  @Module({
    providers: [
      { provide: STUDENT_REPOSITORY, useValue: mockStudentRepository },
      { provide: USER_REPOSITORY, useValue: { findOne: jest.fn().mockResolvedValue(null) } },
      {
        provide: USER_ROLE_REPOSITORY,
        useValue: { findByUserId: jest.fn().mockResolvedValue([]) },
      },
    ],
    exports: [STUDENT_REPOSITORY, USER_REPOSITORY, USER_ROLE_REPOSITORY],
  })
  class MockDatabaseModule {}

  // Stands in for EducatorAuthModule: registers the root `jwt` Passport strategy
  // plus the LoggerService that AuthGuard itself injects.
  @Global()
  @Module({
    imports: [PassportModule, ClsModule.forRoot({ global: true })],
    providers: [
      JwtStrategy,
      { provide: TokenService, useValue: { isBlackListed: jest.fn().mockResolvedValue(false) } },
      { provide: LoggerService, useValue: { log: jest.fn(), warn: jest.fn(), error: jest.fn() } },
    ],
    exports: [PassportModule, LoggerService, TokenService],
  })
  class MockAuthModule {}

  function signEducatorToken(payload: Record<string, unknown>, opts: jwt.SignOptions = {}): string {
    return jwt.sign(payload, TEST_SECRET, { algorithm: 'HS256', ...opts });
  }

  beforeAll(async () => {
    process.env.JWT_SECRET = TEST_SECRET;

    const moduleRef: TestingModule = await Test.createTestingModule({
      // ScenariosController alone doesn't register any strategies; import
      // MockAuthModule (registers the root 'jwt' strategy) so AuthGuard has
      // a strategy to delegate to.
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: envConfig }),
        MockDatabaseModule,
        MockAuthModule,
        RedisModule,
      ],
      controllers: [ScenariosController],
      providers: [
        { provide: ScenariosService, useValue: mockScenariosService },
        { provide: APP_GUARD, useClass: AuthGuard },
      ],
    }).compile();

    app = await createTestApp(moduleRef);
  });

  afterAll(async () => {
    await closeTestApp(app);
    delete process.env.JWT_SECRET;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockScenariosService.findAll.mockResolvedValue([]);
    mockScenariosService.findOne.mockResolvedValue({ id: 's-1', title: 'x', unitId: 'u-1' });
  });

  describe('unauthenticated / malformed / expired tokens', () => {
    it('returns 401 when no Authorization header is sent', async () => {
      const res = await apiGet(app, '/scenarios');
      expect(res.status).toBe(STATUS.UNAUTHORIZED);
      expect(mockScenariosService.findAll).not.toHaveBeenCalled();
    });

    it('returns 401 when the Authorization header is malformed', async () => {
      const res = await apiGet(app, '/scenarios', 'not-a-jwt');
      expect(res.status).toBe(STATUS.UNAUTHORIZED);
      expect(mockScenariosService.findAll).not.toHaveBeenCalled();
    });

    it('returns 401 when the JWT is signed with the wrong secret', async () => {
      const badToken = jwt.sign(
        { sub: '11683005', type: 'student' },
        'a-completely-different-secret',
        { algorithm: 'HS256' },
      );
      const res = await apiGet(app, '/scenarios', badToken);
      expect(res.status).toBe(STATUS.UNAUTHORIZED);
      expect(mockScenariosService.findAll).not.toHaveBeenCalled();
    });

    it('returns 401 when the JWT has expired', async () => {
      const expiredToken = signEducatorToken(
        { sub: '11683005', type: 'student' },
        { expiresIn: -60 },
      );
      const res = await apiGet(app, '/scenarios', expiredToken);
      expect(res.status).toBe(STATUS.UNAUTHORIZED);
      expect(mockScenariosService.findAll).not.toHaveBeenCalled();
    });

    // A non-student `type` is no longer rejected on its own — the root
    // JwtStrategy instead resolves the token's account. It 401s here because
    // the mock USER_REPOSITORY has no matching row.
    it('returns 401 when a non-student token has no matching account', async () => {
      const wrongTypeToken = signEducatorToken({
        sub: 'admin-1',
        type: 'admin',
        purpose: 'access',
      });
      const res = await apiGet(app, '/scenarios', wrongTypeToken);
      expect(res.status).toBe(STATUS.UNAUTHORIZED);
      expect(mockScenariosService.findAll).not.toHaveBeenCalled();
    });

    // With no `sub`/`student_id` the strategy builds no where-conditions and
    // never reaches the repository, so no findOne stub is needed here.
    it('returns 401 when the sub claim is missing', async () => {
      const noSubToken = signEducatorToken({ type: 'student' });
      const res = await apiGet(app, '/scenarios', noSubToken);
      expect(res.status).toBe(STATUS.UNAUTHORIZED);
      expect(mockScenariosService.findAll).not.toHaveBeenCalled();
    });
  });

  describe('valid educator-issued student token', () => {
    it('allows GET /scenarios', async () => {
      const token = signEducatorToken(
        { sub: '11683005', studentId: 'stu-1', classId: 'cls-1', type: 'student' },
        { expiresIn: '1h' },
      );
      const res = await apiGet(app, '/scenarios', token);
      expect(res.status).toBe(STATUS.OK);
      expect(mockScenariosService.findAll).toHaveBeenCalledTimes(1);
    });

    it('allows GET /scenarios/:id', async () => {
      const token = signEducatorToken({ sub: '11683005', type: 'student' }, { expiresIn: '1h' });
      const res = await apiGet(app, '/scenarios/s-1', token);
      expect(res.status).toBe(STATUS.OK);
      expect(mockScenariosService.findOne).toHaveBeenCalled();
    });
  });
});
