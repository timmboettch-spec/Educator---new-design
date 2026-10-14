import { Module } from '@nestjs/common';

import { SchoolsService } from './schools.service';
import { SchoolsController } from './schools.controller';

import { SessionModule } from '../session/session.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MailModule } from '../mail/mail.module';
import { InviteTokenService } from 'src/invites/invite-token.service';

@Module({
  imports: [SessionModule, NotificationsModule, MailModule],
  controllers: [SchoolsController],
  providers: [SchoolsService, InviteTokenService],
  exports: [SchoolsService],
})
export class SchoolsModule { }
