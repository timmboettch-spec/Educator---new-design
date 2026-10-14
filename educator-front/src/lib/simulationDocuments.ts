import jsPDF from 'jspdf';
import autoTable, { type CellHookData } from 'jspdf-autotable';
import { sanitizePdfText } from '@/utils/sanitizePdf';
import { CARLITO_FONTS } from '@/lib/carlitoFonts';
import type { SimulationDetail } from '@/types/index';
import type { SimulationDocumentType } from '@/api/simulationDocumentApi';

// Carlito is a metric-compatible, open-license substitute embedded to render as Calibri.
const DOCUMENT_FONT = 'Calibri';

/** Embeds the Carlito/Calibri font variants into a jsPDF doc and makes it the default font. */
function registerCalibriFont(pdf: jsPDF): void {
  pdf.addFileToVFS('Carlito-Regular.ttf', CARLITO_FONTS.regular);
  pdf.addFont('Carlito-Regular.ttf', DOCUMENT_FONT, 'normal');
  pdf.addFileToVFS('Carlito-Bold.ttf', CARLITO_FONTS.bold);
  pdf.addFont('Carlito-Bold.ttf', DOCUMENT_FONT, 'bold');
  pdf.addFileToVFS('Carlito-Italic.ttf', CARLITO_FONTS.italic);
  pdf.addFont('Carlito-Italic.ttf', DOCUMENT_FONT, 'italic');
  pdf.addFileToVFS('Carlito-BoldItalic.ttf', CARLITO_FONTS.boldItalic);
  pdf.addFont('Carlito-BoldItalic.ttf', DOCUMENT_FONT, 'bolditalic');
  pdf.setFont(DOCUMENT_FONT, 'normal');
}

const PAGE_MARGIN = 15;
const CONTENT_WIDTH = 180;
const LINE_HEIGHT = 5;
const PAGE_BOTTOM = 270;
const PAGE_WIDTH = 210;
const HEADER_TOP_MARGIN = 45; // reserves space below the redrawn logo/title on continuation pages
const SECTION_HEADING_COLOR: [number, number, number] = [219, 136, 51]; // #db8833, numbered section headings
const LABEL_COLOR: [number, number, number] = [90, 90, 90];
const BODY_COLOR: [number, number, number] = [20, 20, 20];
const STRIPE_FILL: [number, number, number] = [222, 222, 222];
const LOGO_PATH = '/Realityworks_AI_RGB.png';
const LOGO_WIDTH = 45;

type LogoAsset = { dataUrl: string; ratio: number };
let logoPromise: Promise<LogoAsset | null> | null = null;

/** Loads and caches the Realityworks AI logo as a data URL for embedding in generated PDFs. */
function loadLogo(): Promise<LogoAsset | null> {
  if (!logoPromise) {
    logoPromise = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d');
          if (!ctx || !img.naturalWidth) {
            resolve(null);
            return;
          }
          ctx.drawImage(img, 0, 0);
          resolve({
            dataUrl: canvas.toDataURL('image/png'),
            ratio: img.naturalHeight / img.naturalWidth,
          });
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = LOGO_PATH;
    });
  }
  return logoPromise;
}

/** Reads a dot-path value (e.g. "patientData.name") off the scenario object. */
function getPath(sim: SimulationDetail, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object')
      return (acc as Record<string, unknown>)[key];
    return undefined;
  }, sim);
}

/** Resolves a scenario JSON field to display text; arrays are joined, missing values are blank. */
function resolveValue(sim: SimulationDetail, path: string): string {
  const value = getPath(sim, path);
  if (Array.isArray(value)) return value.filter(Boolean).join(', ');
  if (value == null) return '';
  return String(value).trim();
}

/** Replaces every {{path}} token in a template string with its resolved scenario value. */
function interpolate(sim: SimulationDetail, template: string): string {
  return template.replace(/\{\{([\w.]+)\}\}/g, (_, path: string) =>
    resolveValue(sim, path)
  );
}

/** Formats an ISO-ish "YYYY-MM-DDTHH:MM" scenario date/time as "MM-DD-YYYY HH:MM"; returns the raw value unchanged if it doesn't match. */
function formatSimDateTime(raw: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(raw);
  if (!match) return raw;
  const [, year, month, day, hour, minute] = match;
  return `${month}-${day}-${year} ${hour}:${minute}`;
}

type MetaCell = { label: string; path: string };
type KeyValueRow = { label: string; path?: string; value?: string };

type Block =
  | { kind: 'metaGrid'; rows: MetaCell[][]; showEmpty?: boolean }
  | { kind: 'headerTable'; head: string[]; row: string[] }
  | {
      kind: 'keyValueList';
      rows: KeyValueRow[];
      showEmpty?: boolean;
      labelFillColor?: [number, number, number];
    }
  | {
      kind: 'heading';
      text: string;
      color?: [number, number, number];
      rule?: boolean;
    }
  | { kind: 'subheading'; text: string; color?: [number, number, number] }
  | { kind: 'say'; path: string; showEmpty?: boolean }
  | { kind: 'sayText'; text: string }
  | { kind: 'sayTemplate'; template: string }
  | { kind: 'sayTextWithPrefix'; prefix: string; text: string }
  | { kind: 'para'; path: string; showEmpty?: boolean }
  | { kind: 'static'; text: string; bold?: boolean }
  | { kind: 'labeled'; template: string }
  | { kind: 'note'; text: string; bold?: boolean }
  | { kind: 'checklistTable'; head: string[]; rows: string[][] }
  | { kind: 'checklist'; items: string[] }
  | {
      kind: 'boldLabeled';
      label: string;
      path?: string;
      value?: string;
      color?: [number, number, number];
    }
  | { kind: 'link'; prefix: string; url: string }
  | {
      kind: 'dataTable';
      head?: string[];
      rows: string[][];
      firstColKey?: boolean;
      firstColWidth?: number;
      columnStyles?: Record<
        number,
        {
          cellWidth?: number;
          fillColor?: [number, number, number];
          fontStyle?: 'bold' | 'normal';
        }
      >;
    };

class DocumentRenderer {
  private pdf: jsPDF;
  private y = 20;
  private headerDrawnPages = new Set<number>([1]);

  constructor(
    private sim: SimulationDetail,
    private heading: string,
    private logo: LogoAsset | null,
    private titleColor: [number, number, number] = BODY_COLOR
  ) {
    this.pdf = new jsPDF({ unit: 'mm', format: 'a4' });
    registerCalibriFont(this.pdf);
    this.drawLetterhead();
    this.y += 6;
    const titleBottom = this.centerText(heading, this.y, {
      bold: true,
      size: 26,
      color: this.titleColor,
    });
    this.y = titleBottom + 16;
  }

  /** Redraws the logo letterhead on the current page if it hasn't already been drawn (new pages only). */
  private ensureHeaderForCurrentPage(): void {
    const pageNum = this.pdf.getNumberOfPages();
    if (this.headerDrawnPages.has(pageNum)) return;
    this.headerDrawnPages.add(pageNum);
    this.drawLetterhead();
  }

  /** Centered brand logo (or drawn fallback) plus the scenario title shown top-right. */
  private drawLetterhead(): void {
    if (this.logo) {
      const width = LOGO_WIDTH;
      const height = width * this.logo.ratio;
      this.pdf.addImage(
        this.logo.dataUrl,
        'PNG',
        (PAGE_WIDTH - width) / 2,
        8,
        width,
        height
      );
      this.y = 8 + height + 6;
    } else {
      this.pdf.setFillColor(...SECTION_HEADING_COLOR);
      this.pdf.roundedRect(PAGE_WIDTH / 2 - 22, 10, 6, 6, 1, 1, 'F');
      this.pdf.setFont(DOCUMENT_FONT, 'bold');
      this.pdf.setFontSize(12);
      this.pdf.setTextColor(40, 40, 40);
      this.pdf.text('Realityworks', PAGE_WIDTH / 2 - 14, 15);
      const realityworksWidth = this.pdf.getTextWidth('Realityworks');
      this.pdf.setTextColor(...SECTION_HEADING_COLOR);
      this.pdf.text(' AI', PAGE_WIDTH / 2 - 14 + realityworksWidth, 15);
      this.y = 24;
    }

    if (this.sim.title) {
      this.pdf.setFont(DOCUMENT_FONT, 'italic');
      this.pdf.setFontSize(9);
      this.pdf.setTextColor(...LABEL_COLOR);
      const titleText = sanitizePdfText(this.sim.title);
      this.pdf.text(
        titleText,
        (PAGE_WIDTH - this.pdf.getTextWidth(titleText)) / 2,
        this.y
      );
      this.y += 6;
    }
  }

  /** Centers text on the page, wrapping onto multiple lines (each re-centered) if it would exceed the content width. Returns the y of the last line drawn. */
  private centerText(
    text: string,
    y: number,
    options?: {
      bold?: boolean;
      size?: number;
      color?: [number, number, number];
    }
  ): number {
    const size = options?.size ?? 10;
    this.pdf.setFont(DOCUMENT_FONT, options?.bold ? 'bold' : 'normal');
    this.pdf.setFontSize(size);
    this.pdf.setTextColor(...(options?.color ?? BODY_COLOR));
    const clean = sanitizePdfText(text);
    const lines = this.pdf.splitTextToSize(clean, CONTENT_WIDTH) as string[];
    const lineHeight = size * 0.42;
    lines.forEach((line, index) => {
      const width = this.pdf.getTextWidth(line);
      this.pdf.text(line, (PAGE_WIDTH - width) / 2, y + index * lineHeight);
    });
    return y + (lines.length - 1) * lineHeight;
  }

  private ensureSpace(needed = LINE_HEIGHT): void {
    if (this.y + needed > PAGE_BOTTOM) {
      this.pdf.addPage();
      this.ensureHeaderForCurrentPage();
    }
  }

  private getFinalY(): number {
    return (
      (this.pdf as unknown as { lastAutoTable?: { finalY: number } })
        .lastAutoTable?.finalY ?? this.y
    );
  }

  private wrapTextPreservingLineBreaks(text: string, width: number): string[] {
    return this.splitIntoSentenceLines(text).flatMap((line) =>
      line ? (this.pdf.splitTextToSize(line, width) as string[]) : ['']
    );
  }

