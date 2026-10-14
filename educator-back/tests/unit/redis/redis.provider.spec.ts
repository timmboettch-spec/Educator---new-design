import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRedisClient } from '../../../src/redis/redis.provider';

const makeConfig = (values: Record<string, unknown>): ConfigService =>
  ({
    get: jest.fn((key: string, fallback?: unknown) => values[key] ?? fallback),
  }) as unknown as ConfigService;

describe('createRedisClient — REDIS_HOST requirement', () => {
  let logger: Logger;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    logger = new Logger('test');
    warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    jest.spyOn(logger, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it.each(['development', 'test'])(
    'returns null and warns when REDIS_HOST is unset in %s',
    async (nodeEnv) => {
      const client = await createRedisClient(makeConfig({ 'app.nodeEnv': nodeEnv }), logger);

      expect(client).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('in-memory storage'));
    },
  );

  it('treats an unset NODE_ENV as development', async () => {
    await expect(createRedisClient(makeConfig({}), logger)).resolves.toBeNull();
  });

  it.each(['staging', 'production', 'prod', 'anything-unrecognised'])(
    'throws at startup when REDIS_HOST is unset in %s',
    async (nodeEnv) => {
      await expect(
        createRedisClient(makeConfig({ 'app.nodeEnv': nodeEnv }), logger),
      ).rejects.toThrow('REDIS_HOST is required');
    },
  );

  it('builds a client when REDIS_HOST is set in production', async () => {
    const client = await createRedisClient(
      makeConfig({
        'app.nodeEnv': 'production',
        'redis.host': '127.0.0.1',
        'redis.port': 6379,
        'redis.isManaged': false,
      }),
      logger,
    );

    expect(client).not.toBeNull();
    client?.disconnect();
  });
});
