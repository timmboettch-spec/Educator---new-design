import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { MoodleAdapter } from './adapters/moodle.adapter';
import { LmsAdapterFactory } from './factories/lms-adapter.factory';
import { LmsController } from './lms.controller';
import { LmsClassMapping } from './entity/lms-class-mapping.entity';
import { LmsSchoolConfig } from './entity/lms-school-config.entity';
import { LmsStudentMapping } from './entity/lms-student-mapping.entity';
import { LmsAuthService } from './services/lms-auth.service';
import { LmsConfigService } from './services/lms-config.service';
import { LmsConnectService } from './services/lms-connect.service';
import { LmsGradeService } from './services/lms-grade.service';
import { LmsLookupService } from './services/lms-lookup.service';
import { LmsProvisionService } from './services/lms-provision.service';
import { LmsRosterService } from './services/lms-roster.service';
import { Schools } from 'src/schools/entity/schools.entity';
import { Class } from 'src/class/entity/class.entity';
import { Educator } from 'src/educators/entity/educator.entity';
import { Student } from 'src/students/entity/students.entity';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      LmsSchoolConfig,
      LmsClassMapping,
      LmsStudentMapping,
      Schools,
      Class,
      Educator,
      Student,
    ]),
  ],
  controllers: [LmsController],
  providers: [
    // Adapters
    MoodleAdapter,
    LmsAdapterFactory,

    // Services
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
    LmsConfigService,
    LmsConnectService,
    LmsGradeService,
    LmsLookupService,
    LmsRosterService,
    LmsProvisionService,
  ],
})
export class LmsModule {}