  /** Splits text into one sentence per line (breaking after '.', '!' or '?'), preserving any authored blank lines. */
  private splitIntoSentenceLines(text: string): string[] {
    return sanitizePdfText(text)
      .split('\n')
      .flatMap((line) => {
        if (!line) return [''];
        const sentences = line.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g) ?? [
          line,
        ];
        return sentences.map((sentence) => sentence.trim()).filter(Boolean);
      });
  }

  private writeParagraph(
    text: string,
    options?: {
      bold?: boolean;
      italic?: boolean;
      color?: [number, number, number];
      size?: number;
    }
  ): void {
    if (!text) return;
    this.pdf.setFont(
      DOCUMENT_FONT,
      options?.bold ? 'bold' : options?.italic ? 'italic' : 'normal'
    );
    this.pdf.setFontSize(options?.size ?? 10);
    this.pdf.setTextColor(...(options?.color ?? BODY_COLOR));
    const lines = this.wrapTextPreservingLineBreaks(text, CONTENT_WIDTH);
    for (const line of lines) {
      this.ensureSpace();
      this.pdf.text(line, PAGE_MARGIN, this.y);
      this.y += LINE_HEIGHT;
    }
  }

  /** Renders "SAY: " in bold followed immediately by the italic quoted script line; when the quote is empty and showEmpty is set, renders just the "SAY:" label. */
  private writeSayLine(quote: string, showEmpty = false): void {
    if (!quote && !showEmpty) return;
    this.y += 2;
    const indent = 3;
    const label = quote ? 'SAY: ' : 'SAY:';
    this.pdf.setFont(DOCUMENT_FONT, 'bold');
    this.pdf.setFontSize(10);
    if (!quote) {
      this.ensureSpace();
      this.pdf.setTextColor(...BODY_COLOR);
      this.pdf.text(label, PAGE_MARGIN + indent, this.y);
      this.y += LINE_HEIGHT + 2;
      return;
    }
    const labelWidth = this.pdf.getTextWidth(label);
    const authoredLines = this.splitIntoSentenceLines(quote);
    let isFirstRenderedLine = true;
    for (let lineIndex = 0; lineIndex < authoredLines.length; lineIndex += 1) {
      const authoredLine = authoredLines[lineIndex];
      if (!authoredLine) {
        this.ensureSpace();
        this.y += LINE_HEIGHT;
        continue;
      }

      const quotedLine = `${lineIndex === 0 ? '"' : ''}${authoredLine}${
        lineIndex === authoredLines.length - 1 ? '"' : ''
      }`;
      const lines = this.pdf.splitTextToSize(
        quotedLine,
        CONTENT_WIDTH - indent - (isFirstRenderedLine ? labelWidth : 0)
      ) as string[];
      for (const line of lines) {
        this.ensureSpace();
        this.pdf.setFont(DOCUMENT_FONT, 'bold');
        this.pdf.setTextColor(...BODY_COLOR);
        if (isFirstRenderedLine)
          this.pdf.text(label, PAGE_MARGIN + indent, this.y);
        this.pdf.setFont(DOCUMENT_FONT, 'italic');
        this.pdf.text(
          line,
          PAGE_MARGIN + indent + (isFirstRenderedLine ? labelWidth : 0),
          this.y
        );
        this.y += LINE_HEIGHT;
        isFirstRenderedLine = false;
      }
    }
    this.y += 2;
  }

  /** Renders a bold condition prefix and bold "SAY: " followed by the italic (non-bold) quoted line, all left-indented. */
  private writeSayLineWithPrefix(prefix: string, quote: string): void {
    if (!quote) return;
    this.y += 2;
    const indent = 3;
    const prefixClean = prefix ? `${prefix} ` : '';
    const label = 'SAY: ';
    this.pdf.setFont(DOCUMENT_FONT, 'bold');
    this.pdf.setFontSize(10);
    const prefixWidth = this.pdf.getTextWidth(prefixClean);
    const labelWidth = this.pdf.getTextWidth(label);
    const authoredLines = this.splitIntoSentenceLines(quote);
    let isFirstRenderedLine = true;
    for (let lineIndex = 0; lineIndex < authoredLines.length; lineIndex += 1) {
      const authoredLine = authoredLines[lineIndex];
      if (!authoredLine) {
        this.ensureSpace();
        this.y += LINE_HEIGHT;
        continue;
      }
      const quotedLine = `${lineIndex === 0 ? '"' : ''}${authoredLine}${
        lineIndex === authoredLines.length - 1 ? '"' : ''
      }`;
      const lines = this.pdf.splitTextToSize(
        quotedLine,
        CONTENT_WIDTH -
          indent -
          (isFirstRenderedLine ? prefixWidth + labelWidth : 0)
      ) as string[];
      for (const line of lines) {
        this.ensureSpace();
        this.pdf.setTextColor(...BODY_COLOR);
        if (isFirstRenderedLine) {
          this.pdf.setFont(DOCUMENT_FONT, 'bold');
          this.pdf.text(
            sanitizePdfText(prefixClean),
            PAGE_MARGIN + indent,
            this.y
          );
          this.pdf.text(label, PAGE_MARGIN + indent + prefixWidth, this.y);
        }
        this.pdf.setFont(DOCUMENT_FONT, 'italic');
        this.pdf.text(
          line,
          PAGE_MARGIN +
            indent +
            (isFirstRenderedLine ? prefixWidth + labelWidth : 0),
          this.y
        );
        this.y += LINE_HEIGHT;
        isFirstRenderedLine = false;
      }
    }
    this.y += 2;
  }

  /** Renders a bracketed facilitator-note callout, plain text with no background fill. */
  private writeNote(text: string, bold = false): void {
    if (!text) return;
    const label = 'FACILITATOR NOTE: ';
    this.pdf.setFont(DOCUMENT_FONT, bold ? 'bolditalic' : 'italic');
    this.pdf.setFontSize(8.5);
    const lines = this.wrapTextPreservingLineBreaks(
      `${label}${text}`,
      CONTENT_WIDTH - 6
    );
    this.pdf.setTextColor(...BODY_COLOR);
    lines.forEach((line, index) => {
      this.ensureSpace(4.2);
      const prefixed = `${index === 0 ? '[' : ''}${line}${index === lines.length - 1 ? ']' : ''}`;
      this.pdf.text(prefixed, PAGE_MARGIN + 3, this.y);
      this.y += 4.2;
    });
    this.y += 3;
  }

  /** Renders a plain-text prefix followed by a clickable, blue underlined hyperlink. */
  private writeLink(prefix: string, url: string): void {
    this.ensureSpace();
    this.pdf.setFont(DOCUMENT_FONT, 'bold');
    this.pdf.setFontSize(10);
    this.pdf.setTextColor(...BODY_COLOR);
    const prefixClean = `${sanitizePdfText(prefix)} `;
    this.pdf.text(prefixClean, PAGE_MARGIN, this.y);
    const prefixWidth = this.pdf.getTextWidth(prefixClean);
    const linkColor: [number, number, number] = [37, 99, 235];
    this.pdf.setTextColor(...linkColor);
    this.pdf.textWithLink(url, PAGE_MARGIN + prefixWidth, this.y, { url });
    const linkWidth = this.pdf.getTextWidth(url);
    this.pdf.setDrawColor(...linkColor);
    this.pdf.setLineWidth(0.2);
    this.pdf.line(
      PAGE_MARGIN + prefixWidth,
      this.y + 0.6,
      PAGE_MARGIN + prefixWidth + linkWidth,
      this.y + 0.6
    );
    this.y += LINE_HEIGHT;
  }

  /** Draws a single checkbox square given its top-left corner (avoids missing-font unicode fallback). */
  private drawCheckbox(x: number, yTop: number, size = 3.2): void {
    this.pdf.setDrawColor(90, 90, 90);
    this.pdf.setLineWidth(0.3);
    this.pdf.rect(x, yTop, size, size);
  }

  /** Renders "Label: " in bold (optionally colored) followed by a normal-weight value, wrapping onto subsequent lines. */
  private writeBoldLabelLine(
    label: string,
    value: string,
    color: [number, number, number] = BODY_COLOR
  ): void {
    const prefix = `${label}: `;
    this.pdf.setFont(DOCUMENT_FONT, 'bold');
    this.pdf.setFontSize(10);
    const prefixWidth = this.pdf.getTextWidth(prefix);
    const lines = this.wrapTextPreservingLineBreaks(
      value,
      CONTENT_WIDTH - prefixWidth
    );
    lines.forEach((line, index) => {
      this.ensureSpace();
      if (index === 0) {
        this.pdf.setFont(DOCUMENT_FONT, 'bold');
        this.pdf.setTextColor(...color);
        this.pdf.text(sanitizePdfText(prefix), PAGE_MARGIN, this.y);
      }
      this.pdf.setFont(DOCUMENT_FONT, 'normal');
      this.pdf.setTextColor(...BODY_COLOR);
      this.pdf.text(
        line,
        PAGE_MARGIN + (index === 0 ? prefixWidth : 0),
        this.y
      );
      this.y += LINE_HEIGHT;
    });
    this.y += 2;
  }

  /** Renders a checkbox followed by the item text, wrapping onto subsequent lines without a box. */
  private writeChecklistItem(text: string): void {
    if (!text) return;
    const boxSize = 3.2;
    const textIndent = boxSize + 2.5;
    this.pdf.setFont(DOCUMENT_FONT, 'normal');
    this.pdf.setFontSize(10);
    this.pdf.setTextColor(...BODY_COLOR);
    const lines = this.pdf.splitTextToSize(
      sanitizePdfText(text),
      CONTENT_WIDTH - textIndent
    ) as string[];
    lines.forEach((line, index) => {
      this.ensureSpace();
      if (index === 0)
        this.drawCheckbox(PAGE_MARGIN, this.y - boxSize + 0.8, boxSize);
      this.pdf.text(line, PAGE_MARGIN + textIndent, this.y);
      this.y += LINE_HEIGHT;
    });
  }

  /** Adds the running page footer ("{Document} | Realityworks AI Patient Simulation | Page X of Y") to every page. */
  private drawFooters(): void {
    const pageCount = this.pdf.getNumberOfPages();
    for (let page = 1; page <= pageCount; page++) {
      this.pdf.setPage(page);
      this.pdf.setDrawColor(200, 200, 200);
      this.pdf.setLineWidth(0.5);
      this.pdf.line(PAGE_MARGIN, 286, PAGE_MARGIN + CONTENT_WIDTH, 286);
      this.centerText(
        `${this.heading} | Realityworks AI Patient Simulation | Page ${page} of ${pageCount}`,
        291,
        {
          size: 8,
          color: LABEL_COLOR,
        }
      );
    }
  }

  render(blocks: Block[]): jsPDF {
    for (const block of blocks) {
      switch (block.kind) {
        case 'metaGrid': {
          const body = block.rows
            .map((pair) =>
              pair.flatMap((cell) => [
                `${cell.label}:`,
                resolveValue(this.sim, cell.path) ||
                  (block.showEmpty ? '—' : ''),
              ])
            )
            .filter(
              (row) =>
                block.showEmpty || row.some((cell, i) => i % 2 === 1 && cell)
            );
          if (!body.length) break;
          autoTable(this.pdf, {
            startY: this.y,
            theme: 'grid',
            margin: {
              left: PAGE_MARGIN,
              right: PAGE_MARGIN,
              top: HEADER_TOP_MARGIN,
            },
            rowPageBreak: 'avoid',
            styles: {
              font: DOCUMENT_FONT,
              fontSize: 9,
              cellPadding: 3,
              textColor: BODY_COLOR,
              lineWidth: 0.2,
              lineColor: BODY_COLOR,
            },
            columnStyles: {
              0: {
                fontStyle: 'bold',
                textColor: BODY_COLOR,
                cellWidth: 32,
                fillColor: STRIPE_FILL,
              },
              2: {
                fontStyle: 'bold',
                textColor: BODY_COLOR,
                cellWidth: 45,
                fillColor: STRIPE_FILL,
              },
            },
            body,
            didDrawPage: () => this.ensureHeaderForCurrentPage(),
          });
          this.y = this.getFinalY() + 5;
          break;
        }
        case 'headerTable': {
          if (!block.row.some(Boolean)) break;
          autoTable(this.pdf, {
            startY: this.y,
            theme: 'grid',
            margin: {
              left: PAGE_MARGIN,
              right: PAGE_MARGIN,
              top: HEADER_TOP_MARGIN,
            },
            rowPageBreak: 'avoid',
            head: [block.head],
            headStyles: {
              fillColor: STRIPE_FILL,
              textColor: BODY_COLOR,
              fontStyle: 'bold',
              lineWidth: 0.2,
              lineColor: BODY_COLOR,
            },
            styles: {
              font: DOCUMENT_FONT,
              fontSize: 9,
              cellPadding: 3,
              textColor: LABEL_COLOR,
              lineWidth: 0.2,
              lineColor: BODY_COLOR,
            },
            body: [block.row],
            didDrawPage: () => this.ensureHeaderForCurrentPage(),
          });
          this.y = this.getFinalY() + 6;
          break;
        }
        case 'keyValueList': {
          const body = block.rows
            .map((row) => [
              `${row.label}:`,
              (row.path
                ? resolveValue(this.sim, row.path)
                : (row.value ?? '')) || (block.showEmpty ? '—' : ''),
            ])
            .filter(([, value]) => block.showEmpty || value);
          if (!body.length) break;
          autoTable(this.pdf, {
            startY: this.y,
            theme: 'grid',
            margin: {
              left: PAGE_MARGIN,
              right: PAGE_MARGIN,
              top: HEADER_TOP_MARGIN,
            },
            rowPageBreak: 'avoid',
            styles: {
              font: DOCUMENT_FONT,
              fontSize: 9,
              cellPadding: 2.5,
              textColor: BODY_COLOR,
              lineWidth: 0.2,
              lineColor: BODY_COLOR,
            },
            columnStyles: {
              0: {
                fontStyle: 'bold',
                textColor: BODY_COLOR,
                cellWidth: 48,
                fillColor: block.labelFillColor ?? STRIPE_FILL,
              },
            },
            body,
            didDrawPage: () => this.ensureHeaderForCurrentPage(),
          });
          this.y = this.getFinalY() + 5;
          break;
        }
        case 'checklistTable': {
          if (!block.rows.length) break;
          autoTable(this.pdf, {
            startY: this.y,
            theme: 'grid',
            margin: {
              left: PAGE_MARGIN,
              right: PAGE_MARGIN,
              top: HEADER_TOP_MARGIN,
            },
            rowPageBreak: 'avoid',
            head: [block.head],
            headStyles: {
              fillColor: STRIPE_FILL,
              textColor: BODY_COLOR,
              fontStyle: 'bold',
              lineWidth: 0.2,
              lineColor: BODY_COLOR,
            },
            styles: {
              font: DOCUMENT_FONT,
              fontSize: 9,
              cellPadding: 2.5,
              textColor: BODY_COLOR,
              fillColor: [255, 255, 255],
              lineWidth: 0.2,
              lineColor: BODY_COLOR,
            },
            alternateRowStyles: { fillColor: [255, 255, 255] },
            columnStyles: { 0: { cellWidth: 18, halign: 'left' } },
            body: block.rows,
            didParseCell: (data: CellHookData) => {
              if (
                data.section === 'body' &&
                data.column.index === 0 &&
                data.cell.raw === '\u2610'
              ) {
                data.cell.text = [];
              }
            },
            didDrawCell: (data: CellHookData) => {
              if (
                data.section === 'body' &&
                data.column.index === 0 &&
                data.cell.raw === '\u2610'
              ) {
                const size = 3.2;
                this.drawCheckbox(
                  data.cell.x + 3,
                  data.cell.y + (data.cell.height - size) / 2,
                  size
                );
              }
            },
            didDrawPage: () => this.ensureHeaderForCurrentPage(),
          });
          this.y = this.getFinalY() + 6;
          break;
        }
        case 'checklist': {
          if (!block.items.length) break;
          for (const item of block.items) {
            this.writeChecklistItem(item);
          }
          this.y += 2;
          break;
        }
        case 'boldLabeled': {
          const value =
            block.value ??
            (block.path ? resolveValue(this.sim, block.path) : '');
          this.writeBoldLabelLine(block.label, value, block.color);
          break;
        }
        case 'link':
          this.writeLink(block.prefix, block.url);
          break;
        case 'dataTable': {
          if (!block.rows.length && !block.head) break;
          const columnStyles: Record<number, Record<string, unknown>> = {};
          if (block.firstColKey) {
            columnStyles[0] = {
              fontStyle: 'bold',
              fillColor: STRIPE_FILL,
              textColor: BODY_COLOR,
            };
            if (block.firstColWidth)
              columnStyles[0].cellWidth = block.firstColWidth;
          }
          if (block.columnStyles) {
            for (const [key, style] of Object.entries(block.columnStyles)) {
              columnStyles[Number(key)] = {
                ...(columnStyles[Number(key)] ?? {}),
                ...style,
              };
            }
          }
          autoTable(this.pdf, {
            startY: this.y,
            theme: 'grid',
            margin: {
              left: PAGE_MARGIN,
              right: PAGE_MARGIN,
              top: HEADER_TOP_MARGIN,
            },
            rowPageBreak: 'avoid',
            head: block.head ? [block.head] : undefined,
            headStyles: {
              fillColor: STRIPE_FILL,
              textColor: BODY_COLOR,
              fontStyle: 'bold',
              lineWidth: 0.2,
              lineColor: BODY_COLOR,
            },
            styles: {
              font: DOCUMENT_FONT,
              fontSize: 9,
              cellPadding: 2.5,
              textColor: BODY_COLOR,
              lineWidth: 0.2,
              lineColor: BODY_COLOR,
            },
            columnStyles,
            body: block.rows,
            didParseCell: (data: CellHookData) => {
              if (data.section === 'head') {
                const override =
                  block.columnStyles?.[data.column.index]?.fillColor;
                if (override) data.cell.styles.fillColor = override;
              }
            },
            didDrawPage: () => this.ensureHeaderForCurrentPage(),
          });
          this.y = this.getFinalY() + 5;
          break;
        }
        case 'heading': {
          this.ensureSpace(14);
          this.y += 4;
          const headingColor = block.color ?? BODY_COLOR;
          this.pdf.setFont(DOCUMENT_FONT, 'bold');
          this.pdf.setFontSize(15);
          this.pdf.setTextColor(...headingColor);
          this.pdf.text(sanitizePdfText(block.text), PAGE_MARGIN, this.y);
          this.y += 2;
          if (block.rule) {
            this.pdf.setDrawColor(150, 150, 150);
            this.pdf.setLineWidth(0.4);
            this.pdf.line(
              PAGE_MARGIN,
              this.y,
              PAGE_MARGIN + CONTENT_WIDTH,
              this.y
            );
          }
          this.y += 7;
          break;
        }
        case 'subheading': {
          this.ensureSpace(11);
          this.y += 2;
          this.pdf.setFont(DOCUMENT_FONT, 'bold');
          this.pdf.setFontSize(13);
          this.pdf.setTextColor(...(block.color ?? SECTION_HEADING_COLOR));
          this.pdf.text(sanitizePdfText(block.text), PAGE_MARGIN, this.y);
          this.y += 6;
          break;
        }
        case 'say': {
          const value = resolveValue(this.sim, block.path);
          this.writeSayLine(value, block.showEmpty);
          break;
        }
        case 'sayText':
          this.writeSayLine(block.text);
          break;
        case 'sayTemplate': {
          const value = interpolate(this.sim, block.template);
          if (!value || value.includes('{{')) break;
          this.writeSayLine(value);
          break;
        }
        case 'sayTextWithPrefix':
          this.writeSayLineWithPrefix(block.prefix, block.text);
          break;
        case 'note':
          this.writeNote(block.text, block.bold);
          break;
        case 'para': {
          const value = resolveValue(this.sim, block.path);
          if (!value && !block.showEmpty) break;
          this.writeParagraph(value || '—');
          this.y += 2;
          break;
        }
        case 'static':
          this.writeParagraph(block.text, { bold: block.bold });
          break;
        case 'labeled': {
          const value = interpolate(this.sim, block.template);
          if (!value || value.includes('{{')) break;
          this.writeParagraph(value);
          break;
        }
      }
    }
    this.drawFooters();
    return this.pdf;
  }
}

