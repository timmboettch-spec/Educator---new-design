import { AppStatus } from './utils/messages';
import { CommonStatus } from './enums/status.enum';
import { RoleSlug } from './constants';
import { ICurrentUser } from './interfaces/auth.interface';

export interface ApiResponse<data = string | number | boolean | object | null> {
  status: AppStatus;
  code?: string;
  message: string;
  data?: data | null;
}

export interface ServiceResponse<T = string | number | boolean | object | null> {
  success: boolean;
  message?: string;
  data?: T;
  type?: string;
}

export interface StudentCsvRow {
  student_id: string;
  student_name: string;
  email?: string | null;
  class_id: string;
  user_id: string;
}

export interface ReportData {
  score?: number | null;
  totalTimeSeconds?: number | null;
  createdAt?: string;
}

export interface SimulationLibraryItem {
  id: string;
  title: string;
  category: string;
  assigned: boolean;
  rating: number;
  duration: string;
  image?: string;
  description?: string;
}

export interface StudentInput {
  student_id: string;
  student_name: string;
  email?: string | null;
}

export interface FormattedUser {
  id: string;
  email?: string | null;
  fullName: string;
  status: CommonStatus;
  role: { id: string; role_name: string } | null;
  parent_id: string | null;
  school: { id: string; school_name: string } | null;
}

export interface MappedSimulation {
  id: string;
  class_id: string;
  simulation_id: string;
  start_date?: string;
  due_date?: string;
  end_date?: string;
  created_at: Date;
  updated_at: Date;
  simulation_title: string | null;
  unit_name: string | null;
  unit_id: string | null;
  scenario_status: string | null;
  avatarEnabled: boolean | null;
  estimated_duration: string | null;
  difficulty: string | null;
  learner_level: string | null;
  purpose: string | null;
}

export interface FormattedSingleUser {
  id: string;
  email: string;
  fullName: string;
  status: CommonStatus;
  role: { id: string; role_name: string } | null;
  parent_id: string | null;
  school: { id: string; school_name: string } | null;
  profilePicture?: string;
}

export type BulkUploadResult = {
  total: number;
  inserted: number;
  failedCount: number;
  failed: { row: StudentCsvRow; error: string }[];
};

export interface AuthRequest extends Request {
  user: {
    userId: string;
    email: string;
    roles?: RoleSlug[];
  };
}
/**
 * `user` is exactly what `JwtStrategy.validate()` returns — reuse `ICurrentUser` rather than
 * restating its shape, so a new field added there can't silently go missing at `@Req()` sites.
 */
export interface JwtRequest extends Request {
  user: ICurrentUser;
}

export interface FlatfileRecord {
  netsuite_id: string;
  so: string;
  seats: string | number;
  line: number;
  sku: string;
  product_name: string;
  qty: number;
  type: string;
  sim_group: string | null;
  category: string;
  platform: string;
  ai: string;
  hw: string;
  start: string;
  end: string;
}

export interface EducatorToken {
  product_name: string;
  token: number;
  consumed: number;
  active: number;
  expired: number;
}

export interface SubscriptionSummary {
  index: number;
  redeem_code: string;
  netsuite_id: string;
  start: string;
  end: string;
  product_name: string[];
  ai: string[];
  platform: string[];
  ai_seats: number;
  seats_available: number;
  ai_simulation_groups: string[];
  devices_registered: string[];
  hw_support_until: string | null;
}

export interface FlatfileRecord {
  netsuite_id: string;
  so: string;
  seats: string | number;
  line: number;
  sku: string;
  product_name: string;
  qty: number;
  type: string;
  sim_group: string | null;
  category: string;
  platform: string;
  ai: string;
  hw: string;
  start: string;
  end: string;
}

export interface EducatorToken {
  product_name: string;
  token: number;
  consumed: number;
  active: number;
  expired: number;
}

export interface SubscriptionSummary {
  index: number;
  redeem_code: string;
  netsuite_id: string;
  start: string;
  end: string;
  product_name: string[];
  ai: string[];
  platform: string[];
  ai_seats: number;
  seats_available: number;
  ai_simulation_groups: string[];
  devices_registered: string[];
  hw_support_until: string | null;
}

export interface ExpressFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  destination: string;
  filename: string;
  path: string;
  buffer: Buffer;
}

export interface BlobScenario {
  id: string;
  /** C1 effective voice, resolved on read; absent on most list items (batch reads skip it). */
  voiceProfile?: import('./interfaces/voice-profile.interface').IScenarioVoiceProfile | null;
  title: string;
  unitId: string;
  difficulty?: string;
  avatarId?: string;
  scenarioImage?: string | null;
  contextId?: string;
  learnerLevel?: string;
  department?: string;
  description?: string;
  learningObjective?: string;
  learningObjectiveCard?: string;
  class?: string;
  language?: string;
  voice?: string;
  status?: string; // lowercase — used by other blob scenario files
  avatarEnabled?: boolean;
  actionGroupName?: string;
  actionGroupDescription?: string;
  estimatedDuration?: string;
  requiresProductSetup?: boolean;
  enableStudentBriefing?: boolean;
  parent_scenario_id?: string;
  version_number?: number;
  patientChartMode?: string;
  simulationStartTime?: string;
  additionalEquipment?: string;
  optionalEquipment?: string;
  setupNotes?: string;
  topicsAddressed?: string;
  prebriefScriptPdf?: string;
  debriefPointsPdf?: string;
  setupNotesPdf?: string;
  facilitationNotesPdf?: string;
  printableSbarPdf?: string;
  printablePatientChartPdf?: string;
  sequenceGroupsOrderMode?: string;
  conversationResponses?: unknown[];
  sequences?: unknown[];
  sequenceGroups?: unknown[];
  teamCommunication?: Record<string, unknown>;
  orthopedicWorksheet?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  patientData?: {
    name?: string;
    gender?: string;
    age?: number;
    vitals?: Record<string, string>;
    chiefComplaint?: string;
    [key: string]: unknown;
  };
  aiPatientData?: Record<string, unknown>;
  studentBriefing?: {
    purpose?: string;
    timeAllotment?: string;
    learningObjectives?: string;
    [key: string]: unknown;
  };
  sbar?: {
    situation?: string;
    background?: string;
    assessment?: string;
    recommendation?: string;
    [key: string]: unknown;
  };
  actions?: unknown[];
  expectedActions?: Record<string, unknown>;
  historyPrompts?: unknown[];
  assessmentGuidance?: Record<string, unknown>;
  phases?: unknown[];
  availableMedications?: unknown[];
  orders?: unknown[];
  actionCategories?: unknown[];
  grading?: Record<string, unknown>;
  timeline?: Record<string, unknown>;
  productSetup?: { title?: string; [key: string]: unknown };
  /** Unit data merged in by getAllSimulationData() */
  unit?: BlobUnit;
}

export interface BlobUnit {
  id: string;
  name: string;
  category: string;
  imageUrl?: string;
  description?: string;
}
