/**
 * Medication administration card renderer — ported/adapted from the Student
 * transcript PDF (`HS-online-AI-app/frontend/app/reports/[id]/transcript/page.tsx`,
 * medication block ~lines 3510–4400).
 *
 * Phase 6 of Student → Educator transcript PDF parity port.
 *
 * The card layout mirrors the Student PDF (from top to bottom):
 *   • Category-coloured clock badge
 *   • Violet bubble container with:
 *       - "[MEDICATIONS]" pill + Started/Ended/Duration row
 *       - Medication title
 *       - MEDICATION ADMINISTRATION sub-header + order-type badge
 *       - Started + Duration line
 *       - Violet info chips (Due / Dose / Route / Freq)
 *       - 2-col info grid (Indication / Drug On Hand / Drug Expiration)
 *       - Verification checklist (Expected | Documented)
 *       - Clinical Decision comparison row + optional info lines
 *       - Administration Details (Dose / Amount / Route vs Site / Time)
 *       - Education checklist (Expected | Documented)
 *       - Therapeutic Response / Adverse Effects / Notes info lines
 *       - Medication status pill (Administered / Not Given / Held / Refused / …)
 */

import type jsPDF from 'jspdf';

import { sanitizePdfText } from '../../../utils/sanitizePdf';
import type { TranscriptEventData } from '../../../types/userTranscript';

import {
  C_DANGER,
  C_GRAY100,
  C_GRAY200,
  C_GRAY400,
  C_GRAY50,
  C_GRAY700,
  C_GRAY900,
  C_SUCCESS,
  C_TEXT_MUTED,
  C_TEXT_PRIMARY,
  C_TEXT_SECONDARY,
  type RGB,
  getCategoryMetaPdf,
} from './pdf-constants';
import {
  CONTENT_W,
  MARGIN_L,
  PAGE_H,
  type PdfRenderState,
  drawClockBadge,
  drawPill,
  ensureSpace,
  setDraw,
  setFill,
  setText,
} from './pdf-primitives';
import { formatDurationLabel } from './transcript-utils';

// ─── Shared card constants (kept in-sync with pdf-event-renderers) ───────────

const CARD_PAD = 6;
// CARD_INNER_W is reserved for future use when individual card sections
// need inner-width calculations consistent with the event renderer.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _CARD_INNER_W = CONTENT_W - CARD_PAD * 2;
const CLOCK_BADGE_H = 9 * 0.42 + 1.8 * 2;
const CONTENT_BOTTOM = PAGE_H - 18;

// ─── Checklist label maps (from Student MedicationTranscriptCard.tsx) ────────

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
const EDUCATION_ORDER: string[] = [
  'Purpose Discussed',
  'Side Effects Reviewed',
  'Instructions Provided',
  'Questions Answered',
  'Patient Understanding',
];

