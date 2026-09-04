/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
import { Global, Injectable, Module, type OnModuleInit } from '@nestjs/common';
import { BlobServiceClient, type ContainerClient } from '@azure/storage-blob';

export interface User {
  id: string;
  name: string;
  email: string;
  password: string;
  role: 'student' | 'instructor' | 'admin';
  createdAt: string;
}

export interface ActionCategory {
  id: string;
  name: string;
  description?: string;
  color?: string;
  scenarioId: string;
  isSystem?: boolean; // true for "Uncategorized" category
}

export interface Action {
  id?: string;
  order: number;
  title: string;
  type?: 'single' | 'ordering' | 'question' | 'vital';
  prompt?: string;
  items: string[];
  correct: string | string[];
  categoryId?: string;
  isExcluded?: boolean;
  isOptional?: boolean;
  typeRequirement?: string;
  vitals?: Record<string, string[] | boolean | undefined>;
  vitalRequirements?: Record<string, 'Mandatory' | 'Optional'>;
  vitalRequirementEntries?: Record<string, Array<'Mandatory' | 'Optional'>>;
  resultMediaType?: 'text' | 'image' | 'pdf' | 'mixed';
  resultName?: string;
  resultContent?: string;
  resultMediaUrl?: string;
  resultMediaName?: string;
  limitType?: 'unlimited' | 'limited';
  maxAttempts?: number;
  description?: string;
  idealResponse?: string;
}

export interface Unit {
  id: string;
  name: string;
  imageUrl: string;
  categories?: string[];
  category?: string;
  completedCount?: number;
  actionGroupName?: string;
  actionGroupDescription?: string;
  actions?: Action[];
}

export interface ProductSetup {
  title?: string;
  description?: string;
  imageUrl?: string;
  steps?: string[];
  checklist?: string[];
  confirmText?: string;
}

export interface MeasurementRow {
  label: string;
  left?: string;
  right?: string;
  value?: string;
}

export interface MeasurementBlock {
  title: string;
  rows: MeasurementRow[];
}

export interface OrthopedicWorksheet {
  demographics?: Record<string, string>;
  subjective?: Record<string, string | string[]>;
  objective?: Record<string, string[]>;
  measurements?: MeasurementBlock[];
  specialTests?: Array<{ name: string; result: string }>;
  keyFindings?: string[];
  locationSpecificInformation?: string;
  simulationFocus?: string[];
}

export interface AIPatientData {
  openingReasonForVisit?: string;
  mainConcernAttributes?: string;
  associatedSymptoms?: string;
  allergies?: string;
  currentMedications?: string;
  diagnosedChronicIllnesses?: string;
  medicalHistory?: string;
  drugs?: string;
  familyMedicalHistory?: string;
  relationshipStatusSexualHealth?: string;
  personalSocialHistory?: string;
  housing?: string;
  transportation?: string;
  occupation?: string;
  diet?: string;
  exercise?: string;
  stress?: string;
  sleep?: string;
  adls?: string;
  emotionalStatePersonality?: string;
  conversationalAttitudeSpeechStyle?: string;
  specialPatientInfo?: string;
  locationSpecificInfo?: string;
  tobacco?: string;
  alcohol?: string;
}

export interface VitalsFieldConfig {
  field: string;
  status:
    | 'Required'
    | 'Optional'
    | 'Within 5 minutes'
    | 'Within 10 minutes'
    | 'Within 15 minutes'
    | 'Within 30 minutes';
}

export interface PatientDataFieldConfig {
  field: string;
  required: boolean;
}

export interface ExpectedActionConfig {
  action: string;
  category: 'labs' | 'imaging' | 'physicalExam' | 'medications' | 'actions';
  required: boolean;
}

export interface MedicationConfig {
  medicationId: string;
  medicationName: string;
  required: boolean;
}

export interface ChecklistItem {
  id: string;
  text: string;
  mandatory?: boolean;
  status?: 'Mandatory' | 'Optional' | 'Exclude';
  order?: number;
}

export interface AIMapping {
  aiCheckId: string;
  aiDescription: string;
  aiPromptParameter: string;
}

export interface CommunicationCriterion {
  id: string;
  title: string;
  prompt: string;
  enabled: boolean;
  order: number;
}

export interface RubricItem {
  id: string;
  name: string;
  categoryType: 'Soft Skill' | 'Technical Skill';
  subCategory: string;
  weight: number;
  scoringModel: 'Binary' | 'Graded';
  required: boolean;
  evaluationSource: 'AI' | 'System Check' | 'Combined';
  aiMapping?: AIMapping;
  description?: string;
  learningObjectiveId?: string;
  patientDataFields?: PatientDataFieldConfig[];
  vitalsFields?: VitalsFieldConfig[];
  expectedActions?: ExpectedActionConfig[];
  medications?: MedicationConfig[];
  checklistItems?: ChecklistItem[];
  communicationCriteria?: CommunicationCriterion[];
  communicationSummaryPrompt?: string;
}

export type SequenceAssessmentMethod = 'questionAsked' | 'patientInformationUpdated';

export interface SequenceTimingAnytime {
  mode: 'anytime';
}

export interface SequenceTimingWithinMinutes {
  mode: 'withinMinutes';
  withinMinutesFromStart: number;
}

export type SequenceTiming = SequenceTimingAnytime | SequenceTimingWithinMinutes;

export interface SequenceRequirement {
  ref: string;
  assessmentMethod?: SequenceAssessmentMethod;
  label?: string;
}

// Individual item with optional timing configuration
export interface SequenceItem {
  id: string; // Reference to the action/item
  timing?: SequenceTiming; // Timing constraint for this specific item
  timingReferenceItem?: string; // Which item to measure timing from
  assessmentMethod?: SequenceAssessmentMethod; // Assessment method for this item
}

export interface SequenceSubgroup {
  id: string;
  label?: string;
  items: (string | SequenceItem)[]; // Items can be simple IDs or objects with timing
  mode: 'strict' | 'flexible'; // Order control within subgroup
  timing?: SequenceTiming; // Legacy: group-level timing constraint
  timingReferenceItem?: string; // Legacy: group-level timing reference
}

export interface SequenceGroupDefinition {
  id: string;
  label?: string;
  items: (string | SequenceItem)[]; // Items can be simple IDs or objects with timing
  mode: 'strict' | 'flexible'; // Order control for subgroups within this group
  subgroups?: SequenceSubgroup[]; // Subgroups within this group
  childOrder?: string[]; // Order of items and subgroups (subgroups prefixed with "subgroup:")
  color?: string;
  timing?: SequenceTiming; // Legacy: group-level timing constraint
  timingReferenceItem?: string; // Legacy: group-level timing reference
}

export interface ScenarioSequenceDefinition {
  parentRef: string;
  parentLabel?: string;
  assessmentMethod?: SequenceAssessmentMethod;
  timing?: SequenceTiming;
  afterTiming?: SequenceTiming;
  orderControl?: 'strict' | 'flexible';
  beforeOrderControl?: 'strict' | 'flexible';
  afterOrderControl?: 'strict' | 'flexible';
  before?: SequenceRequirement[];
  after?: SequenceRequirement[];
  beforeGroups?: SequenceGroupDefinition[];
  afterGroups?: SequenceGroupDefinition[];
}

interface TimelineBlockRecord {
  id?: string;
  sourceId?: string;
  assessmentMethod?: unknown;
  withinMinutesFromStart?: unknown;
  prerequisites?: unknown;
  followups?: unknown;
  relationshipOnly?: unknown;
}

export interface Scenario {
  id: string;
  unitId: string;
  title: string;
  difficulty: string;
  learnerLevel: string;
  department: string;
  description: string;
  learningObjective: string | string[];
  disabled?: boolean;
  status?: 'draft' | 'published' | 'archived';
  parent_scenario_id?: string;
  version_number?: number;
  estimatedDuration?: string;
  topicsAddressed?: string;
  additionalEquipment?: string;
  optionalEquipment?: string;
  setupNotes?: string;
  prebriefScriptPdf?: string;
  /** @deprecated Use prebriefScriptPdf. Preserved until migrate-prebrief-pdf.js has run on all blobs. */
  preBriefPdf?: string;
  debriefPointsPdf?: string;
  setupNotesPdf?: string;
  facilitationNotesPdf?: string;
  printableSbarPdf?: string;
  printablePatientChartPdf?: string;
  scenarioImage?: string;
  enableStudentBriefing?: boolean;
  studentBriefing?: {
    safeEnvironment?: string;
    facilitatorSupport?: string;
    orientationSpace?: string;
    orientationEquipment?: string;
    evaluation?: string;
    rolesExpectations?: string;
    simulationLimitations?: string;
    timeAllotment?: string;
    purpose?: string;
    learningObjectives?: string;
  };
  sbar?: {
    situation?: string;
    background?: string;
    assessment?: string;
    recommendation?: string;
  };

  avatarEnabled?: boolean;
  avatarId?: string;
  contextId?: string;
  requiresProductSetup?: boolean;
  productSetup?: ProductSetup;

  realClinical?: {
    enabled: boolean;
    steps: Array<{
      id: string;
      actionId?: string;
      label?: string;
      activityType?: string;
      order?: number;
    }>;
  };
  hsRealClinical?: {
    enabled: boolean;
    steps: Array<{
      id: string;
      actionId?: string;
      label?: string;
      activityType?: string;
      order?: number;
    }>;
  };
  psRealClinical?: {
    enabled: boolean;
    steps: Array<{
      id: string;
      actionId?: string;
      label?: string;
      activityType?: string;
      order?: number;
    }>;
  };

