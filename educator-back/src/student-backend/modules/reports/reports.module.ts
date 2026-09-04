import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { ActionsInterventionsService } from './actions-interventions.service';
import { ClinicalDocumentationService } from './clinical-documentation.service';
import { CommunicationService } from './communication.service';
import { PpePrivacyService } from './ppe-privacy.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { SequencingService } from './sequencing.service';
import { TimelineTimingService } from './timeline-timing.service';

@Module({
  imports: [HttpModule],
  controllers: [ReportsController],
  providers: [
    ReportsService,
    ActionsInterventionsService,
    PpePrivacyService,
    ClinicalDocumentationService,
    CommunicationService,
    TimelineTimingService,
    SequencingService,
  ],
})
export class ReportsModule {}
