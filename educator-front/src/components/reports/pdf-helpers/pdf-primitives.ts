/**
 * PDF drawing primitives — ported from the Student transcript PDF
 * (`HS-online-AI-app/frontend/app/reports/[id]/transcript/page.tsx`
 * `handleDownloadTranscript`).
 *
 * These are jsPDF-only helpers (no React / DOM imports) that take a live
 * `pdf` instance and a mutable state object (`state.yPosition`,
 * `state.pageNumber`, `state.activeCardBg`) so they can be shared between the
 * page-header/footer, elapsed-time badges, speaker icons, pill badges, and
 * pagination-aware `ensureSpace`.
 *
 * Phase 2 of Student → Educator transcript PDF parity port.
 */

import type jsPDF from "jspdf";

import { sanitizePdfText } from "../../../utils/sanitizePdf";

import {
  C_BRAND,
  C_TEXT_MUTED,
  C_TEXT_PRIMARY,
  C_WHITE,
  type RGB,
  type SpeakerIconType,
} from "./pdf-constants";

// ─── Page geometry (matches Student PDF exactly) ─────────────────────────────

export const PAGE_W         = 210; // A4 width  (mm)
export const PAGE_H         = 297; // A4 height (mm)
export const MARGIN_L       = 14;
export const MARGIN_R       = 14;
export const CONTENT_W      = PAGE_W - MARGIN_L - MARGIN_R;
export const FOOTER_Y       = PAGE_H - 10;
/** Clear vertical space above the footer for card content. */
export const CONTENT_BOTTOM = PAGE_H - 18;
/** Y position where content starts on a new page (below the 14mm header + 10mm gap). */
export const CONTENT_TOP    = 24;

// ─── Rendering state (mutable, passed between helpers) ───────────────────────

export interface PdfRenderState {
  /** Current cursor Y (mm). */
  yPosition: number;
  /** 1-based page number, incremented by ensureSpace. */
  pageNumber: number;
  /**
   * If set, the next page will have this colour filled behind subsequent
   * content — used to continue a card's background across a page break.
   * Set by drawBubbleCard before it calls ensureSpace, cleared after.
   */
  activeCardBg: RGB | null;
  /**
   * Phase 7 — segments occupied by the currently-rendering bubble card,
   * one entry per page. Cleared by `drawBubbleCard` after body finishes.
   *
   * `ensureSpace` pushes a new segment `{ page, top: CONTENT_TOP }` on every
   * mid-card page break, so the enclosing card can paint bg fill + border
   * for every page it touches, not just the first.
   */
  cardSegments: Array<{ page: number; top: number }> | null;
  /** Report identifier for the footer left label. */
  reportId: string;
  /** Pre-formatted "Generated" date for the header. */
  generatedDate: string;
}

export function createRenderState(reportId: string): PdfRenderState {
  const generatedDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return {
    yPosition: CONTENT_TOP,
    pageNumber: 1,
    activeCardBg: null,
    cardSegments: null,
    reportId,
    generatedDate,
  };
}

// ─── Colour setters (tiny wrappers so callers stay concise) ──────────────────

export const setFill = (pdf: jsPDF, rgb: RGB): void => {
  pdf.setFillColor(rgb[0], rgb[1], rgb[2]);
};
export const setDraw = (pdf: jsPDF, rgb: RGB): void => {
  pdf.setDrawColor(rgb[0], rgb[1], rgb[2]);
};
export const setText = (pdf: jsPDF, rgb: RGB): void => {
  pdf.setTextColor(rgb[0], rgb[1], rgb[2]);
};

// ─── Page chrome (header + footer) ───────────────────────────────────────────

/**
 * Draw the footer at the bottom of the current page: divider line plus the
 * report label on the left and `Page N` on the right. Called immediately
 * before every `pdf.addPage()` invocation.
 */
export function drawFooter(pdf: jsPDF, state: PdfRenderState): void {
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  setText(pdf, C_TEXT_MUTED);
  const footerLeft = sanitizePdfText(`Full User Transcript  ${state.reportId}`);
  pdf.text(footerLeft, MARGIN_L, FOOTER_Y);
  const pageLabel = `Page ${state.pageNumber}`;
  const w = pdf.getTextWidth(pageLabel);
  pdf.text(pageLabel, PAGE_W - MARGIN_R - w, FOOTER_Y);
}

/**
 * Paint the orange brand strip at the top of every page + "Generated ..." on
 * the right. Sets `state.yPosition` to the top of the content area.
 *
 * When `state.activeCardBg` is non-null, paints that colour behind the entire
 * remaining content area FIRST so a card that spans a page break has its
 * background continued on the new page (jsPDF appends draw ops, so background
 * must be drawn before text/borders).
 */
