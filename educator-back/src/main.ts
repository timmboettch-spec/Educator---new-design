import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ValidationPipe, Logger as NestLogger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { studentBackendConfig } from './student-backend/helpers/global.helper';
import { securityHeadersOptions } from './config/security-headers.config';

const HEAP_LOG_INTERVAL_MS = Number(process.env.HEAP_LOG_INTERVAL_MS) || 60_000;

const SERVER_KEEP_ALIVE_TIMEOUT_MS = Number(process.env.SERVER_KEEP_ALIVE_TIMEOUT_MS) || 65_000;

const SERVER_HEADERS_TIMEOUT_MS = Number(process.env.SERVER_HEADERS_TIMEOUT_MS) || 66_000;

function startHeapLogger(logger: NestLogger): void {
  setInterval(() => {
    const { heapUsed, heapTotal, rss } = process.memoryUsage();

    const mb = (n: number): string => `${(n / 1024 / 1024).toFixed(1)} MB`;

    logger.log(
      `Heap: ${mb(heapUsed)} used / ${mb(heapTotal)} total | RSS: ${mb(rss)}`,
      'MemoryMonitor',
    );
  }, HEAP_LOG_INTERVAL_MS).unref();
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  app.set('trust proxy', 1);
  app.use(helmet(securityHeadersOptions));

  app.useLogger(app.get(Logger));
  app.use(cookieParser());

  app.enableCors({
    origin: true,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());

  app.setGlobalPrefix('api', {
    exclude: ['api-docs', 'api-docs/*path', 'health', 'healthz', 'readyz'],
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

  const port = process.env.APP_PORT!;
  await app.listen(port);

  // HTTP server timeouts
  const server = app.getHttpServer();
  server.keepAliveTimeout = SERVER_KEEP_ALIVE_TIMEOUT_MS;
  server.headersTimeout = SERVER_HEADERS_TIMEOUT_MS;

  // Heap memory logging
  const logger = new NestLogger('Bootstrap');
  startHeapLogger(logger);

  logger.log(`Server running on http://localhost:${process.env.PORT ?? 3000}`);

  logger.log(`Swagger docs available at http://localhost:${process.env.PORT ?? 3000}/api-docs`);

  logger.log(
    `Timeouts — API: ${Number(process.env.API_TIMEOUT_MS) || 60_000}ms | KeepAlive: ${SERVER_KEEP_ALIVE_TIMEOUT_MS}ms`,
  );
}

void bootstrap();
