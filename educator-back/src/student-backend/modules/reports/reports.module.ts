import { Module } from '@nestjs/common';

import { MailModule } from 'src/mail/mail.module';

import { ScenariosModule } from '../scenarios/scenarios.module';
import { ActionsInterventionsService } from './actions-interventions.service';
import { ClinicalDocumentationService } from './clinical-documentation.service';
import { CommunicationService } from './communication.service';
import { PpePrivacyService } from './ppe-privacy.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { SequencingService } from './sequencing.service';
import { TimelineTimingService } from './timeline-timing.service';

@Module({
  imports: [MailModule, ScenariosModule],
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
