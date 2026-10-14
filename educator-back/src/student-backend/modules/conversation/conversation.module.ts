import { Module } from '@nestjs/common';

import { ConversationController } from './conversation.controller';
import { ConversationService } from './conversation.service';
import { AIResponseProvider } from './providers/ai.provider';

@Module({
  controllers: [ConversationController],
  providers: [ConversationService, AIResponseProvider],
  exports: [ConversationService],
})
export class ConversationModule { }
