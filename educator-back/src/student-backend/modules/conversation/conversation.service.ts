import { BlobServiceClient, type ContainerClient } from '@azure/storage-blob';
import { Injectable, Logger } from '@nestjs/common';

import { JsonDataService, type Scenario } from '../../data/json-data.service';

// --- Keyword scoring weight constants --------------------------------------
/** Score multiplier per word for an exact phrase match (highest priority). */
const KEYWORD_SCORE_EXACT_PHRASE_MULTIPLIER = 5;
/** Score multiplier per word when all words in a multi-word phrase match. */
const KEYWORD_SCORE_ALL_WORDS_MULTIPLIER = 3;
/** Score added for each individual word match. */
const KEYWORD_SCORE_INDIVIDUAL_WORD = 2;
/** Maximum character length of text classified as a short acknowledgment. */
const SHORT_ACKNOWLEDGMENT_MAX_LENGTH = 10;

import {
  type ConversationProvider,
  type PatientContext,
} from './providers/conversation-provider.interface';
import { ConversationProviderFactory } from './providers/provider.factory';
import { StaticResponseProvider } from './providers/static.provider';

type ScenarioPhase = NonNullable<Scenario['phases']>[number];
type ScenarioTask = NonNullable<ScenarioPhase['tasks']>[number];

interface ConversationPattern {
  keywords: string[];
  response: string;
  weight?: number;
}

interface ScenarioConversation {
  [category: string]: ConversationPattern[];
}

interface CommonConversation {
  greetings: ConversationPattern[];
  general: ConversationPattern[];
  questions: ConversationPattern[];
  responses: ConversationPattern[];
  fallback: string[];
}

@Injectable()
export class ConversationService {
  private readonly logger = new Logger(ConversationService.name);
  private commonResponses!: CommonConversation;
  private scenarioResponses: Map<string, ScenarioConversation> = new Map();
  private provider: ConversationProvider;
  private fallbackProvider: StaticResponseProvider;

  private readonly azureConnectionString = process.env.AZURE_STORAGE_CONNECTION_STRING ?? '';
  private readonly blobContainerName =
    process.env.AZURE_BLOB_CONTAINER_NAME ??
    process.env.AZURE_STORAGE_CONTAINER_NAME ??
    'json-data';
  private readonly blobPrefix = process.env.AZURE_BLOB_PREFIX ?? '';
  private readonly azureEnabled = this.azureConnectionString.trim().length > 0;

  private containerClient?: ContainerClient;
  private commonResponsesLoadPromise: Promise<void>;

  constructor(
    private jsonDataService: JsonDataService,
    private providerFactory: ConversationProviderFactory,
  ) {
    if (this.azureEnabled) {
      const blobServiceClient = BlobServiceClient.fromConnectionString(this.azureConnectionString);
      this.containerClient = blobServiceClient.getContainerClient(this.blobContainerName);
    }

    // Load common responses asynchronously; awaited on first request.
    this.commonResponsesLoadPromise = this.loadCommonResponses();

    // Create primary provider from factory (environment-driven)
    this.provider = this.providerFactory.createProvider();

    // Always have static provider as fallback
    this.fallbackProvider = new StaticResponseProvider();

    this.logger.log('ConversationService initialized with provider pattern');
  }

