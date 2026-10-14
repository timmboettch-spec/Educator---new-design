import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { ConfigModule } from '@nestjs/config';

import { MailModule } from '../mail/mail.module';
import { CsrfModule } from '../csrf/csrf.module';
import { ForgotPasswordRateLimiterService } from './services/forgot-password-rate-limiter.service';
import { ForgotPasswordThrottleGuard } from './guards/forgot-password-throttle.guard';
import { SalesOrderLinesModule } from '../sales-order-lines/sales-order-lines.module';

@Module({
  imports: [
    UsersModule,
    ConfigModule,
    MailModule,
    CsrfModule,
    SalesOrderLinesModule,
  ],
  controllers: [AuthController],

  providers: [
    AuthService,
    ForgotPasswordRateLimiterService,
    ForgotPasswordThrottleGuard,
  ],
  // ForgotPasswordRateLimiterService: kept from dev forgot-password throttling.
  exports: [AuthService, ForgotPasswordRateLimiterService],
})
export class AuthModule {}
