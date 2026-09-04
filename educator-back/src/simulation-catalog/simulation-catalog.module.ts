import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SimulationCatalog } from './entity/simulation-catalog.entity';
import { EducatorSimulation } from 'src/educator-simulations/entity/educator-simulation.entity';
import { EducatorSimulationsModule } from 'src/educator-simulations/educator-simulations.module';
import { SimulationCatalogService } from './simulation-catalog.service';
import { SimulationCatalogController } from './simulation-catalog.controller';
import { AzureBlobService } from 'src/common/utils/azure-blob.service';
import { ConfigModule } from '@nestjs/config';
import { SimulationsModule } from '../simulations/simulations.module';
import { EducatorsModule } from 'src/educators/educators.module';
import { StudentsModule } from 'src/students/students.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SimulationCatalog, EducatorSimulation]),
    ConfigModule,
    forwardRef(() => SimulationsModule),
    forwardRef(() => EducatorSimulationsModule),
    EducatorsModule,
    StudentsModule,
  ],
  controllers: [SimulationCatalogController],
  providers: [SimulationCatalogService, AzureBlobService],
})
export class SimulationCatalogModule {}
