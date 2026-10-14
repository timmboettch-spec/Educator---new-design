import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StudentsModule } from 'src/students/students.module';
import { AuthModule } from 'src/auth/auth.module';
import { GoogleController } from './google.controller';
import { GoogleOAuthController } from './google-oauth.controller';
import { GoogleClassroomService } from './google-classroom.service';
import { GoogleConnectionService } from './google-connection.service';
import { GoogleCourseMappingService } from './google-course-mapping.service';
import { GoogleCourseworkService } from './google-coursework.service';
import { GoogleRosterSyncService } from './google-roster-sync.service';
import { GoogleOAuthService } from './google-oauth.service';
import { GoogleOAuthStateService } from './google-oauth-state.service';
import { GoogleStudentLoginService } from './google-student-login.service';
import { GoogleStudentHandoffService } from './google-student-handoff.service';
import { GoogleGradePassbackService } from './google-grade-passback.service';

@Module({
  // forwardRef: GoogleModule ↔ StudentsModule ↔ ClassSimulationsModule cycle
  // Do NOT import LtiModule here — it pulls ClassSimulationsModule and creates
  // Google → Lti → ClassSimulations → Google with an undefined import.
  imports: [ConfigModule, forwardRef(() => StudentsModule), AuthModule],
  controllers: [GoogleController, GoogleOAuthController],
  providers: [
    GoogleOAuthService,
    GoogleOAuthStateService,
    GoogleConnectionService,
    GoogleClassroomService,
    GoogleCourseMappingService,
    GoogleCourseworkService,
    GoogleRosterSyncService,
    GoogleStudentLoginService,
    GoogleStudentHandoffService,
    GoogleGradePassbackService,
  ],
  exports: [
    GoogleConnectionService,
    GoogleOAuthService,
    GoogleClassroomService,
    GoogleCourseworkService,
    GoogleRosterSyncService,
    GoogleStudentLoginService,
    GoogleGradePassbackService,
  ],
})
export class GoogleModule {}
