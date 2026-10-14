import { Global, Module, forwardRef } from '@nestjs/common';

import { ClassSimulationService } from './class-simulation.service';
import { ClassSimulationController } from './class-simulation.controller';

import { EducatorsModule } from 'src/educators/educators.module';
import { GoogleModule } from 'src/google/google.module';

@Global()
@Module({
  // forwardRef: ClassSimulationsModule ↔ GoogleModule ↔ StudentsModule cycle
  imports: [EducatorsModule, forwardRef(() => GoogleModule)],
  controllers: [ClassSimulationController],
  providers: [ClassSimulationService],
  exports: [ClassSimulationService],
})
export class ClassSimulationsModule { }
