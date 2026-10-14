import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';
import { createRedisClient } from './redis.provider';
import { RedisService } from './redis.service';
import { LoggerService } from '../common/services/logger.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService, LoggerService],
      useFactory: (
        configService: ConfigService,
        loggerService: LoggerService,
      ): Promise<Redis | null> => createRedisClient(configService, loggerService),
    },
    RedisService,
  ],
  exports: [RedisService, REDIS_CLIENT],
})
export class RedisModule {}
