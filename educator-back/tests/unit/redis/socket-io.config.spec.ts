import socketIoConfig from '../../../src/common/config/socket-io.config';

describe('socketIo config', () => {
  const original = process.env.SOCKET_IO_REDIS_ADAPTER_ENABLED;

  afterEach(() => {
    if (original === undefined) delete process.env.SOCKET_IO_REDIS_ADAPTER_ENABLED;
    else process.env.SOCKET_IO_REDIS_ADAPTER_ENABLED = original;
  });

  it.each([
    [undefined, true],
    ['true', true],
    ['', true],
    ['0', true],
    ['false', false],
  ])('SOCKET_IO_REDIS_ADAPTER_ENABLED=%p → redisAdapterEnabled=%p', (value, expected) => {
    if (value === undefined) delete process.env.SOCKET_IO_REDIS_ADAPTER_ENABLED;
    else process.env.SOCKET_IO_REDIS_ADAPTER_ENABLED = value;

    expect(socketIoConfig().redisAdapterEnabled).toBe(expected);
  });
});
