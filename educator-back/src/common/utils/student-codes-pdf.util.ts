import { readFileSync } from 'fs';
import { once } from 'events';
import { join } from 'path';
import PDFDocument from 'pdfkit';
import { ClassStudentCodesPdfConstants } from '../constants/class.constants';
import {
  ClassStudentCodesExportMeta,
  ClassStudentCodesExportRow,
} from '../interfaces/class.interface';

type PdfDoc = InstanceType<typeof PDFDocument>;

const assetCache = new Map<string, Buffer>();

/** Reads a bundled asset once per process; the CJK font is only ever read if a CJK value appears. */
function loadAsset(relativePath: string): Buffer {
  let asset = assetCache.get(relativePath);
  if (!asset) {
    asset = readFileSync(join(__dirname, ClassStudentCodesPdfConstants.ASSETS_DIR, relativePath));
    assetCache.set(relativePath, asset);
  }
  return asset;
}

/**
 * Takes everything pdfkit has written so far. `read()` drains the internal buffer synchronously,
 * so output leaves after every batch regardless of when `'data'` events would have fired.
 */
function drainOutput(doc: PdfDoc): Buffer | null {
  const parts: Buffer[] = [];
  let chunk: Buffer | null;
  while ((chunk = doc.read() as Buffer | null) !== null) parts.push(chunk);
  return parts.length ? Buffer.concat(parts) : null;
}

/** `2026-09-01` → `01 Sep 2026`; anything unparseable is shown as stored. */
function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  if (!value || Number.isNaN(date.getTime())) return value;
  const parts = new Intl.DateTimeFormat(ClassStudentCodesPdfConstants.DATE_LOCALE, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? '';
  return `${part('day')} ${part('month')} ${part('year')}`;
}

/**
 * Draws one streaming student-codes PDF. Text is always placed with explicit coordinates and no
 * `width`, so pdfkit never wraps or auto-adds pages; page breaks are decided here instead.
 */
class StudentCodesPdfWriter {
  private readonly c = ClassStudentCodesPdfConstants;
  private readonly left: number;
  private readonly right: number;
  private readonly width: number;
  private readonly bottom: number;
  private readonly nameColumnWidth: number;
  private cjkRegistered = false;
  private pageNumber = 0;
  private rowIndex = 0;
  private y = 0;

  constructor(
    private readonly doc: PdfDoc,
    private readonly meta: ClassStudentCodesExportMeta,
  ) {
    const { MARGIN, FONT_NAMES, FONT_FILES, NAME_COLUMN_RATIO } = this.c;
    this.left = MARGIN;
    this.right = doc.page.width - MARGIN;
    this.width = this.right - this.left;
    this.bottom = doc.page.height - MARGIN;
    this.nameColumnWidth = this.width * NAME_COLUMN_RATIO;
    doc.registerFont(FONT_NAMES.REGULAR, loadAsset(FONT_FILES.REGULAR));
    doc.registerFont(FONT_NAMES.BOLD, loadAsset(FONT_FILES.BOLD));
  }

  /** Page 1: logo row, class title, orange subtitle, school/date line, then the table header. */
  drawFirstPage(): void {
    const { MARGIN, LOGO_FILE, LOGO_HEIGHT, TOP_BAR_HEIGHT, COLORS, FONT_SIZES, LABELS } = this.c;
    this.startPage();

    this.doc.image(loadAsset(LOGO_FILE), this.left, MARGIN, { height: LOGO_HEIGHT });
    this.textRight(LABELS.DOCUMENT, this.right, MARGIN + 5, FONT_SIZES.META, COLORS.MUTED);
    const dividerY = MARGIN + TOP_BAR_HEIGHT;
    this.line(this.left, dividerY, this.right, dividerY);

    this.y = dividerY + 26;
    this.textCentered(this.meta.className, this.y, FONT_SIZES.TITLE, COLORS.TEXT, true);
    this.y += 28;
    this.textCentered(LABELS.SUBTITLE, this.y, FONT_SIZES.SUBTITLE, COLORS.ACCENT, true);
    this.y += 26;

    const metaLine = this.buildMetaLine();
    if (metaLine) {
      this.textCentered(metaLine, this.y, FONT_SIZES.META, COLORS.MUTED, false);
      this.y += 18;
    }
    this.y += 14;
    this.drawTableHeader();
  }