  patientData: {
    name?: string;
    preferredName?: string;
    gender?: string;
    age?: number;
    race?: string;
    weight?: string;
    dateOfBirth?: string;
    dobMonthDay?: string;
    occupation?: string;
    /** @deprecated Canonical location is vitals.weight */
    Weight?: string;
    /** @deprecated Canonical location is vitals.height */
    Height?: string;
    vitals?: {
      heartRate?: string;
      bloodPressure?: string;
      respiratoryRate?: string;
      spO2?: string;
      temperature?: string;
      weight?: string;
      height?: string;
    };
    chiefComplaint?: string;
    historyOfPresentIllness?: string;
    presentingNote?: string;
    medicalHistory?: string;
    pastSurgicalHistory?: string;
    familyMedicalHistoryClinical?: string;
    primaryCareProvider?: string;
    allergies?: string;
    currentMedications?: string[];
    immunizationHistory?: string[];
    socialHistory?: {
      tobacco?: string;
      alcohol?: string;
      drugs?: string;
      exercise?: string;
      housing?: string;
    };
    lifestyle?: {
      housing?: string;
      transportation?: string;
      occupation?: string;
      diet?: string;
      exercise?: string;
      stress?: string;
      sleep?: string;
    };
    historyVisibility?: Record<string, boolean>;
    // Legacy SAMPLE history (backwards compatible)
    sampleHistory?: {
      signsAndSymptoms?: string;
      allergies?: string;
      medications?: string;
      pastMedicalHistory?: string;
      lastOralIntake?: string;
      eventsLeadingUp?: string;
      audioResponses?: {
        signsAndSymptoms?: string;
        allergies?: string;
        medications?: string;
        medicalHistory?: string;
        lastOralIntake?: string;
        eventsLeadingUp?: string;
      };
    };
  };
  // ── TAB: Actions ──────────────────────────────────────────────────────────
  actionGroupName?: string;
  actionGroupDescription?: string;
  actions?: Action[];
  actionCategories?: ActionCategory[];
  // ── TAB: Orders ───────────────────────────────────────────────────────────
  orders?: unknown[];
  // ── TAB: AI Patient Avatar ────────────────────────────────────────────────
  language?: string;
  voice?: string;
  aiPatientData?: AIPatientData;
  // ── TAB: Product Setup ────────────────────────────────────────────────────
  orthopedicWorksheet?: OrthopedicWorksheet;
  // ── TAB: Grading / Rubric ─────────────────────────────────────────────────
  grading?: {
    maxScore: number;
    components?: {
      communication?: { weight: number; description: string };
      clinicalAccuracy?: { weight: number; description: string };
      technicalSkill?: { weight: number; description: string };
      documentation?: { weight: number; description: string };
      softSkills?: { weight: number };
      technicalSkills?: { weight: number };
    };
    rubric?: Array<RubricItem>;
    requiredDocumentation?: string[];
  };
  // ── TAB: Sequencing ───────────────────────────────────────────────────────
  sequences?: ScenarioSequenceDefinition[];
  sequenceGroups?: SequenceGroupDefinition[];
  sequenceGroupsOrderMode?: 'strict' | 'flexible';
  simulationStartTime?: string;
  // ── System / Legacy Fields (no active UI tab) ─────────────────────────────
  metadata?: {
    scenarioType?: string;
    estimatedDuration?: string;
    version?: string;
    createdBy?: string;
  };
  conversationResponses?: {
    [category: string]: Array<{
      keywords: string[];
      response: string;
      weight?: number;
    }>;
  };
  expectedActions?: {
    labs?: string[];
    imaging?: string[];
    physicalExam?: string[];
    medications?: string[];
  };
  historyPrompts?: string[];
  assessmentGuidance?: {
    actions?: string[];
    educationPoints?: string[];
  };
  learningObjectiveCard?: string;
  availableMedications?: Array<{
    name: string;
    dosage?: string;
    route?: string;
  }>;
  availableTests?: string[];
  phases?: Array<{
    id: string;
    name: string;
    description: string;
    avatarDescription?: string;
    vitals?: {
      heartRate?: string;
      ecgWaveform?: string;
      systolicBP?: string;
      diastolicBP?: string;
      /** Legacy combined blood pressure string like "120/80". */
      bloodPressure?: string;
      spO2?: string;
      respirationRate?: string;
      respiratoryRate?: string;
      respirationQuality?: string;
      pulseQuality?: {
        carotid?: string;
        radial?: string;
        brachial?: string;
        pedal?: string;
      };
      temperature?: {
        oral?: string;
        forehead?: string;
        rectal?: string;
      };
    };
    sampleHistory?: {
      signsAndSymptoms?: { text?: string; audio?: string };
      allergies?: { text?: string; audio?: string };
      medications?: { text?: string; audio?: string };
      pastMedicalHistory?: { text?: string; audio?: string };
      lastOralIntake?: { text?: string; audio?: string };
      eventsLeadingUp?: { text?: string; audio?: string };
    };
    sounds?: {
      heartSounds?: { [location: string]: string };
      lungSounds?: { [location: string]: string };
      bowelSounds?: { [location: string]: string };
    };
    tasks?: Array<{
      id: string;
      label: string;
      required?: boolean;
      autoAssessable?: boolean;
    }>;
  }>;
  timeline?: {
    timelineElements?: unknown[];
    alwaysAvailableElements?: unknown[];
    sequenceRules?: unknown[];
    assessmentConfigs?: unknown[];
    settings?: {
      totalScenarioDurationSeconds?: number;
      allowEarlyCompletion?: boolean;
      enforceStrictTiming?: boolean;
      showTimerToLearner?: boolean;
      pauseTimerOnInactivity?: boolean;
      inactivityThresholdSeconds?: number;
    };
    phases?: unknown[];
    blocks?: unknown[];
    sequenceChain?: unknown[];
  };
  patientChartMode?: 'HS' | 'PS';
}

export interface Transcript {
  id: string;
  userId: string;
  scenarioId: string;
  messages: Array<{
    id: string;
    timestamp: string;
    text: string;
    speaker: 'student' | 'avatar';
  }>;
  startedAt: string;
  endedAt?: string;
  studentName?: string;
  studentKey?: string;
  studentClass?: string;
  /** Login session identifier — associates this scenario attempt with the parent authentication session */
  loginSessionId?: string;
  /** Scenario type: Practice (formative) or Assessment (summative) */
  scenarioType?: 'Practice' | 'Assessment';
  /** Session identifier (UUID v4) — separate from transcriptId for future flexibility */
  sessionId?: string;
  /** Scenario instance identifier (UUID v4) — tracks scenario subsystem lifecycle */
  scenarioInstanceId?: string;
}

export interface Report {
  id: string;
  userId: string;
  student_id?: string;
  key?: string;
  studentName?: string;
  studentClass?: string;
  scenarioId: string;
  scenarioTitle?: string;
  transcriptId: string;
  scenarioStartTime?: string;
  scenarioEndTime?: string;
  totalTimeSeconds?: number;
  score: number;
  scoreJson: {
    communication: number;
    clinicalJudgment: number;
    technicalAccuracy: number;
    ethicalCompetence: number;
    reflection: number;
    overallScore: number;
  };
  summary?: string;
  strengths?: string[];
  improvements?: string[];
  feedback: string;
  // Optional structured summary data coming from the Summary tab
  summaryEntries?: unknown[];
  summaryByCategory?: Record<string, unknown>;
  actionsTimeline?: Array<{
    title?: string;
    selectedItem?: string;
    notes?: string;
    startedAt?: string;
    startedAtValue?: number;
    completedAt?: string;
    completedAtValue?: number;
    durationSeconds?: number;
    observation?: string;
    response?: string | string[];
    grading?: boolean | number;
  }>;
  communicationAssessment?: {
    scores?: Record<string, number>;
    /**
     * Dynamic weights by dimension key.
     */
    weights?: Record<string, number>;
    /**
     * Pre-calculated weighted results for each dimension, keyed by dimension.
     */
    weightedScores?: Record<
      string,
      {
        rawScore: number;
        weight: number;
        weightedScore: number;
      }
    >;
    /**
     * Dynamic detailed dimension blocks (strengths/weaknesses/etc.) keyed by dimension.
     * This is the flexible replacement for hard-coded "empathy"/"clarity" sections.
     */
    dimensions?: Record<
      string,
      {
        strengths?: Array<{ point: string; example: string }>;
        weaknesses?: Array<{ point: string; example: string }>;
        recommendations?: string[];
        detailedSummary?: string;
      }
    >;
    // Optional legacy fields kept for backward compatibility
    empathy?: {
      strengths?: Array<{ point: string; example: string }>;
      weaknesses?: Array<{ point: string; example: string }>;
      recommendations?: string[];
      detailedSummary?: string;
    };
    clarity?: {
      strengths?: Array<{ point: string; example: string }>;
      weaknesses?: Array<{ point: string; example: string }>;
      recommendations?: string[];
      detailedSummary?: string;
    };
    overall?: {
      score?: number;
      summary?: string;
      feedback?: string;
    };
    /**
     * Fully dynamic rubric assessment results keyed by AI check ID.
     * This allows arbitrary rubric items defined in the Grading/Rubric tab
     * (both Soft Skill and Technical Skill with AI/Combined evaluationSource)
     * to be returned from the OpenAI assessment.
     */
    rubricResults?: Record<
      string,
      {
        id: string;
        aiCheckId: string;
        name: string;
        categoryType: string;
        subCategory: string;
        weight: number;
        scoringModel: string;
        evaluationSource: string;
        score: number;
        maxScore: number;
        weightedScore: number;
        summary: string;
        feedback: string;
      }
    >;
  };

  // ─────────────────────────────────────────────────────────────────
  // ACTION SCORING WITH RUBRIC WEIGHTS
  // ─────────────────────────────────────────────────────────────────
  /**
   * Per-category action scores with rubric weights applied
   * Format: { "Actions & Interventions": { name, weight, score, maxScore, percentage, x, y, details } }
   */
  actionScores?: Record<
    string,
    {
      name: string;
      weight: number;
      score: number;
      maxScore: number;
      percentage: number;
      x: number; // mandatory actions completed correctly
      y: number; // total mandatory actions
      mandatoryCount: number;
      completedCount: number;
      details?: unknown[];
    }
  >;

  /**
   * Summary of action performance
   */
  actionSummary?: {
    totalMandatory: number;
    completedMandatory: number;
    totalOptional: number;
    completedOptional: number;
    mandatoryPercentage: number;
  };

  /**
   * Mandatory actions with pass/fail status
   */
  mandatoryActions?: Array<{
    title: string;
    type: string;
    isCorrect: boolean;
    attempts: number;
    response?: unknown;
    isOptional?: boolean;
    pointsAwarded?: number;
  }>;

  /**
   * Optional actions completed (informational only, don't affect score)
   */
  optionalActions?: Array<{
    title: string;
    type: string;
    isCorrect: boolean;
    attempts: number;
    response?: unknown;
    isOptional?: boolean;
    pointsAwarded?: number;
  }>;

  pdfUrl?: string;
  mode?: 'Practice' | 'Assessment';
  createdAt: string;
}

export interface Permission {
  name?: string;
  key: string;
  units: string[];
  scenarios?: string[];
  avatars?: string[];
}

export interface PermissionsData {
  permissions: Permission[];
}

/** Internal error shape for Azure SDK errors used in catch blocks. */
type AzureSdkError = {
  statusCode?: number;
  code?: string;
  errorCode?: string;
  response?: { status?: number };
  message?: string;
};

