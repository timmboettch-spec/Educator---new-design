 
"use client";

import {
  ChevronDown,
  ChevronRight,
  Check,
  X,
} from "lucide-react";
import React, { useEffect, useState } from "react";

import { VERIFICATION_ITEMS } from "../constants/grading";
import loginEn from "../../locales/auth/login/en.json";
import loginEs from "../../locales/auth/login/es.json";

// ─────────────────────────────────────────────────────────────────────────────
// Language / translation helper
// ─────────────────────────────────────────────────────────────────────────────
function useAppLanguage(): "en" | "es" {
  const [language, setLanguage] = useState<"en" | "es">(() => {
    if (typeof window === "undefined") {
      return "en";
    }
    const stored = window.localStorage.getItem("app_language");
    return stored === "es" ? "es" : "en";
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const handler = () => {
      const stored = window.localStorage.getItem("app_language");
      setLanguage(stored === "es" ? "es" : "en");
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  return language;
}

// ═══════════════════════════════════════════════════════════════════════════════
// GRADING INTERFACES
// ═══════════════════════════════════════════════════════════════════════════════

interface GradingComparison {
  field: string;
  expected: string | string[] | undefined;
  actual: string | string[] | undefined;
  isCorrect: boolean;
  confidence?: number;
  explanation?: string;
}

interface ChecklistGradingResult {
  expected: string[];
  actual: string[];
  matched: string[];
  missing: string[];
  isCorrect: boolean;
}

interface MedicationGradingResult {
  medicationId?: string;
  medicationName: string;
  overallScore: number;
  totalExpected: number;
  totalCorrect: number;
  comparisons: GradingComparison[];
  educationResult?: ChecklistGradingResult;
  verificationResult?: ChecklistGradingResult;
}

interface AdministrationDetails {
  medicationId?: string;
  medicationName?: string;
  orderTitle?: string;
  orderedDosage?: string;
  route?: string;
  frequency?: string;
  indication?: string;
  orderedBy?: string;
  orderDate?: string;
  drugOnHand?: string;
  patientVerification?: {
    nameChecked?: boolean;
    dobChecked?: boolean;
    wristbandChecked?: boolean;
    checkedCount?: number;
  };
  medicationVerification?: {
    nameVerified?: boolean;
    expiryChecked?: boolean;
    allergiesVerified?: boolean;
    indicationConfirmed?: boolean;
    checkedCount?: number;
  };
  administeredDose?: string;
  administeredQuantity?: string;
  site?: string;
  administrationTime?: string;
  administrationRate?: string;
  administrationDuration?: string;
  clinicalDecision?: string;
  holdReason?: string;
  refusalReason?: string;
  inappropriateReason?: string;
  patientEducation?: {
    discussedPurpose?: boolean;
    reviewedSideEffects?: boolean;
    providedInstructions?: boolean;
    answeredQuestions?: boolean;
    patientUnderstanding?: boolean;
    completedCount?: number;
    educationNotes?: string;
  };
  administeredToPatient?: boolean;
  properDisposal?: boolean;
  administrationNotes?: string;
  therapeuticResponse?: string;
  adverseEffects?: string;
  timeElapsedMinutes?: number;
  reassessmentNotes?: string;
  status?: string;
  notGivenReason?: string;
  notGivenNote?: string;
  administeredAt?: string;
  reassessmentPending?: boolean;
  gradingResult?: MedicationGradingResult;
  isReassessmentEvent?: boolean;
  reassessedAt?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT INTERFACES
// ═══════════════════════════════════════════════════════════════════════════════

interface MedicationTranscriptEntry {
  details?: string;
  timestamp?: string;
  timestampValue?: number;
  startTimestampValue?: number;
  duration?: number;
  administrationDetails?: AdministrationDetails;
}

interface MedicationTranscriptCardProps {
  entry: MedicationTranscriptEntry;
  recordNumber?: number;
}

const formatDurationLabel = (seconds: number): string => {
  const safeValue = Math.max(0, Math.round(seconds));
  if (safeValue < 60) {
    return `${safeValue}s`;
  }
  const mins = Math.floor(safeValue / 60);
  const secs = safeValue % 60;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
};

/** Format epoch-ms or ISO/date string as "May 15, 09:30". Returns '' when invalid. */
const formatAdminDate = (value: number | string | undefined): string => {
  if (value === undefined || value === null || value === "") {
    return "";
  }
  const d = typeof value === "number" ? new Date(value) : new Date(value);
  if (Number.isNaN(d.getTime())) {
    return "";
  }
  return d.toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
};

/** Strip a known "Label:" prefix from a captured pipe-part and trim. */
const stripPrefix = (raw: string | undefined, prefix: string): string => {
  if (!raw) {
    return "";
  }
  return raw.replace(new RegExp(`^${prefix}\\s*`), "").trim();
};

/** True when a value should render (not empty, not placeholder dashes). */
const hasValue = (raw: string | undefined): boolean => {
  if (!raw) {
    return false;
  }
  const v = raw.trim();
  return v.length > 0 && !/^-+$/.test(v) && v.toLowerCase() !== "n/a";
};

// ── Checklist label normalization ──────────────────────────────────────────
// Admin-configured education / verification items are stored as snake_case
// keys (e.g. "purpose_indication", "side_effects"). The student-side fields
// already render as friendly labels (e.g. "Purpose Discussed"). Normalize
// both sides to the same friendly label and sort them in a consistent order
// so Expected and Documented columns visually line up.

export const EDUCATION_LABEL_MAP: Record<string, string> = {
  purpose_indication: "Purpose Discussed",
  purpose_discussed: "Purpose Discussed",
  discussed_purpose: "Purpose Discussed",
  side_effects: "Side Effects Reviewed",
  side_effects_reviewed: "Side Effects Reviewed",
  reviewed_side_effects: "Side Effects Reviewed",
  instructions: "Instructions Provided",
  instructions_provided: "Instructions Provided",
  provided_instructions: "Instructions Provided",
  answered_questions: "Questions Answered",
  questions_answered: "Questions Answered",
  verbalized_understanding: "Patient Understanding",
  patient_understanding: "Patient Understanding",
};
export const EDUCATION_ORDER: string[] = [
  "Purpose Discussed",
  "Side Effects Reviewed",
  "Instructions Provided",
  "Questions Answered",
  "Patient Understanding",
];

// VERIFICATION_LABEL_MAP and VERIFICATION_ORDER are derived from
// VERIFICATION_ITEMS so the transcript always uses the same canonical labels
// as the grading popup (getItemLabel). Any alias/legacy keys that do not
// match a real VERIFICATION_ITEMS id are also mapped here so old records
// render consistently.

// Build the primary id→label map from the source-of-truth list.
export const VERIFICATION_LABEL_MAP: Record<string, string> =
  Object.fromEntries(
    VERIFICATION_ITEMS.map((item) => [item.id, item.label]),
  ) as Record<string, string>;

// Legacy/alias keys that may appear in older records or boolean-fallback paths.
// All aliases resolve to the same canonical label as the authoritative id.
const _VERIFICATION_ALIASES: Record<string, string> = {
  // patient-side aliases
  name_checked: "Asked patient to state their full name",
  dob_checked: "Asked patient to state their date of birth",
  date_of_birth: "Asked patient to state their date of birth",
  scanned_id: "Scanned/checked patient wristband",
  wristband_checked: "Scanned/checked patient wristband",
  // medication-side aliases
  medication_name: "Verified medication name",
  name_verified: "Verified medication name",
  patient_name: "Verified medication name",
  expiration_date: "Verified medication is not expired",
  expiry_check: "Verified medication is not expired",
  expiry_checked: "Verified medication is not expired",
  no_allergies_contraindications:
    "Verified absence of allergies or contraindications",
  allergies_verified: "Verified absence of allergies or contraindications",
  allergies_checked: "Verified absence of allergies or contraindications",
  strength_concentration: "Verified medication strength/concentration",
  indication_confirmed: "Verified medication strength/concentration",
  indication_verified: "Verified medication strength/concentration",
};
Object.assign(VERIFICATION_LABEL_MAP, _VERIFICATION_ALIASES);

// Order matches the VERIFICATION_ITEMS declaration order.
export const VERIFICATION_ORDER: string[] = VERIFICATION_ITEMS.map(
  (item) => item.label,
);

const toTitleCase = (s: string): string =>
  s
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());

export const normalizeChecklistList = (
  items: string[],
  map: Record<string, string>,
  order: string[],
): string[] => {
  const normalized = items.map((i) => {
    const key = i.toLowerCase().trim();
    return map[key] ?? toTitleCase(i);
  });
  // Dedupe while preserving the first occurrence (in case alias keys collapse)
  const seen = new Set<string>();
  const deduped = normalized.filter((v) => {
    if (seen.has(v)) {
      return false;
    }
    seen.add(v);
    return true;
  });
  const indexOf = (s: string): number => {
    const idx = order.indexOf(s);
    return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
  };
  return [...deduped].sort((a, b) => indexOf(a) - indexOf(b));
};

/** Collapsible Section Component */
interface CollapsibleSectionProps {
  title: string;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
  badge?: React.ReactNode;
}

function CollapsibleSection({
  title,
  icon,
  defaultOpen = true,
  children,
  badge,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border-t border-gray-200">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between py-3 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {isOpen ? (
            <ChevronDown className="w-4 h-4 text-gray-500" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-500" />
          )}
          {icon}
          <span className="text-[12px] font-bold text-gray-700 uppercase tracking-wider">
            {title}
          </span>
        </div>
        {badge}
      </button>
      {isOpen && <div className="pb-3 pl-6">{children}</div>}
    </div>
  );
}

/** Info Row Component */
interface InfoRowProps {
  label: string;
  value: string | React.ReactNode;
  className?: string;
}

function InfoRow({ label, value, className = "" }: InfoRowProps) {
  return (
    <div className={`flex justify-between items-start py-1.5 ${className}`}>
      <span className="text-[12px] text-gray-500 font-medium">{label}</span>
      <span className="text-[12px] text-gray-800 font-semibold text-right">
        {value}
      </span>
    </div>
  );
}

/** Checklist display */
/** Status Badge Component */
function StatusBadge({
  status,
  variant = "default",
}: {
  status: string;
  variant?: "success" | "warning" | "error" | "info" | "default";
}) {
  const variants = {
    success: "bg-emerald-100 text-emerald-700 border-emerald-200",
    warning: "bg-amber-100 text-amber-700 border-amber-200",
    error: "bg-rose-100 text-rose-700 border-rose-200",
    info: "bg-sky-100 text-sky-700 border-sky-200",
    default: "bg-gray-100 text-gray-700 border-gray-200",
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${variants[variant]}`}
    >
      {status}
    </span>
  );
}

/** Grading Result Badge - Satisfactory/Unsatisfactory indicator */
function GradingResultBadge({ isCorrect }: { isCorrect: boolean }) {
  const language = useAppLanguage();
  const labels =
    language === "es"
      ? loginEs.studentReport.labels
      : loginEn.studentReport.labels;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
        isCorrect
          ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
          : "bg-rose-100 text-rose-700 border border-rose-200"
      }`}
    >
      {isCorrect ? (
        <>
          <Check className="w-3 h-3" /> {labels.satisfactory}
        </>
      ) : (
        <>
          <X className="w-3 h-3" /> {labels.unsatisfactory}
        </>
      )}
    </span>
  );
}

