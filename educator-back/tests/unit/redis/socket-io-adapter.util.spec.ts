import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { setupSocketIoAdapter } from '../../../src/common/utils/socket-io-adapter.util';
import { SocketIoAdapter } from '../../../src/common/adapters';
import { LoggerService } from '../../../src/common/services';

jest.mock('../../../src/common/adapters', () => ({
  SocketIoAdapter: jest.fn(),
}));

describe('setupSocketIoAdapter', () => {
  const logger = { log: jest.fn(), warn: jest.fn() } as unknown as LoggerService;

  const appWith = (redis: unknown): INestApplication =>
    ({
      get: jest.fn().mockReturnValue(redis),
      useWebSocketAdapter: jest.fn(),
    }) as unknown as INestApplication;

  const configWith = (enabled: boolean): ConfigService =>
    ({ get: jest.fn().mockReturnValue(enabled) }) as unknown as ConfigService;

  beforeEach(() => jest.clearAllMocks());

  it('installs the Redis adapter when a Redis client exists and the adapter is enabled', () => {
    const app = appWith({});

    setupSocketIoAdapter(app, configWith(true), logger);

    expect(SocketIoAdapter).toHaveBeenCalledTimes(1);
    expect(app.useWebSocketAdapter).toHaveBeenCalledTimes(1);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('falls back to the in-memory adapter and warns when there is no Redis client', () => {
    const app = appWith(null);

    setupSocketIoAdapter(app, configWith(true), logger);

    expect(app.useWebSocketAdapter).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('local-only'));
  });

  it('falls back to the in-memory adapter and warns when the kill switch is off', () => {
    const app = appWith({});

    setupSocketIoAdapter(app, configWith(false), logger);

    expect(app.useWebSocketAdapter).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('local-only'));
  });
});
