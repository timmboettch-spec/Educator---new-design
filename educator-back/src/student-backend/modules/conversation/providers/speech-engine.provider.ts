/* eslint-disable @typescript-eslint/require-await -- Phase 2 stubs */
import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { type ConversationProvider, type PatientContext } from './conversation-provider.interface';

/**
 * Speech Engine Provider for Phase 2
 * This provider handles speech-to-speech conversation via speech engines
 * Configuration is entirely environment-driven - no code changes needed
 *
 * When ready for Phase 2:
 * 1. Set CONVERSATION_PROVIDER=speech-engine in .env
 * 2. Configure SPEECH_ENGINE_PROVIDER (e.g., 'openai-whisper', 'google-speech', 'azure-speech')
 * 3. Provide SPEECH_ENGINE_API_KEY and other required config
 * 4. The provider will handle the entire speech-to-speech flow
 */
@Injectable()
export class SpeechEngineProvider implements ConversationProvider {
  private readonly logger = new Logger(SpeechEngineProvider.name);
  private readonly engineType: string;
  private readonly apiKey?: string;
  private readonly apiUrl?: string;
  private readonly model?: string;
  private readonly language?: string;

  constructor(
    private httpService: HttpService,
    private configService: ConfigService,
  ) {
    // All configuration from environment - ready for Phase 2
    this.engineType = this.configService.get<string>('SPEECH_ENGINE_PROVIDER', 'openai-whisper');
    this.apiKey = this.configService.get<string>('SPEECH_ENGINE_API_KEY');
    this.apiUrl = this.configService.get<string>('SPEECH_ENGINE_API_URL');
    this.model = this.configService.get<string>('SPEECH_ENGINE_MODEL');
    this.language = this.configService.get<string>('SPEECH_ENGINE_LANGUAGE', 'en-US');

    this.logger.log(`Speech Engine Provider initialized: ${this.engineType} (Phase 2 ready)`);
  }

  /**
   * Generate response via speech engine
   * For Phase 2, this will handle:
   * 1. Speech-to-text conversion of student input
   * 2. AI processing with context
   * 3. Text-to-speech for patient response
   *
   * Currently returns null (not active) - ready for Phase 2 implementation
   */
  async generateResponse(
    _studentText: string,
    _patientContext: PatientContext,
  ): Promise<string | null> {
    // Phase 2 implementation will go here
    // For now, this provider is configured but inactive
    // When Phase 2 is ready:
    // 1. Set CONVERSATION_PROVIDER=speech-engine
    // 2. Implement speech-to-text processing
    // 3. Implement AI response generation with patient context
    // 4. Implement text-to-speech response

    this.logger.log('Speech Engine Provider called (Phase 2 - not yet active)');
    return null; // Return null to use fallback until Phase 2 is implemented
  }

  /**
   * Process speech input and return text
   * To be implemented in Phase 2
   */
  private async speechToText(_audioData: Buffer): Promise<string> {
    // Phase 2: Implement speech-to-text conversion
    // Will use configured speech engine (Whisper, Google Speech, Azure, etc.)
    throw new Error('Speech-to-text not yet implemented - Phase 2');
  }

  /**
   * Generate response text using AI with patient context
   * Can reuse AI provider logic or use speech-engine-specific AI
   */
  private async generateAIResponse(_text: string, _context: PatientContext): Promise<string> {
    // Phase 2: Generate AI response with full conversation context
    throw new Error('AI response generation for speech engine not yet implemented - Phase 2');
  }

  /**
   * Convert text response to speech
   * To be implemented in Phase 2
   */
  private async textToSpeech(_text: string): Promise<Buffer> {
    // Phase 2: Implement text-to-speech conversion
    // Will use configured TTS engine
    throw new Error('Text-to-speech not yet implemented - Phase 2');
  }
}