const VERIFICATION_LABEL_MAP: Record<string, string> = {
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
const VERIFICATION_ORDER: string[] = [
  'Asked patient to state their full name',
  'Asked patient to state their date of birth',
  'Scanned/checked patient wristband',
  'Verified medication name',
  'Verified medication is not expired',
  'Verified absence of allergies or contraindications',
  'Verified medication strength/concentration',
];

function toTitleCase(s: string): string {
  return s
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function normalizeChecklistList(
  items: string[],
  map: Record<string, string>,
  order: string[]
): string[] {
  const normalized = items.map((i) => {
    const key = String(i).toLowerCase().trim();
    return map[key] ?? toTitleCase(String(i));
  });
  const seen = new Set<string>();
  const deduped = normalized.filter((v) => {
    if (seen.has(v)) return false;
    seen.add(v);
    return true;
  });
  const indexOf = (s: string): number => {
    const idx = order.indexOf(s);
    return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
  };
  return [...deduped].sort((a, b) => indexOf(a) - indexOf(b));
}

// ─── Data-shape helpers ──────────────────────────────────────────────────────

interface Comparison {
  field?: string;
  expected?: unknown;
  actual?: unknown;
  isCorrect?: boolean;
}

interface GradingResult {
  medicationId?: string;
  medicationName?: string;
  overallScore?: number;
  totalExpected?: number;
  totalCorrect?: number;
  mandatory?: boolean;
  comparisons?: Comparison[];
  educationResult?: {
    expected?: string[];
    actual?: string[];
    isCorrect?: boolean;
  };
  verificationResult?: {
    expected?: string[];
    actual?: string[];
    isCorrect?: boolean;
  };
}

interface AdministrationDetails {
  medicationId?: string;
  medicationName?: string;
  orderTitle?: string;
  status?: string;
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
  };
  gradingResult?: GradingResult;
  [key: string]: unknown;
}

function toStr(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return (v as unknown[]).map(String).join(', ');
  return String(v);
}

function hasMedVal(v: string | undefined | null): boolean {
  return typeof v === 'string' && v.trim().length > 0 && v.trim() !== '—';
}

function compStr(v: unknown): string {
  if (v == null) return '';
  if (Array.isArray(v)) return (v as unknown[]).map(String).join(' or ');
  return String(v);
}

function fieldOf(
  raw: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  for (const k of keys) {
    const v = raw[k];
    if (v != null && String(v).trim() !== '' && String(v) !== 'undefined') {
      return String(v);
    }
  }
  return undefined;
}

// ─── Medication status classification ────────────────────────────────────────

interface MedStatusMeta {
  label: string;
  textColor: RGB;
  bgColor: RGB;
  borderColor: RGB;
}

/**
 * Classify a medication status string into one of six Student-parity buckets:
 * Administered / Not Given / Held / Refused / Partial / Unknown.
 */
function classifyMedStatus(raw: string | undefined): MedStatusMeta {
  const norm = String(raw ?? '')
    .toLowerCase()
    .trim();
  if (/^(administer|given|admin)/.test(norm)) {
    return {
      label: 'ADMINISTERED',
      textColor: C_SUCCESS,
      bgColor: [209, 250, 229],
      borderColor: [167, 243, 208],
    };
  }
  if (/not\s*given/.test(norm)) {
    return {
      label: 'NOT GIVEN',
      textColor: [180, 83, 9],
      bgColor: [255, 251, 235],
      borderColor: [253, 230, 138],
    };
  }
  if (/^hold|held/.test(norm)) {
    return {
      label: 'HELD',
      textColor: [3, 105, 161],
      bgColor: [224, 242, 254],
      borderColor: [186, 230, 253],
    };
  }
  if (/^refuse|refused|refusal/.test(norm)) {
    return {
      label: 'REFUSED',
      textColor: C_DANGER,
      bgColor: [254, 226, 226],
      borderColor: [252, 165, 165],
    };
  }
  if (/^partial/.test(norm)) {
    return {
      label: 'PARTIAL',
      textColor: [180, 83, 9],
      bgColor: [255, 251, 235],
      borderColor: [253, 230, 138],
    };
  }
  return {
    label: raw ? raw.toUpperCase() : 'UNKNOWN',
    textColor: C_TEXT_SECONDARY,
    bgColor: C_GRAY100,
    borderColor: C_GRAY200,
  };
}

// ─── Drawing helpers (Student-parity) ────────────────────────────────────────

/** Divider line + bold uppercase section header. */
function drawMedSep(
  pdf: jsPDF,
  state: PdfRenderState,
  ix: number,
  iw: number,
  title: string
): void {
  setDraw(pdf, C_GRAY200);
  pdf.setLineWidth(0.25);
  pdf.line(ix, state.yPosition, ix + iw, state.yPosition);
  state.yPosition += 3;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7.5);
  setText(pdf, C_GRAY700);
  pdf.text(sanitizePdfText(title.toUpperCase()), ix, state.yPosition + 3);
  state.yPosition += 7;
}

/**
 * Dual-column Expected | Documented comparison row with a satisfactory /
 * unsatisfactory / neutral verdict badge in the top-right corner.
 */
function drawMedCompRow(
  pdf: jsPDF,
  state: PdfRenderState,
  ix: number,
  iw: number,
  label: string,
  expected: string | undefined,
  documented: string | undefined,
  isCorrect: boolean | null
): void {
  const expStr = expected?.trim() ? expected : '—';
  const docStr = documented?.trim() ? documented : '—';
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

  const colPadC = 3;
  const divXC = ix + iw / 2;
  const lXC = ix + colPadC;
  const rXC = divXC + colPadC;
  const lColW = divXC - lXC - 2;
  const rColW = ix + iw - rXC - colPadC;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  const expLines = pdf.splitTextToSize(
    sanitizePdfText(expStr),
    lColW
  ) as string[];
  const docLines = pdf.splitTextToSize(
    sanitizePdfText(docStr),
    rColW
  ) as string[];
  const maxL = Math.max(expLines.length, docLines.length);
  const boxH = 6 + 4.5 + maxL * 4 + 4;

  state.yPosition += 2;
  if (state.yPosition + boxH > CONTENT_BOTTOM) {
    ensureSpace(pdf, state, boxH + 4);
  }

  setFill(pdf, rowBG);
  setDraw(pdf, rowBC);
  pdf.setLineWidth(0.25);
  pdf.roundedRect(ix, state.yPosition, iw, boxH, 1.5, 1.5, 'FD');
  setDraw(pdf, rowBC);
  pdf.setLineWidth(0.2);
  pdf.line(divXC, state.yPosition + 1, divXC, state.yPosition + boxH - 1);

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  setText(pdf, C_GRAY700);
  pdf.text(sanitizePdfText(label), lXC, state.yPosition + 4.5);

  if (isCorrect !== null) {
    const bLabel = isCorrect ? 'Satisfactory' : 'Unsatisfactory';
    const bTC: RGB = isCorrect ? [4, 120, 87] : [190, 24, 93];
    const bBG: RGB = isCorrect ? [209, 250, 229] : [254, 226, 226];
    const bBC: RGB = isCorrect ? [167, 243, 208] : [254, 205, 211];
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    const bW = pdf.getTextWidth(bLabel) + 5.6;
    const bH = 7 * 0.42 + 1.3 * 2;
    setFill(pdf, bBG);
    setDraw(pdf, bBC);
    pdf.setLineWidth(0.2);
    pdf.roundedRect(
      ix + iw - bW - colPadC,
      state.yPosition + 1,
      bW,
      bH,
      bH / 2,
      bH / 2,
      'FD'
    );
    setText(pdf, bTC);
    pdf.text(
      bLabel,
      ix + iw - bW - colPadC + 2.8,
      state.yPosition + 1 + bH - 1.3 - 0.3
    );
  }

  const sY = state.yPosition + 7;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7);
  setText(pdf, C_GRAY400);
  pdf.text('EXPECTED', lXC, sY);
  pdf.text('DOCUMENTED', rXC, sY);
  setDraw(pdf, C_GRAY200);
  pdf.setLineWidth(0.2);
  pdf.line(lXC, sY + 1, divXC - colPadC, sY + 1);
  pdf.line(rXC, sY + 1, ix + iw - colPadC, sY + 1);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  setText(pdf, C_TEXT_SECONDARY);
  pdf.text(expLines, lXC, sY + 4.5);
  setText(pdf, docTC);
  pdf.text(docLines, rXC, sY + 4.5);
  state.yPosition += boxH;
}

