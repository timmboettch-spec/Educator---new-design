import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { LoggerService } from '../services';
import { SocketIoAdapter } from '../adapters';

export function setupSocketIoAdapter(
  app: INestApplication,
  configService: ConfigService,
  logger: LoggerService,
): void {
  const redis = app.get<Redis | null>(REDIS_CLIENT, { strict: false });
  if (redis && configService.get<boolean>('socketIo.redisAdapterEnabled', true)) {
    app.useWebSocketAdapter(new SocketIoAdapter(app, redis, logger));
    logger.log('[Socket.IO] Redis adapter enabled — pushes are shared across replicas.');
  } else {
    logger.warn(
      '[Socket.IO] Redis adapter not installed (no Redis client or SOCKET_IO_REDIS_ADAPTER_ENABLED=false) — delivery is local-only; single replica only.',
    );
  }
}