function buildSetupGuide(sim: SimulationDetail, logo: LogoAsset | null): jsPDF {
  return new DocumentRenderer(
    sim,
    'Instructor-Facing Simulation Set-Up Notes',
    logo,
    SECTION_HEADING_COLOR
  ).render([
    {
      kind: 'metaGrid',
      rows: [
        [
          { label: 'Scenario ID', path: 'id' },
          { label: 'Title', path: 'title' },
        ],
        [
          { label: 'Clinical Setting', path: 'department' },
          { label: 'Target Audience Learner Level', path: 'learnerLevel' },
        ],
        [
          { label: 'Difficulty', path: 'difficultyLevel' },
          { label: 'Estimated Duration', path: 'estimatedDuration' },
        ],
      ],
    },
    {
      kind: 'keyValueList',
      rows: [
        { label: 'Product Type / Modality', path: 'productSetup.title' },
        {
          label: 'Simulated Date/Time',
          value: formatSimDateTime(resolveValue(sim, 'simulationStartTime')),
        },
        { label: 'Patient Name', path: 'patientData.name' },
        { label: 'Patient Age', path: 'patientData.age' },
        { label: 'Patient DOB', path: 'patientData.dobMonthDay' },
      ],
    },
    {
      kind: 'heading',
      text: '1. Room & Environment Setup',
      color: SECTION_HEADING_COLOR,
      rule: true,
    },
    {
      kind: 'checklist',
      items: [
        `Clinical setting/background staged or selected: ${resolveValue(sim, 'department')}`,
        'Bed/exam table, curtain/door, and bedside table positioned',
      ],
    },
    {
      kind: 'boldLabeled',
      label: 'Additional Equipment',
      path: 'additionalEquipment',
    },
    {
      kind: 'boldLabeled',
      label: 'Optional Equipment',
      path: 'optionalEquipment',
    },
    { kind: 'boldLabeled', label: 'Setup Notes', path: 'setupNotes' },
    {
      kind: 'heading',
      text: '2. Roles Needed for Simulated Patient Care Team',
      color: SECTION_HEADING_COLOR,
      rule: true,
    },
    {
      kind: 'checklistTable',
      head: ['Needed?', 'Role', 'Assigned To'],
      rows: [
        ['☐', 'Primary Nurse (Learner)', ''],
        ['☐', 'Secondary Nurse / Assistant (optional)', ''],
        ['☐', 'Simulation Operator / Control Room', ''],
        ['☐', '', ''],
        ['☐', '', ''],
      ],
    },
  ]);
}

