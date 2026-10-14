import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../../src/redis/redis.service';
import { REDIS_CLIENT, REDIS_DEFAULT_TTL_SECONDS } from '../../../src/redis/redis.constants';
import { LoggerService } from '../../../src/common/services';

const makeRedis = (
  overrides: Partial<Record<string, jest.Mock>> = {},
): Record<string, jest.Mock> => ({
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  keys: jest.fn().mockResolvedValue([]),
  ping: jest.fn().mockResolvedValue('PONG'),
  ...overrides,
});

const configService = {
  get: jest.fn().mockReturnValue(undefined),
} as unknown as ConfigService;

const mockLogger = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  verbose: jest.fn(),
  fatal: jest.fn(),
};

const makeConfig = (values: Record<string, unknown> = {}): ConfigService =>
  ({ get: jest.fn((key: string) => values[key]) }) as unknown as ConfigService;

async function buildService(
  redis: ReturnType<typeof makeRedis> | null,
  config: ConfigService = configService,
): Promise<RedisService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      RedisService,
      { provide: REDIS_CLIENT, useValue: redis },
      { provide: ConfigService, useValue: configService },
      { provide: ConfigService, useValue: config },
      { provide: LoggerService, useValue: mockLogger },
    ],
  }).compile();

  const svc = module.get<RedisService>(RedisService);
  jest.spyOn(svc, 'onModuleInit').mockImplementation(() => undefined);
  svc.onModuleInit();
  return svc;
}

