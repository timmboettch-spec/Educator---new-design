import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { ConversationController } from './conversation.controller';
import { ConversationService } from './conversation.service';
import { AIResponseProvider } from './providers/ai.provider';
import { ConversationProviderFactory } from './providers/provider.factory';
import { SpeechEngineProvider } from './providers/speech-engine.provider';
import { StaticResponseProvider } from './providers/static.provider';

@Module({
  imports: [HttpModule],
  controllers: [ConversationController],
  providers: [
    ConversationService,
    ConversationProviderFactory,
    StaticResponseProvider,
    AIResponseProvider,
    SpeechEngineProvider,
  ],
  exports: [ConversationService],
})
export class ConversationModule {}
