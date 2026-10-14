import { CommonStatus } from 'src/common/enums/status.enum';

export enum ClassSortField {
  CLASS_NAME = 'class_name',
  STUDENTS = 'students',
  SIMS = 'sims',
  REPORTS = 'reports',
  STATUS = 'status',
}

export enum ClassAttentionMeasure {
  ACTIVE = 'active',
  CLOSING_SOON = 'closingSoon',
  NEAR_AVATAR_LIMIT = 'nearAvatarLimit',
  UNREAD_REPORTS = 'unreadReports',
  NO_STUDENTS = 'noStudents',
  NO_ASSIGNED_SIMS = 'noAssignedSims',
}

export const ClassConstants = {
  ROUTES: {
    BASE: 'classes',
    ID: ':id',
    USERS: 'user',
    ATTENTION_SUMMARY: 'user/attention-summary',
    ACTIVITY_OVERVIEW: 'user/activity-overview',
    BULK_UPLOAD: 'bulk-upload',
    BULK_CREATE: 'bulk',
    VALIDATE_ROSTER: 'validate-roster',
    SCHOOLS: 'schools',
    SIMULATIONS_COMPLETED_GRAPH: 'user/simulations-completed-graph',
    STATUSES: 'statuses',
    EXPORT_STUDENT_CODES: ':id/export-student-codes',
    LMS_LINKAGE: ':id/lms-linkage',
  },

  /** Class statuses surfaced to the UI: Active, Archived, Inactive. */
  VALID_STATUSES: [CommonStatus.ACTIVE, CommonStatus.INACTIVE, CommonStatus.ARCHIEVED],

  // Swagger configuration for API documentation
  SWAGGER: {
    TAG: 'Classes',
    LMS_LINKAGE:
      'Get the linked external course and per-simulation assignment mapping for a class (LTI or Google Classroom)',
  },

  ACTIVITY_OVERVIEW: {
    CLOSING_SOON_WINDOW_DAYS: 14,
    // 10% of the 400h cap (SimulationAttemptConstants.TOTAL_ALLOCATED_SECONDS). Hardcoded for now.
    AVATAR_NEAR_LIMIT_THRESHOLD_MINUTES: 2400,
  },

  /** Path-param/query-value sentinel standing in for "classes with no school assigned". */
  UNASSIGNED_SCHOOL_SENTINEL: 'unassigned',
  /** Display label for the unassigned-school group header. */
  UNASSIGNED_SCHOOL_LABEL: 'Classes without a school',

  SIMULATIONS_COMPLETED_GRAPH_MONTH_PRESETS: [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36] as const,

  VALIDATION: {
    NAME_REQUIRED: 'class_name is required',
    NAME_INVALID: 'class_name can contain letters, numbers, spaces and hyphens only',
    SIM_REQUIRED: 'sim_groups is required',
    SIM_INVALID: 'sim_groups can contain letters, numbers, spaces and hyphens only',
    TOTAL_SEATS: 'total_seats is required',
    AISIM_REQUIRED: 'ai_sim is required',
    AISIM_INVALID: 'ai_sim can contain letters, numbers, spaces and hyphens only',
    SEATS_CONSUMED: 'seats_consumed is required',
    SEATS_REMAINING: 'seats_remaining is required',
    TERM_REQUIRED: 'Term is required',
    TERM_INVALID: 'Term must be in format: i,ii...',
    YEAR_REQUIRED: 'Year is required',
    YEAR_INVALID: 'Year must be a valid 4-digit number (e.g., 2026)',
    STATUS_ENUM: 'Status must be ACTIVE or INACTIVE or DRAFT or ARCHIEVED',
    STUDENTS_JSON_INVALID: 'Students must be valid JSON array',
    STUDENTS_CONFLICT: 'Provide either students array OR total_no_of_students, not both',
    DATE_ORDER: 'Start date cannot be after End date',
    DUPLICATE_STUDENT_ID: 'Duplicate student_id in request',
    UPDATE_COUNT_DISALLOWED: 'Cannot update count when students exist',
    INSUFFICIENT_TOKENS: 'Insufficient Seats to create this assigned class',
    PROCESSING_FAILED: 'Processing failed',
    CODE_GEN_FAILED: 'Failed to generate unique student code',
    CODE_FORMAT_INVALID:
      'Generated student code does not match required CCC-XXXX format (3-char prefix, hyphen, 4-char alphanumeric suffix)',
    REQUIRED_FIELDS: 'Class name, term, and year are required',
    INVALID_STUDENT_COUNT: 'Invalid number of students',
    LMS_COURSE_LINKED_TO_OTHER_EDUCATOR:
      "This Moodle course is already linked to another educator's active class",
    USED_STUDENT_CODES: (codes: string[]) =>
      `The following Student Codes have already been used: ${codes.join(', ')}. Please update the roster and upload it again.`,
    INVALID_STUDENT_CODE_FORMAT: (codes: string[]) =>
      `The following Student Codes are invalid: ${codes.join(', ')}. Student Codes must be 8 characters with 3 characters before and 4 characters after a hyphen, with only an alphabet and number combination (e.g., SSS-R12C). Please update the roster and upload it again.`,
  },
};
