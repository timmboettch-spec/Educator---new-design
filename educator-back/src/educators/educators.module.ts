import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Educator } from './entity/educator.entity';
import { EducatorSchool } from './entity/educator-school.entity';
import { EducatorsService } from './educators.service';
import { EducatorsController } from './educators.controller';
import { User } from '../users/entity/user.entity';
import { Schools } from '../schools/entity/schools.entity';
import { JwtStrategy } from 'src/common/strategy/jwt.strategy';
import { TokenBlacklistService } from 'src/common/strategy/jwt.blacklist.strategy';
import { AzureBlobService } from 'src/config/azure-blob.config';
import { Student } from 'src/students/entity/students.entity';
import { Class } from 'src/class/entity/class.entity';
import { ClassSimulation } from 'src/class-simulations/entity/class-simulation.entity';
import { Invite } from 'src/invites/entity/invite.entity';
import { MailModule } from 'src/mail/mail.module';
import { ConfigModule } from '@nestjs/config';
import { TutorPatientService } from 'src/common/utils/tutor-patient.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Educator,
      EducatorSchool,
      User,
      Schools,
      Invite,
      Student,
      Class,
      ClassSimulation,
    ]),
    MailModule,
    ConfigModule,
  ],
  controllers: [EducatorsController],
  providers: [
    EducatorsService,
    JwtStrategy,
    TokenBlacklistService,
    AzureBlobService,
    TutorPatientService,
  ],
  exports: [EducatorsService],
})
export class EducatorsModule {}
