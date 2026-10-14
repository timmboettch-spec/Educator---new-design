import type {
  Action,
  ActionCategory,
  AIPatientData,
  OrthopedicWorksheet,
  ScenarioSequenceDefinition,
  SequenceGroupDefinition,
} from './student-scenario.interface';
import type {
  LibraryLearnerLevel,
  LibraryModality,
  SimulationPatientChartMode,
  SimulationSequenceGroupsOrderMode,
  SimulationStatus,
} from 'src/common/constants';
import { SimulationGradingRubricItem } from 'src/database/entities';
import type { BlobScenario } from 'src/common/types';

export type { ActionCategory } from './student-scenario.interface';

export interface IProductSetup {
  title?: string;
  description?: string;
  imageUrl?: string;
  steps?: string[];
  checklist?: string[];
  confirmText?: string;
}

export interface ISimulationStudentBriefing {
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
}

export interface ISimulationSbar {
  situation?: string;
  background?: string;
  assessment?: string;
  recommendation?: string;
}

export interface ISimulationRealClinicalStep {
  id: string;
  actionId?: string;
  label?: string;
  activityType?: string;
  order?: number;
}

export interface ISimulationRealClinical {
  enabled: boolean;
  steps: ISimulationRealClinicalStep[];
}

export interface ISimulationPatientDataVitals {
  heartRate?: string;
  bloodPressure?: string;
  respiratoryRate?: string;
  spO2?: string;
  temperature?: string;
  weight?: string;
  height?: string;
}

export interface ISimulationPatientDataSocialHistory {
  tobacco?: string;
  alcohol?: string;
  drugs?: string;
  exercise?: string;
  housing?: string;
}

export interface ISimulationPatientDataLifestyle {
  housing?: string;
  transportation?: string;
  occupation?: string;
  diet?: string;
  exercise?: string;
  stress?: string;
  sleep?: string;
}

export interface ISimulationPatientDataSampleHistoryAudioResponses {
  signsAndSymptoms?: string;
  allergies?: string;
  medications?: string;
  medicalHistory?: string;
  lastOralIntake?: string;
  eventsLeadingUp?: string;
}

/** Legacy SAMPLE history (backwards compatible) */
export interface ISimulationPatientDataSampleHistory {
  signsAndSymptoms?: string;
  allergies?: string;
  medications?: string;
  pastMedicalHistory?: string;
  lastOralIntake?: string;
  eventsLeadingUp?: string;
  audioResponses?: ISimulationPatientDataSampleHistoryAudioResponses;
}

export interface ISimulationPatientData {
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
  vitals?: ISimulationPatientDataVitals;
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
  socialHistory?: ISimulationPatientDataSocialHistory;
  lifestyle?: ISimulationPatientDataLifestyle;
  historyVisibility?: Record<string, boolean>;
  sampleHistory?: ISimulationPatientDataSampleHistory;
}

export interface ISimulationGradingComponentWeightDescription {
  weight: number;
  description: string;
}

export interface ISimulationGradingComponentWeightOnly {
  weight: number;
}

export interface ISimulationGradingComponents {
  communication?: ISimulationGradingComponentWeightDescription;
  clinicalAccuracy?: ISimulationGradingComponentWeightDescription;
  technicalSkill?: ISimulationGradingComponentWeightDescription;
  documentation?: ISimulationGradingComponentWeightDescription;
  softSkills?: ISimulationGradingComponentWeightOnly;
  technicalSkills?: ISimulationGradingComponentWeightOnly;
}

export interface ISimulationGrading {
  maxScore: number;
  components?: ISimulationGradingComponents;
  rubric?: Partial<SimulationGradingRubricItem>[];
  requiredDocumentation?: string[];
}

export interface ISimulationMetadata {
  scenarioType?: string;
  estimatedDuration?: string;
  version?: string;
  createdBy?: string;
}

export interface ISimulationConversationResponseEntry {
  keywords: string[];
  response: string;
  weight?: number;
}

export interface ISimulationExpectedActions {
  labs?: string[];
  imaging?: string[];
  physicalExam?: string[];
  medications?: string[];
}

export interface ISimulationAssessmentGuidance {
  actions?: string[];
  educationPoints?: string[];
}

export interface ISimulationAvailableMedication {
  name: string;
  dosage?: string;
  route?: string;
}

export interface ISimulationPhaseVitalsPulseQuality {
  carotid?: string;
  radial?: string;
  brachial?: string;
  pedal?: string;
}

export interface ISimulationPhaseVitalsTemperature {
  oral?: string;
  forehead?: string;
  rectal?: string;
}

export interface ISimulationPhaseVitals {
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
  pulseQuality?: ISimulationPhaseVitalsPulseQuality;
  temperature?: ISimulationPhaseVitalsTemperature;
}

export interface ISimulationPhaseSampleHistoryEntry {
  text?: string;
  audio?: string;
}

