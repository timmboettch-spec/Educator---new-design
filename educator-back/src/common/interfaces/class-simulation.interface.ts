import type { ClassSimulation } from 'src/database/entities';
import type {
  ClassSimulationAssignmentFailureReason,
  ClassSimulationAssignmentStatus,
} from '../constants/class-simulation.constants';

/** Normalised (`YYYY-MM-DD`) assignment window shared by every pair in one bulk request. */
export interface IAssignmentDateRange {
  startDate?: string | null;
  endDate?: string | null;
}

/** Per-pair outcome of `POST /class-simulations/bulk`; `message` is an i18n key until the edge. */
export interface IBulkAssignPairOutcome {
  classId: string;
  simulationId: string;
  status: ClassSimulationAssignmentStatus;
  reason?: ClassSimulationAssignmentFailureReason;
  message?: string;
}

/** One row `ClassSimulationRepository.createManyAndChargeSeats` inserts. */
export interface IBulkAssignClassSimulationRow {
  classId: string;
  simulationId: string;
  startDate: string;
  dueDate: string;
  endDate: string;
  isAi: boolean;
}

export interface IBulkAssignClassSimulationsInput {
  educatorId: string;
  /** Total AI seats to deduct from the educator; 0 skips the educator update. */
  seatsToCharge: number;
  rows: IBulkAssignClassSimulationRow[];
}

export interface IBulkAssignClassSimulationsResult {
  /** Saved rows, in the same order as `input.rows`; empty when `conflicts` is not. */
  saved: ClassSimulation[];
  /**
   * Active assignments that overlap a requested row, found under the class lock (e.g. a duplicate
   * request committed in the meantime). Non-empty → nothing was written and nothing was charged.
   */
  conflicts: ClassSimulation[];
  previousTokens: number;
  newTokens: number;
}
