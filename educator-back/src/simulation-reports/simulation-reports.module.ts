import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MailModule } from 'src/mail/mail.module';
import { LmsModule } from 'src/lms/lms.module';
import { GoogleModule } from 'src/google/google.module';
import { SimulationReportsController } from './simulation-reports.controller';
import { SimulationReportsService } from './simulation-reports.service';

@Module({
  imports: [ConfigModule, MailModule, LmsModule, GoogleModule],
  controllers: [SimulationReportsController],
  providers: [SimulationReportsService],
  exports: [SimulationReportsService],
})
export class SimulationReportsModule {}