function buildSimulationDetails(
  sim: SimulationDetail,
  logo: LogoAsset | null
): jsPDF {
  const em = '—';
  const val = (path: string) => resolveValue(sim, path) || em;
  const dt = (path: string) => formatSimDateTime(resolveValue(sim, path)) || em;
  const empty = em;
  const firstValue = (
    item: Record<string, unknown>,
    ...keys: string[]
  ): string => {
    for (const key of keys) {
      const value = item[key];
      if (Array.isArray(value)) return value.filter(Boolean).join(', ') || em;
      if (value != null && String(value).trim()) return String(value).trim();
    }
    return em;
  };
  const actionItems = [
    sim.actions,
    sim.assessments,
    sim.interventions,
    sim.tasks,
  ].flatMap((items) => items ?? []);
  const visibility = (key: string): string => {
    const flag = getPath(sim, `patientData.historyVisibility.${key}`);
    return typeof flag === 'boolean' ? (flag ? 'Visible' : 'Hidden') : em;
  };

  const patientChartRows: string[][] = [
    ['Height (cm)', val('patientData.vitals.height'), visibility('height')],
    ['Weight (kg)', val('patientData.vitals.weight'), visibility('weight')],
    [
      'History of Present Illness',
      val('patientData.historyOfPresentIllness'),
      visibility('historyOfPresentIllness'),
    ],
    [
      'Past Medical History',
      val('patientData.medicalHistory'),
      visibility('medicalHistory'),
    ],
    [
      'Past Surgical History',
      val('patientData.pastSurgicalHistory'),
      visibility('pastSurgicalHistory'),
    ],
    ['Allergies', val('patientData.allergies'), visibility('allergies')],
    [
      'Current Home Medications & Indications',
      val('patientData.currentMedications'),
      visibility('medications'),
    ],
    [
      'Immunization Status',
      val('patientData.immunizationHistory'),
      visibility('immunizations'),
    ],
    [
      'Family Medical History',
      val('patientData.familyMedicalHistoryClinical'),
      visibility('familyMedicalHistoryClinical'),
    ],
    [
      'Primary Care Provider',
      val('patientData.primaryCareProvider'),
      visibility('primaryCareProvider'),
    ],
    [
      'Tobacco Use',
      val('patientData.socialHistory.tobacco'),
      visibility('tobacco'),
    ],
    [
      'Alcohol Use',
      val('patientData.socialHistory.alcohol'),
      visibility('alcohol'),
    ],
    ['Drug Use', val('patientData.socialHistory.drugs'), visibility('drugs')],
    [
      'Occupation',
      val('patientData.lifestyle.occupation'),
      visibility('occupation'),
    ],
    ['Housing', val('patientData.lifestyle.housing'), visibility('housing')],
    [
      'Transportation',
      val('patientData.lifestyle.transportation'),
      visibility('transportation'),
    ],
    ['Diet', val('patientData.lifestyle.diet'), visibility('diet')],
    ['Exercise', val('patientData.lifestyle.exercise'), visibility('exercise')],
    ['Stress', val('patientData.lifestyle.stress'), visibility('stress')],
    ['Sleep', val('patientData.lifestyle.sleep'), visibility('sleep')],
  ];

  const aiPatientPersonaRows: string[][] = [
    ['Language', val('language')],
    ['Voice', val('voice')],
    ['Opening & Reason for Visit', val('aiPatientData.openingReasonForVisit')],
    ['Main Concern', val('aiPatientData.mainConcernAttributes')],
    ['Associated Symptoms', val('aiPatientData.associatedSymptoms')],
    ['Allergies', val('aiPatientData.allergies')],
    ['Medications List', val('aiPatientData.currentMedications')],
    [
      'Diagnosed or Chronic Illnesses',
      val('aiPatientData.diagnosedChronicIllnesses'),
    ],
    [
      'Medical, Surgical, & Immunization History',
      val('aiPatientData.medicalHistory'),
    ],
    [
      'History of Substance Use (Alcohol, Drugs, & Tobacco)',
      val('aiPatientData.drugs'),
    ],
    ['Family Medical History', val('aiPatientData.familyMedicalHistory')],
    [
      'Relationship Status & Sexual Health',
      val('aiPatientData.relationshipStatusSexualHealth'),
    ],
    ['Personal & Social History', val('aiPatientData.personalSocialHistory')],
    ['Lifestyle – Housing', val('aiPatientData.housing')],
    ['Lifestyle – Transportation', val('aiPatientData.transportation')],
    ['Lifestyle – Occupation', val('aiPatientData.occupation')],
    ['Lifestyle – Diet', val('aiPatientData.diet')],
    ['Lifestyle – Exercise', val('aiPatientData.exercise')],
    ['Lifestyle – Stress', val('aiPatientData.stress')],
    ['Lifestyle – Sleep', val('aiPatientData.sleep')],
    ['Lifestyle – ADLs', val('aiPatientData.adls')],
    [
      'Emotional State & Personality',
      val('aiPatientData.emotionalStatePersonality'),
    ],
    [
      'Conversational Attitude & Speech Style',
      val('aiPatientData.conversationalAttitudeSpeechStyle'),
    ],
    ['Special Patient Information', val('aiPatientData.specialPatientInfo')],
    [
      'Location-Specific Information (including information specific to the setting the patient is being seen/evaluated in)',
      val('aiPatientData.locationSpecificInfo'),
    ],
  ];

  const clinicalCueRows: string[][] = [
    'Dyspnea (Difficulty Breathing)',
    'Pallor',
    'Cyanosis (perioral/circumoral)',
    'Jaundice (skin & sclera)',
    'Diaphoresis/Sweating',
    'Flushed/Reddened Skin',
    'Reddened/Bloodshot Eyes',
    'Lethargy/Reduced Facial Tone',
    'Facial Droop-Left Side',
    'Facial Droop-Right Side',
    'Tearing/Lacrimation',
  ].map((cue) => [cue, empty]);

  const affectiveRows: string[][] = [
    'Pain',
    'Fear',
    'Anger',
    'Agitation',
    'Anxiety',
    'Flat/Zoned-Out',
    'Confusion',
    'Nervousness',
    'Sadness/Distress',
    'Happiness',
    'Excitement',
    'Calm/Neutral Baseline',
    'Eye Contact Norms',
  ].map((state) => [state, empty]);

  const vitalSignLabels: Array<[string, string]> = [
    ['heartRate', 'HR (bpm)'],
    ['bloodPressure', 'BP (mmHg)'],
    ['respiratoryRate', 'RR (breaths/min)'],
    ['spO2', 'SpO2 (%)'],
    ['temperature', 'Temp (°F)'],
  ];
  const actionDocumentBlocks: Block[] = actionItems.flatMap((item) => {
    const title = firstValue(
      item,
      'name',
      'title',
      'itemName',
      'item_name',
      'actionName',
      'action_name'
    );
    const type = firstValue(
      item,
      'questionType',
      'question_type',
      'actionType',
      'action_type',
      'type',
      'itemType',
      'item_type'
    );
    const rows: string[][] = [
      [
        'Requirement / Distractor Status',
        firstValue(
          item,
          'requirement',
          'requirementStatus',
          'requirement_status',
          'distractorStatus',
          'distractor_status',
          'typeRequirement',
          'type_requirement'
        ),
      ],
      [
        'Attempts Allowed',
        firstValue(
          item,
          'attemptsAllowed',
          'attempts_allowed',
          'maxAttempts',
          'max_attempts'
        ),
      ],
      ['Action Type', type],
      [
        'Question / Prompt',
        firstValue(
          item,
          'question',
          'prompt',
          'text',
          'description',
          'details'
        ),
      ],
      [
        'Correct Answer',
        firstValue(
          item,
          'correctAnswer',
          'correct_answer',
          'correct',
          'answer',
          'correctOption',
          'correct_option'
        ),
      ],
      ['Items', firstValue(item, 'items', 'options', 'answers')],
      [
        'Concepts',
        firstValue(item, 'concepts', 'conceptPoints', 'concept_points'),
      ],
      [
        'Info Revealed to Learner After Completion',
        firstValue(
          item,
          'resultContent',
          'completionInfo',
          'completion_info',
          'infoRevealed',
          'info_revealed',
          'feedback',
          'passMessage',
          'pass_message'
        ),
      ],
    ];

    if (type.toLowerCase() === 'vital') {
      const vitals = item.vitals as Record<string, unknown> | undefined;
      const requirements = (item.vitalRequirementEntries ??
        item.vitalRequirements) as Record<string, unknown> | undefined;
      rows.push(
        ...vitalSignLabels.flatMap(([field, label]) => [
          [`${label} Results`, firstValue({ value: vitals?.[field] }, 'value')],
          [
            `${label} Requirement`,
            firstValue({ value: requirements?.[field] }, 'value'),
          ],
        ])
      );
    }

    return [
      {
        kind: 'subheading',
        text: title === em ? 'Unnamed Action' : title,
        color: BODY_COLOR,
      },
      { kind: 'dataTable', firstColKey: true, firstColWidth: 70, rows },
    ];
  });

  const orderValue = (order: Record<string, unknown>, ...keys: string[]) =>
    firstValue(order, ...keys);
  const medicationOrders = (sim.orders ?? []).filter((order) =>
    ['category', 'subcategory', 'type', 'orderType', 'order_type'].some((key) =>
      String(order[key] ?? '')
        .toLowerCase()
        .includes('medication')
    )
  );
  const nonMedicationOrders = (sim.orders ?? []).filter(
    (order) => !medicationOrders.includes(order)
  );
  const nonMedOrderRows = nonMedicationOrders.flatMap((order) => [
    [
      'Order Title / Name',
      orderValue(order, 'title', 'name', 'orderName', 'order_name'),
    ],
    ['Category', orderValue(order, 'category')],
    [
      'Subcategory',
      orderValue(order, 'subcategory', 'subCategory', 'sub_category'),
    ],
    ['Status', orderValue(order, 'status')],
    [
      'Details/Instructions',
      orderValue(order, 'details', 'instructions', 'description'),
    ],
    [
      'Start Date & Time',
      orderValue(order, 'startDateTime', 'start_date_time', 'startDate'),
    ],
    [
      'Due Date & Time',
      orderValue(order, 'dueDateTime', 'due_date_time', 'dueDate'),
    ],
    ['Type', orderValue(order, 'type', 'orderType', 'order_type')],
    ['Frequency', orderValue(order, 'frequency')],
    ['Count', orderValue(order, 'count', 'quantity')],
    [
      'System Visibility',
      orderValue(order, 'systemVisibility', 'system_visibility', 'visibility'),
    ],
  ]);
  const medOrderRows = medicationOrders.flatMap((order) => [
    [
      'Order Title',
      orderValue(order, 'title', 'name', 'orderName', 'order_name'),
    ],
    ['Category', orderValue(order, 'category')],
    [
      'Subcategory',
      orderValue(order, 'subcategory', 'subCategory', 'sub_category'),
    ],
    ['Status', orderValue(order, 'status')],
    [
      'Medication Name',
      orderValue(
        order,
        'medicationName',
        'medication_name',
        'drugName',
        'drug_name',
        'name'
      ),
    ],
    [
      'Administration Instructions',
      orderValue(
        order,
        'instructions',
        'administrationInstructions',
        'administration_instructions'
      ),
    ],
    [
      'Ordered Dosage',
      orderValue(order, 'dosage', 'orderedDosage', 'ordered_dosage'),
    ],
    ['Route', orderValue(order, 'route')],
    ['Frequency', orderValue(order, 'frequency')],
    ['Indication', orderValue(order, 'indication')],
    [
      'Grading — Medication Requirement Status',
      orderValue(order, 'typeRequirement', 'type_requirement', 'requirement'),
    ],
    [
      'System Visibility',
      orderValue(order, 'systemVisibility', 'system_visibility', 'visibility'),
    ],
  ]);

  const teamCommunicationRows: string[][] = [
    ['Type Requirement', val('teamCommunication.typeRequirement')],
    ['Prompt for Learner', val('teamCommunication.prompt')],
    ['Attempts Allowed', val('teamCommunication.maxAttempts')],
    ['Attempt Limit Type', val('teamCommunication.limitType')],
    ['Pass Threshold (%)', val('teamCommunication.passThreshold')],
    ['Pass Message', val('teamCommunication.passMessage')],
    ['Fail Message', val('teamCommunication.failMessage')],
    [
      'Reference Transcript / SBAR Criteria',
      val('teamCommunication.referenceTranscript'),
    ],
    [
      'Orders Revealed After Successful Completion',
      val('teamCommunication.onPassUnlockOrderIds'),
    ],
  ];

  const gradingComponents = sim.grading?.components ?? {};
  const gradingComponentEntries = Object.entries(gradingComponents).filter(
    ([, comp]) => comp
  );
  const gradingRubricRows: string[][] = gradingComponentEntries.length
    ? gradingComponentEntries.map(([key, comp]) => [
        key
          .replace(/([a-z])([A-Z])/g, '$1 $2')
          .replace(/^./, (c) => c.toUpperCase()),
        comp?.weight != null ? `${comp.weight}%` : empty,
      ])
    : Array.from({ length: 5 }, () => [empty, empty]);

  const privacyChecklistRows: string[][] = [
    ['Knock', empty],
    ['Open Door (excluded for High School scenarios)', empty],
    ['Close Door (excluded for High School scenarios)', empty],
    ['Open Curtain (excluded for High School scenarios)', empty],
    ['Close Curtain (excluded for High School scenarios)', empty],
    ['Hand Hygiene', empty],
    ['Don Standard Gloves', empty],
    ['Doff Standard Gloves', empty],
    ['Don Sterile Gloves (excluded for High School scenarios)', empty],
    ['Doff Sterile Gloves (excluded for High School scenarios)', empty],
    ['Don Eye Protection', empty],
    ['Doff Eye Protection', empty],
    ['Don Isolation Gown', empty],
    ['Doff Isolation Gown', empty],
    ['Don Surgical Mask', empty],
    ['Doff Surgical Mask', empty],
    ['Don Respirator Mask', empty],
    ['Doff Respirator Mask', empty],
    ['Discard Sharps (excluded for High School scenarios)', empty],
    [
      'Discard Non-Infectious Waste (excluded for High School scenarios)',
      empty,
    ],
    ['Discard Infectious Waste (excluded for High School scenarios)', empty],
    ['Bed/Chair Locked (excluded for High School scenarios)', empty],
    ['Bed Alarm Activated (excluded for High School scenarios)', empty],
    ['Bed Lowest Position (excluded for High School scenarios)', empty],
    ['Call Light in Reach (excluded for High School scenarios)', empty],
    ['Equipment Checked (excluded for High School scenarios)', empty],
    [
      'Lines / Tubes / Drains Checked (excluded for High School scenarios)',
      empty,
    ],
    ['Personal Items in Reach (excluded for High School scenarios)', empty],
  ];

  const documentationChecklistRows: string[][] = [
    ['Actions, Assessments, and Patient Education documented', empty],
    ['Overview & History Fields Updated', empty],
    ['Patient Emotional Response Documented', empty],
  ];

  const communicatedConceptsRows: string[][] = Array.from(
    { length: 10 },
    () => [empty, empty]
  );

  const sequencingRows: string[][] = Array.from({ length: 4 }, () => [
    empty,
    empty,
    empty,
  ]);

  return new DocumentRenderer(
    sim,
    'Instructor-Facing Scenario Details Document',
    logo,
    SECTION_HEADING_COLOR
  ).render([
    {
      kind: 'keyValueList',
      showEmpty: true,
      rows: [
        { label: 'Scenario ID', path: 'id' },
        { label: 'Title', path: 'title' },
        { label: 'Clinical Setting', path: 'department' },
        { label: 'Target Audience Learner Level', path: 'learnerLevel' },
        { label: 'Difficulty', path: 'difficultyLevel' },
        { label: 'Estimated Duration', path: 'estimatedDuration' },
        { label: 'Unit', path: 'unit' },
        { label: 'Topics', path: 'topicsAddressed' },
      ],
    },
    {
      kind: 'keyValueList',
      showEmpty: true,
      rows: [
        { label: 'Product Name', path: 'productSetup.title' },
        {
          label: 'Additional Equipment Necessary',
          path: 'additionalEquipment',
        },
        { label: 'Optional Equipment', path: 'optionalEquipment' },
        { label: 'Setup Notes', path: 'setupNotes' },
      ],
    },
    {
      kind: 'keyValueList',
      showEmpty: true,
      rows: [
        { label: 'Description', path: 'description' },
        { label: 'Learning Objectives', path: 'learningObjective' },
      ],
    },

    { kind: 'heading', text: 'PATIENT DETAILS', color: SECTION_HEADING_COLOR },
    { kind: 'subheading', text: 'Patient Snapshot', color: BODY_COLOR },
    {
      kind: 'keyValueList',
      showEmpty: true,
      rows: [
        { label: 'Simulated Date/Time', value: dt('simulationStartTime') },
        {
          label: 'Patient Name / Preferred Name',
          value: `${val('patientData.name')} / ${val('patientData.preferredName')}`,
        },
        { label: 'Patient Age', path: 'patientData.age' },
        { label: 'Patient DOB', path: 'patientData.dobMonthDay' },
        { label: 'Patient Gender', path: 'patientData.gender' },
        { label: 'Patient Race', path: 'patientData.race' },
        { label: 'Chief Complaint', path: 'patientData.chiefComplaint' },
      ],
    },
    { kind: 'subheading', text: 'Patient Chart Info', color: BODY_COLOR },
    {
      kind: 'dataTable',
      head: ['Field', 'Entry', 'Visibility Status'],
      firstColKey: true,
      firstColWidth: 60,
      columnStyles: {
        1: { fillColor: [255, 255, 255] },
        2: { fillColor: [255, 255, 255] },
      },
      rows: patientChartRows,
    },

    {
      kind: 'heading',
      text: 'AI PATIENT & AVATAR',
      color: SECTION_HEADING_COLOR,
    },
    {
      kind: 'subheading',
      text: 'AI Patient Persona & Speech Context & Configuration',
      color: BODY_COLOR,
    },
    {
      kind: 'dataTable',
      firstColKey: true,
      firstColWidth: 70,
      rows: aiPatientPersonaRows,
    },
    {
      kind: 'subheading',
      text: 'Avatar Configuration [hide for non-avatar simulations]',
      color: BODY_COLOR,
    },
    {
      kind: 'subheading',
      text: '3D Clinical Visual Cue Configuration',
      color: BODY_COLOR,
    },
    {
      kind: 'dataTable',
      head: ['Clinical Cue', 'Intensity Level'],
      firstColKey: true,
      firstColWidth: 90,
      rows: clinicalCueRows,
    },
    {
      kind: 'subheading',
      text: '3D Affective/Expression/Behavioral State Configuration',
      color: BODY_COLOR,
    },
    {
      kind: 'dataTable',
      head: ['Affective State', 'Intensity Level'],
      firstColKey: true,
      firstColWidth: 90,
      rows: affectiveRows,
    },

    ...(actionDocumentBlocks.length
      ? [
          {
            kind: 'heading' as const,
            text: 'ACTIONS, ASSESSMENTS, CARE, INTERVENTIONS, & TASKS',
            color: SECTION_HEADING_COLOR,
          },
        ]
      : []),
    ...actionDocumentBlocks,

    ...(nonMedOrderRows.length || medOrderRows.length
      ? [
          {
            kind: 'heading' as const,
            text: 'ORDERS',
            color: SECTION_HEADING_COLOR,
          },
        ]
      : []),
    ...(nonMedOrderRows.length
      ? [
          {
            kind: 'subheading' as const,
            text: '[Non-Medication Order Template]',
            color: BODY_COLOR,
          },
          {
            kind: 'dataTable' as const,
            firstColKey: true,
            firstColWidth: 60,
            rows: nonMedOrderRows,
          },
        ]
      : []),
    ...(medOrderRows.length
      ? [
          {
            kind: 'subheading' as const,
            text: '[Medication Order Template]',
            color: BODY_COLOR,
          },
          {
            kind: 'dataTable' as const,
            firstColKey: true,
            firstColWidth: 70,
            rows: medOrderRows,
          },
        ]
      : []),

    {
      kind: 'heading',
      text: 'TEAM COMMUNICATION',
      color: SECTION_HEADING_COLOR,
    },
    {
      kind: 'dataTable',
      firstColKey: true,
      firstColWidth: 70,
      rows: teamCommunicationRows,
    },

    {
      kind: 'heading',
      text: 'GRADING / RUBRIC WEIGHTS',
      color: SECTION_HEADING_COLOR,
    },
    {
      kind: 'keyValueList',
      showEmpty: true,
      rows: [
        { label: 'Max Score', path: 'grading.maxScore' },
        {
          label: 'Show Debrief to Students',
          path: 'grading.showDebriefToStudents',
        },
      ],
    },
    {
      kind: 'dataTable',
      head: ['Rubric Item', 'Weight'],
      rows: gradingRubricRows,
    },

    {
      kind: 'subheading',
      text: 'Privacy, Infection Prevention, & Environmental Safety Checklist Configuration',
      color: BODY_COLOR,
    },
    {
      kind: 'dataTable',
      head: ['Field', 'Requirement'],
      firstColKey: true,
      firstColWidth: 90,
      rows: privacyChecklistRows,
    },

    {
      kind: 'subheading',
      text: 'Documentation Checklist Configuration',
      color: BODY_COLOR,
    },
    {
      kind: 'dataTable',
      head: ['Field', 'Requirement'],
      firstColKey: true,
      firstColWidth: 90,
      rows: documentationChecklistRows,
    },

    {
      kind: 'subheading',
      text: 'Communicated Concepts Configuration',
      color: BODY_COLOR,
    },
    {
      kind: 'dataTable',
      head: ['Communication Criterion Title', 'Requirement'],
      rows: communicatedConceptsRows,
    },

    {
      kind: 'heading',
      text: 'SEQUENCING & PRIORITIZATION',
      color: SECTION_HEADING_COLOR,
    },
    {
      kind: 'dataTable',
      head: [
        'Groupings (indicate Flexible or Strict for each grouping/subgrouping)',
        'Elements / Subgroupings (indicate Flexible or Strict for each grouping/subgrouping)',
        'Timing Specs (only indicate when an element must be performed within x minutes before/after another element)',
      ],
      rows: sequencingRows,
    },
  ]);
}

