import { Module, forwardRef } from '@nestjs/common';

import { InvitesService } from './invites.service';
import { InviteTokenService } from './invite-token.service';
import { InvitesController } from './invites.controller';

import { MailModule } from '../mail/mail.module';
import { ConfigModule } from '@nestjs/config';
import { UsersModule } from 'src/users/users.module';

@Module({
  imports: [MailModule, ConfigModule, forwardRef(() => UsersModule)],
  controllers: [InvitesController],
  providers: [InvitesService, InviteTokenService],
  exports: [InvitesService, InviteTokenService],
})
export class InvitesModule {}
