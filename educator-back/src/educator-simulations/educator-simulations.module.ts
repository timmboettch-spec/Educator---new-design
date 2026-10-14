import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { EducatorSimulationsService } from './educator-simulations.service';
import { EducatorSimulationsController } from './educator-simulations.controller';
import { EducatorSimulationPreviewsService } from './educator-simulation-previews.service';
import { EducatorSimulationPreviewsController } from './educator-simulation-previews.controller';

@Module({
  imports: [ConfigModule],
  controllers: [EducatorSimulationsController, EducatorSimulationPreviewsController],
  providers: [EducatorSimulationsService, EducatorSimulationPreviewsService],
  exports: [EducatorSimulationsService],
})
export class EducatorSimulationsModule {}
