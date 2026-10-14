import { Module } from '@nestjs/common';

import { ScenariosController } from './scenarios.controller';
import { ScenariosService } from './scenarios.service';
import { SimulationModule } from 'src/simulation/simulation.module';
import { VoiceProfilesModule } from 'src/voice-profiles/voice-profiles.module';

@Module({
  imports: [SimulationModule, VoiceProfilesModule],
  controllers: [ScenariosController],
  providers: [ScenariosService],
  exports: [ScenariosService],
})
export class ScenariosModule {}
