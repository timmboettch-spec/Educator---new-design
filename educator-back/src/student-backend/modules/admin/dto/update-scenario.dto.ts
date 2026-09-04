import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsBoolean,
  IsArray,
  ValidateIf,
  IsObject,
  MaxLength,
  MinLength,
  IsIn,
} from 'class-validator';

import { IsValidVitalSigns } from '../../../modules/scenarios/validators/vital-signs.validator';

import type { ActionCategory } from '../../../data/json-data.service';

/**
 * Only validates fields that may be updated via PUT/PATCH.
 * All fields are optional - only provided fields will be updated.
 * Required fields must not be "nulled out" when provided.
 * Includes all scenario fields for complete scenario updates.
 */
export class UpdateScenarioDto {
  @IsOptional()
  @IsString()
  @ValidateIf((o: UpdateScenarioDto) => o.title !== undefined && o.title !== null)
  @IsNotEmpty()
  @MinLength(4)
  @MaxLength(100)
  title?: string;

  @IsOptional()
  @IsString()
  @ValidateIf((o: UpdateScenarioDto) => o.scenarioId !== undefined && o.scenarioId !== null)
  @IsNotEmpty()
  scenarioId?: string;

  @IsOptional()
  @IsString()
  @ValidateIf((o: UpdateScenarioDto) => o.id !== undefined && o.id !== null)
  @IsNotEmpty()
  id?: string;

  @IsOptional()
  @IsString()
  unitId?: string;

  @IsOptional()
  @IsString()
  difficulty?: string;

  @IsOptional()
  @IsBoolean()
  avatarEnabled?: boolean;

  @IsOptional()
  @IsString()
  avatarId?: string;

  @IsOptional()
  @IsString()
  contextId?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsString()
  voice?: string;

  @IsOptional()
  @IsString()
  learnerLevel?: string;

  @IsOptional()
  @IsString()
  ethnicity?: string;

  @IsOptional()
  @IsString()
  age?: string;

  @IsOptional()
  @IsString()
  class?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  learningObjective?: string | string[];

  @IsOptional()
  @IsBoolean()
  disabled?: boolean;

  @IsOptional()
  @IsString()
  @IsIn(['draft', 'published', 'archived'], {
    message: "status must be 'draft', 'published', or 'archived'",
  })
  status?: 'draft' | 'published' | 'archived';

  @IsOptional()
  @IsString()
  assessmentNarrativeExpected?: string;

  @IsOptional()
  @IsString()
  actionGroupName?: string;

  @IsOptional()
  @IsString()
  actionGroupDescription?: string;

  @IsOptional()
  @IsArray()
  @IsValidVitalSigns()
  actions?: Array<{
    id?: string;
    order: number;
    title: string;
    description?: string;
    type?: 'single' | 'ordering' | 'question' | 'vital';
    items: string[];
    correct: string;
    categoryId?: string;
    typeRequirement?: 'Mandatory' | 'Optional' | 'Distractor';
    isExcluded?: boolean;
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
  }>;

  @IsOptional()
  @IsObject()
  metadata?: {
    scenarioType?: string;
    estimatedDuration?: string;
    version?: string;
    createdBy?: string;
  };

