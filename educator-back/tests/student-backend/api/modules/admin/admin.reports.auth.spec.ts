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
import { AdminModule } from '../../../../../src/student-backend/modules/admin/admin.module';
import { AdminService } from '../../../../../src/student-backend/modules/admin/admin.service';
import { RedisModule } from '../../../../../src/redis/redis.module';
import {
  STUDENT_REPOSITORY,
  USER_REPOSITORY,
  USER_ROLE_REPOSITORY,
} from '../../../../../src/database/tokens';
import { JwtStrategy } from '../../../../../src/common/strategy/jwt.strategy';
import { TokenService } from '../../../../../src/common/services/token.service';
import { LoggerService } from '../../../../../src/common/services';
import { closeTestApp, createTestApp } from '../../common/setup/supertest.setup';
import { STATUS } from '../../common/constants/status-codes';
import { apiGet } from '../../common/utils/api.helper';

/**
 * Tests that verify GET /admin/reports/:id is protected by the root-app
 * global AuthGuard. Exercises the REAL guard (no override) to ensure authentication
 * is enforced.
 */
describe('Admin Reports API — Authentication', () => {
  const TEST_SECRET = 'unit-test-admin-reports-secret-do-not-use-in-prod';
  let app: INestApplication;

  const mockAdminService = {
    getReportById: jest.fn().mockResolvedValue({ id: 'report-1', data: 'test' }),
  };

  const mockStudentRepository = {
    findOne: jest.fn().mockResolvedValue({
      id: 'student-1',
      student_id: 'student-1',
      is_active: true,
    }),
  };

  // The root JwtStrategy injects STUDENT_REPOSITORY / USER_REPOSITORY /
  // USER_ROLE_REPOSITORY, normally supplied by the app-wide @Global()
  // DatabaseModule — not part of this test module's graph.
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
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: envConfig }),
        MockDatabaseModule,
        MockAuthModule,
        AdminModule,
        RedisModule,
      ],
      providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
    })
      .overrideProvider(AdminService)
      .useValue(mockAdminService)
      .compile();

    app = await createTestApp(moduleRef);
  });

  afterAll(async () => {
    await closeTestApp(app);
    delete process.env.JWT_SECRET;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /admin/reports/:id — authentication required', () => {
    it('returns 401 when no Authorization header is sent', async () => {
      const res = await apiGet(app, '/admin/reports/report-1');
      expect(res.status).toBe(STATUS.UNAUTHORIZED);
      expect(mockAdminService.getReportById).not.toHaveBeenCalled();
    });

    it('returns 401 when the Authorization header is malformed', async () => {
      const res = await apiGet(app, '/admin/reports/report-1', 'not-a-jwt');
      expect(res.status).toBe(STATUS.UNAUTHORIZED);
      expect(mockAdminService.getReportById).not.toHaveBeenCalled();
    });

    it('returns 401 when the JWT is signed with the wrong secret', async () => {
      const badToken = jwt.sign({ sub: 'student-1', type: 'student' }, 'wrong-secret', {
        algorithm: 'HS256',
      });
      const res = await apiGet(app, '/admin/reports/report-1', badToken);
      expect(res.status).toBe(STATUS.UNAUTHORIZED);
      expect(mockAdminService.getReportById).not.toHaveBeenCalled();
    });

    it('returns 401 when the JWT has expired', async () => {
      const expiredToken = signEducatorToken(
        { sub: 'student-1', type: 'student' },
        { expiresIn: -60 },
      );
      const res = await apiGet(app, '/admin/reports/report-1', expiredToken);
      expect(res.status).toBe(STATUS.UNAUTHORIZED);
      expect(mockAdminService.getReportById).not.toHaveBeenCalled();
    });

    it('returns 200 with valid student token', async () => {
      const validToken = signEducatorToken(
        { sub: 'student-1', type: 'student' },
        { expiresIn: '1h' },
      );
      const res = await apiGet(app, '/admin/reports/report-1', validToken);
      expect(res.status).toBe(STATUS.OK);
      expect(mockAdminService.getReportById).toHaveBeenCalledWith('report-1');
    });
  });
});
