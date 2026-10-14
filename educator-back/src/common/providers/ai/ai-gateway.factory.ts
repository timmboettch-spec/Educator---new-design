import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiConstants, AiProvider } from '../../constants/ai.constants';
import { type AiGateway } from '../../interfaces/ai-gateway.interface';
import { LoggerService } from '../../services/logger.service';
import { OpenAiGateway } from './openai.gateway';
import { StaticAiGateway } from './static.gateway';

/**
 * Picks the `AiGateway` implementation from `AI_PROVIDER` (ADR-0012). Backs the `AiGateway`
 * token, so the choice is made once at startup. Add a provider here and in `AiProvider`.
 */
@Injectable()
export class AiGatewayFactory {
  constructor(
    private readonly configService: ConfigService,
    private readonly openAiGateway: OpenAiGateway,
    private readonly staticGateway: StaticAiGateway,
    private readonly logger: LoggerService,
  ) { }

  create(): AiGateway {
    const provider = (this.configService.get<string>('ai.provider')?.trim().toLowerCase() ||
      AiConstants.DEFAULT_PROVIDER) as AiProvider;

    switch (provider) {
      case AiProvider.OpenAi:
        this.logger.log(`Using AI gateway: ${provider}`);
        if (!this.openAiGateway.isConfigured()) {
          this.logger.warn('No OpenAI API key provided - AI callers will use their fallbacks');
        }
        return this.openAiGateway;
      case AiProvider.Static:
        this.logger.log(`Using AI gateway: ${provider} (canned responses, local use only)`);
        return this.staticGateway;
      default:
        throw new Error(
          `Unsupported AI_PROVIDER "${String(provider)}". Supported: ${Object.values(AiProvider).join(', ')}`,
        );
    }
  }
}