  private async loadCommonResponses(): Promise<void> {
    try {
      if (!this.containerClient) {
        this.commonResponses = this.getDefaultCommonResponses();
        return;
      }

      await this.containerClient.createIfNotExists();
      const blobName = this.blobPrefix
        ? `${this.blobPrefix.replace(/^\/+|\/+$/g, '')}/conversation-responses.json`
        : 'conversation-responses.json';
      const blobClient = this.containerClient.getBlockBlobClient(blobName);
      const buffer = await blobClient.downloadToBuffer();

      this.commonResponses = JSON.parse(buffer.toString('utf-8')) as CommonConversation;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error loading common responses: ${message}`);
      // Fallback to default responses
      this.commonResponses = this.getDefaultCommonResponses();
    }
  }

  async generateResponse(
    studentText: string,
    scenarioId: string,
  ): Promise<{ text: string; category?: string }> {
    // Ensure common responses are loaded before use.
    await this.commonResponsesLoadPromise;

    // Build patient context from scenario
    const scenario = this.jsonDataService.getScenarioById(scenarioId);
    if (!scenario) {
      return {
        text: "I'm sorry, I couldn't find the scenario information.",
        category: 'error',
      };
    }

    const patientData = scenario.patientData;
    const phases: ScenarioPhase[] = scenario.phases ?? [];

    // Build comprehensive patient context from scenario JSON
    // Extract ALL data according to CSV structure for complete AI knowledge base
    const patientContext: PatientContext = {
      scenarioId,
      scenarioTitle: scenario.title,
      scenarioDescription: scenario.description,
      learningObjectives: scenario.learningObjective,

      // Basic patient information
      patientName: patientData.name ?? patientData.preferredName,
      patientAge: patientData.age,
      patientGender: patientData.gender,
      patientWeight: patientData.weight ?? patientData.vitals?.weight,
      chiefComplaint: patientData.chiefComplaint,
      medicalHistory: patientData.medicalHistory,
      allergies: patientData.allergies,
      conversationHistory: [],

      // Additional patient context
      presentingNote: patientData.presentingNote,
      occupation: patientData.occupation,
      dateOfBirth: patientData.dateOfBirth,

      // Extract immunization history
      immunizationHistory:
        patientData.immunizationHistory && Array.isArray(patientData.immunizationHistory)
          ? patientData.immunizationHistory.join(', ')
          : undefined,

      // Extract social history
      socialHistory: patientData.socialHistory,

      // Extract available medications (from CSV structure)
      availableMedications: scenario.availableMedications ?? [],

      // Extract available tests/actions
      availableTests:
        scenario.expectedActions?.labs?.concat(
          scenario.expectedActions.imaging ?? [],
          scenario.expectedActions.physicalExam ?? [],
          scenario.expectedActions.medications ?? [],
        ) ?? [],

      // Extract phases with complete information (from CSV structure)
      phases: phases.map((phase) => ({
        id: phase.id,
        name: phase.name,
        description: phase.description,
        avatarDescription: phase.avatarDescription,

        // Vitals per phase
        vitals: phase.vitals
          ? {
              heartRate: phase.vitals.heartRate,
              ecgWaveform: phase.vitals.ecgWaveform,
              systolicBP: phase.vitals.systolicBP ?? phase.vitals.bloodPressure?.split('/')[0],
              diastolicBP: phase.vitals.diastolicBP ?? phase.vitals.bloodPressure?.split('/')[1],
              spO2: phase.vitals.spO2,
              respirationRate: phase.vitals.respiratoryRate ?? phase.vitals.respirationRate,
              respirationQuality: phase.vitals.respirationQuality,
              pulseQuality: {
                carotid: phase.vitals.pulseQuality?.carotid,
                radial: phase.vitals.pulseQuality?.radial,
                brachial: phase.vitals.pulseQuality?.brachial,
                pedal: phase.vitals.pulseQuality?.pedal,
              },
              temperature: {
                oral: phase.vitals.temperature?.oral,
                forehead: phase.vitals.temperature?.forehead,
                rectal: phase.vitals.temperature?.rectal,
              },
            }
          : undefined,

        // SAMPLE history per phase (with Text and Audio)
        sampleHistory: phase.sampleHistory
          ? {
              signsAndSymptoms: phase.sampleHistory.signsAndSymptoms,
              allergies: phase.sampleHistory.allergies,
              medications: phase.sampleHistory.medications,
              pastMedicalHistory: phase.sampleHistory.pastMedicalHistory,
              lastOralIntake: phase.sampleHistory.lastOralIntake,
              eventsLeadingUp: phase.sampleHistory.eventsLeadingUp,
            }
          : undefined,

        // Sounds per phase
        sounds: phase.sounds,

        // Checklist items per phase
        checklist:
          phase.tasks?.map((task: ScenarioTask) => ({
            text: task.label,
            autoAssessable: task.autoAssessable,
          })) ?? [],
      })),
    };

    // Set current phase (use first phase if available, or find by phase ID if provided)
    // For now, use first phase as current - this could be enhanced to track current phase
    if (patientContext.phases && patientContext.phases.length > 0) {
      patientContext.currentPhase = patientContext.phases[0];

      // Extract current phase SAMPLE history for easy access (legacy support)
      const currentSample = patientContext.currentPhase.sampleHistory;
      if (currentSample) {
        patientContext.signsAndSymptoms = currentSample.signsAndSymptoms?.text;
        patientContext.eventsLeadingUp = currentSample.eventsLeadingUp?.text;
        patientContext.lastOralIntake = currentSample.lastOralIntake?.text;
        patientContext.currentMedications = currentSample.medications?.text;

        // Store audio responses for AI reference
        patientContext.sampleAudioResponses = {
          signsAndSymptoms: currentSample.signsAndSymptoms?.audio,
          allergies: currentSample.allergies?.audio,
          medications: currentSample.medications?.audio,
          medicalHistory: currentSample.pastMedicalHistory?.audio,
          lastOralIntake: currentSample.lastOralIntake?.audio,
          eventsLeadingUp: currentSample.eventsLeadingUp?.audio,
        };
      }
    }

    // Legacy SAMPLE history support (if not in phases)
    if (!patientContext.currentPhase?.sampleHistory && patientData.sampleHistory) {
      const sample = patientData.sampleHistory;
      patientContext.signsAndSymptoms = sample.signsAndSymptoms;
      patientContext.currentMedications = sample.medications;
      patientContext.lastOralIntake = sample.lastOralIntake;
      patientContext.eventsLeadingUp = sample.eventsLeadingUp;
      if (sample.audioResponses) {
        patientContext.sampleAudioResponses = sample.audioResponses;
      }
    }

    // Also check for currentMedications directly (if not in SAMPLE)
    if (
      !patientContext.currentMedications &&
      patientData.currentMedications &&
      Array.isArray(patientData.currentMedications)
    ) {
      patientContext.currentMedications = patientData.currentMedications.join(', ');
    }

    // Try primary provider (AI, Speech Engine, etc. - configured via env)
    // AI uses scenario context from JSON to understand and respond naturally
    try {
      const response = await this.provider.generateResponse(studentText, patientContext);
      if (response && response.trim().length > 0) {
        this.logger.log(`AI generated natural response: "${response.trim().substring(0, 80)}..."`);
        return { text: response.trim(), category: 'ai-generated' };
      } else {
        // AI provider returned null (likely no API key) - will use static fallback
        this.logger.log(`AI provider returned no response (likely missing API key)`);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`AI provider error: ${message}`);
    }

    // Fallback to static responses (improved keyword matching)
    // Only reached if AI is not configured or fails
    const lowerText = studentText.toLowerCase().trim();

    this.logger.log(`Using static keyword matching for: "${studentText}"`);
    this.logger.debug(`Enable AI for natural responses: Add AI_API_KEY to .env`);

    // Try scenario-specific responses first (higher priority, more contextual)
    const scenarioResponse = this.findScenarioResponse(lowerText, scenarioId);
    if (scenarioResponse) {
      this.logger.log(`Matched scenario response: ${scenarioResponse.category}`);
      return scenarioResponse;
    }

    // Try common responses
    const commonResponse = this.findCommonResponse(lowerText);
    if (commonResponse) {
      this.logger.log(`Matched common response: ${commonResponse.category}`);
      return commonResponse;
    }

    // Final fallback - intelligent fallback based on question type
    const fallbackResponse = this.getFallbackResponse(lowerText);
    this.logger.log(`Using intelligent fallback response`);
    return {
      text: fallbackResponse,
      category: 'fallback',
    };
  }

  // ============================================================
  // STATIC RESPONSE METHODS (Fallback)
  // ============================================================
  // These methods are used when the primary provider fails
  // or when CONVERSATION_PROVIDER=static
  // All AI logic has been moved to providers/ directory

  private findScenarioResponse(
    text: string,
    scenarioId: string,
  ): { text: string; category?: string } | null {
    let scenario = this.scenarioResponses.get(scenarioId);
    if (!scenario) {
      // Lazy-load per-scenario conversation responses from the cached scenario JSON.
      const scenarioObj = this.jsonDataService.getScenarioById(scenarioId);
      scenario = scenarioObj?.conversationResponses;
      if (scenario) {
        this.scenarioResponses.set(scenarioId, scenario);
      } else {
        return null;
      }
    }

    // Find best matching response by checking all categories
    let bestMatch: { text: string; category: string; score: number } | null = null;

    for (const [category, patterns] of Object.entries(scenario)) {
      for (const pattern of patterns) {
        const matchScore = this.calculateMatchScore(text, pattern.keywords);
        const weight = pattern.weight ?? 1;
        const totalScore = matchScore * weight;

        if (totalScore > 0 && (!bestMatch || totalScore > bestMatch.score)) {
          bestMatch = {
            text: pattern.response,
            category: category,
            score: totalScore,
          };
        }
      }
    }

    return bestMatch ? { text: bestMatch.text, category: bestMatch.category } : null;
  }

  private findCommonResponse(text: string): { text: string; category?: string } | null {
    // Find best match across all categories
    let bestMatch: { text: string; category: string; score: number } | null = null;
    const categories = [
      { name: 'greetings', patterns: this.commonResponses.greetings },
      { name: 'general', patterns: this.commonResponses.general },
      { name: 'questions', patterns: this.commonResponses.questions },
      { name: 'responses', patterns: this.commonResponses.responses },
    ];

    for (const category of categories) {
      for (const pattern of category.patterns) {
        const matchScore = this.calculateMatchScore(text, pattern.keywords);
        const weight = pattern.weight ?? 1;
        const totalScore = matchScore * weight;

        if (totalScore > 0 && (!bestMatch || totalScore > bestMatch.score)) {
          bestMatch = {
            text: pattern.response,
            category: category.name,
            score: totalScore,
          };
        }
      }
    }

    return bestMatch ? { text: bestMatch.text, category: bestMatch.category } : null;
  }

  private calculateMatchScore(text: string, keywords: string[]): number {
    if (!keywords || keywords.length === 0) {
      return 0;
    }

    let score = 0;
    const words = text.split(/\s+/).map((w) => w.toLowerCase().replace(/[.,!?]/g, ''));
    const lowerText = text.toLowerCase();

    // Check each keyword
    for (const keyword of keywords) {
      const lowerKeyword = keyword.toLowerCase().trim();
      if (!lowerKeyword) {
        continue;
      }

      const keywordWords = lowerKeyword.split(/\s+/);

      // Exact phrase match (highest priority)
      if (lowerText.includes(lowerKeyword)) {
        // Longer phrases get higher score
        score += keywordWords.length * KEYWORD_SCORE_EXACT_PHRASE_MULTIPLIER;
        continue;
      }

      // All words in phrase match (high score)
      const allWordsMatch = keywordWords.every((kw) =>
        words.some((w) => w === kw || w.includes(kw) || kw.includes(w)),
      );
      if (allWordsMatch && keywordWords.length > 1) {
        score += keywordWords.length * KEYWORD_SCORE_ALL_WORDS_MULTIPLIER;
        continue;
      }

      // Individual word matches
      for (const kw of keywordWords) {
        if (
          words.some((w) => {
            // Exact word match
            if (w === kw) {
              return true;
            }
            // Word contains keyword or vice versa
            if (w.includes(kw) || kw.includes(w)) {
              return true;
            }
            // Common variations
            if (
              (w === 'vaccine' && kw === 'vaccination') ||
              (w === 'vaccination' && kw === 'vaccine')
            ) {
              return true;
            }
            if (
              (w === 'allergy' && kw === 'allergies') ||
              (w === 'allergies' && kw === 'allergy')
            ) {
              return true;
            }
            return false;
          })
        ) {
          score += KEYWORD_SCORE_INDIVIDUAL_WORD; // Individual word matches
        }
      }
    }

    return score;
  }

  private getFallbackResponse(text: string): string {
    const fallbacks = this.commonResponses.fallback ?? [];

    // If text is a question, respond appropriately
    const isQuestion =
      text.includes('?') ||
      /^(what|how|when|where|why|who|can|could|would|should|do|does|did|is|are|will)/i.test(text);

    if (isQuestion) {
      // Try to understand the question type for better response
      if (/name|who are you|identity/i.test(text)) {
        return "I'm here as a patient for this simulation. Can you check my chart?";
      }
      if (/age|old|born|birthday|dob/i.test(text)) {
        return 'You can find my date of birth on my ID or in the chart.';
      }
      if (/allerg|reaction/i.test(text)) {
        return "I don't have any known allergies, but please check my chart to be sure.";
      }
      if (/vaccine|immunization|shot|injection/i.test(text)) {
        return "I'm here for travel immunizations. What do you need to know?";
      }
      if (/feel|pain|hurt|symptom|problem/i.test(text)) {
        return 'I feel fine, just here for my scheduled appointment.';
      }
      return fallbacks[0] ?? "I'm not sure how to answer that. Could you rephrase your question?";
    }

    // If text is short/acknowledgment
    if (
      text.length < SHORT_ACKNOWLEDGMENT_MAX_LENGTH ||
      /^(yes|yeah|ok|okay|sure|alright|yep|nope|no)$/i.test(text)
    ) {
      if (/^no/i.test(text)) {
        return "No, that's not correct.";
      }
      return fallbacks[1] ?? 'Okay, I understand.';
    }

    // If it's a statement/declaration
    if (/^(i|i'm|i've|i'll|i'd)/i.test(text)) {
      return 'I see. Please continue.';
    }

    // Default fallback - acknowledge what they said
    return fallbacks[2] ?? 'I understand. Please continue with your questions.';
  }

  private getDefaultCommonResponses(): CommonConversation {
    return {
      greetings: [
        {
          keywords: ['hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening'],
          response: "Hello, I'm Ryan Taylor. How can I help you today?",
        },
      ],
      general: [
        {
          keywords: ['how are you', 'how do you feel', 'how is it going'],
          response: "I'm doing okay, thank you for asking.",
        },
      ],
      questions: [
        {
          keywords: ['what', 'who', 'when', 'where'],
          response: 'Let me think about that for a moment.',
        },
      ],
      responses: [
        {
          keywords: ['yes', 'yeah', 'sure', 'okay', 'ok'],
          response: 'Okay, I understand.',
        },
      ],
      fallback: [
        "I'm not sure how to answer that. Could you rephrase?",
        'I see. Please continue.',
        'Could you tell me more about that?',
      ],
    };
  }
}
