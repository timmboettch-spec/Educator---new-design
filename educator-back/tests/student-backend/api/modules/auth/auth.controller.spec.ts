/// <reference types="jest" />
import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { AuthModule } from '../../../../../src/student-backend/modules/auth/auth.module';
import { AuthService } from '../../../../../src/student-backend/modules/auth/auth.service';
import { JsonDataService } from '../../../../../src/student-backend/data/json-data.service';
import { RedisService } from '../../../../../src/redis/redis.service';
import { JwtAuthGuard } from '../../../../../src/student-backend/guards/jwt-auth.guard';
import { createTestApp, closeTestApp } from '../../common/setup/supertest.setup';
import { apiPost } from '../../common/utils/api.helper';
import { studentToken } from '../../common/utils/auth-token.helper';
import { ENDPOINTS } from '../../common/constants/endpoints';
import { STATUS } from '../../common/constants/status-codes';
import authFixtures from '../../common/fixtures/auth.requests.json';

describe('Auth API (controller)', () => {
  let app: INestApplication;

  const mockAuthService = {
    login: jest.fn(),
    logout: jest.fn(),
  };

  const mockJsonDataService = {
    getUserByEmail: jest.fn(),
    getUserById: jest.fn(),
  };

  const mockRedisService = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AuthModule],
    })
      .overrideProvider(AuthService)
      .useValue(mockAuthService)
      .overrideProvider(JsonDataService)
      .useValue(mockJsonDataService)
      .overrideProvider(RedisService)
      .useValue(mockRedisService)
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const request = context.switchToHttp().getRequest() as {
            user?: { id: string };
          };

          request.user = { id: 'user-001' };
          return true;
        },
      })
      .compile();

    app = await createTestApp(moduleRef);
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── POST /auth/login ───────────────────────────────────────────────────────

  describe('POST /auth/login', () => {
    it('returns 201 and token on valid credentials', async () => {
      mockAuthService.login.mockResolvedValue({
        access_token: 'jwt-token-abc',
      });

      const res = await apiPost(app, ENDPOINTS.AUTH.LOGIN, authFixtures.login.valid);

      expect(res.status).toBe(STATUS.CREATED);
      expect(res.body).toHaveProperty('access_token');
      expect(mockAuthService.login).toHaveBeenCalledWith(authFixtures.login.valid);
    });

    it('propagates UnauthorizedException when service throws', async () => {
      mockAuthService.login.mockRejectedValue(
        new UnauthorizedException('Invalid email or password'),
      );

      const res = await apiPost(app, ENDPOINTS.AUTH.LOGIN, authFixtures.login.invalidPassword);

      expect(res.status).toBe(STATUS.UNAUTHORIZED);
    });

    it('returns 400 when email is missing', async () => {
      const res = await apiPost(app, ENDPOINTS.AUTH.LOGIN, authFixtures.login.missingEmail);

      expect(res.status).toBe(STATUS.BAD_REQUEST);
      expect(mockAuthService.login).not.toHaveBeenCalled();
    });

    it('returns 400 when password is missing', async () => {
      const res = await apiPost(app, ENDPOINTS.AUTH.LOGIN, authFixtures.login.missingPassword);

      expect(res.status).toBe(STATUS.BAD_REQUEST);
      expect(mockAuthService.login).not.toHaveBeenCalled();
    });
  });

  // ─── POST /auth/logout ───────────────────────────────────────────────────────

  describe('POST /auth/logout', () => {
    it('returns 201 with logout message and revokes the active token', async () => {
      const res = await apiPost(app, ENDPOINTS.AUTH.LOGOUT, {}, studentToken());

      expect(res.status).toBe(STATUS.CREATED);
      expect(res.body).toEqual({ message: 'Logout successful' });
      expect(mockAuthService.logout).toHaveBeenCalledWith('user-001');
    });
  });
});
