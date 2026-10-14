import { Controller, Get, INestApplication, Post } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerStorage } from '@nestjs/throttler';
import { Test, TestingModule } from '@nestjs/testing';
import { I18nService } from 'nestjs-i18n';
import request from 'supertest';
import { HttpExceptionFilter } from '../../../src/common/filters/http-exception.filter';
import { RATE_LIMIT } from '../../../src/common/constants/throttle.constants';
import {
  AuthThrottlerGuard,
  RATE_LIMIT_THROTTLER_NAME,
} from '../../../src/common/guards/auth-throttler.guard';
import { REDIS_CLIENT } from '../../../src/redis/redis.constants';
import { RedisFallbackThrottlerStorage } from '../../../src/common/guards/redis-fallback-throttler.storage';
import { RedisService } from '../../../src/redis/redis.service';
import { TokenService } from '../../../src/common/services/token.service';
import { LoggerService } from '../../../src/common/services';

const TEST_JWT_SECRET = 'rate-limit-integration-test-secret';

const testLogger = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
} as unknown as LoggerService;

@Controller('probe')
class ProbeController {
  @Get('ping')
  ping(): { ok: true } {
    return { ok: true };
  }
}

@Controller('students')
class StudentProbeController {
  @Get('login')
  login(): { ok: true } {
    return { ok: true };
  }

  @Get('lookup/:studentCode')
  lookup(): { ok: true } {
    return { ok: true };
  }

  @Post(':studentId/start-assessment')
  startAssessment(): { ok: true } {
    return { ok: true };
  }
}

interface ThrottledMeta {
  retryAfter?: number;
  timestamp?: string;
}

interface ThrottledBody {
  message?: string;
  data?: unknown;
  meta?: ThrottledMeta;
  error?: unknown;
}

// The suite stubs `I18nService.t` to echo the key back, so the filter's envelope carries the
// raw i18n key rather than the translated `error.json` string.
const TOO_MANY_REQUESTS_MESSAGE = 'error.COMMON.TOO_MANY_REQUESTS';

const body = (res: request.Response): ThrottledBody => {
  const b = res.body as ThrottledBody;
  return typeof b === 'object' && b !== null ? b : {};
};

const meta = (res: request.Response): ThrottledMeta => body(res).meta ?? {};

interface Harness {
  app: INestApplication;
  module: TestingModule;
  signer: JwtService;
}

async function buildApp(): Promise<Harness> {
  const module = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        load: [
          (): { JWT_SECRET: string; jwt: { accessSecret: string; accessExpiresIn: number } } => ({
            JWT_SECRET: TEST_JWT_SECRET,
            jwt: { accessSecret: TEST_JWT_SECRET, accessExpiresIn: 3600 },
          }),
        ],
      }),
      JwtModule.registerAsync({
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService): { secret: string | undefined } => ({
          secret: config.get<string>('JWT_SECRET'),
        }),
      }),
      ThrottlerModule.forRoot({
        throttlers: [
          {
            name: RATE_LIMIT_THROTTLER_NAME,
            ttl: RATE_LIMIT.AUTHENTICATED.TTL * 1000,
            limit: RATE_LIMIT.AUTHENTICATED.LIMIT,
          },
        ],
      }),
    ],
    controllers: [ProbeController, StudentProbeController],
    providers: [
      {
        provide: RedisService,
        useValue: {
          get: jest.fn().mockResolvedValue(null),
          set: jest.fn().mockResolvedValue(undefined),
          del: jest.fn().mockResolvedValue(undefined),
        },
      },
      { provide: REDIS_CLIENT, useValue: null },
      TokenService,
      { provide: LoggerService, useValue: testLogger },
      { provide: I18nService, useValue: { t: jest.fn((key: string) => key) } },
      RedisFallbackThrottlerStorage,
      {
        provide: ThrottlerStorage,
        useExisting: RedisFallbackThrottlerStorage,
      },
      {
        provide: APP_GUARD,
        useClass: AuthThrottlerGuard,
      },
      // Mirrors the root AppModule: the single global exception filter.
      {
        provide: APP_FILTER,
        useClass: HttpExceptionFilter,
      },
    ],
  }).compile();

  const app = module.createNestApplication();
  app.getHttpAdapter().getInstance().set('trust proxy', true);
  app.setGlobalPrefix('api');
  app.useLogger(false);
  await app.init();

  const signer = new JwtService({ secret: TEST_JWT_SECRET });
  return { app, module, signer };
}

const srv = (app: INestApplication): Parameters<typeof request>[0] =>
  app.getHttpServer() as Parameters<typeof request>[0];

