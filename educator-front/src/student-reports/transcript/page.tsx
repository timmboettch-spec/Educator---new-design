 
 
 
 
 
import {
  motion,
} from "framer-motion";
import jsPDF from "jspdf";
import {
  ArrowLeft,
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
} from "lucide-react";
import { useState, useEffect, useRef, useMemo } from "react";

import { api } from "../studentReportApi";
import { resolveDisplayClassName } from "../resolveDisplayClassName";
import {
  timelineComparator,
  parseElapsedTimeToSeconds,
  type TimelineSortItem,
} from "../../student-transcript/transcript-logic";
import { sanitizePdfText, cn } from "../../lib/utils";

import CommonActionItem from "./components/CommonActionItem";
import SummaryEntryItem from "./components/SummaryEntryItem";
import TranscriptHeader from "./components/TranscriptHeader";
import type { TranscriptHeaderLabels } from "./components/TranscriptHeader";
import loginEn from "../../locales/auth/login/en.json";
import loginEs from "../../locales/auth/login/es.json";
import MedicationTranscriptCard, {
  EDUCATION_LABEL_MAP,
  EDUCATION_ORDER,
  VERIFICATION_LABEL_MAP,
  VERIFICATION_ORDER,
  normalizeChecklistList,
} from "./MedicationTranscriptCard";

import type { AssessmentReport } from "../../types/assessmentReport";