export function drawPageHeader(pdf: jsPDF, state: PdfRenderState): void {
  setFill(pdf, C_BRAND);
  pdf.rect(0, 0, PAGE_W, 14, "F");
  setText(pdf, C_WHITE);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.text(sanitizePdfText("Full User Transcript"), MARGIN_L, 9);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  const rightMeta = sanitizePdfText(`Generated ${state.generatedDate}`);
  const rw = pdf.getTextWidth(rightMeta);
  pdf.text(rightMeta, PAGE_W - MARGIN_R - rw, 9);
  setText(pdf, C_TEXT_PRIMARY);
  state.yPosition = CONTENT_TOP;

  if (state.activeCardBg) {
    setFill(pdf, state.activeCardBg);
    pdf.rect(MARGIN_L, CONTENT_TOP, CONTENT_W, CONTENT_BOTTOM - CONTENT_TOP + 6, "F");
  }
}

// ─── Pagination ──────────────────────────────────────────────────────────────

/**
 * Ensure the current page has at least `needed` mm of vertical space left
 * before the footer. If not, draw the footer, add a page, increment the page
 * counter, and re-draw the header (which resets `yPosition` to
 * `CONTENT_TOP` and paints the continuation background if any).
 */
export function ensureSpace(
  pdf: jsPDF,
  state: PdfRenderState,
  needed: number,
): void {
  if (state.yPosition + needed > CONTENT_BOTTOM) {
    drawFooter(pdf, state);
    pdf.addPage();
    state.pageNumber += 1;
    drawPageHeader(pdf, state);
    // Phase 7 — register a new segment for any enclosing card so its bg
    // fill + border get repainted on this continuation page.
    if (state.cardSegments) {
      state.cardSegments.push({ page: state.pageNumber, top: state.yPosition });
    }
  }
}

// ─── Elapsed-time clock badge ────────────────────────────────────────────────

/**
 * Render the rounded elapsed-time pill (clock icon + label) at the given Y or
 * at the current cursor. Returns the badge height in mm.
 */
export function drawClockBadge(
  pdf: jsPDF,
  state: PdfRenderState,
  time: string,
  textColor: RGB,
  bgColor: RGB,
  borderColor: RGB,
  drawAtY?: number,
): number {
  const fontSize = 9;
  const padX     = 3;
  const padY     = 1.8;
  const iconD    = 3.2;
  const iconGap  = 1.8;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(fontSize);
  const label = sanitizePdfText(time);
  const tw = pdf.getTextWidth(label);
  const bw = padX + iconD + iconGap + tw + padX;
  const bh = fontSize * 0.42 + padY * 2;
  const ry = drawAtY ?? state.yPosition;

  setFill(pdf, bgColor);
  setDraw(pdf, borderColor);
  pdf.setLineWidth(0.3);
  pdf.roundedRect(MARGIN_L, ry, bw, bh, 1.5, 1.5, "FD");

  const iconR  = iconD / 2;
  const iconCX = MARGIN_L + padX + iconR;
  const iconCY = ry + bh / 2;
  setDraw(pdf, textColor);
  pdf.setLineWidth(0.25);
  pdf.circle(iconCX, iconCY, iconR, "S");
  // Minute hand up + hour hand right.
  pdf.line(iconCX, iconCY, iconCX, iconCY - iconR + 0.4);
  pdf.line(iconCX, iconCY, iconCX + iconR - 0.5, iconCY);

  setText(pdf, textColor);
  pdf.setLineWidth(0.3);
  pdf.text(label, MARGIN_L + padX + iconD + iconGap, ry + bh - padY - 0.3);

  return bh;
}

// ─── Speaker icons ───────────────────────────────────────────────────────────

/**
 * Render a speaker icon (one of six variants) inside an `sz`-mm bounding box
 * centred at `(cx, cy)`. Uses only jsPDF primitives so there's no font/glyph
 * dependency — identical to the Student implementation.
 */