const DEFAULT_UNIT_ID = 'unit-001';

/**
 * Languages for which a localized `<lang>/scenarios.json` overlay file may exist
 * alongside the canonical English `scenarios.json` in the same blob container.
 * Missing files are tolerated (treated as empty overlay → English passthrough).
 *
 * To add a new language, place `<lang>/scenarios.json` in the container and
 * append the code here.
 */
const SUPPORTED_SCENARIO_LANGUAGES = ['es'] as const;
type ScenarioLanguage = (typeof SUPPORTED_SCENARIO_LANGUAGES)[number];

const isSupportedScenarioLanguage = (lang: string | undefined): lang is ScenarioLanguage =>
  typeof lang === 'string' && (SUPPORTED_SCENARIO_LANGUAGES as readonly string[]).includes(lang);

@Injectable()
export class JsonDataService implements OnModuleInit {
  // Environment variables:
  // - `AZURE_STORAGE_CONNECTION_STRING`: Storage connection string
  // - `AZURE_BLOB_CONTAINER_NAME`: container name (defaults to `json-data`)
  // - `AZURE_BLOB_PREFIX`: optional virtual folder/prefix inside the container
  private readonly azureConnectionString = process.env.AZURE_STORAGE_CONNECTION_STRING ?? '';
  private readonly blobContainerName =
    process.env.AZURE_BLOB_CONTAINER_NAME ??
    process.env.AZURE_STORAGE_CONTAINER_NAME ??
    'json-data';
  private readonly blobPrefix = process.env.AZURE_BLOB_PREFIX ?? '';

  private readonly azureEnabled = this.azureConnectionString.trim().length > 0;

  private blobServiceClient?: BlobServiceClient;
  private containerClient?: ContainerClient;
  private containerReady?: Promise<void>;

  // In-memory cache so the public API can remain synchronous.
  // `onModuleInit()` hydrates the cache from Azure; write methods update the cache
  // and persist back to Azure asynchronously.
  private readonly cache: Record<string, unknown> = {};
  private readonly persistChain: Record<string, Promise<void>> = {};
  private readonly refreshChain: Record<string, Promise<void>> = {};
  private readonly metadataCheckChain: Record<string, Promise<void>> = {};
  private readonly blobVersionCache: Record<string, string> = {};
  private readonly lastMetadataCheckAt: Record<string, number> = {};
  private readonly metadataCheckIntervalMs =
    Number(process.env.JSON_CACHE_METADATA_CHECK_INTERVAL_MS) || 3000;

  /** In-memory map of all scenarios keyed by scenario id, loaded from individual blobs. */
  private  scenariosMap: Map<string, Scenario> = new Map();

  /**
   * Per-language cache of fully-authored translated scenarios read from
   * `<lang>/scenario/<id>.json`. Populated lazily by
   * `refreshLocalizedScenariosMap()` and used by the localized list-view
   * getters so that a per-scenario Spanish file takes priority over the bulk
   * `<lang>/scenarios.json` overlay (mirroring `getScenarioByIdLocalized`).
   */
  private readonly localizedScenariosMap: Map<ScenarioLanguage, Map<string, Scenario>> = new Map();
  private readonly localizedScenariosLoadedAt: Map<ScenarioLanguage, number> = new Map();
  private readonly localizedScenariosCacheTtlMs =
    Number(process.env.LOCALIZED_SCENARIOS_CACHE_TTL_MS) || 30_000;

  constructor() {
    if (!this.azureEnabled) return;

    this.blobServiceClient = BlobServiceClient.fromConnectionString(this.azureConnectionString);
    this.containerClient = this.blobServiceClient.getContainerClient(this.blobContainerName);
  }

  setScenarioCache(scenarioMap:Map<string, Record<string, unknown>>):void{
    scenarioMap.forEach((value, key) => {
    this.scenariosMap.set(key, value as unknown as Scenario);
  });
  }

   onModuleInit(): void {
    if (!this.azureEnabled || !this.containerClient) return;

    try {
      void this.ensureContainer().then(()=>{
        console.log(`[Azure] Connected to container "${this.blobContainerName}" successfully`);

      });
       
    } catch (err: unknown) {
      const e = err as AzureSdkError;
      console.error(
        `[Azure] Failed to initialise container "${this.blobContainerName}": ${e.message ?? String(err)}`,
      );
      console.warn(
        '[Azure] Continuing with empty in-memory cache — data will not be persisted until Azure is reachable',
      );
      return;
    }

    // Hydrate the cache in parallel. All top-level bulk files are independent
    // of each other, so downloading them concurrently cuts startup latency
    // from N × RTT to max(RTT) instead of a sequential chain.
    // `loadAllScenarioFiles()` is itself parallelized internally.
    const t0 = Date.now();
    const localizedOverlayKeys = SUPPORTED_SCENARIO_LANGUAGES.map(
      (lang) => `${lang}/scenarios.json`,
    );

    // await Promise.all([
      void this.downloadJsonArray<User>('users.json', []).then((v) => {
        this.cache['users.json'] = v;
      });

      void this.downloadJsonArray<Unit>('units.json', []).then((v) => {
        this.cache['units.json'] = v;
      });
      // this.loadAllScenarioFiles(),
      void localizedOverlayKeys.map((key) =>
        this.downloadJsonArray<Scenario>(key, []).then((v) => {
          this.cache[key] = v;
        }),
      );

      void this.downloadJsonArray<unknown>('default-scenarios.json', []).then((v) => {
        this.cache['default-scenarios.json'] = v;
      });
      void this.downloadJsonArray<Transcript>('transcripts.json', []).then((v) => {
        this.cache['transcripts.json'] = v;
      });
      void this.downloadJsonArray<Report>('reports.json', []).then((v) => {
        this.cache['reports.json'] = v;
      });
      void this.downloadJsonArray<unknown>('classes.json', []).then((v) => {
        this.cache['classes.json'] = v;
      });
      void this.downloadJsonObject<PermissionsData>('username-units.json', {
        permissions: [],
      }).then((v) => {
        this.cache['username-units.json'] = v;
      })
    // ]);

     
    console.log(`[Azure] Cache hydration complete in ${Date.now() - t0}ms`);
  }

  private getBlobName(filename: string): string {
    const prefix = this.blobPrefix.trim().replace(/^\/+|\/+$/g, '');
    return prefix ? `${prefix}/${filename}` : filename;
  }

  private async ensureContainer(): Promise<void> {
    if (!this.containerClient) return;
    if (!this.containerReady) {
      this.containerReady = this.containerClient
        .createIfNotExists()
        .then(() => undefined)
        .catch((err) => {
          // Reset so the next call retries instead of reusing the rejected promise
          this.containerReady = undefined;
          throw err;
        });
    }
    await this.containerReady;
  }

  private async downloadJsonObject<T>(filename: string, defaultValue: T): Promise<T> {
    if (!this.containerClient) return defaultValue;

    try {
      const blobName = this.getBlobName(filename);
      const blobClient = this.containerClient.getBlockBlobClient(blobName);
      const props = await blobClient.getProperties();
      this.blobVersionCache[filename] = this.getBlobVersionToken(props);
      const buffer = await blobClient.downloadToBuffer();

      if (!buffer || buffer.length === 0) return defaultValue;

      try {
        return JSON.parse(buffer.toString('utf-8')) as T;
      } catch {
        console.error(`[Azure] Corrupt JSON in blob "${filename}", using default`);
        return defaultValue;
      }
    } catch (error: unknown) {
      const e = error as AzureSdkError;
      const statusCode = e.statusCode ?? e.response?.status;
      if (statusCode === 404) return defaultValue;

      const errorCode: string = e.code ?? e.errorCode ?? '';
      if (errorCode === 'AuthenticationFailed' || statusCode === 403) {
        console.error(
          `[Azure] Authentication failed downloading "${filename}": check AZURE_STORAGE_CONNECTION_STRING`,
        );
      } else if (errorCode === 'ContainerNotFound' || statusCode === 404) {
        console.error(
          `[Azure] Container "${this.blobContainerName}" not found downloading "${filename}"`,
        );
      } else {
        console.error(
          `[Azure] Error downloading "${filename}" (status=${statusCode ?? 'unknown'}):`,
          e.message ?? String(error),
        );
      }
      return defaultValue;
    }
  }

  private async downloadJsonArray<T>(filename: string, defaultValue: T[]): Promise<T[]> {
    const value = await this.downloadJsonObject<unknown>(filename, defaultValue);
    return Array.isArray(value) ? (value as T[]) : defaultValue;
  }

  private async refreshJsonArrayCache<T>(filename: string, defaultValue: T[]): Promise<T[]> {
    if (!this.azureEnabled || !this.containerClient) {
      const existing = this.cache[filename] as T[] | undefined;
      return Array.isArray(existing) ? existing : defaultValue;
    }

    const prev = this.refreshChain[filename] ?? Promise.resolve();
    this.refreshChain[filename] = prev
      .then(async () => {
        await this.ensureContainer();
        const fresh = await this.downloadJsonArray<T>(filename, defaultValue);
        this.cache[filename] = fresh;
      })
      .catch((err) => {
        console.error(`[Azure] Failed to refresh "${filename}":`, err);
      });

    await this.refreshChain[filename];

    const after = this.cache[filename] as T[] | undefined;
    return Array.isArray(after) ? after : defaultValue;
  }

  private getBlobVersionToken(props: { etag?: string; lastModified?: Date }): string {
    const etag = props.etag ?? '';
    const lastModified = props.lastModified?.toISOString() ?? '';
    return `${etag}|${lastModified}`;
  }

  private triggerRefreshIfBlobChanged<T>(
    filename: string,
    defaultValue: T,
    onRefreshed: (fresh: T) => void,
  ): void {
    if (!this.azureEnabled || !this.containerClient) return;
    const containerClient = this.containerClient;

    const now = Date.now();
    const lastCheck = this.lastMetadataCheckAt[filename] ?? 0;
    if (now - lastCheck < this.metadataCheckIntervalMs) return;
    this.lastMetadataCheckAt[filename] = now;

    const prev = this.metadataCheckChain[filename] ?? Promise.resolve();
    this.metadataCheckChain[filename] = prev
      .then(async () => {
        await this.ensureContainer();
        const blobName = this.getBlobName(filename);
        const blobClient = containerClient.getBlockBlobClient(blobName);
        const props = await blobClient.getProperties();
        const remoteVersion = this.getBlobVersionToken(props);
        const cachedVersion = this.blobVersionCache[filename];

        // First metadata check after startup: record the version and keep current cache.
        if (!cachedVersion) {
          this.blobVersionCache[filename] = remoteVersion;
          return;
        }

        if (cachedVersion === remoteVersion) return;

        const fresh = await this.downloadJsonObject<T>(filename, defaultValue);
        onRefreshed(fresh);
      })
      .catch((err: unknown) => {
        const e = err as AzureSdkError;
        const statusCode = e.statusCode ?? e.response?.status;
        if (statusCode !== 404) {
          console.error(`[Azure] Failed to check blob version for "${filename}":`, err);
        }
      });
  }