/** Two-column checklist box (Expected items | Documented items). */
function drawMedChecklist(
  pdf: jsPDF,
  state: PdfRenderState,
  ix: number,
  iw: number,
  title: string,
  expectedItems: string[],
  documentedItems: string[],
  isCorrect?: boolean | null
): void {
  const inferredStatus = ((): boolean | null => {
    if (expectedItems.length > 0) {
      const expectedSet = new Set(
        expectedItems.map((v) => v.toLowerCase().trim())
      );
      const documentedSet = new Set(
        documentedItems.map((v) => v.toLowerCase().trim())
      );
      return Array.from(expectedSet).every((item) => documentedSet.has(item));
    }
    if (typeof isCorrect === 'boolean') return isCorrect;
    return null;
  })();

  const itemH = 4;
  const maxItems = Math.max(
    expectedItems.length === 0 ? 1 : expectedItems.length,
    documentedItems.length === 0 ? 1 : documentedItems.length
  );
  const boxH = 7 + 4.5 + maxItems * itemH + 3;

  state.yPosition += 4;
  ensureSpace(pdf, state, boxH + 4);

  const colPad = 3;
  const divX = ix + iw / 2;
  const lX = ix + colPad;
  const rX = divX + colPad;
  const rowBG: RGB =
    inferredStatus === null
      ? [249, 250, 251]
      : inferredStatus
        ? [236, 253, 245]
        : [255, 241, 242];
  const rowBC: RGB =
    inferredStatus === null
      ? [229, 231, 235]
      : inferredStatus
        ? [209, 250, 229]
        : [255, 228, 230];

  setFill(pdf, rowBG);
  setDraw(pdf, rowBC);
  pdf.setLineWidth(0.25);
  pdf.roundedRect(ix, state.yPosition, iw, boxH, 1.5, 1.5, 'FD');
  setDraw(pdf, rowBC);
  pdf.setLineWidth(0.2);
  pdf.line(divX, state.yPosition + 1, divX, state.yPosition + boxH - 1);

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  setText(pdf, C_GRAY700);
  pdf.text(sanitizePdfText(title), lX, state.yPosition + 4.5);

  if (inferredStatus !== null) {
    const bLabel = inferredStatus ? 'Satisfactory' : 'Unsatisfactory';
    const bTC: RGB = inferredStatus ? [4, 120, 87] : [190, 24, 93];
    const bBG: RGB = inferredStatus ? [209, 250, 229] : [255, 228, 230];
    const bBC: RGB = inferredStatus ? [167, 243, 208] : [254, 205, 211];
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    const bW = pdf.getTextWidth(bLabel) + 5.6;
    const bH = 7 * 0.42 + 1.3 * 2;
    setFill(pdf, bBG);
    setDraw(pdf, bBC);
    pdf.setLineWidth(0.2);
    pdf.roundedRect(
      ix + iw - bW - colPad,
      state.yPosition + 1,
      bW,
      bH,
      bH / 2,
      bH / 2,
      'FD'
    );
    setText(pdf, bTC);
    pdf.text(
      bLabel,
      ix + iw - bW - colPad + 2.8,
      state.yPosition + 1 + bH - 1.3 - 0.3
    );
  }

  const sY = state.yPosition + 7;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7);
  setText(pdf, C_GRAY400);
  pdf.text('EXPECTED', lX, sY);
  pdf.text('DOCUMENTED', rX, sY);
  setDraw(pdf, rowBC);
  pdf.setLineWidth(0.2);
  pdf.line(lX, sY + 1, divX - colPad, sY + 1);
  pdf.line(rX, sY + 1, ix + iw - colPad, sY + 1);

  const listY = sY + 4.5;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);

  if (expectedItems.length === 0) {
    setText(pdf, C_GRAY400);
    pdf.text('—', lX, listY);
  } else {
    setText(pdf, C_TEXT_PRIMARY);
    expectedItems.forEach((item, i) => {
      pdf.text(sanitizePdfText(`• ${item}`), lX, listY + i * itemH);
    });
  }
  if (documentedItems.length === 0) {
    setText(pdf, C_GRAY400);
    pdf.text('—', rX, listY);
  } else {
    setText(pdf, C_TEXT_PRIMARY);
    documentedItems.forEach((item, i) => {
      pdf.text(sanitizePdfText(`• ${item}`), rX, listY + i * itemH);
    });
  }
  state.yPosition += boxH;
}

