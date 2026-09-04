export const ClassConstants = {
  ROUTES: {
    BASE: 'classes',
    ID: ':id',
    USERS: 'user',
    BULK_UPLOAD: 'bulk-upload',
    BULK_CREATE: 'bulk',
  },

  // Swagger configuration for API documentation
  SWAGGER: {
    TAG: 'Classes',
  },

  ROLE: {
    DISTRICT_ADMIN: 'District Admin',
    EDUCATOR: 'Educator',
  },

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
  },
};
