import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { VersioningType, VERSION_NEUTRAL } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { studentBackendConfig } from './student-backend/helpers/global.helper';
import { securityHeadersOptions } from './common/config/security-headers.config';
import { LoggerService } from './common/services';
import { createValidationPipe } from './common/pipes/validation.pipe';
import { setupSocketIoAdapter } from './common/utils';

function startHeapLogger(logger: LoggerService, heapLogIntervalMs: number): void {
  setInterval(() => {
    const { heapUsed, heapTotal, rss } = process.memoryUsage();

    const mb = (n: number): string => `${(n / 1024 / 1024).toFixed(1)} MB`;

    logger.log(
      `Heap: ${mb(heapUsed)} used / ${mb(heapTotal)} total | RSS: ${mb(rss)}`,
      'MemoryMonitor',
    );
  }, heapLogIntervalMs).unref();
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  app.set('trust proxy', 1);
  app.use(helmet(securityHeadersOptions));

  const logger = app.get(LoggerService);
  app.useLogger(logger);
  app.use(cookieParser());

  // Close the Socket.IO adapter's Redis connections (and other providers) on SIGTERM/SIGINT.
  app.enableShutdownHooks();

  app.enableCors({
    origin: true,
    credentials: true,
  });

  app.useGlobalPipes(createValidationPipe());

  app.setGlobalPrefix('api', {
    exclude: ['api-docs', 'api-docs/*path', 'health', 'healthz', 'readyz'],
  });

  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: VERSION_NEUTRAL,
  });

  const swaggerJwtConfig = {
    type: 'http' as const,
    scheme: 'bearer',
    bearerFormat: 'JWT',
    name: 'Authorization',
    in: 'header',
  };

  const config = new DocumentBuilder()
    .setTitle('Educator App API')
    .setDescription(
      'Complete REST API documentation for the Educator App backend.\n\n**Authentication:** All protected routes require a JWT Bearer token. Obtain it from `POST /auth/login`.',
    )
    .setVersion('1.0')
    .addBearerAuth(swaggerJwtConfig, 'jwt')
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    deepScanRoutes: true,
  });

  SwaggerModule.setup('api-docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });

  studentBackendConfig(app);

  const configService = app.get(ConfigService);

  setupSocketIoAdapter(app, configService, logger);

  const appPort = configService.get<string>('app.appPort');
  const displayPort = configService.get<string>('app.port') ?? '3000';
  const apiTimeoutMs = configService.get<number>('app.apiTimeoutMs') ?? 60_000;
  const serverKeepAliveTimeoutMs =
    configService.get<number>('app.serverKeepAliveTimeoutMs') ?? 65_000;
  const serverHeadersTimeoutMs = configService.get<number>('app.serverHeadersTimeoutMs') ?? 66_000;
  const heapLogIntervalMs = configService.get<number>('app.heapLogIntervalMs') ?? 60_000;

  await app.listen(appPort as string);

  // HTTP server timeouts
  const server = app.getHttpServer();
  server.keepAliveTimeout = serverKeepAliveTimeoutMs;
  server.headersTimeout = serverHeadersTimeoutMs;

  // Heap memory logging
  startHeapLogger(logger, heapLogIntervalMs);

  logger.log(`Server running on http://localhost:${displayPort}`);

  logger.log(`Swagger docs available at http://localhost:${displayPort}/api-docs`);

  logger.log(`Timeouts — API: ${apiTimeoutMs}ms | KeepAlive: ${serverKeepAliveTimeoutMs}ms`);
}

void bootstrap();
