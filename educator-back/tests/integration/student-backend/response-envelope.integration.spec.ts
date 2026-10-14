import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { HealthController } from '../../../src/student-backend/health/health.controller';
import { HealthService } from '../../../src/student-backend/health/health.service';
import { buildTestApp } from '../setup/test-app.factory';

/**
 * `src/student-backend` never opts into `ResponseInterceptor` itself (root `CLAUDE.md`). The
 * interceptor is global, so it does see these routes, but it only envelopes an already-migrated
 * `ResponseResult` — a student-backend handler's raw body reaches the client verbatim.
 */
describe('src/student-backend response envelope (Integration)', () => {
  let app: INestApplication;

  const httpServer = (): Parameters<typeof request>[0] => {
    const server: unknown = app.getHttpServer();
    return server as Parameters<typeof request>[0];
  };

  beforeEach(async () => {
    const built = await buildTestApp({
      controllers: [HealthController],
      providers: [
        { provide: HealthService, useValue: { liveness: jest.fn(), readiness: jest.fn() } },
      ],
    });
    app = built.app;
  });

  afterEach(async () => {
    await app.close();
  });

  it('INTEGRATION: leaves a raw student-backend response body untouched', async () => {
    const res = await request(httpServer()).get('/api/server-time').expect(200);

    // Not a `ResponseResult`, so no envelope is applied: the handler's own `{ utc }` payload is
    // exactly what the client receives, with no `message`/`data`/`meta`/`error` keys added.
    const body = res.body as Record<string, unknown>;
    expect(typeof body.utc).toBe('string');
    expect(Object.keys(body)).toEqual(['utc']);
  });
});