  private scheduleUploadJson(filename: string, data: unknown): void {
    if (!this.azureEnabled || !this.containerClient) return;
    const containerClient = this.containerClient;

    const blobName = this.getBlobName(filename);
    const json = JSON.stringify(data, null, 2);
    const payload = Buffer.from(json, 'utf-8');

    const prev = this.persistChain[filename] ?? Promise.resolve();
    this.persistChain[filename] = prev
      .then(async () => {
        await this.ensureContainer();
        const blobClient = containerClient.getBlockBlobClient(blobName);
        const uploadResult = await blobClient.uploadData(payload, {
          blobHTTPHeaders: {
            blobContentType: 'application/json; charset=utf-8',
          },
        });
        this.blobVersionCache[filename] = this.getBlobVersionToken({
          etag: uploadResult.etag,
          lastModified: uploadResult.lastModified,
        });
        this.lastMetadataCheckAt[filename] = Date.now();
      })
      .catch((err: unknown) => {
        const e = err as AzureSdkError;
        const statusCode = e.statusCode ?? e.response?.status;
        const errorCode: string = e.code ?? e.errorCode ?? '';
        if (errorCode === 'AuthenticationFailed' || statusCode === 403) {
          console.error(
            `[Azure] Authentication failed uploading "${filename}": check AZURE_STORAGE_CONNECTION_STRING`,
          );
        } else if (errorCode === 'ContainerNotFound') {
          console.error(
            `[Azure] Container "${this.blobContainerName}" not found uploading "${filename}"`,
          );
        } else {
          console.error(
            `[Azure] Error uploading "${filename}" (status=${statusCode ?? 'unknown'}):`,
            e.message ?? String(err),
          );
        }
        // Reset chain so subsequent writes are not permanently blocked
        this.persistChain[filename] = Promise.resolve();
      });
  }

  /**
   * Persists an individual object as its own blob.
   * Useful for avoiding concurrency issues on global array files.
   */
  async persistIndividualBlob(filename: string, data: unknown): Promise<void> {
    if (!this.azureEnabled || !this.containerClient) return;

    const blobName = this.getBlobName(filename);
    const json = JSON.stringify(data, null, 2);
    const payload = Buffer.from(json, 'utf-8');

    try {
      await this.ensureContainer();
      const blobClient = this.containerClient.getBlockBlobClient(blobName);
      await blobClient.uploadData(payload, {
        blobHTTPHeaders: {
          blobContentType: 'application/json; charset=utf-8',
        },
      });
       
      console.log(`[Azure] Successfully persisted individual blob: ${blobName}`);
    } catch (err: unknown) {
      const e = err as AzureSdkError;
      console.error(
        `[Azure] Failed to persist individual blob "${blobName}":`,
        e.message ?? String(err),
      );
      throw err;
    }
  }

  /**
   * Downloads an individual object blob.
   */
  async downloadIndividualBlob<T>(filename: string, defaultValue: T): Promise<T> {
    if (!this.azureEnabled || !this.containerClient) return defaultValue;

    try {
      const blobName = this.getBlobName(filename);
      const blobClient = this.containerClient.getBlockBlobClient(blobName);
      const buffer = await blobClient.downloadToBuffer();

      if (!buffer || buffer.length === 0) return defaultValue;
      return JSON.parse(buffer.toString('utf-8')) as T;
    } catch (error: unknown) {
      const e = error as AzureSdkError;
      const statusCode = e.statusCode ?? e.response?.status;
      if (statusCode === 404) return defaultValue;
      console.error(
        `[Azure] Error downloading individual blob "${filename}":`,
        e.message ?? String(error),
      );
      return defaultValue;
    }
  }

  async flushJson(filename: string): Promise<void> {
    await (this.persistChain[filename] ?? Promise.resolve());
  }

  private readJsonFile<T>(filename: string): T[] {
    this.triggerRefreshIfBlobChanged<T[]>(filename, [], (fresh) => {
      this.cache[filename] = Array.isArray(fresh) ? fresh : [];
    });
    const data = this.cache[filename] as T[] | undefined;
    return Array.isArray(data) ? data : [];
  }

  private writeJsonFile<T>(filename: string, data: T[]): void {
    this.cache[filename] = data;
    this.scheduleUploadJson(filename, data);
  }

  private async writeJsonFileAndFlush<T>(filename: string, data: T[]): Promise<void> {
    this.cache[filename] = data;
    this.scheduleUploadJson(filename, data);
    await this.flushJson(filename);
    // Refresh cache from blob so subsequent reads reflect the persisted state
    await this.refreshJsonArrayCache<T>(filename, []);
  }

  private readJsonObjectFile<T>(filename: string, defaultValue: T): T {
    this.triggerRefreshIfBlobChanged<T>(filename, defaultValue, (fresh) => {
      this.cache[filename] = fresh;
    });
    const data = this.cache[filename] as T | undefined;
    return data ?? defaultValue;
  }

  private writeJsonObjectFile<T>(filename: string, data: T): void {
    this.cache[filename] = data;
    this.scheduleUploadJson(filename, data);
  }

  // Users
  getUsers(): User[] {
    return this.readJsonFile<User>('users.json');
  }

  getUserById(id: string): User | undefined {
    const users = this.getUsers();
    return users.find((u) => u.id === id);
  }

  getUserByEmail(email: string): User | undefined {
    const users = this.getUsers();
    return users.find((u) => u.email === email);
  }

  // Units
  getUnits(): Unit[] {
    return this.readJsonFile<Unit>('units.json');
  }

  getUnitById(id: string): Unit | undefined {
    const units = this.getUnits();
    return units.find((u) => String(u.id) === String(id));
  }

  addUnit(unit: Unit): void {
    const units = this.getUnits();
    units.push(unit);
    this.writeJsonFile('units.json', units);
  }

  updateUnit(id: string, updates: Partial<Unit>): void {
    const units = this.getUnits();
    const index = units.findIndex((u) => String(u.id) === String(id));
    if (index !== -1) {
      units[index] = { ...units[index], ...updates };
      this.writeJsonFile('units.json', units);
    } else {
      throw new Error(`Unit with id ${id} not found`);
    }
  }

  deleteUnit(id: string): void {
    const units = this.getUnits();
    const index = units.findIndex((u) => String(u.id) === String(id));
    if (index !== -1) {
      units.splice(index, 1);
      this.writeJsonFile('units.json', units);
    } else {
      throw new Error(`Unit with id ${id} not found`);
    }
  }

  // ── Scenario blob path helpers ─────────────────────────────────────────────

  /**
   * Returns the blob path for a scenario based on its language.
   * English → `en/scenario/<id>.json`
   * Spanish → `es/scenario/<id>.json`
   */
  private scenarioBlobPath(scenario: Scenario): string {
    const lang = (scenario.language ?? 'en-US').startsWith('es') ? 'es' : 'en';
    return `${lang}/scenario/${scenario.id}.json`;
  }

  private scenarioBlobPathById(id: string, lang: 'en' | 'es' = 'en'): string {
    return `${lang}/scenario/${id}.json`;
  }

  /**
   * Loads all scenario blobs from `en/scenario/` into `this.scenariosMap`
   * at startup.
   *
   * Downloads run in parallel with a bounded concurrency cap
   * (`SCENARIO_HYDRATION_CONCURRENCY`, default 32) so a container with
   * thousands of scenarios hydrates in seconds instead of minutes.
   * The previous serial implementation issued one HTTPS round-trip per
   * blob and was the primary cause of multi-minute cold starts.
   */
  private async loadAllScenarioFiles(): Promise<void> {
    if (!this.azureEnabled || !this.containerClient) return;
    this.scenariosMap.clear();
    // Only the canonical English files are loaded into scenariosMap — this is
    // the source of truth for all non-localized reads (admin, scoring, etc.).
    // Translated files (es/scenario/<id>.json) are fetched on-demand by
    // getScenarioByIdLocalized / getScenariosByUnitIdLocalized and are never
    // stored in scenariosMap so they cannot bleed into admin or English views.
    const t0 = Date.now();
    const containerClient = this.containerClient;
    const prefixes = ['en/scenario/'];

    // Step 1: list all blob names first (fast — pages come back at 5000/req).
    const blobNames: string[] = [];
    for (const prefix of prefixes) {
      const fullPrefix = this.getBlobName(prefix);
      for await (const blobItem of containerClient.listBlobsFlat({ prefix: fullPrefix })) {
        const relName = this.blobPrefix
          ? blobItem.name.replace(this.blobPrefix.replace(/^\/+|\/+$/g, '') + '/', '')
          : blobItem.name;
        if (relName.endsWith('.json')) {
          blobNames.push(relName);
        }
      }
    }

    if (blobNames.length === 0) {
       
      console.warn(
        '[Scenarios] No scenario blobs found under en/scenario/ — ' +
          'migrate-scenarios-to-individual-files.js may not have been run against this container.',
      );
    }

    // Step 2: download in parallel batches. Each batch downloads up to
    // `concurrency` blobs concurrently before moving on to the next batch.
    // Azure Blob Storage handles wide fan-out fine; the cap prevents socket
    // exhaustion and stays well under the account's per-second request limits.
    const concurrency = Math.max(1, Number(process.env.SCENARIO_HYDRATION_CONCURRENCY) || 32);

    let loaded = 0;
    for (let i = 0; i < blobNames.length; i += concurrency) {
      const batch = blobNames.slice(i, i + concurrency);
      const results = await Promise.all(
        batch.map((relName) => this.downloadIndividualBlob<Scenario | null>(relName, null)),
      );
      for (const scenario of results) {
        if (scenario && scenario.id && !this.scenariosMap.has(scenario.id)) {
          this.scenariosMap.set(scenario.id, scenario);
          loaded++;
        }
      }
    }

     
    console.log(
      `[Scenarios] Loaded ${loaded} scenarios from ${blobNames.length} blobs in ${
        Date.now() - t0
      }ms (concurrency=${concurrency})`,
    );

    // ── Legacy aggregate fallback ────────────────────────────────────────────
    // If migrate-scenarios-to-individual-files.js was never run against this
    // container the per-scenario listing above yields an empty (or partial)
    // map.  As a safety net, also read scenarios.json and seed any scenario
    // not already present.  This keeps pre-migration containers operational
    // after a post-refactor deploy and avoids hard-404s at runtime.
    await this.seedScenariosFromAggregate();
  }

