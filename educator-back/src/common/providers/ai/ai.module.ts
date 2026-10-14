import { Global, Module } from '@nestjs/common';
import { AiGateway } from '../../interfaces/ai-gateway.interface';
import { AiGatewayFactory } from './ai-gateway.factory';
import { OpenAiGateway } from './openai.gateway';
import { StaticAiGateway } from './static.gateway';

/** Global: both Nest apps (root and StudentBackend) share one AI gateway (ADR-0012). */
@Global()
@Module({
  providers: [
    OpenAiGateway,
    StaticAiGateway,
    AiGatewayFactory,
    {
      provide: AiGateway,
      useFactory: (factory: AiGatewayFactory): AiGateway => factory.create(),
      inject: [AiGatewayFactory],
    },
  ],
  exports: [AiGateway],
})
export class AiModule { }
