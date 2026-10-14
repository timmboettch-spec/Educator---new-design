import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { HealthController } from '../../../src/health/health.controller';
import { HealthService } from '../../../src/health/health.service';
import { buildTestApp } from '../setup/test-app.factory';

describe('Health probes (Integration)', () => {
  let app: INestApplication;
  let healthService: { liveness: jest.Mock; readiness: jest.Mock };

  const httpServer = (): Parameters<typeof request>[0] => {
    const server: unknown = app.getHttpServer();
    return server as Parameters<typeof request>[0];
  };

  beforeEach(async () => {
    healthService = {
      liveness: jest.fn(),
      readiness: jest.fn(),
    };

    const built = await buildTestApp({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: healthService }],
    });
    app = built.app;
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /readyz', () => {
    it('INTEGRATION: reports 200 and the raw readiness payload when every check passes', async () => {
      healthService.readiness.mockResolvedValue({
        status: 'ok',
        uptimeMs: 1234,
        timestamp: '2026-01-01T00:00:00.000Z',
        checks: { database: { status: 'ok' } },
      });

      const res = await request(httpServer()).get('/api/readyz').expect(200);

      // The readiness payload is not a `ResponseResult`, so `ResponseInterceptor` leaves it
      // alone — the probe body is exactly what the handler returned, with no envelope keys.
      const body = res.body as { status: string; checks: unknown };
      expect(body.status).toBe('ok');
      expect(body.checks).toEqual({ database: { status: 'ok' } });
      expect(body).not.toHaveProperty('error');
    });

    it('INTEGRATION: reports 503 and the raw readiness payload when a critical check fails', async () => {
      healthService.readiness.mockResolvedValue({
        status: 'error',
        uptimeMs: 1234,
        timestamp: '2026-01-01T00:00:00.000Z',
        checks: { database: { status: 'error', error: 'timeout' } },
      });

      // A raw body carries no `ResponseResult.statusCode`, so the 503 the handler set via
      // `@Res({ passthrough: true })` is preserved — Azure's readiness probe depends on this flip.
      const res = await request(httpServer()).get('/api/readyz').expect(503);

      const body = res.body as { status: string; checks: unknown };
      expect(body.status).toBe('error');
      expect(body.checks).toEqual({ database: { status: 'error', error: 'timeout' } });
      expect(body).not.toHaveProperty('error');
    });
  });
});
