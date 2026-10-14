/**
 * Phase-specific information (from CSV structure)
 */
export interface PhaseInfo {
  id?: string;
  name?: string;
  description?: string;
  avatarDescription?: string;
  vitals?: {
    heartRate?: string;
    ecgWaveform?: string;
    systolicBP?: string;
    diastolicBP?: string;
    spO2?: string;
    respirationRate?: string;
    respirationQuality?: string;
    pulseQuality?: {
      carotid?: string;
      radial?: string;
      brachial?: string;
      pedal?: string;
    };
    temperature?: {
      oral?: string;
      forehead?: string;
      rectal?: string;
    };
  };
  sampleHistory?: {
    signsAndSymptoms?: { text?: string; audio?: string };
    allergies?: { text?: string; audio?: string };
    medications?: { text?: string; audio?: string };
    pastMedicalHistory?: { text?: string; audio?: string };
    lastOralIntake?: { text?: string; audio?: string };
    eventsLeadingUp?: { text?: string; audio?: string };
  };
  sounds?: {
    heartSounds?: { [location: string]: string };
    lungSounds?: { [location: string]: string };
    bowelSounds?: { [location: string]: string };
  };
  checklist?: Array<{ text: string; autoAssessable?: boolean }>;
}

export interface PatientContext {
  scenarioId: string;
  patientName?: string;
  patientAge?: number;
  patientGender?: string;
  patientWeight?: string;
  chiefComplaint?: string;
  medicalHistory?: string;
  allergies?: string;
  scenarioTitle?: string;
  scenarioDescription?: string;
  learningObjectives?: string | string[];
  conversationHistory?: Array<{ speaker: 'student' | 'patient'; text: string }>;

  // Additional context fields for AI
  presentingNote?: string;
  immunizationHistory?: string;
  socialHistory?: unknown;
  occupation?: string;
  dateOfBirth?: string;

  // Available resources from scenario
  availableMedications?: Array<{
    name: string;
    dosage?: string;
    route?: string;
  }>;
  availableTests?: Array<string>;

  // Phase-specific information (current phase or all phases)
  currentPhase?: PhaseInfo;
  phases?: PhaseInfo[];

  // Legacy SAMPLE history (for backwards compatibility)
  signsAndSymptoms?: string;
  currentMedications?: string;
  lastOralIntake?: string;
  eventsLeadingUp?: string;
  sampleAudioResponses?: {
    allergies?: string;
    medications?: string;
    medicalHistory?: string;
    signsAndSymptoms?: string;
    lastOralIntake?: string;
    eventsLeadingUp?: string;
  };
}
