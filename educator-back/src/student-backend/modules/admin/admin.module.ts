import { Module } from '@nestjs/common';

import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { VoiceProfilesModule } from 'src/voice-profiles/voice-profiles.module';

@Module({
  imports: [VoiceProfilesModule],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
