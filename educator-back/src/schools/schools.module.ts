import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Schools } from './entity/schools.entity';
import { SchoolsService } from './schools.service';
import { SchoolsController } from './schools.controller';
import { JwtStrategy } from 'src/common/strategy/jwt.strategy';
import { TokenBlacklistService } from 'src/common/strategy/jwt.blacklist.strategy';
import { User } from '../users/entity/user.entity';
import { ClassSimulation } from '../class-simulations/entity/class-simulation.entity';
import { Invite } from '../invites/entity/invite.entity';
import { SessionModule } from '../session/session.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Schools, User, ClassSimulation, Invite]),
    SessionModule,
    NotificationsModule,
    MailModule,
  ],
  controllers: [SchoolsController],
  providers: [SchoolsService, JwtStrategy, TokenBlacklistService],
  exports: [SchoolsService],
})
export class SchoolsModule {}
