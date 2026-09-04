/**
 * PDF event card renderers — dispatches to speaker-, category-, and
 * common-action-specific rendering paths that all share the primitives
 * in `pdf-primitives.ts` and the metadata in `pdf-constants.ts`.
 *
 * Ported/adapted from the Student transcript PDF
 * (`HS-online-AI-app/frontend/app/reports/[id]/transcript/page.tsx`,
 * `handleDownloadTranscript` — timeline `.forEach` loop).
 *
 * Phase 3 of Student → Educator transcript PDF parity port.
 *
 * IMPORTANT — out of scope for Phase 3 (implemented in later phases):
 *   • Phase 5: SBAR cards (prompt / submission / result blocks)
 *   • Phase 6: medication grading cards (verification + education checklists,
 *              Expected|Documented comparison rows, status pills)
 *   • Phase 7: vitals aggregation card (short-id table)
 * These paths are stubbed to fall through to the generic summary card until
 * their dedicated renderers land.
 */

import type jsPDF from "jspdf";

import { sanitizePdfText } from "../../../utils/sanitizePdf";
import type { TranscriptEventData } from "../../../types/userTranscript";

import {
  C_DANGER,
  C_DANGER_BG,
  C_GRAY400,
  C_GRAY900,
  C_SUCCESS,
  C_SUCCESS_BG,
  C_TEXT_PRIMARY,
  C_TEXT_SECONDARY,
  getCategoryMetaPdf,
  getCommonActionMeta,
  getSpeakerMeta,
} from "./pdf-constants";
import {
  CONTENT_BOTTOM,
  CONTENT_W,
  MARGIN_L,
  MARGIN_R,
  PAGE_W,
  type PdfRenderState,
  drawClockBadge,
  drawPill,
  drawSpeakerIcon,
  drawStatusPill,
  ensureSpace,
  setDraw,
  setFill,
  setText,
} from "./pdf-primitives";
import { formatActionType } from "./transcript-utils";
import {
  isMedicationEvent,
  renderMedicationCard,
} from "./pdf-medication-renderer";

// ─── Constants tuned to match the Student PDF exactly ────────────────────────

/** Card outer padding (mm) — matches Student `drawBubbleCard` inset. */
const CARD_PAD = 6;
/** Inner content width inside a card (mm). */
const CARD_INNER_W = CONTENT_W - CARD_PAD * 2;
/** Constant clock badge height (fontSize 9 × 0.42 + padY 1.8 × 2). */
const CLOCK_BADGE_H = 9 * 0.42 + 1.8 * 2;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toStr(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return (v as unknown[]).map(String).join(", ");
  return String(v);
}

function fieldOf(
  raw: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  for (const k of keys) {
    const v = raw[k];
    if (v != null && String(v).trim() !== "" && String(v) !== "undefined") {
      return String(v);
    }
  }
  return undefined;
}

/**
 * Return the elapsed-time label to render inside the clock badge. Mirrors the
 * on-screen `EventCard` derivation so the PDF badge is identical to what the
 * transcript page shows:
 *   1. Any string form (`simulationTime`, `elapsedTime`, …).
 *   2. Numeric `elapsedSeconds` → `mm:ss` (rounded), preserving 0 as `"0:00"`.
 *   3. Final fallback `"00:00"`.
 */
function elapsedFor(raw: Record<string, unknown>): string {
  const str = fieldOf(raw, "simulationTime", "simulation_time", "elapsedTime", "elapsed_time");
  if (str) return str;

  const secsRaw = raw["elapsedSeconds"] ?? raw["elapsed_seconds"] ?? raw["elapsedSecs"];
  const secsNum =
    typeof secsRaw === "number"
      ? secsRaw
      : typeof secsRaw === "string" && secsRaw.trim() && !isNaN(parseFloat(secsRaw))
        ? parseFloat(secsRaw)
        : undefined;

  if (secsNum !== undefined && secsNum >= 0) {
    const s = Math.max(0, Math.round(secsNum));
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, "0")}`;
  }

  return "00:00";
}

/**
 * Format a wall-clock timestamp string (ISO or MM/DD/YYYY, HH:MM:SS…) into a
 * short "Started/Ended" segment. Returns '' when the value is missing or
 * clearly a simulation virtual-world clock (year < 2020).
 */
function fmtTs(raw: string | undefined): string {
  if (!raw) return "";
  try {
    const d = new Date(raw);
    if (isNaN(d.getTime()) || d.getFullYear() < 2020) return "";
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const yy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${mm}/${dd}/${yy}, ${hh}:${mi}:${ss}`;
  } catch {
    return "";
  }
}

/**
 * Build the "Started: … | Ended: …" text used inside the pill/timestamp row.
 *
 * Tries ISO-string fields first (`startedTime`/`endedTime` set by the API
 * mapper). If those are absent — as is the case for common-action events whose
 * timestamps are stored as epoch-ms in `timestampMs`/`timestamp_ms` — it falls
 * back to the same epoch-ms logic the on-page transcript uses, including the
 * duration-based start-time calculation that mirrors `renderCommonActionCard`
 * in UserTranscriptPage.tsx.
 */