  /**
   * Downloads the legacy `scenarios.json` aggregate blob (if it exists) and
   * inserts any scenario whose `id` is not already in `scenariosMap`.
   * Emits a warning for each scenario that had to be back-filled so that
   * operators know the migration script still needs to be run.
   */
  private async seedScenariosFromAggregate(): Promise<void> {
    if (!this.azureEnabled || !this.containerClient) return;
    let aggregate: Scenario[];
    try {
      aggregate = await this.downloadJsonArray<Scenario>('scenarios.json', []);
    } catch {
      // Missing blob is normal post-migration — nothing to do.
      return;
    }
    if (!Array.isArray(aggregate) || aggregate.length === 0) return;

    let backfilled = 0;
    for (const scenario of aggregate) {
      if (scenario?.id && !this.scenariosMap.has(scenario.id)) {
        this.scenariosMap.set(scenario.id, scenario);
        backfilled++;
      }
    }

    if (backfilled > 0) {
       
      console.warn(
        `[Scenarios] Back-filled ${backfilled} scenario(s) from legacy scenarios.json. ` +
          'Run scripts/migrate-scenarios-to-individual-files.js to create the individual blobs ' +
          'and silence this warning.',
      );
    }
  }

  private async deleteScenarioBlob(blobPath: string): Promise<void> {
    await this.deleteIndividualBlob(blobPath);
  }

  /**
   * Deletes a single blob (individual scenario / transcript / report / …)
   * from the container. Missing blobs are ignored via `deleteIfExists`.
   * Errors are logged but never thrown — deleting a blob that never landed
   * shouldn't fail the parent operation.
   */
  private async deleteIndividualBlob(blobPath: string): Promise<void> {
    if (!this.azureEnabled || !this.containerClient) return;
    try {
      const blobName = this.getBlobName(blobPath);
      await this.containerClient.getBlockBlobClient(blobName).deleteIfExists();
    } catch (err: unknown) {
      const e = err as AzureSdkError;
      console.error(`[Azure] Failed to delete blob "${blobPath}": ${e.message ?? String(err)}`);
    }
  }

  // ── Scenarios CRUD ───────────────────────────────────────────────────────────

  getScenarios(): Scenario[] {
    return Array.from(this.scenariosMap.values()).map((s) => this.normalizeScenarioForRead(s));
  }

  getScenarioById(id: string): Scenario | undefined {
    const scenario = this.scenariosMap.get(id);
    return scenario ? this.normalizeScenarioForRead(scenario) : undefined;
  }

  async getScenarioByIdFresh(id: string): Promise<Scenario | undefined> {
    if (!this.azureEnabled || !this.containerClient) {
      return this.getScenarioById(id);
    }
    // Try en first, then es
    let scenario = await this.downloadIndividualBlob<Scenario | null>(
      this.scenarioBlobPathById(id, 'en'),
      null,
    );
    if (!scenario) {
      scenario = await this.downloadIndividualBlob<Scenario | null>(
        this.scenarioBlobPathById(id, 'es'),
        null,
      );
    }
    if (!scenario) {
      // Neither individual blob exists — fall back to scenariosMap, which is
      // seeded from the legacy scenarios.json aggregate at startup if the
      // migration script has not been run yet.
      return this.getScenarioById(id);
    }
    this.scenariosMap.set(scenario.id, scenario);
    return this.normalizeScenarioForRead(scenario);
  }

  /**
   * Admin-only: always resolves the English blob for the given scenario id.
   * Falls back to the in-memory map when Azure is not enabled (local/dev).
   */
  async getScenarioByIdEnOnly(id: string): Promise<Scenario | undefined> {
    if (!this.azureEnabled || !this.containerClient) {
      return this.getScenarioById(id);
    }
    const scenario = await this.downloadIndividualBlob<Scenario | null>(
      this.scenarioBlobPathById(id, 'en'),
      null,
    );
    if (!scenario) return undefined;
    return this.normalizeScenarioForRead(scenario);
  }

  getScenariosByUnitId(unitId: string): Scenario[] {
    return this.getScenarios().filter((s) => String(s.unitId) === String(unitId));
  }

  // ---- Localized scenario overlays --------------------------------------------------
  // Spanish (and any future language) scenarios live at `<lang>/scenarios.json`
  // in the same blob container, indexed by the same scenario `id` as the English
  // canonical file. We deep-merge the overlay on top of the English scenario so
  // any field omitted in the overlay falls back to English transparently.

  private getLocalizedOverlay(lang: ScenarioLanguage): Scenario[] {
    const key = `${lang}/scenarios.json`;
    const cached = this.cache[key];
    return Array.isArray(cached) ? (cached as Scenario[]) : [];
  }

  private async refreshLocalizedOverlay(lang: ScenarioLanguage): Promise<Scenario[]> {
    const key = `${lang}/scenarios.json`;
    return this.refreshJsonArrayCache<Scenario>(key, []);
  }

  /**
   * Lists `<lang>/scenario/*.json` in the container and returns an id→Scenario
   * map of every fully-authored translated scenario file for `lang`. Cached in
   * `this.localizedScenariosMap[lang]` and refreshed at most once per
   * `localizedScenariosCacheTtlMs` (30s by default) so that newly-uploaded
   * translations show up without a server restart.
   */
  private async refreshLocalizedScenariosMap(
    lang: ScenarioLanguage,
  ): Promise<Map<string, Scenario>> {
    if (!this.azureEnabled || !this.containerClient) {
      return this.localizedScenariosMap.get(lang) ?? new Map<string, Scenario>();
    }
    const existing = this.localizedScenariosMap.get(lang);
    const lastLoaded = this.localizedScenariosLoadedAt.get(lang) ?? 0;
    if (existing && Date.now() - lastLoaded < this.localizedScenariosCacheTtlMs) {
      return existing;
    }

    const fullPrefix = this.getBlobName(`${lang}/scenario/`);
    const next = new Map<string, Scenario>();
    try {
      for await (const blobItem of this.containerClient.listBlobsFlat({ prefix: fullPrefix })) {
        const relName = this.blobPrefix
          ? blobItem.name.replace(this.blobPrefix.replace(/^\/+|\/+$/g, '') + '/', '')
          : blobItem.name;
        if (!relName.endsWith('.json')) continue;
        const scenario = await this.downloadIndividualBlob<Scenario | null>(relName, null);
        if (scenario?.id) next.set(scenario.id, scenario);
      }
    } catch (err) {
       
      console.warn(
        `[Scenarios] Failed to refresh ${lang}/scenario/* map, keeping stale cache:`,
        err,
      );
      if (existing) return existing;
    }

    this.localizedScenariosMap.set(lang, next);
    this.localizedScenariosLoadedAt.set(lang, Date.now());
    return next;
  }

  /**
   * Deep merge two plain-object/array structures. The overlay wins where defined;
   * `undefined` and `null` values in the overlay are skipped so they fall back to
   * the English base. Arrays in the overlay fully replace the base array (so a
   * translator can re-author lists without leftover English entries leaking in).
   */
  private mergeLocalized<T>(base: T, overlay: unknown): T {
    if (overlay === undefined || overlay === null) return base;
    if (Array.isArray(overlay)) return overlay as unknown as T;
    if (typeof overlay !== 'object' || typeof base !== 'object' || base === null) {
      return overlay as T;
    }

    const baseRecord = base as unknown as Record<string, unknown>;
    const overlayRecord = overlay as Record<string, unknown>;
    const merged: Record<string, unknown> = { ...baseRecord };

    for (const key of Object.keys(overlayRecord)) {
      const overlayValue = overlayRecord[key];
      if (overlayValue === undefined || overlayValue === null) continue;
      const baseValue = baseRecord[key];
      merged[key] = this.mergeLocalized(baseValue, overlayValue);
    }

    return merged as unknown as T;
  }

  /**
   * Returns the scenario with `id` localized into `lang`.
   *
   * Resolution order:
   *   English (default / unsupported lang):
   *     1. `en/scenario/<id>.json`   (per-scenario file, primary)
   *     2. `scenariosMap` (populated at startup; includes aggregate fallback)
   *
   *   Spanish (`lang === 'es'`):
   *     1. `es/scenario/<id>.json`   (per-scenario Spanish file, primary)
   *     2. English base (see above) + `es/scenarios.json` overlay merged on top
   *
   * When the overlay file exists but lacks an entry for `id`, the English
   * scenario is returned unchanged.
   */
  async getScenarioByIdLocalized(
    id: string,
    lang: string | undefined,
  ): Promise<Scenario | undefined> {
    // For a supported non-English language, prefer a fully-authored
    // per-scenario file (`<lang>/scenario/<id>.json`). This mirrors the
    // English primary path and avoids the merge cost when a complete
    // translated scenario file already exists in the container.
    // NOTE: `SUPPORTED_SCENARIO_LANGUAGES` only lists non-English codes
    // (English is the default/base), so the type guard alone is enough —
    // no `lang !== 'en'` check needed.
    if (isSupportedScenarioLanguage(lang) && this.azureEnabled && this.containerClient) {
      const perScenario = await this.downloadIndividualBlob<Scenario | null>(
        this.scenarioBlobPathById(id, lang),
        null,
      );
      if (perScenario) {
        this.scenariosMap.set(perScenario.id, perScenario);
        return this.normalizeScenarioForRead(perScenario);
      }
    }

    const base = await this.getScenarioByIdFresh(id);
    if (!base || !isSupportedScenarioLanguage(lang)) return base;

    const overlayList = await this.refreshLocalizedOverlay(lang);
    const overlay = overlayList.find((s) => s?.id === id);
    if (!overlay) return base;

    return this.mergeLocalized(base, overlay);
  }

