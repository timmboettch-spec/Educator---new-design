import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

import { type ConversationProvider, type PatientContext } from './conversation-provider.interface';

/** Maximum number of tokens the conversation AI may return per response. */
const CONVERSATION_AI_MAX_TOKENS = 150;
/** Generation temperature for conversational responses (more creative than evaluation calls). */
const CONVERSATION_AI_TEMPERATURE = 0.7;
/** Request timeout (ms) for conversation AI HTTP calls. */
const CONVERSATION_AI_REQUEST_TIMEOUT_MS = 10_000;

interface OpenAIChatResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

/**
 * AI Provider for generating realistic conversation responses
 * Currently only supports OpenAI
 */
@Injectable()
export class AIResponseProvider implements ConversationProvider {
  private readonly logger = new Logger(AIResponseProvider.name);
  private readonly apiKey?: string;
  private readonly model?: string;

  constructor(
    private httpService: HttpService,
    private configService: ConfigService,
  ) {
    this.apiKey = this.configService.get<string>('OPENAI_API_KEY');
    this.model = this.configService.get<string>('AI_MODEL', 'gpt-4o');

    if (
      this.apiKey &&
      (this.apiKey.trim().length === 0 || this.apiKey === 'undefined' || this.apiKey === 'null')
    ) {
      this.apiKey = undefined;
    }
  }

  async generateResponse(
    studentText: string,
    patientContext: PatientContext,
  ): Promise<string | null> {
    if (!this.apiKey) {
      return null;
    }

    try {
      const prompt = this.buildPrompt(studentText, patientContext);
      return await this.generateWithOpenAI(prompt);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`AI generation failed: ${message}`);
      return null;
    }
  }

  private buildPrompt(studentText: string, context: PatientContext): string {
    const contextParts: string[] = [];

    if (context.scenarioDescription) {
      contextParts.push(`Scenario: ${context.scenarioDescription}`);
    }
    if (context.patientName) {
      contextParts.push(`My name is ${context.patientName}`);
    }
    if (context.patientAge) {
      contextParts.push(`I'm ${context.patientAge} years old`);
    }
    if (context.chiefComplaint) {
      contextParts.push(`I'm here because: ${context.chiefComplaint}`);
    }
    if (context.medicalHistory) {
      contextParts.push(`My medical history: ${context.medicalHistory}`);
    }
    if (context.allergies) {
      contextParts.push(`Allergies: ${context.allergies}`);
    }
    if (context.currentMedications) {
      contextParts.push(`Current medications: ${context.currentMedications}`);
    }

    const fullContext =
      contextParts.length > 0
        ? contextParts.join('. ')
        : 'You are a patient in a healthcare setting';

    return `You are a patient. ${fullContext}
A healthcare student just asked: "${studentText}"
Answer ONLY what they asked, in a natural, conversational way. Keep it to 1-2 short sentences.`;
  }

  private async generateWithOpenAI(prompt: string): Promise<string | null> {
    const url = 'https://api.openai.com/v1/chat/completions';

    try {
      const response = await firstValueFrom(
        this.httpService.post<OpenAIChatResponse>(
          url,
          {
            model: this.model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: CONVERSATION_AI_MAX_TOKENS,
            temperature: CONVERSATION_AI_TEMPERATURE,
          },
          {
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
            },
            timeout: CONVERSATION_AI_REQUEST_TIMEOUT_MS,
          },
        ),
      );

      return response.data.choices?.[0]?.message?.content?.trim() ?? null;
    } catch (error: unknown) {
      const errWithResp = error as {
        response?: { data?: unknown };
        message?: string;
      };
      const detail = errWithResp.response?.data ?? errWithResp.message ?? String(error);
      this.logger.error(`OpenAI API error: ${JSON.stringify(detail)}`);
      return null;
    }
  }
}
