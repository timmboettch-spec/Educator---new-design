export interface MenuItem {
  label: string;
  href: string;
}
export interface User {
  id: string;
  email: string;
  full_name: string;
  is_license_active: boolean;
}

export type Class = {
  class_name: string;
  school_name: string;
  status: 'active' | 'inactive';
};

export type EducatorStatus = 'ACTIVE' | 'INACTIVE' | 'PENDING';

export interface SchoolSummary {
  id: string;
  school_name: string;
  lms_enabled?: boolean;
}

export interface Educator {
  id: string;
  full_name?: string;
  school_name?: string;
  email?: string;
  status?: EducatorStatus | string;
  school_id?: string;
  schools?: SchoolSummary[];
  class_id?: string;
  class_name?: string;
  educator_name?: string;
  tokens?: number;
  remainingTokens?: number;
  totalTokens?: number;
  tokensUsed?: number;
  createdAt?: string;
}

export interface EducatorFormValues {
  full_name: string;
  email: string;
  status: string;
  school_id: string;
  tokens: number;
}
export interface EducatorFilterState {
  educator_id: string;
  school_id: string;
  status: string;
}
export interface SchoolFormValues {
  school_name: string;
  status: string;
  google_classroom_enabled: boolean;
}

export interface MenuItem {
  label: string;
  href: string;
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  is_license_active: boolean;
  profile_picture: string;
  profile_image: string;
  role: string;
  tokens: number;
  tokens_used: number;
  subscriptions?: {
    id: string;
    status: string;
    current_period_end: number;
    ai_seats: number;
    seats_available: number;
  }[];
}

export interface Subscription {
  end?: string;
  product_name?: string[];
  platform?: string[];
  ai_seats?: number;
  seats_available?: number;
  netsuite_id?: string;
  redeem_code?: string;
  devices_registered?: string[];
  hw_support_until?: string;
  ai?: boolean[];
  [key: string]: unknown;
}

export interface Student {
  id?: string;
  student_id: string | null;
  student_name: string | null;
  email: string | null;
  class_id?: string;
  user_id?: string;
  status?: 'ACTIVE' | 'INACTIVE' | 'DRAFT' | 'ATTENTION' | 'ARCHIEVED';
  score: number | null;
  isEarlyCompletion?: boolean;
  attempt?: number | null;
  sims_completed?: string | null;
  submission_date?: string | null;
  time_spent?: string | null;
  time_remaining?: string | null;
  created_at?: Date;
  first_name?: string;
  last_name?: string;
  phone?: string;
  _source?: 'cloud' | 'hybrid';
}

export interface StudentRow {
  student_code: string;
  student_name: string;
  email: string;
  timeSpent: string;
  timeRemaining: string;
  simsCompleted: string;
  avgScore: string;
  reports: string;
}
export interface SchoolFormValues {
  school_name: string;
  status: string;
  google_classroom_enabled: boolean;
}

export interface ClassSource {
  type: 'class';
  classId: string;
  className?: string;
  startDate?: string;
  endDate?: string;
}

export interface SimSource {
  type: 'sim';
  simId: string;
  simName: string;
  startDate: string;
  endDate: string;
  className?: string;
  class_id?: string;
}

export type ExportSource = ClassSource | SimSource;

export interface NestedSim {
  id: string;
  title: string;
  status?: string;
  score?: number | null;
}

export interface StudentWithSims extends Student {
  simulation_id?: string;
  simulation_name?: string;
  simulations?: NestedSim[];
}

export const TABLE_HEADERS = ['Student Name', 'Score', 'Status'];