  /**
   * Returns all scenarios for `unitId` localized into `lang`.
   *
   * Resolution priority per scenario (Spanish only — English callers just get
   * the plain English list unchanged):
   *   1. `<lang>/scenario/<id>.json`  (full per-scenario translated file)
   *   2. English base + `<lang>/scenarios.json` bulk overlay merged on top
   *   3. English base unchanged
   */
  async getScenariosByUnitIdLocalized(
    unitId: string,
    lang: string | undefined,
  ): Promise<Scenario[]> {
    const base = this.getScenariosByUnitId(unitId);
    if (!isSupportedScenarioLanguage(lang)) return base;

    const [perScenarioMap, overlayList] = await Promise.all([
      this.refreshLocalizedScenariosMap(lang),
      this.refreshLocalizedOverlay(lang),
    ]);

    const overlayById = new Map<string, Scenario>();
    for (const entry of overlayList) {
      if (entry?.id) overlayById.set(entry.id, entry);
    }

    return base.map((scenario) => {
      const perScenario = perScenarioMap.get(scenario.id);
      if (perScenario) {
        return this.normalizeScenarioForRead(perScenario);
      }
      const overlay = overlayById.get(scenario.id);
      if (overlay) {
        return this.mergeLocalized(scenario, overlay);
      }
      return scenario;
    });
  }

  /**
   * Returns every scenario in the system localized into `lang`. Used by
   * clients (e.g. student dashboard) that need translated title/description
   * for every scenario. Applies the same 3-tier resolution as
   * `getScenariosByUnitIdLocalized`.
   */
  async getAllScenariosLocalized(lang: string | undefined): Promise<Scenario[]> {
    const base = this.getScenarios();
    if (!isSupportedScenarioLanguage(lang)) return base;

    const [perScenarioMap, overlayList] = await Promise.all([
      this.refreshLocalizedScenariosMap(lang),
      this.refreshLocalizedOverlay(lang),
    ]);

    const overlayById = new Map<string, Scenario>();
    for (const entry of overlayList) {
      if (entry?.id) overlayById.set(entry.id, entry);
    }

    return base.map((scenario) => {
      const perScenario = perScenarioMap.get(scenario.id);
      if (perScenario) {
        return this.normalizeScenarioForRead(perScenario);
      }
      const overlay = overlayById.get(scenario.id);
      if (overlay) {
        return this.mergeLocalized(scenario, overlay);
      }
      return scenario;
    });
  }

  private normalizeScenarioForRead(scenario: Scenario): Scenario {
    const scenarioRecord = scenario as unknown as Record<string, unknown>;
    const legacyTimeline = this.isObjectRecord(scenarioRecord.timeline)
      ? scenarioRecord.timeline
      : undefined;

    const normalizedSequences = this.normalizeSequencesForStorage(
      scenario.sequences,
      legacyTimeline,
      undefined,
      undefined,
    );

    const normalizedScenario: Scenario = {
      ...scenario,
      sequences: normalizedSequences,
    };

    delete (normalizedScenario as unknown as Record<string, unknown>).timeline;

    // Migrate deprecated root-level patientData fields to canonical locations
    const pd = normalizedScenario.patientData as Record<string, unknown>;
    if (pd) {
      const vitals = (pd.vitals ?? {}) as Record<string, unknown>;

      // Migrate capitalised Weight → vitals.weight
      if (typeof pd['Weight'] === 'string' && (pd['Weight']).trim() !== '') {
        if (!vitals['weight'] || (vitals['weight'] as string).trim() === '') {
          vitals['weight'] = pd['Weight'];
        }
        delete pd['Weight'];
      }

      // Migrate capitalised Height → vitals.height
      if (typeof pd['Height'] === 'string' && (pd['Height']).trim() !== '') {
        if (!vitals['height'] || (vitals['height'] as string).trim() === '') {
          vitals['height'] = pd['Height'];
        }
        delete pd['Height'];
      }

      // Migrate lowercase root-level weight → vitals.weight
      if (typeof pd['weight'] === 'string' && (pd['weight']).trim() !== '') {
        if (!vitals['weight'] || (vitals['weight'] as string).trim() === '') {
          vitals['weight'] = pd['weight'];
        }
        delete pd['weight'];
      }

      // Migrate lowercase root-level height → vitals.height
      if (typeof pd['height'] === 'string' && (pd['height']).trim() !== '') {
        if (!vitals['height'] || (vitals['height'] as string).trim() === '') {
          vitals['height'] = pd['height'];
        }
        delete pd['height'];
      }

      pd['vitals'] = vitals;
    }

    // Strip empty-string metadata fields
    const rec = normalizedScenario as unknown as Record<string, unknown>;
    const meta = rec['metadata'] as Record<string, unknown> | undefined;
    if (meta) {
      if ('version' in meta) delete meta['version'];
      if ('createdBy' in meta) delete meta['createdBy'];
    }

    return normalizedScenario;
  }

  private isObjectRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private asTimelineBlocks(value: unknown): TimelineBlockRecord[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter((entry): entry is TimelineBlockRecord => this.isObjectRecord(entry));
  }

