import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LmsSchoolConfig } from 'src/lms/entity/lms-school-config.entity';
import { AuthModule } from 'src/auth/auth.module';
import { LmsModule } from 'src/lms/lms.module';
import { StudentsModule } from 'src/students/students.module';
import { LtiController } from './lti.controller';
import { LtiKeyService } from './lti-key.service';
import { LtiService } from './lti.service';
import { LtiJwtService } from './lti-jwt.service';
import { LtiStateService } from './lti-state.service';
import { LtiSessionService } from './lti-session.service';

@Module({
  imports: [TypeOrmModule.forFeature([LmsSchoolConfig]), AuthModule, LmsModule, StudentsModule],
  controllers: [LtiController],
  providers: [LtiKeyService, LtiService, LtiJwtService, LtiStateService, LtiSessionService],
  exports: [LtiKeyService, LtiService, LtiJwtService, LtiStateService, LtiSessionService],
})
export class LtiModule {}