export interface SimulationItem {
  id: string;
  simulation_id: string;
  simulation_title: string;
  simulation_lib_name: string;
  unit: string;
  unit_name: string;
  start_date: string;
  due_date: string;
  end_date: string;
  class_id: string;
  class_name: string;
  user_id: string;
  image_url: string;
  created_at: string;
  email: string;
  avatarEnabled?: boolean;
  scenario_status?: string | null;
  [key: string]: unknown;
}
export interface SimulationApiResponse {
  id: string;
  simulation_id?: string;
  simulation_title?: string;
  unit_id?: string;
  unit_name?: string;
  class_id?: string;
  start_date?: string;
  due_date?: string;
  end_date?: string;
  created_at?: string;
  scenario_status?: string | null;
  simulation?: {
    id?: string;
    title?: string;
    unit?: string;
    unit_id?: string;
    category?: string;
    image_url?: string;
    libraryItem?: { name?: string; [key: string]: unknown };
    [key: string]: unknown;
  };
}
export interface SimulationsState {
  simulationsByClass: Record<string, SimulationItem[]>;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

export interface ReportItem {
  scenario_id?: string;
  student_name?: string;
  report_data?: {
    score?: number;
    summary?: string;
  };
}

export interface ReportData {
  student_name?: string;
  scenario_id?: string;
  score?: number;
  rubricsSummary?: string;
  reports?: ReportItem[];
}

export interface StudentAccess {
  studentName: string;
  accessCode: string;
}

export interface SimItem {
  id: string;
  simulation_name: string;
  start_date: string;
  due_date: string;
  end_date: string;
  unit?: string;
  category?: string;
  unit_category?: string;
  simulation_id?: string;
}

export interface SimulationOption {
  id: string;
  title: string;
  scenario_id: string;
}

export interface SimulationDetail {
  id: string | number;
  title: string;
  subtitle?: string;
  scenarioImage?: string;
  image_url?: string;
  images?: string[];
  usage?: string;
  unit?: string;
  category?: string;
  targetAudience?: string[];
  language?: string;
  purpose?: string;
  description?: string;
  learning_objectives?: string[];
  difficultyLevel?: string;
  estimatedDuration?: string;
  avatarEnabled?: boolean;
  whats_new?: {
    version: string;
    timeAgo: string;
    notes: string;
  };
  tries_left?: number;
  simulation_privacy?: string;
  developer?: string;
  institution?: string;
  last_update?: string;
  department?: string;
  learnerLevel?: string;
  learningObjective?: string;
  voice?: string;
  sbar?: {
    situation?: string;
    background?: string;
    assessment?: string;
    recommendation?: string;
  };
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
    closingReminder?: string;
  };
  topicsAddressed?: string;
  productName?: string;
  additionalEquipment?: string;
  optionalEquipment?: string;
  setupNotes?: string;
  prebriefScriptPdf?: string;
  debriefPointsPdf?: string;
  setupNotesPdf?: string;
  facilitationNotesPdf?: string;
  printableSbarPdf?: string;
  printablePatientChartPdf?: string;
  historyVisibility?: string;
  simulationStartTime?: string;
  productSetup?: {
    title?: string;
  };
  grading?: {
    debriefReflectionPrompt?: string;
    maxScore?: number;
    showDebriefToStudents?: boolean;
    components?: Record<string, { weight?: number } | undefined>;
  };
  teamCommunication?: {
    prompt?: string;
    limitType?: string;
    failMessage?: string;
    maxAttempts?: number;
    passMessage?: string;
    passThreshold?: number;
    typeRequirement?: string;
    referenceTranscript?: string;
    onPassUnlockOrderIds?: string[];
  };
  actions?: Record<string, unknown>[];
  assessments?: Record<string, unknown>[];
  interventions?: Record<string, unknown>[];
  tasks?: Record<string, unknown>[];
  orders?: Record<string, unknown>[];
  patientData?: {
    name?: string;
    age?: string;
    gender?: string;
    race?: string;
    preferredName?: string;
    dateOfBirth?: string;
    dobMonthDay?: string;
    chiefComplaint?: string;
    historyOfPresentIllness?: string;
    medicalHistory?: string;
    pastSurgicalHistory?: string;
    familyMedicalHistoryClinical?: string;
    primaryCareProvider?: string;
    allergies?: string[];
    currentMedications?: string[];
    immunizationHistory?: string[];
    historyVisibility?: Record<string, boolean>;
    vitals?: {
      height?: string;
      weight?: string;
    };
    lifestyle?: {
      diet?: string;
      exercise?: string;
      housing?: string;
      occupation?: string;
      sleep?: string;
      stress?: string;
      transportation?: string;
    };
    socialHistory?: {
      alcohol?: string;
      drugs?: string;
      tobacco?: string;
    };
  };
  aiPatientData?: {
    adls?: string;
    diet?: string;
    drugs?: string;
    sleep?: string;
    stress?: string;
    housing?: string;
    exercise?: string;
    allergies?: string;
    occupation?: string;
    medicalHistory?: string;
    transportation?: string;
    associatedSymptoms?: string;
    currentMedications?: string;
    specialPatientInfo?: string;
    familyMedicalHistory?: string;
    locationSpecificInfo?: string;
    mainConcernAttributes?: string;
    openingReasonForVisit?: string;
    personalSocialHistory?: string;
    diagnosedChronicIllnesses?: string;
    emotionalStatePersonality?: string;
    relationshipStatusSexualHealth?: string;
    conversationalAttitudeSpeechStyle?: string;
  };
}