function buildBriefingScript(
  sim: SimulationDetail,
  logo: LogoAsset | null
): jsPDF {
  const estimatedMinutes = resolveValue(sim, 'estimatedDuration').replace(
    /[^0-9.]/g,
    ''
  );
  return new DocumentRenderer(
    sim,
    'Instructor-Facing Student Briefing Script',
    logo,
    SECTION_HEADING_COLOR
  ).render([
    {
      kind: 'metaGrid',
      rows: [
        [
          { label: 'Scenario ID', path: 'id' },
          { label: 'Title', path: 'title' },
        ],
        [
          { label: 'Clinical Setting', path: 'department' },
          { label: 'Target Audience Learner Level', path: 'learnerLevel' },
        ],
        [
          { label: 'Difficulty', path: 'difficultyLevel' },
          { label: 'Estimated Duration', path: 'estimatedDuration' },
        ],
      ],
    },
    {
      kind: 'keyValueList',
      rows: [
        { label: 'Recommended Briefing Time', value: '5–10 minutes' },
        {
          label: 'Delivered By',
          value: 'Lead Facilitator, before learner enters simulation space',
        },
        {
          label: 'Audience',
          value: 'Individual learner or learner team assigned to this scenario',
        },
        { label: 'Topics Addressed', path: 'topicsAddressed' },
      ],
    },
    {
      kind: 'heading',
      text: '1. Welcome & Psychologically Safe Learning Environment',
      color: SECTION_HEADING_COLOR,
      rule: true,
    },
    {
      kind: 'static',
      text: 'Establish rapport, confidentiality, and a "safe container" for practice before any content is introduced (HSSOBP Prebriefing Criterion: establish a safe learning environment).',
      bold: true,
    },
    { kind: 'say', path: 'studentBriefing.safeEnvironment' },
    {
      kind: 'note',
      text: 'Confirm learners agree to confidentiality ("what happens in the sim stays in the sim") and that mistakes are expected and welcomed as part of learning.',
    },
    {
      kind: 'heading',
      text: '2. Facilitator Role & Support Available',
      color: SECTION_HEADING_COLOR,
      rule: true,
    },
    { kind: 'say', path: 'studentBriefing.facilitatorSupport' },
    {
      kind: 'note',
      text: 'State clearly whether you will intervene, answer clarifying questions, or remain silent/observational during the encounter, and how a learner can signal if they need to pause the simulation.',
    },
    {
      kind: 'heading',
      text: '3. Orientation to the Simulated Space',
      color: SECTION_HEADING_COLOR,
      rule: true,
    },
    { kind: 'say', path: 'studentBriefing.orientationSpace' },
    {
      kind: 'note',
      text: 'Physically point out the room layout, patient location/avatar screen or manikin, documentation station, and any "backstage" areas (control room, camera) as applicable.',
    },
    {
      kind: 'heading',
      text: '4. Orientation to Equipment & Technology',
      color: SECTION_HEADING_COLOR,
      rule: true,
    },
    { kind: 'say', path: 'studentBriefing.orientationEquipment' },
    {
      kind: 'note',
      text: 'Demonstrate the AI patient interaction method (voice-activated conversation), how to view orders, how vitals are displayed, and, if avatar-based, how the metahuman avatar responds to voice and presents visually.',
    },
    {
      kind: 'heading',
      text: '5. Orientation to Roles & Expectations',
      color: SECTION_HEADING_COLOR,
      rule: true,
    },
    { kind: 'say', path: 'studentBriefing.rolesExpectations' },
    {
      kind: 'note',
      text: 'If this is a team scenario, assign/confirm roles now (see Roles table pulled from the Facilitator Guide / Set-Up Notes).',
    },
    {
      kind: 'heading',
      text: '6. Method of Evaluation',
      color: SECTION_HEADING_COLOR,
      rule: true,
    },
    { kind: 'say', path: 'studentBriefing.evaluation' },
    {
      kind: 'note',
      text: 'Clarify practice vs. graded/assessment mode, and whether the AI-generated rubric score and transcript will be shared with the learner, instructor, or both.',
    },
    {
      kind: 'heading',
      text: '7. Time Allotment',
      color: SECTION_HEADING_COLOR,
      rule: true,
    },
    { kind: 'say', path: 'studentBriefing.timeAllotment' },
    {
      kind: 'static',
      text: `Reference timing: ${estimatedMinutes} minutes estimated active simulation time`,
    },
    {
      kind: 'heading',
      text: '8. Purpose of This Simulation',
      color: SECTION_HEADING_COLOR,
      rule: true,
    },
    { kind: 'say', path: 'studentBriefing.purpose' },
    {
      kind: 'heading',
      text: '9. Learning Objectives',
      color: SECTION_HEADING_COLOR,
      rule: true,
    },
    {
      kind: 'static',
      text: 'Read only if objective disclosure will not compromise the assessment intent (HSSOBP allows objectives to be withheld in evaluative/high-stakes simulations if disclosure would cue the correct answer).',
      bold: true,
    },
    { kind: 'say', path: 'studentBriefing.learningObjectives' },
    {
      kind: 'heading',
      text: '10. Simulation Limitations',
      color: SECTION_HEADING_COLOR,
      rule: true,
    },
    { kind: 'say', path: 'studentBriefing.simulationLimitations' },
    {
      kind: 'note',
      text: 'Name the specific fidelity gaps for this scenario (e.g., AI patient voice cadence, manikin limitations, avatar expression range) so learners calibrate expectations and suspend disbelief appropriately.',
    },
    {
      kind: 'heading',
      text: '11. Handoff Report (Pre-Simulation SBAR)',
      color: SECTION_HEADING_COLOR,
      rule: true,
    },
    {
      kind: 'static',
      text: 'Read the incoming report exactly as the outgoing nurse would give it. This is the same content that appears on the Printable Student-Facing Patient SBAR handout; provide that handout now if used.',
      bold: true,
    },
    { kind: 'say', path: 'sbar.situation' },
    { kind: 'say', path: 'sbar.background' },
    { kind: 'say', path: 'sbar.assessment' },
    { kind: 'say', path: 'sbar.recommendation' },
    {
      kind: 'heading',
      text: '12. Questions Before We Begin',
      color: SECTION_HEADING_COLOR,
      rule: true,
    },
    {
      kind: 'sayText',
      text: 'Before we start, does anyone have any questions about the space, the equipment, your role, or what to expect?',
    },
    {
      kind: 'note',
      text: 'Pause. Answer logistics/orientation questions only, do not provide clinical hints. Then direct learner(s) to the simulation start point.',
    },
    { kind: 'sayText', text: "You may begin when you're ready. Good luck." },
    {
      kind: 'heading',
      text: 'Healthcare Simulation Standards of Best Practice Resources',
      color: SECTION_HEADING_COLOR,
      rule: true,
    },
    {
      kind: 'link',
      prefix: 'Additional resources and information available at ',
      url: 'https://www.inacsl.org/healthcare-simulation-standards',
    },
  ]);
}

