import { motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowUp,
  MessageCircle,
  User,
  Clock,
  Info,
  Activity,
  FileText,
  ClipboardList,
  MessageSquare,
  CheckCircle,
  AlertCircle,
  Pill,
  Search,
  Filter,
  Download,
  Check,
} from 'lucide-react';
import { useState, useEffect, useRef, useMemo } from 'react';

import { api } from '../studentReportApi';
import { resolveDisplayClassName } from '../resolveDisplayClassName';
import { generatePdfFromElement } from '../../lib/pdfCapture';
import {
  timelineComparator,
  parseElapsedTimeToSeconds,
  type TimelineSortItem,
} from '../../student-transcript/transcript-logic';
import { cn } from '../../lib/utils';

import CommonActionItem from './components/CommonActionItem';
import SummaryEntryItem from './components/SummaryEntryItem';
import TranscriptHeader from './components/TranscriptHeader';
import type { TranscriptHeaderLabels } from './components/TranscriptHeader';
import loginEn from '../../locales/auth/login/en.json';
import loginEs from '../../locales/auth/login/es.json';
import MedicationTranscriptCard from './MedicationTranscriptCard';
import { FILTER_OPTIONS } from './constants';

import type { AssessmentReport } from '../../types/assessmentReport';

interface TranscriptMessage {
  id: string;
  speaker:
    | 'user'
    | 'assistant'
    | 'provider'
    | 'sbar_report'
    | 'system'
    | 'order'
    | 'student_team_comm';
  message: string;
  timestamp: string; // wallâ€‘clock display
  timestampValue?: number; // epoch ms for wall-clock derivation
  elapsedTime?: string; // mm:ss since scenario start
  elapsedSeconds?: number; // numeric ordering key
  duration?: number;
  _orderKey?: number; // For sorting
  _originalIndex?: number; // For tiebreaker ordering
}

interface SummaryEntry {
  id: string;
  category: string;
  title: string;
  details?: string;
  /** Optional action subtype (e.g. 'ordering', 'single', 'question', 'vital-signs'). */
  type?: string;
  timestamp: string;
  timestampValue: number;
  startTimestampValue?: number; // epoch ms when element was started
  elapsedTime?: string;
  elapsedSeconds?: number;
  duration?: number;
  score?: number;
  // Optional fields for questions, answers, observations, correctness
  question?: string;
  answer?: string;
  correct?: boolean;
  notes?: string;
  observations?: string;
  vitals?: Record<string, unknown> | unknown[] | string | null;
  sbarPrompt?: string;
  sbarSubmission?: string;
  sbarQualitativeResult?: string;
  sbarStartElapsed?: string;
  sbarSubmitElapsed?: string;
  sbarStartMs?: number;
  sbarSubmitMs?: number;
  /** Result status: 'satisfactory' | 'unsatisfactory' */
  satisfactory?: boolean;
  /** Whether credit was awarded for this action */
  creditAwarded?: boolean;
  // Medication administration details with grading
  administrationDetails?: {
    patientVerification?: {
      nameChecked?: boolean;
      dobChecked?: boolean;
      wristbandChecked?: boolean;
    };
    medicationVerification?: {
      nameVerified?: boolean;
      expiryChecked?: boolean;
      allergiesVerified?: boolean;
      indicationConfirmed?: boolean;
    };
    patientEducation?: {
      discussedPurpose?: boolean;
      reviewedSideEffects?: boolean;
      providedInstructions?: boolean;
      answeredQuestions?: boolean;
      patientUnderstanding?: boolean;
      educationNotes?: string;
    };
    gradingResult?: {
      medicationId?: string;
      medicationName: string;
      overallScore: number;
      totalExpected: number;
      totalCorrect: number;
      comparisons: Array<{
        field: string;
        expected: string | string[] | undefined;
        actual: string | string[] | undefined;
        isCorrect: boolean;
        confidence?: number;
        explanation?: string;
      }>;
      educationResult?: {
        expected: string[];
        actual: string[];
        matched: string[];
        missing: string[];
        isCorrect: boolean;
      };
      verificationResult?: {
        expected: string[];
        actual: string[];
        matched: string[];
        missing: string[];
        isCorrect: boolean;
      };
    };
    [key: string]: unknown;
  };
}

interface CommonActionEntry {
  label: string;
  timestamp: string;
  type: 'infection' | 'privacy' | 'environmental';
  timestampMs: number;
  elapsedTime?: string;
  elapsedSeconds?: number;
  duration?: number;
  // Optional fields
  question?: string;
  answer?: string;
  correct?: boolean;
  notes?: string;
  observations?: string;
}

type TimelineItem =
  | { type: 'message'; data: TranscriptMessage }
  | { type: 'summary'; data: SummaryEntry }
  | { type: 'commonAction'; data: CommonActionEntry };

export interface StudentTranscriptViewProps {
  reportId: string;
  onBack?: () => void;
  variant?: 'student' | 'educator';
  classNameOverride?: string;
}

