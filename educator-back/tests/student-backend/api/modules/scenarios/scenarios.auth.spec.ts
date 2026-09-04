/// <reference types="jest" />
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import * as jwt from 'jsonwebtoken';

import { EducatorAuthModule } from '../../../../../src/student-backend/guards/educator-auth.module';
import { AuthModule } from '../../../../../src/student-backend/modules/auth/auth.module';
import { JsonDataService, JsonDataModule } from '../../../../../src/student-backend/data/json-data.service';
import { RedisModule } from '../../../../../src/redis/redis.module';
import { ScenariosController } from '../../../../../src/student-backend/modules/scenarios/scenarios.controller';
import { ScenariosService } from '../../../../../src/student-backend/modules/scenarios/scenarios.service';
import { ScenarioAssignmentGuard } from '../../../../../src/student-backend/modules/scenarios/guards/scenario-assignment.guard';
import { closeTestApp, createTestApp } from '../../common/setup/supertest.setup';
import { STATUS } from '../../common/constants/status-codes';
import { apiGet } from '../../common/utils/api.helper';

/**
 * Positive- and negative-path tests that exercise the REAL {@link import('../../../../src/guards/scenario-auth.guard').ScenarioAuthGuard}
 * (no override) to prove that Scenario endpoints are actually protected.
 *
 * Uses a dedicated `JWT_SECRET` seeded via `process.env` before the test
 * module is compiled so the `jwt` / `educator-jwt` strategies (both of
 * which read `JWT_SECRET`) instantiate with a known, controllable secret.
 */
describe('Scenarios API — real ScenarioAuthGuard enforcement', () => {
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

  function signEducatorToken(payload: Record<string, unknown>, opts: jwt.SignOptions = {}): string {
    return jwt.sign(payload, TEST_SECRET, { algorithm: 'HS256', ...opts });
  }

  beforeAll(async () => {
    process.env.JWT_SECRET = TEST_SECRET;

    const moduleRef: TestingModule = await Test.createTestingModule({
      // ScenariosController alone doesn't register any strategies; import both
      // AuthModule (registers 'jwt') and EducatorAuthModule (registers
      // 'educator-jwt') so the composite guard's strategies exist.
      imports: [AuthModule, EducatorAuthModule, JsonDataModule, RedisModule],
      controllers: [ScenariosController],
      providers: [{ provide: ScenariosService, useValue: mockScenariosService }],
    })
      .overrideProvider(JsonDataService)
      .useValue({})
      // This suite exercises the real ScenarioAuthGuard (JWT validation).
      // ScenarioAssignmentGuard has its own dedicated test file — bypass it
      // here so route-level assignment checks (which would call the
      // Educator API) do not muddy the auth-focused assertions.
      .overrideGuard(ScenarioAssignmentGuard)
      .useValue({ canActivate: () => true })
      .compile();

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

    it('returns 401 when the token type claim is not "student"', async () => {
      const wrongTypeToken = signEducatorToken({ sub: 'admin-1', type: 'admin' });
      const res = await apiGet(app, '/scenarios', wrongTypeToken);
      expect(res.status).toBe(STATUS.UNAUTHORIZED);
      expect(mockScenariosService.findAll).not.toHaveBeenCalled();
    });

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