function buildDebriefingScript(
  sim: SimulationDetail,
  logo: LogoAsset | null
): jsPDF {
  return new DocumentRenderer(
    sim,
    'Instructor-Facing Facilitated Student Debriefing Script',
    logo,
    SECTION_HEADING_COLOR
  ).render([
    {
      kind: 'metaGrid',
      rows: [
        [
          { label: 'Scenario ID', path: 'id' },
          { label: 'Title', path: 'title' },
        ],
        [
          { label: 'Clinical Setting', path: 'department' },
          { label: 'Target Audience Learner Level', path: 'learnerLevel' },
        ],
        [
          { label: 'Difficulty', path: 'difficultyLevel' },
          { label: 'Estimated Duration', path: 'estimatedDuration' },
        ],
      ],
    },
    {
      kind: 'keyValueList',
      rows: [
        {
          label: 'Recommended Debriefing Time',
          value: '1 to 2 times the duration of active simulation time',
        },
        {
          label: 'Debriefing Method',
          value:
            "PEARLs, Plus/Delta, Advocacy-Inquiry, GAS, or other — state facilitator's chosen method",
        },
        {
          label: 'Delivered By',
          value:
            'Trained facilitator, immediately after simulation ends, in a private/quiet space',
        },
      ],
    },
    {
      kind: 'heading',
      text: 'Facilitator Preparation',
      color: SECTION_HEADING_COLOR,
      rule: true,
    },
    {
      kind: 'checklist',
      items: [
        'Private, distraction-free space secured',
        'Learner transcript / action log and performance report reviewed',
        'Confidentiality and "engagement, not judgment" ground rules ready to restate',
      ],
    },
    {
      kind: 'heading',
      text: 'Phase 1: Reactions',
      color: SECTION_HEADING_COLOR,
      rule: true,
    },
    {
      kind: 'static',
      text: 'Purpose: allow the learner to decompress and voice an initial emotional response before any analysis begins. Do not evaluate performance in this phase.',
      bold: true,
    },
    {
      kind: 'sayText',
      text: 'Before we talk through what happened, how are you feeling right now?',
    },
    {
      kind: 'sayText',
      text: "Is there anything on your mind about the experience you'd like to share before we go further?",
    },
    {
      kind: 'sayText',
      text: 'What felt most challenging? Where did you feel most confident?',
    },
    {
      kind: 'note',
      text: 'Listen without correcting. Reflect feelings back neutrally ("It sounds like that felt stressful when...") before moving on.',
    },
    {
      kind: 'heading',
      text: 'Phase 2: Analysis / Description',
      color: SECTION_HEADING_COLOR,
      rule: true,
    },
    {
      kind: 'static',
      text: "Purpose: reconstruct what happened and explore the reasoning behind the learner's decisions, using evidence — not opinion — as the anchor.",
      bold: true,
    },
    {
      kind: 'sayTemplate',
      template:
        'Walk me through what you noticed when you started the simulation. What was your initial impression of {{patientData.name}}?',
    },
    {
      kind: 'sayText',
      text: 'What data did you gather first, and why did you prioritize it that way?',
    },
    {
      kind: 'sayText',
      text: 'Can someone summarize what the case was about from a medical point of view? What happened? What happened next?" or "In your own words, what was going on? What were your top concerns?',
    },
    {
      kind: 'subheading',
      text: '2.1 Actions, Assessments, Care, Interventions, & Tasks',
    },
    {
      kind: 'sayText',
      text: "Which actions, assessments, care, interventions, or tasks do you feel confident about? Was there anything you considered doing but didn't?",
    },
    { kind: 'subheading', text: '2.2 Privacy, Infection Prevention, & Safety' },
    {
      kind: 'sayText',
      text: 'Talk me through the privacy, infection prevention & control, and safety steps you took — were there any you skipped or almost skipped?',
    },
    { kind: 'subheading', text: '2.3 Clinical Documentation Quality' },
    {
      kind: 'sayText',
      text: 'How did you decide what to document, and in what format? What might you add if you did this again?',
    },
    {
      kind: 'subheading',
      text: '2.4 Professional & Therapeutic Communication & Team/Provider Reporting',
    },
    {
      kind: 'sayText',
      text: 'Talk me through the strategies you used when speaking with the patient.\nIs there anything you would say or explain differently if given another opportunity?',
    },
    {
      kind: 'sayTextWithPrefix',
      prefix: 'If Care Team Communication occurred,',
      text: "Talk me through the report you gave to the member of the care team. What was your S-B-A-R? Is there anything you'd reorganize or add?",
    },
    { kind: 'subheading', text: '2.5 Prioritization of Care' },
    {
      kind: 'sayText',
      text: 'Of everything you did, what did you decide to do first, and why? Would you change that order now?',
    },
    {
      kind: 'heading',
      text: 'Phase 3: Application / Summary',
      color: SECTION_HEADING_COLOR,
      rule: true,
    },
    { kind: 'subheading', text: '3.1 Transfer to Clinical Practice' },
    {
      kind: 'static',
      text: 'Purpose: help the learner translate this simulated experience into real clinical practice.',
    },
    {
      kind: 'sayText',
      text: "Now that we are clear on your perspectives on what happened, let's discuss this case further and determine how it relates to real-life experiences.",
    },
    {
      kind: 'sayText',
      text: 'How does this situation compare to something you might see in a real clinical setting?',
    },
    {
      kind: 'sayTemplate',
      template:
        'What would you do differently next time you care for a patient like {{patientData.name}}?',
    },
    { kind: 'subheading', text: '3.2 Key Takeaways' },
    {
      kind: 'sayText',
      text: "If you had to summarize the one or two most important things you're taking away from today, what would they be?",
    },
    {
      kind: 'static',
      text: "Tie the learner's stated takeaway back to the scenario's learning objectives where possible.",
    },
    {
      kind: 'boldLabeled',
      label: 'Purpose for reference',
      path: 'studentBriefing.purpose',
    },
    {
      kind: 'boldLabeled',
      label: 'Learning Objectives for reference',
      path: 'learningObjective',
    },
    {
      kind: 'heading',
      text: 'Independent Student Debrief (Optional Supplement)',
      color: SECTION_HEADING_COLOR,
      rule: true,
    },
    { kind: 'say', path: 'grading.debriefReflectionPrompt', showEmpty: true },
    {
      kind: 'heading',
      text: 'Closing',
      color: SECTION_HEADING_COLOR,
      rule: true,
    },
    {
      kind: 'sayText',
      text: 'Thank you for your openness today. Your reflection is exactly the kind of thinking that builds strong clinical judgment.',
    },
    {
      kind: 'note',
      text: 'Confirm next steps: repeat attempt, remediation, or progression, per program policy.',
    },
    {
      kind: 'heading',
      text: 'Healthcare Simulation Standards of Best Practice Resources',
      color: SECTION_HEADING_COLOR,
      rule: true,
    },
    {
      kind: 'link',
      prefix: 'Additional resources and information available at ',
      url: 'https://www.inacsl.org/healthcare-simulation-standards',
    },
  ]);
}