const validToken = (signer: JwtService, sub = 'user-1'): string =>
  signer.sign(
    { sub, user_id: sub, email: `${sub}@example.com`, type: 'educator' },
    { expiresIn: '1h' },
  );

describe('RateLimit (Integration) — RWED-922', () => {
  const PUBLIC = RATE_LIMIT.PUBLIC.LIMIT;
  const AUTH = RATE_LIMIT.AUTHENTICATED.LIMIT;

  describe('student login isolation', () => {
    let h: Harness;

    beforeAll(async () => {
      h = await buildApp();
    });

    afterAll(async () => {
      await h?.app.close();
      await h?.module.close();
    });

    it('different student codes should not share rate limit bucket', async () => {
      const ip = '10.0.5.1';

      for (let i = 0; i < PUBLIC; i++) {
        const r = await request(srv(h.app))
          .get('/api/students/login')
          .query({ student_id: 'STUDENT_1' })
          .set('x-forwarded-for', ip);

        expect(r.status).toBe(200);
      }

      const blocked = await request(srv(h.app))
        .get('/api/students/login')
        .query({ student_id: 'STUDENT_1' })
        .set('x-forwarded-for', ip);

      expect(blocked.status).toBe(429);

      const otherStudent = await request(srv(h.app))
        .get('/api/students/login')
        .query({ student_id: 'STUDENT_2' })
        .set('x-forwarded-for', ip);

      expect(otherStudent.status).toBe(200);
    });
  });

  describe('public student route isolation', () => {
    let h: Harness;

    beforeAll(async () => {
      h = await buildApp();
    });

    afterAll(async () => {
      await h?.app.close();
      await h?.module.close();
    });

    it.each([
      {
        name: 'lookup by code',
        send: (studentIdentifier: string): request.Test =>
          request(srv(h.app)).get(`/api/students/lookup/${studentIdentifier}`),
        firstStudent: 'STUDENT_1',
        secondStudent: 'STUDENT_2',
        successStatus: 200,
      },
      {
        name: 'start assessment',
        send: (studentIdentifier: string): request.Test =>
          request(srv(h.app)).post(`/api/students/${studentIdentifier}/start-assessment`),
        firstStudent: '550e8400-e29b-41d4-a716-446655440001',
        secondStudent: '550e8400-e29b-41d4-a716-446655440002',
        successStatus: 201,
      },
    ])(
      '$name does not throttle another student sharing an IP',
      async ({ send, firstStudent, secondStudent, successStatus }) => {
        const ip = '10.0.5.2';

        for (let i = 0; i < PUBLIC; i++) {
          const response = await send(firstStudent).set('x-forwarded-for', ip);
          expect(response.status).toBe(successStatus);
        }

        const blocked = await send(firstStudent).set('x-forwarded-for', ip);
        expect(blocked.status).toBe(429);

        const otherStudent = await send(secondStudent).set('x-forwarded-for', ip);
        expect(otherStudent.status).toBe(successStatus);
      },
    );
  });

  describe(`public caller — ${RATE_LIMIT.PUBLIC.LIMIT} req/s`, () => {
    let h: Harness;
    beforeAll(async () => {
      h = await buildApp();
    });
    afterAll(async () => {
      await h?.app.close();
      await h?.module.close();
    });

    it(`allows ${PUBLIC} requests then returns 429 with standardized body`, async () => {
      const ip = '10.0.1.1';
      for (let i = 0; i < PUBLIC; i++) {
        const r = await request(srv(h.app)).get('/api/probe/ping').set('x-forwarded-for', ip);
        expect(r.status).toBe(200);
      }
      const throttled = await request(srv(h.app)).get('/api/probe/ping').set('x-forwarded-for', ip);
      expect(throttled.status).toBe(429);
      expect(body(throttled).message).toBe(TOO_MANY_REQUESTS_MESSAGE);
      expect(body(throttled).data).toBeNull();
      expect(body(throttled).error).toBeNull();
      const m = meta(throttled);
      expect(typeof m.retryAfter).toBe('number');
      expect(m.retryAfter).toBeGreaterThanOrEqual(1);
      expect(throttled.headers['retry-after']).toBeDefined();
      expect(Number(throttled.headers['retry-after'])).toBe(m.retryAfter);
      expect(typeof m.timestamp).toBe('string');
      expect(new Date(m.timestamp!).toString()).not.toBe('Invalid Date');
    });
  });

  describe(`authenticated caller — ${RATE_LIMIT.AUTHENTICATED.LIMIT} req/s`, () => {
    let h: Harness;
    beforeAll(async () => {
      h = await buildApp();
    });
    afterAll(async () => {
      await h?.app.close();
      await h?.module.close();
    });

    it(`allows ${AUTH} requests then returns 429`, async () => {
      const ip = '10.0.2.1';
      const token = validToken(h.signer, 'auth-user-1');
      for (let i = 0; i < AUTH; i++) {
        const r = await request(srv(h.app))
          .get('/api/probe/ping')
          .set('x-forwarded-for', ip)
          .set('authorization', `Bearer ${token}`);
        expect(r.status).toBe(200);
      }
      const throttled = await request(srv(h.app))
        .get('/api/probe/ping')
        .set('x-forwarded-for', ip)
        .set('authorization', `Bearer ${token}`);
      expect(throttled.status).toBe(429);
      expect(body(throttled).message).toBe(TOO_MANY_REQUESTS_MESSAGE);
    });
  });

  describe('invalid/expired/malformed JWTs must NOT grant authenticated limits', () => {
    let h: Harness;
    beforeAll(async () => {
      h = await buildApp();
    });
    afterAll(async () => {
      await h?.app.close();
      await h?.module.close();
    });

    it('wrong-signature token → public bucket', async () => {
      const ip = '10.0.3.1';
      const forged = new JwtService({ secret: 'wrong-secret' }).sign({ sub: 'x', user_id: 'x' });
      for (let i = 0; i < PUBLIC; i++) {
        const r = await request(srv(h.app))
          .get('/api/probe/ping')
          .set('x-forwarded-for', ip)
          .set('authorization', `Bearer ${forged}`);
        expect(r.status).toBe(200);
      }
      const throttled = await request(srv(h.app))
        .get('/api/probe/ping')
        .set('x-forwarded-for', ip)
        .set('authorization', `Bearer ${forged}`);
      expect(throttled.status).toBe(429);
    });

    it('expired token → public bucket', async () => {
      const ip = '10.0.3.2';
      const expired = h.signer.sign({ sub: 'exp', user_id: 'exp' }, { expiresIn: -60 });
      for (let i = 0; i < PUBLIC; i++) {
        const r = await request(srv(h.app))
          .get('/api/probe/ping')
          .set('x-forwarded-for', ip)
          .set('authorization', `Bearer ${expired}`);
        expect(r.status).toBe(200);
      }
      const throttled = await request(srv(h.app))
        .get('/api/probe/ping')
        .set('x-forwarded-for', ip)
        .set('authorization', `Bearer ${expired}`);
      expect(throttled.status).toBe(429);
    });

    it('malformed/garbage Bearer value → public bucket', async () => {
      const ip = '10.0.3.3';
      for (let i = 0; i < PUBLIC; i++) {
        const r = await request(srv(h.app))
          .get('/api/probe/ping')
          .set('x-forwarded-for', ip)
          .set('authorization', 'Bearer not.a.jwt');
        expect(r.status).toBe(200);
      }
      const throttled = await request(srv(h.app))
        .get('/api/probe/ping')
        .set('x-forwarded-for', ip)
        .set('authorization', 'Bearer not.a.jwt');
      expect(throttled.status).toBe(429);
    });

    it('empty Authorization header → public bucket', async () => {
      const ip = '10.0.3.4';
      for (let i = 0; i < PUBLIC; i++) {
        const r = await request(srv(h.app))
          .get('/api/probe/ping')
          .set('x-forwarded-for', ip)
          .set('authorization', '');
        expect(r.status).toBe(200);
      }
      const throttled = await request(srv(h.app))
        .get('/api/probe/ping')
        .set('x-forwarded-for', ip)
        .set('authorization', '');
      expect(throttled.status).toBe(429);
    });
  });

  describe('tracker separation', () => {
    let h: Harness;
    beforeAll(async () => {
      h = await buildApp();
    });
    afterAll(async () => {
      await h?.app.close();
      await h?.module.close();
    });

    it('exhausting public bucket does not block valid-JWT requests from the same IP', async () => {
      const ip = '10.0.4.1';
      const token = validToken(h.signer, 'iso-user');

      for (let i = 0; i < PUBLIC; i++) {
        const r = await request(srv(h.app)).get('/api/probe/ping').set('x-forwarded-for', ip);
        expect(r.status).toBe(200);
      }
      const blocked = await request(srv(h.app)).get('/api/probe/ping').set('x-forwarded-for', ip);
      expect(blocked.status).toBe(429);

      const authOk = await request(srv(h.app))
        .get('/api/probe/ping')
        .set('x-forwarded-for', ip)
        .set('authorization', `Bearer ${token}`);
      expect(authOk.status).toBe(200);
    });
  });
});
