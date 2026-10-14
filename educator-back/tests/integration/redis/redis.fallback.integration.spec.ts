import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { RedisService } from '../../../src/redis/redis.service';
import { REDIS_CLIENT, REDIS_DEFAULT_TTL_SECONDS } from '../../../src/redis/redis.constants';
import { LoggerService } from '../../../src/common/services';

// RedisService logs via the injected LoggerService rather than its own `new Logger(...)`
// instance. The tests below assert against `Logger.prototype.warn`/`log` spies, so the
// mock delegates to a real `Logger` instance to keep those assertions intact.
const loggerServiceMock = {
  log: (message: unknown, ...optionalParams: unknown[]) =>
    new Logger().log(message as string, ...(optionalParams as string[])),
  warn: (message: unknown, ...optionalParams: unknown[]) =>
    new Logger().warn(message as string, ...(optionalParams as string[])),
  error: jest.fn(),
  debug: jest.fn(),
  verbose: jest.fn(),
  fatal: jest.fn(),
};

function makeRedisClient(
  overrides: Partial<Record<string, jest.Mock>> = {},
): Record<string, jest.Mock> {
  return {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    keys: jest.fn().mockResolvedValue([]),
    ping: jest.fn().mockResolvedValue('PONG'),
    ...overrides,
  };
}

const configService = {
  get: jest.fn().mockImplementation((key: string) => {
    if (key === 'REDIS_CACHE_TTL_SECONDS') return String(REDIS_DEFAULT_TTL_SECONDS);
    return undefined;
  }),
} as unknown as ConfigService;

async function buildModule(redis: ReturnType<typeof makeRedisClient> | null): Promise<{
  app: INestApplication;
  service: RedisService;
}> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      RedisService,
      { provide: REDIS_CLIENT, useValue: redis },
      { provide: ConfigService, useValue: configService },
      { provide: LoggerService, useValue: loggerServiceMock },
    ],
  }).compile();

  const app = module.createNestApplication();
  jest.spyOn(module.get(RedisService), 'onModuleInit').mockImplementation(() => undefined);
  await app.init();

  return { app, service: module.get(RedisService) };
}

