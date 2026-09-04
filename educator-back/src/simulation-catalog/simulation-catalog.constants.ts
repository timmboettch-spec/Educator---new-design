export const SimulationCatalogConstants = {
  ROUTES: {
    BASE: 'simulation-catalog',
    DASHBOARD: 'dashboard',
    DASHBOARD_DETAIL: 'dashboard/:id',
    ADMIN_REPORT: 'adminreport/:id',
    DETAIL: 'detail/:id',
    ADD_TO_LIBRARY: 'add-to-library',
    REMOVE_FROM_LIBRARY: 'remove-from-library',
    GET_ALL: '',
    GET_ALL_SCENARIOS: 'scenarios',
    STATUS_SUMMARY: 'status-summary',
    GET_BY_UNIT: 'unit/:unit_id/simulations',
    GET_BY_SCENARIO_ID: 'scenario/:scenarioId',
    GET_COMBINED_SCENARIO: 'combined',
    GET_PUBLIC_SCENARIO: 'scenario/:scenarioId/public',
    GET_BY_ID: ':id',
    CREATE: '',
    UPDATE: ':id',
    DELETE: ':id',
  },

  SWAGGER: {
    TAG: 'Simulation Catalog',
    DESCRIPTION: 'Manage simulation catalog items with image uploads',
  },

  // File upload configuration
  FILE_UPLOAD: {
    FIELD_NAME: 'images',
    MAX_FILES: 10,
    MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB per file
    ALLOWED_MIME_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  },

  // Validation constraints
  VALIDATION: {
    NAME_MIN_LENGTH: 3,
    NAME_MAX_LENGTH: 255,
    DESCRIPTION_MIN_LENGTH: 10,
    DESCRIPTION_MAX_LENGTH: 5000,
    CATEGORY_MIN_LENGTH: 2,
    CATEGORY_MAX_LENGTH: 100,
  },

  // Difficulty levels
  DIFFICULTY_LEVELS: {
    EASY: 'Easy',
    MEDIUM: 'Medium',
    HARD: 'Hard',
    ADVANCED: 'Advanced',
  } as const,

  // Target audience types
  TARGET_AUDIENCE: {
    HIGH_SCHOOL: 'High School Health Science',
    STUDENTS: 'Students',
    NURSES: 'Nurses',
    DOCTORS: 'Doctors',
    NURSING_STUDENTS: 'Nursing Students',
  } as const,

  CATEGORIES: {
    CARDIOLOGY: 'Cardiology',
    EMERGENCY_MEDICINE: 'Emergency Medicine',
    CRITICAL_CARE: 'Critical Care',
    NEUROLOGY: 'Neurology',
    PEDIATRICS: 'Pediatrics',
    COMMUNICATION: 'Communication',
  } as const,

  // Unit types
  UNITS: {
    EMERGENCY: 'Emergency',
    COMMUNICATION: 'Communication',
    PEDIATRICS: 'Pediatrics',
  } as const,

  // Mock data related
  DEFAULT_PRIVACY_MESSAGE:
    "The developer, SimulMed Labs, indicated that the app's privacy practices may include handling of data as described below. For more information, see the developer's privacy policy.",

  // Rating configuration
  RATING: {
    MIN_RATING: 1,
    MAX_RATING: 5,
    DEFAULT_RATING: 0,
  },

  // Status codes
  HTTP_STATUS: {
    SUCCESS: 200,
    CREATED: 201,
    BAD_REQUEST: 400,
    NOT_FOUND: 404,
    CONFLICT: 409,
    INTERNAL_ERROR: 500,
  },

  // Messages
  MESSAGES: {
    CATALOG_FETCHED: 'Simulation catalog fetched successfully',
    DASHBOARD_FETCHED: 'Simulation catalog dashboard fetched successfully',
    DASHBOARD_DETAIL_FETCHED: 'Simulation detail fetched successfully',
    SIMULATION_CREATED: 'Simulation catalog item created successfully',
    SIMULATION_UPDATED: 'Simulation catalog item updated successfully',
    SIMULATION_DELETED: 'Simulation catalog item deleted successfully',
    SIMULATION_NOT_FOUND: 'Simulation not found',
    INVALID_REQUEST: 'Invalid request parameters',
    ADDED_TO_LIBRARY: 'Simulation added to library successfully',
    ALREADY_IN_LIBRARY: 'Simulation already exists in library',
    REMOVED_FROM_LIBRARY: 'Simulation removed from library successfully',
    NOT_IN_LIBRARY: 'Simulation not found in library',
    ADMIN_REPORT_FETCHED: 'Admin report fetched successfully',
  },

  // Pagination defaults
  PAGINATION: {
    DEFAULT_PAGE: 1,
    DEFAULT_LIMIT: 10,
    MAX_LIMIT: 100,
  },

  // Sort options
  SORT: {
    RATING_DESC: 'rating',
    RATING_ASC: '-rating',
    TITLE_ASC: 'title',
    TITLE_DESC: '-title',
    RECENT: 'createdAt',
    POPULAR: 'usage',
  } as const,

  // Time durations for simulations
  DURATION: {
    VERY_SHORT: '<10 minutes',
    SHORT: '10–30 minutes',
    MEDIUM: '30–60 minutes',
    LONG: '60+ minutes',
  } as const,

  // Version-related
  VERSION: {
    FORMAT_PATTERN: /^\d+\.\d+\.\d+$/,
    EXAMPLE: '2.5.0',
  },
};
