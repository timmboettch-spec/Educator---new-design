import { Module } from '@nestjs/common';

import { StudentReportsService } from './student-reports.service';
import { StudentReportsController } from './reports.controller';
import { StudentAdminReportsController } from './admin-reports.controller';
import { StudentTranscriptLogsController } from './transcript-logs.controller';
import { StudentScenariosController } from './scenarios.controller';

@Module({
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