export interface UnitScenario {
  id?: string | number;
  scenario_id?: string | number;
  scenarioId?: string | number;
  title?: string;
  subtitle?: string;
  scenarioImage?: string;
  imageURL?: string;
  imageUrl?: string;
  image_url?: string;
  image?: string;
  scenario_image?: string;
  cover_image?: string;
  coverImage?: string;
  thumbnail?: string;
  blob_url?: string;
  blobUrl?: string;
  images?: string[];
  usage?: string;
  unit_id?: string;
  category?: string;
  unit_category?: string;
  language?: string;
  targetAudience?: string[];
  difficultyLevel?: string;
  difficulty?: string;
  estimatedDuration?: string;
  duration?: string;
  purpose?: string;
  objective?: string;
  description?: string;
  learning_objectives?: string[];
  developer?: string;
  institution?: string;
  last_update?: string;
  updatedAt?: string;
  simulation_privacy?: string;
  avatarEnabled?: boolean;
  [key: string]: unknown;
}

export interface SectionItem {
  id: number;
  scenarioId?: string;
  myFavorite?: boolean;
  title: string;
  image: string;
  cta: string;
  highlight?: boolean;
  rating?: number;
  unit?: string;
  unit_name?: string;
  targetAudience?: string[];
  duration?: string;
  difficulty?: string;
  clinicalLocation?: string;
  purpose?: string;
  description?: string;
  images?: string[];
  category?: string;
  language?: string;
  subtitle?: string;
  developer?: string;
  institution?: string;
  last_update?: string;
  learning_objectives?: string[];
  avatarEnabled?: boolean;
}

export interface BannerData {
  title: string;
  subtitle: string;
  image: string;
}

export interface Section {
  key: string;
  title: string;
  type: 'carousel' | 'grid' | 'mixed';
  viewAll?: boolean;
  items: SectionItem[];
}

export interface BrowseByItem {
  id: number;
  title: string;
  description: string;
  duration: string;
  image: string;
  cta: string;
  unit?: string;
}

export interface FilterField {
  key: string;
  label: string;
  options: string[];
}

export interface CatalogData {
  banner: BannerData;
  filters: {
    fields: FilterField[];
  };
  browseBy: {
    filters: { id: string; label: string; active: boolean }[];
    items: BrowseByItem[];
  };
  sections: Section[];
}

export interface SimulationDetail {
  id: string | number;
  title: string;
  subtitle?: string;
  scenarioImage?: string;
  image_url?: string;
  images?: string[];
  usage?: string;
  unit?: string;
  category?: string;
  targetAudience?: string[];
  language?: string;
  tries_left?: number;
  purpose?: string;
  description?: string;
  learning_objectives?: string[];
  difficultyLevel?: string;
  estimatedDuration?: string;
  avatarEnabled?: boolean;
  whats_new?: { version: string; timeAgo: string; notes: string };
  simulation_privacy?: string;
  developer?: string;
  institution?: string;
  last_update?: string;
}

export interface SimulationReport {
  id: string;
  key: string;
  student_id: string;
  userId?: string;
  studentName: string;
  studentClass: string;
  scenarioTitle?: string;
  scenarioId?: string;
  score?: number;
  isEarlyCompletion?: boolean;
  performanceLabel?: string;
  createdAt?: string;
  created_at?: string;
  completed_at?: string;
  scoreJson?: {
    communication?: number;
    clinicalJudgment?: number;
    technicalAccuracy?: number;
  };
  [key: string]: unknown;
}