interface TranscriptMessage {
  id: string;
  speaker:
    | "user"
    | "assistant"
    | "provider"
    | "sbar_report"
    | "system"
    | "order"
    | "student_team_comm";
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
  type: "infection" | "privacy" | "environmental";
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
  | { type: "message"; data: TranscriptMessage }
  | { type: "summary"; data: SummaryEntry }
  | { type: "commonAction"; data: CommonActionEntry };

export interface StudentTranscriptViewProps {
  reportId: string;
  onBack?: () => void;
  variant?: "student" | "educator";
  classNameOverride?: string;
}

export default function StudentTranscriptView({
  reportId,
  onBack,
  variant = "student",
  classNameOverride,
}: StudentTranscriptViewProps) {

  const [language, setLanguage] = useState<"en" | "es">(() =>
    typeof window !== "undefined"
      ? localStorage.getItem("app_language")?.toLowerCase() === "es" ? "es" : "en"
      : "en"
  );

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "app_language") {
        setLanguage(e.newValue?.toLowerCase() === "es" ? "es" : "en");
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const locale = language === "es" ? loginEs : loginEn;
  const tL = locale.studentReport;
  // Use es-US (not es-ES) so Spanish dates render as "julio 22, 2026"
  // and "07/22/2026" — matches the HS-online reference PDF formatting.
  const dateLocale = language === "es" ? "es-US" : "en-US";

  // ─────────────────────────────────────────────────────────────────────────
  // Entry title + category localisation
  // Scenario runtime emits English titles like "NAME Updated",
  // "Chief Complaint Updated", "History of Present Illness (HPI)". We keep
  // the raw English in the data model (for search/export) and swap in
  // localised labels at render time only. Categories rendered as [xxx]
  // badges follow the same pattern.
  // ─────────────────────────────────────────────────────────────────────────
  const FIELD_KEY_MAP: Record<string, keyof typeof tL.entryFields> = {
    name: "name",
    "patient name": "name",
    dob: "dob",
    age: "age",
    gender: "gender",
    race: "race",
    "chief complaint": "chiefComplaint",
    "history of present illness (hpi)": "hpi",
    "history of present illness": "hpi",
    hpi: "hpi",
    "past medical history": "pastMedicalHistory",
    "past surgical history": "pastSurgicalHistory",
    "family medical history": "familyMedicalHistory",
    "primary care provider": "primaryCareProvider",
    allergies: "allergies",
    "current home medications & indications": "currentMedications",
    "current home medications and indications": "currentMedications",
    "current medications": "currentMedications",
    "tobacco use": "tobacco",
    tobacco: "tobacco",
    "alcohol use": "alcohol",
    alcohol: "alcohol",
    "exercise history": "exercise",
    exercise: "exercise",
    diet: "diet",
    stress: "stress",
    sleep: "sleep",
    housing: "housing",
    transportation: "transportation",
    occupation: "occupation",
    height: "height",
    weight: "weight",
    immunization: "immunization",
    immunizations: "immunization",
    "history of drug use": "drugHistory",
    "drug use": "drugHistory",
    "social history": "socialHistory",
    "additional notes": "notes",
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
  type FieldGender = "ms" | "mp" | "fs" | "fp";
  const FIELD_GENDER_BY_KEY: Record<
    keyof typeof tL.entryFields,
    FieldGender
  > = {
    name: "ms",
    dob: "ms",
    age: "fs",
    gender: "ms",
    race: "fs",
    chiefComplaint: "ms",
    hpi: "fs",
    pastMedicalHistory: "mp",
    pastSurgicalHistory: "mp",
    familyMedicalHistory: "mp",
    primaryCareProvider: "ms",
    allergies: "fp",
    currentMedications: "mp",
    tobacco: "ms",
    alcohol: "ms",
    exercise: "fs",
    diet: "fs",
    stress: "ms",
    sleep: "ms",
    housing: "fs",
    transportation: "ms",
    occupation: "fs",
    height: "fs",
    weight: "ms",
    immunization: "fs",
    drugHistory: "ms",
    socialHistory: "fs",
    notes: "fp",
  };

  const translateEntryTitle = (raw: string | undefined): string => {
    if (!raw) return raw ?? "";
    const trimmed = raw.trim();
    // Direct match for common canonical titles
    if (trimmed.toLowerCase() === "team communication") {
      return tL.speakers.teamCommunication ?? raw;
    }
    // Pattern: "<Category>: <Subcategory>" (e.g. "Nursing: Mobility & Positioning")
    // — this shape is produced by [ORDERS] release entries. Run each half
    // through translateDetailsValue so it lines up with the localized
    // Categoría/Subcategoría row below the title. Unknown segments pass
    // through verbatim, so non-order colon titles are safe.
    if (trimmed.includes(":")) {
      const [head, ...rest] = trimmed.split(":");
      const tail = rest.join(":").trim();
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
        ? (FIELD_GENDER_BY_KEY[fieldKey] ?? "ms")
        : "ms";
      const variantsBag = (
        tL as unknown as {
          savedSuffixVariants?: Record<FieldGender, string>;
          updatedSuffixVariants?: Record<FieldGender, string>;
        }
      );
      const variants =
        rawSuffix === "saved"
          ? variantsBag.savedSuffixVariants
          : variantsBag.updatedSuffixVariants;
      const suffix =
        variants?.[gender] ??
        (rawSuffix === "saved"
          ? (tL.savedSuffix ?? "Saved")
          : (tL.updatedSuffix ?? "Updated"));
      const originalSuffix = rawSuffix === "saved" ? "Saved" : "Updated";
      if (translatedField === rawField && suffix === originalSuffix) return raw;
      return `${translatedField} ${suffix}`;
    }
    // Bare field name (e.g. history-tab entries)
    const translatedBare = translateFieldName(trimmed);
    return translatedBare === trimmed ? raw : translatedBare;
  };

  const CATEGORY_KEY_MAP: Record<string, keyof typeof tL.categories> = {
    vitals: "vitals",
    demographics: "demographics",
    history: "history",
    "clinical action": "clinicalAction",
    orders: "orders",
    medications: "medications",
    "team communication": "teamCommunication",
    summary: "summary",
    actions: "actions",
    action: "action",
    clinical: "clinical",
    system: "system",
  };

  const translateEntryCategory = (raw: string | undefined): string => {
    const fallback = raw ?? "summary";
    const key = CATEGORY_KEY_MAP[fallback.trim().toLowerCase()];
    if (!key) return fallback;
    return tL.categories[key] ?? fallback;
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
    "eye protection donned": "eyeProtectionDonned",
    "eye protection doffed": "eyeProtectionDoffed",
    "isolation gown donned": "isolationGownDonned",
    "isolation gown doffed": "isolationGownDoffed",
    "standard gloves donned": "standardGlovesDonned",
    "standard gloves doffed": "standardGlovesDoffed",
    "sterile gloves donned": "sterileGlovesDonned",
    "sterile gloves doffed": "sterileGlovesDoffed",
    "respirator mask donned": "respiratorMaskDonned",
    "respirator mask doffed": "respiratorMaskDoffed",
    "surgical/procedural mask donned": "surgicalMaskDonned",
    "surgical/procedural mask doffed": "surgicalMaskDoffed",
    "surgical mask donned": "surgicalMaskDonned",
    "surgical mask doffed": "surgicalMaskDoffed",
    "hand hygiene performed": "handHygienePerformed",
    "sharps discarded": "sharpsDiscarded",
    "non-infectious waste discarded": "nonInfectiousDiscarded",
    "infectious waste discarded": "infectiousDiscarded",
    "door knocked": "doorKnocked",
    "knocking stopped": "knockingStopped",
    "door opened": "doorOpened",
    "door closed": "doorClosed",
    "curtain opened": "curtainOpened",
    "curtain closed": "curtainClosed",
    "bed/chair locked confirmed": "bedChairLocked",
    "bed/chair alarm activated": "bedChairAlarm",
    "bed lowest position confirmed": "bedLowestPosition",
    "call light in reach confirmed": "callLightConfirmed",
    "equipment checked": "equipmentChecked",
    "lines / tubes / drains checked": "linesTubesDrains",
    "lines/tubes/drains checked": "linesTubesDrains",
    "personal items within reach confirmed": "personalItemsConfirmed",
  };

  const translateCommonActionLabel = (raw: string | undefined): string => {
    if (!raw) return raw ?? "";
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
    "asked patient to state their full name":
      tL.medicationCard.verificationLabels.askedFullName,
    "asked patient to state their date of birth":
      tL.medicationCard.verificationLabels.askedDateOfBirth,
    "scanned/checked patient wristband":
      tL.medicationCard.verificationLabels.scannedWristband,
    "verified medication name":
      tL.medicationCard.verificationLabels.verifiedMedicationName,
    "verified medication is not expired":
      tL.medicationCard.verificationLabels.verifiedNotExpired,
    "verified absence of allergies or contraindications":
      tL.medicationCard.verificationLabels.verifiedNoAllergies,
    "verified medication strength/concentration":
      tL.medicationCard.verificationLabels.verifiedStrength,
    // Education checklist (short + long forms)
    "purpose discussed":
      tL.medicationCard.educationLabels.purposeDiscussed,
    "side effects reviewed":
      tL.medicationCard.educationLabels.sideEffectsReviewed,
    "instructions provided":
      tL.medicationCard.educationLabels.instructionsProvided,
    "questions answered":
      tL.medicationCard.educationLabels.questionsAnswered,
    "patient understanding":
      tL.medicationCard.educationLabels.patientUnderstanding,
    "discussed medication purpose and indication":
      tL.medicationCard.educationLabels.discussedPurposeIndication,
    "reviewed potential side effects":
      tL.medicationCard.educationLabels.reviewedSideEffectsFull,
    "provided medication instructions":
      tL.medicationCard.educationLabels.providedInstructionsFull,
    "answered patient questions":
      tL.medicationCard.educationLabels.answeredPatientQuestions,
    "patient verbalizes understanding":
      tL.medicationCard.educationLabels.patientVerbalizesUnderstanding,
  };

  const translateChecklistItem = (raw: string | undefined): string => {
    if (!raw) return raw ?? "";
    return CHECKLIST_LABEL_MAP[raw.trim().toLowerCase()] ?? raw;
  };

  // Localise the free-text clinical-decision value ("Proceed" / "Held" /
  // "Refused" from the grading pipeline) using
  // `tL.medicationCard.clinicalDecisionValues`. Unknown values pass through.
  const translateClinicalDecisionValue = (
    raw: string | undefined,
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
    raw: string | undefined,
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
  const translateAtLabel = (raw: string | undefined): string => {
    if (!raw) return "";
    const trimmed = raw.trim();
    if (!trimmed) return "";
    // Fast-path: "Administered At" → tL row label.
    if (trimmed.toLowerCase() === "administered at") {
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
      const adminEs = translateStatusValue("Administered") ?? "Administered";
      const suffixMatch = adminAtLabel
        .toLowerCase()
        .startsWith(adminEs.toLowerCase())
        ? adminAtLabel.slice(adminEs.length)
        : " At";
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
    category: "category",
    subcategory: "subcategory",
    "time viewed": "timeViewed",
  };

  const DETAILS_VALUE_MAP: Record<string, keyof typeof tL.detailsValues> = {
    diet: "diet",
    imaging: "imaging",
    lab: "lab",
    medication: "medication",
    nursing: "nursing",
    procedures: "procedures",
    referrals: "referrals",
    therapy: "therapy",
    other: "other",
    stat: "stat",
    scheduled: "scheduled",
    prn: "prn",
    communication: "communication",
    chemistry: "chemistry",
    "monitoring and assessments": "monitoringAssessments",
    "monitoring & assessments": "monitoringAssessments",
    documentation: "documentation",
    "skin & wound care": "skinWoundCare",
    "skin and wound care": "skinWoundCare",
    "mobility & positioning": "mobilityPositioning",
    "mobility and positioning": "mobilityPositioning",
    "patient education & teaching": "patientEducation",
    "patient education and teaching": "patientEducation",
    "patient education": "patientEducation",
    "not applicable": "notApplicable",
    radiography: "radiography",
    ct: "ct",
    mri: "mri",
    "admission / discharge / transfer": "admissionDischarge",
    "admission / discharge": "admissionDischarge",
    action: "action",
    "expected actions": "expectedActions",
    timeline: "timeline",
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
    if (!raw) return raw ?? "";
    if (!raw.includes(":")) return raw;
    return raw
      .split("|")
      .map((segment) => {
        const trimmed = segment.trim();
        const colonIdx = trimmed.indexOf(":");
        if (colonIdx <= 0) return segment;
        const label = trimmed.substring(0, colonIdx);
        const value = trimmed.substring(colonIdx + 1).trim();
        const translatedLabel = translateDetailsLabel(label);
        // Only try to translate the value when the label was a known enum
        // label; otherwise the value could be free-text (times, notes, etc.).
        const translatedValue =
          translatedLabel !== label
            ? translateDetailsValue(value)
            : value;
        if (translatedLabel === label && translatedValue === value) {
          return segment;
        }
        const leadingWs = segment.match(/^\s*/)?.[0] ?? "";
        const trailingWs = segment.match(/\s*$/)?.[0] ?? "";
        return `${leadingWs}${translatedLabel}: ${translatedValue}${trailingWs}`;
      })
      .join("|");
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Answer patterns
  // Translates the well-known "Checked N vital sign(s)" answer produced by
  // the vital-signs action runtime. Unknown answers pass through unchanged.
  // ─────────────────────────────────────────────────────────────────────────
  const CHECKED_VITALS_RE = /^\s*Checked\s+(\d+)\s+vital\s+sign\(s\)\s*$/i;

  const translateSummaryAnswer = (raw: string | undefined): string => {
    if (!raw) return raw ?? "";
    const m = raw.match(CHECKED_VITALS_RE);
    if (m) {
      const n = m[1];
      const template =
        Number(n) === 1
          ? (tL.checkedVitalSignsOne ?? `Checked ${n} vital sign`)
          : (tL.checkedVitalSignsOther ?? `Checked ${n} vital signs`);
      return template.replace("{n}", n);
    }
    return raw;
  };


  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  
  const [timelineItems, setTimelineItems] = useState<TimelineItem[]>([]);
  // Vitals map: keyed by short ID (hr/bp/rr/spo2/temp) â†’ array of reading objects.
  // Populated directly from summaryByCategory.vitals at load time so the PDF
  // handler always has reliable access to this data.
  const [vitalsMapState, setVitalsMapState] = useState<Record<
    string,
    Array<{ title?: string; details?: string }>
  > | null>(null);
  const [realSessionStartTime, setRealSessionStartTime] = useState<
    string | null
  >(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [report, setReport] = useState<AssessmentReport | null>(null);
  const displayClassName = useMemo(
    () =>
      resolveDisplayClassName(
        report?.studentClass,
        classNameOverride,
        report?.studentName,
      ),
    [report?.studentClass, classNameOverride, report?.studentName],
  );
  const [simulationStartTime, setSimulationStartTime] = useState<string | null>(
    null,
  );
  const [simulationStartDate, setSimulationStartDate] = useState<string | null>(
    null,
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
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isFilterOpen]);

  // By default, show all relevant entry types
  const [selectedFilters, setSelectedFilters] = useState<string[]>([
    "Actions",
    "Common Actions",
    "Demographics",
    "History",
    "Medications",
    "Orders",
    "Patient Responses",
    "Student Responses",
    "Team Communication",
  ]);

  // Filter options use stable English keys for filter logic; the visible labels
  // are looked up via `filterLabelMap` below so `selectedFilters` stays in sync
  // with the strings tested by `itemMatchesFilter` / `filteredTimeline`.
  const filterOptions = [
    "Actions",
    "Common Actions",
    "Demographics",
    "History",
    "Medications",
    "Orders",
    "Patient Responses",
    "Student Responses",
    "Team Communication",
  ];

  // Map the English filter keys stored in `selectedFilters` to their localized
  // display labels. `selectedFilters` intentionally stays English because
  // downstream matchers (itemMatchesFilter, etc.) key off those exact strings.
  const filterLabelMap: Record<string, string> = {
    Actions: tL.filterOptions.actions,
    "Common Actions": tL.filterOptions.commonActions,
    Demographics: tL.filterOptions.demographics,
    History: tL.filterOptions.history,
    Medications: tL.filterOptions.medications,
    Orders: tL.filterOptions.orders,
    "Patient Responses": tL.filterOptions.patientResponses,
    "Student Responses": tL.filterOptions.studentResponses,
    "Team Communication": tL.filterOptions.teamCommunication,
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
      color: "text-[#db8833]",
      badge: "bg-[#FFF0EB] text-[#db8833] border-[#FFE7E0]",
      avatarBg: "bg-[#FFF0EB]",
      bubbleBg: "bg-[#fef2f2]",
      border: "border-[#FFE7E0]",
    },
    provider: {
      icon: <MessageSquare className="w-5 h-5 text-blue-600" />,
      label: tL.speakers.provider,
      color: "text-blue-600",
      badge: "bg-blue-50 text-blue-600 border-blue-100",
      avatarBg: "bg-blue-50",
      bubbleBg: "bg-blue-50/30",
      border: "border-blue-100",
    },
    assistant: {
      icon: <Activity className="w-5 h-5 text-teal-600" />,
      label: tL.speakers.patient,
      color: "text-teal-600",
      badge: "bg-teal-50 text-teal-600 border-teal-100",
      avatarBg: "bg-teal-50",
      bubbleBg: "bg-[#f0fdf4]",
      border: "border-gray-100",
    },
    system: {
      icon: <Info className="w-5 h-5 text-gray-500" />,
      label: tL.speakers.system,
      color: "text-gray-500",
      badge: "bg-gray-50 text-gray-500 border-gray-100",
      avatarBg: "bg-gray-50",
      bubbleBg: "bg-gray-50",
      border: "border-gray-100",
    },
    order: {
      icon: <ClipboardList className="w-5 h-5 text-pink-600" />,
      label: tL.speakers.orders,
      color: "text-pink-600",
      badge: "bg-pink-50 text-pink-600 border-pink-100",
      avatarBg: "bg-pink-50",
      bubbleBg: "bg-pink-50/20",
      border: "border-pink-100",
    },
    sbar_report: {
      icon: <FileText className="w-5 h-5 text-primary-600" />,
      label: tL.speakers.teamCommunication,
      color: "text-primary-600",
      badge: "bg-primary-50 text-primary-600 border-primary-100",
      avatarBg: "bg-primary-50",
      bubbleBg: "bg-primary-50/20",
      border: "border-primary-100",
    },
    student_team_comm: {
      icon: <User className="w-5 h-5 text-[#db8833]" />,
      label: "Student Response - Team Communication",
      color: "text-[#db8833]",
      badge: "bg-[#FFF0EB] text-[#db8833] border-[#FFE7E0]",
      avatarBg: "bg-[#FFF0EB]",
      bubbleBg: "bg-[#fef2f2]",
      border: "border-[#FFE7E0]",
    },
  };

  const formatElapsedLabel = (seconds: number) => {
    const safeValue = Math.max(0, Math.round(seconds));
    const mins = Math.floor(safeValue / 60);
    const secs = safeValue % 60;
    // Zero-pad minutes so it renders as mm:ss
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
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
      return "";
    }
    // Strip everything from "| Started:" onwards
    let cleaned = details.split(/\|\s*Started:/i)[0];

    // Remove "Duration: ..." and "Score: ..." patterns which are now shown in the header
    cleaned = cleaned.replace(/\s*Duration:\s*(\d+m?\s*\d*s?)\s*/i, "");
    cleaned = cleaned.replace(/\s*Score:\s*(\d+%)\s*/i, "");

    // Remove Prompt and Response patterns as they are now in dedicated boxes
    cleaned = cleaned.replace(/\s*Prompt:\s*.*?(?=\n|$|\|)/gi, "");
    cleaned = cleaned.replace(/\s*Response:\s*.*?(?=\n|$|\|)/gi, "");
    cleaned = cleaned.replace(/Student responded to question: ".*?"\n?/gi, "");

    if (hasAnswer) {
      cleaned = cleaned.replace(/\s*Result:\s*.*?(?=\n|$|\|)/gi, "");
      cleaned = cleaned.replace(/\s*Submitted:\s*.*?(?=\n|$|\|)/gi, "");
    }

    cleaned = cleaned.trim();
    // Remove trailing and leading separators
    cleaned = cleaned.replace(/[|\s]+$/, "").replace(/^[|\s]+/, "");

    if (details.toLowerCase().startsWith("started:")) {
      return "";
    }
    return cleaned;
  };

  const formatActionType = (type: string) => {
    switch (type) {
      case "single":
        return tL.actionTypes.multipleChoice;
      case "question":
        return tL.actionTypes.openEnded;
      case "ordering":
        return tL.actionTypes.sequential;
      case "vital-signs":
        return tL.actionTypes.vitalSigns;
      case "infection":
        return tL.actionTypes.infection;
      case "privacy":
        return tL.actionTypes.privacy;
      case "environmental":
        return tL.actionTypes.environmental;
      default:
        return type;
    }
  };

  // Common-action sub-label used by both the on-screen card and the PDF —
  // maps the short type onto the full category name (e.g. "infection" →
  // "Prevención de Infecciones" / "Infection Prevention") to match HS-online.
  const formatCommonActionCategory = (type: string): string => {
    switch (type) {
      case "infection":
        return tL.actionTypes.infectionPrevention;
      case "privacy":
        return tL.actionTypes.privacyModesty;
      case "environmental":
        return tL.actionTypes.environmentalSafety;
      default:
        return formatActionType(type);
    }
  };

  /** Format an epoch-ms value as mm/dd/yyyy, hh:mm:ss AM/PM */
  const formatWallClock = (epochMs: number | null | undefined): string => {
    if (!epochMs) {
      return "";
    }
    try {
      const d = new Date(epochMs);
      return d.toLocaleString(dateLocale, {
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
    } catch {
      return "";
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
                const month = d.toLocaleString("en-US", { month: "short" });
                const day = d.getDate().toString().padStart(2, "0");
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
              liveScenario.teamCommunication as unknown as Record<string, unknown>
            ).prompt as string;
          }

          const transcriptMessages: TranscriptMessage[] = ((
            logData.messages as unknown as Record<string, unknown>[] | undefined
          )
            ?.filter((msg: Record<string, unknown>) => {
              // Keep "Order Released:" and "Team Communication Initiated" system messages
              const msgText = String(msg.text ?? msg.message ?? "").trim();
              const isOrderRelease =
                msg.speaker === "system" &&
                msgText.toLowerCase().startsWith("order released:");
              const isTeamCommInitiated =
                msg.speaker === "system" &&
                msgText
                  .toLowerCase()
                  .startsWith("team communication initiated.");

              if (isOrderRelease || isTeamCommInitiated) {
                return true; // preserve
              }
              // Always preserve Team Communication messages
              if (
                msg.speaker === "student_team_comm" ||
                msg.speaker === "sbar_report"
              ) {
                return true;
              }
              // Drop provider messages as requested (audible responses from provider)
              if (msg.speaker === "provider") {
                return false;
              }
              return msg.speaker !== "system"; // drop all other raw system messages
            })
            ?.map((msg: Record<string, unknown>, index: number) => {
              const timestampValue =
                typeof msg.timestampValue === "number"
                  ? msg.timestampValue
                  : msg.timestamp
                    ? new Date(
                        msg.timestamp as string | number | Date,
                      ).getTime()
                    : undefined;

              // Always compute elapsedSeconds from timestamp if not explicitly provided
              const elapsedSeconds =
                typeof msg.elapsedSeconds === "number"
                  ? msg.elapsedSeconds
                  : timestampValue && scenarioStartMs
                    ? Math.max(
                        0,
                        Math.round((timestampValue - scenarioStartMs) / 1000),
                      )
                    : index; // fallback: use index as a last resort

              // Always compute elapsedTime from elapsedSeconds if not explicitly provided
              const elapsedTime =
                msg.elapsedTime && msg.elapsedTime !== "0:00"
                  ? msg.elapsedTime
                  : formatElapsedLabel(elapsedSeconds);

              const displayTimestamp = timestampValue
                ? new Date(timestampValue).toLocaleTimeString("en-US", {
                    hour12: false,
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })
                : `00:${String(index).padStart(2, "0")}:00`;

              // Robust text extraction â€” server may use 'text' or 'message'
              const messageText = String(msg.text ?? msg.message ?? "").trim();

              // Remap system messages to their appropriate speakers
              const rawMsgText = String(msg.text ?? msg.message ?? "").trim();
              const isOrderRelease =
                msg.speaker === "system" &&
                rawMsgText.toLowerCase().startsWith("order released:");
              const isTeamCommInitiated =
                msg.speaker === "system" &&
                rawMsgText
                  .toLowerCase()
                  .startsWith("team communication initiated.");

              return {
                id: msg.id || index.toString(),
                speaker: isOrderRelease
                  ? "order"
                  : isTeamCommInitiated
                    ? "sbar_report"
                    : msg.speaker === "student"
                      ? "user"
                      : msg.speaker === "student_team_comm"
                        ? "student_team_comm"
                        : msg.speaker === "avatar"
                          ? "assistant"
                          : msg.speaker === "provider"
                            ? "provider"
                            : msg.speaker === "sbar_report"
                              ? "sbar_report"
                              : msg.speaker === "system"
                                ? "system"
                                : "assistant",
                message: messageText,
                timestamp: displayTimestamp,
                timestampValue: timestampValue ?? undefined,
                elapsedTime,
                elapsedSeconds,
                duration:
                  typeof msg.duration === "number" ? msg.duration : undefined,
                // Primary numeric sort key is elapsedSeconds; fall back to timestamp ordering
                _orderKey:
                  typeof elapsedSeconds === "number"
                    ? elapsedSeconds
                    : timestampValue && scenarioStartMs
                      ? Math.max(
                          0,
                          Math.round((timestampValue - scenarioStartMs) / 1000),
                        )
                      : index,
                _originalIndex: index,
              };
            })
            .filter((msg: { message: string }) => msg.message.length > 0) // skip blank messages
            .sort((a, b) =>
              timelineComparator(
                a as unknown as TimelineSortItem,
                b as unknown as TimelineSortItem,
              ),
            ) ?? []) as unknown as TranscriptMessage[];

          // Flatten summaryByCategory â€” handles both flat arrays (history, actions, medications, orders)
          // AND nested objects-of-arrays (vitals: { "Heart Rate": [...], "Blood Pressure": [...] })
          const flattenSummaryCategory = (
            cat: Record<string, unknown>,
          ): unknown[] => {
            const results: unknown[] = [];
            for (const val of Object.values(cat)) {
              if (typeof val === "string") {
                continue;
              } // skip string fields like historyNotes, actionNotes
              if (Array.isArray(val)) {
                // Filter out string entries from arrays (should only have objects)
                results.push(
                  ...(val.filter(
                    (item) => typeof item !== "string",
                  ) as unknown[]),
                );
              } else if (val && typeof val === "object") {
                // Nested object of arrays (e.g. vitals keyed by vital name)
                for (const inner of Object.values(val)) {
                  if (Array.isArray(inner)) {
                    // Filter out string entries from nested arrays
                    results.push(
                      ...(inner.filter(
                        (item) => typeof item !== "string",
                      ) as unknown[]),
                    );
                  }
                }
              }
            }
            return results;
          };

          const summaryEntriesData =
            reportData?.summaryByCategory &&
            typeof reportData.summaryByCategory === "object"
              ? (() => {
                  const flat = flattenSummaryCategory(
                    reportData.summaryByCategory,
                  );
                  // Deduplicate by id ONLY for vitals (which should show one summary per vital type).
                  // Action/clinical entries should NOT be deduplicated because each attempt
                  // (even with the same ID) represents a separate event that needs to be shown.
                  const seenVitals = new Set<string>();
                  return flat
                    .filter((e) => {
                      // Skip non-object entries (strings, primitives, etc that got stringified)
                      if (
                        typeof e !== "object" ||
                        e === null ||
                        Array.isArray(e)
                      ) {
                        return false;
                      }

                      const entry = e as { id?: string; category?: string };
                      if (!entry?.id) {
                        return true;
                      }
                      if (entry.category?.toLowerCase() === "system") {
                        return false;
                      }
                      if (entry.category?.toLowerCase() === "vitals") {
                        if (seenVitals.has(entry.id)) {
                          return false;
                        }
                        seenVitals.add(entry.id);
                        return false; // Skip vitals entirely from summary (handled separately)
                      }
                      // For actions/clinical/etc, allow duplicate IDs (they're different attempts)
                      return true;
                    })
                    .sort(
                      (a, b) =>
                        ((a as { timestampValue?: number })?.timestampValue ??
                          0) -
                        ((b as { timestampValue?: number })?.timestampValue ??
                          0),
                    );
                })()
              : (
                  (reportData?.summaryEntries ?? []) as Array<{
                    category?: string;
                  }>
                ).filter(
                  (e: { category?: string }) =>
                    e.category?.toLowerCase() !== "vitals",
                );

          // â”€â”€ Extract vitals map from summaryByCategory.vitals and store in state
          // so handleDownloadTranscript can reliably access it later.
          if (reportData?.summaryByCategory) {
            const rawVitals = reportData.summaryByCategory.vitals;
            if (
              rawVitals &&
              typeof rawVitals === "object" &&
              !Array.isArray(rawVitals)
            ) {
              const shortKey: Record<string, string> = {
                "heart rate": "hr",
                "heart rate recorded": "hr",
                "blood pressure": "bp",
                "blood pressure recorded": "bp",
                "respiratory rate": "rr",
                "respiratory rate recorded": "rr",
                "oxygen saturation": "spo2",
                "oxygen saturation recorded": "spo2",
                "spo2 recorded": "spo2",
                temperature: "temp",
                "temperature recorded": "temp",
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
                },
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
                      Math.round((timestampValue - scenarioStartMs) / 1000),
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
                    /Duration:\s*(\d+)m\s*(\d+)s/i,
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
                          Math.round(
                            (eDate.getTime() - sDate.getTime()) / 1000,
                          ),
                        );
                      }
                    } catch {
                      // Ignore date parse failure; duration stays undefined.
                    }
                  }
                }
              }

              // For action/clinical entries in the transcript, always use the entry's own
              // `correct` field which represents the SPECIFIC ATTEMPT, not the aggregated grading.
              // The actionGradingMap contains best-attempt-wins evaluation which is appropriate
              // for scoring but NOT for showing individual attempt outcomes.
              const isActionOrMedication =
                entry.category?.toLowerCase() === "actions" ||
                entry.category?.toLowerCase() === "action" ||
                entry.category?.toLowerCase() === "clinical" ||
                entry.category?.toLowerCase() === "medications" ||
                entry.category?.toLowerCase() === "orders";

              // For actions, medications, and clinical entries, prefer the individual entry's correctness
              const shouldUseIndividualCorrectness =
                isActionOrMedication && entry.correct !== undefined;

              // For vital-type entries the `grading` field on the raw entry is the
              // per-attempt correctness signal (true = enough vitals checked, false = not enough).
              const isVitalEntry =
                entry.type === "vital" ||
                entry.type === "vital-signs" ||
                entry.category?.toLowerCase() === "vitals";

              const rawEntryGrading = (rawEntry as Record<string, unknown>)
                .grading;

              const grading = shouldUseIndividualCorrectness
                ? {
                    satisfactory: entry.correct,
                    creditAwarded: entry.correct,
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
                !grading && entry.correct !== undefined
                  ? {
                      satisfactory: entry.correct,
                      creditAwarded: entry.correct,
                    }
                  : undefined;

              return {
                type: "summary" as const,
                data: {
                  ...entry,
                  id: entry.id,
                  category: entry.category || "summary",
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
            },
          );

          const messageTimelineItems: TimelineItem[] = transcriptMessages.map(
            (msg) => ({
              type: "message" as const,
              data: {
                ...msg,
                // Keep message ordering consistent: prefer elapsedSeconds, then fallback
                _orderKey:
                  (typeof msg.elapsedSeconds === "number"
                    ? msg.elapsedSeconds
                    : undefined) ??
                  msg._orderKey ??
                  (msg.elapsedTime
                    ? parseElapsedTimeToSeconds(msg.elapsedTime)
                    : undefined),
              },
            }),
          );

          // Map commonActionTracker.actionLog into timeline items
          const commonActionItems: TimelineItem[] = (
            (reportData?.commonActionTracker?.actionLog as
              | CommonActionEntry[]
              | undefined) ?? []
          ).map((action) => ({
            type: "commonAction" as const,
            data: action,
          }));

          const combinedTimeline: TimelineItem[] = [
            ...messageTimelineItems,
            ...summaryTimelineItems,
            ...commonActionItems,
          ].sort((a, b) =>
            timelineComparator(
              a as unknown as TimelineSortItem,
              b as unknown as TimelineSortItem,
            ),
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
            if (item.type === "message") {
              const msg = item.data;
              const text = (msg.message || "").trim();
              // Skip only "Team Communication Initiated" messages (these trigger session start)
              if (
                text
                  .toLowerCase()
                  .startsWith("team communication initiated. prompt:")
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
              if (msg.speaker === "sbar_report") {
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
                msg.speaker === "student_team_comm" &&
                currentSbarSession !== null
              ) {
                pendingStudentTeamComm.push(item);
                continue;
              }
            } else if (item.type === "summary") {
              const entry = item.data;
              if (entry.title === "Team Communication") {
                const details = entry.details ?? "";
                if (details.toLowerCase().includes("initiated. prompt:")) {
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
                } else if (details.toLowerCase().includes("result:")) {
                  // Only render if the student actually started a team communication session.
                  // The backend always injects a "Result: Unsatisfactory" entry even when the
                  // student never pressed the Team Comm button â€” currentSbarSession will be null
                  // in that case, so we skip it.
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
                          currentSbarSession.startElapsed,
                        ) *
                          1000
                      : undefined) ??
                    entry.timestampValue;

                  const unifiedEntry: TimelineItem = {
                    type: "summary",
                    data: {
                      ...entry,
                      category: "Team Communication",
                      title: "Team Communication",
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
                      type: "message",
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
              b as unknown as TimelineSortItem,
            ),
          );
          setTimelineItems(unifiedTimeline);
        } else {
          // transcript loading skipped
        }
        setLoading(false);
      } catch {
        setError("Failed to load transcript.");
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

  const handleDownloadTranscript = () => {
    const pdf = new jsPDF({ unit: "mm", format: "a4" });

    // ────────────────────────────────────────────────────────────────────────
    // Layout & theme constants
    // ────────────────────────────────────────────────────────────────────────
    const PAGE_W = pdf.internal.pageSize.getWidth();
    const PAGE_H = pdf.internal.pageSize.getHeight();
    const MARGIN_L = 14;
    const MARGIN_R = 14;
    const CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R;
    const FOOTER_Y = PAGE_H - 10;
    const CONTENT_BOTTOM = PAGE_H - 18; // keep clear of footer

    // ────────────────────────────────────────────────────────────────────────
    // Color palette — exact match to UI constants.tsx
    // ────────────────────────────────────────────────────────────────────────
    type RGB = [number, number, number];

    // Base colors
    const C_BRAND: RGB = [232, 84, 26]; // #E8541A (brand orange)
    const C_WHITE: RGB = [255, 255, 255];
    const C_GRAY50: RGB = [249, 250, 251];
    const C_GRAY100: RGB = [243, 244, 246];
    const C_GRAY200: RGB = [229, 231, 235];
    const C_GRAY400: RGB = [156, 163, 175];
    const C_GRAY500: RGB = [107, 114, 128];
    const C_GRAY600: RGB = [75, 85, 99];
    const C_GRAY700: RGB = [55, 65, 81];
    const C_GRAY900: RGB = [17, 24, 39];
    const C_TEXT_PRIMARY: RGB = C_GRAY900;
    const C_TEXT_SECONDARY: RGB = C_GRAY600;
    const C_TEXT_MUTED: RGB = C_GRAY500;

    // Speaker — User / student_team_comm → orange (#db8833)
    const C_STUDENT_TEXT: RGB = [251, 96, 51];
    const C_STUDENT_BG: RGB = [255, 240, 235]; // #FFF0EB
    const C_STUDENT_BORDER: RGB = [255, 231, 224]; // #FFE7E0
    const C_STUDENT_BUBBLE: RGB = [254, 242, 242]; // #fef2f2 — matches web UI

    // Speaker — Patient (assistant) → teal
    const C_PATIENT_TEXT: RGB = [13, 148, 136]; // teal-600
    const C_PATIENT_BG: RGB = [240, 253, 250]; // teal-50
    const C_PATIENT_BORDER: RGB = [153, 246, 228]; // teal-200 (visible teal border)
    const C_PATIENT_BUBBLE: RGB = [240, 253, 244]; // #f0fdf4 — matches web UI

    // Speaker — Provider → blue
    const C_PROVIDER_TEXT: RGB = [37, 99, 235]; // blue-600
    const C_PROVIDER_BG: RGB = [239, 246, 255]; // blue-50
    const C_PROVIDER_BORDER: RGB = [219, 234, 254]; // blue-100
    const C_PROVIDER_BUBBLE: RGB = [246, 249, 255];

    // Speaker — Orders (order) → pink
    const C_ORDER_TEXT: RGB = [219, 39, 119]; // pink-600
    const C_ORDER_BG: RGB = [253, 242, 248]; // pink-50
    const C_ORDER_BORDER: RGB = [252, 231, 243]; // pink-100

    // Speaker — sbar_report (Team Communication) → primary-600
    const C_SBAR_TEXT: RGB = [234, 88, 12]; // primary-600
    const C_SBAR_BG: RGB = [255, 247, 237]; // primary-50
    const C_SBAR_BORDER: RGB = [255, 237, 213]; // primary-100

    // System → gray
    const C_SYSTEM_TEXT: RGB = C_GRAY500;
    const C_SYSTEM_BG: RGB = C_GRAY50;
    const C_SYSTEM_BORDER: RGB = C_GRAY100;

    // Category — vitals → green
    const C_VITAL_TEXT: RGB = [21, 128, 61]; // green-700
    const C_VITAL_BG: RGB = [240, 253, 244]; // #F0FDF4
    const C_VITAL_BORDER: RGB = [187, 247, 208]; // #BBF7D0

    // Category — demographics → primary-700
    const C_DEMO_TEXT: RGB = [194, 65, 12]; // primary-700
    const C_DEMO_BG: RGB = C_GRAY50;
    const C_DEMO_BORDER: RGB = C_GRAY100;

    // Category — history → blue-700
    const C_HIST_TEXT: RGB = [29, 78, 216]; // blue-700
    const C_HIST_BG: RGB = [240, 247, 255]; // #F0F7FF
    const C_HIST_BORDER: RGB = [191, 219, 254]; // #BFDBFE

    // Category — actions / clinical → blue (matches web UI #eff6ff)
    const C_ACTION_TEXT: RGB = [29, 78, 216]; // blue-700
    const C_ACTION_BG: RGB = [239, 246, 255]; // #eff6ff
    const C_ACTION_BORDER: RGB = [191, 219, 254]; // blue-200 #BFDBFE

    // Category — orders → pink (distinct from medication cards)
    const C_ORDERS_TEXT: RGB = [219, 39, 119]; // pink-600
    const C_ORDERS_BG: RGB = [253, 242, 248]; // pink-50
    const C_ORDERS_BORDER: RGB = [252, 231, 243]; // pink-100

    // Category — medications → violet-700
    const C_MED_TEXT: RGB = [109, 40, 217]; // violet-700
    const C_MED_BG: RGB = [245, 243, 255]; // #F5F3FF
    const C_MED_BORDER: RGB = [221, 214, 254]; // #DDD6FE

    // Category — team_communication → blue-700
    const C_TC_TEXT: RGB = [29, 78, 216];
    const C_TC_BG: RGB = [239, 246, 255];
    const C_TC_BORDER: RGB = [219, 234, 254];

    // Common action types
    const C_INFECTION_TEXT: RGB = [234, 88, 12]; // #EA580C
    const C_INFECTION_BG: RGB = [255, 240, 230]; // #fff0e6 — matches web UI
    const C_INFECTION_BORDER: RGB = [254, 215, 170]; // #f6ddc2
    const C_PRIVACY_TEXT: RGB = [13, 148, 136]; // #0D9488
    const C_PRIVACY_BG: RGB = [230, 250, 247]; // #e6faf7 — matches web UI
    const C_PRIVACY_BORDER: RGB = [153, 246, 228]; // #99F6E4
    const C_ENV_TEXT: RGB = [37, 99, 235]; // #2563EB
    const C_ENV_BG: RGB = [239, 246, 255]; // #EFF6FF
    const C_ENV_BORDER: RGB = [191, 219, 254]; // #BFDBFE

    // Success / danger
    const C_SUCCESS: RGB = [21, 128, 61]; // emerald-700
    const C_SUCCESS_BG: RGB = [209, 250, 229];
    const C_DANGER: RGB = [220, 38, 38]; // red-600
    const C_DANGER_BG: RGB = [254, 226, 226];

    // Helpers
    const setFill = (rgb: RGB) => pdf.setFillColor(rgb[0], rgb[1], rgb[2]);
    const setDraw = (rgb: RGB) => pdf.setDrawColor(rgb[0], rgb[1], rgb[2]);
    const setText = (rgb: RGB) => pdf.setTextColor(rgb[0], rgb[1], rgb[2]);

    // ────────────────────────────────────────────────────────────────────────
    // Speaker / category metadata helpers (mirror constants.tsx)
    // ────────────────────────────────────────────────────────────────────────
    type SpeakerIconType =
      | "user"
      | "activity"
      | "message"
      | "clipboard"
      | "filetext"
      | "info";
    type SpeakerMeta = {
      label: string;
      textColor: RGB;
      bgColor: RGB;
      borderColor: RGB;
      bubbleBg: RGB;
      rightAlign: boolean; // student messages are right-aligned
      iconType: SpeakerIconType;
    };
    const getSpeakerMeta = (speaker: string): SpeakerMeta => {
      switch (speaker) {
        case "user":
          return {
            label: tL.speakers.student,
            textColor: C_STUDENT_TEXT,
            bgColor: C_STUDENT_BG,
            borderColor: C_STUDENT_BORDER,
            bubbleBg: C_STUDENT_BUBBLE,
            rightAlign: true, // student bubbles are right-aligned in web UI
            iconType: "user",
          };
        case "student_team_comm":
          return {
            label: `${tL.labels.studentResponse} - ${tL.speakers.teamCommunication}`,
            textColor: C_STUDENT_TEXT,
            bgColor: C_STUDENT_BG,
            borderColor: C_STUDENT_BORDER,
            bubbleBg: C_STUDENT_BUBBLE,
            rightAlign: true, // student bubbles are right-aligned in web UI
            iconType: "user",
          };
        case "provider":
          return {
            label: tL.speakers.provider,
            textColor: C_PROVIDER_TEXT,
            bgColor: C_PROVIDER_BG,
            borderColor: C_PROVIDER_BORDER,
            bubbleBg: C_PROVIDER_BUBBLE,
            rightAlign: false,
            iconType: "message",
          };
        case "sbar_report":
          return {
            label: tL.speakers.teamCommunication,
            textColor: C_SBAR_TEXT,
            bgColor: C_SBAR_BG,
            borderColor: C_SBAR_BORDER,
            bubbleBg: C_SBAR_BG,
            rightAlign: false,
            iconType: "filetext",
          };
        case "order":
          return {
            label: tL.speakers.orders,
            textColor: C_ORDER_TEXT,
            bgColor: C_ORDER_BG,
            borderColor: C_ORDER_BORDER,
            bubbleBg: C_ORDER_BG,
            rightAlign: false,
            iconType: "clipboard",
          };
        case "system":
          return {
            label: tL.speakers.system,
            textColor: C_SYSTEM_TEXT,
            bgColor: C_SYSTEM_BG,
            borderColor: C_SYSTEM_BORDER,
            bubbleBg: C_SYSTEM_BG,
            rightAlign: false,
            iconType: "info",
          };
        default: // assistant = Patient
          return {
            label: tL.speakers.patient,
            textColor: C_PATIENT_TEXT,
            bgColor: C_PATIENT_BG,
            borderColor: C_PATIENT_BORDER,
            bubbleBg: C_PATIENT_BUBBLE,
            rightAlign: false,
            iconType: "activity",
          };
      }
    };

    type CategoryMeta = {
      label: string;
      textColor: RGB;
      bgColor: RGB;
      borderColor: RGB;
    };
    const getCategoryMetaPdf = (
      category?: string,
      title?: string,
    ): CategoryMeta => {
      if (title === "Team Communication") {
        return {
          label: tL.categories.teamCommunication,
          textColor: C_TC_TEXT,
          bgColor: C_TC_BG,
          borderColor: C_TC_BORDER,
        };
      }
      const c = (category ?? "").toLowerCase();
      if (c === "vitals") {
        return {
          label: tL.categories.vitals,
          textColor: C_VITAL_TEXT,
          bgColor: C_VITAL_BG,
          borderColor: C_VITAL_BORDER,
        };
      }
      if (c === "demographics") {
        return {
          label: tL.categories.demographics,
          textColor: C_DEMO_TEXT,
          bgColor: C_DEMO_BG,
          borderColor: C_DEMO_BORDER,
        };
      }
      if (c === "history") {
        return {
          label: tL.categories.history,
          textColor: C_HIST_TEXT,
          bgColor: C_HIST_BG,
          borderColor: C_HIST_BORDER,
        };
      }
      if (c === "actions" || c === "action" || c === "clinical") {
        return {
          label: tL.categories.actions,
          textColor: C_ACTION_TEXT,
          bgColor: C_ACTION_BG,
          borderColor: C_ACTION_BORDER,
        };
      }
      if (c === "orders") {
        return {
          label: tL.categories.orders,
          textColor: C_ORDERS_TEXT,
          bgColor: C_ORDERS_BG,
          borderColor: C_ORDERS_BORDER,
        };
      }
      if (c === "medications") {
        return {
          label: tL.categories.medications,
          textColor: C_MED_TEXT,
          bgColor: C_MED_BG,
          borderColor: C_MED_BORDER,
        };
      }
      if (c === "ppe" || c === "safety") {
        return {
          label: tL.filterOptions.commonActions,
          textColor: C_INFECTION_TEXT,
          bgColor: C_INFECTION_BG,
          borderColor: C_INFECTION_BORDER,
        };
      }
      return {
        label: translateEntryCategory(category ?? "summary"),
        textColor: C_GRAY700,
        bgColor: C_GRAY50,
        borderColor: C_GRAY100,
      };
    };

    const getCommonActionMeta = (
      type: string,
    ): { textColor: RGB; bgColor: RGB; borderColor: RGB } => {
      if (type === "privacy") {
        return {
          textColor: C_PRIVACY_TEXT,
          bgColor: C_PRIVACY_BG,
          borderColor: C_PRIVACY_BORDER,
        };
      }
      if (type === "environmental") {
        return {
          textColor: C_ENV_TEXT,
          bgColor: C_ENV_BG,
          borderColor: C_ENV_BORDER,
        };
      }
      return {
        textColor: C_INFECTION_TEXT,
        bgColor: C_INFECTION_BG,
        borderColor: C_INFECTION_BORDER,
      }; // infection (default)
    };

    let yPosition = 0;
    let pageNumber = 1;
    // Tracks the active card's background colour while drawContent runs.
    // drawPageHeader reads this so it can paint the continuation background BEFORE
    // any content is written on the new page (jsPDF appends to the stream, so the
    // only way to paint behind content is to paint it first).
    let activeCardBg: RGB | null = null;

    // ────────────────────────────────────────────────────────────────────────
    // Header / footer helpers
    // ────────────────────────────────────────────────────────────────────────
    const drawFooter = () => {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      setText(C_TEXT_MUTED);
      const footerLeft = sanitizePdfText(`${tL.fullUserTranscript}  ${reportId}`);
      pdf.text(footerLeft, MARGIN_L, FOOTER_Y);
      const pageLabel = sanitizePdfText(`${tL.page} ${pageNumber}`);
      const w = pdf.getTextWidth(pageLabel);
      pdf.text(pageLabel, PAGE_W - MARGIN_R - w, FOOTER_Y);
    };

    const drawPageHeader = () => {
      // Orange brand strip at top
      setFill(C_BRAND);
      pdf.rect(0, 0, PAGE_W, 14, "F");
      setText(C_WHITE);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(12);
      pdf.text(sanitizePdfText(tL.fullUserTranscript), MARGIN_L, 9);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      // Build "julio 22, 2026" / "July 22, 2026" manually so the day/month
      // ordering does not depend on browser Intl fallbacks for `es-US` —
      // some environments still resolve `es-US` to Spain ordering.
      const nowDate = new Date();
      const nowMonthLong = nowDate.toLocaleDateString(dateLocale, {
        month: "long",
      });
      const headerDateStr = `${nowMonthLong} ${nowDate.getDate()}, ${nowDate.getFullYear()}`;
      const rightMeta = sanitizePdfText(`${tL.generated} ${headerDateStr}`);
      const rw = pdf.getTextWidth(rightMeta);
      pdf.text(rightMeta, PAGE_W - MARGIN_R - rw, 9);
      setText(C_TEXT_PRIMARY);
      yPosition = 24; // 10mm gap below the 14mm header strip

      // If we are continuing a card across pages, paint its background fill
      // BEFORE any content is drawn on this page. Because jsPDF appends draw
      // operations to the end of the page stream, this ensures the background
      // sits behind subsequent content rather than over it.
      if (activeCardBg) {
        setFill(activeCardBg);
        pdf.rect(MARGIN_L, 24, CONTENT_W, CONTENT_BOTTOM - 24 + 6, "F");
      }
    };

    const ensureSpace = (needed: number) => {
      if (yPosition + needed > CONTENT_BOTTOM) {
        drawFooter();
        pdf.addPage();
        pageNumber += 1;
        drawPageHeader();
      }
    };

    // ────────────────────────────────────────────────────────────────────────
    // Primitive helpers — matches UI card structure
    // ────────────────────────────────────────────────────────────────────────

    /** Format epoch ms as "Jan 01, 06:15" — matches formatAdminDate() in MedicationTranscriptCard (short, no year, 24h) */
    const fmtAdminDate = (ms: number | null | undefined): string => {
      if (!ms) {
        return "";
      }
      try {
        const d = new Date(ms);
        if (isNaN(d.getTime())) {
          return "";
        }
        // Build "<month> <day>, HH:MM" manually so the month-day-year order
        // does not depend on browser Intl fallbacks (some environments render
        // `es-US` as `22-jul` instead of `julio 22`). Uses long month name so
        // Spanish reads "julio 22, 20:11" — matches the HS-online reference.
        const monthLong = d.toLocaleDateString(dateLocale, { month: "long" });
        const hh = String(d.getHours()).padStart(2, "0");
        const mm = String(d.getMinutes()).padStart(2, "0");
        return `${monthLong} ${d.getDate()}, ${hh}:${mm}`;
      } catch {
        return "";
      }
    };

    /** Format epoch ms as "mm/dd/yyyy, HH:MM:SS" — matches formatWallClock() */
    const fmtWallClock = (ms: number | null | undefined): string => {
      if (!ms) {
        return "";
      }
      try {
        const d = new Date(ms);
        if (isNaN(d.getTime())) {
          return "";
        }
        // Always use en-US for the fully-numeric wall-clock format so the
        // date renders as MM/DD/YYYY regardless of the UI language (matches
        // the HS-online reference PDF, which pairs Spanish labels with a
        // US-style numeric date).
        return d.toLocaleString("en-US", {
          month: "2-digit",
          day: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        });
      } catch {
        return "";
      }
    };

    /**
     * Draw the small rounded elapsed-time badge (Row 1 of each timeline item).
     * Returns badge height.
     */
    const drawClockBadge = (
      time: string,
      textColor: RGB,
      bgColor: RGB,
      borderColor: RGB,
      drawAtY?: number, // if supplied, draws at this Y instead of yPosition
    ): number => {
      const fontSize = 9;
      const padX = 3;
      const padY = 1.8;
      const iconD = 3.2; // clock icon diameter
      const iconGap = 1.8;
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(fontSize);
      const label = sanitizePdfText(time);
      const tw = pdf.getTextWidth(label);
      const bw = padX + iconD + iconGap + tw + padX;
      const bh = fontSize * 0.42 + padY * 2;
      const ry = drawAtY ?? yPosition;
      // Pill background
      setFill(bgColor);
      setDraw(borderColor);
      pdf.setLineWidth(0.3);
      pdf.roundedRect(MARGIN_L, ry, bw, bh, 1.5, 1.5, "FD");
      // Clock icon: circle outline + two hands
      const iconR = iconD / 2;
      const iconCX = MARGIN_L + padX + iconR;
      const iconCY = ry + bh / 2;
      setDraw(textColor);
      pdf.setLineWidth(0.25);
      pdf.circle(iconCX, iconCY, iconR, "S");
      // Minute hand (pointing up ~12)
      pdf.line(iconCX, iconCY, iconCX, iconCY - iconR + 0.4);
      // Hour hand (pointing right ~3)
      pdf.line(iconCX, iconCY, iconCX + iconR - 0.5, iconCY);
      // Time text
      setText(textColor);
      pdf.setLineWidth(0.3);
      pdf.text(label, MARGIN_L + padX + iconD + iconGap, ry + bh - padY - 0.3);
      return bh;
    };

    /**
     * Draw speaker-specific icon at (cx, cy) within a sz×sz bounding box.
     */
    const drawSpeakerIcon = (
      iconType: SpeakerIconType,
      cx: number,
      cy: number,
      sz: number,
      color: RGB,
    ) => {
      setFill(color);
      setDraw(color);
      pdf.setLineWidth(0.3);
      switch (iconType) {
        case "user": {
          // Head circle
          const headR = sz * 0.24;
          const headCY = cy - sz * 0.14;
          pdf.circle(cx, headCY, headR, "F");
          // Shoulders arc (rounded rect)
          const bw = sz * 0.62;
          const bh = sz * 0.3;
          pdf.roundedRect(
            cx - bw / 2,
            headCY + headR + sz * 0.04,
            bw,
            bh,
            bw / 4,
            bw / 4,
            "F",
          );
          break;
        }
        case "activity": {
          // EKG / pulse wave — wider segments so it reads correctly at small sizes
          pdf.setLineWidth(0.4);
          const y0 = cy;
          // flat left
          pdf.line(cx - sz * 0.5, y0, cx - sz * 0.22, y0);
          // rise to peak
          pdf.line(cx - sz * 0.22, y0, cx - sz * 0.1, y0 - sz * 0.4);
          // drop through baseline to trough
          pdf.line(cx - sz * 0.1, y0 - sz * 0.4, cx + sz * 0.1, y0 + sz * 0.4);
          // rise back to baseline
          pdf.line(cx + sz * 0.1, y0 + sz * 0.4, cx + sz * 0.22, y0);
          // flat right
          pdf.line(cx + sz * 0.22, y0, cx + sz * 0.5, y0);
          break;
        }
        case "message": {
          // Rounded speech bubble
          const bx = cx - sz * 0.4,
            by = cy - sz * 0.38;
          const bw = sz * 0.8,
            bh = sz * 0.6;
          pdf.roundedRect(bx, by, bw, bh, 0.8, 0.8, "S");
          // Tail
          pdf.line(bx + sz * 0.1, by + bh, bx, by + bh + sz * 0.22);
          pdf.line(bx, by + bh + sz * 0.22, bx + sz * 0.32, by + bh);
          break;
        }
        case "clipboard": {
          const bx = cx - sz * 0.33,
            by = cy - sz * 0.36;
          const bw = sz * 0.66,
            bh = sz * 0.68;
          pdf.roundedRect(
            bx,
            by + sz * 0.09,
            bw,
            bh - sz * 0.04,
            0.5,
            0.5,
            "S",
          );
          // Clip at top
          const cw = sz * 0.3,
            ch = sz * 0.14;
          pdf.roundedRect(cx - cw / 2, by, cw, ch, ch / 2, ch / 2, "S");
          // Lines
          const lx1 = bx + sz * 0.1,
            lx2 = bx + bw - sz * 0.1;
          pdf.line(lx1, by + bh * 0.38, lx2, by + bh * 0.38);
          pdf.line(lx1, by + bh * 0.55, lx2, by + bh * 0.55);
          pdf.line(lx1, by + bh * 0.72, lx2 - sz * 0.14, by + bh * 0.72);
          break;
        }
        case "filetext": {
          const bx = cx - sz * 0.32,
            by = cy - sz * 0.4;
          const bw = sz * 0.64,
            bh = sz * 0.78;
          const fold = sz * 0.18;
          pdf.roundedRect(bx, by, bw, bh, 0.4, 0.4, "S");
          // Fold corner
          pdf.line(bx + bw - fold, by, bx + bw - fold, by + fold);
          pdf.line(bx + bw - fold, by + fold, bx + bw, by + fold);
          // Lines
          const lx1 = bx + sz * 0.1,
            lx2 = bx + bw - sz * 0.1;
          pdf.line(lx1, by + bh * 0.42, lx2, by + bh * 0.42);
          pdf.line(lx1, by + bh * 0.58, lx2, by + bh * 0.58);
          pdf.line(lx1, by + bh * 0.74, lx2 - sz * 0.14, by + bh * 0.74);
          break;
        }
        case "info": {
          pdf.circle(cx, cy, sz * 0.44, "S");
          pdf.circle(cx, cy - sz * 0.17, sz * 0.06, "F");
          pdf.setLineWidth(0.4);
          pdf.line(cx, cy - sz * 0.04, cx, cy + sz * 0.22);
          break;
        }
      }
    };

    /**
     * Draw a fully-rounded pill badge (rounded-full in Tailwind).
     * Returns { width, height }.
     */
    const drawPill = (
      label: string,
      x: number,
      y: number,
      textColor: RGB,
      bgColor: RGB,
      borderColor: RGB,
      opts: {
        fontSize?: number;
        bold?: boolean;
        iconType?: SpeakerIconType;
      } = {},
    ): { width: number; height: number } => {
      const fontSize = opts.fontSize ?? 7.5;
      const padX = 2.8;
      const padY = 1.3;
      pdf.setFont("helvetica", opts.bold !== false ? "bold" : "normal");
      pdf.setFontSize(fontSize);
      const text = sanitizePdfText(label.toUpperCase());
      const tw = pdf.getTextWidth(text);
      const bh = fontSize * 0.42 + padY * 2;
      const iconSz = opts.iconType ? bh * 0.72 : 0;
      const iconGap = opts.iconType ? 1.6 : 0;
      const bw = padX + iconSz + iconGap + tw + padX;
      setFill(bgColor);
      setDraw(borderColor);
      pdf.setLineWidth(0.25);
      pdf.roundedRect(x, y, bw, bh, bh / 2, bh / 2, "FD"); // rounded-full
      if (opts.iconType) {
        const iconCX = x + padX + iconSz / 2;
        const iconCY = y + bh / 2;
        drawSpeakerIcon(opts.iconType, iconCX, iconCY, iconSz, textColor);
      }
      setText(textColor);
      pdf.text(text, x + padX + iconSz + iconGap, y + bh - padY - 0.3);
      return { width: bw, height: bh };
    };

    /**
     * Draw a small status pill (Not Given / Administered / etc.)
     */
    const drawStatusPill = (
      label: string,
      x: number,
      y: number,
      textColor: RGB,
      bgColor: RGB,
      borderColor: RGB,
    ): { width: number; height: number } => {
      return drawPill(label, x, y, textColor, bgColor, borderColor, {
        fontSize: 7,
        bold: true,
      });
    };

    /**
     * Draw a sub-box inside a card (Clinical Prompt / Student Response / Notes).
     * Returns total height consumed.
     */
    const drawSubBox = (
      labelText: string,
      valueText: string,
      labelColor: RGB,
      bgColor: RGB,
      borderColor: RGB,
      innerX: number,
      innerW: number,
      items?: string[], // optional: render as numbered list with hanging indent
    ): number => {
      const rowH = 4.4;
      const itemGap = 1.5; // gap between list items (matches web UI space-y-1)
      const numW = 7; // width reserved for "22. " prefix (number + dot + space)
      const textXItems = innerX + 3 + numW;
      const textW = innerW - 6 - numW;
      const LABEL_H = 9; // top-padding + label row height inside the box
      const BOTTOM_PAD = 6;

      if (items && items.length > 0) {
        // ── Numbered list: split across pages as needed ──────────────────────
        // Pre-compute lines for each item so we can chunk them by page.
        const parsed: { num: string; lines: string[] }[] = items.map(
          (item, i) => ({
            num: `${i + 1}.`,
            lines: pdf.splitTextToSize(
              sanitizePdfText(item.trim()),
              textW,
            ) as string[],
          }),
        );

        // Split into page-sized chunks.
        type ItemChunk = {
          startGlobalIdx: number;
          parsed: { num: string; lines: string[] }[];
        };
        const chunks: ItemChunk[] = [];
        let curChunk: ItemChunk = { startGlobalIdx: 0, parsed: [] };
        // Available body height on first page (already positioned at yPosition)
        let avail = CONTENT_BOTTOM - (yPosition + 1) - LABEL_H - BOTTOM_PAD;
        let usedH = 0;

        parsed.forEach((p, i) => {
          const itemH =
            p.lines.length * rowH + (curChunk.parsed.length > 0 ? itemGap : 0);
          if (curChunk.parsed.length > 0 && usedH + itemH > avail) {
            chunks.push(curChunk);
            curChunk = { startGlobalIdx: i, parsed: [p] };
            usedH = p.lines.length * rowH;
            // Subsequent pages: full content area
            avail = CONTENT_BOTTOM - 24 - LABEL_H - BOTTOM_PAD;
          } else {
            if (curChunk.parsed.length === 0) {
              curChunk.startGlobalIdx = i;
            }
            curChunk.parsed.push(p);
            usedH += itemH;
          }
        });
        if (curChunk.parsed.length > 0) {
          chunks.push(curChunk);
        }

        // Render each chunk as its own box (page break between chunks)
        let totalConsumed = 0;
        chunks.forEach((chunk, ci) => {
          if (ci > 0) {
            drawFooter();
            pdf.addPage();
            pageNumber += 1;
            drawPageHeader();
          }
          // Height of this chunk's box
          const bodyH = chunk.parsed.reduce(
            (h, p, j) => h + p.lines.length * rowH + (j > 0 ? itemGap : 0),
            0,
          );
          const chunkBoxH = LABEL_H + bodyH + BOTTOM_PAD;
          const boxY = yPosition + 1;

          setFill(bgColor);
          setDraw(borderColor);
          pdf.setLineWidth(0.25);
          pdf.roundedRect(innerX, boxY, innerW, chunkBoxH, 2, 2, "FD");

          // label (show "CONT." for continuation chunks)
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(7.5);
          setText(labelColor);
          const lbl =
            ci === 0
              ? sanitizePdfText(labelText.toUpperCase())
              : sanitizePdfText(`${labelText.toUpperCase()} (CONT.)`);
          pdf.text(lbl, innerX + 3, boxY + 4);

          // items
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(11.25);
          setText(C_TEXT_PRIMARY);
          let yPos = boxY + LABEL_H;
          chunk.parsed.forEach((p, j) => {
            if (j > 0) {
              yPos += itemGap;
            }
            pdf.text(p.num, innerX + 3, yPos);
            pdf.text(p.lines, textXItems, yPos);
            yPos += p.lines.length * rowH;
          });

          const chunkTotal = chunkBoxH + 2;
          yPosition += chunkTotal;
          totalConsumed += chunkTotal;
        });

        return totalConsumed;
      }

      // ── Plain-text sub-box (unchanged) ────────────────────────────────────
      const rowHPlain = 4.4;
      const valueLines = pdf.splitTextToSize(
        sanitizePdfText(valueText),
        innerW - 4,
      ) as string[];
      const estH = 5 + valueLines.length * rowHPlain + 6;

      if (yPosition + estH > CONTENT_BOTTOM) {
        drawFooter();
        pdf.addPage();
        pageNumber += 1;
        drawPageHeader();
      }
      const boxY = yPosition + 1;
      const boxH = estH;
      setFill(bgColor);
      setDraw(borderColor);
      pdf.setLineWidth(0.25);
      pdf.roundedRect(innerX, boxY, innerW, boxH, 2, 2, "FD");
      // label
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(7.5);
      setText(labelColor);
      pdf.text(sanitizePdfText(labelText.toUpperCase()), innerX + 3, boxY + 4);
      // value
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(11.25); // 15px = 11.25pt
      setText(C_TEXT_PRIMARY);
      const reLines = pdf.splitTextToSize(
        sanitizePdfText(valueText),
        innerW - 6,
      ) as string[];
      pdf.text(reLines, innerX + 3, boxY + 9);
      const total = boxH + 2;
      yPosition += total;
      return total;
    };

    /**
     * Detect a medication status string in details and return color + label.
     */
    const getMedStatus = (
      details: string,
    ): { label: string; tc: RGB; bg: RGB; bc: RGB } | null => {
      const d = details;
      if (
        d.includes("Status: Not Given") ||
        d.startsWith("[Not Given]") ||
        d.startsWith("[Hold]")
      ) {
        return {
          label: tL.labels.notGiven,
          tc: [146, 64, 14] as RGB,
          bg: [254, 243, 199] as RGB,
          bc: [253, 230, 138] as RGB,
        };
      }
      if (
        d.includes("Status: Refused") ||
        d.startsWith("[Refused]") ||
        d.startsWith("[Refuse]")
      ) {
        return {
          label: tL.labels.refused,
          tc: [159, 18, 57] as RGB,
          bg: [255, 228, 230] as RGB,
          bc: [254, 205, 211] as RGB,
        };
      }
      if (d.includes("Status: Missed") || d.startsWith("[Missed]")) {
        return {
          label: tL.labels.missed,
          tc: [154, 52, 18] as RGB,
          bg: [255, 237, 213] as RGB,
          bc: [254, 215, 170] as RGB,
        };
      }
      if (
        d.includes("Status: Administered") ||
        d.startsWith("[Administered]")
      ) {
        return {
          label: tL.labels.administered,
          tc: [6, 95, 70] as RGB,
          bg: [209, 250, 229] as RGB,
          bc: [167, 243, 208] as RGB,
        };
      }
      if (d.includes("Status: Held") || d.startsWith("[Held]")) {
        return {
          label: tL.labels.held,
          tc: [146, 64, 14] as RGB,
          bg: [254, 243, 199] as RGB,
          bc: [253, 230, 138] as RGB,
        };
      }
      if (
        d.includes("Status: Inappropriate") ||
        d.startsWith("[Inappropriate]")
      ) {
        return {
          label: tL.labels.inappropriate,
          tc: [109, 40, 217] as RGB,
          bg: [237, 233, 254] as RGB,
          bc: [221, 214, 254] as RGB,
        };
      }
      return null;
    };

    /**
     * Render a full bubble card with bg fill.
     * Single-render: pre-check forces a new page if card won't fit, then draw bg, content, clip excess.
     */
    const drawBubbleCard = (
      bgColor: RGB,
      borderColor: RGB,
      drawContent: (innerX: number, innerW: number) => void,
      estimateH: number, // full (uncapped) estimated card height
    ): void => {
      if (yPosition < 30) {
        yPosition = 30;
      }

      // Pre-check: if this card won't fit on the current page, start a new page.
      // Use yPosition > 50 (not 30) so we don't double-jump: ensureSpace already
      // moved to a fresh page and drew the clock badge (yPosition ≈ 34mm after badge).
      // We only page-break here if we are genuinely mid-page, not just past the header.
      const availableSpace = CONTENT_BOTTOM - yPosition;
      if (estimateH > availableSpace && yPosition > 50) {
        drawFooter();
        pdf.addPage();
        pageNumber += 1;
        drawPageHeader();
      }

      const cardX = MARGIN_L;
      const cardW = CONTENT_W;
      const padTop = 6; // matches p-6 (24px ≈ 6.35mm)
      const padSide = 6;
      const padBot = 7;
      const innerX = cardX + padSide;
      const innerW = cardW - padSide * 2;
      const startY = yPosition;
      const startPageNum = pageNumber; // track if content spans pages

      // ── 1. Draw bg fill with estimated height first — text will render on top
      setFill(bgColor);
      pdf.roundedRect(cardX, startY, cardW, estimateH, 2.5, 2.5, "F");

      // ── 2. Draw content (single render)
      // Track this card's colours so drawPageHeader can paint the continuation
      // background before content on any new pages created inside drawContent.
      activeCardBg = bgColor;
      yPosition = startY + padTop;
      drawContent(innerX, innerW);
      activeCardBg = null;

      if (pageNumber !== startPageNum) {
        // Content spanned to a new page (e.g. long ordered list).
        // The continuation background was already painted by drawPageHeader BEFORE
        // any content, so it is correctly behind the content in the PDF stream.
        // We only need to:
        //   a) clip the excess background on the START page
        //   b) draw borders on both pages
        //   c) white-clip the leftover background BELOW content on the END page
        const endPageNum = pageNumber;
        const endY = yPosition;

        pdf.setPage(startPageNum);

        // Original page: card extends to CONTENT_BOTTOM
        const origActualH = CONTENT_BOTTOM - startY + 6;
        // Clip anything below origActualH (bg was drawn for `estimateH`)
        if (origActualH < estimateH) {
          setFill([255, 255, 255]);
          pdf.rect(
            cardX - 0.5,
            startY + origActualH,
            cardW + 1,
            estimateH - origActualH + 3,
            "F",
          );
        }
        // Draw border on original page
        setDraw(borderColor);
        pdf.setLineWidth(0.35);
        pdf.roundedRect(cardX, startY, cardW, origActualH, 2.5, 2.5, "S");

        // Return to the continuation page.
        // The background was already drawn by drawPageHeader (before content).
        // Clip anything below the actual card bottom with white, then draw border.
        pdf.setPage(endPageNum);

        const contStartY = 24; // just below page header
        const contActualH = Math.max(endY + padBot - contStartY, 14);
        // White-clip the excess background below the card bottom (drawn on top of bg)
        setFill([255, 255, 255]);
        pdf.rect(
          cardX - 0.5,
          contStartY + contActualH,
          cardW + 1,
          CONTENT_BOTTOM - (contStartY + contActualH) + 20,
          "F",
        );
        // Draw border on continuation page
        setDraw(borderColor);
        pdf.setLineWidth(0.35);
        pdf.roundedRect(cardX, contStartY, cardW, contActualH, 2.5, 2.5, "S");

        yPosition = endY + 5;
      } else {
        // ── Single-page card (original logic) ────────────────────────────────
        const actualH = Math.max(yPosition + padBot - startY, 14);

        // ── 3. Clip any excess bg area with white (page-background colour)
        if (actualH < estimateH) {
          setFill([255, 255, 255]);
          // Extend 0.5mm beyond card edges and 2mm extra height to fully cover
          // the rounded bottom corners of the background rect (fixes ghost outline).
          pdf.rect(
            cardX - 0.5,
            startY + actualH,
            cardW + 1,
            estimateH - actualH + 3,
            "F",
          );
        } else if (actualH > estimateH) {
          // Background was too short — fill the overflow strip with bgColor,
          // drawn as a plain rect so it merges flush with the rounded-rect above.
          setFill(bgColor);
          pdf.rect(
            cardX,
            startY + estimateH - 0.5,
            cardW,
            actualH - estimateH + 0.5,
            "F",
          );
        }

        // ── 4. Draw border at actual height
        setDraw(borderColor);
        pdf.setLineWidth(0.35);
        pdf.roundedRect(cardX, startY, cardW, actualH, 2.5, 2.5, "S");

        yPosition = startY + actualH + 5; // 5mm gap between cards
      }
    };

    // ────────────────────────────────────────────────────────────────────────
    // 1. Title page header
    // ────────────────────────────────────────────────────────────────────────
    drawPageHeader();

    // ────────────────────────────────────────────────────────────────────────
    // 1b. Centered title + subtitle (matches UI h1 + subtitle)
    // ────────────────────────────────────────────────────────────────────────
    const attemptTypeLabel =
      report?.mode === "Practice" ? tL.practice : tL.assessment;

    pdf.setFont("helvetica", "bold");
    // Auto-shrink title font so localized strings (e.g. Spanish
    // "Transcripción Completa del Usuario") always fit within the page width
    // instead of being clipped at the right margin.
    let mainTitleSize = 36; // default: 48px = 36pt — matches web UI h1 text-[48px]
    pdf.setFontSize(mainTitleSize);
    setText(C_TEXT_PRIMARY);
    const mainTitle = sanitizePdfText(tL.fullUserTranscript);
    while (
      pdf.getTextWidth(mainTitle) > CONTENT_W &&
      mainTitleSize > 16
    ) {
      mainTitleSize -= 1;
      pdf.setFontSize(mainTitleSize);
    }
    const mainTitleW = pdf.getTextWidth(mainTitle);
    // Baseline offset scales with font size so the cap height stays inside
    // the reserved header slot regardless of the shrink.
    const mainTitleBaselineOffset = mainTitleSize * 0.36;
    pdf.text(mainTitle, (PAGE_W - mainTitleW) / 2, yPosition + mainTitleBaselineOffset);
    // Advance yPosition proportionally to the actual title size so the
    // subtitle sits directly below regardless of the shrink.
    yPosition += mainTitleBaselineOffset + 9;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(13.5); // 18px = 13.5pt — matches web UI text-[18px]
    setText(C_TEXT_SECONDARY);
    const subtitle = sanitizePdfText(attemptTypeLabel);
    const subtitleW = pdf.getTextWidth(subtitle);
    pdf.text(subtitle, (PAGE_W - subtitleW) / 2, yPosition);
    yPosition += 11;

    // ────────────────────────────────────────────────────────────────────────
    // 2. User info bar — Student Code · Class · Scenario (matches UI info bar)
    // ────────────────────────────────────────────────────────────────────────
    if (report) {
      const infoItems: string[] = [];
      if (report.userId) {
        infoItems.push(`${tL.studentCode} ${String(report.userId)}`);
      }
      if (displayClassName) {
        infoItems.push(`${tL.class} ${displayClassName}`);
      }
      const scenarioLabel =
        report.scenarioTitle ??
        String(report.scenarioId ?? "").replace(/-/g, " ");
      if (scenarioLabel) {
        infoItems.push(`${tL.sim} ${scenarioLabel}`);
      }
      if (infoItems.length > 0) {
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(9);
        setText(C_TEXT_SECONDARY);
        // Build the full string with a plain " | " separator first to measure width,
        // then draw each item + a filled-circle dot between them so the dot renders
        // correctly in jsPDF (the middle-dot U+00B7 is dropped by Helvetica).
        const DOT_GAP = 3.5; // gap on each side of the dot
        const DOT_R = 0.7; // filled circle radius (mm)
        // Measure total width for centring
        let totalW = 0;
        infoItems.forEach((item, i) => {
          totalW += pdf.getTextWidth(sanitizePdfText(item));
          if (i < infoItems.length - 1) {
            totalW += DOT_GAP * 2 + DOT_R * 2;
          }
        });
        let cx = (PAGE_W - totalW) / 2;
        const textBaseY = yPosition;
        infoItems.forEach((item, i) => {
          const txt = sanitizePdfText(item);
          pdf.text(txt, cx, textBaseY);
          cx += pdf.getTextWidth(txt);
          if (i < infoItems.length - 1) {
            cx += DOT_GAP;
            // Draw filled dot at vertical mid of the text (9pt * 0.42 ≈ 3.78mm)
            setFill(C_TEXT_SECONDARY);
            pdf.circle(cx, textBaseY - 1.2, DOT_R, "F");
            cx += DOT_R * 2 + DOT_GAP;
          }
        });
        yPosition += 8;
      }
    }

    // ────────────────────────────────────────────────────────────────────────
    // 3. Date/time badges row — Real Date/Time (green) + SIM Date/Time (indigo)
    //    Matches the flex-wrap pill row in the UI
    // ────────────────────────────────────────────────────────────────────────
    {
      type DateBadge = {
        label: string;
        value: string;
        tc: RGB;
        bg: RGB;
        bc: RGB;
      };
      const dateBadges: DateBadge[] = [];

      const C_GREEN_TEXT: RGB = [21, 128, 61]; // green-700
      const C_GREEN_BG: RGB = [240, 253, 244]; // green-50
      const C_GREEN_BC: RGB = [34, 197, 94]; // green-500 — matches border-green-500 in HTML
      const C_BLUE_TEXT: RGB = [29, 78, 216]; // blue-700
      const C_BLUE_BG: RGB = [239, 246, 255]; // blue-50
      const C_BLUE_BC: RGB = [59, 130, 246]; // blue-500 — matches border-blue-500 in HTML

      if (realSessionStartTime) {
        try {
          const rd = new Date(realSessionStartTime);
          if (!isNaN(rd.getTime())) {
            // "julio 22, 2026" / "July 22, 2026" — build manually so the
            // day/month ordering does not depend on browser Intl fallbacks.
            const rdMonthLong = rd.toLocaleDateString(dateLocale, {
              month: "long",
            });
            const rdLongDate = `${rdMonthLong} ${rd.getDate()}, ${rd.getFullYear()}`;
            dateBadges.push({
              label: tL.realDate.replace(/:$/, ""),
              value: rdLongDate,
              tc: C_GREEN_TEXT,
              bg: C_GREEN_BG,
              bc: C_GREEN_BC,
            });
            dateBadges.push({
              label: tL.realTime.replace(/:$/, ""),
              value: rd.toLocaleTimeString(dateLocale, {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              }),
              tc: C_GREEN_TEXT,
              bg: C_GREEN_BG,
              bc: C_GREEN_BC,
            });
          }
        } catch {
          /* skip */
        }
      }
      if (simulationStartDate) {
        const dateStr = (() => {
          try {
            const d = new Date(simulationStartDate);
            if (!isNaN(d.getTime())) {
              // Build "diciembre 06" manually — avoid Intl short fallbacks
              // that emit "06-dic" / "06 dic" for es-US in some engines.
              const monthLong = d.toLocaleDateString(dateLocale, {
                month: "long",
              });
              const day = String(d.getDate()).padStart(2, "0");
              return `${monthLong} ${day}`;
            }
          } catch {
            /* fallthrough */
          }
          return String(simulationStartDate).replace(/,?\s*\d{4}\s*$/, "");
        })();
        dateBadges.push({
          label: tL.simDate.replace(/:$/, ""),
          value: dateStr,
          tc: C_BLUE_TEXT,
          bg: C_BLUE_BG,
          bc: C_BLUE_BC,
        });
      }
      if (simulationStartTime) {
        let simTimeStr = String(simulationStartTime);
        try {
          const d = new Date(simulationStartTime);
          if (!isNaN(d.getTime())) {
            simTimeStr = d.toLocaleTimeString(dateLocale, {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            });
          }
        } catch {
          /* keep raw */
        }
        dateBadges.push({
          label: tL.simTime.replace(/:$/, ""),
          value: simTimeStr,
          tc: C_BLUE_TEXT,
          bg: C_BLUE_BG,
          bc: C_BLUE_BC,
        });
      }

      if (dateBadges.length > 0) {
        // Render badges — each has: [clock icon] [LABEL:] [value]
        // Matches UI: inline-flex items-center gap-2 px-4 py-2 rounded-lg border
        const badgePadX = 4.5; // px-4 (16px ≈ 4.2mm)
        const badgePadY = 2.5; // py-2 (8px ≈ 2.1mm)
        const labelFontSize = 8; // text-xs font-bold uppercase (12px ≈ 8.5pt)
        const valFontSize = 9.5; // text-sm font-semibold (14px ≈ 9.9pt)
        const iconD = 3.2; // clock icon outer diameter — matches drawClockBadge sizing
        const iconGap = 2.2; // gap-2 between icon and text

        // Measure natural badge widths
        const badgeWidths = dateBadges.map((b) => {
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(labelFontSize);
          const lw = pdf.getTextWidth(
            sanitizePdfText(`${b.label.toUpperCase()}:`),
          );
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(valFontSize);
          const vw = pdf.getTextWidth(sanitizePdfText(b.value));
          return badgePadX + iconD + iconGap + lw + 2.5 + vw + badgePadX;
        });
        // Distribute chips — natural packing with a fixed gap between badges,
        // horizontally centred as a group. This mirrors the flex-wrap gap-2
        // pill row in the UI and matches the HS-online reference PDF where
        // badges sit next to each other rather than being justified from
        // edge-to-edge across the page.
        const n = dateBadges.length;
        const naturalRowW = badgeWidths.reduce((s, w) => s + w, 0);
        const NATURAL_GAP = 5; // gap between badges in mm (≈ Tailwind gap-2)
        const packedRowW = naturalRowW + NATURAL_GAP * Math.max(0, n - 1);
        // If natural packing overflows the content width, fall back to
        // edge-to-edge justification with a minimum gap of 2mm so badges
        // never overlap.
        let finalGap = NATURAL_GAP;
        let startX = MARGIN_L + (CONTENT_W - packedRowW) / 2;
        if (packedRowW > CONTENT_W && n > 1) {
          finalGap = Math.max(2, (CONTENT_W - naturalRowW) / (n - 1));
          startX = MARGIN_L;
        }
        const finalWidths = badgeWidths; // each badge keeps its natural content width

        // Badge height driven by valFontSize
        const badgeH = valFontSize * 0.42 + badgePadY * 2;
        // Ensure the entire stats row fits on the current page without splitting
        ensureSpace(badgeH + 6);

        dateBadges.forEach((b, i) => {
          const bw = finalWidths[i];
          // Background — rounded-lg (3mm radius to match 8px corner)
          setFill(b.bg);
          setDraw(b.bc);
          pdf.setLineWidth(0.4);
          pdf.roundedRect(startX, yPosition, bw, badgeH, 3, 3, "FD");

          // Clock icon (circle + hands) — matches drawClockBadge icon style
          const iconR = iconD / 2;
          // isGreen: green channel dominates (G > B); isBlue: blue channel dominates (B > G)
          const isGreen = b.bg[1] > b.bg[2]; // green-50: G=253>B=244; blue-50: G=246<B=255
          const iconColor: RGB = isGreen ? [22, 163, 74] : [37, 99, 235]; // green-600 / blue-600
          const valueDark: RGB = isGreen ? [20, 83, 45] : [30, 58, 138];

          // Measure total content width: icon + gap + label + gap + value
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(labelFontSize);
          const labelStr = sanitizePdfText(`${b.label.toUpperCase()}:`);
          const labelTextW = pdf.getTextWidth(labelStr);
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(valFontSize);
          const valStr = sanitizePdfText(b.value);
          const valTextW = pdf.getTextWidth(valStr);
          const totalContentW = iconD + iconGap + labelTextW + 2.5 + valTextW;

          // Start X so the whole group is horizontally centred in the badge
          let curX = startX + (bw - totalContentW) / 2;

          // Text baseline: center the total glyph height (ascender + descender)
          // inside the badge so top and bottom padding are visually equal.
          // Helvetica metrics: ascender = 0.718em, descender = 0.207em, 1pt = 0.353mm
          // baseline = badgeCenter + (ascender − descender) / 2 × ptToMm × fontSize
          const textBaseY =
            yPosition +
            badgeH / 2 +
            (valFontSize * 0.353 * (0.718 - 0.207)) / 2;

          // Icon center: align with the visual midline of the text.
          // Cap height for Helvetica ≈ fontSize(pt) × 0.353(mm/pt) × 0.72
          // Icon center = baseline − cap_height/2
          const iconCX = curX + iconR;
          const iconCY = textBaseY - (valFontSize * 0.353 * 0.72) / 2;

          // Draw clock icon
          setDraw(iconColor);
          pdf.setLineWidth(0.25);
          pdf.circle(iconCX, iconCY, iconR, "S");
          pdf.line(iconCX, iconCY, iconCX, iconCY - iconR + 0.4); // minute hand up
          pdf.line(iconCX, iconCY, iconCX + iconR - 0.5, iconCY); // hour hand right
          curX += iconD + iconGap;

          // Label text
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(labelFontSize);
          setText(b.tc);
          pdf.text(labelStr, curX, textBaseY);
          curX += labelTextW + 2.5;

          // Value text
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(valFontSize);
          setText(valueDark);
          pdf.text(valStr, curX, textBaseY);

          startX += bw + finalGap;
        });
        yPosition += badgeH + 5;
      }
    }

    yPosition += 6; // spacer before timeline

    // ────────────────────────────────────────────────────────────────────────
    // 4. Timeline items
    // ────────────────────────────────────────────────────────────────────────
    timelineItems.forEach((item) => {
      // Ensure at least the clock badge + a minimal card header fits on the current page.
      // Each item type does its own combined keep-together space check below.

      // ── Message item (student / patient / provider / order / sbar_report / system)
      if (item.type === "message") {
        const msg = item.data;
        const meta = getSpeakerMeta(msg.speaker);

        // Row 1: elapsed-time clock badge (left) + avatar circle (right)
        // Row height is driven by avatar size so badge is vertically centred inside it
        const avatarR = 5.5; // ~11mm diameter — matches UI w-12 h-12 rounded-full
        const rowH = avatarR * 2 + 2; // total Row 1 height with a small bottom gap

        // ── Compute card estimate BEFORE drawing the badge row so we can do a
        //    combined keep-together space check (badge + card must never be split).
        const innerW = CONTENT_W - 12;
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(12.75); // use same font size as render for accurate line count
        const msgLines = pdf.splitTextToSize(
          sanitizePdfText(msg.message),
          innerW,
        ) as string[];
        const estH = 6 + 6 + msgLines.length * 5.36 + 18; // 12.75pt lineH ≈ 5.36mm

        // Combined keep-together check: badge row + gap + card body
        ensureSpace(rowH + 2 + estH + 5);

        // Clock badge: drawn vertically centred inside the row
        drawClockBadge(
          msg.elapsedTime ?? "00:00",
          meta.textColor,
          meta.bgColor,
          meta.borderColor,
          yPosition + (rowH - /* badge height calc */ (9 * 0.42 + 1.8 * 2)) / 2,
        );

        // Avatar circle — soft speaker fill + matching border (matches UI w-12 h-12 rounded-full)
        const avatarCX = PAGE_W - MARGIN_R - avatarR;
        const avatarCY = yPosition + avatarR + 1; // +1 for top gap
        setFill(meta.bgColor);
        setDraw(meta.borderColor);
        pdf.setLineWidth(0.5);
        pdf.circle(avatarCX, avatarCY, avatarR, "FD");
        // Speaker icon centred inside the circle
        drawSpeakerIcon(
          meta.iconType,
          avatarCX,
          avatarCY,
          avatarR * 1.1,
          meta.textColor,
        );

        yPosition += rowH + 2; // 2mm gap between Row 1 and card
        const msgEndMs = msg.timestampValue ?? null;
        const msgStartMs =
          msgEndMs && msg.duration ? msgEndMs - msg.duration * 1000 : msgEndMs;
        const tsStart = fmtWallClock(msgStartMs);
        const tsEnd = fmtWallClock(msgEndMs);
        const tsText = [
          tsStart ? `${tL.started} ${tsStart}` : "",
          tsEnd ? `${tL.ended} ${tsEnd}` : "",
          msg.duration ? `${tL.duration} ${formatDurationLabel(msg.duration)}` : "",
        ]
          .filter(Boolean)
          .join(" | ");

        drawBubbleCard(
          meta.bubbleBg,
          meta.borderColor,
          (ix, iw) => {
            // Badge pill (with speaker icon) + timestamps
            const pill = drawPill(
              meta.label,
              ix,
              yPosition,
              meta.textColor,
              meta.bgColor,
              meta.borderColor,
              { iconType: meta.iconType },
            );
            if (tsText) {
              pdf.setFont("helvetica", "normal");
              pdf.setFontSize(8);
              setText(C_TEXT_PRIMARY);
              // Vertically centred with pill on the same row
              const tsBaseY =
                yPosition + pill.height / 2 + (8 * 0.42) / 2 - 0.3;
              const maxTsW = iw - pill.width - 4;
              const tsClipped = (
                pdf.splitTextToSize(sanitizePdfText(tsText), maxTsW) as string[]
              )[0];
              pdf.text(tsClipped, ix + pill.width + 3, tsBaseY);
            }
            yPosition += pill.height + 3;

            // Message text — matches text-[17px] (12.75pt) in web UI
            pdf.setFont("helvetica", "normal");
            pdf.setFontSize(12.75); // 17px = 12.75pt
            setText(C_TEXT_PRIMARY);
            const lines = pdf.splitTextToSize(
              sanitizePdfText(msg.message),
              iw,
            ) as string[];
            const lineH = 5.36; // 12.75pt * 0.42 ≈ 5.36mm
            if (meta.rightAlign) {
              // Right-align: each line flushed right inside the card
              lines.forEach((line: string) => {
                const lw2 = pdf.getTextWidth(line);
                pdf.text(line, ix + iw - lw2, yPosition + 3);
                yPosition += lineH;
              });
            } else {
              pdf.text(lines, ix, yPosition + 3);
              yPosition += lines.length * lineH;
            }
            yPosition += 2;
          },
          estH,
        );

        // ── Common action item
      } else if (item.type === "commonAction") {
        const action = item.data;
        const ca = getCommonActionMeta(action.type);

        // ── Compute card estimate BEFORE drawing the badge so we can do a
        //    combined keep-together space check (badge + card on same page).
        const CLOCK_BADGE_H = 9 * 0.42 + 1.8 * 2; // constant clock badge height ≈ 7.4 mm
        const caEndMs = action.timestampMs ?? null;
        const caStartMs =
          caEndMs && action.duration
            ? caEndMs - action.duration * 1000
            : caEndMs;
        const caStart = fmtWallClock(caStartMs);
        const caEnd = fmtWallClock(caEndMs);
        const tsText = [
          caStart ? `${tL.started} ${caStart}` : "",
          caEnd ? `${tL.ended} ${caEnd}` : "",
        ]
          .filter(Boolean)
          .join(" | ");

        const estH = (() => {
          const iw = CONTENT_W - 12;
          let h = 6 + 5 + 6; // pill + ts + base
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(11);
          const tLines = (
            pdf.splitTextToSize(sanitizePdfText(translateCommonActionLabel(action.label)), iw) as string[]
          ).length;
          h += tLines * 6.0 + 4; // 14.25pt * 0.42 ≈ 5.99mm
          if (action.type) {
            h += 5;
          }
          if (action.question) {
            const qLines = (
              pdf.splitTextToSize(
                sanitizePdfText(action.question),
                iw,
              ) as string[]
            ).length;
            h += qLines * 4.4 + 12;
          }
          if (action.answer) {
            const aStr = Array.isArray(action.answer)
              ? (action.answer as string[]).join(", ")
              : String(action.answer);
            const aLines = (
              pdf.splitTextToSize(sanitizePdfText(aStr), iw) as string[]
            ).length;
            h += aLines * 4.4 + 12;
          }
          if (action.notes ?? action.observations) {
            h += 15;
          }
          if (action.correct !== undefined) {
            h += 10;
          }
          return h + 18; // +8mm safety ensures bg always taller than content
        })();

        // Combined keep-together check: badge + gap + card body
        ensureSpace(CLOCK_BADGE_H + 3 + estH + 5);

        // Now draw badge (space is guaranteed)
        const badgeH = drawClockBadge(
          action.elapsedTime ?? "00:00",
          ca.textColor,
          ca.bgColor,
          ca.borderColor,
        );
        yPosition += badgeH + 3;

        drawBubbleCard(
          ca.bgColor,
          ca.borderColor,
          (ix, iw) => {
            // "Common Actions" badge + timestamps
            const pill = drawPill(
              tL.filterOptions.commonActions,
              ix,
              yPosition,
              ca.textColor,
              ca.bgColor,
              ca.borderColor,
            );
            if (tsText) {
              pdf.setFont("helvetica", "normal");
              pdf.setFontSize(8);
              setText(C_TEXT_PRIMARY);
              // Vertically centred with pill on the same row
              const tsBaseY =
                yPosition + pill.height / 2 + (8 * 0.42) / 2 - 0.3;
              const maxTsW = iw - pill.width - 4;
              const tsClipped = (
                pdf.splitTextToSize(sanitizePdfText(tsText), maxTsW) as string[]
              )[0];
              pdf.text(tsClipped, ix + pill.width + 3, tsBaseY);
            }
            yPosition += pill.height + 3;

            // Title (bold, large — matches text-[19px] = 14.25pt font-bold)
            pdf.setFont("helvetica", "bold");
            pdf.setFontSize(14.25); // 19px = 14.25pt
            setText(C_GRAY900);
            const titleLines = pdf.splitTextToSize(
              sanitizePdfText(translateCommonActionLabel(action.label)),
              iw,
            ) as string[];
            pdf.text(titleLines, ix, yPosition + 4);
            yPosition += titleLines.length * 6.0 + 4; // 14.25pt

            // Type label (uppercase gray — matches text-[11px] font-bold text-gray-500 uppercase)
            if (action.type) {
              pdf.setFont("helvetica", "bold");
              pdf.setFontSize(7.5);
              setText(C_GRAY400);
              pdf.text(
                sanitizePdfText(
                  formatCommonActionCategory(action.type).toUpperCase(),
                ),
                ix,
                yPosition,
              );
              yPosition += 5;
            }

            // Clinical Prompt sub-box
            if (action.question) {
              drawSubBox(
                tL.labels.clinicalPrompt,
                action.question,
                [234, 88, 12] as RGB,
                [255, 247, 237] as RGB,
                [254, 215, 170] as RGB,
                ix,
                iw,
              );
            }
            // Student Response sub-box
            if (action.answer) {
              const ansStr = Array.isArray(action.answer)
                ? (action.answer as string[]).join(", ")
                : String(action.answer);
              drawSubBox(
                tL.labels.studentResponse,
                translateSummaryAnswer(ansStr),
                [5, 150, 105] as RGB, // emerald-600
                [236, 253, 245] as RGB,
                [167, 243, 208] as RGB,
                ix,
                iw,
              );
            }
            // Notes sub-box
            if (action.notes ?? action.observations) {
              drawSubBox(
                tL.labels.observationsNotes,
                String(action.notes ?? action.observations ?? ""),
                [37, 99, 235] as RGB,
                [239, 246, 255] as RGB,
                [191, 219, 254] as RGB,
                ix,
                iw,
              );
            }
            // Correct / Incorrect badge
            if (action.correct !== undefined) {
              yPosition += 2;
              if (action.correct) {
                drawPill(`✓ ${tL.labels.correct}`, ix, yPosition, C_SUCCESS, C_SUCCESS_BG, [
                  167, 243, 208,
                ] as RGB);
              } else {
                drawPill(`✗ ${tL.labels.incorrect}`, ix, yPosition, C_DANGER, C_DANGER_BG, [
                  252, 165, 165,
                ] as RGB);
              }
              yPosition += 7;
            }
            yPosition += 1;
          },
          estH,
        );

        // ── Summary / action entry
      } else {
        const entry = item.data;

        // Skip if no meaningful content
         
        const hasContent = !!(
          entry.sbarQualitativeResult ||
          (entry.details && entry.details.trim().length > 0) ||
          (entry.question && entry.question.trim().length > 0) ||
          entry.answer ||
          (entry.notes && entry.notes.trim().length > 0) ||
          (entry.observations && entry.observations.trim().length > 0)
        );
         
        if (!entry.title || !hasContent) {
          return;
        }

        const cat = getCategoryMetaPdf(entry.category, entry.title);
        const isVital = (entry.category ?? "").toLowerCase() === "vitals";
        const isMedication =
          (entry.category ?? "").toLowerCase() === "medications";
        const isDemoOrHist = ["demographics", "history"].includes(
          (entry.category ?? "").toLowerCase(),
        );

        // ── Compute timestamps and card estimate BEFORE drawing the badge so we
        //    can do a combined keep-together space check (badge + card on same page).
        const CLOCK_BADGE_H_S = 9 * 0.42 + 1.8 * 2; // constant clock badge height ≈ 7.4 mm

        // Timestamps — prefer explicit startTimestampValue (real wall-clock),
        // fall back to duration-based math, then to entryEndMs.
        const entryEndMs = entry.timestampValue ?? null;
        const entryStartMs =
          entry.startTimestampValue ??
          (entryEndMs && entry.duration
            ? entryEndMs - entry.duration * 1000
            : entryEndMs);
        const tsStart = entry.sbarQualitativeResult
          ? fmtWallClock(entry.sbarStartMs)
          : fmtWallClock(entryStartMs);
        const tsEnd = entry.sbarQualitativeResult
          ? fmtWallClock(entry.sbarSubmitMs)
          : fmtWallClock(entryEndMs);
        let tsDur = "";
        if (
          entry.sbarQualitativeResult &&
          entry.sbarStartMs &&
          entry.sbarSubmitMs
        ) {
          tsDur = `${tL.duration} ${formatDurationLabel((entry.sbarSubmitMs - entry.sbarStartMs) / 1000)}`;
        } else if (entry.duration) {
          tsDur = `${tL.duration} ${formatDurationLabel(entry.duration)}`;
        }
        const tsText = [
          tsStart ? `${tL.started} ${tsStart}` : "",
          tsEnd ? `${tL.ended} ${tsEnd}` : "",
          tsDur,
        ]
          .filter(Boolean)
          .join(" | ");

        const estH = (() => {
          // Accurately estimate card height to avoid page-break mid-card
          const iw = CONTENT_W - 12;
          let h = 6 + 5 + 6; // pill row + timestamps row + padding base
          // Title lines — 15pt matches text-[20px]
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(15);
          const tLines = (
            pdf.splitTextToSize(sanitizePdfText(translateEntryTitle(entry.title)), iw) as string[]
          ).length;
          h += tLines * (15 * 0.42 + 1.2) + 1; // titleLineH + gap + 1mm for type label gap
          if (entry.type) {
            h += 6;
          } // type label + gap before sub-boxes
          if (entry.sbarQualitativeResult) {
            const promptLines = (
              pdf.splitTextToSize(
                sanitizePdfText(entry.sbarPrompt ?? ""),
                iw,
              ) as string[]
            ).length;
            const subLines = (
              pdf.splitTextToSize(
                sanitizePdfText(entry.sbarSubmission ?? ""),
                iw,
              ) as string[]
            ).length;
            h += promptLines * 4.4 + subLines * 4.4 + 30; // 3 sub-boxes
          } else if (entry.question) {
            const qLines = (
              pdf.splitTextToSize(
                sanitizePdfText(entry.question),
                iw,
              ) as string[]
            ).length;
            h += qLines * 4.4 + 12;
            if (entry.answer) {
              // For ordering type, count the actual pipe-delimited items for accurate height
              if (entry.type === "ordering") {
                let rawItems: string[] = [];
                if (entry.details?.includes(" ||| ")) {
                  const m = entry.details.match(
                    /Submitted:\s*(.*?)(?=\n|$|\|\s*Started:)/i,
                  );
                  const raw =
                    m?.[1] ?? entry.details.split(/\|\s*Started:/i)[0].trim();
                  rawItems = raw
                    .split(" ||| ")
                    .map((s: string) => s.trim())
                    .filter(Boolean);
                } else {
                  const aRaw = Array.isArray(entry.answer)
                    ? (entry.answer as string[]).join(", ")
                    : String(entry.answer ?? "");
                  rawItems = (
                    aRaw.includes(" ||| ")
                      ? aRaw.split(" ||| ")
                      : aRaw.split(",")
                  )
                    .map((s: string) => s.trim())
                    .filter(Boolean);
                }
                const numW2 = 7;
                const textW2 = iw - 6 - numW2;
                let totalItemLines = 0;
                rawItems.forEach((item) => {
                  totalItemLines += (
                    pdf.splitTextToSize(
                      sanitizePdfText(item.trim()),
                      textW2,
                    ) as string[]
                  ).length;
                });
                h +=
                  5 +
                  totalItemLines * 4.4 +
                  (rawItems.length - 1) * 1.5 +
                  6 +
                  12;
              } else {
                const aStr = Array.isArray(entry.answer)
                  ? (entry.answer as string[]).join(", ")
                  : String(entry.answer ?? "");
                const aLines = (
                  pdf.splitTextToSize(sanitizePdfText(aStr), iw) as string[]
                ).length;
                h += aLines * 4.4 + 12;
              }
            }
          } else if (isMedication) {
            h += 320; // Rich medication card: sub-header + chips + info grid + all sections
          } else if (entry.details && !isVital && !isDemoOrHist) {
            const rawD = entry.details.split(/\|\s*Started:/i)[0].trim();
            const dLines = (
              pdf.splitTextToSize(sanitizePdfText(rawD), iw) as string[]
            ).length;
            h += dLines * 4.4 + 12;
          } else if (entry.details) {
            h += 10;
          }
          if (entry.notes ?? entry.observations) {
            const nLines = (
              pdf.splitTextToSize(
                sanitizePdfText(
                  String(entry.notes ?? entry.observations ?? ""),
                ),
                iw,
              ) as string[]
            ).length;
            h += nLines * 4.4 + 12;
          }
          if (entry.satisfactory !== undefined) {
            h += 10;
          }
          // Vitals box — matches hasVitalsDataPdf render condition:
          // always shown when entry.vitals exists (even empty), regardless of isVital.
          if (!isDemoOrHist) {
            const entryVitalsRaw = (
              entry as SummaryEntry & { vitals?: unknown }
            ).vitals;
            const hasVitalsDataEst =
              entryVitalsRaw !== null &&
              typeof entryVitalsRaw === "object" &&
              !Array.isArray(entryVitalsRaw);
            const isVitalSignsEntry =
              entry.type === "vital-signs" || entry.type === "vital";
            let numVRows = 0;
            if (hasVitalsDataEst) {
              numVRows = Object.values(
                entryVitalsRaw as Record<string, unknown[]>,
              ).filter((v) => Array.isArray(v) && v.length > 0).length;
            }
            if (numVRows === 0 && isVitalSignsEntry && vitalsMapState) {
              numVRows = Object.values(vitalsMapState).filter(
                (v) => Array.isArray(v) && v.length > 0,
              ).length;
            }
            if (hasVitalsDataEst) {
              // Always reserve height for the box (min = header-only = 5+6+3 = 14mm)
              h += 4 + 5 + 6 + numVRows * 6 + 3 + 2;  
            }
          }
          return h + 18; // +8mm safety ensures bg always taller than content
        })();

        // Combined keep-together check: badge + gap + card body
        ensureSpace(CLOCK_BADGE_H_S + 3 + estH + 5);

        // Defensive white strip: erase any background bleed from a previous card
        // that may extend into this entry's area. Drawn after ensureSpace so we
        // are on the correct page. Width exceeds card width slightly to cover
        // rounded-corner artifacts.
        setFill([255, 255, 255]);
        pdf.rect(
          MARGIN_L - 2,
          yPosition,
          CONTENT_W + 4,
          CLOCK_BADGE_H_S + 3 + estH + 10,
          "F",
        );

        // Now draw badge (space is guaranteed)
        const badgeH = drawClockBadge(
          entry.elapsedTime ?? "00:00",
          cat.textColor,
          cat.bgColor,
          cat.borderColor,
        );
        yPosition += badgeH + 3;

        drawBubbleCard(
          cat.bgColor,
          cat.borderColor,
          (ix, iw) => {
            // Category badge + timestamps (NO satisfactory pill here — goes at bottom)
            const catLabel = entry.category
              ? `[${translateEntryCategory(entry.category)}]`
              : `[${translateEntryCategory("summary")}]`;
            const pill = drawPill(
              catLabel,
              ix,
              yPosition,
              cat.textColor,
              cat.bgColor,
              cat.borderColor,
            );
            // Medication status pill (inline next to category badge, matches getStatusBadge in UI)
            let pillCursor = ix + pill.width + 3;
            if (isMedication && entry.details) {
              const st = getMedStatus(entry.details);
              if (st) {
                const sp = drawStatusPill(
                  st.label,
                  pillCursor,
                  yPosition,
                  st.tc,
                  st.bg,
                  st.bc,
                );
                pillCursor += sp.width + 3;
              }
            }
            if (tsText) {
              pdf.setFont("helvetica", "normal");
              pdf.setFontSize(8);
              setText(C_TEXT_PRIMARY);
              // Vertically centred with pill on the same row
              const tsBaseY =
                yPosition + pill.height / 2 + (8 * 0.42) / 2 - 0.3;
              const maxTsW = iw - pillCursor + ix - 2;
              const tsClipped = (
                pdf.splitTextToSize(sanitizePdfText(tsText), maxTsW) as string[]
              )[0];
              pdf.text(tsClipped, pillCursor, tsBaseY);
            }
            yPosition += pill.height + 3;

            // SBAR / Team Communication card
            if (entry.sbarQualitativeResult) {
              // Title
              pdf.setFont("helvetica", "bold");
              pdf.setFontSize(12);
              setText(cat.textColor);
              const titleLines = pdf.splitTextToSize(
                sanitizePdfText(translateEntryTitle(entry.title)),
                iw,
              ) as string[];
              pdf.text(titleLines, ix, yPosition + 4);
              yPosition += titleLines.length * 5.5 + 4;
              // Prompt box
              if (entry.sbarPrompt) {
                // Normalize the backend prompt so "No prompt provided",
                // "No prompt provided.", and "No prompt recorded" all render
                // as the localised placeholder in ES mode (matches the
                // on-screen web UI).
                const rawPrompt = (entry.sbarPrompt ?? "").trim();
                const normalizedPrompt = rawPrompt
                  .replace(/\.+$/, "")
                  .toLowerCase();
                const displayPrompt =
                  !rawPrompt ||
                  normalizedPrompt === "no prompt provided" ||
                  normalizedPrompt === "no prompt recorded"
                    ? tL.noPromptProvided
                    : entry.sbarPrompt;
                drawSubBox(
                  tL.labels.prompt,
                  displayPrompt,
                  C_TEXT_SECONDARY,
                  [255, 255, 255] as RGB,
                  [254, 215, 170] as RGB,
                  ix,
                  iw,
                );
              }
              // Submission box
              if (entry.sbarSubmission) {
                drawSubBox(
                  tL.labels.studentSbarSubmission,
                  entry.sbarSubmission,
                  C_TEXT_SECONDARY,
                  [255, 255, 255] as RGB,
                  [254, 215, 170] as RGB,
                  ix,
                  iw,
                );
              }
              // Result pill — "RESULT:" label + pill on same baseline row
              if (entry.sbarQualitativeResult) {
                yPosition += 4;
                const isSat =
                  entry.sbarQualitativeResult.toLowerCase() === "satisfactory";
                const pillTC = isSat ? C_SUCCESS : ([180, 83, 9] as RGB);
                const pillBG = isSat ? C_SUCCESS_BG : ([255, 251, 235] as RGB);
                const pillBC = isSat
                  ? ([167, 243, 208] as RGB)
                  : ([253, 230, 138] as RGB);
                // Measure pill height so we can centre the label text with it
                pdf.setFont("helvetica", "bold");
                pdf.setFontSize(8.5);
                const pillH = 8.5 * 0.42 + 1.3 * 2; // same as drawPill bh formula
                const pillBaseline = yPosition + pillH - 1.3 - 0.3;
                // "RESULT:" label — bold, gray, vertically centred
                setText(C_TEXT_SECONDARY);
                const resultLabel = tL.labels.result.toUpperCase();
                pdf.text(sanitizePdfText(resultLabel), ix, pillBaseline);
                const labelW = pdf.getTextWidth(resultLabel) + 3;
                // Satisfactory / Unsatisfactory pill
                const pillLabel = isSat
                  ? tL.labels.satisfactory
                  : tL.labels.unsatisfactory;
                drawPill(
                  pillLabel,
                  ix + labelW,
                  yPosition,
                  pillTC,
                  pillBG,
                  pillBC,
                  { fontSize: 8.5, bold: true },
                );
                yPosition += pillH + 4;
              }
            } else {
              // Standard entry title — matches text-[20px] font-bold
              pdf.setFont("helvetica", "bold");
              pdf.setFontSize(15); // 20px = 15pt matches text-[20px]
              setText(cat.textColor);
              const titleLines = pdf.splitTextToSize(
                sanitizePdfText(translateEntryTitle(entry.title)),
                iw,
              ) as string[];
              // Baseline offset = line height so text cap sits at yPosition
              const titleLineH = 15 * 0.42;
              pdf.text(titleLines, ix, yPosition + titleLineH);
              yPosition += titleLines.length * (titleLineH + 1.2);

              // Type label — matches text-[11px] font-bold text-gray-500 uppercase tracking-wider
              // gap-1 (~1mm) below title, plain text (no box)
              if (entry.type) {
                yPosition += 1; // gap-1
                pdf.setFont("helvetica", "bold");
                pdf.setFontSize(7.5);
                setText(C_GRAY400);
                pdf.text(
                  sanitizePdfText(
                    formatCommonActionCategory(entry.type).toUpperCase(),
                  ),
                  ix,
                  yPosition + 3,
                );
                yPosition += 5;
              }

              yPosition += 3; // gap before sub-boxes

              // Vital value display
              if (isVital && entry.details) {
                const rawDetails = entry.details.trim();
                const cleanedVital = rawDetails
                  .split(/\|\s*Started:/i)[0]
                  .replace(/\s*Duration:\s*[\d\w\s]+/i, "")
                  .trim();
                if (cleanedVital) {
                  pdf.setFont("helvetica", "bold");
                  pdf.setFontSize(12);
                  setText(cat.textColor);
                  pdf.text(sanitizePdfText(cleanedVital), ix, yPosition + 4);
                  yPosition += 8;
                }
              } else if (isDemoOrHist && entry.details) {
                // Demographics / History — italic styled details
                const cleanedD = entry.details
                  .split(/\|\s*Started:/i)[0]
                  .trim();
                if (cleanedD) {
                  pdf.setFont("helvetica", "italic");
                  pdf.setFontSize(9.5);
                  setText(cat.textColor);
                  const dLines = pdf.splitTextToSize(
                    sanitizePdfText(cleanedD),
                    iw,
                  ) as string[];
                  pdf.text(dLines, ix, yPosition + 3);
                  yPosition += dLines.length * 5 + 3;
                }
              } else if (isMedication && entry.details) {
                // ── Medication Administration card — mirrors MedicationTranscriptCard.tsx
                const medParts = entry.details
                  .split(" | ")
                  .map((s: string) => s.trim())
                  .filter(Boolean);
                const findMedPart = (prefix: string): string | undefined =>
                  medParts.find((p: string) => p.startsWith(prefix));
                const stripMed = (
                  raw: string | undefined,
                  prefix: string,
                ): string => {
                  if (!raw) {
                    return "";
                  }
                  return raw.replace(new RegExp(`^${prefix}\\s*`), "").trim();
                };
                const hasMedVal = (v: string | undefined): boolean => {
                  if (!v) {
                    return false;
                  }
                  const t = v.trim();
                  return (
                    t.length > 0 && !/^-+$/.test(t) && t.toLowerCase() !== "n/a"
                  );
                };
                // Parse pipe-separated fields
                const medDueTimeVal = stripMed(
                  findMedPart("Due Time:"),
                  "Due Time:",
                );
                const medDoseVal = stripMed(
                  findMedPart("Ordered Dose:"),
                  "Ordered Dose:",
                );
                const medRouteVal = stripMed(findMedPart("Route:"), "Route:");
                const medFreqVal = stripMed(
                  findMedPart("Frequency:"),
                  "Frequency:",
                );
                const medDrugOnHand = stripMed(
                  findMedPart("Drug On Hand:"),
                  "Drug On Hand:",
                );
                const medExpiration = stripMed(
                  findMedPart("Expiration:"),
                  "Expiration:",
                );
                const medIndication = stripMed(
                  findMedPart("Indication:"),
                  "Indication:",
                );
                const medAdminDose = stripMed(
                  findMedPart("Administered Dose:"),
                  "Administered Dose:",
                );
                const medQty = stripMed(findMedPart("Quantity:"), "Quantity:");
                const medExpectedQty = stripMed(
                  findMedPart("Expected Quantity:"),
                  "Expected Quantity:",
                );
                const medSite = stripMed(findMedPart("Site:"), "Site:");
                const medTime = stripMed(findMedPart("Time:"), "Time:");
                const medRate = stripMed(findMedPart("Rate:"), "Rate:");
                const medInfusionDuration = stripMed(
                  findMedPart("Infusion Duration:"),
                  "Infusion Duration:",
                );
                const medStatus = stripMed(findMedPart("Status:"), "Status:");
                const medClinDec = stripMed(
                  findMedPart("Clinical Decision:"),
                  "Clinical Decision:",
                );
                const atRegex =
                  /^(Administered At|Logged At|Missed At|Refused At|Inappropriate At|Held At):/i;
                const administeredAtPart = medParts.find((p: string) =>
                  atRegex.test(p),
                );
                const atLabelMatch = administeredAtPart?.match(atRegex);
                const atLabel = atLabelMatch ? atLabelMatch[1] : "";
                const atValueRaw = administeredAtPart
                  ? administeredAtPart.replace(atRegex, "").trim()
                  : "";
                const atValueMs = atValueRaw ? Date.parse(atValueRaw) : NaN;
                const atFormatted = atValueRaw
                  ? !Number.isNaN(atValueMs)
                    ? fmtAdminDate(atValueMs) || atValueRaw
                    : atValueRaw
                  : "";
                const medAssessmentFindings = stripMed(
                  findMedPart("Assessment Findings:"),
                  "Assessment Findings:",
                );
                const medRefusalReason = stripMed(
                  findMedPart("Refusal Reason:"),
                  "Refusal Reason:",
                );
                const medReasonNotGiven = stripMed(
                  findMedPart("Reason for Not Given:"),
                  "Reason for Not Given:",
                );
                const medInappropriateReason = stripMed(
                  findMedPart("Inappropriate Reason:"),
                  "Inappropriate Reason:",
                );
                const medClinicalNote = stripMed(findMedPart("Note:"), "Note:");
                const medTherapeuticResponse = stripMed(
                  findMedPart("Therapeutic Response:"),
                  "Therapeutic Response:",
                );
                const medAdverseEffects = stripMed(
                  findMedPart("Adverse Effects:"),
                  "Adverse Effects:",
                );
                const medTimeElapsed = stripMed(
                  findMedPart("Time Elapsed:"),
                  "Time Elapsed:",
                );
                const medReassessmentNotes = stripMed(
                  findMedPart("Reassessment Notes:"),
                  "Reassessment Notes:",
                );
                const medReassessedAt = stripMed(
                  findMedPart("Reassessed At:"),
                  "Reassessed At:",
                );
                const medEducationNotes = stripMed(
                  findMedPart("Education Notes:"),
                  "Education Notes:",
                );
                const medAdminPat = stripMed(
                  findMedPart("Administered to Patient:"),
                  "Administered to Patient:",
                );
                const medDisposal = stripMed(
                  findMedPart("Proper Disposal:"),
                  "Proper Disposal:",
                );
                const medAdminNotes = stripMed(
                  findMedPart("Admin Notes:"),
                  "Admin Notes:",
                );
                const medOrderTypePt = findMedPart("Order Type:");
                let medOrderType = stripMed(medOrderTypePt, "Order Type:");
                if (!medOrderType && medFreqVal) {
                  const fLow = medFreqVal.toLowerCase();
                  if (/\bprn\b|as needed/.test(fLow)) {
                    medOrderType = "PRN";
                  } else if (/\bstat\b|\bonce\b/.test(fLow)) {
                    medOrderType = "STAT";
                  } else {
                    medOrderType = "Scheduled";
                  }
                }
                // Structured administration details + grading
                const adminDet = entry.administrationDetails;
                const gradRes = adminDet?.gradingResult;
                const structuredAtRaw =
                  typeof adminDet?.administeredAt === "string"
                    ? adminDet.administeredAt.trim()
                    : "";
                const structuredAtMs = structuredAtRaw
                  ? Date.parse(structuredAtRaw)
                  : NaN;
                const structuredAtFormatted = structuredAtRaw
                  ? !Number.isNaN(structuredAtMs)
                    ? fmtAdminDate(structuredAtMs) || structuredAtRaw
                    : structuredAtRaw
                  : "";
                const isReassessmentOnly = /^\[Reassessment\]/i.test(
                  (entry.details ?? "").trim(),
                );
                const getComp = (field: string) =>
                  gradRes?.comparisons?.find(
                    (c) => c.field.toLowerCase() === field.toLowerCase(),
                  );
                const compStr = (v: string | string[] | undefined): string =>
                  v === undefined || v === null
                    ? ""
                    : Array.isArray(v)
                      ? v.join(" or ")
                      : String(v);

                // ── Helper: section separator + title
                const drawMedSep = (title: string) => {
                  setDraw(C_GRAY200);
                  pdf.setLineWidth(0.25);
                  pdf.line(ix, yPosition, ix + iw, yPosition);
                  yPosition += 3;
                  pdf.setFont("helvetica", "bold");
                  pdf.setFontSize(7.5);
                  setText(C_GRAY700);
                  pdf.text(
                    sanitizePdfText(title.toUpperCase()),
                    ix,
                    yPosition + 3,
                  );
                  yPosition += 7; // extra space so sep line and first row border are not flush
                };

                // ── Helper: Expected | Documented comparison row
                const drawMedCompRow = (
                  label: string,
                  expected: string | undefined,
                  documented: string | undefined,
                  isCorrect: boolean | null,
                ) => {
                  const expStr = expected?.trim() ? expected : "—";
                  const docStr = documented?.trim() ? documented : "—";
                  const rowBG: RGB =
                    isCorrect === null
                      ? [249, 250, 251]
                      : isCorrect
                        ? [236, 253, 245]
                        : [255, 241, 242];
                  const rowBC: RGB =
                    isCorrect === null
                      ? [229, 231, 235]
                      : isCorrect
                        ? [209, 250, 229]
                        : [255, 228, 230];
                  const docTC: RGB =
                    isCorrect === null
                      ? C_TEXT_PRIMARY
                      : isCorrect
                        ? [4, 120, 87]
                        : [190, 24, 93];
                  // Symmetric 2-column layout — divider at exact horizontal center
                  const colPadC = 3;
                  const divXC = ix + iw / 2;
                  const lXC = ix + colPadC;
                  const rXC = divXC + colPadC;
                  const lColW = divXC - lXC - 2;
                  const rColW = ix + iw - rXC - colPadC;
                  pdf.setFont("helvetica", "normal");
                  pdf.setFontSize(8);
                  const expLines = pdf.splitTextToSize(
                    sanitizePdfText(expStr),
                    lColW,
                  ) as string[];
                  const docLines2 = pdf.splitTextToSize(
                    sanitizePdfText(docStr),
                    rColW,
                  ) as string[];
                  const maxL = Math.max(expLines.length, docLines2.length);
                  const boxH = 6 + 4.5 + maxL * 4 + 4;
                  // 4mm gap before every row so adjacent box borders don't appear as double lines
                  yPosition += 2;
                  if (yPosition + boxH > CONTENT_BOTTOM) {
                    drawFooter();
                    pdf.addPage();
                    pageNumber += 1;
                    drawPageHeader();
                  }
                  setFill(rowBG);
                  setDraw(rowBC);
                  pdf.setLineWidth(0.25);
                  pdf.roundedRect(ix, yPosition, iw, boxH, 1.5, 1.5, "FD");
                  // Vertical center divider
                  setDraw(rowBC);
                  pdf.setLineWidth(0.2);
                  pdf.line(divXC, yPosition + 1, divXC, yPosition + boxH - 1);
                  // Row label — spans full width above the two-column area (matches web UI card header)
                  pdf.setFont("helvetica", "bold");
                  pdf.setFontSize(8);
                  setText(C_GRAY700);
                  pdf.text(sanitizePdfText(label), lXC, yPosition + 4.5);
                  if (isCorrect !== null) {
                    const bLabel = isCorrect
                      ? tL.labels.satisfactory
                      : tL.labels.unsatisfactory;
                    const bTC: RGB = isCorrect ? [4, 120, 87] : [190, 24, 93];
                    const bBG: RGB = isCorrect
                      ? [209, 250, 229]
                      : [254, 226, 226];
                    const bBC: RGB = isCorrect
                      ? [167, 243, 208]
                      : [254, 205, 211];
                    pdf.setFont("helvetica", "bold");
                    pdf.setFontSize(7);
                    const bW = pdf.getTextWidth(bLabel) + 5.6;
                    const bH2 = 7 * 0.42 + 1.3 * 2;
                    setFill(bBG);
                    setDraw(bBC);
                    pdf.setLineWidth(0.2);
                    pdf.roundedRect(
                      ix + iw - bW - colPadC,
                      yPosition + 1,
                      bW,
                      bH2,
                      bH2 / 2,
                      bH2 / 2,
                      "FD",
                    );
                    setText(bTC);
                    pdf.text(
                      bLabel,
                      ix + iw - bW - colPadC + 2.8,
                      yPosition + 1 + bH2 - 1.3 - 0.3,
                    );
                  }
                  // Column headers + underlines spanning full column width
                  const sY2 = yPosition + 7;
                  pdf.setFont("helvetica", "bold");
                  pdf.setFontSize(7);
                  setText(C_GRAY400);
                  pdf.text(sanitizePdfText(tL.medicationCard.expected.toUpperCase()), lXC, sY2);
                  pdf.text(sanitizePdfText(tL.medicationCard.documented.toUpperCase()), rXC, sY2);
                  setDraw(C_GRAY200);
                  pdf.setLineWidth(0.2);
                  pdf.line(lXC, sY2 + 1, divXC - colPadC, sY2 + 1);
                  pdf.line(rXC, sY2 + 1, ix + iw - colPadC, sY2 + 1);
                  // Column content
                  pdf.setFont("helvetica", "normal");
                  pdf.setFontSize(8);
                  setText(C_TEXT_SECONDARY);
                  pdf.text(expLines, lXC, sY2 + 4.5);
                  setText(docTC);
                  pdf.text(docLines2, rXC, sY2 + 4.5);
                  yPosition += boxH; // 2mm gap is added at the START of each row for consistency
                };

                // ── Helper: 2-col checklist box (Expected | Documented)
                const drawMedChecklist = (
                  title: string,
                  expectedItems: string[],
                  documentedItems: string[],
                  isCorrect?: boolean | null,
                ) => {
                  const inferredChecklistStatus = (() => {
                    // When there are expected items, always recompute against
                    // the documented set so an upstream grading flag (e.g.
                    // `isCorrect: true` from an ungraded education result)
                    // cannot show a false "Satisfactory" badge when the
                    // student never reached this step. Matches the in-app
                    // ChecklistGradingDisplay logic.
                    if (expectedItems.length > 0) {
                      const expectedSet = new Set(
                        expectedItems.map((v) => v.toLowerCase().trim()),
                      );
                      const documentedSet = new Set(
                        documentedItems.map((v) => v.toLowerCase().trim()),
                      );
                      return Array.from(expectedSet).every((item) =>
                        documentedSet.has(item),
                      );
                    }
                    if (typeof isCorrect === "boolean") {
                      return isCorrect;
                    }
                    return null;
                  })();
                  const itemH = 4;
                  const maxItems = Math.max(
                    expectedItems.length === 0 ? 1 : expectedItems.length,
                    documentedItems.length === 0 ? 1 : documentedItems.length,
                  );
                  const boxH = 7 + 4.5 + maxItems * itemH + 3;
                  // 4mm gap before every checklist box so adjacent borders don't appear as double lines
                  yPosition += 4;
                  if (yPosition + boxH > CONTENT_BOTTOM) {
                    drawFooter();
                    pdf.addPage();
                    pageNumber += 1;
                    drawPageHeader();
                  }
                  // Symmetric 2-column layout — divider at exact horizontal center
                  const colPadCL = 3;
                  const divXCL = ix + iw / 2;
                  const lXCL = ix + colPadCL;
                  const rXCL = divXCL + colPadCL;
                  const rowBG: RGB =
                    inferredChecklistStatus === null
                      ? [249, 250, 251]
                      : inferredChecklistStatus
                        ? [236, 253, 245]
                        : [255, 241, 242];
                  const rowBC: RGB =
                    inferredChecklistStatus === null
                      ? [229, 231, 235]
                      : inferredChecklistStatus
                        ? [209, 250, 229]
                        : [255, 228, 230];
                  setFill(rowBG);
                  setDraw(rowBC);
                  pdf.setLineWidth(0.25);
                  pdf.roundedRect(ix, yPosition, iw, boxH, 1.5, 1.5, "FD");
                  // Vertical center divider
                  setDraw(rowBC);
                  pdf.setLineWidth(0.2);
                  pdf.line(divXCL, yPosition + 1, divXCL, yPosition + boxH - 1);
                  pdf.setFont("helvetica", "bold");
                  pdf.setFontSize(8);
                  setText(C_GRAY700);
                  pdf.text(sanitizePdfText(title), lXCL, yPosition + 4.5);
                  if (inferredChecklistStatus !== null) {
                    const bLabel = inferredChecklistStatus
                      ? tL.labels.satisfactory
                      : tL.labels.unsatisfactory;
                    const bTC: RGB = inferredChecklistStatus
                      ? [4, 120, 87]
                      : [190, 24, 93];
                    const bBG: RGB = inferredChecklistStatus
                      ? [209, 250, 229]
                      : [255, 228, 230];
                    const bBC: RGB = inferredChecklistStatus
                      ? [167, 243, 208]
                      : [254, 205, 211];
                    pdf.setFont("helvetica", "bold");
                    pdf.setFontSize(7);
                    const bW = pdf.getTextWidth(bLabel) + 5.6;
                    const bH2 = 7 * 0.42 + 1.3 * 2;
                    setFill(bBG);
                    setDraw(bBC);
                    pdf.setLineWidth(0.2);
                    pdf.roundedRect(
                      ix + iw - bW - colPadCL,
                      yPosition + 1,
                      bW,
                      bH2,
                      bH2 / 2,
                      bH2 / 2,
                      "FD",
                    );
                    setText(bTC);
                    pdf.text(
                      bLabel,
                      ix + iw - bW - colPadCL + 2.8,
                      yPosition + 1 + bH2 - 1.3 - 0.3,
                    );
                  }
                  // Column headers + underlines spanning full column width
                  const sY3 = yPosition + 7;
                  pdf.setFont("helvetica", "bold");
                  pdf.setFontSize(7);
                  setText(C_GRAY400);
                  pdf.text(sanitizePdfText(tL.medicationCard.expected.toUpperCase()), lXCL, sY3);
                  pdf.text(sanitizePdfText(tL.medicationCard.documented.toUpperCase()), rXCL, sY3);
                  setDraw(rowBC);
                  pdf.setLineWidth(0.2);
                  pdf.line(lXCL, sY3 + 1, divXCL - colPadCL, sY3 + 1);
                  pdf.line(rXCL, sY3 + 1, ix + iw - colPadCL, sY3 + 1);
                  const listY = sY3 + 4.5;
                  pdf.setFont("helvetica", "normal");
                  pdf.setFontSize(7.5);
                  if (expectedItems.length === 0) {
                    setText(C_GRAY400);
                    pdf.text("—", lXCL, listY);
                  } else {
                    setText(C_TEXT_PRIMARY);
                    expectedItems.forEach((item, i) => {
                      pdf.text(
                        sanitizePdfText(`• ${translateChecklistItem(item)}`),
                        lXCL,
                        listY + i * itemH,
                      );
                    });
                  }
                  if (documentedItems.length === 0) {
                    setText(C_GRAY400);
                    pdf.text("—", rXCL, listY);
                  } else {
                    setText(C_TEXT_PRIMARY);
                    documentedItems.forEach((item, i) => {
                      pdf.text(
                        sanitizePdfText(`• ${translateChecklistItem(item)}`),
                        rXCL,
                        listY + i * itemH,
                      );
                    });
                  }
                  yPosition += boxH; // 2mm gap is added at the START for consistency
                };

                // ── Helper: lightweight key/value info line used for free-text notes
                const drawMedInfoLine = (label: string, value: string) => {
                  const lineH = 4;
                  const labelX = ix;
                  const valueRightX = ix + iw;
                  const labelW = iw * 0.4;
                  const valueW = iw * 0.58;
                  const labelLines = pdf.splitTextToSize(
                    sanitizePdfText(label),
                    labelW,
                  ) as string[];
                  const valueLines = pdf.splitTextToSize(
                    sanitizePdfText(value),
                    valueW,
                  ) as string[];
                  const rowH =
                    Math.max(labelLines.length, valueLines.length) * lineH + 2;
                  yPosition += 1.5;
                  if (yPosition + rowH > CONTENT_BOTTOM) {
                    drawFooter();
                    pdf.addPage();
                    pageNumber += 1;
                    drawPageHeader();
                  }
                  pdf.setFont("helvetica", "normal");
                  pdf.setFontSize(8);
                  setText(C_TEXT_SECONDARY);
                  pdf.text(labelLines, labelX, yPosition + 3.5);
                  setText(C_TEXT_PRIMARY);
                  pdf.text(valueLines, valueRightX, yPosition + 3.5, {
                    align: "right",
                  });
                  yPosition += rowH;
                };

                // ── Sub-section header: "MEDICATION ADMINISTRATION" + order type badge
                {
                  const subHdrH = 9;
                  setFill(C_GRAY50);
                  setDraw(C_GRAY100);
                  pdf.setLineWidth(0.25);
                  pdf.roundedRect(ix, yPosition, iw, subHdrH, 1.5, 1.5, "FD");
                  pdf.setFont("helvetica", "bold");
                  pdf.setFontSize(8.5);
                  setText(C_GRAY700);
                  pdf.text(
                    sanitizePdfText(
                      (isReassessmentOnly
                        ? tL.medicationCard.reassessment
                        : tL.medicationCard.medicationAdministration
                      ).toUpperCase(),
                    ),
                    ix + 3,
                    yPosition + 6,
                  );
                  if (medOrderType) {
                    // Translate English canonical order type -> localized label
                    const orderTypeKey = medOrderType.toLowerCase();
                    const orderTypeLabel = (
                      (tL.medicationCard as unknown as {
                        orderTypes?: Record<string, string>;
                      }).orderTypes?.[orderTypeKey] ?? medOrderType
                    ).toUpperCase();
                    pdf.setFont("helvetica", "bold");
                    pdf.setFontSize(7);
                    const otW =
                      pdf.getTextWidth(sanitizePdfText(orderTypeLabel)) + 5.6;
                    const otH = 7 * 0.42 + 1.3 * 2;
                    const reassessBadgeW = isReassessmentOnly
                      ? pdf.getTextWidth(
                          sanitizePdfText(
                            tL.medicationCard.reassessment.toUpperCase(),
                          ),
                        ) + 5.6
                      : 0;
                    setFill(C_GRAY200);
                    setDraw(C_GRAY200);
                    pdf.setLineWidth(0.2);
                    pdf.roundedRect(
                      ix +
                        iw -
                        otW -
                        2 -
                        (isReassessmentOnly ? reassessBadgeW + 2 : 0),
                      yPosition + 1.3,
                      otW,
                      otH,
                      otH / 2,
                      otH / 2,
                      "FD",
                    );
                    setText(C_GRAY700);
                    pdf.text(
                      sanitizePdfText(orderTypeLabel),
                      ix +
                        iw -
                        otW / 2 -
                        2 -
                        (isReassessmentOnly ? reassessBadgeW + 2 : 0),
                      yPosition + 1.3 + otH - 1.3 - 0.3,
                      { align: "center" },
                    );
                    if (isReassessmentOnly) {
                      setFill([224, 242, 254]);
                      setDraw([186, 230, 253]);
                      pdf.roundedRect(
                        ix + iw - reassessBadgeW - 2,
                        yPosition + 1.3,
                        reassessBadgeW,
                        otH,
                        otH / 2,
                        otH / 2,
                        "FD",
                      );
                      setText([3, 105, 161]);
                      pdf.text(
                        sanitizePdfText(
                          tL.medicationCard.reassessment.toUpperCase(),
                        ),
                        ix + iw - reassessBadgeW / 2 - 2,
                        yPosition + 1.3 + otH - 1.3 - 0.3,
                        { align: "center" },
                      );
                    }
                  }
                  yPosition += subHdrH + 1;
                }
                // Started / Duration timing line
                 
                if (
                  !isReassessmentOnly &&
                  (entry.startTimestampValue || entry.duration)
                ) {
                   
                  pdf.setFont("helvetica", "normal");
                  pdf.setFontSize(7.5);
                  setText(C_TEXT_MUTED);
                  const timBits: string[] = [];
                  if (entry.startTimestampValue) {
                    timBits.push(
                      `${tL.started} ${fmtAdminDate(entry.startTimestampValue)}`,
                    );
                  }
                  if (entry.duration) {
                    timBits.push(
                      `${tL.duration} ${formatDurationLabel(entry.duration)}`,
                    );
                  }
                  pdf.text(
                    sanitizePdfText(timBits.join(" · ")),
                    ix,
                    yPosition + 3,
                  );
                  yPosition += 5;
                }
                // ── Info chips row: Due / Dose / Route / Freq
                if (!isReassessmentOnly) {
                  const chips: string[] = [];
                  if (hasMedVal(medDueTimeVal)) {
                    chips.push(`${tL.medicationCard.due} ${medDueTimeVal}`);
                  }
                  if (hasMedVal(medDoseVal)) {
                    chips.push(`${tL.medicationCard.dose} ${medDoseVal}`);
                  }
                  if (hasMedVal(medRouteVal)) {
                    chips.push(`${tL.medicationCard.route} ${medRouteVal}`);
                  }
                  if (hasMedVal(medFreqVal)) {
                    chips.push(`${tL.medicationCard.freq} ${medFreqVal}`);
                  }
                  if (chips.length > 0) {
                    const chipTC: RGB = [109, 40, 217];
                    const chipBG: RGB = [245, 243, 255];
                    const chipBC: RGB = [221, 214, 254];
                    pdf.setFont("helvetica", "bold");
                    pdf.setFontSize(7.5);
                    const chipH = 7.5 * 0.42 + 1.3 * 2;
                    const CHIP_H_PAD = 2.8; // horizontal text padding inside chip
                    const chipMaxW = iw; // no chip can exceed the card content width
                    let chipX = ix;
                    chips.forEach((chip) => {
                      // Truncate the chip text with an ellipsis when it is
                      // wider than the card, so long free-text values (e.g. a
                      // pasted frequency string) never overflow the page.
                      let chipText = sanitizePdfText(chip);
                      let chipTextW = pdf.getTextWidth(chipText);
                      if (chipTextW + CHIP_H_PAD * 2 > chipMaxW) {
                        const ellipsis = "…";
                        const ellW = pdf.getTextWidth(ellipsis);
                        const budget = chipMaxW - CHIP_H_PAD * 2 - ellW;
                        // Trim character by character until it fits inside budget
                        while (
                          chipText.length > 1 &&
                          pdf.getTextWidth(chipText) > budget
                        ) {
                          chipText = chipText.slice(0, -1);
                        }
                        chipText = chipText.replace(/\s+$/, "") + ellipsis;
                        chipTextW = pdf.getTextWidth(chipText);
                      }
                      const chipW = Math.min(
                        chipTextW + CHIP_H_PAD * 2,
                        chipMaxW,
                      );
                      // Wrap to a new row when this chip would exceed the
                      // right edge of the card.
                      if (chipX + chipW > ix + iw + 0.01) {
                        chipX = ix;
                        yPosition += chipH + 2;
                      }
                      setFill(chipBG);
                      setDraw(chipBC);
                      pdf.setLineWidth(0.2);
                      pdf.roundedRect(
                        chipX,
                        yPosition,
                        chipW,
                        chipH,
                        chipH / 2,
                        chipH / 2,
                        "FD",
                      );
                      setText(chipTC);
                      pdf.text(
                        chipText,
                        chipX + CHIP_H_PAD,
                        yPosition + chipH - 1.3 - 0.3,
                      );
                      chipX += chipW + 2;
                    });
                    yPosition += chipH + 3;
                  }
                }
                // ── Indication + Drug on hand + Drug Expiration (2-col grid — mirrors UI)
                if (
                  !isReassessmentOnly &&
                  (hasMedVal(medIndication) ||
                    hasMedVal(medDrugOnHand) ||
                    hasMedVal(medExpiration))
                ) {
                  const gridMid = ix + iw / 2; // center point — matches column dividers above
                  // Build slot list in UI order (Indication, Drug On Hand, Drug Expiration)
                  type GridSlot = {
                    kind: "text" | "pill";
                    label: string;
                    value: string;
                  };
                  const slots: GridSlot[] = [];
                  if (hasMedVal(medIndication)) {
                    slots.push({
                      kind: "text",
                      label: tL.medicationCard.indication.toUpperCase(),
                      value: medIndication,
                    });
                  }
                  if (hasMedVal(medDrugOnHand)) {
                    slots.push({
                      kind: "text",
                      label: tL.medicationCard.drugOnHand.toUpperCase(),
                      value: medDrugOnHand,
                    });
                  }
                  if (hasMedVal(medExpiration)) {
                    slots.push({
                      kind: "pill",
                      label: tL.medicationCard.drugExpiration.toUpperCase(),
                      value: medExpiration,
                    });
                  }
                  const rowH = 14;
                  const drawSlot = (slot: GridSlot, sx: number, sy: number) => {
                    pdf.setFont("helvetica", "bold");
                    pdf.setFontSize(7);
                    setText(C_GRAY400);
                    pdf.text(sanitizePdfText(slot.label), sx, sy + 3);
                    if (slot.kind === "text") {
                      pdf.setFont("helvetica", "bold");
                      pdf.setFontSize(10);
                      setText(C_GRAY900);
                      pdf.text(sanitizePdfText(slot.value), sx, sy + 9);
                    } else {
                      const isExpired = slot.value
                        .toLowerCase()
                        .startsWith("expired");
                      const expTC: RGB = isExpired
                        ? [185, 28, 28]
                        : [21, 128, 61];
                      const expBG: RGB = isExpired
                        ? [254, 242, 242]
                        : [240, 253, 244];
                      const expBC: RGB = isExpired
                        ? [252, 165, 165]
                        : [187, 247, 208];
                      drawPill(
                        (isExpired
                          ? tL.medicationCard.expired
                          : tL.medicationCard.notExpired
                        ).toUpperCase(),
                        sx,
                        sy + 4.5,
                        expTC,
                        expBG,
                        expBC,
                        { fontSize: 7.5 },
                      );
                    }
                  };
                  for (let i = 0; i < slots.length; i += 2) {
                    const left = slots[i];
                    const right = slots[i + 1];
                    drawSlot(left, ix, yPosition);
                    if (right) {
                      drawSlot(right, gridMid, yPosition);
                    }
                    yPosition += rowH;
                  }
                }

                // ── VERIFICATION CHECKLIST
                if (!isReassessmentOnly) {
                  drawMedSep(tL.medicationCard.sections.verificationChecklist);
                  const verifRes = gradRes?.verificationResult;
                  const verifExp = verifRes?.expected ?? [];
                  const verifDoc = ((): string[] => {
                    if ((verifRes?.actual?.length ?? 0) > 0) {
                      return verifRes?.actual ?? [];
                    }
                    const items: string[] = [];
                    const pv = adminDet?.patientVerification;
                    const mv = adminDet?.medicationVerification;
                    if (pv?.nameChecked) {
                      items.push("Asked patient to state their full name");
                    }
                    if (pv?.dobChecked) {
                      items.push("Asked patient to state their date of birth");
                    }
                    if (pv?.wristbandChecked) {
                      items.push("Scanned/checked patient wristband");
                    }
                    if (mv?.nameVerified) {
                      items.push("Verified medication name");
                    }
                    if (mv?.expiryChecked) {
                      items.push("Verified medication is not expired");
                    }
                    if (mv?.allergiesVerified) {
                      items.push(
                        "Verified absence of allergies or contraindications",
                      );
                    }
                    if (mv?.indicationConfirmed) {
                      items.push("Verified medication strength/concentration");
                    }
                    return items;
                  })();
                  drawMedChecklist(
                    tL.medicationCard.subsections.medicationVerification,
                    normalizeChecklistList(
                      verifExp,
                      VERIFICATION_LABEL_MAP,
                      VERIFICATION_ORDER,
                    ),
                    normalizeChecklistList(
                      verifDoc,
                      VERIFICATION_LABEL_MAP,
                      VERIFICATION_ORDER,
                    ),
                    verifRes?.isCorrect ?? null,
                  );
                }

                // ── CLINICAL DECISION
                if (!isReassessmentOnly) {
                  drawMedSep(tL.medicationCard.sections.clinicalDecision);
                  const cdComp = getComp("Clinical Decision");
                  const fallbackRaw = hasMedVal(medClinDec)
                    ? medClinDec
                    : hasMedVal(medStatus)
                      ? medStatus
                      : "";
                  const fallbackNorm = fallbackRaw.toLowerCase().trim();
                  const fallbackDoc =
                    fallbackNorm === "hold"
                      ? "Held"
                      : fallbackNorm === "refuse"
                        ? "Refused"
                        : fallbackRaw || undefined;
                  const cdExp = cdComp ? compStr(cdComp.expected) : undefined;
                  const cdActualFromComp = cdComp ? compStr(cdComp.actual) : "";
                  const cdDoc = hasMedVal(cdActualFromComp)
                    ? cdActualFromComp
                    : fallbackDoc;
                  drawMedCompRow(
                    tL.medicationCard.rows.clinicalDecision,
                    translateClinicalDecisionValue(cdExp),
                    translateClinicalDecisionValue(cdDoc),
                    cdComp ? cdComp.isCorrect : null,
                  );
                  if (hasMedVal(medAssessmentFindings)) {
                    drawMedInfoLine(
                      tL.medicationCard.rows.assessmentFindings,
                      medAssessmentFindings,
                    );
                  }
                  if (hasMedVal(medReasonNotGiven)) {
                    drawMedInfoLine(tL.medicationCard.rows.reason, medReasonNotGiven);
                  }
                  if (hasMedVal(medRefusalReason)) {
                    drawMedInfoLine(tL.medicationCard.rows.refusalReason, medRefusalReason);
                  }
                  if (hasMedVal(medInappropriateReason)) {
                    drawMedInfoLine(
                      tL.medicationCard.rows.inappropriateReason,
                      medInappropriateReason,
                    );
                  }
                  if (hasMedVal(medClinicalNote)) {
                    drawMedInfoLine(tL.medicationCard.rows.note, medClinicalNote);
                  }
                }

                // ── ADMINISTRATION DETAILS
                if (!isReassessmentOnly) {
                  const doseComp2 = getComp("Dose");
                  const qtyComp2 = getComp("Quantity");
                  const rsComp = getComp("Route vs Site") ?? getComp("Route");
                  const timeComp2 = getComp("Administration Time");
                  type MedRow = {
                    label: string;
                    exp: string | undefined;
                    doc: string | undefined;
                    ok: boolean | null;
                  };
                  const adminRows: MedRow[] = [];
                  const dExp = doseComp2
                    ? compStr(doseComp2.expected)
                    : undefined;
                  const dDoc = doseComp2
                    ? compStr(doseComp2.actual)
                    : hasMedVal(medAdminDose)
                      ? medAdminDose
                      : undefined;
                   
                  if (dExp || hasMedVal(dDoc)) {
                    adminRows.push({
                      label: tL.medicationCard.rows.dose,
                      exp: dExp,
                      doc: dDoc,
                      ok: doseComp2 ? doseComp2.isCorrect : null,
                    });
                  }
                  const qExp = qtyComp2
                    ? compStr(qtyComp2.expected)
                    : hasMedVal(medExpectedQty)
                      ? medExpectedQty
                      : undefined;
                  const qDoc = qtyComp2
                    ? compStr(qtyComp2.actual)
                    : hasMedVal(medQty)
                      ? medQty
                      : undefined;
                  if (qExp || hasMedVal(qDoc)) {
                    adminRows.push({
                      label: tL.medicationCard.rows.amount,
                      exp: qExp,
                      doc: qDoc,
                      ok: qtyComp2 ? qtyComp2.isCorrect : null,
                    });
                  }
                  const rsExp = rsComp ? compStr(rsComp.expected) : undefined;
                  const rsDoc = rsComp
                    ? compStr(rsComp.actual)
                    : [medRouteVal, medSite]
                        .filter((v) => hasMedVal(v))
                        .join(" (") + (hasMedVal(medSite) ? ")" : "") ||
                      undefined;
                  if (rsExp || hasMedVal(rsDoc)) {
                    adminRows.push({
                      label: tL.medicationCard.rows.routeVsSite,
                      exp: rsExp,
                      doc: rsDoc,
                      ok: rsComp ? rsComp.isCorrect : null,
                    });
                  }
                   
                  const tExp = timeComp2
                    ? compStr(timeComp2.expected)
                    : undefined;
                  const tDoc = timeComp2
                    ? compStr(timeComp2.actual)
                    : hasMedVal(medTime)
                      ? medTime
                      : undefined;
                  // tExp/tDoc use || intentionally (truthiness check, not nullish guard)
                   
                  if (tExp || hasMedVal(tDoc)) {
                    adminRows.push({
                      label: tL.medicationCard.rows.administrationTime,
                      exp: tExp,
                      doc: tDoc,
                      ok: timeComp2 ? timeComp2.isCorrect : null,
                    });
                  }
                  // Rate
                  const rateComp2 = getComp("Infusion Rate") ?? getComp("Rate");
                  const rExp = rateComp2
                    ? compStr(rateComp2.expected)
                    : undefined;
                  const rDoc = rateComp2
                    ? compStr(rateComp2.actual)
                    : hasMedVal(medRate)
                      ? medRate
                      : undefined;
                   
                  if (rExp || hasMedVal(rDoc)) {
                    adminRows.push({
                      label: tL.medicationCard.rows.rate,
                      exp: rExp,
                      doc: rDoc,
                      ok: rateComp2 ? rateComp2.isCorrect : null,
                    });
                  }
                  // Duration
                  const durComp2 =
                    getComp("Duration") ?? getComp("Infusion Duration");
                  const durExp = durComp2
                    ? compStr(durComp2.expected)
                    : undefined;
                  const durDoc = durComp2
                    ? compStr(durComp2.actual)
                    : hasMedVal(medInfusionDuration)
                      ? medInfusionDuration
                      : undefined;
                  if (hasMedVal(durDoc)) {
                    adminRows.push({
                      label: tL.medicationCard.rows.duration,
                      exp: durExp,
                      doc: durDoc,
                      ok: durComp2 ? durComp2.isCorrect : null,
                    });
                  }
                  if (adminRows.length > 0) {
                    // Mirror the in-app card logic: when the medication was not
                    // administered AND the clinical decision was graded correct,
                    // suppress Satisfactory/Unsatisfactory badges on every admin
                    // detail row (pass null so they render neutral/gray).
                    const nonAdminStatuses = [
                      "held",
                      "refused",
                      "inappropriate",
                      "missed",
                    ];
                    const isNonAdministered = nonAdminStatuses.includes(
                      (medStatus || medClinDec || "").toLowerCase().trim(),
                    );
                    const cdCompForNeutral = getComp("Clinical Decision");
                    const clinicalDecisionCorrect =
                      cdCompForNeutral?.isCorrect === true;
                    const forceNeutralAdminRows =
                      isNonAdministered && clinicalDecisionCorrect;

                    drawMedSep(tL.medicationCard.sections.administrationDetails);
                    adminRows.forEach((r) =>
                      drawMedCompRow(
                        r.label,
                        r.exp,
                        r.doc,
                        forceNeutralAdminRows ? null : r.ok,
                      ),
                    );
                  }
                }

                // ── PATIENT EDUCATION
                if (!isReassessmentOnly) {
                  drawMedSep(tL.medicationCard.sections.patientEducation);
                  const eduRes = gradRes?.educationResult;
                  const eduExp = eduRes?.expected ?? [];
                  const eduNotesVal = hasMedVal(medEducationNotes)
                    ? medEducationNotes
                    : (adminDet?.patientEducation?.educationNotes ?? "");
                  const eduDoc = ((): string[] => {
                    if ((eduRes?.actual?.length ?? 0) > 0) {
                      return eduRes?.actual ?? [];
                    }
                    const pe = adminDet?.patientEducation;
                    if (!pe) {
                      return [];
                    }
                    const items: string[] = [];
                    if (pe.discussedPurpose) {
                      items.push("Purpose Discussed");
                    }
                    if (pe.reviewedSideEffects) {
                      items.push("Side Effects Reviewed");
                    }
                    if (pe.providedInstructions) {
                      items.push("Instructions Provided");
                    }
                    if (pe.answeredQuestions) {
                      items.push("Questions Answered");
                    }
                    if (pe.patientUnderstanding) {
                      items.push("Patient Understanding");
                    }
                    return items;
                  })();
                  drawMedChecklist(
                    tL.medicationCard.subsections.patientEducation,
                    normalizeChecklistList(
                      eduExp,
                      EDUCATION_LABEL_MAP,
                      EDUCATION_ORDER,
                    ),
                    normalizeChecklistList(
                      eduDoc,
                      EDUCATION_LABEL_MAP,
                      EDUCATION_ORDER,
                    ),
                    eduRes?.isCorrect ?? null,
                  );
                  if (hasMedVal(eduNotesVal)) {
                    drawMedInfoLine(tL.medicationCard.rows.educationalNotes, eduNotesVal);
                  }
                }

                // ── REASSESSMENT FINDINGS
                if (isReassessmentOnly) {
                  drawMedSep(tL.medicationCard.sections.reassessmentFindings);
                  const reassessedAtVal = hasMedVal(medReassessedAt)
                    ? medReassessedAt
                    : typeof adminDet?.reassessedAt === "string"
                      ? adminDet.reassessedAt
                      : "";
                  const reassessedAtMs = reassessedAtVal
                    ? Date.parse(reassessedAtVal)
                    : NaN;
                  const reassessedAtLabel =
                    reassessedAtVal && !Number.isNaN(reassessedAtMs)
                      ? fmtAdminDate(reassessedAtMs)
                      : reassessedAtVal;
                  if (hasMedVal(reassessedAtLabel)) {
                    drawMedInfoLine(tL.medicationCard.rows.reassessedAt, reassessedAtLabel);
                  }
                  if (hasMedVal(medTimeElapsed)) {
                    drawMedInfoLine(tL.medicationCard.rows.timeElapsed, medTimeElapsed);
                  }
                  drawMedInfoLine(
                    tL.medicationCard.rows.therapeuticResponse,
                    hasMedVal(medTherapeuticResponse)
                      ? medTherapeuticResponse
                      : tL.medicationCard.notDocumented,
                  );
                  drawMedInfoLine(
                    tL.medicationCard.rows.adverseEffects,
                    hasMedVal(medAdverseEffects)
                      ? medAdverseEffects
                      : tL.medicationCard.notDocumented,
                  );
                  if (hasMedVal(medReassessmentNotes)) {
                    drawMedInfoLine(tL.medicationCard.rows.notes, medReassessmentNotes);
                  }
                }

                // ── ADMINISTRATION CONFIRMATION
                if (
                  !isReassessmentOnly &&
                  (hasMedVal(medAdminPat) ||
                    hasMedVal(medDisposal) ||
                    hasMedVal(medAdminNotes))
                ) {
                  drawMedSep(tL.medicationCard.sections.administrationConfirmation);
                  const confirmItems: { label: string; yes: boolean }[] = [];
                  if (hasMedVal(medAdminPat)) {
                    confirmItems.push({
                      label: tL.medicationCard.rows.administeredToPatient,
                      yes: /^yes$/i.test(medAdminPat),
                    });
                  }
                  if (hasMedVal(medDisposal)) {
                    confirmItems.push({
                      label: tL.medicationCard.rows.properDisposalConfirmed,
                      yes: /^yes$/i.test(medDisposal),
                    });
                  }
                  confirmItems.forEach((ci) => {
                    if (yPosition + 6 > CONTENT_BOTTOM) {
                      drawFooter();
                      pdf.addPage();
                      pageNumber += 1;
                      drawPageHeader();
                    }
                    const dotC: RGB = ci.yes ? [6, 95, 70] : [156, 163, 175];
                    // Draw circle background
                    setFill(
                      ci.yes
                        ? ([209, 250, 229] as RGB)
                        : ([243, 244, 246] as RGB),
                    );
                    setDraw(dotC);
                    pdf.setLineWidth(0.2);
                    const circX = ix + 2.5;
                    const circY = yPosition + 2.5;
                    const circR = 2.2;
                    pdf.circle(circX, circY, circR, "FD");
                    // Draw checkmark inside circle using two lines (L-shape rotated)
                    if (ci.yes) {
                      pdf.setLineWidth(0.5);
                      setDraw([6, 95, 70]);
                      // Tick: short stroke down-right then longer stroke up-right
                      pdf.lines(
                        [
                          [0.8, 0.9],
                          [1.4, -1.4],
                        ],
                        circX - 1.2,
                        circY + 0.2,
                        [1, 1],
                        "S",
                      );
                      pdf.setLineWidth(0.2);
                    } else {
                      // X mark for no
                      pdf.setLineWidth(0.45);
                      setDraw([156, 163, 175]);
                      pdf.lines(
                        [[1.4, 1.4]],
                        circX - 0.7,
                        circY - 0.7,
                        [1, 1],
                        "S",
                      );
                      pdf.lines(
                        [[1.4, -1.4]],
                        circX - 0.7,
                        circY + 0.7,
                        [1, 1],
                        "S",
                      );
                      pdf.setLineWidth(0.2);
                    }
                    pdf.setFont("helvetica", ci.yes ? "bold" : "normal");
                    pdf.setFontSize(8.5);
                    setText(ci.yes ? ([6, 95, 70] as RGB) : C_TEXT_SECONDARY);
                    pdf.text(
                      sanitizePdfText(ci.label),
                      ix + 7,
                      yPosition + 3.5,
                    );
                    yPosition += 6;
                  });
                  if (hasMedVal(medAdminNotes)) {
                    drawMedInfoLine(tL.medicationCard.rows.notes, medAdminNotes);
                  }
                  yPosition += 2;
                }

                // ── ADMINISTRATION TIMING
                {
                  const hasTimingData =
                    !isReassessmentOnly &&
                    Boolean(
                       
                      entry.startTimestampValue ||
                      hasMedVal(atFormatted) ||
                      hasMedVal(structuredAtFormatted) ||
                      entry.timestampValue ||
                      hasMedVal(medTime) ||
                      entry.duration,
                    );
                  if (hasTimingData) {
                    drawMedSep(tL.medicationCard.sections.administrationTiming);
                    const timRows: { label: string; value: string }[] = [];
                    if (entry.startTimestampValue) {
                      timRows.push({
                        label: tL.medicationCard.rows.started,
                        value: fmtAdminDate(entry.startTimestampValue),
                      });
                    }
                    if (hasMedVal(atFormatted)) {
                      timRows.push({
                        label: translateAtLabel(atLabel) || tL.medicationCard.rows.administeredAt,
                        value: atFormatted,
                      });
                    } else if (hasMedVal(structuredAtFormatted)) {
                      timRows.push({
                        label:
                          medStatus && medStatus !== "Administered"
                            ? translateAtLabel(`${medStatus} At`)
                            : tL.medicationCard.rows.administeredAt,
                        value: structuredAtFormatted,
                      });
                    } else if (entry.timestampValue) {
                      const atLbl =
                        medStatus && medStatus !== "Administered"
                          ? translateAtLabel(`${medStatus} at`)
                          : tL.medicationCard.rows.administeredAt;
                      timRows.push({
                        label: atLbl,
                        value: fmtAdminDate(entry.timestampValue),
                      });
                    }
                    if (hasMedVal(medTime)) {
                      timRows.push({
                        label: tL.medicationCard.rows.documentedAtSimTime,
                        value: medTime,
                      });
                    }
                    if (entry.duration) {
                      timRows.push({
                        label: tL.medicationCard.rows.duration,
                        value: formatDurationLabel(entry.duration),
                      });
                    }
                    timRows.forEach((r) => {
                      if (yPosition + 5 > CONTENT_BOTTOM) {
                        drawFooter();
                        pdf.addPage();
                        pageNumber += 1;
                        drawPageHeader();
                      }
                      pdf.setFont("helvetica", "normal");
                      pdf.setFontSize(8.5);
                      setText(C_TEXT_SECONDARY);
                      pdf.text(sanitizePdfText(r.label), ix, yPosition + 3);
                      pdf.setFont("helvetica", "bold");
                      pdf.setFontSize(8.5);
                      setText(C_TEXT_PRIMARY);
                      const vW = pdf.getTextWidth(sanitizePdfText(r.value));
                      pdf.text(
                        sanitizePdfText(r.value),
                        ix + iw - vW,
                        yPosition + 3,
                      );
                      yPosition += 5;
                    });
                    yPosition += 2;
                  }
                }

                // ── FINAL MEDICATION STATUS
                if (!isReassessmentOnly) {
                  drawMedSep(tL.medicationCard.sections.finalMedicationStatus);
                  const finalComp = getComp("Final Status");
                  const finalExp = finalComp
                    ? translateStatusValue(compStr(finalComp.expected))
                    : undefined;
                  const finalDoc = finalComp
                    ? translateStatusValue(compStr(finalComp.actual))
                    : translateStatusValue(medStatus || undefined);
                  drawMedCompRow(
                    tL.medicationCard.rows.finalStatus,
                    finalExp,
                    finalDoc,
                    finalComp ? finalComp.isCorrect : null,
                  );
                }
              } else {
                // Clinical Prompt sub-box
                if (entry.question) {
                  drawSubBox(
                    tL.labels.clinicalPrompt,
                    entry.question,
                    [234, 88, 12] as RGB,
                    [255, 247, 237] as RGB,
                    [254, 215, 170] as RGB,
                    ix,
                    iw,
                  );
                }
                // Student Response sub-box
                if (entry.answer) {
                  let ansItems: string[] | undefined;
                  let ansStr = "";
                  if (entry.type === "ordering") {
                    // Extract ordered items to render as a numbered list (matches web UI <ol>)
                    if (entry.details?.includes(" ||| ")) {
                      const match = entry.details.match(
                        /Submitted:\s*(.*?)(?=\n|$|\|\s*Started:)/i,
                      );
                      const raw =
                        match?.[1] ??
                        entry.details.split(/\|\s*Started:/i)[0].trim();
                      ansItems = raw
                        .split(" ||| ")
                        .map((s: string) => s.trim())
                        .filter(Boolean);
                    } else {
                      if (Array.isArray(entry.answer)) {
                        // Answer is already an array — use directly to avoid
                        // incorrectly splitting item titles that contain commas.
                        ansItems = (entry.answer as string[])
                          .map((s: string) => s.trim())
                          .filter(Boolean);
                      } else {
                        const answerStr = String(entry.answer ?? "");
                        const rawItems = answerStr.includes(" ||| ")
                          ? answerStr.split(" ||| ")
                          : [answerStr];
                        ansItems = rawItems
                          .map((s: string) => s.trim())
                          .filter(Boolean);
                      }
                    }
                    ansStr = ansItems?.join(", ") ?? "";
                  } else {
                    ansStr = Array.isArray(entry.answer)
                      ? (entry.answer as string[]).join(", ")
                      : String(entry.answer ?? "");
                  }
                   
                  if ((ansItems && ansItems.length > 0) || ansStr.trim()) {
                    drawSubBox(
                      tL.labels.studentResponse,
                      translateSummaryAnswer(ansStr),
                      [5, 150, 105] as RGB, // emerald-600
                      [236, 253, 245] as RGB,
                      [167, 243, 208] as RGB,
                      ix,
                      iw,
                      ansItems,
                    );
                  }
                }
                // Notes / Observations sub-box
                if (entry.notes ?? entry.observations) {
                  drawSubBox(
                    tL.labels.clinicalObservations,
                    String(entry.notes ?? entry.observations ?? ""),
                    [37, 99, 235] as RGB,
                    [239, 246, 255] as RGB,
                    [191, 219, 254] as RGB,
                    ix,
                    iw,
                  );
                }
                // Satisfactory / Unsatisfactory badge at BOTTOM of card (matches UI)
                if (entry.satisfactory !== undefined) {
                  yPosition += 3;
                  const ok = !!entry.satisfactory;
                  drawStatusPill(
                    ok ? tL.labels.satisfactory : tL.labels.unsatisfactory,
                    ix,
                    yPosition,
                    ok ? C_SUCCESS : C_DANGER,
                    ok ? C_SUCCESS_BG : C_DANGER_BG,
                    ok ? ([167, 243, 208] as RGB) : ([252, 165, 165] as RGB),
                  );
                  yPosition += 7;
                }
                // Vitals Data section — mirrors "Vital Signs Obtained" box in web UI.
                // Web UI shows this box whenever hasVitalsData = entry.vitals exists (even if empty).
                // Fallback to vitalsMapState ONLY for type=vital-signs entries.
                const hasVitalsDataPdf =
                  (entry as SummaryEntry & { vitals?: unknown }).vitals !==
                    null &&
                  typeof (entry as SummaryEntry & { vitals?: unknown })
                    .vitals === "object";
                if (!isDemoOrHist && hasVitalsDataPdf) {
                  const vitalDisplayMap: Record<string, string> = {
                    hr: "HR",
                    bp: "BP",
                    rr: "RR",
                    spo2: "SpO2",
                    temp: "Temp",
                  };

                  type VRow = { name: string; count: number; values: string[] };
                  const buildRows = (
                    src:
                      | Record<
                          string,
                          Array<{ title?: string; details?: string }>
                        >
                      | null
                      | undefined,
                  ): VRow[] => {
                    if (!src || typeof src !== "object") {
                      return [];
                    }
                    const rows: VRow[] = [];
                    Object.entries(src).forEach(([vid, readings]) => {
                      if (!Array.isArray(readings) || readings.length === 0) {
                        return;
                      }
                      const nm =
                        vitalDisplayMap[vid.toLowerCase()] ?? vid.toUpperCase();
                      const vals = readings.map((r) => {
                        if (typeof r === "string") {
                          return r;
                        }
                        return (
                          r.details?.replace(/^Value:\s*/i, "").trim() ?? "N/A"
                        );
                      });
                      rows.push({
                        name: nm,
                        count: readings.length,
                        values: vals,
                      });
                    });
                    return rows;
                  };

                  // 1. Primary: entry.vitals (mirrors web UI hasVitalsData check)
                  const ev = (entry as SummaryEntry & { vitals?: unknown })
                    .vitals;
                  let vRows: VRow[] = [];
                  if (ev && typeof ev === "object" && !Array.isArray(ev)) {
                    vRows = buildRows(
                      ev as Record<
                        string,
                        Array<{ title?: string; details?: string }>
                      >,
                    );
                  }

                  // 2. Fallback: vitalsMapState, but ONLY for vital-signs type entries
                  const isVitalSignsEntry =
                    entry.type === "vital-signs" || entry.type === "vital";
                  if (vRows.length === 0 && isVitalSignsEntry) {
                    vRows = buildRows(vitalsMapState ?? undefined);
                  }

                  // Always render the box when entry.vitals exists (matches web UI hasVitalsData),
                  // even when vRows is empty — web UI shows the header with no rows in that case.
                  {
                    yPosition += 4;
                    const vRowH = 6;
                    const vBoxH = 5 + 6 + vRows.length * vRowH + 3;
                    if (yPosition + vBoxH > CONTENT_BOTTOM) {
                      drawFooter();
                      pdf.addPage();
                      pageNumber += 1;
                      drawPageHeader();
                    }
                    setFill([255, 255, 255]);
                    setDraw(C_GRAY200);
                    pdf.setLineWidth(0.4);
                    pdf.roundedRect(
                      ix - 2,
                      yPosition,
                      iw + 4,
                      vBoxH,
                      2,
                      2,
                      "FD",
                    );
                    yPosition += 4;
                    pdf.setFont("helvetica", "bold");
                    pdf.setFontSize(7.5);
                    setText(C_GRAY400);
                    pdf.text(sanitizePdfText(tL.labels.vitalSignsObtained.toUpperCase()), ix, yPosition + 3);
                    yPosition += 7;
                    vRows.forEach((vr) => {
                      const nameStr = `${vr.name} x${vr.count}`;
                      const valueStr = `(${vr.values.join("; ")})`;
                      pdf.setFont("helvetica", "bold");
                      pdf.setFontSize(9);
                      setText(C_GRAY900);
                      pdf.text(sanitizePdfText(nameStr), ix, yPosition + 3);
                      const nameW = pdf.getTextWidth(nameStr) + 4;
                      pdf.setFont("helvetica", "bold");
                      pdf.setFontSize(9);
                      setText(cat.textColor);
                      pdf.text(
                        sanitizePdfText(valueStr),
                        ix + nameW,
                        yPosition + 3,
                      );
                      yPosition += vRowH;
                    });
                    yPosition += 2;
                  }
                }
                // General details (not already shown via question/answer)
                // Orders entries also show details in the UI's general details block
                if (
                  !entry.question &&
                  !entry.answer &&
                  !entry.notes &&
                  !entry.observations &&
                  entry.details
                ) {
                  const rawD = entry.details
                    .trim()
                    .split(/\|\s*Started:/i)[0]
                    .replace(/\s*Duration:\s*[\d\w\s]+/i, "")
                    .replace(/\s*Score:\s*\d+%\s*/i, "")
                    .trim();
                  if (rawD && !rawD.toLowerCase().startsWith("started:")) {
                    const isSubmittedList = rawD.startsWith("Submitted: ");
                    if (isSubmittedList) {
                      const listContent = rawD.substring("Submitted: ".length);
                      const items = listContent.includes(" ||| ")
                        ? listContent.split(" ||| ")
                        : listContent.split(",");
                      const listStr = items
                        .map((s: string, i: number) => `${i + 1}. ${s.trim()}`)
                        .join("\n");
                      drawSubBox(
                        tL.labels.submitted,
                        listStr,
                        C_TEXT_SECONDARY,
                        [249, 250, 251] as RGB,
                        C_GRAY200,
                        ix,
                        iw,
                      );
                    } else {
                      // Render general details as plain text (no "DETAILS" label),
                      // mirroring the web UI which shows the text inline in a
                      // light box without a heading.
                      pdf.setFont("helvetica", "normal");
                      pdf.setFontSize(11.25); // 15px
                      setText(C_TEXT_SECONDARY);
                      // Translate the well-known "Category / Subcategory /
                      // Time viewed" label+value segments so the PDF matches
                      // the on-screen render in Spanish mode.
                      const dLines = pdf.splitTextToSize(
                        sanitizePdfText(translateSummaryDetails(rawD)),
                        iw - 6,
                      ) as string[];
                      const dRowH = 5;
                      const dBoxH = dLines.length * dRowH + 5;
                      if (yPosition + dBoxH > CONTENT_BOTTOM) {
                        drawFooter();
                        pdf.addPage();
                        pageNumber += 1;
                        drawPageHeader();
                      }
                      setFill([249, 250, 251] as RGB);
                      setDraw(C_GRAY200);
                      pdf.setLineWidth(0.25);
                      pdf.roundedRect(ix, yPosition, iw, dBoxH, 1.5, 1.5, "FD");
                      pdf.text(dLines, ix + 3, yPosition + 4);
                      yPosition += dBoxH + 2;
                    }
                  }
                }
              }
            }
            yPosition += 1;
          },
          estH,
        );
      }

      yPosition += 2; // gap between cards (matches gap-3 in UI flex-col)
    });

    // Final footer for the last page
    drawFooter();

    pdf.save(`transcript-${reportId}.pdf`);
  };

  const toggleFilter = (filter: string) => {
    setSelectedFilters((prev) =>
      prev.includes(filter)
        ? prev.filter((f) => f !== filter)
        : [...prev, filter],
    );
  };

  // True when the user has deselected at least one filter option from the full default set
  const isFiltered =
    selectedFilters.length < filterOptions.length ||
    filterOptions.some((opt) => !selectedFilters.includes(opt));

  /**
   * Returns true if `item` belongs to the given filter category.
   * Mirrors the filteredTimeline predicate but WITHOUT the search term so we
   * can independently test whether a filter category has any data at all.
   */
  const itemMatchesFilter = (item: TimelineItem, filter: string): boolean => {
    if (item.type === "commonAction") {
      return filter === "Common Actions";
    }

    if (item.type === "message") {
      const speaker = item.data.speaker;
      // "order" speaker = Order Released messages from Team Communication
      if (speaker === "order") {
        return filter === "Orders";
      }
      if (speaker === "user") {
        return filter === "Student Responses";
      }
      if (speaker === "student_team_comm") {
        return (
          filter === "Student Responses" || filter === "Team Communication"
        );
      }
      if (speaker === "assistant") {
        return filter === "Patient Responses";
      }
      if (speaker === "provider") {
        return filter === "Team Communication";
      }
      if (speaker === "sbar_report") {
        // All SBAR/Team Communication messages go here
        return filter === "Team Communication";
      }
      if (speaker === "system") {
        return filter === "Common Actions";
      }
      return false;
    }

    // summary items
    const cat = item.data.category?.toLowerCase();
    const title = item.data.title;

    // Special case: Team Communication summary entries should be under the "Team Communication" filter
    if (filter === "Team Communication" && title === "Team Communication") {
      return true;
    }

    if (filter === "Demographics") {
      return cat === "demographics";
    }
    if (filter === "History") {
      return cat === "history";
    }
    if (filter === "Common Actions") {
      return cat === "ppe" || cat === "safety";
    }
    if (filter === "Orders") {
      return cat === "orders";
    }
    if (filter === "Medications") {
      return cat === "medications";
    }
    if (filter === "Actions") {
      return (
        ((cat === "action" || cat === "actions" || cat === "clinical") &&
          title !== "Team Communication") ||
        (cat !== "demographics" &&
          cat !== "history" &&
          cat !== "ppe" &&
          cat !== "safety" &&
          cat !== "orders" &&
          cat !== "medications" &&
          cat !== "vitals" &&
          title !== "Team Communication")
      );
    }
    return false;
  };

  /**
   * Selected filters that matched zero items in the full (unfiltered) timeline.
   * Used to display a per-category "no data" notice alongside real results.
   */
  const emptySelectedFilters = selectedFilters.filter(
    (filter) => !timelineItems.some((item) => itemMatchesFilter(item, filter)),
  );

  const filteredTimeline = timelineItems.filter((item) => {
    // Common action search match
    if (item.type === "commonAction") {
      const action = item.data;
      const matchesSearch = action.label
        .toLowerCase()
        .includes(searchTerm.toLowerCase());
      if (!matchesSearch) {
        return false;
      }
      return selectedFilters.includes("Common Actions");
    }

    // Filter out empty summary entries (no title or details)
    if (item.type === "summary") {
      const entry = item.data;
      const hasContent = entry.title && entry.title.trim().length > 0;
      if (!hasContent) {
        return false;
      }
    }

    const matchesSearch =
      item.type === "message"
        ? String(item.data.message ?? "")
            .toLowerCase()
            .includes(searchTerm.toLowerCase())
        : String(item.data.title ?? "")
            .toLowerCase()
            .includes(searchTerm.toLowerCase()) ||
          String(item.data.details ?? "")
            .toLowerCase()
            .includes(searchTerm.toLowerCase());

    if (!matchesSearch) {
      return false;
    }

    if (item.type === "message") {
      const speaker = item.data.speaker;
      const messageText = item.data.message;

      // Validate message has content before filtering
      if (!messageText || messageText.trim().length === 0) {
        return false;
      }

      // "order" speaker = Order Released messages injected by Team Communication
      if (speaker === "order") {
        return selectedFilters.includes("Orders");
      }
      if (speaker === "user") {
        return selectedFilters.includes("Student Responses");
      }
      if (speaker === "student_team_comm") {
        return (
          selectedFilters.includes("Student Responses") ||
          selectedFilters.includes("Team Communication")
        );
      }
      if (speaker === "assistant") {
        return selectedFilters.includes("Patient Responses");
      }
      if (speaker === "provider") {
        return selectedFilters.includes("Team Communication");
      }
      if (speaker === "sbar_report") {
        return selectedFilters.includes("Team Communication");
      }
      if (speaker === "system") {
        return selectedFilters.includes("Common Actions");
      }
      // Default: if speaker doesn't match any known type, don't show it
      return false;
    } else {
      const entry = item.data;
      const category = entry.category?.toLowerCase();
      const title = entry.title;

      // Special case: Team Communication summary entries
      if (title === "Team Communication") {
        return selectedFilters.includes("Team Communication");
      }

      if (category === "demographics" || category === "Demographics") {
        return selectedFilters.includes("Demographics");
      }
      if (category === "history" || category === "History") {
        return selectedFilters.includes("History");
      }
      if (category === "ppe" || category === "safety") {
        return selectedFilters.includes("Common Actions");
      }

      // Separate Orders and Medications
      if (category === "orders") {
        return selectedFilters.includes("Orders");
      }
      if (category === "medications") {
        return selectedFilters.includes("Medications");
      }

      if (
        category === "action" ||
        category === "actions" ||
        category === "clinical"
      ) {
        return selectedFilters.includes("Actions");
      }
      return selectedFilters.includes("Actions");
    }
  });

  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center min-h-screen bg-white">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#db8833] mb-4" />
        <p className="text-gray-600 text-lg">
          {variant === "educator"
            ? "Loading student transcript..."
            : "Loading Transcript..."}
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col justify-center items-center min-h-screen bg-white">
        <div className="p-8 text-center max-w-md">
          <MessageCircle className="w-12 h-12 text-gray-500 mx-auto mb-4" />
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
    <div className="min-h-screen bg-[#f5f6f8]">
      {/* Sticky Header */}
      <div className="sticky top-0 z-20 bg-gradient-to-b from-[#f5f6f8] to-[#f5f6f8] shadow-sm overflow-visible">
        <div className="max-w-4xl mx-auto px-4 pt-8 pb-4 overflow-visible">
          <TranscriptHeader
            report={report}
            className={displayClassName}
            onBack={handleBack}
            onDownload={handleDownloadTranscript}
            labels={tL as unknown as TranscriptHeaderLabels}
          />

          {/* Filters */}
          {/* <TranscriptFilters
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          isFilterOpen={isFilterOpen}
          onFilterToggle={() => setIsFilterOpen(!isFilterOpen)}
          selectedFilters={selectedFilters}
          onToggleFilter={toggleFilter}
        /> */}

          {/* Empty filters notice */}
          {/* <EmptyFiltersNotice
          emptyFilters={emptySelectedFilters}
          onRemoveFilter={toggleFilter}
        /> */}

          {/* Real Date & Time + SIM Date & Time Bar */}
          {(realSessionStartTime ??
            simulationStartDate ??
            simulationStartTime) && (
            <div
              className="flex flex-wrap justify-center items-center gap-x-4 gap-y-2 mt-3 mb-4"
              role="region"
              aria-label="Simulation date and time"
            >
              {/* Real Date */}
              {realSessionStartTime && (
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-50 border border-green-500 rounded-lg">
                  <Clock
                    className="w-4 h-4 text-green-600 flex-shrink-0"
                    aria-hidden="true"
                  />
                  <span className="text-xs font-bold text-green-700 uppercase tracking-wider">
                    {tL.realDate}
                  </span>
                  <span className="text-sm font-semibold text-green-900">
                    {(() => {
                      const d = new Date(realSessionStartTime);
                      // Build "julio 23, 2026" manually so the day-month
                      // ordering does not depend on browser Intl fallbacks
                      // (some environments render `es-US` as Spain style).
                      const monthLong = d.toLocaleDateString(dateLocale, {
                        month: "long",
                      });
                      return `${monthLong} ${d.getDate()}, ${d.getFullYear()}`;
                    })()}
                  </span>
                </div>
              )}
              {/* Real Time */}
              {realSessionStartTime && (
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-50 border border-green-500 rounded-lg">
                  <Clock
                    className="w-4 h-4 text-green-600 flex-shrink-0"
                    aria-hidden="true"
                  />
                  <span className="text-xs font-bold text-green-700 uppercase tracking-wider">
                    {tL.realTime}
                  </span>
                  <span className="text-sm font-semibold text-green-900">
                    {new Date(realSessionStartTime).toLocaleTimeString(
                      dateLocale,
                      {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                      },
                    )}
                  </span>
                </div>
              )}
              {simulationStartDate && (
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 border border-blue-500 rounded-lg">
                  <Clock
                    className="w-4 h-4 text-blue-600 flex-shrink-0"
                    aria-hidden="true"
                  />
                  <span className="text-xs font-bold text-blue-700 uppercase tracking-wider">
                    {tL.simDate}
                  </span>
                  <span className="text-sm font-semibold text-blue-900">
                    {(() => {
                      try {
                        const d = new Date(simulationStartDate);
                        if (!isNaN(d.getTime())) {
                          // Build "diciembre 15" manually — avoid Intl short
                          // fallbacks that emit `15-dic` for `es-US`.
                          const monthLong = d.toLocaleDateString(dateLocale, {
                            month: "long",
                          });
                          return `${monthLong} ${d.getDate()}`;
                        }
                      } catch {
                        // Fall through to regex fallback below.
                      }
                      // Fallback: strip trailing ", YYYY"
                      return simulationStartDate.replace(/,?\s*\d{4}\s*$/, "");
                    })()}
                  </span>
                </div>
              )}
              {simulationStartTime && (
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 border border-blue-500 rounded-lg">
                  <Clock
                    className="w-4 h-4 text-blue-600 flex-shrink-0"
                    aria-hidden="true"
                  />
                  <span className="text-xs font-bold text-blue-700 uppercase tracking-wider">
                    {tL.simTime}
                  </span>
                  <span className="text-sm font-semibold text-blue-900">
                    {(() => {
                      try {
                        const d = new Date(simulationStartTime);
                        if (!isNaN(d.getTime())) {
                          return d.toLocaleTimeString(dateLocale, {
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: false,
                          });
                        }
                      } catch {
                        // Fall through to regex fallback below.
                      }
                      // Fallback: strip trailing AM/PM
                      return simulationStartTime.replace(/\s*(AM|PM)\s*$/i, "");
                    })()}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Search & Filter Controls */}
          <div className="flex items-center gap-4 mt-4">
            <div className="relative flex-1">
              <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-[#9CA3AF] w-5 h-5" />
              <input
                type="text"
                placeholder={tL.searchPlaceholder}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-16 pr-6 py-4 bg-[#F9FAFB] border border-[#F3F4F6] rounded-full text-[#374151] text-lg focus:ring-2 focus:ring-[#db8833]/10 focus:border-[#db8833] outline-none transition-all placeholder:text-[#9CA3AF]"
              />
            </div>
            <div className="relative" ref={filterButtonRef}>
              <button
                onClick={() => setIsFilterOpen(!isFilterOpen)}
                className="flex items-center gap-3 px-8 py-4 bg-white border border-[#E5E7EB] rounded-full text-[#4B5563] font-bold text-lg hover:bg-gray-50 transition-all shadow-sm"
              >
                <Filter className="w-5 h-5" />
                {tL.filter}
              </button>

              {isFilterOpen && (
                <div className="absolute left-0 mt-3 w-52 bg-white rounded-2xl shadow-xl border border-[#F3F4F6] py-1 z-[9999] animate-in fade-in zoom-in duration-200 max-h-72 overflow-y-auto overscroll-contain">
                  {filterOptions.map((option) => (
                    <button
                      key={option}
                      onClick={() => toggleFilter(option)}
                      className={`w-full text-left px-6 py-3.5 text-sm font-medium transition-colors border-b last:border-0 border-[#F9FAFB] ${
                        selectedFilters.includes(option)
                          ? "bg-[#db8833]/5 text-[#db8833]"
                          : "text-[#4B5563] hover:bg-gray-50"
                      }`}
                    >
                      {filterLabelMap[option] ?? option}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="max-w-4xl mx-auto px-4 py-4">
        {/* Per-filter empty notice â€” shown when SOME filters have results but others do not */}
        {filteredTimeline.length > 0 && emptySelectedFilters.length > 0 && (
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 mb-6">
            <svg
              className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 110 20A10 10 0 0112 2z"
              />
            </svg>
            <div>
              <p className="text-sm font-semibold text-amber-800 mb-1">
                {emptySelectedFilters.length === 1
                  ? tL.noDataForCategory
                  : tL.noDataForCategories}
              </p>
              <div className="flex flex-wrap gap-2 mt-1">
                {emptySelectedFilters.map((f) => (
                  <button
                    key={f}
                    onClick={() => toggleFilter(f)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 border border-amber-300 hover:bg-amber-200 transition-colors cursor-pointer"
                    title={`Remove ${filterLabelMap[f] ?? f} filter`}
                  >
                    <svg
                      className="w-3 h-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                    {filterLabelMap[f] ?? f}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Transcript Container */}
        <div className="bg-white rounded-[32px] border border-gray-100 p-8 shadow-sm overflow-hidden">
          <div className="divide-y divide-gray-200">
            {filteredTimeline.map((item, index) => {
              if (item.type === "message") {
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
                    data-pdf-nobreak
                    className="flex flex-col gap-3 break-inside-avoid py-5 first:pt-0"
                  >
                    {/* Flat timeline row (no bubble/avatar) — replica of the
                        student app: run-time clock + speaker pill above the
                        message text; student turns are right-aligned. */}
                    <div className="w-full">
                      <div
                        className={cn(
                          "px-1 py-1 rounded-xl transition-all",
                          speakerType === "order"
                            ? "border border-dashed " + styles.border
                            : "",
                          speakerType === "sbar_report"
                            ? "border border-orange-200 shadow-sm px-6 py-6"
                            : "",
                        )}
                      >
                        {/* Run-time clock + source label + wall-clock timestamps */}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3">
                          <span className="flex items-center gap-1.5 text-sm font-semibold text-[#5f6060]">
                            <Clock className="w-4 h-4 text-[#5f6060]" />
                            {message.elapsedTime ?? "00:00"}
                          </span>
                          <span
                            data-cat-pill
                            className={`text-[10px] font-bold px-2.5 py-1 rounded-full border uppercase tracking-[0.05em] ${styles.badge}`}
                          >
                            {styles.label}
                          </span>
                          {(msgStartLabel || msgEndLabel) && (
                            <span className="text-[10px] text-black-400 font-medium">
                              {msgStartLabel && (
                                <>
                                  {tL.started}: {msgStartLabel}
                                </>
                              )}
                              {msgEndLabel && (
                                <>
                                  {" "}| {tL.ended}: {msgEndLabel}
                                </>
                              )}
                              {message.duration && (
                                <>
                                  {" "}
                                  | {tL.duration}:{" "}
                                  {formatDurationLabel(message.duration)}
                                </>
                              )}
                            </span>
                          )}
                        </div>

                        {speakerType === "sbar_report" ? (
                          <div className="w-full">
                            <div className="flex items-center gap-2 mb-4 border-b border-orange-100 pb-3">
                              <FileText className="w-5 h-5 text-[#ED621F]" />
                              <h4 className="text-[16px] font-bold text-orange-800">
                                {message.message
                                  .toLowerCase()
                                  .startsWith("team communication initiated.")
                                  ? tL.sessionInitiated
                                  : tL.sbarSubmitted}
                              </h4>
                            </div>
                            <div className="whitespace-pre-wrap text-[17px] text-[#374151] leading-relaxed font-medium bg-white/50 p-4 rounded-lg border border-orange-50">
                              {message.message}
                            </div>
                          </div>
                        ) : (
                          <p
                            className={cn(
                              "w-full text-[17px] text-[#374151] leading-relaxed font-medium",
                              message.speaker === "user"
                                ? "text-right"
                                : "text-left",
                            )}
                            title={message.message}
                          >
                            {message.message}
                          </p>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              } else if (item.type === "commonAction") {
                // Common Action Entry (infection / privacy / environmental)
                const action = item.data;
                const typeColorMap: Record<
                  string,
                  {
                    bg: string;
                    border: string;
                    text: string;
                    badge: string;
                    badgeBorder: string;
                  }
                > = {
                  infection: {
                    bg: "bg-[#fff0e6]",
                    border: "border-[#f6ddc2]",
                    text: "text-[#EA580C]",
                    badge: "bg-primary-50 text-primary-600 border-primary-200",
                    badgeBorder: "border-[#f6ddc2]",
                  },
                  privacy: {
                    bg: "bg-[#e6faf7]",
                    border: "border-[#99F6E4]",
                    text: "text-[#0D9488]",
                    badge: "bg-teal-50 text-teal-600 border-teal-200",
                    badgeBorder: "border-[#99F6E4]",
                  },
                  environmental: {
                    bg: "bg-[#EFF6FF]",
                    border: "border-[#BFDBFE]",
                    text: "text-[#2563EB]",
                    badge: "bg-blue-50 text-blue-600 border-blue-200",
                    badgeBorder: "border-[#BFDBFE]",
                  },
                };
                const colors =
                  typeColorMap[action.type] || typeColorMap.infection;
                const _categoryLabel =
                  action.type === "infection"
                    ? tL.actionTypes.infectionPrevention
                    : action.type === "privacy"
                      ? tL.actionTypes.privacyModesty
                      : tL.actionTypes.environmentalSafety;

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
                    className="flex flex-col gap-3 break-inside-avoid"
                  >
                    {/* Run Time Clock Badge */}
                    <div className="flex items-center gap-4">
                      <div
                        className={`flex items-center gap-2 px-3 py-1.5 ${colors.bg} rounded-md border ${colors.border}`}
                      >
                        <Clock className={`w-4 h-4 ${colors.text}`} />
                        <span
                          className={`text-sm font-semibold ${colors.text}`}
                        >
                          {action.elapsedTime ?? "00:00"}
                        </span>
                      </div>
                    </div>

                    <div className="w-full">
                      <div
                        className={`p-6 ${colors.bg} border ${colors.border} rounded-xl`}
                      >
                        {/* Embedded label + wall-clock timestamps */}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3">
                          <span
                            className={`text-[10px] font-bold px-2.5 py-1 rounded-full border uppercase tracking-[0.05em] ${colors.badge}`}
                            title={tL.filterOptions.commonActions}
                          >
                            {tL.filterOptions.commonActions}
                          </span>
                          {caStartLabel && (
                            <span className="text-[10px] text-black-400 font-medium">
                              {tL.started} {caStartLabel}
                              {caEndLabel && (
                                <>
                                  {" "}| {tL.ended} {caEndLabel}
                                </>
                              )}
                            </span>
                          )}
                        </div>
                        {/* Title */}
                        <div className="flex flex-col gap-1">
                          <p className="text-[19px] font-bold text-[#111827] leading-tight">
                            {translateCommonActionLabel(action.label)}
                          </p>
                          {action.type && (
                            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                              {_categoryLabel}
                            </span>
                          )}
                        </div>

                        {/* Prompt */}
                        {action.question && (
                          <div className="mt-4 bg-primary-50/50 p-4 rounded-xl border border-primary-100 shadow-sm transition-all hover:bg-[#e9e9e9]">
                            <div className="flex items-center gap-2 mb-2">
                              <p className="text-[10px] font-black text-primary-600 uppercase tracking-widest">
                                Clinical Prompt
                              </p>
                            </div>
                            <p className="text-[15px] text-gray-700 font-medium leading-relaxed">
                              {action.question}
                            </p>
                          </div>
                        )}

                        {/* Submitted Response */}
                        {action.answer && (
                          <div className="mt-3 bg-emerald-50/30 p-4 rounded-xl border border-emerald-100 shadow-sm transition-all hover:bg-emerald-50/50">
                            <div className="flex items-center gap-2 mb-2">
                              <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">
                                Student Response
                              </p>
                            </div>
                            <p className="text-[16px] text-gray-900 font-medium leading-relaxed">
                              {action.answer}
                            </p>
                          </div>
                        )}

                        {/* Notes/Observations */}
                        {(action.notes ?? action.observations) && (
                          <div className="mt-3 bg-blue-50/30 p-3 rounded-lg border border-blue-100 italic">
                            <p className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-1">
                              {tL.labels.observationsNotes}
                            </p>
                            <p className="text-[15px] text-blue-900">
                              {action.notes ?? action.observations}
                            </p>
                          </div>
                        )}

                        {/* Correctness Status */}
                        {action.correct !== undefined && (
                          <div className="mt-4 flex items-center gap-2">
                            {action.correct ? (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase tracking-widest shadow-sm">
                                <CheckCircle className="w-3.5 h-3.5" /> {tL.labels.correct}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black bg-rose-50 text-rose-700 border border-rose-200 uppercase tracking-widest shadow-sm">
                                <AlertCircle className="w-3.5 h-3.5" />{" "}
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
                const isVital = category === "vitals";
                const isAction =
                  category === "actions" ||
                  category === "action" ||
                  category === "clinical";
                const isOrder = category === "orders";
                const isMedication = category === "medications";
                const isTeamComm = entry.title === "Team Communication";
                // Check if this is a vital-type action with vitals field
                const entryData = entry as SummaryEntry & {
                  vitals?: Record<string, unknown[]>;
                };
                const hasVitalsData =
                  entryData.vitals && typeof entryData.vitals === "object";
                const vitalsList = hasVitalsData ? entryData.vitals : null;

                // For vitals: extract value + smart unit
                const vitalUnitMap: Record<
                  string,
                  { unit: string; suffix: boolean }
                > = {
                  "heart rate recorded": { unit: "bpm", suffix: false },
                  "blood pressure recorded": { unit: "mmHg", suffix: false },
                  "respiratory rate recorded": {
                    unit: "breaths/min",
                    suffix: false,
                  },
                  "temperature recorded": { unit: "Â°F", suffix: true },
                  "spo2 recorded": { unit: "%", suffix: true },
                  "oxygen saturation recorded": { unit: "%", suffix: true },
                };
                const vitalMeta2 = isVital
                  ? vitalUnitMap[entry.title.toLowerCase()]
                  : undefined;
                const rawValue =
                  isVital && entry.details
                    ? entry.details.replace(/^Value:\s*/i, "").trim()
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
                    label: "Vitals",
                    color: "text-green-700",
                    badge: "bg-green-50 text-green-700 border-green-200",
                    bg: "bg-[#F0FDF4]",
                    border: "border-[#BBF7D0]",
                  },
                  demographics: {
                    icon: <User className="w-3.5 h-3.5" />,
                    label: "Demographics",
                    color: "text-primary-700",
                    badge: "bg-primary-50 text-primary-700 border-primary-200",
                    bg: "bg-[#F9FAFB]",
                    border: "border-gray-100",
                  },
                  history: {
                    icon: <FileText className="w-3.5 h-3.5" />,
                    label: "History",
                    color: "text-blue-700",
                    badge: "bg-blue-50 text-blue-700 border-blue-200",
                    bg: "bg-[#F0F7FF]",
                    border: "border-[#BFDBFE]",
                  },
                  actions: {
                    icon: <ClipboardList className="w-3.5 h-3.5" />,
                    label: "Clinical Action",
                    color: "text-indigo-700",
                    badge: "bg-indigo-50 text-indigo-700 border-indigo-200",
                    bg: "bg-[#F5F3FF]",
                    border: "border-[#DDD6FE]",
                  },
                  orders: {
                    icon: <ClipboardList className="w-3.5 h-3.5" />,
                    label: "Orders",
                    color: "text-pink-700",
                    badge: "bg-pink-50 text-pink-700 border-pink-200",
                    bg: "bg-[#FFF1F2]",
                    border: "border-[#FECDD3]",
                  },
                  medications: {
                    icon: <Pill className="w-3.5 h-3.5" />,
                    label: "Medications",
                    color: "text-violet-700",
                    badge: "bg-violet-50 text-violet-700 border-violet-200",
                    bg: "bg-[#F5F3FF]",
                    border: "border-[#DDD6FE]",
                  },
                  team_communication: {
                    icon: <MessageSquare className="w-3.5 h-3.5" />,
                    label: tL.speakers.teamCommunication,
                    color: "text-blue-700",
                    badge: "bg-blue-50 text-blue-700 border-blue-200",
                    bg: "bg-blue-50/50",
                    border: "border-blue-100",
                  },
                };

                const meta = isTeamComm
                  ? categoryMeta.team_communication
                  : categoryMeta[entry.category?.toLowerCase()] || {
                      icon: <Activity className="w-3.5 h-3.5" />,
                      label: entry.category || "Action",
                      color: "text-gray-700",
                      badge: "bg-gray-50 text-gray-700 border-gray-200",
                      bg: "bg-gray-50",
                      border: "border-gray-100",
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
                    d.includes("Status: Not Given") ||
                    d.startsWith("[Not Given]") ||
                    d.startsWith("[Hold]")
                  ) {
                    statusBadge = (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-black bg-amber-100 text-amber-800 border border-amber-200 tracking-wider uppercase">
                        {tL.labels.notGiven}
                      </span>
                    );
                  } else if (
                    d.includes("Status: Refused") ||
                    d.startsWith("[Refused]") ||
                    d.startsWith("[Refuse]")
                  ) {
                    statusBadge = (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-black bg-rose-100 text-rose-800 border border-rose-200 tracking-wider uppercase">
                        {tL.labels.refused}
                      </span>
                    );
                  } else if (
                    d.includes("Status: Missed") ||
                    d.startsWith("[Missed]")
                  ) {
                    statusBadge = (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-black bg-primary-100 text-primary-800 border border-primary-200 tracking-wider uppercase">
                        {tL.labels.missed}
                      </span>
                    );
                  } else if (
                    d.includes("Status: Inappropriate") ||
                    d.startsWith("[Inappropriate]")
                  ) {
                    statusBadge = (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-black bg-purple-100 text-purple-800 border border-purple-200 tracking-wider uppercase">
                        {tL.labels.inappropriate}
                      </span>
                    );
                  } else if (
                    isMedication &&
                    (d.includes("Status: Held") || d.startsWith("[Held]"))
                  ) {
                    statusBadge = (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-black bg-amber-100 text-amber-800 border border-amber-200 tracking-wider uppercase">
                        {tL.labels.held}
                      </span>
                    );
                  } else if (
                    isMedication &&
                    (d.includes("Status: Administered") ||
                      d.startsWith("[Administered]"))
                  ) {
                    statusBadge = (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200 tracking-wider uppercase">
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
                    ((typeof entry.answer === "string" &&
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
                    className="flex flex-col gap-2"
                  >
                    {/* Run Time Clock Badge */}
                    <div className="flex items-center gap-4">
                      <div
                        className={`flex items-center gap-2 px-3 py-1.5 ${categoryColors.bg} rounded-md border ${categoryColors.border}`}
                      >
                        <Clock className={`w-4 h-4 ${categoryColors.text}`} />
                        <span
                          className={`text-sm font-semibold ${categoryColors.text}`}
                        >
                          {entry.elapsedTime ?? "00:00"}
                        </span>
                      </div>
                    </div>

                    <div className="w-full">
                      <div
                        className={`p-6 ${categoryColors.bg} border ${categoryColors.border} rounded-xl`}
                      >
                        {/* Embedded source label + wall-clock timestamps */}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-4">
                          <span
                            className={`flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full border uppercase tracking-[0.05em] ${categoryColors.badge}`}
                          >
                            {categoryColors.icon}
                            {`[${translateEntryCategory(entry.category)}]`}
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
                                    {" "}| {tL.ended} {entryEndLabel}
                                  </>
                                )}
                                {entry.duration && (
                                  <>
                                    {" "}
                                    | {tL.duration}{" "}
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
                                    {tL.started}{" "}
                                    {formatWallClock(entry.sbarStartMs)}
                                  </>
                                )}
                                {entry.sbarSubmitMs && (
                                  <>
                                    {" "}
                                    | {tL.ended}{" "}
                                    {formatWallClock(entry.sbarSubmitMs)}
                                  </>
                                )}
                                {entry.sbarStartMs && entry.sbarSubmitMs && (
                                  <>
                                    {" "}
                                    | {tL.duration}{" "}
                                    {formatElapsedLabel(
                                      (entry.sbarSubmitMs - entry.sbarStartMs) /
                                        1000,
                                    )}
                                  </>
                                )}
                              </span>
                            )}
                        </div>
                        <div className="flex flex-col gap-3">
                          {entry.sbarQualitativeResult ? (
                            <div className="flex flex-col gap-4 text-[15px] font-medium leading-relaxed mt-2">
                              <h3
                                className={`text-[20px] font-bold ${categoryColors.text} leading-snug`}
                              >
                                {translateEntryTitle(entry.title)}
                              </h3>
                              {/* Prompt */}
                              <div className="bg-white/50 p-4 rounded-lg border border-primary-100/50">
                                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                                  {tL.labels.prompt}
                                </p>
                                <p className="text-gray-700">
                                  {(() => {
                                    // Normalize the backend prompt for the
                                    // "no prompt" check: strip whitespace and
                                    // any trailing period so both
                                    // "No prompt provided" and
                                    // "No prompt provided." collapse to the
                                    // Spanish placeholder in ES mode.
                                    const raw = (entry.sbarPrompt ?? "").trim();
                                    const normalized = raw.replace(/\.+$/, "").toLowerCase();
                                    if (
                                      !raw ||
                                      normalized === "no prompt provided" ||
                                      normalized === "no prompt recorded"
                                    ) {
                                      return tL.noPromptProvided;
                                    }
                                    return entry.sbarPrompt;
                                  })()}
                                </p>
                              </div>
                              {/* Submission */}
                              <div className="bg-white/50 p-4 rounded-lg border border-primary-100/50">
                                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                                  {tL.labels.studentSbarSubmission}
                                </p>
                                <p className="text-gray-800 whitespace-pre-wrap">
                                  {entry.sbarSubmission}
                                </p>
                              </div>
                              {/* Result */}
                              <div className="flex items-center gap-3">
                                <p className="text-sm font-bold text-gray-500 uppercase tracking-wider">
                                  {tL.labels.result}
                                </p>
                                <span
                                  className={cn(
                                    "px-3 py-1 rounded-full text-[13px] font-bold shadow-sm border",
                                    entry.sbarQualitativeResult.toLowerCase() ===
                                      "satisfactory"
                                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                      : "bg-amber-50 text-amber-700 border-amber-200",
                                  )}
                                >
                                  {entry.sbarQualitativeResult.toLowerCase() ===
                                  "satisfactory"
                                    ? tL.labels.satisfactory
                                    : tL.labels.unsatisfactory}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center justify-between gap-4">
                                <h3
                                  className={`text-[20px] font-bold ${categoryColors.text} leading-snug`}
                                >
                                  {translateEntryTitle(entry.title)}
                                </h3>
                                {statusBadge}
                              </div>
                              {entry.type && (
                                <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                                  {formatActionType(entry.type)}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Question/Prompt */}
                          {!entry.sbarQualitativeResult && entry.question && (
                            <div className="mt-4 bg-primary-50/50 p-4 rounded-xl border border-primary-100 shadow-sm transition-all hover:bg-[#e9e9e9]">
                              <div className="flex items-center gap-2 mb-2">
                                <p className="text-[10px] font-black text-primary-600 uppercase tracking-widest">
                                  {tL.labels.clinicalPrompt}
                                </p>
                              </div>
                              <p className="text-[15px] text-gray-700 font-medium leading-relaxed break-words">
                                {entry.question}
                              </p>
                            </div>
                          )}

                          {/* Submitted Response */}
                          {entry.answer && (
                            <div className="mt-3 bg-emerald-50/30 p-4 rounded-xl border border-emerald-100 shadow-sm transition-all hover:bg-emerald-50/50">
                              <div className="flex items-center gap-2 mb-2">
                                <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">
                                  {tL.labels.studentResponse}
                                </p>
                              </div>
                              <div className="text-[16px] text-gray-900 font-medium leading-relaxed break-words">
                                {(() => {
                                  if (entry.type !== "ordering") {
                                    const displayAnswer = Array.isArray(
                                      entry.answer,
                                    )
                                      ? entry.answer.join(", ")
                                      : String(entry.answer ?? "");
                                    return <p>{translateSummaryAnswer(displayAnswer)}</p>;
                                  }

                                  let items: string[] = [];
                                  if (entry.details?.includes(" ||| ")) {
                                    const match = entry.details.match(
                                      /Submitted:\s*(.*?)(?=\n|$|\|\s*Started:)/i,
                                    );
                                    if (match?.[1]) {
                                      items = match[1].split(" ||| ");
                                    } else {
                                      const raw = entry.details
                                        .split(/\|\s*Started:/i)[0]
                                        .trim();
                                      items = raw.split(" ||| ");
                                    }
                                  } else {
                                    if (Array.isArray(entry.answer)) {
                                      // Answer is already an array â€” use directly to avoid
                                      // incorrectly splitting item titles that contain commas.
                                      items = entry.answer as string[];
                                    } else {
                                      const answerStr = String(
                                        entry.answer ?? "",
                                      );
                                      items = answerStr.includes(" ||| ")
                                        ? answerStr.split(" ||| ")
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

                          {/* Notes/Observations */}
                          {(entry.notes ?? entry.observations) && (
                            <div className="mt-3 bg-blue-50/20 p-4 rounded-xl border border-blue-100/50 italic shadow-sm">
                              <div className="flex items-center gap-2 mb-2">
                                <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">
                                  {tL.labels.clinicalObservations}
                                </p>
                              </div>
                              <p className="text-[15px] text-blue-900 leading-relaxed break-words">
                                {entry.notes ?? entry.observations}
                              </p>
                            </div>
                          )}

                          {/* Satisfactory / Unsatisfactory Status */}
                          {entry.satisfactory !== undefined && (
                            <div
                              className="flex flex-wrap items-center gap-2 mt-3"
                              role="status"
                              aria-label={`Action result: ${entry.satisfactory ? "Satisfactory" : "Unsatisfactory"}`}
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
                            <div className="w-fit">
                              <span
                                className={`text-[20px] font-black ${categoryColors.text} bg-white/80 backdrop-blur-sm border ${categoryColors.border} rounded-xl px-4 py-1.5 shadow-sm`}
                              >
                                {vitalValue}
                              </span>
                            </div>
                          ) : (entry.category === "demographics" ||
                              entry.category === "history") &&
                            entry.details ? (
                            <div className="w-full">
                              <p
                                className={`text-[15px] font-semibold ${categoryColors.text} bg-white/60 backdrop-blur-sm border ${categoryColors.border} rounded-lg px-4 py-3 shadow-sm italic leading-relaxed`}
                              >
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
                          entry.category !== "demographics" &&
                          entry.category !== "history" &&
                          entry.type !== "ordering" &&
                          !isMedication &&
                          entry.details &&
                          !hasVitalsData &&
                          !entry.sbarQualitativeResult &&
                          cleanDetails(entry.details, !!entry.answer) &&
                          (() => {
                            const detailsText = cleanDetails(
                              entry.details,
                              !!entry.answer,
                            );
                            if (!entry.answer) {
                              return true;
                            }
                            const norm1 = detailsText
                              .replace(/\|\|\|/g, ",")
                              .split(",")
                              .map((s) => s.trim())
                              .filter(Boolean)
                              .join(",");
                            const norm2 = entry.answer
                              .replace(/\|\|\|/g, ",")
                              .split(",")
                              .map((s) => s.trim())
                              .filter(Boolean)
                              .join(",");
                            return (
                              norm1 !== norm2 && detailsText !== entry.answer
                            );
                          })() && (
                            <div className="text-[15px] text-gray-600 mt-3 font-medium leading-relaxed bg-white/50 p-3 rounded-lg border border-gray-100">
                              {(() => {
                                const detailsText = cleanDetails(
                                  entry.details,
                                  !!entry.answer,
                                );
                                if (detailsText.startsWith("Submitted: ")) {
                                  const listContent = detailsText.substring(
                                    "Submitted: ".length,
                                  );
                                  const isPipeDelimited =
                                    listContent.includes(" ||| ");
                                  const items = isPipeDelimited
                                    ? listContent.split(" ||| ")
                                    : listContent.split(",");

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
                                  cleanDetails(entry.details, !!entry.answer),
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
                                    hr: "HR",
                                    bp: "BP",
                                    rr: "RR",
                                    spo2: "SpO2",
                                    temp: "Temp",
                                  };

                                  const displayName =
                                    vitalNameMap[vitalId] ||
                                    vitalId.toUpperCase();
                                  const count = readings.length;

                                  // Extract values from reading entries
                                  const values = readings.map(
                                    (reading: unknown) => {
                                      // Handle both string values and object entries with details field
                                      if (typeof reading === "string") {
                                        return reading;
                                      }
                                      const r = reading as { details?: string };
                                      if (r.details) {
                                        return r.details
                                          .replace(/^Value:\s*/i, "")
                                          .trim();
                                      }
                                      return "N/A";
                                    },
                                  );

                                  return (
                                    <div
                                      key={vitalId}
                                      className="flex items-start gap-3 bg-gray-50/50 rounded-lg px-3 py-2"
                                    >
                                      <span className="text-[14px] font-bold text-gray-900 min-w-[80px]">
                                        {displayName} x{count}
                                      </span>
                                      <span
                                        className={`text-[14px] font-semibold ${categoryColors.text} flex-1 min-w-0 break-words`}
                                      >
                                        ({values.join("; ")})
                                      </span>
                                    </div>
                                  );
                                },
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              }

              if (item.type === "commonAction") {
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

            {filteredTimeline.length === 0 && (
              <div className="text-center py-20">
                <MessageCircle className="w-16 h-16 text-[#E5E7EB] mx-auto mb-4" />
                <h3 className="text-xl font-bold text-[#111827] mb-2">
                  No records found
                </h3>
                <p className="text-[#6B7280]">
                  {searchTerm
                    ? "Adjust your search parameters and try again."
                    : isFiltered
                      ? "No transcript data available for the selected criteria."
                      : "No transcript data available."}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
