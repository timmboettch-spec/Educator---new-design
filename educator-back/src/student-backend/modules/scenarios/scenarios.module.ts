import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { ScenarioAssignmentGuard } from './guards/scenario-assignment.guard';
import { ScenarioAssignmentService } from './scenario-assignment.service';
import { ScenariosController } from './scenarios.controller';
import { ScenariosService } from './scenarios.service';
import { StudentsModule } from 'src/students/students.module';

@Module({
  imports: [HttpModule, StudentsModule],
  controllers: [ScenariosController],
  providers: [ScenariosService, ScenarioAssignmentService, ScenarioAssignmentGuard],
  exports: [ScenarioAssignmentService, ScenarioAssignmentGuard],
})
export class ScenariosModule {}
