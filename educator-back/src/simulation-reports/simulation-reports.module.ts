import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SimulationReport } from './entity/simulation-report.entity';
import { SimulationReportsService } from './simulation-reports.service';
import { SimulationReportsController } from './simulation-reports.controller';
import { ConfigModule } from '@nestjs/config';
import { MailModule } from 'src/mail/mail.module';
import { Notification } from 'src/notifications/entity/notification.entity';

@Module({
  imports: [TypeOrmModule.forFeature([SimulationReport, Notification]), ConfigModule, MailModule],
  controllers: [SimulationReportsController],
  providers: [SimulationReportsService],
  exports: [SimulationReportsService],
})
export class SimulationReportsModule {}
