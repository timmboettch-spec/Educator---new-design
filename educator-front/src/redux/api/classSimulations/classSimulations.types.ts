import type {
  PaginationDto,
  PaginationMetaDto,
  SortDir,
} from '../classes/classes.types';

// ─── Enums ────────────────────────────────────────────────────────────────────

/** Columns `/api/class-simulations` can sort by. */
export enum ClassSimulationSortField {
  SIM_ID = 'simId',
  SIM_NAME = 'simName',
  IS_ARCHIVED = 'isArchived',
  START_DATE = 'startDate',
  DUE_DATE = 'dueDate',
  CLOSE_DATE = 'closeDate',
  STARTED_COUNT = 'startedCount',
  COMPLETED_COUNT = 'completedCount',
  AVERAGE_SCORE = 'averageScore',
  AVATAR_ENABLED = 'avatarEnabled',
  UNIT_ID = 'unitId',
  UNIT_NAME = 'unitName',
}

// ─── GET /api/class-simulations (one class's assignments) ────────────────────

export interface ListClassSimulationsReqDto extends PaginationDto {
  classId: string;
  // Omitted = simName.
  sortBy?: ClassSimulationSortField;
  // Omitted = asc.
  sortDir?: SortDir;
}

export interface ClassSimulationListItemResDto {
  /** The assignment row id (a simulation can be assigned to a class more than once). */
  classSimulationId: string;
  /** The catalogue simulation id. */
  simId: string;
  simName: string | null;
  /** The simulation itself is archived (not the class). */
  isArchived: boolean;
  startDate: string | null;
  dueDate: string | null;
  closeDate: string | null;
  startedCount: number;
  completedCount: number;
  /** Mean of each student's best score, as a whole percentage. */
  averageScore: number | null;
  /** AI (avatar) simulation; `null` when the simulation no longer exists. */
  avatarEnabled: boolean | null;
  /** `null` when the simulation has no unit or no longer exists. */
  unitId: string | null;
  /** `null` when there's no unit, the unit is deleted or the simulation is gone. */
  unitName: string | null;
}

export interface ListClassSimulationsResponseDto {
  message: string;
  data: ClassSimulationListItemResDto[];
  meta: PaginationMetaDto;
}

// ─── PUT /api/class-simulations/:id (one assignment's dates) ─────────────────

/** Every field is optional: send only the dates that changed, as YYYY-MM-DD. */
export interface UpdateClassSimulationReqDto {
  startDate?: string;
  dueDate?: string;
  /** The close date; the listing calls it `closeDate`. */
  endDate?: string;
}

export interface UpdateClassSimulationResDto {
  id: string;
  classId: string;
  simulationId: string;
  startDate?: string;
  dueDate?: string;
  endDate?: string;
}

export interface UpdateClassSimulationResponseDto {
  message: string;
  data: UpdateClassSimulationResDto;
}

export interface UpdateClassSimulationArgs {
  /** The assignment id (`classSimulationId`). */
  id: string;
  body: UpdateClassSimulationReqDto;
}

// ─── POST /api/class-simulations/bulk (many simulations × many classes) ──────

/** BE array limits on the bulk assign body. */
export const BULK_ASSIGN_MAX_CLASSES = 20;
export const BULK_ASSIGN_MAX_SIMULATIONS = 10;

/** One set of dates is applied to every class × simulation pair. */
export interface BulkAssignClassSimulationsReqDto {
  /**
   * Mandatory: the BE refuses the request without it. It is always the school
   * group id the BE itself returned (`/api/classes/schools`), never typed in.
   */
  schoolId: string;
  classIds: string[];
  /** Simulation business ids (case-sensitive), e.g. `colostomy-care-and-education`. */
  simulationIds: string[];
  /** YYYY-MM-DD (the BE also accepts MM-DD-YYYY). */
  startDate: string;
  dueDate: string;
  endDate: string;
}

export enum BulkAssignPairStatus {
  CREATED = 'CREATED',
  VALID = 'VALID',
  FAILED = 'FAILED',
}

/** Why a pair was refused (422). */
export enum BulkAssignFailureReason {
  CLASS_NOT_ACCESSIBLE = 'CLASS_NOT_ACCESSIBLE',
  SIMULATION_NOT_FOUND = 'SIMULATION_NOT_FOUND',
  ALREADY_ASSIGNED_SAME_DATES = 'ALREADY_ASSIGNED_SAME_DATES',
  ALREADY_ASSIGNED_OVERLAP = 'ALREADY_ASSIGNED_OVERLAP',
}

export interface BulkAssignPairResultResDto {
  classId: string;
  simulationId: string;
  status: BulkAssignPairStatus;
  classSimulationId: string;
  /** AI (avatar) simulation that consumes seats. */
  isAi: boolean;
  seatsCharged: number;
  startDate: string;
  dueDate: string;
  endDate: string;
}

export interface BulkAssignClassSimulationsResDto {
  total: number;
  created: number;
  seatsCharged: number;
  remainingSeats: number;
  results: BulkAssignPairResultResDto[];
}

export interface BulkAssignClassSimulationsResponseDto {
  message: string;
  data: BulkAssignClassSimulationsResDto;
}

/** A pair in the 422 body; failed pairs carry a reason and message. */
export interface BulkAssignPairErrorResDto {
  classId: string;
  simulationId: string;
  status: BulkAssignPairStatus.VALID | BulkAssignPairStatus.FAILED;
  reason?: BulkAssignFailureReason;
  message?: string;
}

/** 422 body: nothing was assigned; every pair is listed. */
export interface BulkAssignClassSimulationsErrorResDto {
  message: string;
  error: {
    total: number;
    failed: number;
    results: BulkAssignPairErrorResDto[];
  };
}
