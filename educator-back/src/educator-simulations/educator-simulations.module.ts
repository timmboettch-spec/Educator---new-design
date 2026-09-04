import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { EducatorSimulation } from './entity/educator-simulation.entity';
import { EducatorSimulationsService } from './educator-simulations.service';
import { EducatorSimulationsController } from './educator-simulations.controller';

@Module({
  imports: [TypeOrmModule.forFeature([EducatorSimulation]), ConfigModule],
  controllers: [EducatorSimulationsController],
  providers: [EducatorSimulationsService],
  exports: [EducatorSimulationsService],
})
export class EducatorSimulationsModule {}