  drawRow(row: ClassStudentCodesExportRow): void {
    const { ROW_HEIGHT, COLORS, FONT_SIZES, CELL_PADDING_X, EMPTY_NAME } = this.c;
    if (this.y + ROW_HEIGHT > this.bottom) this.continueOnNewPage();

    if (this.rowIndex % 2 === 1) {
      this.doc.rect(this.left, this.y, this.width, ROW_HEIGHT).fill(COLORS.ZEBRA_BG);
    }
    this.drawRowBorders(this.y, ROW_HEIGHT);

    const name = row.name?.replace(/\s+/g, ' ').trim();
    const textY = this.cellTextY(this.y, ROW_HEIGHT, FONT_SIZES.CELL);
    this.textFitted(
      name || EMPTY_NAME,
      this.left + CELL_PADDING_X,
      textY,
      this.nameColumnWidth - CELL_PADDING_X * 2,
      FONT_SIZES.CELL,
      name ? COLORS.TEXT : COLORS.MUTED,
      false,
    );
    this.textFitted(
      row.studentId,
      this.left + this.nameColumnWidth + CELL_PADDING_X,
      textY,
      this.width - this.nameColumnWidth - CELL_PADDING_X * 2,
      FONT_SIZES.CELL,
      COLORS.TEXT,
      false,
    );

    this.y += ROW_HEIGHT;
    this.rowIndex += 1;
  }

  /** A class with no exportable students still gets a readable table, not a bare header. */
  drawEmptyState(): void {
    const { ROW_HEIGHT, COLORS, FONT_SIZES, LABELS } = this.c;
    this.drawOuterBox(this.y, ROW_HEIGHT);
    this.textCentered(
      LABELS.EMPTY,
      this.cellTextY(this.y, ROW_HEIGHT, FONT_SIZES.CELL),
      FONT_SIZES.CELL,
      COLORS.MUTED,
      false,
    );
    this.y += ROW_HEIGHT;
  }

  get rowsDrawn(): number {
    return this.rowIndex;
  }

  private continueOnNewPage(): void {
    const { MARGIN, COLORS, FONT_SIZES, LABELS } = this.c;
    this.doc.addPage();
    this.startPage();
    this.y = MARGIN;
    this.textFitted(
      this.meta.className,
      this.left,
      this.y,
      this.width * 0.65,
      FONT_SIZES.CONTINUATION,
      COLORS.TEXT,
      true,
    );
    this.textRight(
      LABELS.SUBTITLE,
      this.right,
      this.y,
      FONT_SIZES.CONTINUATION,
      COLORS.ACCENT,
      true,
    );
    this.y += 24;
    this.drawTableHeader();
  }

  /** Footer is drawn as soon as a page starts, so pages never need to be buffered. */
  private startPage(): void {
    const { FOOTER_OFFSET, COLORS, FONT_SIZES, LABELS } = this.c;
    this.pageNumber += 1;
    const footerY = this.doc.page.height - FOOTER_OFFSET;
    this.textFitted(
      this.meta.className,
      this.left,
      footerY,
      this.width * 0.7,
      FONT_SIZES.PAGE_CHROME,
      COLORS.MUTED,
      false,
    );
    this.textRight(
      `${LABELS.PAGE} ${this.pageNumber}`,
      this.right,
      footerY,
      FONT_SIZES.PAGE_CHROME,
      COLORS.MUTED,
    );
  }

