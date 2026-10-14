import { Module } from '@nestjs/common';
import { VoiceProfilesService } from './voice-profiles.service';
import { VoiceProfilesController } from './voice-profiles.controller';

@Module({
  providers: [VoiceProfilesService],
  controllers: [VoiceProfilesController],
  exports: [VoiceProfilesService],
})
export class VoiceProfilesModule {}