function timestampRowText(raw: Record<string, unknown>): string {
  let started = fmtTs(fieldOf(raw, "startedTime", "started_time", "start_time"));
  const ended  = fmtTs(fieldOf(raw, "endedTime",   "ended_time",   "end_time"));

  // Single-point events: the API stores one timestamp as endedTime.
  // Show it as both Started and Ended to match the web page.
  if (!started && ended) started = ended;

  // Duration helper — matches formatDurationLabel on the web page.
  const parseDur = (): string => {
    const d = raw["duration"];
    const s = typeof d === "number" ? d
      : typeof d === "string" && (d as string).trim()
        ? parseFloat((d as string).replace(/[^\d.]/g, ""))
        : NaN;
    if (!isFinite(s) || s <= 0) return "";
    if (s < 60) return `${Math.round(s)}s`;
    const m = Math.floor(s / 60);
    const r = Math.round(s % 60);
    return r > 0 ? `${m}m ${r}s` : `${m}m`;
  };
  const dur = parseDur();

  if (started || ended) {
    return [started ? `Started: ${started}` : "",
            ended   ? `Ended: ${ended}`     : "",
            dur     ? `Duration: ${dur}`    : ""]
      .filter(Boolean)
      .join("  |  ");
  }

  // Epoch-ms fallback — mirrors the web page's caStartMs / caEndMs logic.
  const endMs: number | undefined =
    typeof raw["timestampMs"] === "number" ? (raw["timestampMs"] as number) :
    typeof raw["timestamp_ms"] === "number" ? (raw["timestamp_ms"] as number) :
    typeof raw["timestampValue"] === "number" ? (raw["timestampValue"] as number) :
    typeof raw["timestamp_value"] === "number" ? (raw["timestamp_value"] as number) :
    typeof raw["endTimestampValue"] === "number" ? (raw["endTimestampValue"] as number) :
    (typeof raw["endedTime"] === "string" && raw["endedTime"] ? new Date(raw["endedTime"] as string).getTime() || undefined : undefined);

  if (!endMs || endMs < 0) return "";

  const durationRaw = raw["duration"];
  const durationSec =
    typeof durationRaw === "number" ? durationRaw :
    typeof durationRaw === "string" && (durationRaw as string).trim()
      ? parseFloat((durationRaw as string).replace(/[^\d.]/g, ""))
      : NaN;

  const startMs = isFinite(durationSec) && durationSec > 0
    ? endMs - durationSec * 1000
    : endMs;

  const startStr = fmtEpochTs(startMs);
  const endStr   = fmtEpochTs(endMs);
  return [startStr ? `Started: ${startStr}` : "",
          endStr   ? `Ended: ${endStr}`     : "",
          dur      ? `Duration: ${dur}`     : ""]
    .filter(Boolean)
    .join("  |  ");
}

// ─── Sub-box (Clinical Prompt / Student Response / Notes) ────────────────────

/**
 * Draw a labelled sub-box inside a card. Advances `state.yPosition` past the
 * box. Returns the height consumed (mm). Matches Student `drawSubBox` for
 * plain-text cases (numbered-list variant is deferred to a future phase — it
 * only affects ordering-type questions).
 */
function drawSubBox(
  pdf: jsPDF,
  state: PdfRenderState,
  labelText: string,
  valueText: string,
  labelColor: [number, number, number],
  bgColor: [number, number, number],
  borderColor: [number, number, number],
  innerX: number,
  innerW: number,
): number {
  const labelH = 3.6;
  const valPad = 3;
  const rowH   = 4.4;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  // Split on \n first so pre-formatted text (e.g. numbered lists) renders
  // on separate lines, then word-wrap each segment independently.
  const lines: string[] = [];
  for (const segment of valueText.split("\n")) {
    const wrapped = pdf.splitTextToSize(sanitizePdfText(segment || " "), innerW - 6) as string[];
    lines.push(...wrapped);
  }
  const bodyH = Math.max(rowH, lines.length * rowH);
  const boxH  = labelH + bodyH + valPad + 3;

  setFill(pdf, bgColor);
  setDraw(pdf, borderColor);
  pdf.setLineWidth(0.3);
  pdf.roundedRect(innerX, state.yPosition, innerW, boxH, 2, 2, "FD");

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7);
  setText(pdf, labelColor);
  pdf.text(sanitizePdfText(labelText.toUpperCase()), innerX + 3, state.yPosition + 4);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  setText(pdf, C_TEXT_PRIMARY);
  pdf.text(lines, innerX + 3, state.yPosition + labelH + 4);

  state.yPosition += boxH + 3;
  return boxH + 3;
}

// ─── Timestamp row inside a card ─────────────────────────────────────────────

/**
 * Draw the "badge pill + Started/Ended timestamps" row inside a card.
 * Advances `state.yPosition` to the row directly below.
 */
function drawTimestampRow(
  pdf: jsPDF,
  state: PdfRenderState,
  innerX: number,
  innerW: number,
  pillLabel: string,
  pillTextColor: [number, number, number],
  pillBgColor: [number, number, number],
  pillBorderColor: [number, number, number],
  pillIcon: Parameters<typeof drawSpeakerIcon>[1] | undefined,
  tsText: string,
): void {
  const pill = drawPill(
    pdf,
    pillLabel,
    innerX,
    state.yPosition,
    pillTextColor,
    pillBgColor,
    pillBorderColor,
    pillIcon ? { iconType: pillIcon } : undefined,
  );

  if (tsText) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    setText(pdf, C_TEXT_PRIMARY);
    const tsBaseY = state.yPosition + pill.height / 2 + (8 * 0.42) / 2 - 0.3;
    const maxTsW = innerW - pill.width - 4;
    const clipped = (
      pdf.splitTextToSize(sanitizePdfText(tsText), Math.max(20, maxTsW)) as string[]
    )[0];
    pdf.text(clipped, innerX + pill.width + 3, tsBaseY);
  }

  state.yPosition += pill.height + 3;
}

// ─── Content sub-boxes (shared across all card types) ───────────────────────

/**
 * Detect whether an event carries a satisfactory / correct verdict of any
 * kind. Returns:
 *   • `null`      — no verdict field present, skip pill entirely
 *   • `positive`  — Correct / Satisfactory (green pill)
 *   • `negative`  — Incorrect / Unsatisfactory (red pill)
 *
 * Also returns the exact label to render, distinguishing question-style events
 * ("SATISFACTORY" / "UNSATISFACTORY") from action-style events ("CORRECT" /
 * "INCORRECT") — matches Student PDF pill copy.
 */
