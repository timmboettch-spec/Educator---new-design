import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { RedisService } from '../redis/redis.service';
import { LoggerService } from '../common/services';

@Injectable()
export class CsrfService {
  constructor(
    private readonly redisService: RedisService,
    private readonly logger: LoggerService,
  ) {}

  async generateToken(): Promise<string> {
    const token = randomBytes(32).toString('hex');

    await this.redisService.set(`csrf:${token}`, 'valid', 3600);

    return token;
  }

  async validateToken(token: string): Promise<boolean> {
    const exists = await this.redisService.get(`csrf:${token}`);

    this.logger.debug({
      topic: 'CsrfService',
      subTopic: 'validateToken',
      operation: 'redis-lookup',
      metadata: { found: !!exists },
    });

    return !!exists;
  }
}
