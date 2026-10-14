import { Module } from '@nestjs/common';

import { AuthModule } from 'src/auth/auth.module';
import { ClassSimulationsModule } from 'src/class-simulations/class-simulations.module';
import { ClassesModule } from 'src/class/classes.module';
import { LmsModule } from 'src/lms/lms.module';
import { StudentsModule } from 'src/students/students.module';
import { LtiController } from './lti.controller';
import { LtiKeyService } from './lti-key.service';
import { LtiService } from './lti.service';
import { LtiJwtService } from './lti-jwt.service';
import { LtiStateService } from './lti-state.service';
import { LtiSessionService } from './lti-session.service';
import { LtiDeepLinkingService } from './services/lti-deep-linking.service';
import { LtiSubmissionReviewService } from './services/lti-submission-review.service';

@Module({
  imports: [AuthModule, ClassSimulationsModule, ClassesModule, LmsModule, StudentsModule],
  controllers: [LtiController],
  providers: [
    LtiKeyService,
    LtiService,
    LtiJwtService,
    LtiStateService,
    LtiSessionService,
    LtiDeepLinkingService,
    LtiSubmissionReviewService,
  ],
  exports: [
    LtiKeyService,
    LtiService,
    LtiJwtService,
    LtiStateService,
    LtiSessionService,
    LtiDeepLinkingService,
    LtiSubmissionReviewService,
  ],
})
export class LtiModule {}
