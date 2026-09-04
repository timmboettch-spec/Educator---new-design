import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from '../../../src/health/health.controller';
import { HealthService } from '../../../src/health/health.service';

const mockHealthService = {
  liveness: (): { status: 'ok' | 'error'; uptimeMs: number; timestamp: string } => ({
    status: 'ok',
    uptimeMs: 0,
    timestamp: new Date().toISOString(),
  }),
  readiness: (): Promise<{ status: 'ok' | 'error'; uptimeMs: number; timestamp: string; checks: Record<string, { status: 'ok' | 'error'; error?: string; skipped?: boolean }> }> =>
    Promise.resolve({
      status: 'ok',
      uptimeMs: 0,
      timestamp: new Date().toISOString(),
      checks: {
        database: { status: 'ok' },
        azureBlob: { status: 'ok', skipped: true },
      },
    }),
};

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: mockHealthService }],
    }).compile();

    controller = module.get(HealthController);
  });

  //  Unit

  describe('health (unit)', () => {
    it('returns status ok', () => {
      const result = controller.healthz();
      expect(result.status).toBe('ok');
    });

    it('returns a valid ISO timestamp', () => {
      const result = controller.healthz();
      expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
    });

    it('timestamp is close to now', () => {
      const before = Date.now();
      const result = controller.healthz();
      const after = Date.now();
      const ts = new Date(result.timestamp).getTime();
      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(after);
    });

    it('returns a plain object with status, uptimeMs, and timestamp keys', () => {
      const result = controller.healthz();
      expect(Object.keys(result)).toEqual(['status', 'uptimeMs', 'timestamp']);
    });
  });

  //  Regression

  describe('health (regression)', () => {
    it('each call returns a fresh timestamp', () => {
      const first = controller.healthz().timestamp;
      const second = controller.healthz().timestamp;
      // Both are valid ISO strings; second must be >= first
      expect(new Date(second).getTime()).toBeGreaterThanOrEqual(new Date(first).getTime());
    });

    it('status is always the string "ok", never null or undefined', () => {
      for (let i = 0; i < 5; i++) {
        expect(controller.healthz().status).toBe('ok');
      }
    });
  });

  //Integration

  describe('health (integration)', () => {
    it('module compiles and controller is resolvable', () => {
      expect(controller).toBeDefined();
    });

    it('full response shape matches expected contract', () => {
      const result = controller.healthz();
      expect(result.status).toBe('ok');
      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });
});