  @IsOptional()
  @IsObject()
  patientData?: {
    name?: string;
    preferredName?: string;
    gender?: string;
    age?: number;
    race?: string;
    weight?: string;
    dateOfBirth?: string;
    occupation?: string;
    Weight: string;
    Height: string;
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
    presentingNote?: string;
    medicalHistory?: string;
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

  @IsOptional()
  @IsObject()
  expectedActions?: {
    labs?: string[];
    imaging?: string[];
    physicalExam?: string[];
    medications?: string[];
  };

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  historyPrompts?: string[];

  @IsOptional()
  @IsObject()
  assessmentGuidance?: {
    actions?: string[];
    educationPoints?: string[];
  };

  @IsOptional()
  @IsObject()
  followupGuidance?: {
    dischargeInstructions?: string;
    followupCare?: string;
    returnVisit?: string;
    redFlags?: string;
  };

  @IsOptional()
  @IsString()
  learningObjectiveCard?: string;

  @IsOptional()
  @IsObject()
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
    rubric?: Array<{
      id: string;
      name: string;
      categoryType: 'Soft Skill' | 'Technical Skill';
      subCategory: string;
      weight: number;
      scoringModel: 'Binary' | 'Graded';
      required: boolean;
      evaluationSource: 'AI' | 'System Check' | 'Combined';
      aiMapping?: {
        aiCheckId: string;
        aiDescription: string;
        aiPromptParameter: string;
      };
      description?: string;
      learningObjectiveId?: string;
      patientDataFields?: Array<{ field: string; required: boolean }>;
      vitalsFields?: Array<{
        field: string;
        status:
          | 'Required'
          | 'Optional'
          | 'Within 5 minutes'
          | 'Within 10 minutes'
          | 'Within 15 minutes'
          | 'Within 30 minutes';
      }>;
      expectedActions?: Array<{
        action: string;
        category: 'labs' | 'imaging' | 'physicalExam' | 'medications' | 'actions';
        required: boolean;
      }>;
      medications?: Array<{
        medicationId: string;
        medicationName: string;
        required: boolean;
      }>;
      checklistItems?: Array<{
        id: string;
        text: string;
        mandatory?: boolean;
        status?: 'Mandatory' | 'Optional' | 'Exclude';
        order?: number;
      }>;
    }>;
    requiredDocumentation?: string[];
  };

  @IsOptional()
  @IsArray()
  availableMedications?: Array<{
    name: string;
    dosage?: string;
    route?: string;
  }>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  availableTests?: string[];

  @IsOptional()
  @IsArray()
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
      spO2?: string;
      respirationRate?: string;
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

  @IsOptional()
  @IsObject()
  conversationResponses?: {
    [category: string]: Array<{
      keywords: string[];
      response: string;
      weight?: number;
    }>;
  };

  @IsOptional()
  @IsBoolean()
  requiresProductSetup?: boolean;

  @IsOptional()
  @IsObject()
  productSetup?: {
    title?: string;
    description?: string;
    imageUrl?: string;
    steps?: string[];
    checklist?: string[];
    confirmText?: string;
  };

  @IsOptional()
  @IsObject()
  orthopedicWorksheet?: {
    demographics?: Record<string, string>;
    subjective?: Record<string, string | string[]>;
    objective?: Record<string, string[]>;
    measurements?: Array<{
      title: string;
      rows: Array<{
        label: string;
        left?: string;
        right?: string;
        value?: string;
      }>;
    }>;
    specialTests?: Array<{ name: string; result: string }>;
    keyFindings?: string[];
    locationSpecificInformation?: string;
    simulationFocus?: string[];
  };

  @IsOptional()
  @IsObject()
  aiPatientData?: {
    openingReasonForVisit?: string;
    mainConcernAttributes?: string;
    associatedSymptoms?: string;
    currentMedications?: string;
    diagnosedChronicIllnesses?: string;
    familyMedicalHistory?: string;
    relationshipStatusSexualHealth?: string;
    personalSocialHistory?: string;
    emotionalStatePersonality?: string;
    conversationalAttitudeSpeechStyle?: string;
    specialPatientInfo?: string;
    locationSpecificInfo?: string;
    diet?: string;
    exercise?: string;
    stress?: string;
    sleep?: string;
    adls?: string;
  };

  @IsOptional()
  @IsString()
  preBriefPdf?: string;

  @IsOptional()
  @IsString()
  scenarioImage?: string;

  @IsOptional()
  @IsBoolean()
  enableStudentBriefing?: boolean;

  @IsOptional()
  @IsObject()
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

  @IsOptional()
  @IsObject()
  sbar?: {
    situation?: string;
    background?: string;
    assessment?: string;
    recommendation?: string;
  };

  @IsOptional()
  @IsArray()
  orders?: unknown[];

  @IsOptional()
  @IsArray()
  sequences?: Array<{
    parentRef: string;
    assessmentMethod?: 'questionAsked' | 'patientInformationUpdated';
    timing?: { mode: 'anytime' } | { mode: 'withinMinutes'; withinMinutesFromStart: number };
    orderControl?: 'strict' | 'flexible';
    before?: Array<{
      ref: string;
      assessmentMethod?: 'questionAsked' | 'patientInformationUpdated';
    }>;
    after?: Array<{
      ref: string;
      assessmentMethod?: 'questionAsked' | 'patientInformationUpdated';
    }>;
  }>;