export interface ISimulationPhaseSampleHistory {
  signsAndSymptoms?: ISimulationPhaseSampleHistoryEntry;
  allergies?: ISimulationPhaseSampleHistoryEntry;
  medications?: ISimulationPhaseSampleHistoryEntry;
  pastMedicalHistory?: ISimulationPhaseSampleHistoryEntry;
  lastOralIntake?: ISimulationPhaseSampleHistoryEntry;
  eventsLeadingUp?: ISimulationPhaseSampleHistoryEntry;
}

export interface ISimulationPhaseSounds {
  heartSounds?: { [location: string]: string };
  lungSounds?: { [location: string]: string };
  bowelSounds?: { [location: string]: string };
}

export interface ISimulationPhaseTask {
  id: string;
  label: string;
  required?: boolean;
  autoAssessable?: boolean;
}

export interface ISimulationPhase {
  id: string;
  name: string;
  description: string;
  avatarDescription?: string;
  vitals?: ISimulationPhaseVitals;
  sampleHistory?: ISimulationPhaseSampleHistory;
  sounds?: ISimulationPhaseSounds;
  tasks?: ISimulationPhaseTask[];
}

export interface ISimulationTimelineSettings {
  totalScenarioDurationSeconds?: number;
  allowEarlyCompletion?: boolean;
  enforceStrictTiming?: boolean;
  showTimerToLearner?: boolean;
  pauseTimerOnInactivity?: boolean;
  inactivityThresholdSeconds?: number;
}

export interface ISimulationTimeline {
  timelineElements?: unknown[];
  alwaysAvailableElements?: unknown[];
  sequenceRules?: unknown[];
  assessmentConfigs?: unknown[];
  settings?: ISimulationTimelineSettings;
  phases?: unknown[];
  blocks?: unknown[];
  sequenceChain?: unknown[];
}

export interface ISimulations {
  id: string;
  unitId: string;
  title: string;
  difficulty: string;
  learnerLevel: string;
  department: string;
  description: string;
  learningObjective: string | string[];
  disabled?: boolean;
  status?: SimulationStatus;
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
  studentBriefing?: ISimulationStudentBriefing;
  sbar?: ISimulationSbar;

  avatarEnabled?: boolean;
  avatarId?: string;
  contextId?: string;
  requiresProductSetup?: boolean;
  productSetup?: IProductSetup;

  realClinical?: ISimulationRealClinical;
  hsRealClinical?: ISimulationRealClinical;
  psRealClinical?: ISimulationRealClinical;

  patientData: ISimulationPatientData;
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
  grading?: ISimulationGrading;
  // ── TAB: Sequencing ───────────────────────────────────────────────────────
  sequences?: ScenarioSequenceDefinition[];
  sequenceGroups?: SequenceGroupDefinition[];
  sequenceGroupsOrderMode?: SimulationSequenceGroupsOrderMode;
  simulationStartTime?: string;
  // ── System / Legacy Fields (no active UI tab) ─────────────────────────────
  metadata?: ISimulationMetadata;
  conversationResponses?: {
    [category: string]: ISimulationConversationResponseEntry[];
  };
  expectedActions?: ISimulationExpectedActions;
  historyPrompts?: string[];
  assessmentGuidance?: ISimulationAssessmentGuidance;
  learningObjectiveCard?: string;
  availableMedications?: ISimulationAvailableMedication[];
  availableTests?: string[];
  phases?: ISimulationPhase[];
  timeline?: ISimulationTimeline;
  patientChartMode?: SimulationPatientChartMode;
}

/**
 * Types below back `SimulationModule` (`src/simulation/`), moved here from the
 * module-local `src/simulation/dto/simulation.types.ts`, which no longer exists.
 */

export interface SimulationReview {
  reviewer: string;
  rating: number;
  title: string;
  comment: string;
  date: string;
}

export interface RatingBreakdown {
  stars: number;
  count: number;
}

export interface WhatsNew {
  version: string;
  timeAgo: string;
  notes: string;
}

export interface SimulationItem {
  id: number;
  scenario_id: string | null;
  scenarioId: string | null;
  title: string;
  unit: string;
  unit_id: string | null;
  unit_image: string | null;
  scenario_count: number;
  category: string;
  target_audience: string;
  difficulty_level?: string;
  estimated_duration?: string;
  language: string;
  purpose?: string;
  description?: string;
  learning_objectives: string[];
  rating: number;
  total_ratings: number;
  usage?: string;
  scenarioImage?: string;
  image_url?: string;
  images: string[];
  rating_breakdown: RatingBreakdown[];
  reviews: SimulationReview[];
  whats_new?: WhatsNew;
  simulation_privacy?: string;
  developer?: string;
  institution?: string;
  status?: string;
  last_update?: string;
  created_at: Date;
  updated_at: Date;
}

export interface DashboardCard {
  id: string;
  title: string;
  image: string | null;
  scenarioImage: string | null;
  cta: string;
  unit: string;
  difficulty: string | null;
  targetAudience: string[];
}

