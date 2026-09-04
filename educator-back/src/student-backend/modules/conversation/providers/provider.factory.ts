import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AIResponseProvider } from './ai.provider';
import { type ConversationProvider } from './conversation-provider.interface';
import { SpeechEngineProvider } from './speech-engine.provider';
import { StaticResponseProvider } from './static.provider';

/**
 * Provider Factory
 * Creates conversation providers based on environment configuration
 */
@Injectable()
export class ConversationProviderFactory {
  private readonly logger = new Logger(ConversationProviderFactory.name);

  constructor(
    private configService: ConfigService,
    private httpService: HttpService,
  ) {}

  createProvider(): ConversationProvider {
    const providerType = this.configService
      .get<string>('CONVERSATION_PROVIDER', 'ai')
      .toLowerCase();

    const apiKey = this.configService.get<string>('OPENAI_API_KEY');

    switch (providerType) {
      case 'static':
        return new StaticResponseProvider();

      case 'speech-engine':
      case 'speechengine':
        return new SpeechEngineProvider(this.httpService, this.configService);

      case 'ai':
      default:
        this.logger.log(`Using AI provider (OpenAI)`);
        if (!apiKey) {
          this.logger.warn(
            'No OpenAI API key provided - AI will attempt but fallback to static if unavailable',
          );
        }
        return new AIResponseProvider(this.httpService, this.configService);
    }
  }
}