function classifyStatus(
  raw: Record<string, unknown>,
): { label: string; positive: boolean } | null {
  const correctRaw = raw["correct"];
  const hasCorrect =
    correctRaw !== undefined && correctRaw !== null && correctRaw !== "";
  const isCorrect =
    correctRaw === true ||
    correctRaw === "true" ||
    correctRaw === 1 ||
    correctRaw === "1";

  const satisfactoryRaw =
    raw["satisfactory"] ?? raw["satisfactoryResult"] ?? raw["result"];
  const hasSatisfactory =
    satisfactoryRaw !== undefined &&
    satisfactoryRaw !== null &&
    satisfactoryRaw !== "";
  const satisfactoryStr = String(satisfactoryRaw ?? "").toLowerCase();
  // Explicit satisfactory / unsatisfactory strings win over the boolean check.
  const isSatisfactory =
    hasSatisfactory &&
    (/^(satisfactory|true|1|yes|pass|passed)$/i.test(satisfactoryStr) ||
      /satisfactor/i.test(satisfactoryStr));
  const isUnsatisfactory =
    hasSatisfactory && /unsatisfactor|fail|failed|no/i.test(satisfactoryStr);

  // A `.question` field means the row is a question-type entry — use
  // Satisfactory / Unsatisfactory labels instead of Correct / Incorrect.
  const isQuestion =
    typeof raw["question"] === "string" &&
    (raw["question"] as string).trim().length > 0;

  if (hasSatisfactory && (isSatisfactory || isUnsatisfactory)) {
    return {
      label: isSatisfactory ? "SATISFACTORY" : "UNSATISFACTORY",
      positive: isSatisfactory,
    };
  }
  if (hasCorrect) {
    if (isQuestion) {
      return {
        label: isCorrect ? "SATISFACTORY" : "UNSATISFACTORY",
        positive: isCorrect,
      };
    }
    return {
      label: isCorrect ? "\u2713  CORRECT" : "\u2715  INCORRECT",
      positive: isCorrect,
    };
  }
  return null;
}

/** Render the Correct / Incorrect / Satisfactory / Unsatisfactory status pill. */
function renderStatusPill(
  pdf: jsPDF,
  state: PdfRenderState,
  raw: Record<string, unknown>,
  x: number,
): void {
  const status = classifyStatus(raw);
  if (!status) return;

  const borderPositive: [number, number, number] = [167, 243, 208]; // emerald-200
  const borderNegative: [number, number, number] = [252, 165, 165]; // red-300

  state.yPosition += 1;
  const { height } = drawStatusPill(
    pdf,
    status.label,
    x,
    state.yPosition,
    status.positive ? C_SUCCESS : C_DANGER,
    status.positive ? C_SUCCESS_BG : C_DANGER_BG,
    status.positive ? borderPositive : borderNegative,
  );
  state.yPosition += height + 3;
}

/**
 * Render the three content sub-boxes (Clinical Prompt / Student Response /
 * Observations & Notes) when the corresponding fields are present. Shared
 * by every card renderer so questions on messages, common actions and
 * summary entries all look the same.
 */
function drawContentSubBoxes(
  pdf: jsPDF,
  state: PdfRenderState,
  ix: number,
  iw: number,
  question: string,
  answer: string,
  notes: string,
): void {
  if (question) {
    drawSubBox(
      pdf, state,
      "Clinical Prompt", question,
      [234, 88, 12],
      [255, 247, 237],
      [254, 215, 170],
      ix, iw,
    );
  }
  if (answer) {
    drawSubBox(
      pdf, state,
      "Student Response", answer,
      [5, 150, 105],
      [236, 253, 245],
      [167, 243, 208],
      ix, iw,
    );
  }
  if (notes) {
    drawSubBox(
      pdf, state,
      "Observations / Notes", notes,
      [37, 99, 235],
      [239, 246, 255],
      [191, 219, 254],
      ix, iw,
    );
  }
}

// ─── Bubble card wrapper ─────────────────────────────────────────────────────

/**
 * Reserve a card container with `bgColor` fill + `borderColor` outline, run
 * the caller-provided body renderer inside it, and stretch the container to
 * exactly wrap the rendered body height.
 *
 * Phase 7 — multi-page cards paint bg fill + border on EVERY page the card
 * touches, using `state.cardSegments` populated by `ensureSpace` on each
 * mid-body page break. Rules:
 *   • Segment 0 (first page): bg + border rect from startY to the point body
 *     transitioned to the next page (or endY on single-page cards).
 *   • Middle segments: bg + border rect from CONTENT_TOP to CONTENT_BOTTOM.
 *   • Last segment: bg + border rect from CONTENT_TOP to endY.
 *
 * The initial bg fill for the FIRST page is painted BEFORE body runs (so
 * body text lands on top). Continuation bg for later pages is painted by
 * `drawPageHeader` via `state.activeCardBg`. Borders for all pages are
 * painted AFTER body via the segment loop (borders don't hide text).
 */
function drawBubbleCard(
  pdf: jsPDF,
  state: PdfRenderState,
  bgColor: [number, number, number],
  borderColor: [number, number, number],
  estimatedHeight: number,
  body: (innerX: number, innerW: number) => void,
): void {
  // Ensure at least a minimal header row fits so we never orphan the card
  // container. Body may still overflow — segment tracking handles that.
  ensureSpace(pdf, state, Math.min(estimatedHeight + 4, 60));

  const cardX = MARGIN_L;
  const cardW = CONTENT_W;
  const startY = state.yPosition;
  const startPage = state.pageNumber;

  // Phase 7 refinement: always paint the first-page bg out to the page
  // bottom. This guarantees that IF body content later extends past the
  // estimated height on page 1 (before triggering ensureSpace), there is
  // still bg fill behind that text. For single-page short cards we hide the
  // excess with a white rect below the actual card at the end (matches
  // Student `drawBubbleCard` pattern).
  const page1BgBottom = CONTENT_BOTTOM - startY + 6;
  setFill(pdf, bgColor);
  pdf.rect(cardX, startY, cardW, page1BgBottom, "F");

  // Enable continuation bg + segment tracking for the body.
  state.activeCardBg = bgColor;
  state.cardSegments = [{ page: startPage, top: startY }];
  state.yPosition = startY + CARD_PAD;
  body(cardX + CARD_PAD, cardW - CARD_PAD * 2);
  const segments = state.cardSegments;
  state.cardSegments = null;
  state.activeCardBg = null;

  const endPage = state.pageNumber;
  const endY = state.yPosition;

  if (segments.length === 1 && startPage === endPage) {
    // Single-page: bg was painted to page bottom. If actual body height is
    // shorter, hide the excess bg with white so the card looks tight to
    // its content. Phase 8: bottom padding = 7mm to match Student's padBot.
    const actualH = endY - startY + 7;
    if (page1BgBottom > actualH + 3) {
      pdf.setFillColor(255, 255, 255);
      pdf.rect(cardX - 0.5, startY + actualH, cardW + 1, page1BgBottom - actualH + 3, "F");
    }
    setDraw(pdf, borderColor);
    pdf.setLineWidth(0.35);
    pdf.roundedRect(cardX, startY, cardW, actualH, 2.5, 2.5, "S");
    state.yPosition = startY + actualH + 5;
    return;
  }

  // Multi-page: bg is already painted on every touched page
  //   • page 1  → initial `pdf.rect` above (to page bottom)
  //   • pages 2+ → drawPageHeader() paints `state.activeCardBg` fill
  // We only need to paint borders per segment.
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const isLast = i === segments.length - 1;
    const segTop = seg.top;
    // Phase 8: last-segment padding = 7mm (Student padBot). Middle segments
    // extend to CONTENT_BOTTOM + 4 so the border reaches the page edge.
    const segBottom = isLast ? endY + 7 : CONTENT_BOTTOM + 4;
    const segH = segBottom - segTop;
    if (segH <= 0) continue;

    if (seg.page !== state.pageNumber) {
      pdf.setPage(seg.page);
    }
    setDraw(pdf, borderColor);
    pdf.setLineWidth(0.35);
    pdf.roundedRect(cardX, segTop, cardW, segH, 2.5, 2.5, "S");
  }
  // Restore cursor to the end page.
  if (state.pageNumber !== endPage) {
    pdf.setPage(endPage);
  }
  state.pageNumber = endPage;
  state.yPosition = endY + 5;
}

