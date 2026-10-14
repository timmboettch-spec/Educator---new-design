import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter } from 'events';

const getToken = jest.fn();
jest.mock('@azure/identity', () => ({
  ManagedIdentityCredential: jest.fn().mockImplementation(() => ({ getToken })),
}));

class FakeRedis extends EventEmitter {
  static instances: FakeRedis[] = [];
  options: Record<string, unknown>;
  auth = jest.fn().mockResolvedValue('OK');
  disconnect = jest.fn();
  constructor(options: Record<string, unknown>) {
    super();
    this.options = { ...options };
    FakeRedis.instances.push(this);
  }
  duplicate(override: Record<string, unknown> = {}): FakeRedis {
    return new FakeRedis({ ...this.options, ...override });
  }
}
jest.mock('ioredis', () => ({ __esModule: true, default: FakeRedis }));

import { createRedisClient, duplicateRedisClient } from '../../../src/redis/redis.provider';

const makeConfig = (values: Record<string, unknown>): ConfigService =>
  ({
    get: jest.fn((key: string, fallback?: unknown) => values[key] ?? fallback),
  }) as unknown as ConfigService;

const REFRESH_MS = 40 * 60 * 1000;

describe('duplicateRedisClient', () => {
  let logger: Logger;

  beforeEach(() => {
    jest.useFakeTimers();
    FakeRedis.instances = [];
    getToken.mockReset().mockResolvedValue({ token: 'startup-token' });
    logger = new Logger('test');
    jest.spyOn(logger, 'log').mockImplementation(() => undefined);
    jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    jest.spyOn(logger, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  const localBase = async (): Promise<FakeRedis> =>
    (await createRedisClient(
      makeConfig({ 'redis.host': 'h', 'redis.isManaged': false }),
      logger,
    )) as unknown as FakeRedis;

  const managedBase = async (): Promise<FakeRedis> =>
    (await createRedisClient(
      makeConfig({ 'redis.host': 'h', 'redis.isManaged': true, 'redis.username': 'oid' }),
      logger,
    )) as unknown as FakeRedis;

  it('returns a new client copied from the base with the offline queue enabled', async () => {
    const base = await localBase();
    expect(base.options.enableOfflineQueue).toBe(false);

    const copy = duplicateRedisClient(base as never, logger) as unknown as FakeRedis;

    expect(copy).not.toBe(base);
    expect(copy.options.host).toBe('h');
    expect(copy.options.enableOfflineQueue).toBe(true);
  });

  it('wires no token refresh outside managed mode', async () => {
    const base = await localBase();
    const copy = duplicateRedisClient(base as never, logger) as unknown as FakeRedis;

    copy.emit('connect');
    await jest.advanceTimersByTimeAsync(REFRESH_MS * 2);

    expect(getToken).not.toHaveBeenCalled();
    expect(copy.auth).not.toHaveBeenCalled();
  });

  it('refreshes the copy token on the same schedule and trigger as the base in managed mode', async () => {
    const base = await managedBase();
    const copy = duplicateRedisClient(base as never, logger) as unknown as FakeRedis;
    getToken.mockClear();
    getToken.mockResolvedValue({ token: 'refreshed-token' });

    base.emit('connect');
    copy.emit('connect');
    await jest.advanceTimersByTimeAsync(REFRESH_MS - 1);
    expect(copy.auth).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1);

    expect(base.auth).toHaveBeenCalledWith('oid', 'refreshed-token');
    expect(copy.auth).toHaveBeenCalledWith('oid', 'refreshed-token');
    expect(copy.options.password).toBe('refreshed-token');

    // And it reschedules for the next window.
    await jest.advanceTimersByTimeAsync(REFRESH_MS);
    expect(copy.auth).toHaveBeenCalledTimes(2);
  });

  it('does not schedule a refresh until the copy connects', async () => {
    const base = await managedBase();
    const copy = duplicateRedisClient(base as never, logger) as unknown as FakeRedis;
    getToken.mockClear();

    await jest.advanceTimersByTimeAsync(REFRESH_MS * 2);

    expect(copy.auth).not.toHaveBeenCalled();
  });
});
