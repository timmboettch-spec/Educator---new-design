import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';

import { ScenarioAuthGuard } from '../../guards/scenario-auth.guard';

import { ConversationService } from './conversation.service';

@ApiTags('Student-backend: Conversation')
@ApiBearerAuth()
@UseGuards(ScenarioAuthGuard)
@Controller('conversation')
export class ConversationController {
  constructor(private conversationService: ConversationService) {}

  @Get('config')
  @ApiOperation({
    summary: 'Get language and voice configuration',
    description: 'Returns available languages and voices for speech synthesis',
  })
  @ApiResponse({
    status: 200,
    description: 'Configuration retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        langs: { type: 'array', items: { type: 'string' } },
        voices: { type: 'object' },
      },
    },
  })
  getConfig() {
    return {
      langs: ['en-US', 'en-GB', 'es-ES', 'fr-FR', 'de-DE'],
      voices: {
        'en-US': ['Google US English', 'Microsoft David', 'Microsoft Zira'],
        'en-GB': ['Google UK English Female', 'Google UK English Male'],
        'es-ES': ['Google español', 'Microsoft Helena'],
        'fr-FR': ['Google français', 'Microsoft Hortense'],
        'de-DE': ['Google Deutsch', 'Microsoft Hedda'],
      },
    };
  }
}
