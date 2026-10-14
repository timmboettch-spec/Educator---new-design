import { Module } from '@nestjs/common';

import { ClassesService } from './classes.service';
import { ClassesController } from './classes.controller';
import { StudentsModule } from '../students/students.module';

import { EducatorsModule } from 'src/educators/educators.module';

import { ClassSimulationsModule } from 'src/class-simulations/class-simulations.module';
import { LmsModule } from 'src/lms/lms.module';

@Module({
  imports: [StudentsModule, EducatorsModule, ClassSimulationsModule, LmsModule],
  providers: [ClassesService],
  controllers: [ClassesController],
  exports: [ClassesService],
})
export class ClassesModule {}
