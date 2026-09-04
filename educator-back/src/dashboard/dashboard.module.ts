import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Schools } from '../schools/entity/schools.entity';
import { Educator } from '../educators/entity/educator.entity';
import { Class } from '../class/entity/class.entity';
import { Student } from '../students/entity/students.entity';
import { ClassSimulation } from '../class-simulations/entity/class-simulation.entity';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Schools, Educator, Class, Student, ClassSimulation])],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