// ─── Height estimation ───────────────────────────────────────────────────────

function estimateMessageCardHeight(pdf: jsPDF, message: string): number {
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(12.75);
  const lines = pdf.splitTextToSize(sanitizePdfText(message), CARD_INNER_W) as string[];
  return 6 + 6 + lines.length * 5.36 + 12;
}

function estimateSummaryCardHeight(
  pdf: jsPDF,
  title: string,
  subLabel: string | undefined,
  question: string | undefined,
  answer: string | undefined,
  notes: string | undefined,
  description: string | undefined,
  hasStatus: boolean,
): number {
  let h = 6 + 5 + 6; // pill + ts + base padding

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(15);
  const tLines = (pdf.splitTextToSize(sanitizePdfText(title), CARD_INNER_W) as string[]).length;
  h += tLines * (15 * 0.42 + 1.2) + 2;

  if (subLabel) h += 6;

  if (question) {
    const qLines = (pdf.splitTextToSize(sanitizePdfText(question), CARD_INNER_W - 6) as string[]).length;
    h += qLines * 4.4 + 12;
  }
  if (answer) {
    const aStr = typeof answer === "string" ? answer : String(answer);
    const aLines = (pdf.splitTextToSize(sanitizePdfText(aStr), CARD_INNER_W - 6) as string[]).length;
    h += aLines * 4.4 + 12;
  }
  if (notes) {
    const nLines = (pdf.splitTextToSize(sanitizePdfText(notes), CARD_INNER_W - 6) as string[]).length;
    h += nLines * 4.4 + 12;
  }
  if (!question && !answer && !notes && description) {
    const dLines = (pdf.splitTextToSize(sanitizePdfText(description), CARD_INNER_W) as string[]).length;
    h += dLines * 4.4 + 6;
  }
  if (hasStatus) h += 10;
  return h + 12;
}

// ─── Message bubble renderer ─────────────────────────────────────────────────

/**
 * Render a speaker message (user / assistant / provider / order / sbar_report /
 * system / student_team_comm). Draws:
 *   • Row 1: elapsed-time clock badge (left) + avatar circle w/ speaker icon
 *   • Card body: pill badge + Started/Ended row, then the message text.
 * Student speakers are right-aligned inside the card.
 */
function renderMessageBubble(
  pdf: jsPDF,
  state: PdfRenderState,
  event: TranscriptEventData,
): void {
  const raw = event as unknown as Record<string, unknown>;
  const speaker = (fieldOf(raw, "speaker", "role") ?? "assistant").toLowerCase();
  const meta    = getSpeakerMeta(speaker);
  const message = toStr(fieldOf(raw, "description", "text", "content", "message", "transcript"));

  // Some backends attach question/answer/notes on message events (e.g. when a
  // student's Team-Communication reply is nested inside the SBAR record).
  // Render the same sub-boxes + status pill as summary cards so nothing is
  // silently dropped.
  const question = toStr(fieldOf(raw, "question", "prompt", "clinicalPrompt", "clinical_prompt"));
  const answer   = toStr(fieldOf(raw, "answer", "response", "studentResponse", "student_response"));
  const notes    = toStr(fieldOf(raw, "notes", "observations"));
  const hasStatus = classifyStatus(raw) !== null;

  // ── Row 1: clock badge (left) + avatar (right) ─────────────────────────────
  const avatarR = 5.5;
  const rowH    = avatarR * 2 + 2;

  // Height estimate: bubble text + extra room for optional sub-boxes + status.
  const extraQAH = (question ? 18 : 0) + (answer ? 18 : 0) + (notes ? 18 : 0);
  const extraStatus = hasStatus ? 10 : 0;
  const estCard = estimateMessageCardHeight(pdf, message) + extraQAH + extraStatus;
  ensureSpace(pdf, state, rowH + 2 + estCard + 5);

  drawClockBadge(
    pdf,
    state,
    elapsedFor(raw),
    meta.textColor,
    meta.bgColor,
    meta.borderColor,
    state.yPosition + (rowH - CLOCK_BADGE_H) / 2,
  );

  const avatarCX = PAGE_W - MARGIN_R - avatarR;
  const avatarCY = state.yPosition + avatarR + 1;
  setFill(pdf, meta.bgColor);
  setDraw(pdf, meta.borderColor);
  pdf.setLineWidth(0.5);
  pdf.circle(avatarCX, avatarCY, avatarR, "FD");
  drawSpeakerIcon(pdf, meta.iconType, avatarCX, avatarCY, avatarR * 1.1, meta.textColor);

  state.yPosition += rowH + 2;

  // ── Card body ──────────────────────────────────────────────────────────────
  const tsText = timestampRowText(raw);

  drawBubbleCard(pdf, state, meta.bubbleBg, meta.borderColor, estCard, (ix, iw) => {
    drawTimestampRow(pdf, state, ix, iw, meta.label, meta.textColor, meta.bgColor, meta.borderColor, meta.iconType, tsText);

    if (message) {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(12.75);
      setText(pdf, C_TEXT_PRIMARY);
      const lines = pdf.splitTextToSize(sanitizePdfText(message), iw) as string[];
      const lineH = 5.36;

      if (meta.rightAlign) {
        lines.forEach((line: string) => {
          const lw = pdf.getTextWidth(line);
          pdf.text(line, ix + iw - lw, state.yPosition + 3);
          state.yPosition += lineH;
        });
      } else {
        pdf.text(lines, ix, state.yPosition + 3);
        state.yPosition += lines.length * lineH;
      }
      state.yPosition += 2;
    }

    // Optional Clinical Prompt / Student Response / Notes.
    drawContentSubBoxes(pdf, state, ix, iw, question, answer, notes);

    // Correctness / Satisfactory pill (when the message carries a verdict).
    renderStatusPill(pdf, state, raw, ix);
  });
}

