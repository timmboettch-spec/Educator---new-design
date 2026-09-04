export const LmsConstants = {
  SWAGGER: { TAG: 'LMS Integration' },
  ROUTES: {
    BASE: 'lms',
    CONFIGURE: 'schools/configure',
    SCHOOL_CONFIG: 'schools/:schoolId/config',
    EDUCATOR_CONFIG: 'educator/config',
    EDUCATOR_CONFIGURE: 'educator/configure',
    ROSTER_PREVIEW: 'roster/preview',
    CONNECT_CLASS: 'classes/connect',
    STUDENT_PROFILE: 'students/:studentCode/profile',
    MOODLE_STUDENTS: 'moodle/students',
    MOODLE_COURSES: 'moodle/courses',
    MOODLE_MAPPED_CLASSES: 'moodle/mapped-classes',
    PROVISION_SYNC: 'provision/sync',
  },
  ROLES: {
    DISTRICT_ADMIN: 'District Admin',
    EDUCATOR: 'Educator',
  },
  MESSAGES: {
    CONFIG_SAVED: 'LMS configuration saved successfully',
    CONFIG_NOT_FOUND: 'LMS configuration not found for this school',
    CLASS_CONNECTED: 'Class connected to LMS successfully',
    ROSTER_PREVIEW: 'Roster preview (in memory only)',
    PROFILE_LOOKUP: 'Student profile retrieved from LMS',
    FORBIDDEN: 'You do not have permission to perform this action',
  },
} as const;

export const NRPS_SCOPE =
  'https://purl.imsglobal.org/spec/lti-nrps/scope/contextmembership.readonly';
