import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { Notification } from './entity/notification.entity';
import { ClassSimulation } from 'src/class-simulations/entity/class-simulation.entity';
import { Simulation } from 'src/simulations/entity/simulation.entity';
import { Educator } from 'src/educators/entity/educator.entity';
import { User } from 'src/users/entity/user.entity';
import { CsrfModule } from 'src/csrf/csrf.module';

@Global()
@Module({
  imports: [
    ConfigModule,
    CsrfModule,
    TypeOrmModule.forFeature([Notification, ClassSimulation, Simulation, Educator, User]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  providers: [NotificationsGateway, NotificationsService],
  controllers: [NotificationsController],
  exports: [NotificationsGateway, NotificationsService],
})
export class NotificationsModule {}
