/**
 * Blob-era Scenario, Unit and Report shapes used by the student-backend grading and admin code.
 * Moved verbatim from the removed blob data service; imported by path rather than re-exported from
 * the interfaces index because names like `Action`, `Unit`, `Report` and `MedicationConfig` would
 * collide with existing exports there.
 */

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
  concepts?: Array<{ id: string; description: string; type: string }>;
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