// ─── Common action renderer ──────────────────────────────────────────────────

/**
 * Render a common-action event (infection / privacy / environmental).
 * Uses `getCommonActionMeta` for palette and shows the type label as a
 * subtitle under the action title.
 */
function renderCommonActionCard(
  pdf: jsPDF,
  state: PdfRenderState,
  event: TranscriptEventData,
): void {
  const raw = event as unknown as Record<string, unknown>;
  const subType =
    (fieldOf(raw, "commonActionType", "common_action_type", "subType", "sub_type", "type", "actionType") ??
      "infection")
      .toLowerCase();
  const normalisedType = subType.includes("privacy")
    ? "privacy"
    : subType.includes("environmental") || subType.includes("environment")
      ? "environmental"
      : "infection";
  const meta = getCommonActionMeta(normalisedType);

  const title    = toStr(fieldOf(raw, "title", "name", "label", "action"));
  const question = toStr(fieldOf(raw, "question", "prompt", "clinicalPrompt", "clinical_prompt"));
  const answer   = toStr(fieldOf(raw, "answer", "response", "studentResponse", "student_response"));
  const notes    = toStr(fieldOf(raw, "notes", "observations"));
  // description is extracted for the hasSubstantialContent check in renderSummaryCard;
  // not directly used in this renderer (category label serves as subtitle).
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _description = toStr(fieldOf(raw, "description", "details", "text", "content"));

  // A common action only needs a title to be renderable (category label
  // is shown as subtitle). Drop only truly title-less phantoms.
  if (!title) return;

  const hasStatus = classifyStatus(raw) !== null;
  const tsText   = timestampRowText(raw);

  // Rough height estimate — title row + subtitle + sub-boxes + optional pill.
  const baseH = 40;
  const extraQAH =
    (question ? 18 : 0) + (answer ? 18 : 0) + (notes ? 18 : 0);
  const extraStatus = hasStatus ? 10 : 0;
  const estCard = baseH + extraQAH + extraStatus;

  // Clock badge in the specific action colour.
  ensureSpace(pdf, state, CLOCK_BADGE_H + 3 + estCard + 5);
  const bh = drawClockBadge(pdf, state, elapsedFor(raw), meta.textColor, meta.bgColor, meta.borderColor);
  state.yPosition += bh + 3;

  drawBubbleCard(pdf, state, meta.bgColor, meta.borderColor, estCard, (ix, iw) => {
    drawTimestampRow(pdf, state, ix, iw, "Common Actions", meta.textColor, meta.bgColor, meta.borderColor, undefined, tsText);

    // Title
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(14.25);
    setText(pdf, C_GRAY900);
    const titleLines = pdf.splitTextToSize(sanitizePdfText(title || "Common Action"), iw) as string[];
    pdf.text(titleLines, ix, state.yPosition + 4);
    state.yPosition += titleLines.length * 6 + 4;

    // Type subtitle (uppercase, small, gray)
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7.5);
    setText(pdf, C_GRAY400);
    pdf.text(sanitizePdfText(normalisedType.toUpperCase()), ix, state.yPosition);
    state.yPosition += 5;

    // Optional Clinical Prompt / Student Response / Notes.
    drawContentSubBoxes(pdf, state, ix, iw, question, answer, notes);

    // Correct / Incorrect (or Satisfactory) pill.
    renderStatusPill(pdf, state, raw, ix);
  });
}

// ─── Summary entry renderer (categories) ─────────────────────────────────────

/**
 * Render a category-based summary entry — the "everything else" bucket that
 * covers vitals, demographics, history, actions, orders, medications (basic
 * layout), team_communication (basic layout).
 *
 * Medication grading + SBAR blocks are intentionally NOT rendered here —
 * they land in Phase 5 (SBAR) and Phase 6 (medication grading). For those
 * categories we still show the title + category chip + description so the
 * event isn't lost.
 */
