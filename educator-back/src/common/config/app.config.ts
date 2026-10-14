import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV,
  appUrl: process.env.APP_URL,
  frontendUrl: process.env.FRONTEND_URL,
  studentFrontendUrl: process.env.STUDENT_FRONTEND_URL,
  appPort: process.env.APP_PORT,
  port: process.env.PORT,
  apiBaseUrl: process.env.API_BASE_URL,
  apiTimeoutMs: Number(process.env.API_TIMEOUT_MS) || 60_000,
  serverKeepAliveTimeoutMs: Number(process.env.SERVER_KEEP_ALIVE_TIMEOUT_MS) || 65_000,
  serverHeadersTimeoutMs: Number(process.env.SERVER_HEADERS_TIMEOUT_MS) || 66_000,
  heapLogIntervalMs: Number(process.env.HEAP_LOG_INTERVAL_MS) || 60_000,
  notificationDueReminderDays: process.env.NOTIFICATION_DUE_REMINDER_DAYS,
  cryptoSecret: process.env.CRYPTO_SECRET,
}));
