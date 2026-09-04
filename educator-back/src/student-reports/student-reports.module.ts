import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SimulationReport } from 'src/simulation-reports/entity/simulation-report.entity';
import { Student } from 'src/students/entity/students.entity';
import { StudentReportsService } from './student-reports.service';
import { StudentReportsController } from './reports.controller';
import { StudentAdminReportsController } from './admin-reports.controller';
import { StudentTranscriptLogsController } from './transcript-logs.controller';
import { StudentScenariosController } from './scenarios.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SimulationReport, Student])],
  controllers: [
    StudentReportsController,
    StudentAdminReportsController,
    StudentTranscriptLogsController,
    StudentScenariosController,
  ],
  providers: [StudentReportsService],
  exports: [StudentReportsService],
})
export class StudentReportsModule {}
