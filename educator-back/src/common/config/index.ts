import appConfig from './app.config';
import databaseConfig from './database.config';
import jwtConfig from './jwt.config';
import redisConfig from './redis.config';
import azureBlobConfig from './azure-blob.config';
import mailConfig from './mail.config';
import ltiConfig from './lti.config';
import telemetryConfig from './telemetry.config';
import aiConfig from './ai.config';
import lmsConfig from './lms.config';
import googleConfig from './google.config';
import studentBackendConfig from './student-backend.config';
import throttleConfig from './throttle.config';
import automationConfig from './automation.config';
import socketIoConfig from './socket-io.config';

export const envConfig = [
  appConfig,
  databaseConfig,
  jwtConfig,
  redisConfig,
  azureBlobConfig,
  mailConfig,
  ltiConfig,
  telemetryConfig,
  aiConfig,
  lmsConfig,
  googleConfig,
  studentBackendConfig,
  throttleConfig,
  automationConfig,
  socketIoConfig,
];