  private drawTableHeader(): void {
    const { HEADER_ROW_HEIGHT, COLORS, FONT_SIZES, CELL_PADDING_X, LABELS } = this.c;
    this.doc.rect(this.left, this.y, this.width, HEADER_ROW_HEIGHT).fill(COLORS.HEADER_BG);
    this.drawRowBorders(this.y, HEADER_ROW_HEIGHT);
    const textY = this.cellTextY(this.y, HEADER_ROW_HEIGHT, FONT_SIZES.TABLE_HEADER);
    this.textAt(
      LABELS.STUDENT_NAME,
      this.left + CELL_PADDING_X,
      textY,
      FONT_SIZES.TABLE_HEADER,
      COLORS.HEADING,
      true,
    );
    this.textAt(
      LABELS.STUDENT_CODE,
      this.left + this.nameColumnWidth + CELL_PADDING_X,
      textY,
      FONT_SIZES.TABLE_HEADER,
      COLORS.HEADING,
      true,
    );
    this.y += HEADER_ROW_HEIGHT;
  }

  private drawRowBorders(y: number, height: number): void {
    this.drawOuterBox(y, height);
    const columnX = this.left + this.nameColumnWidth;
    this.line(columnX, y, columnX, y + height);
  }

  private drawOuterBox(y: number, height: number): void {
    const { BORDER_WIDTH, COLORS } = this.c;
    this.doc
      .lineWidth(BORDER_WIDTH)
      .strokeColor(COLORS.BORDER)
      .rect(this.left, y, this.width, height)
      .stroke();
  }

  private line(x1: number, y1: number, x2: number, y2: number): void {
    const { BORDER_WIDTH, COLORS } = this.c;
    this.doc
      .lineWidth(BORDER_WIDTH)
      .strokeColor(COLORS.BORDER)
      .moveTo(x1, y1)
      .lineTo(x2, y2)
      .stroke();
  }

  private buildMetaLine(): string {
    const { DATE_SEPARATOR, META_SEPARATOR } = this.c;
    const start = formatDate(this.meta.startDate);
    const end = formatDate(this.meta.endDate);
    const dates = start && end ? `${start}${DATE_SEPARATOR}${end}` : start || end;
    return [this.meta.schoolName, dates].filter(Boolean).join(META_SEPARATOR);
  }

  private cellTextY(rowY: number, rowHeight: number, size: number): number {
    this.useFont('', size, false);
    return rowY + (rowHeight - this.doc.currentLineHeight()) / 2;
  }

  /** Picks the CJK fallback font only for values that need it; registered on first use. */
  private useFont(text: string, size: number, bold: boolean): void {
    const { FONT_NAMES, FONT_FILES, CJK_PATTERN } = this.c;
    if (CJK_PATTERN.test(text)) {
      if (!this.cjkRegistered) {
        this.doc.registerFont(FONT_NAMES.CJK, loadAsset(FONT_FILES.CJK));
        this.cjkRegistered = true;
      }
      this.doc.font(FONT_NAMES.CJK).fontSize(size);
      return;
    }
    this.doc.font(bold ? FONT_NAMES.BOLD : FONT_NAMES.REGULAR).fontSize(size);
  }

  private textAt(
    text: string,
    x: number,
    y: number,
    size: number,
    color: string,
    bold: boolean,
  ): void {
    this.useFont(text, size, bold);
    this.doc.fillColor(color).text(text, x, y, { lineBreak: false });
  }

  /** Single-line text truncated with an ellipsis to `maxWidth` (binary search on the prefix). */
  private textFitted(
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    size: number,
    color: string,
    bold: boolean,
  ): void {
    this.useFont(text, size, bold);
    this.textAt(this.fitToWidth(text, maxWidth), x, y, size, color, bold);
  }

