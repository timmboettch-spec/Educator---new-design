import { Injectable } from '@nestjs/common';

import { AiGateway } from '../../../../common/interfaces';
import { LoggerService } from '../../../../common/services';
import { type PatientContext } from '../../../../common/interfaces/patient-context.interface';

/** Maximum number of tokens the conversation AI may return per response. */
const CONVERSATION_AI_MAX_TOKENS = 150;
/** Generation temperature for conversational responses (more creative than evaluation calls). */
const CONVERSATION_AI_TEMPERATURE = 0.7;

/**
 * AI Provider for generating realistic conversation responses
 * Currently only supports OpenAI
 */
@Injectable()
export class AIResponseProvider {
  constructor(
    private readonly aiGateway: AiGateway,
    private readonly logger: LoggerService,
  ) { }

  async generateResponse(
    studentText: string,
    patientContext: PatientContext,
  ): Promise<string | null> {
    if (!this.aiGateway.isConfigured()) {
      return null;
    }

    try {
      const prompt = this.buildPrompt(studentText, patientContext);
      return await this.aiGateway.complete({
        caller: 'conversation.patient-response',
        messages: prompt,
        maxTokens: CONVERSATION_AI_MAX_TOKENS,
        temperature: CONVERSATION_AI_TEMPERATURE,
      });
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
}
