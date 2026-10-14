// Grading Configuration Constants

export const CLINICAL_DECISION_OPTIONS = [
  'Proceed',
  'Held',
  'Refused',
  'Inappropriate',
  'Not Given', // Parent category: includes Held, Refused, Inappropriate, Missed
];

export const FINAL_STATUS_OPTIONS = [
  'Administered',
  'Held',
  'Refused',
  'Inappropriate',
  'Missed',
  'Not Given',
];

// Patient Education Checklist Library
export const EDUCATION_ITEMS = [
  {
    id: 'purpose_indication',
    label: 'Discussed medication purpose and indication',
  },
  { id: 'side_effects', label: 'Reviewed potential side effects' },
  { id: 'instructions', label: 'Provided medication instructions' },
  { id: 'answered_questions', label: 'Answered patient questions' },
  { id: 'verbalized_understanding', label: 'Patient verbalizes understanding' },
];

// Verification Checklist Library
export const VERIFICATION_ITEMS = [
  // Patient Verification
  {
    id: 'name_checked',
    label: 'Asked patient to state their full name',
    category: 'Patient Verification',
  },
  {
    id: 'dob_checked',
    label: 'Asked patient to state their date of birth',
    category: 'Patient Verification',
  },
  {
    id: 'scanned_id',
    label: 'Scanned/checked patient wristband',
    category: 'Patient Verification',
  },
  // Medication Verification
  {
    id: 'medication_name',
    label: 'Verified medication name',
    category: 'Medication Verification',
  },
  {
    id: 'expiration_date',
    label: 'Verified medication is not expired',
    category: 'Medication Verification',
  },
  {
    id: 'no_allergies_contraindications',
    label: 'Verified absence of allergies or contraindications',
    category: 'Medication Verification',
  },
  {
    id: 'strength_concentration',
    label: 'Verified medication strength/concentration',
    category: 'Medication Verification',
  },
];

export const DEFAULT_GRADING_CONFIG = {
  enabled: false,
  expectedClinicalDecision: undefined,
  expectedDose: undefined,
  expectedRoute: undefined,
  expectedSite: undefined,
  expectedQuantityAnswers: [],
  expectedRateAnswers: [],
  expectedDurationAnswers: [],
  expectedEducationItems: [],
  expectedVerificationItems: [],
  expectedFinalStatus: undefined,
  // Administration Timing
  timingValidationEnabled: false,
  timingToleranceMinutes: undefined,
};

// Timing tolerance defaults by order type
export const TIMING_TOLERANCE_DEFAULTS = {
  Scheduled: 30, // +/- 30 minutes
  STAT: 15, // +/- 15 minutes
  PRN: null, // No validation
};