export interface SimulationDashboard {
  banner: { title: string; subtitle: string; image: string | null };
  filters: { fields: Array<{ key: string; label: string; options: string[] }> };
  browseBy: {
    filters: Array<{ id: string; label: string; active: boolean }>;
    items: Array<{
      id: number;
      title: string;
      description: string;
      duration: string;
      image: string | null;
      cta: string;
      unit: string;
    }>;
  };
  sections: Array<{
    key: string;
    title: string;
    viewAll: boolean;
    type: string;
    items: DashboardCard[];
  }>;
}

/**
 * Response body of `GET /api/simulations/combined`. The `catalog` key is
 * part of that published payload, so it keeps its name even though the type was
 * renamed off "catalog".
 */
export interface CombinedSimulationData {
  dashboard: SimulationDashboard;
  catalog: SimulationItem[];
  scenarios: Array<BlobScenario & { unit_image: string | null; in_library: boolean }>;
}

/** The filters and search a My Library list request may carry; an absent key applies no filter. */
export interface IMyLibraryFilters {
  /** Normalized title text (whitespace collapsed); a title containing it matches. */
  search?: string;
  /** Any-of. Both levels together match every Simulation that has audience text. */
  learnerLevels?: LibraryLearnerLevel[];
  /** Any-of, each value already normalized (whitespace collapsed, lower case). */
  targetAudiences?: string[];
  /** Any-of, each value already normalized (whitespace collapsed, lower case). */
  productNames?: string[];
  /** Any-of. Both modalities together match every Simulation. */
  modality?: LibraryModality[];
  /** Any-of, each value already normalized (whitespace collapsed, lower case). */
  difficulties?: string[];
  /** Any-of Unit ids, compared exactly with the Simulation's current Unit. */
  unitIds?: string[];
}

/** `EducatorSimulationRepository.findVisiblePageByEducatorId()` params and result. */
export interface IMyLibraryListParams {
  educatorId: string;
  skip: number;
  take: number;
  filters?: IMyLibraryFilters;
  /** Selects the lite (card-only) variant; see the repository's overloads. */
  lite?: boolean;
}

/** The lite row: only what a library card needs. */
export interface IMyLibraryLiteRow {
  /** The `educator_simulations` row id (the saved library entry). */
  id: string;
  /** The simulation's own business id (`simulations_v2.id`). */
  scenarioId: string;
  title: string;
  description: string | null;
  learnerLevel: string | null;
  difficulty: string | null;
  /** `avatar_enabled`: true for an avatar simulation, false (or missing) for a workstation one. */
  avatarEnabled: boolean;
}

/** The Simulation's current unit; `null` on the row when the unit no longer exists. */
export interface IMyLibraryUnit {
  id: string;
  name: string;
  imageUrl: string | null;
}

/**
 * The full row: the lite row plus what the library screen renders beyond the card. Widen this
 * type (not the lite one) when the full variant gains fields.
 */
export interface IMyLibraryFullRow extends IMyLibraryLiteRow {
  unitId: string;
  unit: IMyLibraryUnit | null;
  /** `estimated_duration`; null when missing or blank (no fallback to `timeAllotment`). */
  estimatedDuration: string | null;
  /** `student_briefing.timeAllotment`; null when missing or blank. */
  timeAllotment: string | null;
  scenarioImage: string | null;
  /** `product_setup.title`. */
  productName: string | null;
  /** `department`: where the simulation is set (the frontend's "Clinical Setting"). */
  clinicalSetting: string | null;
  /** `learning_objective` as a clean list; empty when none. */
  learningObjectives: string[];
}

/** Raw `getRawMany()` shape — snake_case SELECT aliases. */
export interface IMyLibraryListRawRow {
  id: string;
  scenario_id: string;
  title: string;
  description: string | null;
  learner_level: string | null;
  difficulty: string | null;
  avatar_enabled: boolean;
}

/** Raw shape of the full variant: the lite aliases plus the full columns. */
export interface IMyLibraryFullListRawRow extends IMyLibraryListRawRow {
  /** `null` when the Simulation has no current unit. */
  unit_id: string | null;
  unit_ref_id: string | null;
  unit_name: string | null;
  unit_image_url: string | null;
  estimated_duration: string | null;
  time_allotment: string | null;
  scenario_image: string | null;
  product_name: string | null;
  department: string | null;
  /** JSONB: one newline-separated text or an array of texts. */
  learning_objective: string | string[] | null;
}

export interface IMyLibraryLiteListResult {
  rows: IMyLibraryLiteRow[];
  total: number;
}

export interface IMyLibraryFullListResult {
  rows: IMyLibraryFullRow[];
  total: number;
}

/** Params of a filter dropdown query (Units, Target Audiences, Required Product Names) of a scope. */
export interface FilterDropdownParams {
  /** The Educator whose library is read; the Catalogue scope ignores it. */
  educatorId: string;
  /** Already normalized (whitespace collapsed, lower case); `undefined` means no search. */
  search?: string;
  skip: number;
  take: number;
}

/** One page of a filter dropdown's values and the count of all of them. */
export interface FilterDropdownPage<T> {
  items: T[];
  total: number;
}
