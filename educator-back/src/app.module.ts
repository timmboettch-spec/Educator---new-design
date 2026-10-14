import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { join } from 'path';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { ClsModule } from 'nestjs-cls';
import { AcceptLanguageResolver, I18nModule } from 'nestjs-i18n';
import { APP_INTERCEPTOR, APP_GUARD, APP_FILTER } from '@nestjs/core';
import { AuthThrottlerGuard } from './common/guards/auth-throttler.guard';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { RequestTimeoutInterceptor } from './common/interceptors/request-timeout.interceptor';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { XssMiddleware } from './common/middleware/xss.middleware';
import { TraceMiddleware } from './common/middleware/trace.middleware';
import { AutomationUserContextMiddleware } from './common/middleware/automation-user-context.middleware';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { SchoolsModule } from './schools/schools.module';
import { InvitesModule } from './invites/invites.module';
import { GuidedPathModule } from './guided-path/guided-path.module';
import { MailModule } from './mail/mail.module';
import { EducatorsModule } from './educators/educators.module';
import { DatabaseModule } from './database/database.module';
import { ClassesModule } from './class/classes.module';
import { StudentsModule } from './students/students.module';
import { UnitsModule } from './units/units.module';
import { SimulationModule } from './simulation/simulation.module';
import { AvatarsModule } from './avatars/avatars.module';
import { VoiceProfilesModule } from './voice-profiles/voice-profiles.module';
import { EducatorSimulationsModule } from './educator-simulations/educator-simulations.module';
import { ClassSimulationsModule } from './class-simulations/class-simulations.module';
import { HealthModule } from './health/health.module';
import { SimulationReportsModule } from './simulation-reports/simulation-reports.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { NotificationsModule } from './notifications/notifications.module';
import { CsrfModule } from './csrf/csrf.module';
import { CsrfGuard } from './csrf/csrf.guard';
import { StudentReportsModule } from './student-reports/student-reports.module';
import { RedisModule } from './redis/redis.module';
import { LmsModule } from './lms/lms.module';
import { LtiModule } from './lti/lti.module';
import { GoogleModule } from './google/google.module';
import { ClassTransferModule } from './class-transfer/class-transfer.module';
import { SalesOrderLinesModule } from './sales-order-lines/sales-order-lines.module';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { RATE_LIMIT } from './common/constants/throttle.constants';
import { RATE_LIMIT_THROTTLER_NAME } from './common/guards/auth-throttler.guard';
import { StudentBackend, StudentBackendRouter } from './student-backend/app.module';
import { ThrottlerStorage } from '@nestjs/throttler';
import { RedisFallbackThrottlerStorage } from './common/guards/redis-fallback-throttler.storage';
import { ServicesModule } from './common/services';
import { AiModule } from './common/providers/ai';
import { envConfig } from './common/config';
import { validateEnv } from './common/dtos';
import { AuthGuard } from './common/guards/auth.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      load: envConfig,
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

    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
        generateId: true,
        idGenerator: () => randomUUID(),
      },
    }),

    PrometheusModule.register(),

    // Powers the i18n-aware ResponseResult/error envelope opted into by new
    // modules only (see src/common/{class,filters,interceptors,messages}) —
    // existing modules are unaffected since I18nService/I18nContext are only
    // consumed by that new-module interceptor/filter.
    I18nModule.forRoot({
      fallbackLanguage: 'en',
      loaderOptions: {
        path: join(__dirname, 'common/i18n/'),
        watch: true,
      },
      resolvers: [AcceptLanguageResolver],
    }),

    // Powers MailRetryService's @Interval poll for the mail retry queue
    // (src/mail/mail-retry.service.ts) — no other scheduled tasks yet.
    ScheduleModule.forRoot(),

    DatabaseModule,
    ServicesModule,
    AiModule,
    UsersModule,
    AuthModule,
    SchoolsModule,
    InvitesModule,
    GuidedPathModule,
    MailModule,
    EducatorsModule,
    ClassesModule,
    StudentsModule,
    UnitsModule,
    StudentReportsModule,
    SimulationModule,
    AvatarsModule,
    VoiceProfilesModule,
    EducatorSimulationsModule,
    ClassSimulationsModule,
    HealthModule,
    SimulationReportsModule,
    DashboardModule,
    NotificationsModule,
    CsrfModule,
    RedisModule,
    LmsModule,
    LtiModule,
    GoogleModule,
    ClassTransferModule,
    SalesOrderLinesModule,
    StudentBackend,
    StudentBackendRouter,
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
    // Global guard order matters: throttler → AuthGuard (default-deny, ADR-0005) → CSRF, so an
    // unauthenticated request gets a 401 rather than a CSRF 403.
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestTimeoutInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseInterceptor,
    },
    {
      provide: APP_GUARD,
      useClass: CsrfGuard,
    },
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(XssMiddleware, AutomationUserContextMiddleware, TraceMiddleware).forRoutes({
      path: '*',
      method: RequestMethod.ALL,
    });
  }
}
