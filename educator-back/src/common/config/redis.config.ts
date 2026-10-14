import { registerAs } from '@nestjs/config';

export default registerAs('redis', () => ({
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD,
  tls: process.env.REDIS_TLS === 'true',
  isManaged: process.env.IS_MANAGED_REDIS === 'true',
  username: process.env.REDIS_USERNAME,
  cacheTtlSeconds: Number(process.env.REDIS_CACHE_TTL_SECONDS) || undefined,
}));