/** Right-aligned key/value info line — used for free-text notes. */
function drawMedInfoLine(
  pdf: jsPDF,
  state: PdfRenderState,
  ix: number,
  iw: number,
  label: string,
  value: string
): void {
  const lineH = 4;
  const labelW = iw * 0.4;
  const valueW = iw * 0.58;
  const labelLines = pdf.splitTextToSize(
    sanitizePdfText(label),
    labelW
  ) as string[];
  const valueLines = pdf.splitTextToSize(
    sanitizePdfText(value),
    valueW
  ) as string[];
  const rowH = Math.max(labelLines.length, valueLines.length) * lineH + 2;

  state.yPosition += 1.5;
  ensureSpace(pdf, state, rowH + 2);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  setText(pdf, C_TEXT_SECONDARY);
  pdf.text(labelLines, ix, state.yPosition + 3.5);
  setText(pdf, C_TEXT_PRIMARY);
  pdf.text(valueLines, ix + iw, state.yPosition + 3.5, { align: 'right' });
  state.yPosition += rowH;
}

/** Small violet info chip (Due / Dose / Route / Freq). */
function drawInfoChip(
  pdf: jsPDF,
  x: number,
  y: number,
  text: string
): { width: number; height: number } {
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7.5);
  const label = sanitizePdfText(text);
  const w = pdf.getTextWidth(label) + 5.6;
  const h = 7.5 * 0.42 + 1.3 * 2;
  setFill(pdf, [245, 243, 255]);
  setDraw(pdf, [221, 214, 254]);
  pdf.setLineWidth(0.2);
  pdf.roundedRect(x, y, w, h, h / 2, h / 2, 'FD');
  setText(pdf, [109, 40, 217]);
  pdf.text(label, x + 2.8, y + h - 1.3 - 0.3);
  return { width: w, height: h };
}

// ─── Public API — detector + renderer ────────────────────────────────────────

/**
 * True when the event should be rendered as a medication administration card.
 * Matches events whose category is `medications`, whose title starts with
 * `Administer`, or that carry an `administrationDetails` blob.
 */
export function isMedicationEvent(raw: Record<string, unknown>): boolean {
  const category = String(raw['category'] ?? '').toLowerCase();
  if (category === 'medications' || category === 'medication') return true;
  if (
    raw['administrationDetails'] &&
    typeof raw['administrationDetails'] === 'object'
  )
    return true;
  const title = String(raw['title'] ?? '').toLowerCase();
  if (/^administer\b/.test(title)) return true;
  return false;
}

/**
 * Render a medication administration card. Uses the violet Medications
 * palette from `getCategoryMetaPdf("medications")`, then stacks all the
 * medication-specific sections mirroring the Student PDF.
 */
