/**
 * Vital-signs aggregation card — replaces the per-event "one vital = one
 * generic summary card" rendering with a single compact table that mirrors
 * the Student PDF's "VITAL SIGNS OBTAINED" box.
 *
 * Ported from `HS-online-AI-app/frontend/app/reports/[id]/transcript/page.tsx`
 * (Vitals Data section, ~lines 4712–4830) — collapsed to work over the
 * educator's flat `TranscriptEventData[]` stream.
 *
 * Phase 7 of Student → Educator transcript PDF parity port.
 */

import type jsPDF from 'jspdf';

import { sanitizePdfText } from '../../../utils/sanitizePdf';
import type { TranscriptEventData } from '../../../types/userTranscript';

import {
  C_GRAY200,
  C_GRAY400,
  C_GRAY900,
  C_VITAL_BG,
  C_VITAL_BORDER,
  C_VITAL_TEXT,
} from './pdf-constants';
import {
  CONTENT_W,
  MARGIN_L,
  type PdfRenderState,
  drawClockBadge,
  drawPill,
  ensureSpace,
  setDraw,
  setFill,
  setText,
} from './pdf-primitives';
import { getVitalValue } from './transcript-utils';

// ─── Vital-title → short display label ───────────────────────────────────────

/**
 * Map the full titles that appear in the transcript to the short column
 * labels used in the aggregate table (HR / BP / RR / SpO2 / Temp / Pain).
 * Unknown titles pass through unchanged (uppercased).
 */
const VITAL_SHORT_LABEL: Record<string, string> = {
  'heart rate recorded': 'HR',
  'heart rate': 'HR',
  hr: 'HR',
  'blood pressure recorded': 'BP',
  'blood pressure': 'BP',
  bp: 'BP',
  'respiratory rate recorded': 'RR',
  'respiratory rate': 'RR',
  rr: 'RR',
  'temperature recorded': 'Temp',
  temperature: 'Temp',
  temp: 'Temp',
  'spo2 recorded': 'SpO2',
  spo2: 'SpO2',
  'oxygen saturation recorded': 'SpO2',
  'oxygen saturation': 'SpO2',
  'pain score': 'Pain',
  pain: 'Pain',
};

/** Preferred column ordering — matches Student PDF display order. */
const VITAL_ORDER: string[] = ['HR', 'BP', 'RR', 'SpO2', 'Temp', 'Pain'];

/** Returns true when the event is a vital-signs row that should be aggregated. */
export function isVitalEvent(raw: Record<string, unknown>): boolean {
  const category = String(raw['category'] ?? '').toLowerCase();
  if (
    category === 'vitals' ||
    category === 'vital-signs' ||
    category === 'vital signs'
  ) {
    return true;
  }
  const type = String(raw['type'] ?? raw['subType'] ?? '').toLowerCase();
  if (type === 'vital-signs' || type === 'vital') return true;
  const title = String(raw['title'] ?? '').toLowerCase();
  return title in VITAL_SHORT_LABEL;
}

// ─── Aggregation ─────────────────────────────────────────────────────────────

export interface VitalRow {
  name: string; // "HR" / "BP" / …
  count: number;
  values: string[]; // ["78 bpm", "82 bpm"]
}

interface VitalIndex {
  rows: VitalRow[];
  firstIndex: number; // index into data.events of the first vital
  vitalIndexSet: Set<number>; // indices in data.events that are vitals
}

/**
 * Walk `events` once and collect all vital rows grouped by short label,
 * preserving encounter order for the values column. Returns:
 *   • `rows`           — ordered array ready for rendering
 *   • `firstIndex`     — position of the first vital event (used to decide
 *                        WHERE to inject the aggregate card in the main loop)
 *   • `vitalIndexSet`  — indices to skip during the main rendering loop
 */
export function collectVitals(events: TranscriptEventData[]): VitalIndex {
  const groups = new Map<string, VitalRow>();
  const vitalIndexSet = new Set<number>();
  let firstIndex = -1;

  events.forEach((event, idx) => {
    const raw = event as unknown as Record<string, unknown>;
    if (!isVitalEvent(raw)) return;

    const titleRaw = String(raw['title'] ?? raw['name'] ?? '').trim();
    const details = String(
      raw['description'] ?? raw['details'] ?? raw['value'] ?? ''
    );
    const formatted =
      getVitalValue(titleRaw, details) ??
      details.replace(/^Value:\s*/i, '').trim();
    const valueText = (formatted || '').trim();

    // Skip completely empty vital rows so they don't pollute the aggregate
    // table with "VITAL x1 (N/A)" ghosts. Both title AND value must be blank
    // for a row to be dropped — either alone is enough to keep it.
    if (!titleRaw && !valueText) return;

    if (firstIndex === -1) firstIndex = idx;
    vitalIndexSet.add(idx);

    const shortLabel =
      VITAL_SHORT_LABEL[titleRaw.toLowerCase()] ??
      (titleRaw ? titleRaw.toUpperCase() : 'VITAL');

    const existing = groups.get(shortLabel);
    if (existing) {
      existing.count += 1;
      existing.values.push(valueText || 'N/A');
    } else {
      groups.set(shortLabel, {
        name: shortLabel,
        count: 1,
        values: [valueText || 'N/A'],
      });
    }
  });

  // Sort rows by the preferred order table (unknown vitals go last).
  const rows = Array.from(groups.values()).sort((a, b) => {
    const ai = VITAL_ORDER.indexOf(a.name);
    const bi = VITAL_ORDER.indexOf(b.name);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.name.localeCompare(b.name);
  });

  return { rows, firstIndex, vitalIndexSet };
}

