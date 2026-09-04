import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClassSimulation } from './entity/class-simulation.entity';
import { Simulation } from 'src/simulations/entity/simulation.entity';
import { ClassSimulationService } from './class-simulation.service';
import { ClassSimulationController } from './class-simulation.controller';
import { Class } from 'src/class/entity/class.entity';
import { EducatorsModule } from 'src/educators/educators.module';

@Module({
  imports: [TypeOrmModule.forFeature([ClassSimulation, Class, Simulation]), EducatorsModule],
  controllers: [ClassSimulationController],
  providers: [ClassSimulationService],
  exports: [ClassSimulationService],
})
export class ClassSimulationsModule {}