function buildPatientSbar(
  sim: SimulationDetail,
  logo: LogoAsset | null
): jsPDF {
  return new DocumentRenderer(
    sim,
    'Patient Handoff Report (SBAR)',
    logo,
    SECTION_HEADING_COLOR
  ).render([
    {
      kind: 'headerTable',
      head: ['Patient Name', 'Clinical Setting', 'Date / Time'],
      row: [
        resolveValue(sim, 'patientData.name'),
        resolveValue(sim, 'department'),
        resolveValue(sim, 'simulationStartTime').replace('T', '/'),
      ],
    },
    {
      kind: 'heading',
      text: 'S — Situation',
      color: SECTION_HEADING_COLOR,
      rule: true,
    },
    { kind: 'para', path: 'sbar.situation' },
    {
      kind: 'heading',
      text: 'B — Background',
      color: SECTION_HEADING_COLOR,
      rule: true,
    },
    { kind: 'para', path: 'sbar.background' },
    {
      kind: 'heading',
      text: 'A — Assessment',
      color: SECTION_HEADING_COLOR,
      rule: true,
    },
    { kind: 'para', path: 'sbar.assessment' },
    {
      kind: 'heading',
      text: 'R — Recommendation',
      color: SECTION_HEADING_COLOR,
      rule: true,
    },
    { kind: 'para', path: 'sbar.recommendation' },
  ]);
}

