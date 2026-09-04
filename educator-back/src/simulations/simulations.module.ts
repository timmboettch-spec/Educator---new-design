import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Simulation } from './entity/simulation.entity';
import { SimulationsService } from './simulations.service';
import { SimulationsController } from './simulations.controller';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [TypeOrmModule.forFeature([Simulation]), ConfigModule],
  controllers: [SimulationsController],
  providers: [SimulationsService],
  exports: [SimulationsService],
})
export class SimulationsModule {}