/** Grading Comparison Row - Shows Expected vs Documented vs Result.
 *  When `isCorrect` is null, renders a neutral (gray) row with no
 *  Satisfactory/Unsatisfactory badge — used when the medication was not
 *  configured for grading but we still want a consistent Expected/Documented
 *  layout. Missing values render as "—".
 */
function GradingComparisonRow({
  label,
  expected,
  actual,
  isCorrect,
  confidence,
  explanation,
}: {
  label: string;
  expected: string | string[] | undefined;
  actual: string | string[] | undefined;
  isCorrect: boolean | null;
  confidence?: number;
  explanation?: string;
}) {
  const language = useAppLanguage();
  const tL =
    language === "es"
      ? loginEs.studentReport.medicationCard
      : loginEn.studentReport.medicationCard;
  const formatValue = (val: string | string[] | undefined): string => {
    if (val === undefined || val === null) {
      return "—";
    }
    if (Array.isArray(val)) {
      return val.length === 0 ? "—" : val.join(` ${tL.or} `);
    }
    const trimmed = String(val).trim();
    return trimmed.length === 0 ? "—" : trimmed;
  };

  const neutral = isCorrect === null;
  const containerCls = neutral
    ? "bg-gray-50 border border-gray-200"
    : isCorrect
      ? "bg-emerald-50 border border-emerald-100"
      : "bg-rose-50 border border-rose-100";
  const expectedTextCls = neutral
    ? "text-gray-700"
    : isCorrect
      ? "text-emerald-700"
      : "text-gray-700";
  const actualTextCls = neutral
    ? "text-gray-700"
    : isCorrect
      ? "text-emerald-700"
      : "text-rose-700";

  return (
    <div className={`rounded-lg p-3 mb-2 ${containerCls}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[12px] font-bold text-gray-700">{label}</span>
        {!neutral && <GradingResultBadge isCorrect={isCorrect} />}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider mb-1">
            {tL.expected}
          </p>
          <p className={`text-[12px] font-semibold ${expectedTextCls}`}>
            {formatValue(expected)}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider mb-1">
            {tL.documented}
          </p>
          <p className={`text-[12px] font-semibold ${actualTextCls}`}>
            {formatValue(actual)}
          </p>
        </div>
      </div>
      {(typeof confidence === "number" || explanation) && (
        <div className="mt-2 pt-2 border-t border-gray-200">
          {typeof confidence === "number" && (
            <p className="text-[10px] text-gray-500">
              {tL.confidence}:{" "}
              {(Math.max(0, Math.min(1, confidence)) * 100).toFixed(0)}%
            </p>
          )}
          {explanation && (
            <p className="text-[10px] text-gray-500 mt-0.5">{explanation}</p>
          )}
        </div>
      )}
    </div>
  );
}

/** Checklist Grading Display - For education and verification checklists.
 *  When `result` has its synthetic `isCorrect` set via the neutral helper
 *  (no expected items), renders without coloring or Satisfactory badge so
 *  ungraded medications keep a consistent Expected/Documented layout.
 *
 *  For graded checklists, Satisfactory is only shown when ALL expected items
 *  are documented (order-independent). Any missing expected item is
 *  Unsatisfactory.
 */
function ChecklistGradingDisplay({
  title,
  result,
  studentItems,
  neutral = false,
  kind = "education",
}: {
  title: string;
  result: ChecklistGradingResult;
  studentItems?: string[];
  neutral?: boolean;
  kind?: "education" | "verification";
}) {
  const language = useAppLanguage();
  const tL =
    language === "es"
      ? loginEs.studentReport.medicationCard
      : loginEn.studentReport.medicationCard;
  const labelMap =
    kind === "verification" ? VERIFICATION_LABEL_MAP : EDUCATION_LABEL_MAP;
  const order = kind === "verification" ? VERIFICATION_ORDER : EDUCATION_ORDER;

  const expectedDisplayRaw = normalizeChecklistList(
    result.expected,
    labelMap,
    order,
  );
  const documentedDisplayRaw = normalizeChecklistList(
    studentItems ?? result.actual,
    labelMap,
    order,
  );

  // Translate education / verification labels to Spanish for display only.
  // The canonical English labels are preserved in the underlying data so
  // grading logic and exports remain stable.
  const localizeLabel = (raw: string): string => {
    if (kind === "education") {
      const map: Record<string, string> = {
        "Purpose Discussed": tL.educationLabels.purposeDiscussed,
        "Side Effects Reviewed": tL.educationLabels.sideEffectsReviewed,
        "Instructions Provided": tL.educationLabels.instructionsProvided,
        "Questions Answered": tL.educationLabels.questionsAnswered,
        "Patient Understanding": tL.educationLabels.patientUnderstanding,
        "Discussed medication purpose and indication":
          tL.educationLabels.discussedPurposeIndication,
        "Reviewed potential side effects":
          tL.educationLabels.reviewedSideEffectsFull,
        "Provided medication instructions":
          tL.educationLabels.providedInstructionsFull,
        "Answered patient questions":
          tL.educationLabels.answeredPatientQuestions,
        "Patient verbalizes understanding":
          tL.educationLabels.patientVerbalizesUnderstanding,
      };
      return map[raw] ?? raw;
    }
    // verification
    const map: Record<string, string> = {
      "Asked patient to state their full name":
        tL.verificationLabels.askedFullName,
      "Asked patient to state their date of birth":
        tL.verificationLabels.askedDateOfBirth,
      "Scanned/checked patient wristband":
        tL.verificationLabels.scannedWristband,
      "Verified medication name": tL.verificationLabels.verifiedMedicationName,
      "Verified medication is not expired":
        tL.verificationLabels.verifiedNotExpired,
      "Verified absence of allergies or contraindications":
        tL.verificationLabels.verifiedNoAllergies,
      "Verified medication strength/concentration":
        tL.verificationLabels.verifiedStrength,
    };
    return map[raw] ?? raw;
  };
  const expectedDisplay = expectedDisplayRaw.map(localizeLabel);
  const documentedDisplay = documentedDisplayRaw.map(localizeLabel);

  const expectedSet = new Set(
    expectedDisplayRaw.map((v) => v.toLowerCase()),
  );
  const documentedSet = new Set(
    documentedDisplayRaw.map((v) => v.toLowerCase()),
  );
  const allExpectedDocumented =
    expectedSet.size === 0 ||
    Array.from(expectedSet).every((item) => documentedSet.has(item));
  const displayIsCorrect =
    expectedSet.size > 0 ? allExpectedDocumented : result.isCorrect;

  const containerCls = neutral
    ? "bg-gray-50 border border-gray-200"
    : displayIsCorrect
      ? "bg-emerald-50 border border-emerald-100"
      : "bg-rose-50 border border-rose-100";

  return (
    <div className={`rounded-lg p-3 mb-2 ${containerCls}`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[12px] font-bold text-gray-700">{title}</span>
        {!neutral && <GradingResultBadge isCorrect={displayIsCorrect} />}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Expected */}
        <div>
          <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider mb-2 pb-1 border-b border-gray-200">
            {tL.expected}
          </p>
          <div className="space-y-1">
            {expectedDisplay.length === 0 ? (
              <span className="text-[11px] text-gray-500 italic">—</span>
            ) : (
              expectedDisplay.map((item, idx) => (
                <div key={idx} className="flex items-center gap-1.5 py-0.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                  <span className="text-[11px] text-gray-700">{item}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Documented */}
        <div>
          <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider mb-2 pb-1 border-b border-gray-200">
            {tL.documented}
          </p>
          <div className="space-y-1">
            {documentedDisplay.length === 0 ? (
              <span className="text-[11px] text-gray-500 italic">—</span>
            ) : (
              documentedDisplay.map((item, idx) => (
                <div key={idx} className="flex items-center gap-1.5 py-0.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                  <span className="text-[11px] text-gray-700">{item}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Overall Grading Score Card */
// NOTE: GradingScoreCard was removed as it is currently unused.

export default function MedicationTranscriptCard({
  entry,
  recordNumber: _recordNumber = 1,
}: MedicationTranscriptCardProps) {
  const language = useAppLanguage();
  const tL =
    language === "es"
      ? loginEs.studentReport.medicationCard
      : loginEn.studentReport.medicationCard;

  // Localize display text for status/order-type badges. The underlying English
  // strings (Scheduled, PRN, STAT, Administered, Refused, …) drive variant/
  // color/logic and remain untouched — only the visible text is swapped when
  // Spanish is active. Declared near the top of the component so they are in
  // scope for both the reassessment early-return branch and the main card.
  type OrderTypeKey = keyof typeof tL.orderTypes;
  type StatusValuesTable = typeof loginEs.studentReport.medicationCard.statusValues;
  const statusValues = (tL as unknown as { statusValues?: StatusValuesTable })
    .statusValues;
  const translateOrderType = (raw: string): string => {
    const key = raw.trim().toLowerCase() as OrderTypeKey;
    return tL.orderTypes[key] ?? raw;
  };
  const translateStatusValue = (raw: string): string => {
    if (!statusValues) return raw;
    const key = raw.trim().toLowerCase() as keyof StatusValuesTable;
    return statusValues[key] ?? raw;
  };
  // Localise the free-text clinical-decision value ("Proceed" / "Hold" /
  // "Held" / "Refuse" / "Refused" from the grading pipeline) using
  // `tL.medicationCard.clinicalDecisionValues`. Underlying English strings
  // still drive comparison logic; only the displayed text is swapped.
  const clinicalDecisionValues = (
    tL as unknown as { clinicalDecisionValues?: Record<string, string> }
  ).clinicalDecisionValues;
  const translateClinicalDecisionValue = <T,>(v: T): T => {
    if (!clinicalDecisionValues) return v;
    if (typeof v === "string") {
      const key = v.trim().toLowerCase();
      return (clinicalDecisionValues[key] ?? v) as T;
    }
    if (Array.isArray(v)) {
      return v.map((x) =>
        typeof x === "string"
          ? clinicalDecisionValues[x.trim().toLowerCase()] ?? x
          : x,
      ) as T;
    }
    return v;
  };
  const translateAtLabel = (raw: string): string => {
    if (!raw) return raw;
    const trimmed = raw.trim();
    if (trimmed.toLowerCase() === "administered at") return tL.rows.administeredAt;
    // Parse "<Status> At" (e.g. "Held At", "Refused At") and, when the UI
    // language is Spanish, render as "<Estado> a las" (e.g. "Retenido a las")
    // to match the HS-online reference. In English, keep the raw label.
    const match = trimmed.match(/^(.*?)\s+At$/i);
    if (match && language === "es") {
      const status = match[1];
      return `${translateStatusValue(status)} a las`;
    }
    return raw;
  };

  // Localize reassessment/decision values that the backend ships in English
  // (e.g. "improved", "severe", "none") into Spanish when the UI language is
  // set to ES. Underlying variant logic still keys off the original English
  // string, only the displayed label changes.
  const REASSESSMENT_EN_TO_ES: Record<string, string> = {
    improved: "Mejoró",
    unchanged: "Sin cambios",
    worsened: "Empeoró",
    severe: "Grave",
    moderate: "Moderado",
    mild: "Leve",
    none: "Ninguno",
    absent: "Ausente",
    present: "Presente",
  };
  const translateReassessmentValue = (raw: string): string => {
    if (language !== "es" || !raw) return raw;
    const key = raw.trim().toLowerCase();
    return REASSESSMENT_EN_TO_ES[key] ?? raw;
  };

  // Reassessment date wrapper — mirrors formatAdminDate but honors the app
  // language so Spanish mode renders month names in Spanish
  // ("enero 01, 06:02") rather than English ("Jan 01, 06:02"). Uses a
  // manual format so ES doesn't fall back to Intl's verbose default
  // ("01 de enero a las 06:02") which does not match HS.
  const formatReassessmentDate = (value: number | string | undefined): string => {
    if (value === undefined || value === null || value === "") return "";
    const d = typeof value === "number" ? new Date(value) : new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    if (language === "es") {
      const month = d
        .toLocaleString("es-ES", { month: "long" })
        .toLowerCase();
      const day = String(d.getDate()).padStart(2, "0");
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      return `${month} ${day}, ${hh}:${mm}`;
    }
    return d.toLocaleString("en-US", {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  if (!entry?.details) {
    return null;
  }

  const parts = entry.details
    .split(" | ")
    .map((s) => s.trim())
    .filter(Boolean);

  const findPart = (prefix: string): string | undefined =>
    parts.find((p) => p.startsWith(prefix));

  // Get administration details and grading result
  const adminDetails = entry.administrationDetails;
  const gradingResult = adminDetails?.gradingResult;
  const hasGrading = !!gradingResult && gradingResult.comparisons.length > 0;

  // Helper to find a specific grading comparison
  const getGradingComparison = (
    field: string,
  ): GradingComparison | undefined => {
    return gradingResult?.comparisons.find(
      (c) => c.field.toLowerCase() === field.toLowerCase(),
    );
  };

  // Order info
  const orderTypePart = findPart("Order Type:");  const orderedDose = findPart("Ordered Dose:");
  const administeredDose = findPart("Administered Dose:");
  const quantity = findPart("Quantity:");
  const route = findPart("Route:");
  const site = findPart("Site:");
  const time = findPart("Time:");
  const rate = findPart("Rate:");
  const infusionDuration = findPart("Infusion Duration:");
  const frequency = findPart("Frequency:");
  const indication = findPart("Indication:");
  const drugOnHand = findPart("Drug On Hand:");
  const expiration = findPart("Expiration:");
  const administrationHistory = findPart("Administration History:");
  const medicationName = findPart("Medication Name:");
  // (orderTitle findPart result is currently unused; the raw entry.title
  // provides the order title at the render site.)
  const dueTime = findPart("Due Time:");
  const expectedQuantity = findPart("Expected Quantity:");

  // Verification
  // (patientVerif / medVerif findPart results are currently unused;
  // administrationDetails.patientVerification / medicationVerification are
  // consumed directly further down.)

  // Education
  // (patientEd findPart result is currently unused; education state is
  // rendered from administrationDetails.education below.)
  const educationNotes = findPart("Education Notes:");

  // Clinical decision
  const clinicalDecision = findPart("Clinical Decision:");
  const reasonNotGiven = findPart("Reason for Not Given:");
  const refusalReason = findPart("Refusal Reason:");
  const inappropriateReason = findPart("Inappropriate Reason:");
  const assessmentFindings = findPart("Assessment Findings:");

  // Administration confirmation
  const administeredToPatient = findPart("Administered to Patient:");
  const properDisposal = findPart("Proper Disposal:");
  const adminNotes = findPart("Admin Notes:");

  // Reassessment
  const therapeutic = findPart("Therapeutic Response:");
  const adverse = findPart("Adverse Effects:");
  const timeElapsed = findPart("Time Elapsed:");
  const reassessmentNotes = findPart("Reassessment Notes:");
  const reassessedAtPart = findPart("Reassessed At:");

  // Status + dynamic "<Status> At:" label
  const statusPart = findPart("Status:");
  const statusValue = stripPrefix(statusPart, "Status:");
  const atRegex =
    /^(Administered At|Logged At|Missed At|Refused At|Inappropriate At|Held At):/;
  const administeredAtPart = parts.find((p) => atRegex.test(p));
  const atLabelMatch = administeredAtPart?.match(atRegex);
  const atLabel = atLabelMatch ? atLabelMatch[1] : "";
  const atValueRaw = administeredAtPart
    ? administeredAtPart.replace(atRegex, "").trim()
    : "";
  const atFormatted = atValueRaw
    ? formatAdminDate(atValueRaw) || atValueRaw
    : "";

  const note = findPart("Note:");

  // Derive Order Type
  const freqText = frequency
    ? frequency.replace("Frequency:", "").trim().toLowerCase()
    : "";
  let orderType = "";
  if (orderTypePart) {
    orderType = stripPrefix(orderTypePart, "Order Type:");
  } else if (freqText) {
    if (/\bprn\b|as needed/.test(freqText)) {
      orderType = "PRN";
    } else if (/\bstat\b|\bonce\b/.test(freqText)) {
      orderType = "STAT";
    } else {
      orderType = "Scheduled";
    }
  }

  const adminStartedMs = entry.startTimestampValue;
  const adminCompletedMs = entry.timestampValue;
  // (documentedAt derived from entry.timestamp is currently unused; the
  // simulated-time formatter renders the timestamp directly.)

  // Detect reassessment-only entry
  const isReassessmentOnly = /^\[Reassessment\]/.test(entry.details || "");

  // Get medication name for display
  const medNameVal = stripPrefix(medicationName, "Medication Name:");
  const doseVal = orderedDose ? stripPrefix(orderedDose, "Ordered Dose:") : "";
  const routeVal = route ? stripPrefix(route, "Route:") : "";
  const freqVal = frequency ? stripPrefix(frequency, "Frequency:") : "";
  const dueTimeVal = dueTime ? stripPrefix(dueTime, "Due Time:") : "";
  const indicationVal = indication
    ? stripPrefix(indication, "Indication:")
    : "";
  const drugOnHandVal = drugOnHand
    ? stripPrefix(drugOnHand, "Drug On Hand:")
    : "";
  const expirationVal = expiration
    ? stripPrefix(expiration, "Expiration:")
    : "";

  // Render slim reassessment-only card
  if (isReassessmentOnly) {
    const therapeuticVal = stripPrefix(therapeutic, "Therapeutic Response:");
    const adverseVal = stripPrefix(adverse, "Adverse Effects:");
    const timeElapsedVal = stripPrefix(timeElapsed, "Time Elapsed:");
    const reassessmentNotesVal = stripPrefix(
      reassessmentNotes,
      "Reassessment Notes:",
    );
    const reassessedAtVal = stripPrefix(reassessedAtPart, "Reassessed At:");

    return (
      <div className="mt-4 bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-violet-50 to-white border-b border-gray-200">
          <span className="text-[13px] font-bold text-gray-800">
            {tL.reassessment}
          </span>
          <div className="flex items-center gap-2">
            {orderType && (
              <StatusBadge
                status={translateOrderType(orderType)}
                variant={
                  orderType === "STAT"
                    ? "error"
                    : orderType === "PRN"
                      ? "info"
                      : "default"
                }
              />
            )}
            <StatusBadge status={tL.reassessment} variant="info" />
          </div>
        </div>

        {/* Content */}
        <div className="p-4">
          {medNameVal && (
            <p className="text-[15px] font-bold text-gray-900 mb-3">
              {medNameVal}
            </p>
          )}

          <CollapsibleSection title={tL.sections.reassessmentFindings} defaultOpen={true}>
            <div className="space-y-1">
              {hasValue(reassessedAtVal) && (
                <InfoRow
                  label={tL.rows.reassessedAt}
                  value={formatReassessmentDate(reassessedAtVal) || reassessedAtVal}
                />
              )}
              {hasValue(timeElapsedVal) && (
                <InfoRow label={tL.rows.timeElapsed} value={timeElapsedVal} />
              )}
              <InfoRow
                label={tL.rows.therapeuticResponse}
                value={
                  hasValue(therapeuticVal) ? (
                    <StatusBadge status={translateReassessmentValue(therapeuticVal)} variant="success" />
                  ) : (
                    <span className="text-gray-500 italic">{tL.notDocumented}</span>
                  )
                }
              />
              <InfoRow
                label={tL.rows.adverseEffects}
                value={
                  hasValue(adverseVal) ? (
                    <StatusBadge
                      status={translateReassessmentValue(adverseVal)}
                      variant={
                        adverseVal.toLowerCase() === "none"
                          ? "success"
                          : "warning"
                      }
                    />
                  ) : (
                    <span className="text-gray-500 italic">{tL.notDocumented}</span>
                  )
                }
              />
              {hasValue(reassessmentNotesVal) && (
                <InfoRow label={tL.rows.notes} value={reassessmentNotesVal} />
              )}
            </div>
          </CollapsibleSection>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-4 py-3 bg-gradient-to-r from-violet-50 to-white border-b border-gray-200">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-bold text-gray-800">
            {tL.medicationAdministration}
          </span>
          <div className="flex items-center gap-2">
            {orderType && (
              <StatusBadge
                status={translateOrderType(orderType)}
                variant={
                  orderType === "STAT"
                    ? "error"
                    : orderType === "PRN"
                      ? "info"
                      : "default"
                }
              />
            )}
            {/* Status badge intentionally omitted here to match HS-online:
                the medication status (Held / Refused / Administered / …)
                is already surfaced in the outer wrapper header alongside
                the medication name, so rendering it again inside the
                "Administración de Medicamentos" row is a duplicate. */}
          </div>
        </div>
        {/* Timing info row */}
        {(adminStartedMs || entry.duration) && (
          <div className="flex items-center gap-4 mt-2 text-[10px] text-gray-500">
            {adminStartedMs && (
              <span>{tL.rows.started}: {formatReassessmentDate(adminStartedMs)}</span>
            )}
            {entry.duration && (
              <span>{tL.rows.duration}: {formatDurationLabel(entry.duration)}</span>
            )}
          </div>
        )}
      </div>

      {/* Medication Title */}
      <div className="px-4 pt-4 pb-2">
        {/* Show medication name as main title */}
        {medNameVal && (
          <h3 className="text-[16px] font-bold text-gray-900 mb-3">
            {medNameVal}
          </h3>
        )}
        {/* NOTE: The order-title subtitle ("Order: …") was removed here so
            this card matches the HS-online reference layout. The order
            title is already shown in the card header above. */}

        {/* Info chips row */}
        <div className="flex flex-wrap gap-2 mb-3">
          {dueTimeVal && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-semibold bg-sky-50 text-sky-700 border border-sky-200">
              {tL.due} {dueTimeVal}
            </span>
          )}
          {doseVal && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-semibold bg-violet-50 text-violet-700 border border-violet-200">
              {tL.dose} {doseVal}
            </span>
          )}
          {routeVal && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-semibold bg-violet-50 text-violet-700 border border-violet-200">
              {tL.route} {routeVal}
            </span>
          )}
          {freqVal && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-semibold bg-violet-50 text-violet-700 border border-violet-200">
              {tL.freq} {freqVal}
            </span>
          )}
        </div>

        {/* Info grid */}
        {(indicationVal || drugOnHandVal || expirationVal) && (
          <div className="grid grid-cols-2 gap-4 py-2 border-t border-gray-100">
            {indicationVal && (
              <div>
                <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">
                  {tL.indication}
                </p>
                <p className="text-[12px] text-gray-800 font-semibold">
                  {indicationVal}
                </p>
              </div>
            )}
            {drugOnHandVal && (
              <div>
                <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">
                  {tL.drugOnHand}
                </p>
                <p className="text-[12px] text-gray-800 font-semibold">
                  {drugOnHandVal}
                </p>
              </div>
            )}
            {expirationVal &&
              (() => {
                const isExpired = expirationVal
                  .toLowerCase()
                  .startsWith("expired");
                return (
                  <div>
                    <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">
                      {tL.drugExpiration}
                    </p>
                    <StatusBadge
                      status={isExpired ? tL.expired : tL.notExpired}
                      variant={isExpired ? "error" : "success"}
                    />
                  </div>
                );
              })()}
          </div>
        )}
      </div>

      {/* Collapsible Sections */}
      <div className="px-4">
        {/* NOTE: The "Overall Grading Score" card and the raw "Documentation
            Snippets" collapsible were intentionally removed so this
            medication card matches the HS-online reference layout. The
            grading data is still surfaced through the Verification Checklist
            / Clinical Decision / Administration Details sections below. */}
        {/* 24-Hour Administration History */}
        {administrationHistory &&
          (() => {
            const historyVal = stripPrefix(
              administrationHistory,
              "Administration History:",
            );
            if (!hasValue(historyVal)) {
              return null;
            }
            const historyItems = historyVal
              .split(";")
              .map((s) => s.trim())
              .filter(Boolean);
            return (
              <CollapsibleSection
                title={tL.sections.adminHistory24h}
                defaultOpen={false}
              >
                <div className="space-y-1.5">
                  {historyItems.map((item, i) => {
                    const match = item.match(/^(.+?)\s*\(([^)]+)\)$/);
                    const time = match ? match[1].trim() : item;
                    const status = match ? match[2].trim() : "";
                    return (
                      <div
                        key={i}
                        className="flex items-center justify-between py-1"
                      >
                        <span className="text-[12px] font-semibold text-blue-700">
                          {time}
                        </span>
                        {status && (
                          <StatusBadge
                            status={translateStatusValue(status)}
                            variant={
                              status.toLowerCase() === "administered"
                                ? "success"
                                : "warning"
                            }
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </CollapsibleSection>
            );
          })()}

        {/* Verification Checklist - always renders with Expected/Documented
            layout so ungraded medications display consistently. */}
        {(() => {
          const studentVerifItemsFromGrading =
            gradingResult?.verificationResult?.actual ?? [];

          // Fall back to legacy booleans when checklist IDs were not captured.
          const studentVerifItemsFromBooleans: string[] = [];
          if (adminDetails?.patientVerification?.nameChecked) {
            studentVerifItemsFromBooleans.push("name_checked");
          }
          if (adminDetails?.patientVerification?.dobChecked) {
            studentVerifItemsFromBooleans.push("dob_checked");
          }
          if (adminDetails?.patientVerification?.wristbandChecked) {
            studentVerifItemsFromBooleans.push("scanned_id");
          }
          if (adminDetails?.medicationVerification?.nameVerified) {
            studentVerifItemsFromBooleans.push("medication_name");
          }
          if (adminDetails?.medicationVerification?.expiryChecked) {
            studentVerifItemsFromBooleans.push("expiration_date");
          }
          if (adminDetails?.medicationVerification?.allergiesVerified) {
            studentVerifItemsFromBooleans.push(
              "no_allergies_contraindications",
            );
          }
          if (adminDetails?.medicationVerification?.indicationConfirmed) {
            studentVerifItemsFromBooleans.push("strength_concentration");
          }

          const studentVerifItems =
            studentVerifItemsFromGrading.length > 0
              ? studentVerifItemsFromGrading
              : studentVerifItemsFromBooleans;
          if (gradingResult?.verificationResult) {
            return (
              <CollapsibleSection
                title={tL.sections.verificationChecklist}
                defaultOpen={hasGrading}
              >
                <ChecklistGradingDisplay
                  title={tL.subsections.medicationVerification}
                  result={gradingResult.verificationResult}
                  studentItems={studentVerifItems}
                  kind="verification"
                />
              </CollapsibleSection>
            );
          }
          // Neutral fallback when there is no grading config: still show the
          // Expected/Documented layout with "—" for missing expected.
          return (
            <CollapsibleSection title={tL.sections.verificationChecklist} defaultOpen>
              <ChecklistGradingDisplay
                title={tL.subsections.medicationVerification}
                result={{
                  expected: [],
                  actual: studentVerifItems,
                  matched: [],
                  missing: [],
                  isCorrect: false,
                }}
                studentItems={studentVerifItems}
                neutral
                kind="verification"
              />
            </CollapsibleSection>
          );
        })()}

        {/* Clinical Decision - always renders with Expected/Documented
            layout so ungraded medications display consistently. */}
        {(() => {
          const comparison = getGradingComparison("Clinical Decision");
          const decisionVal = clinicalDecision
            ? stripPrefix(clinicalDecision, "Clinical Decision:")
            : "";
          const rawDocumented = decisionVal || statusValue || "";
          const normalizedDoc = rawDocumented.toLowerCase().trim();
          const documented =
            normalizedDoc === "hold"
              ? "Held"
              : normalizedDoc === "refuse"
                ? "Refused"
                : rawDocumented || undefined;
          const reasonNotGivenVal = stripPrefix(
            reasonNotGiven,
            "Reason for Not Given:",
          );
          const refusalReasonVal = stripPrefix(
            refusalReason,
            "Refusal Reason:",
          );
          const inappropriateReasonVal = stripPrefix(
            inappropriateReason,
            "Inappropriate Reason:",
          );
          const assessmentFindingsVal = stripPrefix(
            assessmentFindings,
            "Assessment Findings:",
          );
          const noteVal = stripPrefix(note, "Note:");
          return (
            <CollapsibleSection
              title={tL.sections.clinicalDecision}
              defaultOpen={
                (hasGrading && !!comparison) ||
                !!(statusValue && statusValue !== "Administered")
              }
            >
              <div className="space-y-1">
                {comparison ? (
                  <GradingComparisonRow
                    label={tL.rows.clinicalDecision}
                    expected={translateClinicalDecisionValue(comparison.expected)}
                    actual={translateClinicalDecisionValue(comparison.actual)}
                    isCorrect={comparison.isCorrect}
                  />
                ) : (
                  <GradingComparisonRow
                    label={tL.rows.clinicalDecision}
                    expected={undefined}
                    actual={translateClinicalDecisionValue(documented)}
                    isCorrect={null}
                  />
                )}
                {hasValue(assessmentFindingsVal) && (
                  <InfoRow
                    label={tL.rows.assessmentFindings}
                    value={assessmentFindingsVal}
                  />
                )}
                {hasValue(reasonNotGivenVal) && (
                  <InfoRow label={tL.rows.reason} value={reasonNotGivenVal} />
                )}
                {hasValue(refusalReasonVal) && (
                  <InfoRow label={tL.rows.refusalReason} value={refusalReasonVal} />
                )}
                {hasValue(inappropriateReasonVal) && (
                  <InfoRow
                    label={tL.rows.inappropriateReason}
                    value={inappropriateReasonVal}
                  />
                )}
                {hasValue(noteVal) && <InfoRow label={tL.rows.note} value={noteVal} />}
              </div>
            </CollapsibleSection>
          );
        })()}

        {/* Administration Details - always renders Expected/Documented
            comparison rows; missing values fall back to "—". */}
        {(() => {
          // If the medication was not administered (Held/Refused/Inappropriate/Missed)
          // and the clinical decision was graded correctly, gray out all admin detail
          // rows — they are irrelevant and should not show as Unsatisfactory.
          const nonAdminStatuses = [
            "held",
            "refused",
            "inappropriate",
            "missed",
          ];
          const isNonAdministered = nonAdminStatuses.includes(
            (statusValue || "").toLowerCase(),
          );
          const clinicalDecisionComp =
            getGradingComparison("Clinical Decision");
          const clinicalDecisionCorrect =
            clinicalDecisionComp?.isCorrect === true;
          // Force neutral when not administered + clinical decision correct
          const forceNeutralAdminRows =
            isNonAdministered && clinicalDecisionCorrect;

          const doseComp = getGradingComparison("Dose");
          const qtyComp = getGradingComparison("Quantity");
          const routeComp = getGradingComparison("Route");
          // Check for combined "Route vs Site" first
          const combinedRouteSiteComp = getGradingComparison("Route vs Site");
          // Site is supplemental documentation only (not graded)
          const siteComp = getGradingComparison("Site");
          const timeComp = getGradingComparison("Administration Time");
          const infusionRateComp = getGradingComparison("Infusion Rate");
          const rateComp = getGradingComparison("Rate");
          const durationComp = getGradingComparison("Duration");

          const administeredDoseVal = stripPrefix(
            administeredDose,
            "Administered Dose:",
          );
          const quantityVal = stripPrefix(quantity, "Quantity:");
          const expectedQuantityVal = stripPrefix(
            expectedQuantity,
            "Expected Quantity:",
          );
          const siteVal = stripPrefix(site, "Site:");
          const timeVal = stripPrefix(time, "Time:");
          const rateVal = stripPrefix(rate, "Rate:");
          const infusionDurationVal = stripPrefix(
            infusionDuration,
            "Infusion Duration:",
          );
          // Hide a row only when BOTH expected and documented are missing.
          const hasAny = (v: string | string[] | undefined): boolean => {
            if (v === undefined || v === null) {
              return false;
            }
            if (Array.isArray(v)) {
              return v.length > 0;
            }
            return String(v).trim().length > 0;
          };

          const rows: {
            label: string;
            expected: string | string[] | undefined;
            actual: string | string[] | undefined;
            isCorrect: boolean | null;
            confidence?: number;
            explanation?: string;
          }[] = [
            {
              label: tL.rows.dose,
              expected: doseComp ? doseComp.expected : undefined,
              actual: doseComp
                ? doseComp.actual
                : hasValue(administeredDoseVal)
                  ? administeredDoseVal
                  : undefined,
              isCorrect: forceNeutralAdminRows
                ? null
                : doseComp
                  ? doseComp.isCorrect
                  : null,
            },
            {
              label: tL.rows.amount,
              expected: qtyComp
                ? qtyComp.expected
                : hasValue(expectedQuantityVal)
                  ? expectedQuantityVal
                  : undefined,
              actual: qtyComp
                ? qtyComp.actual
                : hasValue(quantityVal)
                  ? quantityVal
                  : undefined,
              isCorrect: forceNeutralAdminRows
                ? null
                : qtyComp
                  ? qtyComp.isCorrect
                  : null,
            },
            // Route vs Site - single combined row.
            // Uses the "Route vs Site" comparison from the popup (which already
            // combines Route + Site into one LLM-graded entry).
            // Falls back to individual Route/Site comparisons for legacy
            // records, then to raw documented values as a last resort.
            ...(combinedRouteSiteComp ||
            routeComp ||
            siteComp ||
            hasValue(routeVal) ||
            hasValue(siteVal)
              ? [
                  (() => {
                    const expectedRoute = combinedRouteSiteComp
                      ? combinedRouteSiteComp.expected
                      : routeComp
                        ? routeComp.expected
                        : undefined;
                    const documentedRoute = combinedRouteSiteComp
                      ? combinedRouteSiteComp.actual
                      : routeComp
                        ? routeComp.actual
                        : hasValue(routeVal)
                          ? routeVal
                          : undefined;
                    const documentedSite = siteComp
                      ? siteComp.actual
                      : hasValue(siteVal)
                        ? siteVal
                        : undefined;
                    // Build a single "Route (Site)" string when both exist;
                    // the popup snapshot may already be in this format.
                    let combinedDocumented: string | string[] | undefined =
                      documentedRoute;
                    if (
                      documentedSite &&
                      typeof documentedRoute === "string" &&
                      !documentedRoute.includes("(")
                    ) {
                      combinedDocumented = `${documentedRoute} (${String(
                        documentedSite,
                      )})`;
                    } else if (!documentedRoute && documentedSite) {
                      combinedDocumented = String(documentedSite);
                    }
                    return {
                      label: tL.rows.routeVsSite,
                      expected: expectedRoute,
                      actual: combinedDocumented,
                      isCorrect: forceNeutralAdminRows
                        ? null
                        : combinedRouteSiteComp
                          ? combinedRouteSiteComp.isCorrect
                          : routeComp
                            ? routeComp.isCorrect
                            : null,
                      // Confidence/explanation intentionally omitted to keep
                      // the row clean. The Satisfactory/Unsatisfactory badge
                      // already conveys the LLM grading result.
                    };
                  })(),
                ]
              : []),
            {
              label: tL.rows.administrationTime,
              expected: timeComp ? timeComp.expected : undefined,
              actual: timeComp
                ? timeComp.actual
                : hasValue(timeVal)
                  ? timeVal
                  : undefined,
              isCorrect: forceNeutralAdminRows
                ? null
                : timeComp
                  ? timeComp.isCorrect
                  : null,
            },
            {
              label: tL.rows.rate,
              expected: infusionRateComp
                ? infusionRateComp.expected
                : rateComp
                  ? rateComp.expected
                  : undefined,
              actual: infusionRateComp
                ? infusionRateComp.actual
                : rateComp
                  ? rateComp.actual
                  : hasValue(rateVal)
                    ? rateVal
                    : undefined,
              isCorrect: forceNeutralAdminRows
                ? null
                : infusionRateComp
                  ? infusionRateComp.isCorrect
                  : rateComp
                    ? rateComp.isCorrect
                    : null,
            },
            (() => {
              const durActual = durationComp
                ? durationComp.actual
                : hasValue(infusionDurationVal)
                  ? infusionDurationVal
                  : undefined;
              return {
                label: tL.rows.duration,
                expected: hasAny(durActual)
                  ? durationComp
                    ? durationComp.expected
                    : undefined
                  : undefined,
                actual: durActual,
                isCorrect: forceNeutralAdminRows
                  ? null
                  : durationComp
                    ? durationComp.isCorrect
                    : null,
              };
            })(),
          ];

          const visibleRows = rows.filter(
            (r) => hasAny(r.expected) || hasAny(r.actual),
          );

          if (visibleRows.length === 0) {
            return null;
          }

          return (
            <CollapsibleSection
              title={tL.sections.administrationDetails}
              defaultOpen={hasGrading}
            >
              <div className="space-y-1">
                {visibleRows.map((r) => (
                  <GradingComparisonRow
                    key={r.label}
                    label={r.label}
                    expected={r.expected}
                    actual={r.actual}
                    isCorrect={r.isCorrect}
                    confidence={r.confidence}
                    explanation={r.explanation}
                  />
                ))}
              </div>
            </CollapsibleSection>
          );
        })()}

        {/* Patient Education - always renders with Expected/Documented
            layout so ungraded medications display consistently. */}
        {(() => {
          const eduNotesVal = educationNotes
            ? stripPrefix(educationNotes, "Education Notes:")
            : "";
          const hasNotes = hasValue(eduNotesVal);
          const studentEduItems = adminDetails?.patientEducation
            ? ([
                adminDetails.patientEducation.discussedPurpose &&
                  "Purpose Discussed",
                adminDetails.patientEducation.reviewedSideEffects &&
                  "Side Effects Reviewed",
                adminDetails.patientEducation.providedInstructions &&
                  "Instructions Provided",
                adminDetails.patientEducation.answeredQuestions &&
                  "Questions Answered",
                adminDetails.patientEducation.patientUnderstanding &&
                  "Patient Understanding",
              ].filter(Boolean) as string[])
            : [];
          const hasEducationGrading = !!gradingResult?.educationResult;
          return (
            <CollapsibleSection
              title={tL.sections.patientEducation}
              defaultOpen={hasEducationGrading}
            >
              {hasEducationGrading && gradingResult?.educationResult ? (
                <ChecklistGradingDisplay
                  title={tL.subsections.patientEducation}
                  result={gradingResult.educationResult}
                  studentItems={studentEduItems}
                />
              ) : (
                <ChecklistGradingDisplay
                  title={tL.subsections.patientEducation}
                  result={{
                    expected: [],
                    actual: studentEduItems,
                    matched: [],
                    missing: [],
                    isCorrect: false,
                  }}
                  studentItems={studentEduItems}
                  neutral
                />
              )}
              {hasNotes && (
                <InfoRow label={tL.rows.educationalNotes} value={eduNotesVal} />
              )}
            </CollapsibleSection>
          );
        })()}

        {/* Administration Confirmation */}
        {(administeredToPatient || properDisposal || adminNotes) && (
          <CollapsibleSection
            title={tL.sections.administrationConfirmation}
            defaultOpen={false}
          >
            <div className="space-y-1">
              {administeredToPatient &&
                (() => {
                  const val = stripPrefix(
                    administeredToPatient,
                    "Administered to Patient:",
                  );
                  const yes = /^yes$/i.test(val);
                  return (
                    <div className="flex items-center gap-2 py-1.5">
                      <div
                        className={`w-5 h-5 rounded-full flex items-center justify-center ${yes ? "bg-emerald-100" : "bg-gray-100"}`}
                      >
                        {yes ? (
                          <Check className="w-3 h-3 text-emerald-600" />
                        ) : (
                          <X className="w-3 h-3 text-gray-500" />
                        )}
                      </div>
                      <span className="text-[12px] text-gray-700 font-medium">
                        {tL.rows.administeredToPatient}
                      </span>
                    </div>
                  );
                })()}
              {properDisposal &&
                (() => {
                  const val = stripPrefix(properDisposal, "Proper Disposal:");
                  const yes = /^yes$/i.test(val);
                  return (
                    <div className="flex items-center gap-2 py-1.5">
                      <div
                        className={`w-5 h-5 rounded-full flex items-center justify-center ${yes ? "bg-emerald-100" : "bg-gray-100"}`}
                      >
                        {yes ? (
                          <Check className="w-3 h-3 text-emerald-600" />
                        ) : (
                          <X className="w-3 h-3 text-gray-500" />
                        )}
                      </div>
                      <span className="text-[12px] text-gray-700 font-medium">
                        {tL.rows.properDisposalConfirmed}
                      </span>
                    </div>
                  );
                })()}
              {adminNotes &&
                hasValue(stripPrefix(adminNotes, "Admin Notes:")) && (
                  <InfoRow
                    label={tL.rows.notes}
                    value={stripPrefix(adminNotes, "Admin Notes:")}
                  />
                )}
            </div>
          </CollapsibleSection>
        )}

        {/* Administration Timing */}
        {(adminStartedMs ||
          adminCompletedMs ||
          administeredAtPart ||
          time ||
          entry.duration) && (
          <CollapsibleSection title={tL.sections.administrationTiming} defaultOpen={false}>
            <div className="space-y-1">
              {adminStartedMs && (
                <InfoRow
                  label={tL.rows.started}
                  value={formatReassessmentDate(adminStartedMs)}
                />
              )}
              {administeredAtPart && atFormatted ? (
                <InfoRow
                  label={translateAtLabel(atLabel)}
                  value={formatReassessmentDate(atValueRaw) || atFormatted}
                />
              ) : (
                adminCompletedMs && (
                  <InfoRow
                    label={
                      statusValue && statusValue !== "Administered"
                        ? `${translateStatusValue(statusValue)} ${language === "es" ? "a las" : "at"}`
                        : tL.rows.administeredAt
                    }
                    value={formatReassessmentDate(adminCompletedMs)}
                  />
                )
              )}
              {time && (
                <InfoRow
                  label={tL.rows.documentedAtSimTime}
                  value={stripPrefix(time, "Time:")}
                />
              )}
              {entry.duration && (
                <InfoRow
                  label={tL.rows.duration}
                  value={formatDurationLabel(entry.duration)}
                />
              )}
            </div>
          </CollapsibleSection>
        )}

        {/* Reassessment */}
        {(() => {
          const therapeuticVal = stripPrefix(
            therapeutic,
            "Therapeutic Response:",
          );
          const adverseVal = stripPrefix(adverse, "Adverse Effects:");
          const timeElapsedVal = stripPrefix(timeElapsed, "Time Elapsed:");
          const reassessmentNotesVal = stripPrefix(
            reassessmentNotes,
            "Reassessment Notes:",
          );
          const reassessedAtVal = stripPrefix(
            reassessedAtPart,
            "Reassessed At:",
          );
          const hasReassessmentData =
            therapeutic ||
            adverse ||
            hasValue(timeElapsedVal) ||
            hasValue(reassessmentNotesVal) ||
            hasValue(reassessedAtVal);
          if (!hasReassessmentData) {
            return null;
          }

          return (
            <CollapsibleSection
              title={tL.sections.reassessmentFindings}
              defaultOpen={false}
            >
              <div className="space-y-1">
                {hasValue(reassessedAtVal) && (
                  <InfoRow
                    label={tL.rows.reassessedAt}
                    value={formatReassessmentDate(reassessedAtVal) || reassessedAtVal}
                  />
                )}
                {hasValue(timeElapsedVal) && (
                  <InfoRow label={tL.rows.timeElapsed} value={timeElapsedVal} />
                )}
                <InfoRow
                  label={tL.rows.therapeuticResponse}
                  value={
                    hasValue(therapeuticVal) ? (
                      <StatusBadge status={translateReassessmentValue(therapeuticVal)} variant="success" />
                    ) : (
                      <span className="text-gray-500 italic">
                        {tL.notDocumented}
                      </span>
                    )
                  }
                />
                <InfoRow
                  label={tL.rows.adverseEffects}
                  value={
                    hasValue(adverseVal) ? (
                      <StatusBadge
                        status={translateReassessmentValue(adverseVal)}
                        variant={
                          adverseVal.toLowerCase() === "none"
                            ? "success"
                            : "warning"
                        }
                      />
                    ) : (
                      <span className="text-gray-500 italic">
                        {tL.notDocumented}
                      </span>
                    )
                  }
                />
                {hasValue(reassessmentNotesVal) && (
                  <InfoRow label={tL.rows.notes} value={reassessmentNotesVal} />
                )}
              </div>
            </CollapsibleSection>
          );
        })()}

        {/* Final Medication Status - always renders Expected/Documented
            layout so ungraded medications display consistently. */}
        {(() => {
          const comparison = getGradingComparison("Final Status");
          const translateVal = (
            v: string | string[] | undefined,
          ): string | string[] | undefined => {
            if (v === undefined) return undefined;
            if (Array.isArray(v)) return v.map((x) => translateStatusValue(x));
            return translateStatusValue(v);
          };
          return (
            <CollapsibleSection
              title={tL.sections.finalMedicationStatus}
              defaultOpen={hasGrading && !!comparison}
            >
              <GradingComparisonRow
                label={tL.rows.finalStatus}
                expected={translateVal(
                  comparison ? comparison.expected : undefined,
                )}
                actual={translateVal(
                  comparison
                    ? comparison.actual
                    : statusValue
                      ? statusValue
                      : undefined,
                )}
                isCorrect={comparison ? comparison.isCorrect : null}
              />
            </CollapsibleSection>
          );
        })()}
      </div>

      {/* Bottom padding */}
      <div className="h-2" />
    </div>
  );
}
