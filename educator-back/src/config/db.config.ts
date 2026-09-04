import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export const getDbConfig = (): TypeOrmModuleOptions => {
  const sslEnabled = process.env.ALLOW_NONSSL === 'true';
  return {
    type: 'postgres',
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: sslEnabled ? { rejectUnauthorized: false } : false,
    autoLoadEntities: true,
    synchronize: false,
    logging: true,
    migrations: ['dist/migrations/*.js'],
    retryAttempts: 10,
    retryDelay: 5000,
    // ── Connection pool (Scope 6) ─────────────────────────────────────────
    extra: {
      max: Number(process.env.DB_POOL_MAX) || 10,
      idleTimeoutMillis: Number(process.env.DB_POOL_IDLE_TIMEOUT_MS) || 30_000,
      connectionTimeoutMillis: Number(process.env.DB_POOL_ACQUIRE_TIMEOUT_MS) || 5_000,
    },
  };
};
