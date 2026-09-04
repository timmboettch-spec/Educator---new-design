import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class CsrfService {
  constructor(
    private readonly redisService: RedisService,
  ) {}

  async generateToken(): Promise<string> {
    const token = randomBytes(32).toString('hex');

    await this.redisService.set(
      `csrf:${token}`,
      'valid',
      3600,
    );

    return token;
  }

  async validateToken(token: string): Promise<boolean> {
    const exists =
      await this.redisService.get(`csrf:${token}`);

    console.log(
      'Redis Lookup:',
      `csrf:${token}`,
      exists,
    );

    return !!exists;
  }
}
