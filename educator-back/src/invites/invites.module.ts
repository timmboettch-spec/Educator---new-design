import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Invite } from './entity/invite.entity';
import { InvitesService } from './invites.service';
import { InvitesController } from './invites.controller';
import { Schools } from '../schools/entity/schools.entity';
import { User } from '../users/entity/user.entity';
import { Role } from '../roles/entity/role.entity';
import { Educator } from '../educators/entity/educator.entity';
import { EducatorSchool } from '../educators/entity/educator-school.entity';
import { MailModule } from '../mail/mail.module';
import { ConfigModule } from '@nestjs/config';
import { UsersModule } from 'src/users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Invite, User, Role, Schools, Educator, EducatorSchool]),
    MailModule,
    ConfigModule,
    forwardRef(() => UsersModule),
  ],
  controllers: [InvitesController],
  providers: [InvitesService],
  exports: [InvitesService],
})
export class InvitesModule {}
