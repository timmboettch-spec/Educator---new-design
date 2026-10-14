import { Module } from '@nestjs/common';

import { EducatorsService } from './educators.service';
import { EducatorsController } from './educators.controller';

import { MailModule } from 'src/mail/mail.module';
import { ConfigModule } from '@nestjs/config';
import { InviteTokenService } from 'src/invites/invite-token.service';

@Module({
  imports: [MailModule, ConfigModule],
  controllers: [EducatorsController],
  providers: [EducatorsService, InviteTokenService],
  exports: [EducatorsService],
})
export class EducatorsModule {}