  private textCentered(text: string, y: number, size: number, color: string, bold: boolean): void {
    this.useFont(text, size, bold);
    const fitted = this.fitToWidth(text, this.width);
    const x = this.left + (this.width - this.doc.widthOfString(fitted)) / 2;
    this.textAt(fitted, x, y, size, color, bold);
  }

  private textRight(
    text: string,
    rightX: number,
    y: number,
    size: number,
    color: string,
    bold = false,
  ): void {
    this.useFont(text, size, bold);
    this.textAt(text, rightX - this.doc.widthOfString(text), y, size, color, bold);
  }

  private fitToWidth(text: string, maxWidth: number): string {
    if (this.doc.widthOfString(text) <= maxWidth) return text;
    const { ELLIPSIS } = this.c;
    const chars = Array.from(text);
    let low = 0;
    let high = chars.length;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      const candidate = `${chars.slice(0, mid).join('').trimEnd()}${ELLIPSIS}`;
      if (this.doc.widthOfString(candidate) <= maxWidth) low = mid;
      else high = mid - 1;
    }
    return `${chars.slice(0, low).join('').trimEnd()}${ELLIPSIS}`;
  }
}

/**
 * Lazily renders the per-class student-codes PDF (US Letter): logo row, class title, orange
 * "All Student Codes" subtitle, school/dates line, then a bordered Student Name / Student Code
 * table with the header repeated on every page and a page number in the footer.
 *
 * Pull-based like the CSV writer: pdfkit's output is drained and yielded after each batch, so
 * `Readable.from` → HTTP response backpressure pauses the database reads and only about one
 * batch of pages is held in memory. Pages are never buffered (hence "Page N", not "N of M");
 * the embedded logo and font subsets are written at the end, in the last chunk.
 *
 * `doc` is a raw Node `Readable` we own directly, so we listen for its `'error'` ourselves and
 * re-throw it into the generator — otherwise an unlistened stream error crashes the process.
 */
export async function* buildStudentCodesPdf(
  meta: ClassStudentCodesExportMeta,
  batches: AsyncIterable<ClassStudentCodesExportRow[]>,
): AsyncGenerator<Buffer> {
  const { PAGE_SIZE, MARGIN, COMPRESS, LABELS } = ClassStudentCodesPdfConstants;
  const doc = new PDFDocument({
    size: PAGE_SIZE,
    margin: MARGIN,
    compress: COMPRESS,
    autoFirstPage: true,
    bufferPages: false,
    info: {
      Title: `${meta.className} — ${LABELS.SUBTITLE}`,
      Author: LABELS.AUTHOR,
      Subject: LABELS.DOCUMENT,
    },
  });
  // Attached before any drawing starts, so `doc` never has a moment with no error listener.
  let streamError: Error | undefined;
  const errored = new Promise<never>((_, reject) => {
    doc.on('error', (err: Error) => {
      streamError = err;
      reject(err);
    });
  });
  errored.catch(() => undefined); // avoid an "unhandled rejection" if nothing awaits it first

  // A helper, not `if (streamError) throw streamError` inline, because TS can't narrow a
  // closure-reassigned variable — a plain parameter narrows fine.
  const throwIfErrored = (error: Error | undefined = streamError): void => {
    if (error) throw error;
  };

  const writer = new StudentCodesPdfWriter(doc, meta);
  writer.drawFirstPage();
  throwIfErrored();

  for await (const batch of batches) {
    for (const row of batch) writer.drawRow(row);
    throwIfErrored();
    const output = drainOutput(doc);
    if (output) yield output;
  }
  if (writer.rowsDrawn === 0) writer.drawEmptyState();
  throwIfErrored();

  // Collects the tail (logo, font subsets, xref, trailer) until the stream ends; races against
  // `errored` so a finalisation failure surfaces here instead of on some later, unawaited tick.
  const tail: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => tail.push(chunk));
  doc.end();
  await Promise.race([once(doc, 'end'), errored]);
  throwIfErrored();
  if (tail.length) yield Buffer.concat(tail);
}
