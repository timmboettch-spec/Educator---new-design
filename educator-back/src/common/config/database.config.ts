import { registerAs } from '@nestjs/config';

export default registerAs('database', () => ({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  name: process.env.DB_NAME,
  allowNonSsl: process.env.ALLOW_NONSSL === 'true',
  poolMax: Number(process.env.DB_POOL_MAX) || 10,
  poolIdleTimeoutMs: Number(process.env.DB_POOL_IDLE_TIMEOUT_MS) || 30_000,
  poolAcquireTimeoutMs: Number(process.env.DB_POOL_ACQUIRE_TIMEOUT_MS) || 30_000,
}));
