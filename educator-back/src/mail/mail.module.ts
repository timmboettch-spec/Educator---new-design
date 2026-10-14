import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MailService } from './mail.service';
import { MailRetryService } from './mail-retry.service';
import { MailRateLimiterService } from './mail-rate-limiter.service';

@Module({
  imports: [ConfigModule],
  providers: [MailService, MailRetryService, MailRateLimiterService],
  exports: [MailService, MailRetryService],
})
export class MailModule {}
