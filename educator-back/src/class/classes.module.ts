import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Class } from './entity/class.entity';
import { ClassEducator } from './entity/class-educator.entity';
import { ClassesService } from './classes.service';
import { ClassesController } from './classes.controller';
import { JwtStrategy } from 'src/common/strategy/jwt.strategy';
import { TokenBlacklistService } from 'src/common/strategy/jwt.blacklist.strategy';
import { StudentsModule } from '../students/students.module';
import { Student } from '../students/entity/students.entity';
import { User } from 'src/users/entity/user.entity';
import { Educator } from 'src/educators/entity/educator.entity';
import { EducatorSchool } from 'src/educators/entity/educator-school.entity';
import { EducatorsModule } from 'src/educators/educators.module';
import { ClassSimulation } from 'src/class-simulations/entity/class-simulation.entity';
import { ClassSimulationsModule } from 'src/class-simulations/class-simulations.module';
import { LmsModule } from 'src/lms/lms.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Class,
      ClassEducator,
      Student,
      User,
      Educator,
      EducatorSchool,
      ClassSimulation,
    ]),
    StudentsModule,
    EducatorsModule,
    ClassSimulationsModule,
    LmsModule,
  ],
  providers: [ClassesService, JwtStrategy, TokenBlacklistService],
  controllers: [ClassesController],
  exports: [ClassesService],
})
export class ClassesModule {}