describe('RedisService — integration (fallback behaviour)', () => {
  let warnSpy: jest.SpyInstance;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('when Redis is healthy', () => {
    it('reads from Redis and reports mode: redis', async () => {
      const redis = makeRedisClient({
        get: jest.fn().mockResolvedValue(JSON.stringify({ score: 99 })),
      });
      const { app, service } = await buildModule(redis);

      const value = await service.get<{ score: number }>('report:1');
      const status = await service.getStatus();

      expect(value).toEqual({ score: 99 });
      expect(status.mode).toBe('redis');
      expect(status.redisConnected).toBe(true);

      await app.close();
    });

    it('writes to Redis with the configured TTL', async () => {
      const redis = makeRedisClient();
      const { app, service } = await buildModule(redis);

      await service.set('report:2', { score: 80 });

      expect(redis.set).toHaveBeenCalledWith(
        'report:2',
        JSON.stringify({ score: 80 }),
        'EX',
        REDIS_DEFAULT_TTL_SECONDS,
      );

      await app.close();
    });
  });

  describe('when Redis goes down', () => {
    it('falls back to in-memory and logs fallback activation once', async () => {
      const redis = makeRedisClient({
        get: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
        set: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      });
      const { app, service } = await buildModule(redis);

      await service.get('k1');
      await service.get('k2');
      await service.set('k3', 'val');

      const activations = warnSpy.mock.calls.filter(
        (c: unknown[]) =>
          typeof c[0] === 'string' && c[0].includes('activating in-memory fallback'),
      );
      expect(activations).toHaveLength(1);

      await app.close();
    });

    it('serves data from in-memory after Redis failure', async () => {
      const error = new Error('ECONNREFUSED');
      const redis = makeRedisClient({
        set: jest.fn().mockRejectedValue(error),
        get: jest.fn().mockRejectedValue(error),
      });
      const { app, service } = await buildModule(redis);

      await service.set('blob:data', 'fallback-value');
      const result = await service.get<string>('blob:data');

      expect(result).toBe('fallback-value');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('activating in-memory fallback'),
      );

      await app.close();
    });

    it('reports mode: in-memory-fallback via getStatus()', async () => {
      const redis = makeRedisClient({
        ping: jest.fn().mockRejectedValue(new Error('down')),
      });
      const { app, service } = await buildModule(redis);

      const status = await service.getStatus();

      expect(status.mode).toBe('in-memory-fallback');
      expect(status.redisConnected).toBe(false);
      expect(status.memoryCacheSize).toBeGreaterThanOrEqual(0);

      await app.close();
    });
  });

  describe('when Redis recovers after a failure', () => {
    it('resumes using Redis and logs recovery exactly once', async () => {
      const getRejecting = jest.fn().mockRejectedValue(new Error('down'));
      const redis = makeRedisClient({ get: getRejecting });
      const { app, service } = await buildModule(redis);

      await service.get('key');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('activating in-memory fallback'),
      );

      redis.get.mockResolvedValue(JSON.stringify('from-redis'));
      const result1 = await service.get<string>('key');
      const result2 = await service.get<string>('key');

      expect(result1).toBe('from-redis');
      expect(result2).toBe('from-redis');

      const recoveryCalls = logSpy.mock.calls.filter(
        (c: unknown[]) => typeof c[0] === 'string' && c[0].includes('Connection recovered'),
      );
      expect(recoveryCalls).toHaveLength(1);

      await app.close();
    });

    it('repopulates Redis on first write after recovery', async () => {
      const redis = makeRedisClient({
        set: jest.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValue('OK'),
      });
      const { app, service } = await buildModule(redis);

      await service.set('key', 'value-during-outage');

      await service.set('key', 'value-after-recovery');

      expect(redis.set).toHaveBeenLastCalledWith(
        'key',
        JSON.stringify('value-after-recovery'),
        'EX',
        REDIS_DEFAULT_TTL_SECONDS,
      );

      await app.close();
    });
  });

  describe('when Redis is not configured (null client)', () => {
    it('uses in-memory for all operations without errors', async () => {
      const { app, service } = await buildModule(null);

      await service.set('key', { data: true });
      const result = await service.get<{ data: boolean }>('key');
      const status = await service.getStatus();

      expect(result).toEqual({ data: true });
      expect(status.mode).toBe('in-memory-fallback');
      expect(status.redisConnected).toBe(false);
      expect(warnSpy).not.toHaveBeenCalled();

      await app.close();
    });

    it('isHealthy() returns false without throwing', async () => {
      const { app, service } = await buildModule(null);

      await expect(service.isHealthy()).resolves.toBe(false);

      await app.close();
    });
  });

  describe('delByPrefix()', () => {
    it('clears matching keys from both stores when Redis is healthy', async () => {
      const redis = makeRedisClient({
        keys: jest.fn().mockResolvedValue(['blob:a', 'blob:b']),
        del: jest.fn().mockResolvedValue(2),
      });
      const { app, service } = await buildModule(redis);

      await service.set('blob:a', 1);
      await service.set('blob:b', 2);
      await service.set('other:c', 3);

      redis.get.mockRejectedValue(new Error('down'));
      await service.delByPrefix('blob:');

      expect(redis.del).toHaveBeenCalledWith('blob:a', 'blob:b');
      expect(await service.get('blob:a')).toBeNull();

      await app.close();
    });

    it('logs warn and clears in-memory only when Redis keys() throws', async () => {
      const redis = makeRedisClient({
        keys: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      });
      const { app, service } = await buildModule(redis);

      await service.set('blob:x', 'val');
      await service.delByPrefix('blob:');

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('DEL by prefix'));

      await app.close();
    });
  });
});
