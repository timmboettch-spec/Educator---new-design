import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { ClsModule } from 'nestjs-cls';
import { APP_INTERCEPTOR, APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuthThrottlerGuard } from './common/guards/auth-throttler.guard';
import { AuditLoggerInterceptor } from './common/interceptors/audit-logger.interceptor';
import { RequestTimeoutInterceptor } from './common/interceptors/request-timeout.interceptor';
import { XssMiddleware } from './common/middleware/xss.middleware';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { SchoolsModule } from './schools/schools.module';
import { InvitesModule } from './invites/invites.module';
import { MailModule } from './mail/mail.module';
import { EducatorsModule } from './educators/educators.module';
import { getDbConfig } from './config/db.config';
import { ClassesModule } from './class/classes.module';
import { StudentsModule } from './students/students.module';
import { SimulationsModule } from './simulations/simulations.module';
import { SimulationCatalogModule } from './simulation-catalog/simulation-catalog.module';
import { EducatorSimulationsModule } from './educator-simulations/educator-simulations.module';
import { ClassSimulationsModule } from './class-simulations/class-simulations.module';
import { HealthModule } from './health/health.module';
import { SimulationReportsModule } from './simulation-reports/simulation-reports.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { NotificationsModule } from './notifications/notifications.module';
import { CsrfModule } from './csrf/csrf.module';
import { CsrfGuard } from './csrf/csrf.guard';
import { ProductsModule } from './products/products.module';
import { StudentReportsModule } from './student-reports/student-reports.module';
import { RedisModule } from './redis/redis.module';
import { LmsModule } from './lms/lms.module';
import { LtiModule } from './lti/lti.module';
import { ClassTransferModule } from './class-transfer/class-transfer.module';
import { ThrottlerModule } from '@nestjs/throttler';
import { RATE_LIMIT } from './common/constants/throttle.constants';
import { RATE_LIMIT_THROTTLER_NAME } from './common/guards/auth-throttler.guard';
import { StudentBackend, StudentBackendRouter } from './student-backend/app.module';
import { JsonDataModule } from './student-backend/data/json-data.service';
import { TutorPatientModule } from './common/utils/tutor-patient.service';
import { EducatorAuthModule } from './student-backend/guards/educator-auth.module';
import { ThrottlerStorage } from '@nestjs/throttler';
import { RedisFallbackThrottlerStorage } from './common/guards/redis-fallback-throttler.storage';
import { validateEnv } from './config/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),

    ThrottlerModule.forRoot({
      throttlers: [
        {
          name: RATE_LIMIT_THROTTLER_NAME,
          ttl: RATE_LIMIT.AUTHENTICATED.TTL * 1000,
          limit: RATE_LIMIT.AUTHENTICATED.LIMIT,
        },
      ],
    }),

    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
    }),

    LoggerModule.forRoot({
      pinoHttp: {
        transport: {
          target: 'pino-pretty',
          options: {
            singleLine: true,
          },
        },
      },
    }),

    ClsModule.forRoot({
      global: true,
      middleware: { mount: true },
    }),

    PrometheusModule.register(),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: () => getDbConfig(),
    }),

    UsersModule,
    AuthModule,
    SchoolsModule,
    InvitesModule,
    MailModule,
    EducatorsModule,
    ClassesModule,
    StudentsModule,
    StudentReportsModule,
    SimulationsModule,
    SimulationCatalogModule,
    EducatorSimulationsModule,
    ClassSimulationsModule,
    HealthModule,
    SimulationReportsModule,
    DashboardModule,
    NotificationsModule,
    CsrfModule,
    ProductsModule,
    RedisModule,
    LmsModule,
    LtiModule,
    ClassTransferModule,
    TutorPatientModule,
    StudentBackend,
    EducatorAuthModule,
    StudentBackendRouter,
    JsonDataModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    RedisFallbackThrottlerStorage,
    {
      provide: ThrottlerStorage,
      useExisting: RedisFallbackThrottlerStorage,
    },
    {
      provide: APP_GUARD,
      useClass: AuthThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestTimeoutInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditLoggerInterceptor,
    },
    {
      provide: APP_GUARD,
      useClass: CsrfGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(XssMiddleware).forRoutes({
      path: '*',
      method: RequestMethod.ALL,
    });
  }
}
