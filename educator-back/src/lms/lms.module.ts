import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CanvasAdapter } from './adapters/canvas.adapter';
import { LtiAgsAdapter } from './adapters/lti-ags.adapter';
import { MoodleAdapter } from './adapters/moodle.adapter';
import { LmsAdapterFactory } from './factories/lms-adapter.factory';
import { LmsController } from './lms.controller';
import { LmsAssignmentService } from './services/lms-assignment.service';
import { LmsAuthService } from './services/lms-auth.service';
import { LmsConfigService } from './services/lms-config.service';
import { LmsConnectService } from './services/lms-connect.service';
import { LmsGradeService } from './services/lms-grade.service';
import { LmsLookupService } from './services/lms-lookup.service';
import { LmsProvisionService } from './services/lms-provision.service';
import { LmsRosterService } from './services/lms-roster.service';

@Module({
  imports: [ConfigModule],
  controllers: [LmsController],
  providers: [
    LtiAgsAdapter,
    MoodleAdapter,
    CanvasAdapter,
    LmsAdapterFactory,
    LmsAssignmentService,
    LmsAuthService,
    LmsConfigService,
    LmsRosterService,
    LmsConnectService,
    LmsGradeService,
    LmsLookupService,
    LmsProvisionService,
  ],
  exports: [
    LmsAdapterFactory,
    LmsAssignmentService,
    LmsConfigService,
    LmsConnectService,
    LmsGradeService,
    LmsLookupService,
    LmsRosterService,
    LmsProvisionService,
  ],
})
export class LmsModule {}