export default function StudentTranscriptView({
  reportId,
  onBack,
  variant = 'student',
  classNameOverride,
}: StudentTranscriptViewProps) {
  const [language, setLanguage] = useState<'en' | 'es'>(() =>
    typeof window !== 'undefined'
      ? localStorage.getItem('app_language')?.toLowerCase() === 'es'
        ? 'es'
        : 'en'
      : 'en'
  );

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'app_language') {
        setLanguage(e.newValue?.toLowerCase() === 'es' ? 'es' : 'en');
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const locale = language === 'es' ? loginEs : loginEn;
  const tL = locale.studentReport;
  // Use es-US (not es-ES) so Spanish dates render as "julio 22, 2026"
  // and "07/22/2026" — matches the HS-online reference PDF formatting.
  const dateLocale = language === 'es' ? 'es-US' : 'en-US';

  // ─────────────────────────────────────────────────────────────────────────
  // Entry title + category localisation
  // Scenario runtime emits English titles like "NAME Updated",
  // "Chief Complaint Updated", "History of Present Illness (HPI)". We keep
  // the raw English in the data model (for search/export) and swap in
  // localised labels at render time only. Categories rendered as [xxx]
  // badges follow the same pattern.
  // ─────────────────────────────────────────────────────────────────────────
  const FIELD_KEY_MAP: Record<string, keyof typeof tL.entryFields> = {
    name: 'name',
    'patient name': 'name',
    dob: 'dob',
    age: 'age',
    gender: 'gender',
    race: 'race',
    'chief complaint': 'chiefComplaint',
    'history of present illness (hpi)': 'hpi',
    'history of present illness': 'hpi',
    hpi: 'hpi',
    'past medical history': 'pastMedicalHistory',
    'past surgical history': 'pastSurgicalHistory',
    'family medical history': 'familyMedicalHistory',
    'primary care provider': 'primaryCareProvider',
    allergies: 'allergies',
    'current home medications & indications': 'currentMedications',
    'current home medications and indications': 'currentMedications',
    'current medications': 'currentMedications',
    'tobacco use': 'tobacco',
    tobacco: 'tobacco',
    'alcohol use': 'alcohol',
    alcohol: 'alcohol',
    'exercise history': 'exercise',
    exercise: 'exercise',
    diet: 'diet',
    stress: 'stress',
    sleep: 'sleep',
    housing: 'housing',
    transportation: 'transportation',
    occupation: 'occupation',
    height: 'height',
    weight: 'weight',
    immunization: 'immunization',
    immunizations: 'immunization',
    'history of drug use': 'drugHistory',
    'drug use': 'drugHistory',
    'social history': 'socialHistory',
    'additional notes': 'notes',
  };

  const translateFieldName = (raw: string): string => {
    const key = FIELD_KEY_MAP[raw.trim().toLowerCase()];
    if (!key) return raw;
    return tL.entryFields[key] ?? raw;
  };

  // Grammatical gender/number for each entry-field key. Used to pick the
  // correct Spanish participle when suffixing with "Guardado(s)/a(s)" or
  // "Actualizado(s)/a(s)". Codes: ms = masculine singular, mp = masculine
  // plural, fs = feminine singular, fp = feminine plural. Defaults to "ms".
  type FieldGender = 'ms' | 'mp' | 'fs' | 'fp';
  const FIELD_GENDER_BY_KEY: Record<keyof typeof tL.entryFields, FieldGender> =
    {
      name: 'ms',
      dob: 'ms',
      age: 'fs',
      gender: 'ms',
      race: 'fs',
      chiefComplaint: 'ms',
      hpi: 'fs',
      pastMedicalHistory: 'mp',
      pastSurgicalHistory: 'mp',
      familyMedicalHistory: 'mp',
      primaryCareProvider: 'ms',
      allergies: 'fp',
      currentMedications: 'mp',
      tobacco: 'ms',
      alcohol: 'ms',
      exercise: 'fs',
      diet: 'fs',
      stress: 'ms',
      sleep: 'ms',
      housing: 'fs',
      transportation: 'ms',
      occupation: 'fs',
      height: 'fs',
      weight: 'ms',
      immunization: 'fs',
      drugHistory: 'ms',
      socialHistory: 'fs',
      notes: 'fp',
    };

  const translateEntryTitle = (raw: string | undefined): string => {
    if (!raw) return raw ?? '';
    const trimmed = raw.trim();
    // Direct match for common canonical titles
    if (trimmed.toLowerCase() === 'team communication') {
      return tL.speakers.teamCommunication ?? raw;
    }
    // Pattern: "<Category>: <Subcategory>" (e.g. "Nursing: Mobility & Positioning")
    // — this shape is produced by [ORDERS] release entries. Run each half
    // through translateDetailsValue so it lines up with the localized
    // Categoría/Subcategoría row below the title. Unknown segments pass
    // through verbatim, so non-order colon titles are safe.
    if (trimmed.includes(':')) {
      const [head, ...rest] = trimmed.split(':');
      const tail = rest.join(':').trim();
      if (head && tail) {
        const translatedHead = translateDetailsValue(head.trim());
        const translatedTail = translateDetailsValue(tail);
        if (translatedHead !== head.trim() || translatedTail !== tail) {
          return `${translatedHead}: ${translatedTail}`;
        }
      }
    }
    // Pattern: "<Field> Updated" or "<Field> Saved"
    const suffixMatch = trimmed.match(/^(.+?)\s+(updated|saved)$/i);
    if (suffixMatch) {
      const rawField = suffixMatch[1];
      const rawSuffix = suffixMatch[2].toLowerCase();
      const fieldKey = FIELD_KEY_MAP[rawField.trim().toLowerCase()];
      const translatedField = fieldKey
        ? (tL.entryFields[fieldKey] ?? rawField)
        : rawField;
      const gender: FieldGender = fieldKey
        ? (FIELD_GENDER_BY_KEY[fieldKey] ?? 'ms')
        : 'ms';
      const variantsBag = tL as unknown as {
        savedSuffixVariants?: Record<FieldGender, string>;
        updatedSuffixVariants?: Record<FieldGender, string>;
      };
      const variants =
        rawSuffix === 'saved'
          ? variantsBag.savedSuffixVariants
          : variantsBag.updatedSuffixVariants;
      const suffix =
        variants?.[gender] ??
        (rawSuffix === 'saved'
          ? (tL.savedSuffix ?? 'Saved')
          : (tL.updatedSuffix ?? 'Updated'));
      const originalSuffix = rawSuffix === 'saved' ? 'Saved' : 'Updated';
      if (translatedField === rawField && suffix === originalSuffix) return raw;
      return `${translatedField} ${suffix}`;
    }
    // Bare field name (e.g. history-tab entries)
    const translatedBare = translateFieldName(trimmed);
    return translatedBare === trimmed ? raw : translatedBare;
  };

  const CATEGORY_KEY_MAP: Record<string, keyof typeof tL.categories> = {
    vitals: 'vitals',
    demographics: 'demographics',
    history: 'history',
    'clinical action': 'clinicalAction',
    orders: 'orders',
    medications: 'medications',
    'team communication': 'teamCommunication',
    summary: 'summary',
    actions: 'actions',
    action: 'action',
    clinical: 'clinical',
    system: 'system',
  };

  const translateEntryCategory = (raw: string | undefined): string => {
    const fallback = (raw ?? 'summary').trim().toLowerCase();
    let key: keyof typeof tL.categories = (CATEGORY_KEY_MAP[fallback] ??
      fallback) as keyof typeof tL.categories;
    if (
      fallback === 'action' ||
      fallback === 'actions' ||
      fallback === 'clinical' ||
      fallback === 'clinicalaction' ||
      fallback === 'clinical_action' ||
      fallback === 'interventions' ||
      fallback === 'assessments' ||
      fallback === 'care' ||
      fallback === 'tasks' ||
      fallback === 'sequencing' ||
      fallback === 'summary'
    ) {
      key = 'actions';
    } else if (fallback === 'order' || fallback === 'orders') {
      key = 'orders';
    } else if (fallback === 'medication' || fallback === 'medications') {
      key = 'medications';
    } else if (
      fallback === 'demographics' ||
      fallback === 'history' ||
      fallback === 'patient_overview' ||
      fallback === 'overview'
    ) {
      key = 'demographics';
    }
    return tL.categories[key] ?? fallback.toUpperCase();
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Common-action label localisation
  // The scenario runtime persists canonical English labels like
  // "Eye Protection Donned" / "Hand Hygiene Performed" on the action log.
  // Swap them for localised versions at render time only so exports/search
  // stay stable. Unknown labels pass through unchanged.
  // ─────────────────────────────────────────────────────────────────────────
  const COMMON_ACTION_LABEL_KEY_MAP: Record<
    string,
    keyof typeof tL.commonActionLog
  > = {
    'eye protection donned': 'eyeProtectionDonned',
    'eye protection doffed': 'eyeProtectionDoffed',
    'isolation gown donned': 'isolationGownDonned',
    'isolation gown doffed': 'isolationGownDoffed',
    'standard gloves donned': 'standardGlovesDonned',
    'standard gloves doffed': 'standardGlovesDoffed',
    'sterile gloves donned': 'sterileGlovesDonned',
    'sterile gloves doffed': 'sterileGlovesDoffed',
    'respirator mask donned': 'respiratorMaskDonned',
    'respirator mask doffed': 'respiratorMaskDoffed',
    'surgical/procedural mask donned': 'surgicalMaskDonned',
    'surgical/procedural mask doffed': 'surgicalMaskDoffed',
    'surgical mask donned': 'surgicalMaskDonned',
    'surgical mask doffed': 'surgicalMaskDoffed',
    'hand hygiene performed': 'handHygienePerformed',
    'sharps discarded': 'sharpsDiscarded',
    'non-infectious waste discarded': 'nonInfectiousDiscarded',
    'infectious waste discarded': 'infectiousDiscarded',
    'door knocked': 'doorKnocked',
    'knocking stopped': 'knockingStopped',
    'door opened': 'doorOpened',
    'door closed': 'doorClosed',
    'curtain opened': 'curtainOpened',
    'curtain closed': 'curtainClosed',
    'bed/chair locked confirmed': 'bedChairLocked',
    'bed/chair alarm activated': 'bedChairAlarm',
    'bed lowest position confirmed': 'bedLowestPosition',
    'call light in reach confirmed': 'callLightConfirmed',
    'equipment checked': 'equipmentChecked',
    'lines / tubes / drains checked': 'linesTubesDrains',
    'lines/tubes/drains checked': 'linesTubesDrains',
    'personal items within reach confirmed': 'personalItemsConfirmed',
  };

  const translateCommonActionLabel = (raw: string | undefined): string => {
    if (!raw) return raw ?? '';
    const key = COMMON_ACTION_LABEL_KEY_MAP[raw.trim().toLowerCase()];
    if (!key) return raw;
    return tL.commonActionLog[key] ?? raw;
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Medication verification / education checklist label localisation.
  // The canonical labels come from `VERIFICATION_ITEMS` / education fallbacks
  // in English (e.g. "Asked patient to state their full name"). Map them to
  // the localised strings in `tL.medicationCard.verificationLabels` /
  // `educationLabels` at PDF render time. Unknown labels pass through.
  // ─────────────────────────────────────────────────────────────────────────
  const CHECKLIST_LABEL_MAP: Record<string, string> = {
    // Verification checklist
    'asked patient to state their full name':
      tL.medicationCard.verificationLabels.askedFullName,
    'asked patient to state their date of birth':
      tL.medicationCard.verificationLabels.askedDateOfBirth,
    'scanned/checked patient wristband':
      tL.medicationCard.verificationLabels.scannedWristband,
    'verified medication name':
      tL.medicationCard.verificationLabels.verifiedMedicationName,
    'verified medication is not expired':
      tL.medicationCard.verificationLabels.verifiedNotExpired,
    'verified absence of allergies or contraindications':
      tL.medicationCard.verificationLabels.verifiedNoAllergies,
    'verified medication strength/concentration':
      tL.medicationCard.verificationLabels.verifiedStrength,
    // Education checklist (short + long forms)
    'purpose discussed': tL.medicationCard.educationLabels.purposeDiscussed,
    'side effects reviewed':
      tL.medicationCard.educationLabels.sideEffectsReviewed,
    'instructions provided':
      tL.medicationCard.educationLabels.instructionsProvided,
    'questions answered': tL.medicationCard.educationLabels.questionsAnswered,
    'patient understanding':
      tL.medicationCard.educationLabels.patientUnderstanding,
    'discussed medication purpose and indication':
      tL.medicationCard.educationLabels.discussedPurposeIndication,
    'reviewed potential side effects':
      tL.medicationCard.educationLabels.reviewedSideEffectsFull,
    'provided medication instructions':
      tL.medicationCard.educationLabels.providedInstructionsFull,
    'answered patient questions':
      tL.medicationCard.educationLabels.answeredPatientQuestions,
    'patient verbalizes understanding':
      tL.medicationCard.educationLabels.patientVerbalizesUnderstanding,
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const translateChecklistItem = (raw: string | undefined): string => {
    if (!raw) return raw ?? '';
    return CHECKLIST_LABEL_MAP[raw.trim().toLowerCase()] ?? raw;
  };

  // Localise the free-text clinical-decision value ("Proceed" / "Held" /
  // "Refused" from the grading pipeline) using
  // `tL.medicationCard.clinicalDecisionValues`. Unknown values pass through.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const translateClinicalDecisionValue = (
    raw: string | undefined
  ): string | undefined => {
    if (!raw) return raw;
    const map = (
      tL.medicationCard as unknown as {
        clinicalDecisionValues?: Record<string, string>;
      }
    ).clinicalDecisionValues;
    if (!map) return raw;
    return map[raw.trim().toLowerCase()] ?? raw;
  };

  // Localise the free-text medication status value ("Administered" /
  // "Refused" / "Missed" / "Held" / …) using
  // `tL.medicationCard.statusValues`. Underlying English strings still drive
  // grading logic — only the displayed text is swapped.
  const translateStatusValue = (
    raw: string | undefined
  ): string | undefined => {
    if (!raw) return raw;
    const map = (
      tL.medicationCard as unknown as {
        statusValues?: Record<string, string>;
      }
    ).statusValues;
    if (!map) return raw;
    return map[raw.trim().toLowerCase()] ?? raw;
  };

  // Localise the "<Status> At" label ("Administered At" / "Refused At" /
  // "Held At" / …) to Spanish. Preserves unknown status labels verbatim.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const translateAtLabel = (raw: string | undefined): string => {
    if (!raw) return '';
    const trimmed = raw.trim();
    if (!trimmed) return '';
    // Fast-path: "Administered At" → tL row label.
    if (trimmed.toLowerCase() === 'administered at') {
      return tL.medicationCard.rows.administeredAt;
    }
    // Generic pattern: "<Status> At" — translate the status prefix, keep
    // the connective word (localised via administeredAt row label suffix
    // when possible; falls back to English " At").
    const m = trimmed.match(/^(.+?)\s+At$/i);
    if (m) {
      const statusEs = translateStatusValue(m[1]) ?? m[1];
      // Try to reuse the localised "administeredAt" row label's connective
      // suffix (e.g. "Administrado a las" → " a las") so custom statuses
      // render as "<Estado> a las" in ES mode.
      const adminAtLabel = tL.medicationCard.rows.administeredAt;
      const adminEs = translateStatusValue('Administered') ?? 'Administered';
      const suffixMatch = adminAtLabel
        .toLowerCase()
        .startsWith(adminEs.toLowerCase())
        ? adminAtLabel.slice(adminEs.length)
        : ' At';
      return `${statusEs}${suffixMatch}`;
    }
    return trimmed;
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Summary details ("Category: X | Subcategory: Y | Time viewed: Z")
  // Translates the well-known label/value pairs while preserving free-text
  // and unknown segments verbatim.
  // ─────────────────────────────────────────────────────────────────────────
  const DETAILS_LABEL_MAP: Record<string, keyof typeof tL.detailsLabels> = {
    category: 'category',
    subcategory: 'subcategory',
    'time viewed': 'timeViewed',
  };

  const DETAILS_VALUE_MAP: Record<string, keyof typeof tL.detailsValues> = {
    diet: 'diet',
    imaging: 'imaging',
    lab: 'lab',
    medication: 'medication',
    nursing: 'nursing',
    procedures: 'procedures',
    referrals: 'referrals',
    therapy: 'therapy',
    other: 'other',
    stat: 'stat',
    scheduled: 'scheduled',
    prn: 'prn',
    communication: 'communication',
    chemistry: 'chemistry',
    'monitoring and assessments': 'monitoringAssessments',
    'monitoring & assessments': 'monitoringAssessments',
    documentation: 'documentation',
    'skin & wound care': 'skinWoundCare',
    'skin and wound care': 'skinWoundCare',
    'mobility & positioning': 'mobilityPositioning',
    'mobility and positioning': 'mobilityPositioning',
    'patient education & teaching': 'patientEducation',
    'patient education and teaching': 'patientEducation',
    'patient education': 'patientEducation',
    'not applicable': 'notApplicable',
    radiography: 'radiography',
    ct: 'ct',
    mri: 'mri',
    'admission / discharge / transfer': 'admissionDischarge',
    'admission / discharge': 'admissionDischarge',
    action: 'action',
    'expected actions': 'expectedActions',
    timeline: 'timeline',
  };

  const translateDetailsValue = (value: string): string => {
    const key = DETAILS_VALUE_MAP[value.trim().toLowerCase()];
    if (!key) return value;
    return tL.detailsValues[key] ?? value;
  };

  const translateDetailsLabel = (label: string): string => {
    const key = DETAILS_LABEL_MAP[label.trim().toLowerCase()];
    if (!key) return label;
    return tL.detailsLabels[key] ?? label;
  };

  const translateSummaryDetails = (raw: string | undefined): string => {
    if (!raw) return raw ?? '';
    if (!raw.includes(':')) return raw;
    return raw
      .split('|')
      .map((segment) => {
        const trimmed = segment.trim();
        const colonIdx = trimmed.indexOf(':');
        if (colonIdx <= 0) return segment;
        const label = trimmed.substring(0, colonIdx);
        const value = trimmed.substring(colonIdx + 1).trim();
        const translatedLabel = translateDetailsLabel(label);
        // Only try to translate the value when the label was a known enum
        // label; otherwise the value could be free-text (times, notes, etc.).
        const translatedValue =
          translatedLabel !== label ? translateDetailsValue(value) : value;
        if (translatedLabel === label && translatedValue === value) {
          return segment;
        }
        const leadingWs = segment.match(/^\s*/)?.[0] ?? '';
        const trailingWs = segment.match(/\s*$/)?.[0] ?? '';
        return `${leadingWs}${translatedLabel}: ${translatedValue}${trailingWs}`;
      })
      .join('|');
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Answer patterns
  // Translates the well-known "Checked N vital sign(s)" answer produced by
  // the vital-signs action runtime. Unknown answers pass through unchanged.
  // ─────────────────────────────────────────────────────────────────────────
  const CHECKED_VITALS_RE = /^\s*Checked\s+(\d+)\s+vital\s+sign\(s\)\s*$/i;

  const translateSummaryAnswer = (raw: string | undefined): string => {
    if (!raw) return raw ?? '';
    const m = raw.match(CHECKED_VITALS_RE);
    if (m) {
      const n = m[1];
      const template =
        Number(n) === 1
          ? (tL.checkedVitalSignsOne ?? `Checked ${n} vital sign`)
          : (tL.checkedVitalSignsOther ?? `Checked ${n} vital signs`);
      return template.replace('{n}', n);
    }
    return raw;
  };

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [timelineItems, setTimelineItems] = useState<TimelineItem[]>([]);
  // Vitals map: keyed by short ID (hr/bp/rr/spo2/temp) â†’ array of reading objects.
  // Populated directly from summaryByCategory.vitals at load time so the PDF
  // handler always has reliable access to this data.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [vitalsMapState, setVitalsMapState] = useState<Record<
    string,
    Array<{ title?: string; details?: string }>
  > | null>(null);
  const [realSessionStartTime, setRealSessionStartTime] = useState<
    string | null
  >(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [report, setReport] = useState<AssessmentReport | null>(null);
  const displayClassName = useMemo(
    () =>
      resolveDisplayClassName(
        report?.studentClass,
        classNameOverride,
        report?.studentName
      ),
    [report?.studentClass, classNameOverride, report?.studentName]
  );
  const [simulationStartTime, setSimulationStartTime] = useState<string | null>(
    null
  );
  const [simulationStartDate, setSimulationStartDate] = useState<string | null>(
    null
  );
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const filterButtonRef = useRef<HTMLDivElement | null>(null);

  // Close filter dropdown when clicking outside
  useEffect(() => {
    if (!isFilterOpen) {
      return;
    }
    const handleClickOutside = (e: MouseEvent) => {
      if (
        filterButtonRef.current &&
        !filterButtonRef.current.contains(e.target as Node)
      ) {
        setIsFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isFilterOpen]);

  // By default, show all relevant entry types
  const [selectedFilters, setSelectedFilters] = useState<string[]>([
    'Actions',
    'Common Actions',
    'Medications',
    'Orders',
    'Patient Overview',
    'Patient Responses',
    'Student Responses',
    'Team Communication',
  ]);

  // Filter options use stable English keys for filter logic; the visible labels
  // are looked up via `filterLabelMap` below so `selectedFilters` stays in sync
  // with the strings tested by `itemMatchesFilter` / `filteredTimeline`.
  const filterOptions = [
    'Actions',
    'Common Actions',
    'Medications',
    'Orders',
    'Patient Overview',
    'Patient Responses',
    'Student Responses',
    'Team Communication',
  ];

  // Map the English filter keys stored in `selectedFilters` to their localized
  // display labels. `selectedFilters` intentionally stays English because
  // downstream matchers (itemMatchesFilter, etc.) key off those exact strings.
  const filterLabelMap: Record<string, string> = {
    Actions:
      tL.filterOptions?.actions || 'Assessments, Care, Interventions, & Tasks',
    'Common Actions':
      tL.filterOptions?.commonActions ||
      'Common Strategies for Privacy, Infection Prevention & Environmental Safety',
    Medications: tL.filterOptions?.medications || 'Medication Administration',
    Orders: tL.filterOptions?.orders || 'Viewing Orders & Assigned Tasks',
    'Patient Overview':
      tL.filterOptions?.patientOverview || 'Patient Overview & History',
    'Patient Responses':
      tL.filterOptions?.patientResponses || 'Patient Responses',
    'Student Responses':
      tL.filterOptions?.studentResponses || 'Student Responses',
    'Team Communication':
      tL.filterOptions?.teamCommunication || 'Communication with Care Team',
  };

  const speakerStyles: Record<
    string,
    {
      icon: React.ReactNode;
      label: string;
      color: string;
      badge: string;
      avatarBg: string;
      bubbleBg: string;
      border: string;
    }
  > = {
    user: {
      icon: <User className="w-5 h-5 text-[#db8833]" />,
      label: tL.speakers.student,
      color: 'text-[#db8833]',
      badge: 'bg-[#7dc7b7] text-[#323464] border-[#4f9096]',
      avatarBg: 'bg-[#FFF0EB]',
      bubbleBg: 'bg-[#fef2f2]',
      border: 'border-[#FFE7E0]',
    },
    provider: {
      icon: <MessageSquare className="w-5 h-5 text-blue-600" />,
      label: tL.speakers.provider,
      color: 'text-blue-600',
      badge: 'bg-blue-50 text-blue-600 border-blue-100',
      avatarBg: 'bg-blue-50',
      bubbleBg: 'bg-blue-50/30',
      border: 'border-blue-100',
    },
    assistant: {
      icon: <Activity className="w-5 h-5 text-teal-600" />,
      label: tL.speakers.patient,
      color: 'text-teal-600',
      badge: 'bg-[#db8833] text-white border-transparent',
      avatarBg: 'bg-teal-50',
      bubbleBg: 'bg-[#f0fdf4]',
      border: 'border-gray-100',
    },
    system: {
      icon: <Info className="w-5 h-5 text-gray-500" />,
      label: tL.speakers.system,
      color: 'text-gray-500',
      badge: 'bg-gray-50 text-gray-500 border-gray-100',
      avatarBg: 'bg-gray-50',
      bubbleBg: 'bg-gray-50',
      border: 'border-gray-100',
    },
    order: {
      icon: <ClipboardList className="w-5 h-5 text-pink-600" />,
      label: tL.speakers.orders,
      color: 'text-pink-600',
      badge: 'bg-white text-[#323464] border-[#323464]',
      avatarBg: 'bg-pink-50',
      bubbleBg: 'bg-pink-50/20',
      border: 'border-pink-100',
    },
    sbar_report: {
      icon: <FileText className="w-5 h-5 text-orange-600" />,
      label: tL.speakers.teamCommunication,
      color: 'text-orange-600',
      badge: 'bg-white text-[#323464] border-[#4f9096]',
      avatarBg: 'bg-orange-50',
      bubbleBg: 'bg-orange-50/20',
      border: 'border-orange-100',
    },
    student_team_comm: {
      icon: <User className="w-5 h-5 text-[#db8833]" />,
      label: 'Student Response - Team Communication',
      color: 'text-[#db8833]',
      badge: 'bg-[#7dc7b7] text-[#323464] border-[#4f9096]',
      avatarBg: 'bg-[#FFF0EB]',
      bubbleBg: 'bg-[#fef2f2]',
      border: 'border-[#FFE7E0]',
    },
  };

  const formatElapsedLabel = (seconds: number) => {
    const safeValue = Math.max(0, Math.round(seconds));
    const mins = Math.floor(safeValue / 60);
    const secs = safeValue % 60;
    // Zero-pad minutes so it renders as mm:ss
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  /** Format duration for display (e.g. 6s or 1m 5s) */
  const formatDurationLabel = (seconds: number) => {
    const safeValue = Math.max(0, Math.round(seconds));
    if (safeValue < 60) {
      return `${safeValue}s`;
    }
    const mins = Math.floor(safeValue / 60);
    const secs = safeValue % 60;
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  };

  const cleanDetails = (details: string | undefined, hasAnswer?: boolean) => {
    if (!details) {
      return '';
    }
    // Strip everything from "| Started:" onwards
    let cleaned = details.split(/\|\s*Started:/i)[0];

    // Remove "Duration: ..." and "Score: ..." patterns which are now shown in the header
    cleaned = cleaned.replace(/\s*Duration:\s*(\d+m?\s*\d*s?)\s*/i, '');
    cleaned = cleaned.replace(/\s*Score:\s*(\d+%)\s*/i, '');

    // Remove Prompt and Response patterns as they are now in dedicated boxes
    cleaned = cleaned.replace(/\s*Prompt:\s*.*?(?=\n|$|\|)/gi, '');
    cleaned = cleaned.replace(/\s*Response:\s*.*?(?=\n|$|\|)/gi, '');
    cleaned = cleaned.replace(/Student responded to question: ".*?"\n?/gi, '');

    if (hasAnswer) {
      cleaned = cleaned.replace(/\s*Result:\s*.*?(?=\n|$|\|)/gi, '');
      cleaned = cleaned.replace(/\s*Submitted:\s*.*?(?=\n|$|\|)/gi, '');
    }

    cleaned = cleaned.trim();
    // Remove trailing and leading separators
    cleaned = cleaned.replace(/[|\s]+$/, '').replace(/^[|\s]+/, '');

    if (details.toLowerCase().startsWith('started:')) {
      return '';
    }
    return cleaned;
  };

  const formatActionType = (type: string) => {
    if (!type) return '';
    const lower = type.toLowerCase();
    if (lower.startsWith('vital')) {
      return tL.actionTypes?.vitalSigns || 'Vital Signs';
    }
    switch (type) {
      case 'single':
        return tL.actionTypes.multipleChoice;
      case 'question':
        return tL.actionTypes.openEnded;
      case 'ordering':
        return tL.actionTypes.sequential;
      case 'vital-signs':
      case 'vitals':
      case 'vital':
        return tL.actionTypes.vitalSigns || 'Vital Signs';
      case 'infection':
        return tL.actionTypes.infection;
      case 'privacy':
        return tL.actionTypes.privacy;
      case 'environmental':
        return tL.actionTypes.environmental;
      default:
        return type;
    }
  };

  // Common-action sub-label used by both the on-screen card and the PDF —
  // maps the short type onto the full category name (e.g. "infection" →
  // "Prevención de Infecciones" / "Infection Prevention") to match HS-online.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const formatCommonActionCategory = (type: string): string => {
    switch (type) {
      case 'infection':
        return tL.actionTypes.infectionPrevention;
      case 'privacy':
        return tL.actionTypes.privacyModesty;
      case 'environmental':
        return tL.actionTypes.environmentalSafety;
      default:
        return formatActionType(type);
    }
  };

  /** Format an epoch-ms value as mm/dd/yyyy, hh:mm:ss AM/PM */
  const formatWallClock = (epochMs: number | null | undefined): string => {
    if (!epochMs) {
      return '';
    }
    try {
      const d = new Date(epochMs);
      return d.toLocaleString(dateLocale, {
        month: '2-digit',
        day: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
    } catch {
      return '';
    }
  };

  useEffect(() => {
    if (!reportId) {
      return;
    }

    const fetchTranscript = async () => {
      try {
        const reportData = await api.getAdminReportsById(reportId);
        setReport(reportData as unknown as AssessmentReport);

        if (reportData.transcriptId) {
          const scenarioPromise = reportData.scenarioId
            ? api.getScenario(reportData.scenarioId).catch((_err: unknown) => {
                return null;
              })
            : Promise.resolve(null);

          const [logData, liveScenario] = await Promise.all([
            api.getLog(reportData.transcriptId),
            scenarioPromise,
          ]);
          const scenarioStartMs = logData.startedAt
            ? new Date(logData.startedAt).getTime()
            : null;
          // Captured for use in calculations within this function
          if (logData.startedAt) {
            setRealSessionStartTime(logData.startedAt);
          }

          // Fetch configured simulationStartTime
          let simTime = reportData.scenario?.simulationStartTime;
          let simDate = reportData.scenario?.simulationStartDate;
          if (!simTime && liveScenario?.simulationStartTime) {
            simTime = liveScenario.simulationStartTime;
          }
          if (!simDate && liveScenario?.simulationStartDate) {
            simDate = liveScenario.simulationStartDate;
          }
          // Root-level fallback for reports lacking a scenario-based sim start
          if (!simTime && reportData.scenarioStartTime) {
            simTime = reportData.scenarioStartTime;
          }
          if (simTime) {
            setSimulationStartTime(simTime);
          }
          if (simDate) {
            setSimulationStartDate(simDate as string);
          }
          // Derive SIM Date from simulationStartTime if no explicit simulationStartDate
          if (!simDate && simTime) {
            try {
              const d = new Date(simTime);
              if (!isNaN(d.getTime())) {
                const month = d.toLocaleString('en-US', { month: 'short' });
                const day = d.getDate().toString().padStart(2, '0');
                const year = d.getFullYear();
                setSimulationStartDate(`${month} ${day}, ${year}`);
              }
            } catch {
              // Ignore malformed simTime; keep simulationStartDate unset.
            }
          }

          let dynamicTeamCommPrompt =
            reportData.scenario?.teamCommunication?.prompt;
          if (liveScenario?.teamCommunication?.prompt) {
            dynamicTeamCommPrompt = (
              liveScenario.teamCommunication as unknown as Record<
                string,
                unknown
              >
            ).prompt as string;
          }

          const transcriptMessages: TranscriptMessage[] = ((
            logData.messages as unknown as Record<string, unknown>[] | undefined
          )
            ?.filter((msg: Record<string, unknown>) => {
              // Keep "Order Released:" and "Team Communication Initiated" system messages
              const msgText = String(msg.text ?? msg.message ?? '').trim();
              const isOrderRelease =
                msg.speaker === 'system' &&
                msgText.toLowerCase().startsWith('order released:');
              const isTeamCommInitiated =
                msg.speaker === 'system' &&
                msgText
                  .toLowerCase()
                  .startsWith('team communication initiated.');

              if (isOrderRelease || isTeamCommInitiated) {
                return true; // preserve
              }
              // Always preserve Team Communication messages
              if (
                msg.speaker === 'student_team_comm' ||
                msg.speaker === 'sbar_report'
              ) {
                return true;
              }
              // Drop provider messages as requested (audible responses from provider)
              if (msg.speaker === 'provider') {
                return false;
              }
              return msg.speaker !== 'system'; // drop all other raw system messages
            })
            ?.map((msg: Record<string, unknown>, index: number) => {
              const timestampValue =
                typeof msg.timestampValue === 'number'
                  ? msg.timestampValue
                  : msg.timestamp
                    ? new Date(
                        msg.timestamp as string | number | Date
                      ).getTime()
                    : undefined;

              // Always compute elapsedSeconds from timestamp if not explicitly provided
              const elapsedSeconds =
                typeof msg.elapsedSeconds === 'number'
                  ? msg.elapsedSeconds
                  : timestampValue && scenarioStartMs
                    ? Math.max(
                        0,
                        Math.round((timestampValue - scenarioStartMs) / 1000)
                      )
                    : index; // fallback: use index as a last resort

              // Always compute elapsedTime from elapsedSeconds if not explicitly provided
              const elapsedTime =
                msg.elapsedTime && msg.elapsedTime !== '0:00'
                  ? msg.elapsedTime
                  : formatElapsedLabel(elapsedSeconds);

              const displayTimestamp = timestampValue
                ? new Date(timestampValue).toLocaleTimeString('en-US', {
                    hour12: false,
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })
                : `00:${String(index).padStart(2, '0')}:00`;

              // Robust text extraction â€” server may use 'text' or 'message'
              const messageText = String(msg.text ?? msg.message ?? '').trim();

              // Remap system messages to their appropriate speakers
              const rawMsgText = String(msg.text ?? msg.message ?? '').trim();
              const isOrderRelease =
                msg.speaker === 'system' &&
                rawMsgText.toLowerCase().startsWith('order released:');
              const isTeamCommInitiated =
                msg.speaker === 'system' &&
                rawMsgText
                  .toLowerCase()
                  .startsWith('team communication initiated.');

              return {
                id: msg.id || index.toString(),
                speaker: isOrderRelease
                  ? 'order'
                  : isTeamCommInitiated
                    ? 'sbar_report'
                    : msg.speaker === 'student'
                      ? 'user'
                      : msg.speaker === 'student_team_comm'
                        ? 'student_team_comm'
                        : msg.speaker === 'avatar'
                          ? 'assistant'
                          : msg.speaker === 'provider'
                            ? 'provider'
                            : msg.speaker === 'sbar_report'
                              ? 'sbar_report'
                              : msg.speaker === 'system'
                                ? 'system'
                                : 'assistant',
                message: messageText,
                timestamp: displayTimestamp,
                timestampValue: timestampValue ?? undefined,
                elapsedTime,
                elapsedSeconds,
                duration:
                  typeof msg.duration === 'number' ? msg.duration : undefined,
                // Primary numeric sort key is elapsedSeconds; fall back to timestamp ordering
                _orderKey:
                  typeof elapsedSeconds === 'number'
                    ? elapsedSeconds
                    : timestampValue && scenarioStartMs
                      ? Math.max(
                          0,
                          Math.round((timestampValue - scenarioStartMs) / 1000)
                        )
                      : index,
                _originalIndex: index,
              };
            })
            .filter((msg: { message: string }) => msg.message.length > 0) // skip blank messages
            .sort((a, b) =>
              timelineComparator(
                a as unknown as TimelineSortItem,
                b as unknown as TimelineSortItem
              )
            ) ?? []) as unknown as TranscriptMessage[];

          // Flatten summaryByCategory â€” handles both flat arrays (history, actions, medications, orders)
          // AND nested objects-of-arrays (vitals: { "Heart Rate": [...], "Blood Pressure": [...] })
          const flattenSummaryCategory = (
            cat: Record<string, unknown>
          ): unknown[] => {
            const results: unknown[] = [];
            for (const val of Object.values(cat)) {
              if (typeof val === 'string') {
                continue;
              } // skip string fields like historyNotes, actionNotes
              if (Array.isArray(val)) {
                // Filter out string entries from arrays (should only have objects)
                results.push(
                  ...(val.filter(
                    (item) => typeof item !== 'string'
                  ) as unknown[])
                );
              } else if (val && typeof val === 'object') {
                // Nested object of arrays (e.g. vitals keyed by vital name)
                for (const inner of Object.values(val)) {
                  if (Array.isArray(inner)) {
                    // Filter out string entries from nested arrays
                    results.push(
                      ...(inner.filter(
                        (item) => typeof item !== 'string'
                      ) as unknown[])
                    );
                  }
                }
              }
            }
            return results;
          };

          const summaryEntriesData =
            reportData?.summaryByCategory &&
            typeof reportData.summaryByCategory === 'object'
              ? (() => {
                  const flat = flattenSummaryCategory(
                    reportData.summaryByCategory
                  );
                  // Deduplicate by id ONLY for vitals (which should show one summary per vital type).
                  // Action/clinical entries should NOT be deduplicated because each attempt
                  // (even with the same ID) represents a separate event that needs to be shown.
                  const seenVitals = new Set<string>();
                  const seenIds = new Set<string>();
                  return flat
                    .filter((e) => {
                      // Skip non-object entries (strings, primitives, etc that got stringified)
                      if (
                        typeof e !== 'object' ||
                        e === null ||
                        Array.isArray(e)
                      ) {
                        return false;
                      }

                      const entry = e as { id?: string; category?: string };
                      if (entry.category?.toLowerCase() === 'system') {
                        return false;
                      }
                      if (entry.category?.toLowerCase() === 'vitals') {
                        if (entry.id) {
                          if (seenVitals.has(entry.id)) {
                            return false;
                          }
                          seenVitals.add(entry.id);
                        }
                        return false; // Skip vitals entirely from summary (handled separately)
                      }
                      // Skip duplicate items sharing the exact same ID across categories
                      if (entry.id) {
                        if (seenIds.has(entry.id)) {
                          return false;
                        }
                        seenIds.add(entry.id);
                      }
                      return true;
                    })
                    .sort(
                      (a, b) =>
                        ((a as { timestampValue?: number })?.timestampValue ??
                          0) -
                        ((b as { timestampValue?: number })?.timestampValue ??
                          0)
                    );
                })()
              : (
                  (reportData?.summaryEntries ?? []) as Array<{
                    category?: string;
                  }>
                ).filter(
                  (e: { category?: string }) =>
                    e.category?.toLowerCase() !== 'vitals'
                );

          // â”€â”€ Extract vitals map from summaryByCategory.vitals and store in state
          // so handleDownloadTranscript can reliably access it later.
          if (reportData?.summaryByCategory) {
            const rawVitals = reportData.summaryByCategory.vitals;
            if (
              rawVitals &&
              typeof rawVitals === 'object' &&
              !Array.isArray(rawVitals)
            ) {
              const shortKey: Record<string, string> = {
                'heart rate': 'hr',
                'heart rate recorded': 'hr',
                'blood pressure': 'bp',
                'blood pressure recorded': 'bp',
                'respiratory rate': 'rr',
                'respiratory rate recorded': 'rr',
                'oxygen saturation': 'spo2',
                'oxygen saturation recorded': 'spo2',
                'spo2 recorded': 'spo2',
                temperature: 'temp',
                'temperature recorded': 'temp',
              };
              const normalized: Record<
                string,
                Array<{ title?: string; details?: string }>
              > = {};
              Object.entries(rawVitals as Record<string, unknown>).forEach(
                ([k, v]) => {
                  if (!Array.isArray(v) || v.length === 0) {
                    return;
                  }
                  const key = shortKey[k.toLowerCase()] ?? k.toLowerCase();
                  normalized[key] = v as Array<{
                    title?: string;
                    details?: string;
                  }>;
                }
              );
              if (Object.keys(normalized).length > 0) {
                setVitalsMapState(normalized);
              }
            }
          }

          // Build grading lookup from mandatoryActions/optionalActions/actionsTimeline
          const actionGradingMap = new Map<
            string,
            { satisfactory: boolean; creditAwarded: boolean }
          >();
          const allGradedActions = [
            ...((reportData?.mandatoryActions as Array<{
              title: string;
              type: string;
              isCorrect: boolean;
              pointsAwarded?: number;
            }>) || []),
            ...((reportData?.optionalActions as Array<{
              title: string;
              type: string;
              isCorrect: boolean;
              pointsAwarded?: number;
            }>) || []),
          ];
          for (const action of allGradedActions) {
            if (action.title) {
              actionGradingMap.set(action.title.toLowerCase(), {
                satisfactory: action.isCorrect,
                creditAwarded:
                  action.pointsAwarded !== undefined
                    ? action.pointsAwarded > 0
                    : action.isCorrect,
              });
            }
          }

          // Fallback: use actionsTimeline grading if mandatoryActions is not available
          if (
            actionGradingMap.size === 0 &&
            Array.isArray(reportData?.actionsTimeline)
          ) {
            for (const entry of reportData.actionsTimeline as Array<{
              title?: string;
              grading?: boolean | number;
            }>) {
              if (
                entry.title &&
                entry.grading !== undefined &&
                entry.grading !== null
              ) {
                const isCorrect = entry.grading === true || entry.grading === 1;
                actionGradingMap.set(entry.title.toLowerCase(), {
                  satisfactory: isCorrect,
                  creditAwarded: isCorrect,
                });
              }
            }
          }

          const summaryTimelineItems: TimelineItem[] = summaryEntriesData.map(
            (rawEntry) => {
              const entry = rawEntry as SummaryEntry;
              const timestampValue = entry.timestampValue || 0;
              const elapsedSeconds =
                entry.elapsedSeconds ??
                (timestampValue && scenarioStartMs
                  ? Math.max(
                      0,
                      Math.round((timestampValue - scenarioStartMs) / 1000)
                    )
                  : undefined);

              const elapsedTime =
                entry.elapsedTime ??
                (elapsedSeconds !== undefined
                  ? formatElapsedLabel(elapsedSeconds)
                  : undefined);

              // Try to extract duration/timing from details if missing in object
              let duration = entry.duration;
              let score = entry.score;

              if (entry.details) {
                // Parse Duration
                const dMatch = entry.details.match(/Duration:\s*(\d+)s/i);
                if (dMatch) {
                  duration = parseInt(dMatch[1], 10);
                } else {
                  const mMatch = entry.details.match(
                    /Duration:\s*(\d+)m\s*(\d+)s/i
                  );
                  if (mMatch) {
                    duration =
                      parseInt(mMatch[1], 10) * 60 + parseInt(mMatch[2], 10);
                  }
                }

                // Parse Score
                const sMatch = entry.details.match(/Score:\s*(\d+)%/i);
                if (sMatch) {
                  score = parseInt(sMatch[1], 10);
                }

                // If duration still missing, try to parse Started/Ended and calculate
                if (duration === undefined) {
                  const sMatch = entry.details.match(/Started:\s*([^|]*)/i);
                  const eMatch = entry.details.match(/Ended:\s*([^|]*)/i);
                  if (sMatch && eMatch) {
                    try {
                      const sDate = new Date(sMatch[1].trim());
                      const eDate = new Date(eMatch[1].trim());
                      if (!isNaN(sDate.getTime()) && !isNaN(eDate.getTime())) {
                        duration = Math.max(
                          0,
                          Math.round((eDate.getTime() - sDate.getTime()) / 1000)
                        );
                      }
                    } catch {
                      // Ignore date parse failure; duration stays undefined.
                    }
                  }
                }
              }

              // For all entry types in the transcript, prefer the individual entry's own
              // `satisfactory` or `correct` field representing the SPECIFIC ATTEMPT outcome,
              // rather than letting aggregated actionGradingMap override it.
              const entryIndividualCorrect =
                entry.satisfactory !== undefined
                  ? entry.satisfactory
                  : entry.correct !== undefined
                    ? entry.correct
                    : undefined;

              const shouldUseIndividualCorrectness =
                entryIndividualCorrect !== undefined;

              // For vital-type entries the `grading` field on the raw entry is the
              // per-attempt correctness signal (true = enough vitals checked, false = not enough).
              const isVitalEntry =
                entry.type === 'vital' ||
                entry.type === 'vital-signs' ||
                entry.category?.toLowerCase() === 'vitals';

              const rawEntryGrading = (rawEntry as Record<string, unknown>)
                .grading;

              const grading = shouldUseIndividualCorrectness
                ? {
                    satisfactory: Boolean(entryIndividualCorrect),
                    creditAwarded: Boolean(entryIndividualCorrect),
                  }
                : isVitalEntry &&
                    rawEntryGrading !== undefined &&
                    rawEntryGrading !== null
                  ? {
                      satisfactory:
                        rawEntryGrading === true || rawEntryGrading === 1,
                      creditAwarded:
                        rawEntryGrading === true || rawEntryGrading === 1,
                    }
                  : entry.title
                    ? actionGradingMap.get(entry.title.toLowerCase())
                    : undefined;

              // Additional fallback for other entry types without individual correctness
              const fallbackGrading =
                !grading && entryIndividualCorrect !== undefined
                  ? {
                      satisfactory: Boolean(entryIndividualCorrect),
                      creditAwarded: Boolean(entryIndividualCorrect),
                    }
                  : undefined;

              return {
                type: 'summary' as const,
                data: {
                  ...entry,
                  id: entry.id,
                  category: entry.category || 'summary',
                  title: entry.title,
                  details: entry.details,
                  timestamp: entry.timestamp,
                  timestampValue: timestampValue,
                  elapsedTime: elapsedTime,
                  elapsedSeconds: elapsedSeconds,
                  duration: duration,
                  score: score,
                  ...(entry.type && { type: entry.type }),
                  ...(entry.vitals && { vitals: entry.vitals }),
                  ...(grading && {
                    satisfactory: grading.satisfactory,
                    creditAwarded: grading.creditAwarded,
                  }),
                  ...(fallbackGrading &&
                    !grading && {
                      satisfactory: fallbackGrading.satisfactory,
                      creditAwarded: fallbackGrading.creditAwarded,
                    }),
                },
              };
            }
          );

          const messageTimelineItems: TimelineItem[] = transcriptMessages.map(
            (msg) => ({
              type: 'message' as const,
              data: {
                ...msg,
                // Keep message ordering consistent: prefer elapsedSeconds, then fallback
                _orderKey:
                  (typeof msg.elapsedSeconds === 'number'
                    ? msg.elapsedSeconds
                    : undefined) ??
                  msg._orderKey ??
                  (msg.elapsedTime
                    ? parseElapsedTimeToSeconds(msg.elapsedTime)
                    : undefined),
              },
            })
          );

          // Map commonActionTracker.actionLog into timeline items
          const commonActionItems: TimelineItem[] = (
            (reportData?.commonActionTracker?.actionLog as
              CommonActionEntry[] | undefined) ?? []
          ).map((action) => ({
            type: 'commonAction' as const,
            data: action,
          }));

          const rawCombinedTimeline: TimelineItem[] = [
            ...messageTimelineItems,
            ...summaryTimelineItems,
            ...commonActionItems,
          ].sort((a, b) =>
            timelineComparator(
              a as unknown as TimelineSortItem,
              b as unknown as TimelineSortItem
            )
          );

          // Deduplicate action items representing the exact same attempt event
          const seenActionAttempts: Array<{
            id?: string;
            title: string;
            ts: number;
            elapsed?: string;
          }> = [];
          const combinedTimeline: TimelineItem[] = rawCombinedTimeline.filter(
            (item) => {
              if (item.type === 'message') return true;
              const itemId = (item.data as { id?: string }).id
                ? String((item.data as { id?: string }).id)
                : undefined;
              const title = (
                item.type === 'commonAction'
                  ? item.data.label || item.data.title || ''
                  : item.data.title || ''
              )
                .trim()
                .toLowerCase();
              const ts = item.data.timestampValue ?? item.data.timestampMs ?? 0;
              const elapsed = item.data.elapsedTime ?? '';

              const isDup = seenActionAttempts.some((s) => {
                if (itemId && s.id && s.id === itemId) return true;
                if (!title) return false;
                const titleMatches =
                  s.title === title ||
                  (s.title.length > 5 &&
                    title.length > 5 &&
                    (s.title.includes(title) || title.includes(s.title)));
                if (!titleMatches) return false;
                if (elapsed && s.elapsed && elapsed === s.elapsed) return true;
                if (ts > 0 && s.ts > 0 && Math.abs(ts - s.ts) <= 4000)
                  return true;
                if (ts === 0 && s.ts === 0) return true;
                return false;
              });
              if (isDup) return false;
              seenActionAttempts.push({ id: itemId, title, ts, elapsed });
              return true;
            }
          );

          const unifiedTimeline: TimelineItem[] = [];
          type SbarSession = {
            prompt?: string;
            submission?: string;
            startMs?: number;
            submitMs?: number;
            startElapsed?: string;
            submitElapsed?: string;
            startSeconds?: number;
            submitSeconds?: number;
          };
          let currentSbarSession: SbarSession | null = null;
          // Holds student_team_comm items encountered while a session is open;
          // emitted immediately after the unified block so they always sort after it.
          let pendingStudentTeamComm: TimelineItem[] = [];

          for (const item of combinedTimeline) {
            if (item.type === 'message') {
              const msg = item.data;
              const text = (msg.message || '').trim();
              // Skip only "Team Communication Initiated" messages (these trigger session start)
              if (
                text
                  .toLowerCase()
                  .startsWith('team communication initiated. prompt:')
              ) {
                const promptMatch = text.match(/prompt:\s*(.*)/i);
                const prevSbar: SbarSession = currentSbarSession ?? {};
                currentSbarSession = {
                  ...prevSbar,
                  prompt:
                    dynamicTeamCommPrompt ??
                    (promptMatch ? promptMatch[1] : text),
                  startMs: msg.timestampValue ?? prevSbar.startMs,
                  startElapsed: msg.elapsedTime ?? prevSbar.startElapsed,
                  startSeconds: msg.elapsedSeconds ?? prevSbar.startSeconds,
                };
                continue; // Remove redundant initiation message
              }
              // Capture sbar_report submission into the current session and suppress the standalone card
              if (msg.speaker === 'sbar_report') {
                const prevSbar: SbarSession = currentSbarSession ?? {};
                currentSbarSession = {
                  ...prevSbar,
                  submission: text,
                  submitMs: msg.timestampValue ?? prevSbar.submitMs,
                  submitElapsed: msg.elapsedTime ?? prevSbar.submitElapsed,
                  submitSeconds: msg.elapsedSeconds ?? prevSbar.submitSeconds,
                };
                continue; // Remove redundant submission message
              }
              // While a TC session is open, hold student_team_comm messages so
              // we can guarantee they appear AFTER the unified block in the
              // final sort (their raw timestamps may predate the block's anchor).
              if (
                msg.speaker === 'student_team_comm' &&
                currentSbarSession !== null
              ) {
                pendingStudentTeamComm.push(item);
                continue;
              }
            } else if (item.type === 'summary') {
              const entry = item.data;
              if (entry.title === 'Team Communication') {
                const details = entry.details ?? '';
                if (details.toLowerCase().includes('initiated. prompt:')) {
                  // Capture action initiation log
                  if (!currentSbarSession) {
                    currentSbarSession = {};
                  }

                  const promptMatch = details.match(/prompt:\s*(.*)/i);
                  const parsedPrompt = promptMatch ? promptMatch[1] : details;
                  currentSbarSession.prompt =
                    dynamicTeamCommPrompt ??
                    currentSbarSession.prompt ??
                    parsedPrompt;

                  if (!currentSbarSession.startMs) {
                    currentSbarSession.startMs = entry.timestampValue;
                  }
                  if (!currentSbarSession.startElapsed) {
                    currentSbarSession.startElapsed = entry.elapsedTime;
                  }
                  if (!currentSbarSession.startSeconds) {
                    currentSbarSession.startSeconds = entry.elapsedSeconds;
                  }
                  continue; // Remove redundant action entry
                } else if (details.toLowerCase().includes('result:')) {
                  // Only render if the student actually started a team communication session.
                  // The backend always injects a "Result: Unsatisfactory" entry even when the
                  // student never pressed the Team Comm button â€” currentSbarSession will be null
                  // in that case, so we skip.
                  if (!currentSbarSession) {
                    continue;
                  }
                  // Final evaluation, create the unified entry
                  const resultMatch = details.match(/result:\s*([^|]+)/i);
                  const qualitativeResult = resultMatch
                    ? resultMatch[1].trim()
                    : details;

                  // Best anchor: direct epoch-ms from initiation message.
                  // If that is missing, derive it from elapsedSeconds + scenarioStartMs
                  // (both reliably captured from the initiation log entry).
                  // Only fall back to the result entry's timestamp as a last resort.
                  const sessionStartMs =
                    currentSbarSession?.startMs ??
                    (currentSbarSession?.startSeconds !== undefined &&
                    currentSbarSession.startSeconds !== null &&
                    scenarioStartMs !== null
                      ? scenarioStartMs + currentSbarSession.startSeconds * 1000
                      : undefined) ??
                    (currentSbarSession?.startElapsed &&
                    scenarioStartMs !== null
                      ? scenarioStartMs +
                        parseElapsedTimeToSeconds(
                          currentSbarSession.startElapsed
                        ) *
                          1000
                      : undefined) ??
                    entry.timestampValue;

                  const unifiedEntry: TimelineItem = {
                    type: 'summary',
                    data: {
                      ...entry,
                      category: 'Team Communication',
                      title: 'Team Communication',
                      sbarPrompt:
                        currentSbarSession?.prompt ?? tL.noPromptRecorded,
                      sbarSubmission:
                        currentSbarSession?.submission ??
                        tL.noSubmissionRecorded,
                      sbarQualitativeResult: qualitativeResult,
                      sbarStartElapsed:
                        currentSbarSession?.startElapsed ?? entry.elapsedTime,
                      sbarSubmitElapsed:
                        currentSbarSession?.submitElapsed ?? entry.elapsedTime,
                      // Use derived epoch-ms so Started / Ended / Duration always display
                      sbarStartMs: sessionStartMs,
                      sbarSubmitMs:
                        currentSbarSession?.submitMs ??
                        (currentSbarSession?.submitSeconds !== undefined &&
                        currentSbarSession.submitSeconds !== null &&
                        scenarioStartMs !== null
                          ? scenarioStartMs +
                            currentSbarSession.submitSeconds * 1000
                          : undefined) ??
                        entry.timestampValue,
                      // Clock badge shows TC initiation time so badges always read in
                      // ascending order top-to-bottom. Result/Ended times are visible
                      // inside the card body via sbarStartMs / sbarSubmitMs labels.
                      elapsedTime:
                        currentSbarSession?.startElapsed ?? entry.elapsedTime,
                      elapsedSeconds:
                        currentSbarSession?.startSeconds ??
                        entry.elapsedSeconds,
                      // Anchor at initiation time so block sorts correctly
                      timestampValue: sessionStartMs,
                    } as SummaryEntry,
                  };
                  unifiedTimeline.push(unifiedEntry);

                  // Emit held student_team_comm messages immediately after the
                  // unified block, adjusting their timestampValue so they always
                  // sort AFTER the block regardless of their raw timestamp.
                  pendingStudentTeamComm.forEach((tcItem, idx) => {
                    const tcMsg = tcItem.data as TranscriptMessage;
                    const rawTs = tcMsg.timestampValue ?? 0;
                    // Keep original timestamp when it already falls after the
                    // block anchor; otherwise pin it just after the anchor.
                    const adjustedTs =
                      rawTs > sessionStartMs ? rawTs : sessionStartMs + idx + 1;
                    unifiedTimeline.push({
                      type: 'message',
                      data: { ...tcMsg, timestampValue: adjustedTs },
                    });
                  });
                  pendingStudentTeamComm = [];
                  currentSbarSession = null;
                  continue;
                } else {
                  // Team Communication entry with no recognised pattern â€” skip raw placeholder
                  continue;
                }
              }
            }
            unifiedTimeline.push(item);
          }

          // Flush any student_team_comm messages from an unclosed session
          if (pendingStudentTeamComm.length > 0) {
            unifiedTimeline.push(...pendingStudentTeamComm);
            pendingStudentTeamComm = [];
          }

          // Re-sort final unified timeline to ensure all entries are in order
          unifiedTimeline.sort((a, b) =>
            timelineComparator(
              a as unknown as TimelineSortItem,
              b as unknown as TimelineSortItem
            )
          );
          setTimelineItems(unifiedTimeline);
        } else {
          // transcript loading skipped
        }
        setLoading(false);
      } catch {
        setError('Failed to load transcript.');
        setLoading(false);
      }
    };

    void fetchTranscript();
  }, [reportId]);

  const handleBack = () => {
    if (onBack) {
      onBack();
    }
  };

  const handleDownloadTranscript = async () => {
    try {
      const reportIdLabelRaw = tL.reportId;
      const reportIdLabel = reportIdLabelRaw
        ? reportIdLabelRaw.replace(/:$/, '').trim()
        : 'Report ID';

      await generatePdfFromElement({
        elementId: 'transcript-printable',
        fileName: `transcript-${reportId}.pdf`,
        reportId,
        labels: {
          reportId: reportIdLabel,
          page: tL.page || 'Page',
          of: tL.of || 'of',
        },
        onCloneExtra: (clonedEl) => {
          const hideEls = clonedEl.querySelectorAll('.pdf-hide');
          hideEls.forEach((el) => {
            (el as HTMLElement).style.display = 'none';
          });

          const clearBox = (el: HTMLElement) => {
            el.style.background = 'none';
            el.style.backgroundImage = 'none';
            el.style.backgroundColor = 'transparent';
            el.style.border = 'none';
            el.style.boxShadow = 'none';
          };

          // 1. Flatten Category Pills ([data-cat-pill])
          const catPills =
            clonedEl.querySelectorAll<HTMLElement>('[data-cat-pill]');
          catPills.forEach((pill) => {
            clearBox(pill);
            pill.style.color = '#5f6060';
            pill.style.textTransform = 'uppercase';
          });

          // 2. Flatten Status Pills ([data-status-pill])
          const statusPills =
            clonedEl.querySelectorAll<HTMLElement>('[data-status-pill]');
          statusPills.forEach((pill) => {
            clearBox(pill);
          });

          // 3. Flatten Header Date/Time Fields ([data-hdr-field])
          const hdrFields =
            clonedEl.querySelectorAll<HTMLElement>('[data-hdr-field]');
          hdrFields.forEach((field) => {
            field.style.background = 'none';
            field.style.backgroundImage = 'none';
            field.style.backgroundColor = 'transparent';
          });

          // 4. Force Collapsible Bodies Open ([data-collapsible-body])
          const collapsibleBodies = clonedEl.querySelectorAll<HTMLElement>(
            '[data-collapsible-body]'
          );
          collapsibleBodies.forEach((body) => {
            body.style.display = 'block';
          });

          // 5. Flatten Medication Card ([data-med-card] & [data-med-card] *)
          const medCards =
            clonedEl.querySelectorAll<HTMLElement>('[data-med-card]');
          medCards.forEach((card) => {
            clearBox(card);
            const cardDescendants = card.querySelectorAll<HTMLElement>('*');
            cardDescendants.forEach((child) => {
              clearBox(child);
            });
          });
        },
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to generate transcript PDF:', err);
      alert('An error occurred while generating the transcript PDF.');
    }
  };

  const selectAllFilters = () => {
    setSelectedFilters([...filterOptions]);
  };

  const clearAllFilters = () => {
    setSelectedFilters([]);
  };

  const toggleFilter = (filter: string) => {
    setSelectedFilters((prev) =>
      prev.includes(filter)
        ? prev.filter((f) => f !== filter)
        : [...prev, filter]
    );
  };

  // True when the user has deselected at least one filter option from the full default set
  const isFiltered =
    selectedFilters.length < filterOptions.length ||
    filterOptions.some((opt) => !selectedFilters.includes(opt));

  /**
   * Helper to derive the set of filter categories an item belongs to.
   */
  const getFilterCategoriesForItem = (item: TimelineItem): string[] => {
    if (item.type === 'commonAction') {
      return ['Common Actions'];
    }

    if (item.type === 'message') {
      const speaker = item.data.speaker;
      if (speaker === 'order') {
        return ['Orders'];
      }
      if (speaker === 'user') {
        return ['Student Responses'];
      }
      if (speaker === 'student_team_comm') {
        return ['Student Responses', 'Team Communication'];
      }
      if (speaker === 'assistant') {
        return ['Patient Responses'];
      }
      if (speaker === 'provider' || speaker === 'sbar_report') {
        return ['Team Communication'];
      }
      if (speaker === 'system') {
        return ['Common Actions'];
      }
      return [];
    }

    // summary items
    const entry = item.data;
    const category = (entry.category ?? '').trim().toLowerCase();
    const title = entry.title;

    if (title === 'Team Communication') {
      return ['Team Communication'];
    }

    if (
      category === 'demographics' ||
      category === 'history' ||
      category === 'patient_overview' ||
      category === 'overview'
    ) {
      return ['Patient Overview'];
    }

    if (
      category === 'ppe' ||
      category === 'safety' ||
      category === 'commonaction' ||
      category === 'common_action' ||
      category === 'common_actions' ||
      category === 'infection' ||
      category === 'privacy' ||
      category === 'environmental'
    ) {
      return ['Common Actions'];
    }

    if (category === 'orders' || category === 'order') {
      return ['Orders'];
    }

    if (category === 'medications' || category === 'medication') {
      return ['Medications'];
    }

    if (category === 'vitals') {
      return [];
    }

    return ['Actions'];
  };

  const filteredTimeline = timelineItems.filter((item) => {
    // Common action search match
    if (item.type === 'commonAction') {
      const action = item.data;
      const matchesSearch = action.label
        .toLowerCase()
        .includes(searchTerm.toLowerCase());
      if (!matchesSearch) {
        return false;
      }
      return selectedFilters.includes('Common Actions');
    }

    // Filter out empty summary entries (no title or details)
    if (item.type === 'summary') {
      const entry = item.data;
      const hasContent = entry.title && entry.title.trim().length > 0;
      if (!hasContent) {
        return false;
      }
    }

    const matchesSearch =
      item.type === 'message'
        ? String(item.data.message ?? '')
            .toLowerCase()
            .includes(searchTerm.toLowerCase())
        : String(item.data.title ?? '')
            .toLowerCase()
            .includes(searchTerm.toLowerCase()) ||
          String(item.data.details ?? '')
            .toLowerCase()
            .includes(searchTerm.toLowerCase());

    if (!matchesSearch) {
      return false;
    }

    if (item.type === 'message') {
      const messageText = item.data.message;

      // Validate message has content before filtering
      if (!messageText || messageText.trim().length === 0) {
        return false;
      }
    }

    const itemCategories = getFilterCategoriesForItem(item);
    if (itemCategories.length === 0) {
      return false;
    }
    return itemCategories.some((cat) => selectedFilters.includes(cat));
  });

  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center min-h-screen bg-white">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#db8833] mb-4" />
        <p className="text-gray-600 text-lg">
          {variant === 'educator'
            ? 'Loading student transcript...'
            : 'Loading Transcript...'}
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col justify-center items-center min-h-screen bg-white">
        <div className="p-8 text-center max-w-md">
          <MessageCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Unable to Load Transcript
          </h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={handleBack}
            className="inline-flex items-center gap-2 px-5 py-2.5 border border-[#db8833] text-[#db8833] rounded-lg font-semibold hover:bg-[#FFF0EB] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Report
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FFF5F3]">
      <div
        id="transcript-printable"
        className="max-w-5xl mx-auto px-4 pt-6 pb-2"
      >
        {/* Top Action & Navigation Bar — Sticky on scroll & Hidden in PDF */}
        <div className="sticky top-0 z-20 bg-[#FFF5F3] py-4 mb-2 flex flex-wrap items-center justify-between gap-3 pdf-hide">
          {/* Back Button */}
          <button
            onClick={handleBack}
            className="flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-200 rounded-full text-gray-700 font-semibold text-sm hover:bg-gray-50 transition-all shadow-xs cursor-pointer shrink-0"
          >
            <ArrowLeft className="w-4 h-4 text-gray-500" />
            {tL.backToReport || 'Back to Report'}
          </button>

          {/* Search Box */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder={tL.searchPlaceholder || 'Search Transcript...'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ outline: 'none' }}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-full text-sm text-gray-800 outline-none focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0 focus:border-[#db8833] shadow-xs placeholder:text-gray-400 transition-all"
            />
          </div>

          {/* Right Action Buttons: Filter & Download */}
          <div className="flex items-center gap-3 shrink-0">
            {/* Filter Dropdown */}
            <div className="relative" ref={filterButtonRef}>
              <button
                onClick={() => setIsFilterOpen(!isFilterOpen)}
                className={`flex items-center gap-2.5 px-5 py-2.5 bg-white rounded-full font-semibold text-sm transition-all shadow-xs cursor-pointer ${
                  isFilterOpen
                    ? 'border-2 border-[#db8833] text-[#db8833] bg-orange-50/50'
                    : 'border border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Filter
                  className={`w-4 h-4 ${
                    isFilterOpen ? 'text-[#db8833]' : 'text-gray-500'
                  }`}
                />
                <span>{tL.filter || 'Filter'}</span>
                {isFilterOpen &&
                  selectedFilters.length > 0 &&
                  selectedFilters.length < FILTER_OPTIONS.length && (
                    <span className="w-5 h-5 rounded-full bg-[#db8833] text-white text-xs font-bold flex items-center justify-center">
                      {selectedFilters.length}
                    </span>
                  )}
              </button>

              {isFilterOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-xl border border-gray-100 py-3 z-30 animate-in fade-in zoom-in-95 duration-150 max-h-96 overflow-y-auto overscroll-contain">
                  {/* Select All / Clear All Header */}
                  <div className="flex items-center justify-between px-4 pb-2.5 mb-1.5 border-b border-gray-100">
                    <button
                      type="button"
                      onClick={selectAllFilters}
                      className="text-xs font-semibold text-[#db8833] hover:underline cursor-pointer"
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      onClick={clearAllFilters}
                      className="text-xs font-semibold text-gray-500 hover:text-gray-700 hover:underline cursor-pointer"
                    >
                      Clear all
                    </button>
                  </div>

                  {/* Filter Options List with Custom Checkboxes */}
                  <div className="space-y-0.5">
                    {filterOptions.map((option) => {
                      const isSelected = selectedFilters.includes(option);
                      return (
                        <div
                          key={option}
                          onClick={() => toggleFilter(option)}
                          className="flex items-start gap-3 px-4 py-2.5 hover:bg-[#F3F4F6] hover:text-[#db8833] transition-colors cursor-pointer rounded-xl mx-1 group"
                        >
                          <div
                            className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors ${
                              isSelected
                                ? 'bg-[#db8833] border-2 border-[#db8833] text-white'
                                : 'bg-white border-2 border-gray-300'
                            }`}
                          >
                            {isSelected && (
                              <Check className="w-3.5 h-3.5 stroke-[3]" />
                            )}
                          </div>
                          <span className="text-sm font-semibold text-gray-700 group-hover:text-[#db8833] leading-snug select-none">
                            {filterLabelMap[option] ?? option}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Download Transcript Button */}
            <button
              onClick={handleDownloadTranscript}
              className="flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-200 rounded-full text-gray-700 font-semibold text-sm hover:bg-gray-50 transition-all shadow-xs cursor-pointer"
            >
              <Download className="w-4 h-4 text-gray-500" />
              {tL.downloadTranscript || 'Download Transcript'}
            </button>
          </div>
        </div>

        {/* Printable Header Card */}
        <div
          data-pdf-header
          data-pdf-card
          className="bg-white rounded-[24px] border border-gray-100 p-6 sm:p-8 shadow-xs mb-6"
        >
          <TranscriptHeader
            report={report}
            className={displayClassName}
            labels={tL as unknown as TranscriptHeaderLabels}
          />

          {/* Real Date & Time + SIM Date & Time Bar */}
          {(realSessionStartTime ??
            simulationStartDate ??
            simulationStartTime) && (
            <div
              className="flex flex-wrap justify-center items-center gap-3 mt-4"
              role="region"
              aria-label="Simulation date and time"
            >
              {/* Real Date */}
              {realSessionStartTime && (
                <div
                  data-date-badge
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-[#F3F4F6] rounded-full text-xs"
                >
                  <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                    {tL.realDate}
                  </span>
                  <span className="text-xs font-bold text-gray-900">
                    {(() => {
                      const d = new Date(realSessionStartTime);
                      const monthLong = d.toLocaleDateString(dateLocale, {
                        month: 'long',
                      });
                      return `${monthLong} ${d.getDate()}, ${d.getFullYear()}`;
                    })()}
                  </span>
                </div>
              )}
              {/* Real Time */}
              {realSessionStartTime && (
                <div
                  data-date-badge
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-[#F3F4F6] rounded-full text-xs"
                >
                  <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                    {tL.realTime}
                  </span>
                  <span className="text-xs font-bold text-gray-900">
                    {new Date(realSessionStartTime).toLocaleTimeString(
                      dateLocale,
                      {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false,
                      }
                    )}
                  </span>
                </div>
              )}
              {/* SIM Date */}
              {simulationStartDate && (
                <div
                  data-date-badge
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-[#F3F4F6] rounded-full text-xs"
                >
                  <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                    {tL.simDate}
                  </span>
                  <span className="text-xs font-bold text-gray-900">
                    {(() => {
                      try {
                        const d = new Date(simulationStartDate);
                        if (!isNaN(d.getTime())) {
                          const monthLong = d.toLocaleDateString(dateLocale, {
                            month: 'long',
                          });
                          return `${monthLong} ${d.getDate()}`;
                        }
                      } catch {
                        // Fall through to regex fallback below.
                      }
                      return simulationStartDate.replace(/,?\s*\d{4}\s*$/, '');
                    })()}
                  </span>
                </div>
              )}
              {/* SIM Time */}
              {simulationStartTime && (
                <div
                  data-date-badge
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-[#F3F4F6] rounded-full text-xs"
                >
                  <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                    {tL.simTime}
                  </span>
                  <span className="text-xs font-bold text-gray-900">
                    {(() => {
                      try {
                        const d = new Date(simulationStartTime);
                        if (!isNaN(d.getTime())) {
                          return d.toLocaleTimeString(dateLocale, {
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: false,
                          });
                        }
                      } catch {
                        // Fall through to regex fallback below.
                      }
                      return simulationStartTime.replace(/\s*(AM|PM)\s*$/i, '');
                    })()}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Transcript Container */}
        <div
          data-pdf-transcript-container
          className="bg-white rounded-[32px] border border-gray-100 p-8 shadow-sm overflow-hidden"
        >
          <div className="divide-y divide-gray-200">
            {filteredTimeline.map((item, index) => {
              if (item.type === 'message') {
                const message = item.data;
                const styles =
                  speakerStyles[message.speaker] ?? speakerStyles.assistant;
                const speakerType = message.speaker;
                const msgEndMs = message.timestampValue ?? null;
                const msgStartMs =
                  msgEndMs && message.duration
                    ? msgEndMs - message.duration * 1000
                    : msgEndMs;
                const msgStartLabel = formatWallClock(msgStartMs);
                const msgEndLabel = msgEndMs ? formatWallClock(msgEndMs) : null;
                return (
                  <motion.div
                    key={message.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.02 }}
                    className="py-5 first:pt-0 flex flex-col gap-3 break-inside-avoid"
                    data-pdf-nobreak
                  >
                    {/* Row: Message Content */}
                    <div className="w-full">
                      <div className="p-4">
                        {/* Embedded source label + wall-clock timestamps */}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3">
                          {/* Run-Time Clock — Left-most element in #5f6060 */}
                          <div
                            data-timestamp-badge
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#5f6060]"
                          >
                            <Clock className="w-3.5 h-3.5 text-[#5f6060]" />
                            <span>{message.elapsedTime ?? '00:00'}</span>
                          </div>

                          <span
                            data-cat-pill
                            className={`flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full border uppercase tracking-[0.05em] ${styles.badge}`}
                          >
                            {styles.label}
                          </span>
                          {(msgStartLabel || msgEndLabel) && (
                            <span className="text-[10px] text-black-400 font-medium">
                              {msgStartLabel && (
                                <>
                                  {tL.started} {msgStartLabel}
                                </>
                              )}
                              {msgEndLabel && (
                                <>
                                  {' '}
                                  | {tL.ended} {msgEndLabel}
                                </>
                              )}
                              {message.duration && (
                                <>
                                  {' '}
                                  | {tL.duration}{' '}
                                  {formatDurationLabel(message.duration)}
                                </>
                              )}
                            </span>
                          )}
                        </div>

                        {speakerType === 'sbar_report' ? (
                          <div className="w-full">
                            <div className="flex items-center gap-2 mb-3 border-b border-orange-100 pb-2">
                              <FileText className="w-5 h-5 text-orange-600" />
                              <h4 className="text-[16px] font-bold text-[#111827]">
                                {message.message
                                  .toLowerCase()
                                  .startsWith('team communication initiated.')
                                  ? tL.sessionInitiated
                                  : tL.sbarSubmitted}
                              </h4>
                            </div>
                            <div className="whitespace-pre-wrap text-[17px] text-[#374151] leading-relaxed font-medium ml-4 p-2">
                              {message.message}
                            </div>
                          </div>
                        ) : (
                          <p
                            className={cn(
                              'w-full text-[17px] text-[#374151] leading-relaxed font-medium ml-4 p-2',
                              message.speaker === 'user'
                                ? 'text-right'
                                : 'text-left'
                            )}
                          >
                            {message.message}
                          </p>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              } else if (item.type === 'commonAction') {
                // Common Action Entry (infection / privacy / environmental)
                const action = item.data;
                // All common actions share a single Orange Outline pill style.
                const colors = {
                  badge: 'bg-white text-[#323464] border-[#db8833]',
                };

                // Use real timestamps when no simulation is configured
                const caEndMs = action.timestampMs ?? null;

                // caStartMs is the start time (end - duration)
                const caStartMs =
                  caEndMs && action.duration
                    ? caEndMs - action.duration * 1000
                    : caEndMs;

                const caStartLabel = formatWallClock(caStartMs);
                const caEndLabel = caEndMs ? formatWallClock(caEndMs) : null;

                return (
                  <motion.div
                    key={`common-${action.timestampMs}-${index}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.02 }}
                    className="py-5 first:pt-0 flex flex-col gap-3 break-inside-avoid"
                    data-pdf-nobreak
                  >
                    <div className="w-full">
                      <div className="p-4">
                        {/* Embedded label + wall-clock timestamps */}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3">
                          {/* Run-Time Clock — Left-most element in #5f6060 */}
                          <div
                            data-timestamp-badge
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#5f6060]"
                          >
                            <Clock className="w-3.5 h-3.5 text-[#5f6060]" />
                            <span>{action.elapsedTime ?? '00:00'}</span>
                          </div>

                          <span
                            data-cat-pill
                            className={`text-[10px] font-bold px-2.5 py-1 rounded-full border uppercase tracking-[0.05em] ${colors.badge}`}
                          >
                            {tL.filterOptions.commonActions}
                          </span>
                          {caStartLabel && (
                            <span className="text-[10px] text-black-400 font-medium">
                              {tL.started} {caStartLabel}
                              {caEndLabel && (
                                <>
                                  {' '}
                                  | {tL.ended} {caEndLabel}
                                </>
                              )}
                            </span>
                          )}
                        </div>
                        {/* Title */}
                        <div className="flex flex-col gap-1">
                          <h3 className="text-[18px] font-bold text-[#111827] leading-snug">
                            {translateCommonActionLabel(action.label)}
                          </h3>
                        </div>

                        {/* Prompt */}
                        {action.question && (
                          <div className="mt-2 ml-4 p-2 bg-[#e9e9e9] border border-[#5f6060] rounded-lg">
                            <div className="flex items-center gap-2 mb-2">
                              <p className="text-[10px] font-black text-[#5f6060] uppercase tracking-widest">
                                Clinical Prompt
                              </p>
                            </div>
                            <p className="text-[15px] text-[#5f6060] font-medium leading-relaxed break-words">
                              {action.question}
                            </p>
                          </div>
                        )}

                        {/* Submitted Response */}
                        {action.answer && (
                          <div className="mt-2 ml-4 p-2 bg-[#e9e9e9] border border-[#5f6060] rounded-lg">
                            <div className="flex items-center gap-2 mb-2">
                              <p className="text-[10px] font-black text-[#5f6060] uppercase tracking-widest">
                                Student Response
                              </p>
                            </div>
                            <p className="text-[16px] text-[#5f6060] font-medium leading-relaxed break-words">
                              {action.answer}
                            </p>
                          </div>
                        )}

                        {/* Notes/Observations — ml-4, no border */}
                        {(action.notes ?? action.observations) && (
                          <div className="mt-2 ml-4 p-2">
                            <p className="text-xs font-bold text-[#5f6060] uppercase tracking-wider mb-1">
                              {tL.labels.observationsNotes}{' '}
                              <span className="text-gray-500 normal-case font-normal not-italic">
                                ({tL.labels.documentation})
                              </span>
                            </p>
                            <p className="text-[15px] text-[#323464] italic break-words">
                              {action.notes ?? action.observations}
                            </p>
                          </div>
                        )}

                        {/* Correctness Status */}
                        {action.correct !== undefined && (
                          <div className="mt-3 ml-4 flex items-center gap-2">
                            {action.correct ? (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase tracking-widest shadow-sm">
                                <CheckCircle className="w-3.5 h-3.5" />{' '}
                                {tL.labels.correct}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black bg-rose-50 text-rose-700 border border-rose-200 uppercase tracking-widest shadow-sm">
                                <AlertCircle className="w-3.5 h-3.5" />{' '}
                                {tL.labels.incorrect}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              } else {
                // Summary Entry (Vitals / Clinical Actions / System Events)
                const entry = item.data;
                const category = entry.category?.toLowerCase();
                const isVital = category === 'vitals';
                const isAction =
                  category === 'actions' ||
                  category === 'action' ||
                  category === 'clinical';
                const isOrder = category === 'orders';
                const isMedication = category === 'medications';
                const isTeamComm = entry.title === 'Team Communication';
                // Check if this is a vital-type action with vitals field
                const entryData = entry as SummaryEntry & {
                  vitals?: Record<string, unknown[]>;
                };
                const hasVitalsData =
                  entryData.vitals && typeof entryData.vitals === 'object';
                const vitalsList = hasVitalsData ? entryData.vitals : null;

                // For vitals: extract value + smart unit
                const vitalUnitMap: Record<
                  string,
                  { unit: string; suffix: boolean }
                > = {
                  'heart rate recorded': { unit: 'bpm', suffix: false },
                  'blood pressure recorded': { unit: 'mmHg', suffix: false },
                  'respiratory rate recorded': {
                    unit: 'breaths/min',
                    suffix: false,
                  },
                  'temperature recorded': { unit: 'Â°F', suffix: true },
                  'spo2 recorded': { unit: '%', suffix: true },
                  'oxygen saturation recorded': { unit: '%', suffix: true },
                };
                const vitalMeta2 = isVital
                  ? vitalUnitMap[entry.title.toLowerCase()]
                  : undefined;
                const rawValue =
                  isVital && entry.details
                    ? entry.details.replace(/^Value:\s*/i, '').trim()
                    : null;
                // Append unit only if the value doesn't already include it
                const vitalValue = rawValue
                  ? vitalMeta2
                    ? rawValue.endsWith(vitalMeta2.unit)
                      ? rawValue
                      : vitalMeta2.suffix
                        ? `${rawValue}${vitalMeta2.unit}`
                        : `${rawValue} ${vitalMeta2.unit}`
                    : rawValue
                  : null;

                // Color scheme per category
                // Category display names and icons
                const categoryMeta: Record<
                  string,
                  {
                    icon: React.ReactNode;
                    label: string;
                    color: string;
                    badge: string;
                    bg: string;
                    border: string;
                  }
                > = {
                  vitals: {
                    icon: <Activity className="w-3.5 h-3.5" />,
                    label: 'Vitals',
                    color: 'text-green-700',
                    badge: 'bg-[#323464] text-white border-transparent',
                    bg: 'bg-[#F0FDF4]',
                    border: 'border-[#BBF7D0]',
                  },
                  demographics: {
                    icon: <User className="w-3.5 h-3.5" />,
                    label: 'Demographics',
                    color: 'text-orange-700',
                    badge: 'bg-[#5f6060] text-white border-transparent',
                    bg: 'bg-[#F9FAFB]',
                    border: 'border-gray-100',
                  },
                  history: {
                    icon: <FileText className="w-3.5 h-3.5" />,
                    label: 'History',
                    color: 'text-blue-700',
                    badge: 'bg-[#5f6060] text-white border-transparent',
                    bg: 'bg-[#F0F7FF]',
                    border: 'border-[#BFDBFE]',
                  },
                  actions: {
                    icon: <ClipboardList className="w-3.5 h-3.5" />,
                    label: 'Clinical Action',
                    color: 'text-indigo-700',
                    badge: 'bg-[#323464] text-white border-transparent',
                    bg: 'bg-[#F5F3FF]',
                    border: 'border-[#DDD6FE]',
                  },
                  orders: {
                    icon: <ClipboardList className="w-3.5 h-3.5" />,
                    label: 'Orders',
                    color: 'text-pink-700',
                    badge: 'bg-white text-[#323464] border-[#323464]',
                    bg: 'bg-[#FFF1F2]',
                    border: 'border-[#FECDD3]',
                  },
                  medications: {
                    icon: <Pill className="w-3.5 h-3.5" />,
                    label: 'Medications',
                    color: 'text-violet-700',
                    badge: 'bg-[#4f9096] text-white border-transparent',
                    bg: 'bg-[#F5F3FF]',
                    border: 'border-[#DDD6FE]',
                  },
                  team_communication: {
                    icon: <MessageSquare className="w-3.5 h-3.5" />,
                    label: tL.speakers.teamCommunication,
                    color: 'text-blue-700',
                    badge: 'bg-white text-[#323464] border-[#4f9096]',
                    bg: 'bg-blue-50/50',
                    border: 'border-blue-100',
                  },
                };

                const meta = isTeamComm
                  ? categoryMeta.team_communication
                  : categoryMeta[entry.category?.toLowerCase()] || {
                      icon: <Activity className="w-3.5 h-3.5" />,
                      label: entry.category || 'Action',
                      color: 'text-gray-700',
                      badge: 'bg-gray-50 text-gray-700 border-gray-200',
                      bg: 'bg-gray-50',
                      border: 'border-gray-100',
                    };

                const categoryColors = {
                  bg: meta.bg,
                  border: meta.border,
                  text: meta.color,
                  badge: meta.badge,
                  label: meta.label,
                  icon: meta.icon,
                };

                let statusBadge = null;
                if ((isOrder || isMedication || isAction) && entry.details) {
                  const d = entry.details;
                  if (
                    d.includes('Status: Not Given') ||
                    d.startsWith('[Not Given]') ||
                    d.startsWith('[Hold]')
                  ) {
                    statusBadge = (
                      <span className="text-[11px] font-black text-amber-800 tracking-wider uppercase">
                        {tL.labels.notGiven}
                      </span>
                    );
                  } else if (
                    d.includes('Status: Refused') ||
                    d.startsWith('[Refused]') ||
                    d.startsWith('[Refuse]')
                  ) {
                    statusBadge = (
                      <span className="text-[11px] font-black text-rose-800 tracking-wider uppercase">
                        {tL.labels.refused}
                      </span>
                    );
                  } else if (
                    d.includes('Status: Missed') ||
                    d.startsWith('[Missed]')
                  ) {
                    statusBadge = (
                      <span className="text-[11px] font-black text-orange-800 tracking-wider uppercase">
                        {tL.labels.missed}
                      </span>
                    );
                  } else if (
                    d.includes('Status: Inappropriate') ||
                    d.startsWith('[Inappropriate]')
                  ) {
                    statusBadge = (
                      <span className="text-[11px] font-black text-rose-800 tracking-wider uppercase">
                        {tL.labels.inappropriate}
                      </span>
                    );
                  } else if (
                    isMedication &&
                    (d.includes('Status: Held') || d.startsWith('[Held]'))
                  ) {
                    statusBadge = (
                      <span className="text-[11px] font-black text-amber-800 tracking-wider uppercase">
                        {tL.labels.held}
                      </span>
                    );
                  } else if (
                    isMedication &&
                    (d.includes('Status: Administered') ||
                      d.startsWith('[Administered]'))
                  ) {
                    statusBadge = (
                      <span className="text-[11px] font-black text-emerald-800 tracking-wider uppercase">
                        {tL.labels.administered}
                      </span>
                    );
                  }
                }

                // Use real timestamps when no simulation is configured
                const entryEndMs = entry.timestampValue ?? null;

                // Prefer the explicitly stored start timestamp (real wall-clock
                // when the activity began). Fall back to duration-based math,
                // then to entryEndMs as a last resort.
                const entryStartMs =
                  entry.startTimestampValue ??
                  (entryEndMs && entry.duration
                    ? entryEndMs - entry.duration * 1000
                    : entryEndMs);

                const entryStartLabel = formatWallClock(entryStartMs);
                const entryEndLabel = entryEndMs
                  ? formatWallClock(entryEndMs)
                  : null;

                // Skip rendering if entry has no meaningful content
                // Check for title AND at least one substantial content field

                const hasSubstantialContent =
                  entry.sbarQualitativeResult ||
                  hasVitalsData ||
                  (entry.details && entry.details.trim().length > 0) ||
                  (entry.question && entry.question.trim().length > 0) ||
                  (entry.answer &&
                    ((typeof entry.answer === 'string' &&
                      entry.answer.trim().length > 0) ||
                      (Array.isArray(entry.answer) &&
                        entry.answer.length > 0))) ||
                  (entry.notes && entry.notes.trim().length > 0) ||
                  (entry.observations && entry.observations.trim().length > 0);

                if (!entry.title || !hasSubstantialContent) {
                  return null;
                }

                return (
                  <motion.div
                    key={entry.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.02 }}
                    className="py-5 first:pt-0 flex flex-col gap-2 break-inside-avoid"
                    data-pdf-nobreak
                  >
                    <div className="w-full">
                      <div className="p-4">
                        {/* Embedded source label + wall-clock timestamps */}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3">
                          {/* Run-Time Clock — Left-most element in #5f6060 */}
                          <div
                            data-timestamp-badge
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#5f6060]"
                          >
                            <Clock className="w-3.5 h-3.5 text-[#5f6060]" />
                            <span>{entry.elapsedTime ?? '00:00'}</span>
                          </div>

                          {/* Category Badge — No square brackets */}
                          <span
                            data-cat-pill
                            className={`flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full border uppercase tracking-[0.05em] ${categoryColors.badge}`}
                          >
                            {translateEntryCategory(entry.category)}
                          </span>
                          {/* Standard Summary Start/End Labels */}
                          {!entry.sbarQualitativeResult &&
                            (entryStartLabel || entryEndLabel) && (
                              <span className="text-[10px] text-black-400 font-medium">
                                {entryStartLabel && (
                                  <>
                                    {tL.started} {entryStartLabel}
                                  </>
                                )}
                                {entryEndLabel && (
                                  <>
                                    {' '}
                                    | {tL.ended} {entryEndLabel}
                                  </>
                                )}
                                {entry.duration && (
                                  <>
                                    {' '}
                                    | {tL.duration}{' '}
                                    {formatDurationLabel(entry.duration)}
                                  </>
                                )}
                              </span>
                            )}
                          {/* SBAR Unified Event Start/End Labels */}
                          {entry.sbarQualitativeResult &&
                            (entry.sbarStartMs ?? entry.sbarSubmitMs) && (
                              <span className="text-[10px] text-black-400 font-medium">
                                {entry.sbarStartMs && (
                                  <>
                                    {tL.started}{' '}
                                    {formatWallClock(entry.sbarStartMs)}
                                  </>
                                )}
                                {entry.sbarSubmitMs && (
                                  <>
                                    {' '}
                                    | {tL.ended}{' '}
                                    {formatWallClock(entry.sbarSubmitMs)}
                                  </>
                                )}
                                {entry.sbarStartMs && entry.sbarSubmitMs && (
                                  <>
                                    {' '}
                                    | {tL.duration}{' '}
                                    {formatElapsedLabel(
                                      (entry.sbarSubmitMs - entry.sbarStartMs) /
                                        1000
                                    )}
                                  </>
                                )}
                              </span>
                            )}
                        </div>
                        <div className="flex flex-col gap-3">
                          {entry.sbarQualitativeResult ? (
                            <div className="flex flex-col gap-4 text-[15px] font-medium leading-relaxed mt-2">
                              <h3 className="text-[18px] font-bold text-[#111827] leading-snug">
                                {translateEntryTitle(entry.title)}
                              </h3>
                              {/* Prompt — ml-4, no border */}
                              <div className="ml-4 p-2 bg-[#e9e9e9] border border-[#5f6060] rounded-lg">
                                <p className="text-[10px] font-black text-[#5f6060] uppercase tracking-widest mb-2">
                                  {tL.labels.prompt}
                                </p>
                                <p className="text-[15px] text-[#5f6060] font-medium leading-relaxed break-words">
                                  {(() => {
                                    const raw = (entry.sbarPrompt ?? '').trim();
                                    const normalized = raw
                                      .replace(/\.+$/, '')
                                      .toLowerCase();
                                    if (
                                      !raw ||
                                      normalized === 'no prompt provided' ||
                                      normalized === 'no prompt recorded'
                                    ) {
                                      return tL.noPromptProvided;
                                    }
                                    return entry.sbarPrompt;
                                  })()}
                                </p>
                              </div>
                              {/* Submission — ml-4, no border */}
                              <div className="ml-4 p-2 bg-[#e9e9e9] border border-[#5f6060] rounded-lg">
                                <p className="text-[10px] font-black text-[#5f6060] uppercase tracking-widest mb-2">
                                  {tL.labels.studentSbarSubmission}
                                </p>
                                <p className="text-[15px] text-[#5f6060] font-medium leading-relaxed break-words whitespace-pre-wrap">
                                  {entry.sbarSubmission}
                                </p>
                              </div>
                              {/* Result */}
                              <div className="flex items-center gap-3 ml-4">
                                <p className="text-sm font-bold text-gray-500 uppercase tracking-wider">
                                  {tL.labels.result}
                                </p>
                                <span
                                  className={cn(
                                    'px-3 py-1 rounded-full text-[13px] font-bold shadow-sm border uppercase',
                                    entry.sbarQualitativeResult.toLowerCase() ===
                                      'satisfactory'
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                      : 'bg-rose-50 text-rose-700 border-rose-200'
                                  )}
                                >
                                  {entry.sbarQualitativeResult.toLowerCase() ===
                                  'satisfactory'
                                    ? tL.labels.satisfactory
                                    : tL.labels.unsatisfactory}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center justify-between gap-4">
                                <h3 className="text-[18px] font-bold text-[#111827] leading-snug flex items-center gap-2 flex-wrap sm:flex-nowrap">
                                  <span>
                                    {translateEntryTitle(entry.title)}
                                  </span>
                                  {(() => {
                                    const typeLabel = (() => {
                                      if (
                                        category === 'demographics' ||
                                        category === 'history' ||
                                        entry.type?.toLowerCase() ===
                                          'documentation'
                                      ) {
                                        return (
                                          tL.labels?.documentation ||
                                          'Documentation'
                                        );
                                      }
                                      if (
                                        entry.type
                                          ?.toLowerCase()
                                          .startsWith('vital') ||
                                        (entry.title &&
                                          /obtain\s+vital\s+signs/i.test(
                                            entry.title
                                          )) ||
                                        entry.vitals
                                      ) {
                                        return (
                                          tL.actionTypes?.vitalSigns ||
                                          'Vital Signs'
                                        );
                                      }
                                      if (entry.type) {
                                        return formatActionType(entry.type);
                                      }
                                      if (entry.question || entry.answer) {
                                        if (
                                          entry.type === 'ordering' ||
                                          (Array.isArray(entry.answer) &&
                                            entry.answer.length > 1)
                                        ) {
                                          return (
                                            tL.actionTypes?.sequential ||
                                            'Sequential Question'
                                          );
                                        }
                                        return (
                                          tL.actionTypes?.multipleChoice ||
                                          'Multiple Choice Question'
                                        );
                                      }
                                      return null;
                                    })();

                                    if (!typeLabel) {
                                      return null;
                                    }
                                    return (
                                      <span className="text-sm font-normal text-gray-400 shrink-0">
                                        ({typeLabel})
                                      </span>
                                    );
                                  })()}
                                </h3>
                                {statusBadge}
                              </div>
                            </div>
                          )}

                          {/* Question/Prompt */}
                          {!entry.sbarQualitativeResult && entry.question && (
                            <div className="mt-2 ml-4 p-2 bg-[#e9e9e9] border border-[#5f6060] rounded-lg">
                              <div className="flex items-center gap-2 mb-2">
                                <p className="text-[10px] font-black text-[#5f6060] uppercase tracking-widest">
                                  {tL.labels.clinicalPrompt}
                                </p>
                              </div>
                              <p className="text-[15px] text-[#5f6060] font-medium leading-relaxed break-words">
                                {entry.question}
                              </p>
                            </div>
                          )}

                          {/* Submitted Response */}
                          {entry.answer && (
                            <div className="mt-2 ml-4 p-2 bg-[#e9e9e9] border border-[#5f6060] rounded-lg">
                              <div className="flex items-center gap-2 mb-2">
                                <p className="text-[10px] font-black text-[#5f6060] uppercase tracking-widest">
                                  {tL.labels.studentResponse}
                                </p>
                              </div>
                              <div className="text-[16px] text-[#5f6060] font-medium leading-relaxed break-words">
                                {(() => {
                                  if (entry.type !== 'ordering') {
                                    const displayAnswer = Array.isArray(
                                      entry.answer
                                    )
                                      ? entry.answer.join(', ')
                                      : String(entry.answer ?? '');
                                    return (
                                      <p>
                                        {translateSummaryAnswer(displayAnswer)}
                                      </p>
                                    );
                                  }

                                  let items: string[] = [];
                                  if (entry.details?.includes(' ||| ')) {
                                    const match = entry.details.match(
                                      /Submitted:\s*(.*?)(?=\n|$|\|\s*Started:)/i
                                    );
                                    if (match?.[1]) {
                                      items = match[1].split(' ||| ');
                                    } else {
                                      const raw = entry.details
                                        .split(/\|\s*Started:/i)[0]
                                        .trim();
                                      items = raw.split(' ||| ');
                                    }
                                  } else {
                                    if (Array.isArray(entry.answer)) {
                                      items = entry.answer as string[];
                                    } else {
                                      const answerStr = String(
                                        entry.answer ?? ''
                                      );
                                      items = answerStr.includes(' ||| ')
                                        ? answerStr.split(' ||| ')
                                        : [answerStr];
                                    }
                                  }

                                  return (
                                    <ol className="list-decimal pl-5 space-y-1">
                                      {items.map((item: string, i: number) => (
                                        <li key={i}>{item.trim()}</li>
                                      ))}
                                    </ol>
                                  );
                                })()}
                              </div>
                            </div>
                          )}

                          {/* Notes/Observations — ml-4, no border */}
                          {(entry.notes ?? entry.observations) && (
                            <div className="mt-2 ml-4 p-2">
                              <div className="flex items-center gap-2 mb-2">
                                <p className="text-[10px] font-black text-[#5f6060] uppercase tracking-widest">
                                  {tL.labels.clinicalObservations}{' '}
                                  <span className="text-gray-500 normal-case font-normal not-italic">
                                    ({tL.labels.documentation})
                                  </span>
                                </p>
                              </div>
                              <p className="text-[15px] text-[#323464] italic leading-relaxed break-words">
                                {entry.notes ?? entry.observations}
                              </p>
                            </div>
                          )}

                          {/* Satisfactory / Unsatisfactory Status */}
                          {entry.satisfactory !== undefined && (
                            <div
                              className="flex flex-wrap items-center gap-2 mt-3 ml-4"
                              role="status"
                              aria-label={`Action result: ${entry.satisfactory ? 'Satisfactory' : 'Unsatisfactory'}`}
                            >
                              {entry.satisfactory ? (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase tracking-widest shadow-sm">
                                  <CheckCircle
                                    className="w-3.5 h-3.5"
                                    aria-hidden="true"
                                  />
                                  {tL.labels.satisfactory}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-black bg-rose-50 text-rose-700 border border-rose-200 uppercase tracking-widest shadow-sm">
                                  <AlertCircle
                                    className="w-3.5 h-3.5"
                                    aria-hidden="true"
                                  />
                                  {tL.labels.unsatisfactory}
                                </span>
                              )}
                            </div>
                          )}
                          {isVital && vitalValue ? (
                            <div className="w-fit ml-4">
                              <span className="text-[20px] font-black text-[#111827] py-1">
                                {vitalValue}
                              </span>
                            </div>
                          ) : (entry.category === 'demographics' ||
                              entry.category === 'history') &&
                            entry.details ? (
                            <div className="w-full ml-4">
                              <p className="text-[15px] font-normal text-[#323464] bg-transparent py-2 italic leading-relaxed">
                                {entry.details}
                              </p>
                            </div>
                          ) : null}
                        </div>
                        {!isVital &&
                          isMedication &&
                          entry.details &&
                          !entry.sbarQualitativeResult && (
                            <MedicationTranscriptCard entry={entry} />
                          )}
                        {!isVital &&
                          entry.category !== 'demographics' &&
                          entry.category !== 'history' &&
                          entry.type !== 'ordering' &&
                          !isMedication &&
                          entry.details &&
                          !hasVitalsData &&
                          !entry.sbarQualitativeResult &&
                          cleanDetails(entry.details, !!entry.answer) &&
                          (() => {
                            const detailsText = cleanDetails(
                              entry.details,
                              !!entry.answer
                            );
                            if (!entry.answer) {
                              return true;
                            }
                            const norm1 = detailsText
                              .replace(/\|\|\|/g, ',')
                              .split(',')
                              .map((s) => s.trim())
                              .filter(Boolean)
                              .join(',');
                            const norm2 = entry.answer
                              .replace(/\|\|\|/g, ',')
                              .split(',')
                              .map((s) => s.trim())
                              .filter(Boolean)
                              .join(',');
                            return (
                              norm1 !== norm2 && detailsText !== entry.answer
                            );
                          })() && (
                            <div className="text-[15px] text-gray-600 mt-2 font-medium leading-relaxed">
                              {(() => {
                                const detailsText = cleanDetails(
                                  entry.details,
                                  !!entry.answer
                                );
                                if (detailsText.startsWith('Submitted: ')) {
                                  const listContent = detailsText.substring(
                                    'Submitted: '.length
                                  );
                                  const isPipeDelimited =
                                    listContent.includes(' ||| ');
                                  const items = isPipeDelimited
                                    ? listContent.split(' ||| ')
                                    : listContent.split(',');

                                  return (
                                    <div className="flex flex-col gap-2">
                                      <p className="font-bold text-gray-700">
                                        {tL.submittedPrefix}
                                      </p>
                                      <ol className="list-decimal pl-5 space-y-1">
                                        {items.map((item, i) => (
                                          <li key={i}>{item.trim()}</li>
                                        ))}
                                      </ol>
                                    </div>
                                  );
                                }
                                return translateSummaryDetails(detailsText);
                              })()}
                            </div>
                          )}
                        {hasVitalsData && vitalsList && (
                          <div className="mt-4 bg-white/80 backdrop-blur-sm border border-gray-200 rounded-lg px-4 py-4">
                            {cleanDetails(entry.details, !!entry.answer) && (
                              <p className="text-[15px] text-gray-600 font-medium leading-relaxed mb-4 pb-3 border-b border-gray-200">
                                {translateSummaryDetails(
                                  cleanDetails(entry.details, !!entry.answer)
                                )}
                              </p>
                            )}
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
                              {tL.labels.vitalSignsObtained}
                            </p>
                            <div className="space-y-2">
                              {Object.entries(vitalsList).map(
                                ([vitalId, readings]: [string, unknown]) => {
                                  if (
                                    !Array.isArray(readings) ||
                                    readings.length === 0
                                  ) {
                                    return null;
                                  }

                                  // Map vital IDs to display names
                                  const vitalNameMap: Record<string, string> = {
                                    hr: 'HR',
                                    bp: 'BP',
                                    rr: 'RR',
                                    spo2: 'SpO2',
                                    temp: 'Temp',
                                  };

                                  const displayName =
                                    vitalNameMap[vitalId] ||
                                    vitalId.toUpperCase();
                                  const count = readings.length;

                                  // Extract values from reading entries
                                  const values = readings.map(
                                    (reading: unknown) => {
                                      // Handle both string values and object entries with details field
                                      if (typeof reading === 'string') {
                                        return reading;
                                      }
                                      const r = reading as { details?: string };
                                      if (r.details) {
                                        return r.details
                                          .replace(/^Value:\s*/i, '')
                                          .trim();
                                      }
                                      return 'N/A';
                                    }
                                  );

                                  return (
                                    <div
                                      key={vitalId}
                                      className="flex items-start gap-3 bg-gray-50/50 rounded-lg px-3 py-2"
                                    >
                                      <span className="text-[14px] font-bold text-gray-900 min-w-[80px]">
                                        {displayName} x{count}
                                      </span>
                                      <span className="text-[14px] font-semibold text-[#5f6060] flex-1 min-w-0 break-words">
                                        ({values.join('; ')})
                                      </span>
                                    </div>
                                  );
                                }
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              }

              if (item.type === 'commonAction') {
                const action = item.data as CommonActionEntry;
                return (
                  <CommonActionItem
                    key={`action-${action.label}-${action.timestampMs}`}
                    action={action}
                    index={index}
                  />
                );
              }

              // Summary entry
              const entry = item.data as SummaryEntry;

              // Safety check: don't render empty summaries
              if (!entry.title || entry.title.trim().length === 0) {
                return null;
              }

              return (
                <SummaryEntryItem
                  key={`summary-${entry.id}`}
                  entry={entry}
                  index={index}
                />
              );
            })}

            {filteredTimeline.length > 0 && (
              <div className="flex justify-center pt-8 pb-4 pdf-hide">
                <button
                  type="button"
                  onClick={() => {
                    try {
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    } catch {
                      /* ignore */
                    }
                    try {
                      if (document.documentElement)
                        document.documentElement.scrollTo({
                          top: 0,
                          behavior: 'smooth',
                        });
                      if (document.body)
                        document.body.scrollTo({ top: 0, behavior: 'smooth' });
                    } catch {
                      /* ignore */
                    }
                    const anchor =
                      document.getElementById('transcript-top-anchor') ||
                      document.getElementById('report-printable');
                    if (anchor) {
                      try {
                        anchor.scrollIntoView({
                          behavior: 'smooth',
                          block: 'start',
                        });
                      } catch {
                        /* ignore */
                      }
                    }
                    try {
                      const elements = Array.from(
                        document.querySelectorAll('*')
                      );
                      for (const el of elements) {
                        if (el.scrollTop > 0) {
                          el.scrollTo({ top: 0, behavior: 'smooth' });
                        }
                      }
                    } catch {
                      /* ignore */
                    }
                  }}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-full border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm active:scale-95 cursor-pointer"
                >
                  <ArrowUp className="w-4 h-4 text-gray-700" />
                  <span>
                    {language === 'es' ? 'Volver arriba' : 'Back to top'}
                  </span>
                </button>
              </div>
            )}

            {filteredTimeline.length === 0 && (
              <div className="text-center py-20">
                <MessageCircle className="w-16 h-16 text-[#E5E7EB] mx-auto mb-4" />
                <h3 className="text-xl font-bold text-[#111827] mb-2">
                  No records found
                </h3>
                <p className="text-[#6B7280]">
                  {searchTerm
                    ? 'Adjust your search parameters and try again.'
                    : isFiltered
                      ? 'No transcript data available for the selected criteria.'
                      : 'No transcript data available.'}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
