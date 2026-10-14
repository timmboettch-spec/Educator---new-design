import { ChevronDown, ChevronRight, Check, X } from 'lucide-react';
import React, { useState } from 'react';

import SharedStatusBadge from '../ui/StatusBadge';

// ─── Verification items (source of truth for labels/order) ────────────────────
const VERIFICATION_ITEMS = [
  { id: 'name_checked', label: 'Asked patient to state their full name' },
  { id: 'dob_checked', label: 'Asked patient to state their date of birth' },
  { id: 'scanned_id', label: 'Scanned/checked patient wristband' },
  { id: 'medication_name', label: 'Verified medication name' },
  { id: 'expiration_date', label: 'Verified medication is not expired' },
  {
    id: 'no_allergies_contraindications',
    label: 'Verified absence of allergies or contraindications',
  },
  {
    id: 'strength_concentration',
    label: 'Verified medication strength/concentration',
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// INTERFACES
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
export interface MedicationTranscriptEntry {
  details?: string;
  timestamp?: string;
  timestampValue?: number;
  startTimestampValue?: number;
  duration?: number;
  administrationDetails?: AdministrationDetails;
  [key: string]: unknown;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════
const formatDurationLabel = (s: number) => {
  const v = Math.max(0, Math.round(s));
  if (v < 60) return `${v}s`;
  const m = Math.floor(v / 60);
  const r = v % 60;
  return r > 0 ? `${m}m ${r}s` : `${m}m`;
};
const formatAdminDate = (value: number | string | undefined): string => {
  if (value === undefined || value === null || value === '') return '';
  const d =
    typeof value === 'number' ? new Date(value) : new Date(value as string);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
};
const stripPrefix = (raw: string | undefined, prefix: string): string => {
  if (!raw) return '';
  return raw.replace(new RegExp(`^${prefix}\\s*`), '').trim();
};
const hasValue = (raw: string | undefined): boolean => {
  if (!raw) return false;
  const v = raw.trim();
  return v.length > 0 && !/^-+$/.test(v) && v.toLowerCase() !== 'n/a';
};
const hasAny = (v: string | string[] | undefined): boolean => {
  if (v === undefined || v === null) return false;
  if (Array.isArray(v)) return v.length > 0;
  return String(v).trim().length > 0;
};
const toTitleCase = (s: string) =>
  s
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());

// ─── Checklist maps ────────────────────────────────────────────────────────────
const EDUCATION_LABEL_MAP: Record<string, string> = {
  purpose_indication: 'Purpose Discussed',
  purpose_discussed: 'Purpose Discussed',
  discussed_purpose: 'Purpose Discussed',
  side_effects: 'Side Effects Reviewed',
  side_effects_reviewed: 'Side Effects Reviewed',
  reviewed_side_effects: 'Side Effects Reviewed',
  instructions: 'Instructions Provided',
  instructions_provided: 'Instructions Provided',
  provided_instructions: 'Instructions Provided',
  answered_questions: 'Questions Answered',
  questions_answered: 'Questions Answered',
  verbalized_understanding: 'Patient Understanding',
  patient_understanding: 'Patient Understanding',
};
const EDUCATION_ORDER = [
  'Purpose Discussed',
  'Side Effects Reviewed',
  'Instructions Provided',
  'Questions Answered',
  'Patient Understanding',
];

const VERIFICATION_LABEL_MAP: Record<string, string> = {
  ...Object.fromEntries(VERIFICATION_ITEMS.map((i) => [i.id, i.label])),
  name_checked: 'Asked patient to state their full name',
  dob_checked: 'Asked patient to state their date of birth',
  date_of_birth: 'Asked patient to state their date of birth',
  scanned_id: 'Scanned/checked patient wristband',
  wristband_checked: 'Scanned/checked patient wristband',
  medication_name: 'Verified medication name',
  name_verified: 'Verified medication name',
  patient_name: 'Verified medication name',
  expiration_date: 'Verified medication is not expired',
  expiry_check: 'Verified medication is not expired',
  expiry_checked: 'Verified medication is not expired',
  no_allergies_contraindications:
    'Verified absence of allergies or contraindications',
  allergies_verified: 'Verified absence of allergies or contraindications',
  allergies_checked: 'Verified absence of allergies or contraindications',
  strength_concentration: 'Verified medication strength/concentration',
  indication_confirmed: 'Verified medication strength/concentration',
  indication_verified: 'Verified medication strength/concentration',
};
const VERIFICATION_ORDER = VERIFICATION_ITEMS.map((i) => i.label);

const normalizeChecklistList = (
  items: string[],
  map: Record<string, string>,
  order: string[]
): string[] => {
  const normalized = items.map((i) => {
    const k = i.toLowerCase().trim();
    return map[k] ?? toTitleCase(i);
  });
  const seen = new Set<string>();
  const deduped = normalized.filter((v) => {
    if (seen.has(v)) return false;
    seen.add(v);
    return true;
  });
  const indexOf = (s: string) => {
    const i = order.indexOf(s);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  return [...deduped].sort((a, b) => indexOf(a) - indexOf(b));
};

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════
function CollapsibleSection({
  title,
  defaultOpen = true,
  children,
  badge,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  badge?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-gray-200">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-3 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {open ? (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-400" />
          )}
          <span className="text-[12px] font-bold text-gray-700 uppercase tracking-wider">
            {title}
          </span>
        </div>
        {badge}
      </button>
      {open && <div className="pb-3 pl-6">{children}</div>}
    </div>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string | React.ReactNode;
}) {
  return (
    <div className="flex justify-between items-start py-1.5">
      <span className="text-[12px] text-gray-500 font-medium">{label}</span>
      <span className="text-[12px] text-gray-800 font-semibold text-right">
        {value}
      </span>
    </div>
  );
}

const STATUS_VARIANT_TO_TONE: Record<
  'success' | 'warning' | 'error' | 'info' | 'default',
  'success' | 'warning' | 'danger' | 'info' | 'neutral'
> = {
  success: 'success',
  warning: 'warning',
  error: 'danger',
  info: 'info',
  default: 'neutral',
};

function StatusBadge({
  status,
  variant = 'default',
}: {
  status: string;
  variant?: 'success' | 'warning' | 'error' | 'info' | 'default';
}) {
  return (
    <SharedStatusBadge tone={STATUS_VARIANT_TO_TONE[variant]} label={status} />
  );
}

function GradingResultBadge({ isCorrect }: { isCorrect: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${isCorrect ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-rose-100 text-rose-700 border border-rose-200'}`}
    >
      {isCorrect ? (
        <>
          <Check className="w-3 h-3" /> Satisfactory
        </>
      ) : (
        <>
          <X className="w-3 h-3" /> Unsatisfactory
        </>
      )}
    </span>
  );
}

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
  const fmt = (val: string | string[] | undefined): string => {
    if (val === undefined || val === null) return '—';
    if (Array.isArray(val)) return val.length === 0 ? '—' : val.join(' or ');
    const t = String(val).trim();
    return t.length === 0 ? '—' : t;
  };
  const neutral = isCorrect === null;
  const containerCls = neutral
    ? 'bg-gray-50 border border-gray-200'
    : isCorrect
      ? 'bg-emerald-50 border border-emerald-100'
      : 'bg-rose-50 border border-rose-100';
  const expCls = neutral
    ? 'text-gray-700'
    : isCorrect
      ? 'text-emerald-700'
      : 'text-gray-700';
  const actCls = neutral
    ? 'text-gray-700'
    : isCorrect
      ? 'text-emerald-700'
      : 'text-rose-700';
  return (
    <div className={`rounded-lg p-3 mb-2 ${containerCls}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[12px] font-bold text-gray-700">{label}</span>
        {!neutral && <GradingResultBadge isCorrect={isCorrect} />}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider mb-1">
            Expected
          </p>
          <p className={`text-[12px] font-semibold ${expCls}`}>
            {fmt(expected)}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider mb-1">
            Documented
          </p>
          <p className={`text-[12px] font-semibold ${actCls}`}>{fmt(actual)}</p>
        </div>
      </div>
      {(typeof confidence === 'number' || explanation) && (
        <div className="mt-2 pt-2 border-t border-gray-200">
          {typeof confidence === 'number' && (
            <p className="text-[10px] text-gray-500">
              Confidence:{' '}
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

function ChecklistGradingDisplay({
  title,
  result,
  studentItems,
  neutral = false,
  kind = 'education',
}: {
  title: string;
  result: ChecklistGradingResult;
  studentItems?: string[];
  neutral?: boolean;
  kind?: 'education' | 'verification';
}) {
  const labelMap =
    kind === 'verification' ? VERIFICATION_LABEL_MAP : EDUCATION_LABEL_MAP;
  const order = kind === 'verification' ? VERIFICATION_ORDER : EDUCATION_ORDER;
  const expectedDisplay = normalizeChecklistList(
    result.expected,
    labelMap,
    order
  );
  const documentedDisplay = normalizeChecklistList(
    studentItems ?? result.actual,
    labelMap,
    order
  );
  const expectedSet = new Set(expectedDisplay.map((v) => v.toLowerCase()));
  const documentedSet = new Set(documentedDisplay.map((v) => v.toLowerCase()));
  const allExpectedDocumented =
    expectedSet.size === 0 ||
    Array.from(expectedSet).every((i) => documentedSet.has(i));
  const displayIsCorrect =
    expectedSet.size > 0 ? allExpectedDocumented : result.isCorrect;
  const containerCls = neutral
    ? 'bg-gray-50 border border-gray-200'
    : displayIsCorrect
      ? 'bg-emerald-50 border border-emerald-100'
      : 'bg-rose-50 border border-rose-100';
  return (
    <div className={`rounded-lg p-3 mb-2 ${containerCls}`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[12px] font-bold text-gray-700">{title}</span>
        {!neutral && <GradingResultBadge isCorrect={displayIsCorrect} />}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider mb-2 pb-1 border-b border-gray-200">
            Expected
          </p>
          <div className="space-y-1">
            {expectedDisplay.length === 0 ? (
              <span className="text-[11px] text-gray-400 italic">—</span>
            ) : (
              expectedDisplay.map((item, i) => (
                <div key={i} className="flex items-center gap-1.5 py-0.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                  <span className="text-[11px] text-gray-700">{item}</span>
                </div>
              ))
            )}
          </div>
        </div>
        <div>
          <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider mb-2 pb-1 border-b border-gray-200">
            Documented
          </p>
          <div className="space-y-1">
            {documentedDisplay.length === 0 ? (
              <span className="text-[11px] text-gray-400 italic">—</span>
            ) : (
              documentedDisplay.map((item, i) => (
                <div key={i} className="flex items-center gap-1.5 py-0.5">
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

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
export default function MedicationTranscriptCard({
  entry,
}: {
  entry: MedicationTranscriptEntry;
}) {
  if (!entry?.details) return null;

  const parts = entry.details
    .split(' | ')
    .map((s) => s.trim())
    .filter(Boolean);
  const findPart = (prefix: string) =>
    parts.find((p) => p.toLowerCase().startsWith(prefix.toLowerCase()));

  const adminDetails = entry.administrationDetails;
  const gradingResult = adminDetails?.gradingResult;
  const hasGrading = !!gradingResult && gradingResult.comparisons.length > 0;
  const getComp = (field: string) =>
    gradingResult?.comparisons.find(
      (c) => c.field.toLowerCase() === field.toLowerCase()
    );

  const orderTypePart = findPart('Order Type:');
  const orderedDose = findPart('Ordered Dose:');
  const administeredDose = findPart('Administered Dose:');
  const quantity = findPart('Quantity:');
  const route = findPart('Route:');
  const site = findPart('Site:');
  const time = findPart('Time:');
  const rate = findPart('Rate:');
  const infusionDuration = findPart('Infusion Duration:');
  const frequency = findPart('Frequency:');
  const indication = findPart('Indication:');
  const drugOnHand = findPart('Drug On Hand:');
  const expiration = findPart('Expiration:');
  const administrationHistory = findPart('Administration History:');
  const medicationName = findPart('Medication Name:');
  const dueTime = findPart('Due Time:');
  const expectedQuantity = findPart('Expected Quantity:');
  const educationNotes = findPart('Education Notes:');
  const clinicalDecision = findPart('Clinical Decision:');
  const reasonNotGiven = findPart('Reason for Not Given:');
  const refusalReason = findPart('Refusal Reason:');
  const inappropriateReason = findPart('Inappropriate Reason:');
  const assessmentFindings = findPart('Assessment Findings:');
  const administeredToPatient = findPart('Administered to Patient:');
  const properDisposal = findPart('Proper Disposal:');
  const adminNotes = findPart('Admin Notes:');
  const therapeutic = findPart('Therapeutic Response:');
  const adverse = findPart('Adverse Effects:');
  const timeElapsed = findPart('Time Elapsed:');
  const reassessmentNotes = findPart('Reassessment Notes:');
  const reassessedAtPart = findPart('Reassessed At:');
  const statusPart = findPart('Status:');
  const statusValue = stripPrefix(statusPart, 'Status:');

  const atRegex =
    /^(Administered At|Logged At|Missed At|Refused At|Inappropriate At|Held At):/;
  const administeredAtPart = parts.find((p) => atRegex.test(p));
  const atLabelMatch = administeredAtPart?.match(atRegex);
  const atLabel = atLabelMatch ? atLabelMatch[1] : '';
  const atValueRaw = administeredAtPart
    ? administeredAtPart.replace(atRegex, '').trim()
    : '';
  const atFormatted = atValueRaw
    ? formatAdminDate(atValueRaw) || atValueRaw
    : '';
  const note = findPart('Note:');

  const freqText = frequency
    ? stripPrefix(frequency, 'Frequency:').toLowerCase()
    : '';
  let orderType = '';
  if (orderTypePart) orderType = stripPrefix(orderTypePart, 'Order Type:');
  else if (/\bprn\b|as needed/.test(freqText)) orderType = 'PRN';
  else if (/\bstat\b|\bonce\b/.test(freqText)) orderType = 'STAT';
  else if (freqText) orderType = 'Scheduled';

  const adminStartedMs = entry.startTimestampValue;
  const adminCompletedMs = entry.timestampValue;
  const isReassessmentOnly = /^\[Reassessment\]/.test(entry.details || '');

  const medNameVal = stripPrefix(medicationName, 'Medication Name:');
  const doseVal = stripPrefix(orderedDose, 'Ordered Dose:');
  const routeVal = stripPrefix(route, 'Route:');
  const freqVal = stripPrefix(frequency, 'Frequency:');
  const dueTimeVal = stripPrefix(dueTime, 'Due Time:');
  const indicationVal = stripPrefix(indication, 'Indication:');
  const drugOnHandVal = stripPrefix(drugOnHand, 'Drug On Hand:');
  const expirationVal = stripPrefix(expiration, 'Expiration:');

  // ── Reassessment-only slim card ─────────────────────────────────────────────
  if (isReassessmentOnly) {
    const therapeuticVal = stripPrefix(therapeutic, 'Therapeutic Response:');
    const adverseVal = stripPrefix(adverse, 'Adverse Effects:');
    const timeElapsedVal = stripPrefix(timeElapsed, 'Time Elapsed:');
    const reassessmentNotesVal = stripPrefix(
      reassessmentNotes,
      'Reassessment Notes:'
    );
    const reassessedAtVal = stripPrefix(reassessedAtPart, 'Reassessed At:');
    return (
      <div className="mt-4 bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200">
          <span className="text-[13px] font-bold text-gray-800">
            Reassessment
          </span>
          <div className="flex items-center gap-2">
            {orderType && (
              <StatusBadge
                status={orderType}
                variant={
                  orderType === 'STAT'
                    ? 'error'
                    : orderType === 'PRN'
                      ? 'info'
                      : 'default'
                }
              />
            )}
            <StatusBadge status="Reassessment" variant="info" />
          </div>
        </div>
        <div className="p-4">
          {medNameVal && (
            <p className="text-[15px] font-bold text-gray-900 mb-3">
              {medNameVal}
            </p>
          )}
          <CollapsibleSection title="Reassessment findings" defaultOpen>
            <div className="space-y-1">
              {hasValue(reassessedAtVal) && (
                <InfoRow
                  label="Reassessed at"
                  value={formatAdminDate(reassessedAtVal) || reassessedAtVal}
                />
              )}
              {hasValue(timeElapsedVal) && (
                <InfoRow label="Time Elapsed" value={timeElapsedVal} />
              )}
              <InfoRow
                label="Therapeutic response"
                value={
                  hasValue(therapeuticVal) ? (
                    <StatusBadge status={therapeuticVal} variant="success" />
                  ) : (
                    <span className="text-gray-400 italic">Not documented</span>
                  )
                }
              />
              <InfoRow
                label="Adverse effects"
                value={
                  hasValue(adverseVal) ? (
                    <StatusBadge
                      status={adverseVal}
                      variant={
                        adverseVal.toLowerCase() === 'none'
                          ? 'success'
                          : 'warning'
                      }
                    />
                  ) : (
                    <span className="text-gray-400 italic">Not documented</span>
                  )
                }
              />
              {hasValue(reassessmentNotesVal) && (
                <InfoRow label="Notes" value={reassessmentNotesVal} />
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
      <div className="px-4 py-3 bg-white border-b border-gray-200">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-bold text-gray-800">
            Medication Administration
          </span>
          <div className="flex items-center gap-2">
            {orderType && (
              <StatusBadge
                status={orderType}
                variant={
                  orderType === 'STAT'
                    ? 'error'
                    : orderType === 'PRN'
                      ? 'info'
                      : 'default'
                }
              />
            )}
            {statusValue && statusValue.toLowerCase() !== 'administered' && (
              <StatusBadge
                status={statusValue.toUpperCase()}
                variant={
                  ['refused', 'inappropriate'].includes(
                    statusValue.toLowerCase()
                  )
                    ? 'error'
                    : statusValue.toLowerCase() === 'administered'
                      ? 'success'
                      : 'warning'
                }
              />
            )}
          </div>
        </div>
        {(adminStartedMs || entry.duration) && (
          <div className="flex items-center gap-4 mt-2 text-[10px] text-gray-500">
            {adminStartedMs && (
              <span>Started: {formatAdminDate(adminStartedMs)}</span>
            )}
            {entry.duration && (
              <span>Duration: {formatDurationLabel(entry.duration)}</span>
            )}
          </div>
        )}
      </div>

      {/* Title + chips */}
      <div className="px-4 pt-4 pb-2">
        {medNameVal && (
          <h3 className="text-[16px] font-bold text-gray-900 mb-3">
            {medNameVal}
          </h3>
        )}
        <div className="flex flex-wrap gap-2 mb-3">
          {dueTimeVal && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-semibold bg-white text-[#5f6060] border border-[#d1d5db]">
              Due: {dueTimeVal}
            </span>
          )}
          {doseVal && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-semibold bg-white text-[#5f6060] border border-[#d1d5db]">
              Dose: {doseVal}
            </span>
          )}
          {routeVal && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-semibold bg-white text-[#5f6060] border border-[#d1d5db]">
              Route: {routeVal}
            </span>
          )}
          {freqVal && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-semibold bg-white text-[#5f6060] border border-[#d1d5db]">
              Freq: {freqVal}
            </span>
          )}
        </div>
        {(indicationVal || drugOnHandVal || expirationVal) && (
          <div className="grid grid-cols-2 gap-4 py-2 border-t border-gray-100">
            {indicationVal && (
              <div>
                <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">
                  Indication
                </p>
                <p className="text-[12px] text-gray-800 font-semibold">
                  {indicationVal}
                </p>
              </div>
            )}
            {drugOnHandVal && (
              <div>
                <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">
                  Drug on hand
                </p>
                <p className="text-[12px] text-gray-800 font-semibold">
                  {drugOnHandVal}
                </p>
              </div>
            )}
            {expirationVal &&
              (() => {
                const expired = expirationVal
                  .toLowerCase()
                  .startsWith('expired');
                return (
                  <div>
                    <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">
                      Drug Expiration
                    </p>
                    <StatusBadge
                      status={expired ? 'Expired' : 'Not Expired'}
                      variant={expired ? 'error' : 'success'}
                    />
                  </div>
                );
              })()}
          </div>
        )}
      </div>

      {/* Collapsible sections */}
      <div className="px-4">
        {/* 24-Hour Administration History */}
        {administrationHistory &&
          (() => {
            const hv = stripPrefix(
              administrationHistory,
              'Administration History:'
            );
            if (!hasValue(hv)) return null;
            const items = hv
              .split(';')
              .map((s) => s.trim())
              .filter(Boolean);
            return (
              <CollapsibleSection
                title="24-Hour Administration History"
                defaultOpen={false}
              >
                <div className="space-y-1.5">
                  {items.map((item, i) => {
                    const m = item.match(/^(.+?)\s*\(([^)]+)\)$/);
                    const t = m ? m[1].trim() : item;
                    const s = m ? m[2].trim() : '';
                    return (
                      <div
                        key={i}
                        className="flex items-center justify-between py-1"
                      >
                        <span className="text-[12px] font-semibold text-blue-700">
                          {t}
                        </span>
                        {s && (
                          <StatusBadge
                            status={s}
                            variant={
                              s.toLowerCase() === 'administered'
                                ? 'success'
                                : 'warning'
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

        {/* Verification Checklist */}
        {(() => {
          const fromGrading = gradingResult?.verificationResult?.actual ?? [];
          const fromBooleans: string[] = [];
          if (adminDetails?.patientVerification?.nameChecked)
            fromBooleans.push('name_checked');
          if (adminDetails?.patientVerification?.dobChecked)
            fromBooleans.push('dob_checked');
          if (adminDetails?.patientVerification?.wristbandChecked)
            fromBooleans.push('scanned_id');
          if (adminDetails?.medicationVerification?.nameVerified)
            fromBooleans.push('medication_name');
          if (adminDetails?.medicationVerification?.expiryChecked)
            fromBooleans.push('expiration_date');
          if (adminDetails?.medicationVerification?.allergiesVerified)
            fromBooleans.push('no_allergies_contraindications');
          if (adminDetails?.medicationVerification?.indicationConfirmed)
            fromBooleans.push('strength_concentration');
          const studentItems =
            fromGrading.length > 0 ? fromGrading : fromBooleans;
          if (gradingResult?.verificationResult) {
            return (
              <CollapsibleSection
                title="Verification checklist"
                defaultOpen={hasGrading}
              >
                <ChecklistGradingDisplay
                  title="Medication Verification"
                  result={gradingResult.verificationResult}
                  studentItems={studentItems}
                  kind="verification"
                />
              </CollapsibleSection>
            );
          }
          return (
            <CollapsibleSection title="Verification checklist" defaultOpen>
              <ChecklistGradingDisplay
                title="Medication Verification"
                result={{
                  expected: [],
                  actual: studentItems,
                  matched: [],
                  missing: [],
                  isCorrect: false,
                }}
                studentItems={studentItems}
                neutral
                kind="verification"
              />
            </CollapsibleSection>
          );
        })()}

        {/* Clinical Decision */}
        {(() => {
          const comp = getComp('Clinical Decision');
          const decisionVal = clinicalDecision
            ? stripPrefix(clinicalDecision, 'Clinical Decision:')
            : '';
          const rawDoc = decisionVal || statusValue || '';
          const normDoc = rawDoc.toLowerCase().trim();
          const documented =
            normDoc === 'hold'
              ? 'Held'
              : normDoc === 'refuse'
                ? 'Refused'
                : rawDoc || undefined;
          const rnv = stripPrefix(reasonNotGiven, 'Reason for Not Given:');
          const rrv = stripPrefix(refusalReason, 'Refusal Reason:');
          const irv = stripPrefix(inappropriateReason, 'Inappropriate Reason:');
          const afv = stripPrefix(assessmentFindings, 'Assessment Findings:');
          const nv = stripPrefix(note, 'Note:');
          return (
            <CollapsibleSection
              title="Clinical decision"
              defaultOpen={
                (hasGrading && !!comp) ||
                !!(statusValue && statusValue !== 'Administered')
              }
            >
              <div className="space-y-1">
                {comp ? (
                  <GradingComparisonRow
                    label="Clinical Decision"
                    expected={comp.expected}
                    actual={comp.actual}
                    isCorrect={comp.isCorrect}
                  />
                ) : (
                  <GradingComparisonRow
                    label="Clinical Decision"
                    expected={undefined}
                    actual={documented}
                    isCorrect={null}
                  />
                )}
                {hasValue(afv) && (
                  <InfoRow label="Applicable Assessment Findings" value={afv} />
                )}
                {hasValue(rnv) && <InfoRow label="Reason" value={rnv} />}
                {hasValue(rrv) && (
                  <InfoRow label="Refusal reason" value={rrv} />
                )}
                {hasValue(irv) && (
                  <InfoRow label="Inappropriate reason" value={irv} />
                )}
                {hasValue(nv) && <InfoRow label="Note" value={nv} />}
              </div>
            </CollapsibleSection>
          );
        })()}

        {/* Administration Details */}
        {(() => {
          const nonAdmin = [
            'held',
            'refused',
            'inappropriate',
            'missed',
          ].includes((statusValue || '').toLowerCase());
          const cdComp = getComp('Clinical Decision');
          const forceNeutral = nonAdmin && cdComp?.isCorrect === true;
          const doseComp = getComp('Dose');
          const qtyComp = getComp('Quantity');
          const combinedComp = getComp('Route vs Site');
          const routeComp = getComp('Route');
          const siteComp = getComp('Site');
          const timeComp = getComp('Administration Time');
          const infRateComp = getComp('Infusion Rate');
          const rateComp = getComp('Rate');
          const durComp = getComp('Duration');
          const adVal = stripPrefix(administeredDose, 'Administered Dose:');
          const qVal = stripPrefix(quantity, 'Quantity:');
          const eqVal = stripPrefix(expectedQuantity, 'Expected Quantity:');
          const sVal = stripPrefix(site, 'Site:');
          const tVal = stripPrefix(time, 'Time:');
          const rVal = stripPrefix(rate, 'Rate:');
          const idVal = stripPrefix(infusionDuration, 'Infusion Duration:');
          const rows: {
            label: string;
            expected: string | string[] | undefined;
            actual: string | string[] | undefined;
            isCorrect: boolean | null;
            confidence?: number;
            explanation?: string;
          }[] = [
            {
              label: 'Dose',
              expected: doseComp?.expected,
              actual: doseComp
                ? doseComp.actual
                : hasValue(adVal)
                  ? adVal
                  : undefined,
              isCorrect: forceNeutral
                ? null
                : doseComp
                  ? doseComp.isCorrect
                  : null,
            },
            {
              label: 'Amount',
              expected: qtyComp
                ? qtyComp.expected
                : hasValue(eqVal)
                  ? eqVal
                  : undefined,
              actual: qtyComp
                ? qtyComp.actual
                : hasValue(qVal)
                  ? qVal
                  : undefined,
              isCorrect: forceNeutral
                ? null
                : qtyComp
                  ? qtyComp.isCorrect
                  : null,
            },
            ...(combinedComp ||
            routeComp ||
            siteComp ||
            hasValue(routeVal) ||
            hasValue(sVal)
              ? [
                  (() => {
                    const expR = combinedComp
                      ? combinedComp.expected
                      : routeComp?.expected;
                    const docR = combinedComp
                      ? combinedComp.actual
                      : routeComp
                        ? routeComp.actual
                        : hasValue(routeVal)
                          ? routeVal
                          : undefined;
                    const docS = siteComp
                      ? siteComp.actual
                      : hasValue(sVal)
                        ? sVal
                        : undefined;
                    let combined: string | string[] | undefined = docR;
                    if (docS && typeof docR === 'string' && !docR.includes('('))
                      combined = `${docR} (${String(docS)})`;
                    else if (!docR && docS) combined = String(docS);
                    return {
                      label: 'Route vs Site',
                      expected: expR,
                      actual: combined,
                      isCorrect: forceNeutral
                        ? null
                        : combinedComp
                          ? combinedComp.isCorrect
                          : routeComp
                            ? routeComp.isCorrect
                            : null,
                    };
                  })(),
                ]
              : []),
            {
              label: 'Administration Time',
              expected: timeComp?.expected,
              actual: timeComp
                ? timeComp.actual
                : hasValue(tVal)
                  ? tVal
                  : undefined,
              isCorrect: forceNeutral
                ? null
                : timeComp
                  ? timeComp.isCorrect
                  : null,
            },
            {
              label: 'Rate',
              expected: infRateComp ? infRateComp.expected : rateComp?.expected,
              actual: infRateComp
                ? infRateComp.actual
                : rateComp
                  ? rateComp.actual
                  : hasValue(rVal)
                    ? rVal
                    : undefined,
              isCorrect: forceNeutral
                ? null
                : infRateComp
                  ? infRateComp.isCorrect
                  : rateComp
                    ? rateComp.isCorrect
                    : null,
            },
            {
              label: 'Duration',
              expected: hasAny(
                durComp ? durComp.actual : hasValue(idVal) ? idVal : undefined
              )
                ? durComp?.expected
                : undefined,
              actual: durComp
                ? durComp.actual
                : hasValue(idVal)
                  ? idVal
                  : undefined,
              isCorrect: forceNeutral
                ? null
                : durComp
                  ? durComp.isCorrect
                  : null,
            },
          ];
          const visible = rows.filter(
            (r) => hasAny(r.expected) || hasAny(r.actual)
          );
          if (visible.length === 0) return null;
          return (
            <CollapsibleSection
              title="Administration details"
              defaultOpen={hasGrading}
            >
              <div className="space-y-1">
                {visible.map((r) => (
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

        {/* Patient Education */}
        {(() => {
          const eduNotesVal = educationNotes
            ? stripPrefix(educationNotes, 'Education Notes:')
            : '';
          const studentEdu: string[] = adminDetails?.patientEducation
            ? ([
                adminDetails.patientEducation.discussedPurpose &&
                  'Purpose Discussed',
                adminDetails.patientEducation.reviewedSideEffects &&
                  'Side Effects Reviewed',
                adminDetails.patientEducation.providedInstructions &&
                  'Instructions Provided',
                adminDetails.patientEducation.answeredQuestions &&
                  'Questions Answered',
                adminDetails.patientEducation.patientUnderstanding &&
                  'Patient Understanding',
              ].filter(Boolean) as string[])
            : [];
          return (
            <CollapsibleSection
              title="Patient education"
              defaultOpen={!!gradingResult?.educationResult}
            >
              {gradingResult?.educationResult ? (
                <ChecklistGradingDisplay
                  title="Patient Education"
                  result={gradingResult.educationResult}
                  studentItems={studentEdu}
                />
              ) : (
                <ChecklistGradingDisplay
                  title="Patient Education"
                  result={{
                    expected: [],
                    actual: studentEdu,
                    matched: [],
                    missing: [],
                    isCorrect: false,
                  }}
                  studentItems={studentEdu}
                  neutral
                />
              )}
              {hasValue(eduNotesVal) && (
                <InfoRow label="Educational notes" value={eduNotesVal} />
              )}
            </CollapsibleSection>
          );
        })()}

        {/* Administration Confirmation */}
        {(administeredToPatient || properDisposal || adminNotes) && (
          <CollapsibleSection
            title="Administration confirmation"
            defaultOpen={false}
          >
            <div className="space-y-1">
              {administeredToPatient &&
                (() => {
                  const v = stripPrefix(
                    administeredToPatient,
                    'Administered to Patient:'
                  );
                  const yes = /^yes$/i.test(v);
                  return (
                    <div className="flex items-center gap-2 py-1.5">
                      <div
                        className={`w-5 h-5 rounded-full flex items-center justify-center ${yes ? 'bg-emerald-100' : 'bg-gray-100'}`}
                      >
                        {yes ? (
                          <Check className="w-3 h-3 text-emerald-600" />
                        ) : (
                          <X className="w-3 h-3 text-gray-400" />
                        )}
                      </div>
                      <span className="text-[12px] text-gray-700 font-medium">
                        Administered to patient
                      </span>
                    </div>
                  );
                })()}
              {properDisposal &&
                (() => {
                  const v = stripPrefix(properDisposal, 'Proper Disposal:');
                  const yes = /^yes$/i.test(v);
                  return (
                    <div className="flex items-center gap-2 py-1.5">
                      <div
                        className={`w-5 h-5 rounded-full flex items-center justify-center ${yes ? 'bg-emerald-100' : 'bg-gray-100'}`}
                      >
                        {yes ? (
                          <Check className="w-3 h-3 text-emerald-600" />
                        ) : (
                          <X className="w-3 h-3 text-gray-400" />
                        )}
                      </div>
                      <span className="text-[12px] text-gray-700 font-medium">
                        Proper disposal confirmed
                      </span>
                    </div>
                  );
                })()}
              {adminNotes &&
                hasValue(stripPrefix(adminNotes, 'Admin Notes:')) && (
                  <InfoRow
                    label="Notes"
                    value={stripPrefix(adminNotes, 'Admin Notes:')}
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
          <CollapsibleSection title="Administration Timing" defaultOpen={false}>
            <div className="space-y-1">
              {adminStartedMs && (
                <InfoRow
                  label="Started"
                  value={formatAdminDate(adminStartedMs)}
                />
              )}
              {administeredAtPart && atFormatted ? (
                <InfoRow label={atLabel} value={atFormatted} />
              ) : (
                adminCompletedMs && (
                  <InfoRow
                    label={
                      statusValue && statusValue !== 'Administered'
                        ? `${statusValue} at`
                        : 'Administered at'
                    }
                    value={formatAdminDate(adminCompletedMs)}
                  />
                )
              )}
              {time && (
                <InfoRow
                  label="Documented at (Sim Time)"
                  value={stripPrefix(time, 'Time:')}
                />
              )}
              {entry.duration && (
                <InfoRow
                  label="Duration"
                  value={formatDurationLabel(entry.duration)}
                />
              )}
            </div>
          </CollapsibleSection>
        )}

        {/* Reassessment */}
        {(() => {
          const tv = stripPrefix(therapeutic, 'Therapeutic Response:');
          const av = stripPrefix(adverse, 'Adverse Effects:');
          const telv = stripPrefix(timeElapsed, 'Time Elapsed:');
          const rnv = stripPrefix(reassessmentNotes, 'Reassessment Notes:');
          const rav = stripPrefix(reassessedAtPart, 'Reassessed At:');
          if (
            !therapeutic &&
            !adverse &&
            !hasValue(telv) &&
            !hasValue(rnv) &&
            !hasValue(rav)
          )
            return null;
          return (
            <CollapsibleSection
              title="Reassessment findings"
              defaultOpen={false}
            >
              <div className="space-y-1">
                {hasValue(rav) && (
                  <InfoRow
                    label="Reassessed at"
                    value={formatAdminDate(rav) || rav}
                  />
                )}
                {hasValue(telv) && (
                  <InfoRow label="Time Elapsed" value={telv} />
                )}
                <InfoRow
                  label="Therapeutic response"
                  value={
                    hasValue(tv) ? (
                      <StatusBadge status={tv} variant="success" />
                    ) : (
                      <span className="text-gray-400 italic">
                        Not documented
                      </span>
                    )
                  }
                />
                <InfoRow
                  label="Adverse effects"
                  value={
                    hasValue(av) ? (
                      <StatusBadge
                        status={av}
                        variant={
                          av.toLowerCase() === 'none' ? 'success' : 'warning'
                        }
                      />
                    ) : (
                      <span className="text-gray-400 italic">
                        Not documented
                      </span>
                    )
                  }
                />
                {hasValue(rnv) && <InfoRow label="Notes" value={rnv} />}
              </div>
            </CollapsibleSection>
          );
        })()}

        {/* Final Medication Status */}
        {(() => {
          const comp = getComp('Final Status');
          return (
            <CollapsibleSection
              title="Final medication status"
              defaultOpen={hasGrading && !!comp}
            >
              <GradingComparisonRow
                label="Final Status"
                expected={comp?.expected}
                actual={comp ? comp.actual : statusValue || undefined}
                isCorrect={comp ? comp.isCorrect : null}
              />
            </CollapsibleSection>
          );
        })()}
      </div>

      <div className="h-2" />
    </div>
  );
}