export function drawSpeakerIcon(
  pdf: jsPDF,
  iconType: SpeakerIconType,
  cx: number,
  cy: number,
  sz: number,
  color: RGB,
): void {
  setFill(pdf, color);
  setDraw(pdf, color);
  pdf.setLineWidth(0.3);
  switch (iconType) {
    case "user": {
      const headR  = sz * 0.24;
      const headCY = cy - sz * 0.14;
      pdf.circle(cx, headCY, headR, "F");
      const bw = sz * 0.62;
      const bh = sz * 0.3;
      pdf.roundedRect(cx - bw / 2, headCY + headR + sz * 0.04, bw, bh, bw / 4, bw / 4, "F");
      break;
    }
    case "activity": {
      pdf.setLineWidth(0.4);
      const y0 = cy;
      pdf.line(cx - sz * 0.5, y0, cx - sz * 0.22, y0);
      pdf.line(cx - sz * 0.22, y0, cx - sz * 0.1, y0 - sz * 0.4);
      pdf.line(cx - sz * 0.1, y0 - sz * 0.4, cx + sz * 0.1, y0 + sz * 0.4);
      pdf.line(cx + sz * 0.1, y0 + sz * 0.4, cx + sz * 0.22, y0);
      pdf.line(cx + sz * 0.22, y0, cx + sz * 0.5, y0);
      break;
    }
    case "message": {
      const bx = cx - sz * 0.4;
      const by = cy - sz * 0.38;
      const bw = sz * 0.8;
      const bh = sz * 0.6;
      pdf.roundedRect(bx, by, bw, bh, 0.8, 0.8, "S");
      pdf.line(bx + sz * 0.1, by + bh, bx, by + bh + sz * 0.22);
      pdf.line(bx, by + bh + sz * 0.22, bx + sz * 0.32, by + bh);
      break;
    }
    case "clipboard": {
      const bx = cx - sz * 0.33;
      const by = cy - sz * 0.36;
      const bw = sz * 0.66;
      const bh = sz * 0.68;
      pdf.roundedRect(bx, by + sz * 0.09, bw, bh - sz * 0.04, 0.5, 0.5, "S");
      const cw = sz * 0.3;
      const ch = sz * 0.14;
      pdf.roundedRect(cx - cw / 2, by, cw, ch, ch / 2, ch / 2, "S");
      const lx1 = bx + sz * 0.1;
      const lx2 = bx + bw - sz * 0.1;
      pdf.line(lx1, by + bh * 0.38, lx2, by + bh * 0.38);
      pdf.line(lx1, by + bh * 0.55, lx2, by + bh * 0.55);
      pdf.line(lx1, by + bh * 0.72, lx2 - sz * 0.14, by + bh * 0.72);
      break;
    }
    case "filetext": {
      const bx   = cx - sz * 0.32;
      const by   = cy - sz * 0.4;
      const bw   = sz * 0.64;
      const bh   = sz * 0.78;
      const fold = sz * 0.18;
      pdf.roundedRect(bx, by, bw, bh, 0.4, 0.4, "S");
      pdf.line(bx + bw - fold, by, bx + bw - fold, by + fold);
      pdf.line(bx + bw - fold, by + fold, bx + bw, by + fold);
      const lx1 = bx + sz * 0.1;
      const lx2 = bx + bw - sz * 0.1;
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
}

// ─── Pill badges ─────────────────────────────────────────────────────────────

export interface PillOptions {
  fontSize?: number;
  bold?: boolean;
  iconType?: SpeakerIconType;
}

/**
 * Draw a fully-rounded pill badge (rounded-full in Tailwind terms).
 * Returns the rendered width/height so callers can chain badges.
 */
export function drawPill(
  pdf: jsPDF,
  label: string,
  x: number,
  y: number,
  textColor: RGB,
  bgColor: RGB,
  borderColor: RGB,
  opts: PillOptions = {},
): { width: number; height: number } {
  const fontSize = opts.fontSize ?? 7.5;
  const padX     = 2.8;
  const padY     = 1.3;

  pdf.setFont("helvetica", opts.bold !== false ? "bold" : "normal");
  pdf.setFontSize(fontSize);
  const text    = sanitizePdfText(label.toUpperCase());
  const tw      = pdf.getTextWidth(text);
  const bh      = fontSize * 0.42 + padY * 2;
  const iconSz  = opts.iconType ? bh * 0.72 : 0;
  const iconGap = opts.iconType ? 1.6 : 0;
  const bw      = padX + iconSz + iconGap + tw + padX;

  setFill(pdf, bgColor);
  setDraw(pdf, borderColor);
  pdf.setLineWidth(0.25);
  pdf.roundedRect(x, y, bw, bh, bh / 2, bh / 2, "FD");

  if (opts.iconType) {
    const iconCX = x + padX + iconSz / 2;
    const iconCY = y + bh / 2;
    drawSpeakerIcon(pdf, opts.iconType, iconCX, iconCY, iconSz, textColor);
  }

  setText(pdf, textColor);
  pdf.text(text, x + padX + iconSz + iconGap, y + bh - padY - 0.3);

  return { width: bw, height: bh };
}

/**
 * Small status pill (Not Given / Administered / Satisfactory / etc.). Thin
 * wrapper over `drawPill` with tuned font-size/weight.
 */
export function drawStatusPill(
  pdf: jsPDF,
  label: string,
  x: number,
  y: number,
  textColor: RGB,
  bgColor: RGB,
  borderColor: RGB,
): { width: number; height: number } {
  return drawPill(pdf, label, x, y, textColor, bgColor, borderColor, {
    fontSize: 7,
    bold: true,
  });
}
