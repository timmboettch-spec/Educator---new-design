export type LmsSyncFailureReason =
  | 'lms_configuration'
  | 'lms_authentication'
  | 'lms_assignment_not_found'
  | 'lms_rejected_grade'
  | 'lms_unreachable'
  | 'unknown';

export interface LmsGradeSyncStatus {
  simulationId: string;
  studentId: string;
  status: 'sent' | 'failed';
  failureReason?: LmsSyncFailureReason;
}
