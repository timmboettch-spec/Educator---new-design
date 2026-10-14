import { forwardRef, Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationDigestService } from './notification-digest.service';
import { Notification } from 'src/database/entities';
import { NotificationPreference } from '../database/entities/notification-preference.entity';
import { ClassSimulation } from 'src/database/entities';
import { SimulationV2 } from 'src/database/entities';
import { Educator } from 'src/database/entities';
import { CsrfModule } from 'src/csrf/csrf.module';
import { AuthModule } from 'src/auth/auth.module';
import { MailModule } from 'src/mail/mail.module';
import { User } from 'src/database/entities';

@Global()
@Module({
  imports: [
    ConfigModule,
    CsrfModule,
    forwardRef(() => AuthModule),
    MailModule,
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([
      Notification,
      NotificationPreference,
      ClassSimulation,
      SimulationV2,
      Educator,
      User,
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  providers: [NotificationsGateway, NotificationsService, NotificationDigestService],
  controllers: [NotificationsController],
  exports: [NotificationsGateway, NotificationsService],
})
export class NotificationsModule { }