function renderSummaryCard(
  pdf: jsPDF,
  state: PdfRenderState,
  event: TranscriptEventData,
): void {
  const raw = event as unknown as Record<string, unknown>;
  const title       = toStr(fieldOf(raw, "title", "name", "label", "action"));
  const description = toStr(fieldOf(raw, "description", "details", "text", "content"));
  const question    = toStr(fieldOf(raw, "question", "prompt", "clinicalPrompt", "clinical_prompt"));
  const answer      = toStr(fieldOf(raw, "answer", "response", "studentResponse", "student_response"));
  const notes       = toStr(fieldOf(raw, "notes", "observations"));

  // Skip empty entries — mirrors the on-page `EventCard` filter
  // `if (!title || !hasSubstantialContent) return null`. Prevents
  // phantom rows (title-only placeholders emitted by the API) from
  // appearing in the download but not in the transcript page.
  const hasSbarResult  = fieldOf(raw, "sbarQualitativeResult", "sbar_qualitative_result") !== undefined;
  const hasVitalsData  = (() => {
    const v = raw["vitals"];
    return v !== null && typeof v === "object" && !Array.isArray(v);
  })();
  const hasSubstantialContent =
    hasSbarResult ||
    hasVitalsData ||
    description.trim().length > 0 ||
    question.trim().length > 0 ||
    answer.trim().length > 0 ||
    notes.trim().length > 0;
  if (!title || !hasSubstantialContent) return;

  const subLabelRaw = fieldOf(raw, "subType", "subtype", "questionType", "question_type", "itemType", "item_type");
  const subLabel    = subLabelRaw ? formatActionType(subLabelRaw).toUpperCase() : undefined;

  const category = fieldOf(raw, "category", "subCategory", "sub_category");
  const meta     = getCategoryMetaPdf(category, title);

  const tsText = timestampRowText(raw);

  const hasStatus = classifyStatus(raw) !== null;
  const estCard = estimateSummaryCardHeight(
    pdf,
    title || meta.label,
    subLabel,
    question,
    answer,
    notes,
    description,
    hasStatus,
  );

  // Clock badge in the category colour.
  ensureSpace(pdf, state, CLOCK_BADGE_H + 3 + estCard + 5);
  const bh = drawClockBadge(pdf, state, elapsedFor(raw), meta.textColor, meta.bgColor, meta.borderColor);
  state.yPosition += bh + 3;

  drawBubbleCard(pdf, state, meta.bgColor, meta.borderColor, estCard, (ix, iw) => {
    // Bracket-style category pill (e.g. `[VITALS]`) + Started/Ended row.
    drawTimestampRow(pdf, state, ix, iw, `[${meta.label}]`, meta.textColor, meta.bgColor, meta.borderColor, undefined, tsText);

    // Title
    if (title) {
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(15);
      setText(pdf, C_GRAY900);
      const titleLines = pdf.splitTextToSize(sanitizePdfText(title), iw) as string[];
      pdf.text(titleLines, ix, state.yPosition + 4);
      state.yPosition += titleLines.length * (15 * 0.42 + 1.2) + 2;
    }

    // Sub-label (question type or item sub-type)
    if (subLabel) {
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(7.5);
      setText(pdf, C_GRAY400);
      pdf.text(sanitizePdfText(subLabel), ix, state.yPosition);
      state.yPosition += 6;
    }

    // Clinical Prompt / Student Response / Observations & Notes.
    // For sequential/ordering questions: split comma-joined answer into
    // a numbered list (mirrors the web page's numbered-list rendering).
    const isSequential = !!subLabelRaw &&
      /ordering|sequential/i.test(subLabelRaw);
    const answerForRender = isSequential && answer
      ? answer.split(",").map((item, i) => `${i + 1}. ${item.trim()}`).join("\n")
      : answer;
    drawContentSubBoxes(pdf, state, ix, iw, question, answerForRender, notes);

    // Correct / Incorrect (or Satisfactory) pill.
    renderStatusPill(pdf, state, raw, ix);

    // Plain description (only when we don't already have Q/A/notes).
    if (!question && !answer && !notes && description) {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      setText(pdf, C_TEXT_PRIMARY);
      const dLines = pdf.splitTextToSize(sanitizePdfText(description), iw) as string[];
      pdf.text(dLines, ix, state.yPosition + 3);
      state.yPosition += dLines.length * 4.4 + 3;
    }

        // Vital signs breakdown — mirrors the "VITAL SIGNS OBTAINED" section
    // on the web page for Obtain Vital Signs events.
    // Each entry in raw["vitals"] is an array of full vital-event objects;
    // the actual measured value lives in their `details` field as
    // "Value: 80 mmHg" — strip the prefix to get the display value.
    const VITAL_LABEL: Record<string, string> = {
      bp: "BP", hr: "HR", rr: "RR",
      spo2: "SpO2", spO2: "SpO2",
      temp: "Temp", temperature: "Temp",
      pain: "Pain",
    };
    const vitalsRaw = raw["vitals"];
    if (vitalsRaw !== null && typeof vitalsRaw === "object" && !Array.isArray(vitalsRaw)) {
      const vitalsList = vitalsRaw as Record<string, unknown>;
      const entries = Object.entries(vitalsList);
      if (entries.length > 0) {
        state.yPosition += 4;
        // Header
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(7.5);
        setText(pdf, C_GRAY400);
        pdf.text(sanitizePdfText("VITAL SIGNS OBTAINED:"), ix, state.yPosition);
        state.yPosition += 5;
        // Each vital row: "BP x1  (80 mmHg)"
        entries.forEach(([vType, vVals]) => {
          const arr: unknown[] = Array.isArray(vVals) ? vVals : [vVals];
          const valStr = arr.map(v => {
            if (v !== null && typeof v === "object") {
              const vObj = v as Record<string, unknown>;
              // details field: "Value: 80 mmHg" — strip the prefix
              const details = String(vObj["details"] ?? "");
              const m = details.match(/^Value:\s*(.+)$/i);
              if (m) return m[1].trim();
              // fallback to explicit value fields
              return String(vObj["value"] ?? vObj["details"] ?? "");
            }
            return String(v);
          }).filter(Boolean).join("; ");
          if (!valStr) return;
          const shortLabel = VITAL_LABEL[vType.toLowerCase()] ?? vType.toUpperCase();
          const text = `${shortLabel}  x${arr.length}  (${valStr})`;
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(9);
          setText(pdf, C_GRAY900);
          const vLines = pdf.splitTextToSize(sanitizePdfText(text), iw) as string[];
          pdf.text(vLines, ix, state.yPosition);
          state.yPosition += vLines.length * 4.4 + 2;
        });
      }
    }
  });
}

// ─── SBAR / Team Communication renderer ─────────────────────────────────────

/**
 * Format an epoch-ms timestamp using the same "MM/DD/YYYY, HH:MM:SS" format
 * used by `timestampRowText`. Returns '' for missing / pre-2020 values.
 */