describe('RedisService — unit', () => {
  let warnSpy: jest.Mock;
  let logSpy: jest.Mock;

  beforeEach(() => {
    warnSpy = mockLogger.warn;
    logSpy = mockLogger.log;
  });

  afterEach(() => jest.clearAllMocks());

  describe('get()', () => {
    it('returns parsed Redis value when Redis is healthy', async () => {
      const redis = makeRedis({ get: jest.fn().mockResolvedValue(JSON.stringify({ a: 1 })) });
      const svc = await buildService(redis);

      const result = await svc.get<{ a: number }>('key');

      expect(result).toEqual({ a: 1 });
      expect(redis.get).toHaveBeenCalledWith('key');
    });

    it('falls back to in-memory when Redis throws', async () => {
      const error = new Error('ECONNREFUSED');
      const redis = makeRedis({
        get: jest.fn().mockRejectedValue(error),
        set: jest.fn().mockRejectedValue(error),
      });
      const svc = await buildService(redis);
      await svc.set('key', { b: 2 });

      const result = await svc.get<{ b: number }>('key');

      expect(result).toEqual({ b: 2 });
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('activating in-memory fallback'),
      );
    });

    it('returns null when both Redis and in-memory miss', async () => {
      const redis = makeRedis({ get: jest.fn().mockResolvedValue(null) });
      const svc = await buildService(redis);

      const result = await svc.get('missing-key');

      expect(result).toBeNull();
    });

    it('returns null when Redis client is not configured', async () => {
      const svc = await buildService(null);

      const result = await svc.get('key');

      expect(result).toBeNull();
    });
  });

  describe('set()', () => {
    it('writes to Redis when healthy', async () => {
      const redis = makeRedis({ set: jest.fn().mockResolvedValue('OK') });
      const svc = await buildService(redis);

      await svc.set('key', { x: 1 });

      expect(redis.set).toHaveBeenCalledWith(
        'key',
        JSON.stringify({ x: 1 }),
        'EX',
        REDIS_DEFAULT_TTL_SECONDS,
      );
    });

    it('falls back to in-memory when Redis set() throws', async () => {
      const redis = makeRedis({ set: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) });
      const svc = await buildService(redis);

      await svc.set('key', { y: 2 });

      redis.get.mockRejectedValue(new Error('ECONNREFUSED'));
      const result = await svc.get<{ y: number }>('key');
      expect(result).toEqual({ y: 2 });
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('activating in-memory fallback'),
      );
    });

    it('writes to in-memory when Redis client is null', async () => {
      const svc = await buildService(null);

      await svc.set('key', 'value');
      const result = await svc.get<string>('key');

      expect(result).toBe('value');
    });
  });

  describe('del()', () => {
    it('removes from both Redis and in-memory', async () => {
      const redis = makeRedis({ del: jest.fn().mockResolvedValue(1) });
      const svc = await buildService(redis);
      await svc.set('key', 'val');

      await svc.del('key');

      expect(redis.del).toHaveBeenCalledWith('key');
      expect(await svc.get('key')).toBeNull();
    });

    it('removes from in-memory only and logs when Redis del() throws', async () => {
      const redis = makeRedis({
        set: jest.fn().mockResolvedValue('OK'),
        del: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      });
      const svc = await buildService(redis);

      await svc.del('key');

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('DEL'));
    });
  });

  describe('fallback activation and recovery', () => {
    it('logs warn exactly once when fallback activates (not on every call)', async () => {
      const redis = makeRedis({ get: jest.fn().mockRejectedValue(new Error('down')) });
      const svc = await buildService(redis);

      await svc.get('k1');
      await svc.get('k2');
      await svc.get('k3');

      const warnCalls = warnSpy.mock.calls.filter(
        (c: unknown[]) =>
          typeof c[0] === 'string' && c[0].includes('activating in-memory fallback'),
      );
      expect(warnCalls).toHaveLength(1);
    });

    it('logs recovery exactly once when Redis becomes healthy again', async () => {
      const getRejecting = jest.fn().mockRejectedValue(new Error('down'));
      const redis = makeRedis({ get: getRejecting });
      const svc = await buildService(redis);

      await svc.get('k1');

      redis.get.mockResolvedValue(JSON.stringify('recovered'));
      await svc.get('k1');
      await svc.get('k1');

      const recoveryCalls = logSpy.mock.calls.filter(
        (c: unknown[]) => typeof c[0] === 'string' && c[0].includes('Connection recovered'),
      );
      expect(recoveryCalls).toHaveLength(1);
    });
  });

  describe('isHealthy()', () => {
    it('returns true when ping responds with PONG', async () => {
      const redis = makeRedis({ ping: jest.fn().mockResolvedValue('PONG') });
      const svc = await buildService(redis);

      expect(await svc.isHealthy()).toBe(true);
    });

    it('returns false and logs warn when ping throws', async () => {
      const redis = makeRedis({ ping: jest.fn().mockRejectedValue(new Error('timeout')) });
      const svc = await buildService(redis);

      expect(await svc.isHealthy()).toBe(false);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Health check failed'));
    });

    it('returns false when Redis client is null', async () => {
      const svc = await buildService(null);

      expect(await svc.isHealthy()).toBe(false);
    });
  });

  describe('getStatus()', () => {
    it('reports redis mode when healthy', async () => {
      const redis = makeRedis({ ping: jest.fn().mockResolvedValue('PONG') });
      const svc = await buildService(redis);

      const status = await svc.getStatus();

      expect(status.mode).toBe('redis');
      expect(status.redisConnected).toBe(true);
    });

    it('reports in-memory-fallback mode when ping fails', async () => {
      const redis = makeRedis({ ping: jest.fn().mockRejectedValue(new Error('down')) });
      const svc = await buildService(redis);

      const status = await svc.getStatus();

      expect(status.mode).toBe('in-memory-fallback');
      expect(status.redisConnected).toBe(false);
    });

    it('reports in-memory-fallback mode when client is null', async () => {
      const svc = await buildService(null);

      const status = await svc.getStatus();

      expect(status.mode).toBe('in-memory-fallback');
      expect(status.redisConnected).toBe(false);
    });
  });

  describe('in-memory TTL expiry', () => {
    it('returns null for an expired in-memory entry', async () => {
      const svc = await buildService(null);

      await svc.set('expiring', 'value', 1);
      jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 2000);

      const result = await svc.get('expiring');

      expect(result).toBeNull();
      jest.spyOn(Date, 'now').mockRestore();
    });
  });
  describe('getDelStrict()', () => {
    it('returns the parsed value and lets the script delete the key', async () => {
      const evalMock = jest.fn().mockResolvedValue(JSON.stringify({ nonce: 'n-1' }));
      const svc = await buildService(makeRedis({ eval: evalMock }));

      await expect(svc.getDelStrict('lti:state:abc')).resolves.toEqual({ nonce: 'n-1' });
      expect(evalMock).toHaveBeenCalledTimes(1);
    });

    it('returns null when the key is absent', async () => {
      const svc = await buildService(makeRedis({ eval: jest.fn().mockResolvedValue(null) }));

      await expect(svc.getDelStrict('lti:state:missing')).resolves.toBeNull();
    });

    it('treats a corrupt JSON value as not found instead of throwing', async () => {
      const svc = await buildService(makeRedis({ eval: jest.fn().mockResolvedValue('{not-json') }));

      await expect(svc.getDelStrict('lti:state:corrupt')).resolves.toBeNull();
      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Corrupt JSON'));
    });

    it('throws when REDIS_HOST is set but the client is null — never falls back', async () => {
      const svc = await buildService(
        null,
        makeConfig({ 'redis.host': 'redis.example.com', 'app.nodeEnv': 'production' }),
      );

      await expect(svc.getDelStrict('lti:state:abc')).rejects.toThrow(
        'Redis client is not configured',
      );
    });
  });

  describe('strict methods — in-memory gate', () => {
    const devConfig = (): ConfigService => makeConfig({ 'app.nodeEnv': 'development' });

    it('stores and one-time-reads in memory when REDIS_HOST is unset in development', async () => {
      const svc = await buildService(null, devConfig());

      await svc.setStrict('lti:state:abc', { nonce: 'n-1' }, 600);

      await expect(svc.getDelStrict('lti:state:abc')).resolves.toEqual({ nonce: 'n-1' });
      await expect(svc.getDelStrict('lti:state:abc')).resolves.toBeNull();
    });

    it('honours TTL expiry on the in-memory path', async () => {
      jest.useFakeTimers();
      try {
        const svc = await buildService(null, devConfig());
        await svc.setStrict('lti:state:ttl', { nonce: 'n-1' }, 600);

        jest.advanceTimersByTime(601 * 1000);

        await expect(svc.getDelStrict('lti:state:ttl')).resolves.toBeNull();
      } finally {
        jest.useRealTimers();
      }
    });

    it.each(['staging', 'production', 'prod', 'anything-unrecognised'])(
      'throws in %s even with REDIS_HOST unset — fails closed',
      async (nodeEnv) => {
        const svc = await buildService(null, makeConfig({ 'app.nodeEnv': nodeEnv }));

        await expect(svc.setStrict('lti:state:abc', { nonce: 'n' }, 600)).rejects.toThrow(
          'Redis client is not configured',
        );
        await expect(svc.getDelStrict('lti:state:abc')).rejects.toThrow(
          'Redis client is not configured',
        );
      },
    );

    it('throws when REDIS_HOST is set but the client is null, even in development', async () => {
      const svc = await buildService(
        null,
        makeConfig({ 'redis.host': 'redis.example.com', 'app.nodeEnv': 'development' }),
      );

      await expect(svc.setStrict('lti:state:abc', { nonce: 'n' }, 600)).rejects.toThrow(
        'Redis client is not configured',
      );
      await expect(svc.getDelStrict('lti:state:abc')).rejects.toThrow(
        'Redis client is not configured',
      );
    });

    it('prefers a real client over memory when one is configured', async () => {
      const setMock = jest.fn().mockResolvedValue('OK');
      const svc = await buildService(makeRedis({ set: setMock }), devConfig());

      await svc.setStrict('lti:state:abc', { nonce: 'n-1' }, 600);

      expect(setMock).toHaveBeenCalledWith(
        'lti:state:abc',
        JSON.stringify({ nonce: 'n-1' }),
        'EX',
        600,
      );
    });
  });
});
