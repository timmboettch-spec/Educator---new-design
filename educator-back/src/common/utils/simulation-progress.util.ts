import { StudentSimulationProgress } from 'src/database/entities';
import {
  SimulationAttemptConstants,
  SimulationProgressStatus,
} from 'src/common/constants/simulation-progress.constants';

/** True when the student may Forfeit: still in progress, with 1..Max-1 Assessment Attempts used. */
export function canForfeitSimulation(progress: StudentSimulationProgress | undefined): boolean {
  return (
    progress?.status === SimulationProgressStatus.IN_PROGRESS &&
    progress.assessmentAttemptsCount >= 1 &&
    progress.assessmentAttemptsCount < SimulationAttemptConstants.MAX_ASSESSMENT_ATTEMPTS
  );
}
