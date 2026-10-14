import { Module } from '@nestjs/common';

import { SimulationService } from './simulation.service';
import { SimulationController } from './simulation.controller';
import { ConfigModule } from '@nestjs/config';
import { StudentsModule } from 'src/students/students.module';

@Module({
  imports: [ConfigModule, StudentsModule],
  controllers: [SimulationController],
  providers: [SimulationService],
  exports: [SimulationService],
})
export class SimulationModule {}