/** Draws the small running letterhead (logo + scenario title) reused on every Patient Chart page. */
function drawChartPageHeader(
  pdf: jsPDF,
  sim: SimulationDetail,
  logo: LogoAsset | null
): void {
  if (logo) {
    const width = LOGO_WIDTH;
    const height = width * logo.ratio;
    pdf.addImage(
      logo.dataUrl,
      'PNG',
      (PAGE_WIDTH - width) / 2,
      8,
      width,
      height
    );
  } else {
    pdf.setFillColor(...SECTION_HEADING_COLOR);
    pdf.roundedRect(PAGE_WIDTH / 2 - 22, 10, 6, 6, 1, 1, 'F');
    pdf.setFont(DOCUMENT_FONT, 'bold');
    pdf.setFontSize(12);
    pdf.setTextColor(40, 40, 40);
    pdf.text('Realityworks', PAGE_WIDTH / 2 - 14, 15);
    const realityworksWidth = pdf.getTextWidth('Realityworks');
    pdf.setTextColor(...SECTION_HEADING_COLOR);
    pdf.text(' AI', PAGE_WIDTH / 2 - 14 + realityworksWidth, 15);
  }
  if (sim.title) {
    pdf.setFont(DOCUMENT_FONT, 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(...LABEL_COLOR);
    const titleText = sanitizePdfText(sim.title);
    pdf.text(titleText, (PAGE_WIDTH - pdf.getTextWidth(titleText)) / 2, 22);
  }
}

/** Draws the running "{Document} | Realityworks AI Patient Simulation | Page X of Y" footer on every page. */
function drawChartFooters(pdf: jsPDF, heading: string): void {
  const pageCount = pdf.getNumberOfPages();
  for (let page = 1; page <= pageCount; page++) {
    pdf.setPage(page);
    pdf.setDrawColor(200, 200, 200);
    pdf.setLineWidth(0.2);
    pdf.line(PAGE_MARGIN, 286, PAGE_MARGIN + CONTENT_WIDTH, 286);
    pdf.setFont(DOCUMENT_FONT, 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(...LABEL_COLOR);
    const text = `${heading} | Realityworks AI Patient Simulation | Page ${page} of ${pageCount}`;
    pdf.text(text, (PAGE_WIDTH - pdf.getTextWidth(text)) / 2, 291);
  }
}

function buildPatientChart(
  sim: SimulationDetail,
  logo: LogoAsset | null
): jsPDF {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  registerCalibriFont(pdf);
  const heading = 'Printable Patient Chart';
  const showHistory =
    String(sim.historyVisibility ?? '').toLowerCase() !== 'false';
  const listValue = (path: string) => {
    const raw = getPath(sim, path);
    return Array.isArray(raw)
      ? raw.filter(Boolean).join('\n')
      : resolveValue(sim, path);
  };

  drawChartPageHeader(pdf, sim, logo);
  let y = 30;
  pdf.setFont(DOCUMENT_FONT, 'normal');
  pdf.setFontSize(26);
  pdf.setTextColor(...SECTION_HEADING_COLOR);
  const headingWidth = pdf.getTextWidth(heading);
  pdf.text(heading, (PAGE_WIDTH - headingWidth) / 2, y);
  y += 12;

  // Name row (label | full-width value).
  autoTable(pdf, {
    startY: y,
    theme: 'grid',
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN, top: 26 },
    styles: {
      font: DOCUMENT_FONT,
      fontSize: 9,
      cellPadding: 3,
      textColor: BODY_COLOR,
      lineWidth: 0.2,
      lineColor: BODY_COLOR,
    },
    columnStyles: {
      0: { fontStyle: 'bold', fillColor: STRIPE_FILL, cellWidth: 42 },
    },
    body: [['Name', resolveValue(sim, 'patientData.name')]],
  });
  y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
    .finalY;

  // DOB / Age / Gender / Height / Weight: five equal cells, each with a stacked bold label + value.
  const demographicCells: { content: string }[] = [
    { content: `DOB:\u0001${resolveValue(sim, 'patientData.dobMonthDay')}` },
    {
      content: `Age:\u0001${[resolveValue(sim, 'patientData.age'), resolveValue(sim, 'patientData.age') ? 'years' : ''].filter(Boolean).join(' ')}`,
    },
    { content: `Gender:\u0001${resolveValue(sim, 'patientData.gender')}` },
    {
      content: `Height:\u0001${[resolveValue(sim, 'patientData.vitals.height'), resolveValue(sim, 'patientData.vitals.height') ? 'cm' : ''].filter(Boolean).join(' ')}`,
    },
    {
      content: `Weight:\u0001${[resolveValue(sim, 'patientData.vitals.weight'), resolveValue(sim, 'patientData.vitals.weight') ? 'kg' : ''].filter(Boolean).join(' ')}`,
    },
  ];
  autoTable(pdf, {
    startY: y,
    theme: 'grid',
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN, top: 26 },
    styles: {
      font: DOCUMENT_FONT,
      fontSize: 8.5,
      cellPadding: 3,
      textColor: BODY_COLOR,
      fillColor: [255, 255, 255],
      minCellHeight: 14,
      lineWidth: 0.2,
      lineColor: BODY_COLOR,
    },
    columnStyles: { 0: { cellWidth: 42 } },
    didParseCell: (data) => {
      data.cell.text = [];
    },
    didDrawCell: (data) => {
      const raw = String(data.cell.raw ?? '');
      const [label, value] = raw.split('\u0001');
      pdf.setFont(DOCUMENT_FONT, 'bold');
      pdf.setFontSize(8.5);
      pdf.setTextColor(...BODY_COLOR);
      pdf.text(label, data.cell.x + 2, data.cell.y + 5);
      pdf.setFont(DOCUMENT_FONT, 'normal');
      const lines = pdf.splitTextToSize(
        sanitizePdfText(value ?? ''),
        data.cell.width - 4
      ) as string[];
      lines.forEach((line, i) =>
        pdf.text(line, data.cell.x + 2, data.cell.y + 10 + i * 4)
      );
    },
    body: [demographicCells.map((c) => c.content)],
  });
  y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
    .finalY;

  const sections: [string, string][] = [
    ['Allergies', listValue('patientData.allergies')],
    ['Presenting Complaint', resolveValue(sim, 'patientData.chiefComplaint')],
    [
      'History of Present Illness (Symptoms & Onset)',
      resolveValue(sim, 'patientData.historyOfPresentIllness'),
    ],
  ];
  if (showHistory) {
    sections.push(
      ['Past Medical History', resolveValue(sim, 'patientData.medicalHistory')],
      [
        'Past Surgical History',
        resolveValue(sim, 'patientData.pastSurgicalHistory'),
      ],
      [
        'Family Medical History',
        resolveValue(sim, 'patientData.familyMedicalHistoryClinical'),
      ]
    );
  }
  sections.push(
    [
      'Current Home Medications & Indications:',
      listValue('patientData.currentMedications'),
    ],
    [
      'Primary Care Provider',
      resolveValue(sim, 'patientData.primaryCareProvider'),
    ],
    ['Immunization Status', listValue('patientData.immunizationHistory')],
    [
      'Tobacco History & Use',
      resolveValue(sim, 'patientData.socialHistory.tobacco'),
    ],
    [
      'Alcohol History & Use',
      resolveValue(sim, 'patientData.socialHistory.alcohol'),
    ],
    [
      'Drug History & Use',
      resolveValue(sim, 'patientData.socialHistory.drugs'),
    ],
    ['Housing', resolveValue(sim, 'patientData.lifestyle.housing')],
    [
      'Transportation',
      resolveValue(sim, 'patientData.lifestyle.transportation'),
    ],
    ['Occupation', resolveValue(sim, 'patientData.lifestyle.occupation')],
    ['Diet', resolveValue(sim, 'patientData.lifestyle.diet')],
    ['Exercise', resolveValue(sim, 'patientData.lifestyle.exercise')],
    ['Stress', resolveValue(sim, 'patientData.lifestyle.stress')],
    ['Sleep', resolveValue(sim, 'patientData.lifestyle.sleep')]
  );

  autoTable(pdf, {
    startY: y,
    theme: 'grid',
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN, top: 26 },
    styles: {
      font: DOCUMENT_FONT,
      fontSize: 9,
      cellPadding: 3,
      textColor: BODY_COLOR,
      lineWidth: 0.2,
      lineColor: BODY_COLOR,
    },
    columnStyles: {
      0: { fontStyle: 'bold', fillColor: STRIPE_FILL, cellWidth: 42 },
      1: { cellWidth: CONTENT_WIDTH - 42 },
    },
    didDrawPage: () => drawChartPageHeader(pdf, sim, logo),
    body: sections.map(([label, value]) => [label, value || '—']),
  });
  y =
    (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
      .finalY + 8;

  if (y > PAGE_BOTTOM - 15) {
    pdf.addPage();
    drawChartPageHeader(pdf, sim, logo);
    y = 34;
  }
  pdf.setFont(DOCUMENT_FONT, 'bold');
  pdf.setFontSize(12);
  pdf.setTextColor(...SECTION_HEADING_COLOR);
  pdf.text('Notes', PAGE_MARGIN, y);
  y += 2;
  pdf.setDrawColor(150, 150, 150);
  pdf.setLineWidth(0.4);
  pdf.line(PAGE_MARGIN, y, PAGE_MARGIN + CONTENT_WIDTH, y);

  drawChartFooters(pdf, heading);
  return pdf;
}

const BUILDERS: Record<
  SimulationDocumentType,
  (sim: SimulationDetail, logo: LogoAsset | null) => jsPDF
> = {
  'setup-guide': buildSetupGuide,
  'simulation-details': buildSimulationDetails,
  'briefing-script': buildBriefingScript,
  'debriefing-script': buildDebriefingScript,
  'patient-sbar': buildPatientSbar,
  'patient-chart': buildPatientChart,
};

/** Populates the approved template layout for the given document type from current scenario data and saves the PDF. */
export async function generateSupportingDocument(
  documentType: SimulationDocumentType,
  sim: SimulationDetail,
  filename: string
): Promise<void> {
  const logo = await loadLogo();
  const pdf = BUILDERS[documentType](sim, logo);
  pdf.save(filename);
}