export function renderMedicationCard(
  pdf: jsPDF,
  state: PdfRenderState,
  event: TranscriptEventData
): void {
  const raw = event as unknown as Record<string, unknown>;
  const adminDet = (raw['administrationDetails'] ??
    {}) as AdministrationDetails;
  const gradRes = adminDet.gradingResult;

  const title =
    toStr(fieldOf(raw, 'title', 'name', 'label')) ||
    toStr(adminDet.medicationName ?? adminDet.orderTitle) ||
    'Medication Administration';

  const meta = getCategoryMetaPdf('medications', title);

  // ── Look up a comparison field by name (case-insensitive contains). ────────
  const comparisons: Comparison[] = Array.isArray(gradRes?.comparisons)
    ? gradRes.comparisons!
    : [];
  const getComp = (needle: string): Comparison | undefined =>
    comparisons.find((c) =>
      (c.field ?? '').toLowerCase().includes(needle.toLowerCase())
    );

  // ── Extract all optional root-level medication fields (Student parity). ────
  const medStatus = toStr(fieldOf(raw, 'status', 'medicationStatus'));
  const medOrderType = toStr(fieldOf(raw, 'orderType', 'order_type'));
  const medDueTimeVal = toStr(fieldOf(raw, 'dueTime', 'due_time'));
  const medDoseVal = toStr(fieldOf(raw, 'dose'));
  const medRouteVal = toStr(fieldOf(raw, 'route'));
  const medFreqVal = toStr(fieldOf(raw, 'frequency'));
  const medIndication = toStr(fieldOf(raw, 'indication'));
  const medDrugOnHand = toStr(fieldOf(raw, 'drugOnHand', 'drug_on_hand'));
  const medExpiration = toStr(
    fieldOf(raw, 'expiration', 'drugExpiration', 'drug_expiration')
  );
  const medAdminDose = toStr(fieldOf(raw, 'adminDose', 'administeredDose'));
  const medQty = toStr(fieldOf(raw, 'quantity', 'adminQuantity'));
  const medExpectedQty = toStr(
    fieldOf(raw, 'expectedQuantity', 'expected_quantity')
  );
  const medSite = toStr(fieldOf(raw, 'site', 'administrationSite'));
  const medTime = toStr(
    fieldOf(raw, 'administrationTime', 'administration_time')
  );
  const medClinDec = toStr(
    fieldOf(raw, 'clinicalDecision', 'clinical_decision')
  );
  const medReasonNotGiven = toStr(
    fieldOf(raw, 'reasonNotGiven', 'reason_not_given')
  );
  const medRefusalReason = toStr(
    fieldOf(raw, 'refusalReason', 'refusal_reason')
  );
  const medInappropriateReason = toStr(
    fieldOf(raw, 'inappropriateReason', 'inappropriate_reason')
  );
  const medClinicalNote = toStr(
    fieldOf(raw, 'clinicalNote', 'clinical_note', 'note')
  );
  const medAssessmentFindings = toStr(
    fieldOf(raw, 'assessmentFindings', 'assessment_findings')
  );
  const medTherapeuticResp = toStr(
    fieldOf(raw, 'therapeuticResponse', 'therapeutic_response')
  );
  const medAdverseEffects = toStr(
    fieldOf(raw, 'adverseEffects', 'adverse_effects')
  );
  const medNotes = toStr(fieldOf(raw, 'notes', 'medicationNotes'));

  // Only reserve enough for a page-break-safe first row (title + sub-header).
  // Segment tracking (pushed by ensureSpace) paints bg + border per page
  // afterwards, so we no longer need a big hard-coded estimate here.
  const MIN_HEADER_H = 60;

  ensureSpace(pdf, state, CLOCK_BADGE_H + 3 + MIN_HEADER_H);
  const bh = drawClockBadge(
    pdf,
    state,
    toStr(fieldOf(raw, 'simulationTime', 'elapsedTime')) || '00:00',
    meta.textColor,
    meta.bgColor,
    meta.borderColor
  );
  state.yPosition += bh + 3;

  // Card container (Phase 7 pagination).
  const cardX = MARGIN_L;
  const cardW = CONTENT_W;
  const startY = state.yPosition;
  const startPage = state.pageNumber;

  // Phase 7 refinement: paint first-page bg out to the page bottom so body
  // text always has bg behind it even if it overshoots the MIN_HEADER_H
  // reservation. Single-page short cards hide the excess with a white
  // overlay below the final border (matches Student pattern).
  const page1BgBottom = CONTENT_BOTTOM - startY + 6;
  setFill(pdf, meta.bgColor);
  pdf.rect(cardX, startY, cardW, page1BgBottom, 'F');

  state.activeCardBg = meta.bgColor;
  state.cardSegments = [{ page: startPage, top: startY }];
  state.yPosition = startY + CARD_PAD;

  const ix = cardX + CARD_PAD;
  const iw = cardW - CARD_PAD * 2;

  // ── Category pill + Started/Ended row ──────────────────────────────────────
  {
    const pill = drawPill(
      pdf,
      `[${meta.label}]`,
      ix,
      state.yPosition,
      meta.textColor,
      meta.bgColor,
      meta.borderColor
    );
    state.yPosition += pill.height + 3;
  }

  // ── Medication title ───────────────────────────────────────────────────────
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(15);
  setText(pdf, C_GRAY900);
  const titleLines = pdf.splitTextToSize(
    sanitizePdfText(title),
    iw
  ) as string[];
  pdf.text(titleLines, ix, state.yPosition + 4);
  state.yPosition += titleLines.length * (15 * 0.42 + 1.2) + 2;

  // ── Status pill under title ────────────────────────────────────────────────
  if (medStatus) {
    const status = classifyMedStatus(medStatus);
    const p = drawPill(
      pdf,
      status.label,
      ix,
      state.yPosition,
      status.textColor,
      status.bgColor,
      status.borderColor,
      { fontSize: 8, bold: true }
    );
    state.yPosition += p.height + 4;
  }

  // ── "MEDICATION ADMINISTRATION" sub-header + order-type badge ──────────────
  {
    const subHdrH = 9;
    setFill(pdf, C_GRAY50);
    setDraw(pdf, C_GRAY100);
    pdf.setLineWidth(0.25);
    pdf.roundedRect(ix, state.yPosition, iw, subHdrH, 1.5, 1.5, 'FD');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8.5);
    setText(pdf, C_GRAY700);
    pdf.text('MEDICATION ADMINISTRATION', ix + 3, state.yPosition + 6);
    if (medOrderType) {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7);
      const otText = medOrderType.toUpperCase();
      const otW = pdf.getTextWidth(otText) + 5.6;
      const otH = 7 * 0.42 + 1.3 * 2;
      setFill(pdf, C_GRAY200);
      setDraw(pdf, C_GRAY200);
      pdf.setLineWidth(0.2);
      pdf.roundedRect(
        ix + iw - otW - 2,
        state.yPosition + 1.3,
        otW,
        otH,
        otH / 2,
        otH / 2,
        'FD'
      );
      setText(pdf, C_GRAY700);
      pdf.text(
        otText,
        ix + iw - otW / 2 - 2,
        state.yPosition + 1.3 + otH - 1.3 - 0.3,
        { align: 'center' }
      );
    }
    state.yPosition += subHdrH + 2;
  }

  // ── Started + Duration timing ──────────────────────────────────────────────
  const startedTime = fieldOf(raw, 'startedTime', 'started_time');
  const duration = fieldOf(raw, 'duration');
  if (startedTime || duration) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    setText(pdf, C_TEXT_MUTED);
    const bits: string[] = [];
    if (startedTime) bits.push(`Started: ${startedTime}`);
    if (duration) {
      const secs = Number(duration);
      bits.push(
        `Duration: ${isNaN(secs) ? duration : formatDurationLabel(secs)}`
      );
    }
    pdf.text(sanitizePdfText(bits.join(' · ')), ix, state.yPosition + 3);
    state.yPosition += 5;
  }

  // ── Info chips (Due / Dose / Route / Freq) ─────────────────────────────────
  {
    const chips: string[] = [];
    if (hasMedVal(medDueTimeVal)) chips.push(`Due: ${medDueTimeVal}`);
    if (hasMedVal(medDoseVal)) chips.push(`Dose: ${medDoseVal}`);
    if (hasMedVal(medRouteVal)) chips.push(`Route: ${medRouteVal}`);
    if (hasMedVal(medFreqVal)) chips.push(`Freq: ${medFreqVal}`);
    if (chips.length > 0) {
      const chipH = 7.5 * 0.42 + 1.3 * 2;
      let chipX = ix;
      chips.forEach((chip) => {
        const { width } = drawInfoChip(pdf, chipX, state.yPosition, chip);
        if (chipX + width > ix + iw) {
          chipX = ix;
          state.yPosition += chipH + 2;
          drawInfoChip(pdf, chipX, state.yPosition, chip);
        }
        chipX += width + 2;
      });
      state.yPosition += chipH + 3;
    }
  }

  // ── Indication / Drug On Hand / Drug Expiration (grid) ─────────────────────
  if (
    hasMedVal(medIndication) ||
    hasMedVal(medDrugOnHand) ||
    hasMedVal(medExpiration)
  ) {
    const gridMid = ix + iw / 2;
    interface GridSlot {
      kind: 'text' | 'pill';
      label: string;
      value: string;
    }
    const slots: GridSlot[] = [];
    if (hasMedVal(medIndication))
      slots.push({ kind: 'text', label: 'INDICATION', value: medIndication });
    if (hasMedVal(medDrugOnHand))
      slots.push({ kind: 'text', label: 'DRUG ON HAND', value: medDrugOnHand });
    if (hasMedVal(medExpiration))
      slots.push({
        kind: 'pill',
        label: 'DRUG EXPIRATION',
        value: medExpiration,
      });

    const rowH = 14;
    const drawSlot = (slot: GridSlot, sx: number, sy: number): void => {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7);
      setText(pdf, C_GRAY400);
      pdf.text(slot.label, sx, sy + 3);
      if (slot.kind === 'text') {
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(10);
        setText(pdf, C_GRAY900);
        pdf.text(sanitizePdfText(slot.value), sx, sy + 9);
      } else {
        const isExpired = slot.value.toLowerCase().startsWith('expired');
        const expTC: RGB = isExpired ? [185, 28, 28] : [21, 128, 61];
        const expBG: RGB = isExpired ? [254, 242, 242] : [240, 253, 244];
        const expBC: RGB = isExpired ? [252, 165, 165] : [187, 247, 208];
        drawPill(
          pdf,
          isExpired ? 'Expired' : 'Not Expired',
          sx,
          sy + 4.5,
          expTC,
          expBG,
          expBC,
          { fontSize: 7.5 }
        );
      }
    };
    for (let i = 0; i < slots.length; i += 2) {
      drawSlot(slots[i], ix, state.yPosition);
      if (slots[i + 1]) drawSlot(slots[i + 1], gridMid, state.yPosition);
      state.yPosition += rowH;
    }
  }

  // ── Verification Checklist ─────────────────────────────────────────────────
  {
    drawMedSep(pdf, state, ix, iw, 'Verification Checklist');
    const verifRes = gradRes?.verificationResult;
    const verifExp = verifRes?.expected ?? [];
    const verifDoc = ((): string[] => {
      if ((verifRes?.actual?.length ?? 0) > 0) return verifRes?.actual ?? [];
      const items: string[] = [];
      const pv = adminDet.patientVerification;
      const mv = adminDet.medicationVerification;
      if (pv?.nameChecked) items.push('Asked patient to state their full name');
      if (pv?.dobChecked)
        items.push('Asked patient to state their date of birth');
      if (pv?.wristbandChecked) items.push('Scanned/checked patient wristband');
      if (mv?.nameVerified) items.push('Verified medication name');
      if (mv?.expiryChecked) items.push('Verified medication is not expired');
      if (mv?.allergiesVerified)
        items.push('Verified absence of allergies or contraindications');
      if (mv?.indicationConfirmed)
        items.push('Verified medication strength/concentration');
      return items;
    })();
    drawMedChecklist(
      pdf,
      state,
      ix,
      iw,
      'Medication Verification',
      normalizeChecklistList(
        verifExp,
        VERIFICATION_LABEL_MAP,
        VERIFICATION_ORDER
      ),
      normalizeChecklistList(
        verifDoc,
        VERIFICATION_LABEL_MAP,
        VERIFICATION_ORDER
      ),
      verifRes?.isCorrect ?? null
    );
  }

  // ── Clinical Decision ──────────────────────────────────────────────────────
  {
    drawMedSep(pdf, state, ix, iw, 'Clinical Decision');
    const cdComp = getComp('Clinical Decision');
    const fallbackRaw = hasMedVal(medClinDec)
      ? medClinDec
      : hasMedVal(medStatus)
        ? medStatus
        : '';
    const fallbackNorm = fallbackRaw.toLowerCase().trim();
    const fallbackDoc =
      fallbackNorm === 'hold'
        ? 'Held'
        : fallbackNorm === 'refuse'
          ? 'Refused'
          : fallbackRaw || undefined;
    const cdExp = cdComp ? compStr(cdComp.expected) : undefined;
    const cdActualFromComp = cdComp ? compStr(cdComp.actual) : '';
    const cdDoc = hasMedVal(cdActualFromComp) ? cdActualFromComp : fallbackDoc;
    drawMedCompRow(
      pdf,
      state,
      ix,
      iw,
      'Clinical Decision',
      cdExp,
      cdDoc,
      cdComp ? (cdComp.isCorrect ?? null) : null
    );
    if (hasMedVal(medAssessmentFindings))
      drawMedInfoLine(
        pdf,
        state,
        ix,
        iw,
        'Applicable Assessment Findings',
        medAssessmentFindings
      );
    if (hasMedVal(medReasonNotGiven))
      drawMedInfoLine(pdf, state, ix, iw, 'Reason', medReasonNotGiven);
    if (hasMedVal(medRefusalReason))
      drawMedInfoLine(pdf, state, ix, iw, 'Refusal reason', medRefusalReason);
    if (hasMedVal(medInappropriateReason))
      drawMedInfoLine(
        pdf,
        state,
        ix,
        iw,
        'Inappropriate reason',
        medInappropriateReason
      );
    if (hasMedVal(medClinicalNote))
      drawMedInfoLine(pdf, state, ix, iw, 'Note', medClinicalNote);
  }

  // ── Administration Details ─────────────────────────────────────────────────
  {
    drawMedSep(pdf, state, ix, iw, 'Administration Details');
    interface AdminRow {
      label: string;
      exp: string | undefined;
      doc: string | undefined;
      ok: boolean | null;
    }
    const adminRows: AdminRow[] = [];

    const doseComp = getComp('Dose');
    const dExp = doseComp ? compStr(doseComp.expected) : undefined;
    const dDoc = doseComp
      ? compStr(doseComp.actual)
      : hasMedVal(medAdminDose)
        ? medAdminDose
        : undefined;
    if (dExp || hasMedVal(dDoc))
      adminRows.push({
        label: 'Dose',
        exp: dExp,
        doc: dDoc,
        ok: doseComp ? (doseComp.isCorrect ?? null) : null,
      });

    const qtyComp = getComp('Quantity');
    const qExp = qtyComp
      ? compStr(qtyComp.expected)
      : hasMedVal(medExpectedQty)
        ? medExpectedQty
        : undefined;
    const qDoc = qtyComp
      ? compStr(qtyComp.actual)
      : hasMedVal(medQty)
        ? medQty
        : undefined;
    if (qExp || hasMedVal(qDoc))
      adminRows.push({
        label: 'Amount',
        exp: qExp,
        doc: qDoc,
        ok: qtyComp ? (qtyComp.isCorrect ?? null) : null,
      });

    const rsComp = getComp('Route vs Site') ?? getComp('Route');
    const rsExp = rsComp ? compStr(rsComp.expected) : undefined;
    const rsDocFallback =
      [medRouteVal, medSite].filter((v) => hasMedVal(v)).join(' (') +
      (hasMedVal(medSite) ? ')' : '');
    const rsDoc = rsComp ? compStr(rsComp.actual) : rsDocFallback || undefined;
    if (rsExp || hasMedVal(rsDoc))
      adminRows.push({
        label: 'Route vs Site',
        exp: rsExp,
        doc: rsDoc,
        ok: rsComp ? (rsComp.isCorrect ?? null) : null,
      });

    const timeComp = getComp('Administration Time');
    const tExp = timeComp ? compStr(timeComp.expected) : undefined;
    const tDoc = timeComp
      ? compStr(timeComp.actual)
      : hasMedVal(medTime)
        ? medTime
        : undefined;
    if (tExp || hasMedVal(tDoc))
      adminRows.push({
        label: 'Administration Time',
        exp: tExp,
        doc: tDoc,
        ok: timeComp ? (timeComp.isCorrect ?? null) : null,
      });

    for (const row of adminRows) {
      drawMedCompRow(pdf, state, ix, iw, row.label, row.exp, row.doc, row.ok);
    }
  }

  // ── Education Checklist ────────────────────────────────────────────────────
  {
    const eduRes = gradRes?.educationResult;
    const eduExp = eduRes?.expected ?? [];
    const eduDoc = ((): string[] => {
      if ((eduRes?.actual?.length ?? 0) > 0) return eduRes?.actual ?? [];
      const items: string[] = [];
      const pe = adminDet.patientEducation;
      if (pe?.discussedPurpose) items.push('Purpose Discussed');
      if (pe?.reviewedSideEffects) items.push('Side Effects Reviewed');
      if (pe?.providedInstructions) items.push('Instructions Provided');
      if (pe?.answeredQuestions) items.push('Questions Answered');
      if (pe?.patientUnderstanding) items.push('Patient Understanding');
      return items;
    })();
    if (eduExp.length > 0 || eduDoc.length > 0) {
      drawMedSep(pdf, state, ix, iw, 'Patient Education');
      drawMedChecklist(
        pdf,
        state,
        ix,
        iw,
        'Patient Education',
        normalizeChecklistList(eduExp, EDUCATION_LABEL_MAP, EDUCATION_ORDER),
        normalizeChecklistList(eduDoc, EDUCATION_LABEL_MAP, EDUCATION_ORDER),
        eduRes?.isCorrect ?? null
      );
    }
  }

  // ── Therapeutic Response / Adverse Effects / Notes ─────────────────────────
  if (
    hasMedVal(medTherapeuticResp) ||
    hasMedVal(medAdverseEffects) ||
    hasMedVal(medNotes)
  ) {
    drawMedSep(pdf, state, ix, iw, 'Reassessment & Notes');
    if (hasMedVal(medTherapeuticResp))
      drawMedInfoLine(
        pdf,
        state,
        ix,
        iw,
        'Therapeutic Response',
        medTherapeuticResp
      );
    if (hasMedVal(medAdverseEffects))
      drawMedInfoLine(pdf, state, ix, iw, 'Adverse Effects', medAdverseEffects);
    if (hasMedVal(medNotes))
      drawMedInfoLine(pdf, state, ix, iw, 'Notes', medNotes);
  }

  // ── Multi-page container border pass (Phase 7 pagination) ────────────────
  const segments = state.cardSegments ?? [{ page: startPage, top: startY }];
  state.cardSegments = null;
  state.activeCardBg = null;
  const endPage = state.pageNumber;
  const endY = state.yPosition;

  if (segments.length === 1 && startPage === endPage) {
    // Single-page: bg was painted to page bottom. Hide the excess with a
    // white overlay so the card looks tight to its content.
    // Phase 8: bottom padding = 7mm to match Student's padBot.
    const actualH = endY - startY + 7;
    if (page1BgBottom > actualH + 3) {
      pdf.setFillColor(255, 255, 255);
      pdf.rect(
        cardX - 0.5,
        startY + actualH,
        cardW + 1,
        page1BgBottom - actualH + 3,
        'F'
      );
    }
    setDraw(pdf, meta.borderColor);
    pdf.setLineWidth(0.35);
    pdf.roundedRect(cardX, startY, cardW, actualH, 2.5, 2.5, 'S');
    state.yPosition = startY + actualH + 5;
    return;
  }

  // Multi-page: bg already painted on every touched page — borders only.
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const isLast = i === segments.length - 1;
    const segTop = seg.top;
    // Phase 8: last-segment padding = 7mm (Student padBot).
    const segBottom = isLast ? endY + 7 : CONTENT_BOTTOM + 4;
    const segH = segBottom - segTop;
    if (segH <= 0) continue;
    if (seg.page !== state.pageNumber) pdf.setPage(seg.page);
    setDraw(pdf, meta.borderColor);
    pdf.setLineWidth(0.35);
    pdf.roundedRect(cardX, segTop, cardW, segH, 2.5, 2.5, 'S');
  }
  if (state.pageNumber !== endPage) pdf.setPage(endPage);
  state.pageNumber = endPage;
  state.yPosition = endY + 5;
}