// ─── Renderer ────────────────────────────────────────────────────────────────

const CARD_PAD = 6;
const CLOCK_BADGE_H = 9 * 0.42 + 1.8 * 2;

/**
 * Render the aggregate "Vital Signs Obtained" card. Layout:
 *
 *   [clock 00:00 — green]
 *
 *   ┌─── green Vitals card ──────────────────────────────────────┐
 *   │ [VITALS]                                                    │
 *   │                                                             │
 *   │ Vital Signs                                                 │
 *   │                                                             │
 *   │ ┌ VITAL SIGNS OBTAINED ────────────────────────────────┐   │
 *   │ │ HR x3   (78 bpm; 82 bpm; 80 bpm)                     │   │
 *   │ │ BP x2   (120/80 mmHg; 118/76 mmHg)                   │   │
 *   │ │ RR x2   (16 breaths/min; 18 breaths/min)             │   │
 *   │ │ SpO2 x2 (98%; 99%)                                    │   │
 *   │ └───────────────────────────────────────────────────────┘   │
 *   └─────────────────────────────────────────────────────────────┘
 */
export function renderVitalsCard(
  pdf: jsPDF,
  state: PdfRenderState,
  rows: VitalRow[]
): void {
  if (rows.length === 0) return;

  // ── Row-based height estimate ─────────────────────────────────────────────
  const cardX = MARGIN_L;
  const cardW = CONTENT_W;
  const ix = cardX + CARD_PAD;
  const iw = cardW - CARD_PAD * 2;

  const pillH = 7.5 * 0.42 + 1.3 * 2; // Same formula as drawPill
  const titleH = 15 * 0.42 + 1.2;
  const boxHdr = 7;
  const vRowH = 6;
  const vBoxH = 5 + boxHdr + rows.length * vRowH + 3;
  const estCard = CARD_PAD + pillH + 3 + titleH + 4 + 4 + vBoxH + CARD_PAD + 4;

  ensureSpace(pdf, state, CLOCK_BADGE_H + 3 + estCard + 5);

  // ── Clock badge (green vital colour) ──────────────────────────────────────
  const bh = drawClockBadge(
    pdf,
    state,
    '00:00',
    C_VITAL_TEXT,
    C_VITAL_BG,
    C_VITAL_BORDER
  );
  state.yPosition += bh + 3;

  // ── Card container (green fill + border) ──────────────────────────────────
  const startY = state.yPosition;
  setFill(pdf, C_VITAL_BG);
  setDraw(pdf, C_VITAL_BORDER);
  pdf.setLineWidth(0.35);
  pdf.roundedRect(cardX, startY, cardW, estCard, 2.5, 2.5, 'FD');

  state.yPosition = startY + CARD_PAD;

  // ── Category pill "[VITALS]" ──────────────────────────────────────────────
  const pill = drawPill(
    pdf,
    '[VITALS]',
    ix,
    state.yPosition,
    C_VITAL_TEXT,
    C_VITAL_BG,
    C_VITAL_BORDER
  );
  state.yPosition += pill.height + 3;

  // ── Title ─────────────────────────────────────────────────────────────────
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(15);
  setText(pdf, C_GRAY900);
  pdf.text(sanitizePdfText('Vital Signs'), ix, state.yPosition + 4);
  state.yPosition += titleH + 4;

  // ── Inner "VITAL SIGNS OBTAINED" white box + rows ─────────────────────────
  state.yPosition += 4;
  setFill(pdf, [255, 255, 255]);
  setDraw(pdf, C_GRAY200);
  pdf.setLineWidth(0.4);
  pdf.roundedRect(ix - 2, state.yPosition, iw + 4, vBoxH, 2, 2, 'FD');
  state.yPosition += 4;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7.5);
  setText(pdf, C_GRAY400);
  pdf.text('VITAL SIGNS OBTAINED:', ix, state.yPosition + 3);
  state.yPosition += 7;

  rows.forEach((vr) => {
    const nameStr = `${vr.name} x${vr.count}`;
    const valueStr = `(${vr.values.join('; ')})`;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    setText(pdf, C_GRAY900);
    pdf.text(sanitizePdfText(nameStr), ix, state.yPosition + 3);
    const nameW = pdf.getTextWidth(nameStr) + 4;
    setText(pdf, C_VITAL_TEXT);
    pdf.text(sanitizePdfText(valueStr), ix + nameW, state.yPosition + 3);
    state.yPosition += vRowH;
  });
  state.yPosition += 2;

  // ── Container stretch if needed ───────────────────────────────────────────
  const actualH = state.yPosition - startY + 4;
  if (actualH > estCard) {
    setFill(pdf, C_VITAL_BG);
    pdf.rect(
      cardX,
      startY + estCard - 0.5,
      cardW,
      actualH - estCard + 0.5,
      'F'
    );
    setDraw(pdf, C_VITAL_BORDER);
    pdf.setLineWidth(0.35);
    pdf.roundedRect(cardX, startY, cardW, actualH, 2.5, 2.5, 'S');
  }

  state.yPosition = startY + Math.max(estCard, actualH) + 5;
}
