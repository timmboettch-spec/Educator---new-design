import { registerAs } from '@nestjs/config';

export default registerAs('socketIo', () => ({
  // Kill-switch for the Redis adapter (ADR-0008): only an explicit 'false' reverts Socket.IO to
  // the in-memory adapter (local-only delivery); unset or anything else keeps it on.
  redisAdapterEnabled: process.env.SOCKET_IO_REDIS_ADAPTER_ENABLED !== 'false',
}));
