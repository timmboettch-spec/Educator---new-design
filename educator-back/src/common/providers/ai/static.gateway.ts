import { Injectable } from '@nestjs/common';
import { AiGateway, type AiCompletionRequest } from '../../interfaces/ai-gateway.interface';

/** Canned reply returned for every text completion. */
const STATIC_AI_RESPONSE =
  'This is a static response from the local AI gateway. Set AI_PROVIDER=openai to use a real model.';

/**
 * Canned JSON returned for every JSON completion. A neutral superset of the shapes the report
 * graders parse (`ai-evaluation.interface.ts`): no matches, no concept results, no occurrences.
 */
const STATIC_AI_JSON = {
  match: false,
  confidence: 0,
  explanation: 'Static AI response (local use only).',
  route: { match: false, confidence: 0, explanation: 'Static AI response.' },
  site: { match: false, confidence: 0, explanation: 'Static AI response.' },
  results: [],
  evaluations: {},
};

/** Offline `AiGateway` for local development: no API key and no network. */
@Injectable()
export class StaticAiGateway implements AiGateway {
  complete(_request: AiCompletionRequest): Promise<string> {
    return Promise.resolve(STATIC_AI_RESPONSE);
  }

  completeJson<T>(_request: AiCompletionRequest): Promise<T> {
    return Promise.resolve(structuredClone(STATIC_AI_JSON) as T);
  }

  isConfigured(): boolean {
    return true;
  }
}