  private asStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.filter((entry): entry is string => typeof entry === 'string');
  }

  private asAssessmentMethod(value: unknown): SequenceAssessmentMethod {
    return value === 'patientInformationUpdated' ? 'patientInformationUpdated' : 'questionAsked';
  }

  private asTiming(value: unknown): SequenceTiming {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return {
        mode: 'withinMinutes',
        withinMinutesFromStart: Math.round(value),
      };
    }
    return { mode: 'anytime' };
  }

  private resolveRequirementRefs(
    childIds: string[],
    blocksById: Map<string, TimelineBlockRecord>,
  ): SequenceRequirement[] {
    return childIds
      .map((childId) => blocksById.get(childId))
      .filter((child): child is TimelineBlockRecord => Boolean(child?.sourceId))
      .map((child) => ({
        ref: String(child.sourceId),
        assessmentMethod: this.asAssessmentMethod(child.assessmentMethod),
      }));
  }

  private deriveSequenceDefinitions(
    blocks: TimelineBlockRecord[],
    sequenceChain: string[],
  ): ScenarioSequenceDefinition[] {
    if (!Array.isArray(blocks) || blocks.length === 0) {
      return [];
    }

    const blockMap = new Map<string, TimelineBlockRecord>();
    blocks.forEach((block) => {
      if (typeof block.id === 'string' && block.id.trim().length > 0) {
        blockMap.set(block.id, block);
      }
    });

    const result = blocks
      .filter((block) => block.relationshipOnly !== true)
      .filter(
        (block): block is TimelineBlockRecord & { id: string; sourceId: string } =>
          typeof block.id === 'string' &&
          block.id.trim().length > 0 &&
          typeof block.sourceId === 'string' &&
          block.sourceId.trim().length > 0,
      )
      .map((parent) => {
        const beforeChildIds = this.asStringArray(parent.prerequisites);
        const afterChildIds = this.asStringArray(parent.followups);

        return {
          parentRef: parent.sourceId,
          assessmentMethod: this.asAssessmentMethod(parent.assessmentMethod),
          timing: this.asTiming(parent.withinMinutesFromStart),
          orderControl: (sequenceChain.includes(parent.id) ? 'strict' : 'flexible') as 'strict'|'flexible',
          before: this.resolveRequirementRefs(beforeChildIds, blockMap),
          after: this.resolveRequirementRefs(afterChildIds, blockMap),
        };
      });
    return result;
  }

  private normalizeSequencesForStorage(
    incomingSequences: ScenarioSequenceDefinition[] | undefined,
    incomingLegacyTimeline: Record<string, unknown> | undefined,
    existingSequences: ScenarioSequenceDefinition[] | undefined,
    existingLegacyTimeline: Record<string, unknown> | undefined,
  ): ScenarioSequenceDefinition[] {
    if (Array.isArray(incomingSequences)) {
      return incomingSequences;
    }

    const incomingTimelineSequences = Array.isArray(incomingLegacyTimeline?.sequences)
      ? (incomingLegacyTimeline.sequences as ScenarioSequenceDefinition[])
      : undefined;
    if (incomingTimelineSequences) {
      return incomingTimelineSequences;
    }

    const existingTimelineSequences = Array.isArray(existingLegacyTimeline?.sequences)
      ? (existingLegacyTimeline.sequences as ScenarioSequenceDefinition[])
      : undefined;
    if (existingTimelineSequences) {
      return existingTimelineSequences;
    }

    const blocks = this.asTimelineBlocks(
      incomingLegacyTimeline?.blocks ?? existingLegacyTimeline?.blocks,
    );
    const sequenceChain = this.asStringArray(
      incomingLegacyTimeline?.sequenceChain ?? existingLegacyTimeline?.sequenceChain,
    );

    if (blocks.length > 0 || sequenceChain.length > 0) {
      const derived = this.deriveSequenceDefinitions(blocks, sequenceChain);
      return derived;
    }

    return existingSequences ?? [];
  }

   
  private logSequencingPersistence(
    scenarioId: string,
    sequences: ScenarioSequenceDefinition[],
  ): void {
     
    console.log(`[SequencingPersistence] Scenario: ${scenarioId}`);
     
    console.log(`[SequencingPersistence] Sequences: ${sequences.length}`);
    for (const seq of sequences) {
      const timingLabel =
        seq.timing?.mode === 'withinMinutes'
          ? `within(${seq.timing.withinMinutesFromStart})`
          : (seq.timing?.mode ?? 'anytime');
       
      console.log(
        `[SequencingPersistence] - Parent: ${seq.parentRef} | Assessment: ${seq.assessmentMethod ?? 'questionAsked'} | Timing: ${timingLabel} | OrderControl: ${seq.orderControl ?? 'flexible'} | Before: ${seq.before?.length ?? 0} | After: ${seq.after?.length ?? 0}`,
      );
    }
  }

  async addScenario(scenario: Scenario): Promise<void> {
    const scenarioRecord = scenario as unknown as Record<string, unknown>;
    const incomingLegacyTimeline = this.isObjectRecord(scenarioRecord.timeline)
      ? scenarioRecord.timeline
      : undefined;
    const normalizedSequences = this.normalizeSequencesForStorage(
      scenario.sequences,
      incomingLegacyTimeline,
      undefined,
      undefined,
    );

    const normalizedScenario: Scenario = {
      ...scenario,
      sequences: normalizedSequences,
    };
    delete (normalizedScenario as unknown as Record<string, unknown>).timeline;

    this.logSequencingPersistence(normalizedScenario.id, normalizedSequences);
    this.scenariosMap.set(normalizedScenario.id, normalizedScenario);
    await this.persistIndividualBlob(this.scenarioBlobPath(normalizedScenario), normalizedScenario);

    // Save as default scenario
    this.saveAsDefaultScenario(normalizedScenario);
  }

  async updateScenario(id: string, updates: Partial<Scenario>): Promise<void> {
    const existing = this.scenariosMap.get(id);
    if (!existing) throw new Error(`Scenario with id ${id} not found`);

    const updatesRecord = updates as unknown as Record<string, unknown>;
    const incomingLegacyTimeline = this.isObjectRecord(updatesRecord.timeline)
      ? updatesRecord.timeline
      : undefined;

    const normalizedSequences = this.normalizeSequencesForStorage(
      updates.sequences,
      incomingLegacyTimeline,
      existing.sequences,
      undefined,
    );

    const normalizedUpdates: Partial<Scenario> = {
      ...updates,
      ...(updates.sequences || incomingLegacyTimeline ? { sequences: normalizedSequences } : {}),
    };

    delete (normalizedUpdates as unknown as Record<string, unknown>).timeline;

    if (updates.sequences || incomingLegacyTimeline) {
      this.logSequencingPersistence(id, normalizedSequences);
    }

    // Deep merge for nested objects
    const updated: Scenario = {
      ...existing,
      ...normalizedUpdates,
      studentBriefing: normalizedUpdates.studentBriefing
        ? { ...existing.studentBriefing, ...normalizedUpdates.studentBriefing }
        : existing.studentBriefing,
      sbar: normalizedUpdates.sbar
        ? { ...existing.sbar, ...normalizedUpdates.sbar }
        : existing.sbar,
      patientData: normalizedUpdates.patientData
        ? {
            ...existing.patientData,
            ...normalizedUpdates.patientData,
            vitals: normalizedUpdates.patientData.vitals
              ? { ...existing.patientData?.vitals, ...normalizedUpdates.patientData.vitals }
              : existing.patientData?.vitals,
            socialHistory: normalizedUpdates.patientData.socialHistory
              ? {
                  ...existing.patientData?.socialHistory,
                  ...normalizedUpdates.patientData.socialHistory,
                }
              : existing.patientData?.socialHistory,
          }
        : existing.patientData,
      aiPatientData: normalizedUpdates.aiPatientData
        ? { ...existing.aiPatientData, ...normalizedUpdates.aiPatientData }
        : existing.aiPatientData,
      grading: normalizedUpdates.grading
        ? {
            ...existing.grading,
            ...normalizedUpdates.grading,
            components: normalizedUpdates.grading.components
              ? { ...existing.grading?.components, ...normalizedUpdates.grading.components }
              : existing.grading?.components,
          }
        : existing.grading,
      productSetup: normalizedUpdates.productSetup
        ? { ...existing.productSetup, ...normalizedUpdates.productSetup }
        : existing.productSetup,
      assessmentGuidance: normalizedUpdates.assessmentGuidance
        ? { ...existing.assessmentGuidance, ...normalizedUpdates.assessmentGuidance }
        : existing.assessmentGuidance,
      expectedActions: normalizedUpdates.expectedActions
        ? { ...existing.expectedActions, ...normalizedUpdates.expectedActions }
        : existing.expectedActions,
    };

    this.scenariosMap.set(id, updated);
    await this.persistIndividualBlob(this.scenarioBlobPath(updated), updated);
  }

  async deleteScenario(id: string): Promise<void> {
    const scenario = this.scenariosMap.get(id);
    if (!scenario) throw new Error(`Scenario with id ${id} not found`);
    this.scenariosMap.delete(id);
    await this.deleteScenarioBlob(this.scenarioBlobPath(scenario));
  }

  saveAsDefaultScenario(scenario: Scenario): void {
    // Keep original id as originalId and remove unitId to make it reusable
     
    const { id, unitId: _unused, ...defaultData } = scenario;
    const defaultScenario = { ...defaultData, originalId: id };

    const defaultScenarios = this.getDefaultScenarios() as Array<
      Omit<Scenario, 'id' | 'unitId'> & { originalId?: string }
    >;
    defaultScenarios.push(defaultScenario);
    this.writeJsonFile('default-scenarios.json', defaultScenarios);
  }

  getDefaultScenarios(): Omit<Scenario, 'id' | 'unitId'>[] {
    return this.readJsonFile<Omit<Scenario, 'id' | 'unitId'>>('default-scenarios.json');
  }

  getDefaultScenarioById(id: string): Omit<Scenario, 'id' | 'unitId'> | undefined {
    const scenarios = this.getDefaultScenarios();
    return scenarios.find((s) => (s as { originalId?: string }).originalId === id);
  }

  // Actions
  // getActions(): Action[] {
  //   return this.readJsonFile<Action>('actions.json');
  // }

  // addAction(action: Action): void {
  //   const actions = this.getActions();
  //   actions.push(action);
  //   this.writeJsonFile('actions.json', actions);
  // }

  // getActionsByUserId(userId: string, scenarioId?: string): Action[] {
  //   const actions = this.getActions();
  //   return actions.filter(
  //     (a) => a.userId === userId && (!scenarioId || a.scenarioId === scenarioId),
  //   );
  // }

  // Transcripts
  getTranscripts(): Transcript[] {
    return this.readJsonFile<Transcript>('transcripts.json');
  }

  addTranscript(transcript: Transcript): void {
    const transcripts = this.getTranscripts();
    transcripts.push(transcript);
    this.writeJsonFile('transcripts.json', transcripts);

    // Also persist as individual blob to handle multi-user race conditions.
    // Failures are already logged inside persistIndividualBlob; the extra
    // .catch here just keeps the returned promise from becoming an
    // unhandled rejection when the caller doesn't await.
    this.persistIndividualBlob(`transcripts/${transcript.id}.json`, transcript).catch(
      (err: unknown) => {
        console.error(
          `[Azure] addTranscript: individual blob write for "${transcript.id}" failed:`,
          err,
        );
      },
    );
  }

  updateTranscript(id: string, updates: Partial<Transcript>): void {
    const transcripts = this.getTranscripts();
    const index = transcripts.findIndex((t) => t.id === id);
    if (index !== -1) {
      transcripts[index] = { ...transcripts[index], ...updates };
      this.writeJsonFile('transcripts.json', transcripts);

      // Update individual blob as well. Log failures so we don't silently
      // lose divergence between the bulk file and the per-record blob.
      this.persistIndividualBlob(`transcripts/${id}.json`, transcripts[index]).catch(
        (err: unknown) => {
          console.error(`[Azure] updateTranscript: individual blob write for "${id}" failed:`, err);
        },
      );
    }
  }

  /**
   * Applies `updates` to the in-memory transcript array cache and schedules a
   * bulk `transcripts.json` upload, but does NOT touch the individual
   * `transcripts/<id>.json` blob.
   *
   * Use this when the individual blob has already been written correctly
   * (e.g. via `persistIndividualBlob` in endLog) and you only need to keep
   * the local cache + bulk file consistent. Calling `updateTranscript` in
   * that context would fire an async individual-blob overwrite using the
   * stale in-memory record (e.g. `messages:[]`) and clobber the correct
   * blob.
   */
  patchTranscriptInMemory(id: string, updates: Partial<Transcript>): void {
    const transcripts = this.getTranscripts();
    const index = transcripts.findIndex((t) => t.id === id);
    if (index !== -1) {
      transcripts[index] = { ...transcripts[index], ...updates };
      this.writeJsonFile('transcripts.json', transcripts);
    }
  }

  /**
   * Like `updateTranscript` but also awaits the individual blob upload.
   * Use this when the caller needs the individual blob to be current before
   * the next read (e.g. PUT /logs/:id where endLog follows immediately).
   */
  async updateTranscriptAndPersist(id: string, updates: Partial<Transcript>): Promise<void> {
    const transcripts = this.getTranscripts();
    const index = transcripts.findIndex((t) => t.id === id);
    if (index !== -1) {
      transcripts[index] = { ...transcripts[index], ...updates };
      this.writeJsonFile('transcripts.json', transcripts);
      await this.persistIndividualBlob(`transcripts/${id}.json`, transcripts[index]);
    }
  }

  /**
   * Deletes a transcript from both the bulk `transcripts.json` array and its
   * individual `transcripts/<id>.json` blob. Necessary because
   * `getTranscriptByIdFresh` reads the individual blob first — leaving it
   * behind would resurrect the deleted transcript on the next fetch.
   */
  async deleteTranscript(id: string): Promise<void> {
    const transcripts = this.getTranscripts();
    const index = transcripts.findIndex((t) => t.id === id);
    if (index === -1) {
      throw new Error(`Transcript with id ${id} not found`);
    }
    transcripts.splice(index, 1);
    this.writeJsonFile('transcripts.json', transcripts);
    await this.flushJson('transcripts.json');
    await this.deleteIndividualBlob(`transcripts/${id}.json`);
  }

  getTranscriptById(id: string): Transcript | undefined {
    const transcripts = this.getTranscripts();
    return transcripts.find((t) => t.id === id);
  }

  async getTranscriptByIdFresh(id: string): Promise<Transcript | undefined> {
    // 1. Try individual blob first (highest reliability, most fresh)
    const individual = await this.downloadIndividualBlob<Transcript | null>(
      `transcripts/${id}.json`,
      null,
    );
    if (individual) return individual;

    // 2. Fallback to cached legacy array
    const cached = this.getTranscriptById(id);
    if (cached) return cached;

    // 3. Fallback to refreshed legacy array (expensive)
    const refreshed = await this.refreshJsonArrayCache<Transcript>('transcripts.json', []);
    return refreshed.find((t) => t.id === id);
  }

  getTranscriptsByUserId(userId: string): Transcript[] {
    const transcripts = this.getTranscripts();
    return transcripts.filter((t) => t.userId === userId);
  }

  addMessagesToTranscript(transcriptId: string, messages: Transcript['messages']): void {
    const transcripts = this.getTranscripts();
    const index = transcripts.findIndex((t) => t.id === transcriptId);
    if (index !== -1) {
      transcripts[index].messages.push(...messages);
      this.writeJsonFile('transcripts.json', transcripts);

      // Async update individual blob. Log failures so divergence between
      // the bulk file and the per-record blob is at least surfaced.
      this.persistIndividualBlob(`transcripts/${transcriptId}.json`, transcripts[index]).catch(
        (err: unknown) => {
          console.error(
            `[Azure] addMessagesToTranscript: individual blob write for "${transcriptId}" failed:`,
            err,
          );
        },
      );
    }
  }

  // Reports
  getReports(): Report[] {
    return this.readJsonFile<Report>('reports.json');
  }

  setReports(reports: Report[]): void {
    this.writeJsonFile('reports.json', reports);
  }

  async getReportsFresh(): Promise<Report[]> {
    return this.refreshJsonArrayCache<Report>('reports.json', []);
  }

  async addReportFresh(report: Report): Promise<void> {
    const reports = await this.getReportsFresh();

    // Avoid duplicates on retries / multi-instance writes
    if (reports.some((r) => r.id === report.id)) {
      return;
    }

    reports.push(report);
    this.writeJsonFile('reports.json', reports);

    // Save as individual blob for race condition prevention
    await this.persistIndividualBlob(`reports/${report.id}.json`, report);

    await this.flushJson('reports.json');
  }

  async getReportByIdFresh(id: string): Promise<Report | undefined> {
    // 1. Try individual blob first
    const individual = await this.downloadIndividualBlob<Report | null>(`reports/${id}.json`, null);
    if (individual) return individual;

    // 2. Fallback to cached legacy array
    const cached = this.getReportById(id);
    if (cached) return cached;

    // 3. Fallback to refreshed legacy array (expensive)
    const refreshed = await this.refreshJsonArrayCache<Report>('reports.json', []);
    return refreshed.find((r) => r.id === id);
  }

  async getReportByTranscriptIdFresh(transcriptId: string): Promise<Report | undefined> {
    const first = this.getReportByTranscriptId(transcriptId);
    if (first) return first;

    const refreshed = await this.refreshJsonArrayCache<Report>('reports.json', []);
    return refreshed.find((r) => r.transcriptId === transcriptId);
  }

  // Classes (used by ClassesService)
  getClasses<T = unknown>(): T[] {
    return this.readJsonFile<T>('classes.json');
  }

  setClasses<T = unknown>(classes: T[]): void {
    this.writeJsonFile('classes.json', classes);
  }

  addReport(report: Report): void {
    const reports = this.getReports();
    reports.push(report);
    this.writeJsonFile('reports.json', reports);
  }

  getReportById(id: string): Report | undefined {
    const reports = this.getReports();
    return reports.find((r) => r.id === id);
  }

  getReportsByUserId(userId: string): Report[] {
    const reports = this.getReports();
    return reports.filter((r) => r.userId === userId);
  }

  getReportByTranscriptId(transcriptId: string): Report | undefined {
    const reports = this.getReports();
    return reports.find((r) => r.transcriptId === transcriptId);
  }

  /**
   * Find the most recent Assessment report for a given scenarioId + studentId
   * (student_id or userId). Reads from the fresh blob-backed cache so concurrent
   * workers all see each other's writes.
   */
  async getAssessmentReportByScenarioAndStudentFresh(
    scenarioId: string,
    studentId: string,
  ): Promise<Report | undefined> {
    const reports = await this.getReportsFresh();
    return reports
      .filter(
        (r) =>
          r.scenarioId === scenarioId &&
          (r.student_id === studentId || r.userId === studentId) &&
          (r.mode ?? 'Assessment') === 'Assessment',
      )
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  }

  /**
   * Return every Assessment report for a given scenarioId + studentId
   * (student_id or userId), sorted newest first. Used to enforce the
   * per-student "max Assessment attempts" limit — the caller counts the
   * results and refuses to generate a new report once the ceiling is
   * reached. Reads from the fresh blob-backed cache so concurrent workers
   * all see each other's writes.
   */
  async getAssessmentReportsByScenarioAndStudentFresh(
    scenarioId: string,
    studentId: string,
  ): Promise<Report[]> {
    const reports = await this.getReportsFresh();
    return reports
      .filter(
        (r) =>
          r.scenarioId === scenarioId &&
          (r.student_id === studentId || r.userId === studentId) &&
          (r.mode ?? 'Assessment') === 'Assessment',
      )
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  // Username-Unit Mapping (New Permissions Structure)
  getPermissionsData(): PermissionsData {
    return this.readJsonObjectFile<PermissionsData>('username-units.json', {
      permissions: [],
    });
  }

  getPermissionByKey(key: string): Permission | undefined {
    const permissionsData = this.getPermissionsData();
    // Case-insensitive matching for key
    return permissionsData.permissions.find((p) => p.key.toLowerCase() === key.toLowerCase());
  }

  // Legacy method for backward compatibility
  getPermissionByUsername(username: string): Permission | undefined {
    return this.getPermissionByKey(username);
  }

  getUnitIdByKey(key: string): string | undefined {
    const permission = this.getPermissionByKey(key);
    return permission?.units?.[0];
  }

  // Default Scenario
  getDefaultScenario(): Omit<Scenario, 'id' | 'unitId'> | null {
    // Return the latest scenario (last in array)
    const scenarios = this.readJsonFile<Omit<Scenario, 'id' | 'unitId'>>('default-scenarios.json');
    return scenarios.length > 0 ? scenarios[scenarios.length - 1] : null;
  }

  getUnitsByKey(key: string): string[] {
    const permission = this.getPermissionByKey(key);
    if (permission?.units?.length) {
      return permission.units;
    }
    const defaultUnitId = this.getDefaultUnitId();
    return defaultUnitId ? [defaultUnitId] : [];
  }

  // Update permissions data
  updatePermissions(permissions: Permission[]): void {
    this.writeJsonObjectFile<PermissionsData>('username-units.json', {
      permissions,
    });
  }

  // Update a specific permission by key
  updatePermissionByKey(key: string, updates: Partial<Permission>): void {
    const permissionsData = this.getPermissionsData();
    const index = permissionsData.permissions.findIndex(
      (p) => p.key.toLowerCase() === key.toLowerCase(),
    );

    if (index !== -1) {
      permissionsData.permissions[index] = {
        ...permissionsData.permissions[index],
        ...updates,
      };
      this.updatePermissions(permissionsData.permissions);
    } else {
      throw new Error(`Permission with key ${key} not found`);
    }
  }

  // Legacy methods for backward compatibility
  getUnitIdByUsername(username: string): string | undefined {
    return this.getUnitIdByKey(username);
  }

  getUnitsByUsername(username: string): string[] {
    return this.getUnitsByKey(username);
  }

  // Legacy method for backward compatibility (returns old format if needed)
  getUsernameUnitsMapping(): Record<string, string> {
    const permissionsData = this.getPermissionsData();
    const mapping: Record<string, string> = {};
    permissionsData.permissions.forEach((permission) => {
      if (permission.units && permission.units.length > 0) {
        mapping[permission.key] = permission.units[0];
      }
    });
    return mapping;
  }

  // Utility
  generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Action Category Management
  getActionCategories(scenarioId: string): ActionCategory[] {
    const scenario = this.getScenarioById(scenarioId);
    return scenario?.actionCategories ?? [];
  }

  async ensureUncategorizedCategoryExists(scenarioId: string): Promise<ActionCategory> {
    const categories = this.getActionCategories(scenarioId);
    let uncategorized = categories.find((c) => c.isSystem);

    if (!uncategorized) {
      uncategorized = {
        id: `category_uncategorized_${Date.now()}`,
        name: 'Uncategorized',
        description: 'Default category for actions',
        scenarioId,
        isSystem: true,
      };
      const scenario = this.getScenarioById(scenarioId);
      if (scenario) {
        const updatedCategories = [...categories, uncategorized];
        await this.updateScenario(scenarioId, {
          actionCategories: updatedCategories,
        });
      }
    }

    return uncategorized;
  }

  async createActionCategory(
    scenarioId: string,
    data: Omit<ActionCategory, 'id' | 'scenarioId'>,
  ): Promise<ActionCategory> {
    const scenario = this.getScenarioById(scenarioId);
    if (!scenario) {
      throw new Error(`Scenario with id ${scenarioId} not found`);
    }

    // Validate unique name (case-insensitive)
    const categories = this.getActionCategories(scenarioId);
    const existingCategory = categories.find(
      (c) => c.name.toLowerCase() === data.name.toLowerCase(),
    );

    if (existingCategory) {
      throw new Error(`Category with name "${data.name}" already exists`);
    }

    const newCategory: ActionCategory = {
      id: `category_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      scenarioId,
      ...data,
    };

    const updatedCategories = [...categories, newCategory];
    await this.updateScenario(scenarioId, {
      actionCategories: updatedCategories,
    });

    return newCategory;
  }

  async updateActionCategory(
    scenarioId: string,
    categoryId: string,
    updates: Partial<Omit<ActionCategory, 'id' | 'scenarioId'>>,
  ): Promise<ActionCategory> {
    const categories = this.getActionCategories(scenarioId);
    const index = categories.findIndex((c) => c.id === categoryId);

    if (index === -1) {
      throw new Error(`Category with id ${categoryId} not found`);
    }

    // Prevent modification of system category name
    if (categories[index].isSystem && updates.name) {
      throw new Error('Cannot modify the name of the system category');
    }

    // Validate unique name if updating (case-insensitive)
    if (updates?.name) {
      const existingCategory = categories.find(
        (c, idx) => idx !== index && c.name.toLowerCase() === updates.name?.toLowerCase(),
      );

      if (existingCategory) {
        throw new Error(`Category with name "${updates.name}" already exists`);
      }
    }

    const updatedCategory = { ...categories[index], ...updates };
    categories[index] = updatedCategory;

    await this.updateScenario(scenarioId, { actionCategories: categories });

    return updatedCategory;
  }

  async deleteActionCategory(scenarioId: string, categoryId: string): Promise<void> {
    const scenario = this.getScenarioById(scenarioId);
    if (!scenario) {
      throw new Error(`Scenario with id ${scenarioId} not found`);
    }

    const categories = this.getActionCategories(scenarioId);
    const categoryToDelete = categories.find((c) => c.id === categoryId);

    if (!categoryToDelete) {
      throw new Error(`Category with id ${categoryId} not found`);
    }

    // Prevent deletion of system category
    if (categoryToDelete.isSystem) {
      throw new Error('Cannot delete the system Uncategorized category');
    }

    // Ensure uncategorized category exists
    const uncategorized = await this.ensureUncategorizedCategoryExists(scenarioId);

    // Reassign all actions in this category to uncategorized
    const actions = scenario?.actions ?? [];
    const updatedActions = actions.map((action) => {
      if (action.categoryId === categoryId) {
        return { ...action, categoryId: uncategorized.id };
      }
      return action;
    });

    // Remove the category
    const updatedCategories = categories.filter((c) => c.id !== categoryId);

    // Update scenario with both updated actions and categories
    await this.updateScenario(scenarioId, {
      actionCategories: updatedCategories,
      actions: updatedActions,
    });
  }

  private getDefaultUnitId(): string | undefined {
    const units = this.getUnits();
    if (!units.length) {
      return undefined;
    }

    const explicitlyConfiguredUnit = units.find((unit) => unit.id === DEFAULT_UNIT_ID);
    if (explicitlyConfiguredUnit) {
      return explicitlyConfiguredUnit.id;
    }

    return units[0]?.id;
  }
}




@Global()
@Module({
  providers:[JsonDataService],
  exports:[JsonDataService]
})
export class JsonDataModule {}
