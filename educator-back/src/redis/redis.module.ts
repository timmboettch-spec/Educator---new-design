import { Global, Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';
import { createRedisClient } from './redis.provider';
import { RedisService } from './redis.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): Promise<Redis | null> =>
        createRedisClient(configService, new Logger('RedisModule')),
    },
    RedisService,
  ],
  exports: [RedisService],
})
export class RedisModule {}
