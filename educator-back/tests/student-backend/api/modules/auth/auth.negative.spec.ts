/// <reference types="jest" />
import { ConflictException, HttpException, UnauthorizedException, UnprocessableEntityException } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
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

describe('Auth API — Negative Tests', () => {
  let app: INestApplication;

  const mockAuthService = {
    login: jest.fn(),
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
      .useValue({ canActivate: () => true })
      .compile();

    app = await createTestApp(moduleRef);
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── 400 – Bad Request ────────────────────────────────────────────────────────

  describe('400 – Bad Request', () => {
    it('POST /auth/login returns 400 when body is completely empty', async () => {
      const res = await apiPost(app, ENDPOINTS.AUTH.LOGIN, {});
      expect(res.status).toBe(STATUS.BAD_REQUEST);
    });

    it('POST /auth/login returns 400 when email is missing', async () => {
      const res = await apiPost(app, ENDPOINTS.AUTH.LOGIN, {
        password: 'secret123',
      });
      expect(res.status).toBe(STATUS.BAD_REQUEST);
    });

    it('POST /auth/login returns 400 when password is missing', async () => {
      const res = await apiPost(app, ENDPOINTS.AUTH.LOGIN, {
        email: 'user@example.com',
      });
      expect(res.status).toBe(STATUS.BAD_REQUEST);
    });
  });

  // ─── 401 – Unauthorized ───────────────────────────────────────────────────────

  describe('401 – Unauthorized', () => {
    it('POST /auth/login returns 401 when credentials are invalid', async () => {
      mockAuthService.login.mockRejectedValue(
        new UnauthorizedException('Invalid email or password'),
      );

      const res = await apiPost(app, ENDPOINTS.AUTH.LOGIN, {
        email: 'user@example.com',
        password: 'wrongpassword',
      });

      expect(res.status).toBe(STATUS.UNAUTHORIZED);
    });

    it('POST /auth/login returns 401 when user does not exist', async () => {
      mockAuthService.login.mockRejectedValue(new UnauthorizedException('User not found'));

      const res = await apiPost(app, ENDPOINTS.AUTH.LOGIN, {
        email: 'ghost@example.com',
        password: 'pass123',
      });

      expect(res.status).toBe(STATUS.UNAUTHORIZED);
    });
  });

  // ─── 404 – Not Found ──────────────────────────────────────────────────────────

  describe('404 – Not Found', () => {
    it('GET /auth/unknown returns 404 for non-existent auth endpoint', async () => {
      const res = await request(app.getHttpServer()).get('/auth/unknown-route');
      expect(res.status).toBe(STATUS.NOT_FOUND);
    });
  });

  // ─── 405 – Method Not Allowed ─────────────────────────────────────────────────

  describe('405 – Method Not Allowed', () => {
    it('GET /auth/login returns 404 or 405 when wrong HTTP method is used', async () => {
      const res = await request(app.getHttpServer()).get(ENDPOINTS.AUTH.LOGIN);
      expect([STATUS.METHOD_NOT_ALLOWED, STATUS.NOT_FOUND]).toContain(res.status);
    });
  });

  // ─── 408 – Request Timeout ────────────────────────────────────────────────────

  describe('408 – Request Timeout', () => {
    it('POST /auth/login returns 408 when auth service times out', async () => {
      mockAuthService.login.mockRejectedValue(
        new HttpException('Request Timeout', STATUS.REQUEST_TIMEOUT),
      );

      const res = await apiPost(app, ENDPOINTS.AUTH.LOGIN, {
        email: 'user@example.com',
        password: 'pass123',
      });

      expect(res.status).toBe(STATUS.REQUEST_TIMEOUT);
    });
  });

  // ─── 409 – Conflict ───────────────────────────────────────────────────────────

  describe('409 – Conflict', () => {
    it('POST /auth/login returns 409 when an active session already exists', async () => {
      mockAuthService.login.mockRejectedValue(
        new ConflictException('Active session already exists for this user'),
      );

      const res = await apiPost(app, ENDPOINTS.AUTH.LOGIN, {
        email: 'user@example.com',
        password: 'pass123',
      });

      expect(res.status).toBe(STATUS.CONFLICT);
    });
  });

  // ─── 415 – Unsupported Media Type ─────────────────────────────────────────────

  describe('415 – Unsupported Media Type', () => {
    it('POST /auth/login returns 415 or 400 when Content-Type is not application/json', async () => {
      const res = await request(app.getHttpServer())
        .post(ENDPOINTS.AUTH.LOGIN)
        .set('Content-Type', 'text/plain')
        .send('email=user@example.com&password=pass123');

      expect([STATUS.UNSUPPORTED_MEDIA_TYPE, STATUS.BAD_REQUEST]).toContain(res.status);
    });

    it('POST /auth/login returns 415 when service rejects the media type', async () => {
      mockAuthService.login.mockRejectedValue(
        new HttpException('Unsupported Media Type', STATUS.UNSUPPORTED_MEDIA_TYPE),
      );

      const res = await apiPost(app, ENDPOINTS.AUTH.LOGIN, {
        email: 'user@example.com',
        password: 'pass123',
      });

      expect(res.status).toBe(STATUS.UNSUPPORTED_MEDIA_TYPE);
    });
  });

  // ─── 422 – Unprocessable Entity ───────────────────────────────────────────────

  describe('422 – Unprocessable Entity', () => {
    it('POST /auth/login returns 422 when email format fails business validation', async () => {
      mockAuthService.login.mockRejectedValue(
        new UnprocessableEntityException('Email domain is not allowed'),
      );

      const res = await apiPost(app, ENDPOINTS.AUTH.LOGIN, {
        email: 'user@blocked-domain.com',
        password: 'pass123',
      });

      expect(res.status).toBe(STATUS.UNPROCESSABLE_ENTITY);
    });
  });

  // ─── 429 – Too Many Requests ──────────────────────────────────────────────────

  describe('429 – Too Many Requests', () => {
    it('POST /auth/login returns 429 when rate limit is exceeded', async () => {
      mockAuthService.login.mockRejectedValue(
        new HttpException('Too Many Requests', STATUS.TOO_MANY_REQUESTS),
      );

      const res = await apiPost(app, ENDPOINTS.AUTH.LOGIN, {
        email: 'user@example.com',
        password: 'pass123',
      });

      expect(res.status).toBe(STATUS.TOO_MANY_REQUESTS);
    });
  });

  // ─── 500 – Internal Server Error ─────────────────────────────────────────────

  describe('500 – Internal Server Error', () => {
    it('POST /auth/login returns 500 when an unexpected error occurs', async () => {
      mockAuthService.login.mockRejectedValue(new Error('Unexpected database failure'));

      const res = await apiPost(app, ENDPOINTS.AUTH.LOGIN, {
        email: 'user@example.com',
        password: 'pass123',
      });

      expect(res.status).toBe(STATUS.INTERNAL_SERVER_ERROR);
    });
  });

  // ─── 502 – Bad Gateway ───────────────────────────────────────────────────────

  describe('502 – Bad Gateway', () => {
    it('POST /auth/login returns 502 when upstream identity provider fails', async () => {
      mockAuthService.login.mockRejectedValue(new HttpException('Bad Gateway', STATUS.BAD_GATEWAY));

      const res = await apiPost(app, ENDPOINTS.AUTH.LOGIN, {
        email: 'user@example.com',
        password: 'pass123',
      });

      expect(res.status).toBe(STATUS.BAD_GATEWAY);
    });
  });

  // ─── 503 – Service Unavailable ───────────────────────────────────────────────

  describe('503 – Service Unavailable', () => {
    it('POST /auth/login returns 503 when auth service is temporarily down', async () => {
      mockAuthService.login.mockRejectedValue(
        new HttpException('Service Unavailable', STATUS.SERVICE_UNAVAILABLE),
      );

      const res = await apiPost(app, ENDPOINTS.AUTH.LOGIN, {
        email: 'user@example.com',
        password: 'pass123',
      });

      expect(res.status).toBe(STATUS.SERVICE_UNAVAILABLE);
    });
  });

  // ─── 504 – Gateway Timeout ────────────────────────────────────────────────────

  describe('504 – Gateway Timeout', () => {
    it('POST /auth/login returns 504 when upstream service does not respond', async () => {
      mockAuthService.login.mockRejectedValue(
        new HttpException('Gateway Timeout', STATUS.GATEWAY_TIMEOUT),
      );

      const res = await apiPost(app, ENDPOINTS.AUTH.LOGIN, {
        email: 'user@example.com',
        password: 'pass123',
      });

      expect(res.status).toBe(STATUS.GATEWAY_TIMEOUT);
    });
  });
});