  @IsOptional()
  @IsArray()
  sequenceGroups?: Array<{
    id: string;
    label: string;
    mode: 'strict' | 'flexible';
    color?: string;
    items: Array<
      | string
      | {
          id: string;
          timing?: { mode: 'anytime' } | { mode: 'withinMinutes'; withinMinutesFromStart: number };
          timingReferenceItem?: string;
          assessmentMethod?: 'questionAsked' | 'patientInformationUpdated';
        }
    >;
    subgroups?: Array<{
      id: string;
      label: string;
      mode: 'strict' | 'flexible';
      items: Array<
        | string
        | {
            id: string;
            timing?:
              { mode: 'anytime' } | { mode: 'withinMinutes'; withinMinutesFromStart: number };
            timingReferenceItem?: string;
            assessmentMethod?: 'questionAsked' | 'patientInformationUpdated';
          }
      >;
    }>;
    childOrder?: string[];
  }>;

  @IsOptional()
  @IsString()
  sequenceGroupsOrderMode?: 'strict' | 'flexible';

  @IsOptional()
  @IsObject()
  timeline?: {
    sequences?: Array<{
      parentRef: string;
      assessmentMethod?: 'questionAsked' | 'patientInformationUpdated';
      timing?: { mode: 'anytime' } | { mode: 'withinMinutes'; withinMinutesFromStart: number };
      orderControl?: 'strict' | 'flexible';
      before?: Array<{ ref: string; assessmentMethod?: string }>;
      after?: Array<{ ref: string; assessmentMethod?: string }>;
    }>;
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
  };

  @IsOptional()
  @IsArray()
  actionCategories?: ActionCategory[];

  @IsOptional()
  @IsObject()
  teamCommunication?: unknown;

  @IsOptional()
  @IsString()
  simulationStartTime?: string;

  @IsOptional()
  @IsString()
  simulationStartDate?: string;

  @IsOptional()
  @IsString()
  additionalEquipment?: string;

  @IsOptional()
  @IsString()
  optionalEquipment?: string;

  @IsOptional()
  @IsString()
  setupNotes?: string;

  @IsOptional()
  @IsString()
  topicsAddressed?: string;

  @IsOptional()
  @IsString()
  @ValidateIf(
    (o: UpdateScenarioDto) =>
      o.estimatedDuration !== undefined &&
      o.estimatedDuration !== null &&
      o.estimatedDuration !== '',
  )
  @IsNotEmpty({ message: 'Estimated Duration of Active Simulation is required' })
  estimatedDuration?: string;

  @IsOptional()
  @IsString()
  prebriefScriptPdf?: string;

  @IsOptional()
  @IsString()
  debriefPointsPdf?: string;

  @IsOptional()
  @IsString()
  setupNotesPdf?: string;

  @IsOptional()
  @IsString()
  facilitationNotesPdf?: string;

  @IsOptional()
  @IsString()
  printableSbarPdf?: string;

  @IsOptional()
  @IsString()
  printablePatientChartPdf?: string;

  @IsOptional()
  @IsString()
  @IsIn(['HS', 'PS'])
  patientChartMode?: 'HS' | 'PS';

  @IsOptional()
  @IsObject()
  realClinical?: {
    enabled: boolean;
    steps: Array<{
      id: string;
      actionId?: string;
      label?: string;
      activityType?: string;
      order?: number;
    }>;
    completedStepIds?: string[];
  };

  @IsOptional()
  @IsObject()
  hsRealClinical?: {
    enabled: boolean;
    steps: Array<{
      id: string;
      actionId?: string;
      label?: string;
      activityType?: string;
      order?: number;
    }>;
    completedStepIds?: string[];
  };

  @IsOptional()
  @IsObject()
  psRealClinical?: {
    enabled: boolean;
    steps: Array<{
      id: string;
      actionId?: string;
      label?: string;
      activityType?: string;
      order?: number;
    }>;
    completedStepIds?: string[];
  };
}