function fmtEpochTs(ms: number | null | undefined): string {
  if (typeof ms !== "number" || ms <= 0) return "";
  try {
    const d = new Date(ms);
    if (isNaN(d.getTime()) || d.getFullYear() < 2020) return "";
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const yy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${mm}/${dd}/${yy}, ${hh}:${mi}:${ss}`;
  } catch {
    return "";
  }
}

function formatSbarDuration(startMs?: number, submitMs?: number): string {
  if (typeof startMs !== "number" || typeof submitMs !== "number") return "";
  const secs = Math.max(0, Math.round((submitMs - startMs) / 1000));
  if (secs <= 0) return "";
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

/**
 * SBAR result classification — "Satisfactory" | "Unsatisfactory" | "Not
 * Attempted". Falls back to Not Attempted when the value is missing or
 * unrecognised. Colour tuning matches the Student PDF (green for
 * Satisfactory, amber for Unsatisfactory, gray for Not Attempted).
 */
function classifySbarResult(
  raw: string | undefined,
): {
  label: string;
  textColor: [number, number, number];
  bgColor: [number, number, number];
  borderColor: [number, number, number];
} {
  const norm = String(raw ?? "").trim().toLowerCase();
  if (norm === "satisfactory" || /satisfactor/i.test(norm)) {
    return {
      label: "SATISFACTORY",
      textColor: C_SUCCESS,
      bgColor: C_SUCCESS_BG,
      borderColor: [167, 243, 208],
    };
  }
  if (norm === "unsatisfactory" || /unsatisfactor/i.test(norm)) {
    return {
      label: "UNSATISFACTORY",
      textColor: [180, 83, 9], // amber-700 — matches Student PDF
      bgColor: [255, 251, 235], // amber-50
      borderColor: [253, 230, 138], // amber-200
    };
  }
  return {
    label: "NOT ATTEMPTED",
    textColor: C_TEXT_SECONDARY,
    bgColor: [243, 244, 246], // gray-100
    borderColor: [209, 213, 219], // gray-300
  };
}

/**
 * Render a Team Communication / SBAR card. Layout mirrors the Student PDF:
 *   • Category-coloured clock badge
 *   • "[TEAM COMMUNICATION]" pill + Started/Ended/Duration row
 *   • SBAR title
 *   • White prompt sub-box with orange border ("Prompt:")
 *   • White submission sub-box with orange border ("Student SBAR Submission:")
 *   • "RESULT:" gray label + Satisfactory / Unsatisfactory / Not Attempted pill
 */
function renderSbarCard(
  pdf: jsPDF,
  state: PdfRenderState,
  event: TranscriptEventData,
): void {
  const raw = event as unknown as Record<string, unknown>;

  const title    = toStr(fieldOf(raw, "title", "name")) || "Team Communication";
  const prompt   = toStr(fieldOf(raw, "sbarPrompt", "sbar_prompt"));
  const submit   = toStr(fieldOf(raw, "sbarSubmission", "sbar_submission"));
  const resultRaw = toStr(fieldOf(raw, "sbarQualitativeResult", "sbar_qualitative_result"));

  // Skip Team Communication entries the on-page view hides: no session
  // was started (no prompt AND no submission) OR the result explicitly
  // says "Not Attempted". Mirrors the UI guard in `renderSummaryCard`.
  const details = toStr(fieldOf(raw, "description", "details", "text", "content"));
  const detailsLower = details.toLowerCase();
  const resultLower  = resultRaw.toLowerCase();
  const notAttempted =
    detailsLower.includes("not attempted") ||
    detailsLower.includes("not_attempted") ||
    resultLower.includes("not attempted") ||
    resultLower.includes("not_attempted");
  const noSession = !prompt && !submit;
  if (notAttempted || noSession) return;

  const startMs = typeof raw["sbarStartMs"] === "number"
    ? (raw["sbarStartMs"] as number)
    : typeof raw["sbar_start_ms"] === "number"
      ? (raw["sbar_start_ms"] as number)
      : undefined;
  const submitMs = typeof raw["sbarSubmitMs"] === "number"
    ? (raw["sbarSubmitMs"] as number)
    : typeof raw["sbar_submit_ms"] === "number"
      ? (raw["sbar_submit_ms"] as number)
      : undefined;

  // Prefer SBAR-specific timing when present, otherwise fall back to the
  // event's generic started/ended timestamps.
  const tsStart = fmtEpochTs(startMs) || fmtTs(fieldOf(raw, "startedTime", "started_time"));
  const tsEnd   = fmtEpochTs(submitMs) || fmtTs(fieldOf(raw, "endedTime", "ended_time"));
  const tsDur   = formatSbarDuration(startMs, submitMs);
  const tsText  = [
    tsStart ? `Started: ${tsStart}` : "",
    tsEnd ? `Ended: ${tsEnd}` : "",
    tsDur ? `Duration: ${tsDur}` : "",
  ]
    .filter(Boolean)
    .join("  |  ");

  const meta = getCategoryMetaPdf("team_communication", title);
  const result = classifySbarResult(resultRaw || undefined);

  // Height estimate — pill row + title + optional prompt + optional submission
  // + result pill row + padding.
  const promptLines = prompt
    ? (pdf.splitTextToSize(sanitizePdfText(prompt), CARD_INNER_W - 6) as string[]).length
    : 0;
  const submitLines = submit
    ? (pdf.splitTextToSize(sanitizePdfText(submit), CARD_INNER_W - 6) as string[]).length
    : 0;
  const estCard =
    6 + 5 + // pill + timestamps
    12 +    // title
    (prompt ? promptLines * 4.4 + 12 : 0) +
    (submit ? submitLines * 4.4 + 12 : 0) +
    14 +    // result row
    12;

  ensureSpace(pdf, state, CLOCK_BADGE_H + 3 + estCard + 5);
  const bh = drawClockBadge(pdf, state, elapsedFor(raw), meta.textColor, meta.bgColor, meta.borderColor);
  state.yPosition += bh + 3;

  drawBubbleCard(pdf, state, meta.bgColor, meta.borderColor, estCard, (ix, iw) => {
    // Category pill (bracket style) + timestamps.
    drawTimestampRow(
      pdf, state, ix, iw,
      `[${meta.label}]`,
      meta.textColor, meta.bgColor, meta.borderColor,
      undefined,
      tsText,
    );

    // Title
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    setText(pdf, meta.textColor);
    const titleLines = pdf.splitTextToSize(sanitizePdfText(title), iw) as string[];
    pdf.text(titleLines, ix, state.yPosition + 4);
    state.yPosition += titleLines.length * 5.5 + 4;

    // Prompt (white bg, orange border).
    if (prompt) {
      drawSubBox(
        pdf, state,
        "Prompt:", prompt,
        C_TEXT_SECONDARY,
        [255, 255, 255],
        [254, 215, 170],
        ix, iw,
      );
    }
    // Submission (white bg, orange border).
    if (submit) {
      drawSubBox(
        pdf, state,
        "Student SBAR Submission:", submit,
        C_TEXT_SECONDARY,
        [255, 255, 255],
        [254, 215, 170],
        ix, iw,
      );
    }

    // Result row — "RESULT:" gray label + coloured pill on same baseline.
    state.yPosition += 4;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8.5);
    const pillH = 8.5 * 0.42 + 1.3 * 2;
    const pillBaseline = state.yPosition + pillH - 1.3 - 0.3;
    setText(pdf, C_TEXT_SECONDARY);
    pdf.text(sanitizePdfText("RESULT:"), ix, pillBaseline);
    const labelW = pdf.getTextWidth("RESULT:") + 3;
    drawPill(
      pdf,
      result.label,
      ix + labelW,
      state.yPosition,
      result.textColor,
      result.bgColor,
      result.borderColor,
      { fontSize: 8.5, bold: true },
    );
    state.yPosition += pillH + 4;
  });
}

// ─── Dispatcher ──────────────────────────────────────────────────────────────

/**
 * Return true when the event should be rendered as an SBAR / Team-Communication
 * card. Triggered when any dedicated SBAR field is populated OR when the row is
 * explicitly flagged as Team Communication via title/category.
 */
function isSbarEvent(raw: Record<string, unknown>): boolean {
  const hasSbarField =
    raw["sbarQualitativeResult"] != null ||
    raw["sbar_qualitative_result"] != null ||
    raw["sbarPrompt"] != null ||
    raw["sbar_prompt"] != null ||
    raw["sbarSubmission"] != null ||
    raw["sbar_submission"] != null;
  if (hasSbarField) return true;
  const title = String(raw["title"] ?? "").trim().toLowerCase();
  const category = String(raw["category"] ?? "").trim().toLowerCase();
  return title === "team communication" || category === "team_communication";
}

/**
 * Return true when the event's shape indicates a common-action row (infection,
 * privacy or environmental).
 *
 * Mirrors the on-screen check exactly: an event is a common action ONLY when
 * a `subType`/`commonActionType`/original `type` field is exactly one of
 * infection/privacy/environmental, OR the `category` matches. The permissive
 * `common[_\s-]?action` regex was removed — it was matching the normalised
 * `event.type === 'COMMON_ACTIONS'`, causing every non-message event to fall
 * into this renderer (including title-less phantoms).
 */
function isCommonActionEvent(raw: Record<string, unknown>): boolean {
  const subType = String(
    fieldOf(raw, "commonActionType", "common_action_type", "subType", "sub_type", "actionType") ?? "",
  ).toLowerCase();
  if (/^(infection|privacy|environmental|environment)/.test(subType)) return true;

  const category = String(raw["category"] ?? "").toLowerCase();
  return category === "infection" || category === "privacy" || category === "environmental";
}

/**
 * Return true when the event is a message-like row.
 *
 * Mirrors the on-screen `EventCard` classification exactly: after the API
 * mapper runs `normType`, only events whose `type` normalises to `STUDENT`
 * or `PATIENT` render as message bubbles on the page. Everything else
 * (including entries that happen to carry `speaker: 'system'` but whose
 * type resolved to `COMMON_ACTIONS`) falls through to the summary/common-
 * action path, where the empty-content filter drops the phantoms.
 */
function isMessageEvent(event: TranscriptEventData, _raw: Record<string, unknown>): boolean {
  const type = String(event.type ?? "").toUpperCase();
  return type === "STUDENT" || type === "PATIENT";
}

/**
 * Return true when the event has ZERO renderable content for a card-style
 * layout (common-action / summary). Matches the on-page `EventCard` filter
 * `if (!title || !hasSubstantialContent) return null` so the download never
 * emits placeholder rows the transcript page hides.
 *
 * Message bubbles (STUDENT/PATIENT) don't need a title \u2014 they render the
 * `description` as the bubble text \u2014 so this filter is applied only to the
 * non-message paths in the dispatcher below.
 */
function isEmptyCardEvent(raw: Record<string, unknown>): boolean {
  const title = String(fieldOf(raw, "title", "name", "label", "action") ?? "").trim();
  if (!title) return true;

  const description = String(fieldOf(raw, "description", "details", "text", "content") ?? "").trim();
  const question    = String(fieldOf(raw, "question", "prompt", "clinicalPrompt", "clinical_prompt") ?? "").trim();
  const answer      = String(fieldOf(raw, "answer", "response", "studentResponse", "student_response") ?? "").trim();
  const notes       = String(fieldOf(raw, "notes", "observations") ?? "").trim();
  const hasSbar     = fieldOf(raw, "sbarQualitativeResult", "sbar_qualitative_result",
                                    "sbarPrompt", "sbar_prompt",
                                    "sbarSubmission", "sbar_submission") !== undefined;
  const vitals = raw["vitals"];
  const hasVitals = vitals !== null && typeof vitals === "object" && !Array.isArray(vitals);

  return !(hasSbar || hasVitals || description || question || answer || notes);
}

/**
 * Route an event to the correct renderer. Advances `state.yPosition` past the
 * rendered card. Returns the new yPosition so callers using the legacy
 * `state.yPosition = renderEventCard(...)` pattern stay compatible.
 */
export function renderEventCard(
  pdf: jsPDF,
  state: PdfRenderState,
  event: TranscriptEventData,
): number {
  const raw = event as unknown as Record<string, unknown>;

  // Medication administration rows land in the dedicated Phase 6 renderer
  // (dual-column Expected|Documented rows + verification/education checklists +
  // status pill). Checked first so a medication row tagged with a message-like
  // speaker doesn't fall into the generic bubble path.
  if (isMedicationEvent(raw)) {
    renderMedicationCard(pdf, state, event);
    return state.yPosition;
  }

  // SBAR / Team Communication is detected before the message path so that
  // rows tagged with `speaker: 'sbar_report'` but carrying an SBAR payload
  // land in the dedicated card, not the generic bubble.
  if (isSbarEvent(raw)) {
    renderSbarCard(pdf, state, event);
    return state.yPosition;
  }

  if (isMessageEvent(event, raw)) {
    renderMessageBubble(pdf, state, event);
    return state.yPosition;
  }

  // Common actions (infection / privacy / environmental) have a title but no
  // description/question/answer — that is sufficient to render them. Check BEFORE
  // the empty-card guard so they are never incorrectly dropped.
  if (isCommonActionEvent(raw)) {
    renderCommonActionCard(pdf, state, event);
    return state.yPosition;
  }

  // Top-level guard: any remaining non-message, non-medication, non-SBAR,
  // non-common-action event that lacks both a title AND substantive content
  // is a phantom placeholder the on-page transcript hides.
  if (isEmptyCardEvent(raw)) {
    return state.yPosition;
  }

  renderSummaryCard(pdf, state, event);
  return state.yPosition;
}
