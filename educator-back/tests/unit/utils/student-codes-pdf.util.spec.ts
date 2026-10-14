import PDFDocument from 'pdfkit';
import { buildStudentCodesPdf } from 'src/common/utils/student-codes-pdf.util';
import { ClassStudentCodesExportMeta, ClassStudentCodesExportRow } from 'src/common/interfaces';
import { ClassStudentCodesPdfConstants } from 'src/common/constants';

const { LABELS, EMPTY_NAME, ELLIPSIS } = ClassStudentCodesPdfConstants;

const meta: ClassStudentCodesExportMeta = {
  className: 'Biology 101',
  schoolName: 'Lincoln High School',
  startDate: '2026-09-01',
  endDate: '2026-12-15',
};

async function* batchesOf(
  ...batches: ClassStudentCodesExportRow[][]
): AsyncGenerator<ClassStudentCodesExportRow[]> {
  for (const batch of batches) yield batch;
}

const rows = (count: number, from = 1): ClassStudentCodesExportRow[] =>
  Array.from({ length: count }, (_, i) => ({
    id: String(from + i),
    studentId: `BIO-${String(from + i).padStart(5, '0')}`,
    name: `Student ${from + i}`,
  }));

const render = async (
  batches: AsyncIterable<ClassStudentCodesExportRow[]>,
  exportMeta = meta,
): Promise<{ pdf: string; chunks: number }> => {
  const parts: Buffer[] = [];
  for await (const chunk of buildStudentCodesPdf(exportMeta, batches)) parts.push(chunk);
  return { pdf: Buffer.concat(parts).toString('latin1'), chunks: parts.length };
};

/** Page dictionaries are never compressed, so pages can be counted in the raw output. */
const pageCount = (pdf: string): number => (pdf.match(/\/Type \/Page\b(?!s)/g) ?? []).length;

describe('buildStudentCodesPdf', () => {
  let textSpy: jest.SpyInstance;
  const drawnText = (): string[] => textSpy.mock.calls.map(([text]) => String(text));

  beforeEach(() => {
    textSpy = jest.spyOn(PDFDocument.prototype, 'text');
  });

  afterEach(() => textSpy.mockRestore());

  it('produces a complete single-page US Letter PDF for a small class', async () => {
    const { pdf } = await render(batchesOf(rows(3)));

    expect(pdf.startsWith('%PDF-')).toBe(true);
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(pdf).toContain('/MediaBox [0 0 612 792]');
    expect(pageCount(pdf)).toBe(1);
  });

  it('draws the heading, school/date line, table header, rows and page number', async () => {
    await render(
      batchesOf([
        { id: '1', studentId: 'BIO-4ZPT', name: 'Ava Thompson' },
        { id: '2', studentId: 'BIO-JW6C', name: null },
      ]),
    );

    expect(drawnText()).toEqual(
      expect.arrayContaining([
        'Biology 101',
        LABELS.SUBTITLE,
        LABELS.DOCUMENT,
        'Lincoln High School  ·  01 Sep 2026 – 15 Dec 2026',
        LABELS.STUDENT_NAME,
        LABELS.STUDENT_CODE,
        'Ava Thompson',
        'BIO-4ZPT',
        'BIO-JW6C',
        EMPTY_NAME,
        `${LABELS.PAGE} 1`,
      ]),
    );
  });

  it('breaks onto new pages, repeating the table header, for a large class', async () => {
    const { pdf } = await render(batchesOf(rows(100), rows(100, 101)));

    expect(pageCount(pdf)).toBeGreaterThan(1);
    const headerDraws = drawnText().filter((text) => text === LABELS.STUDENT_NAME).length;
    expect(headerDraws).toBe(pageCount(pdf));
    expect(drawnText()).toContain(`${LABELS.PAGE} ${pageCount(pdf)}`);
    expect(drawnText()).toContain('BIO-00200');
  });

  it('streams output after every batch instead of once at the end', async () => {
    const { chunks } = await render(batchesOf(rows(50), rows(50, 51), rows(50, 101)));

    // One chunk per batch plus the tail (logo, font subsets, xref and trailer).
    expect(chunks).toBeGreaterThanOrEqual(4);
  });

  it('shows the empty state for a class with no exportable students', async () => {
    const { pdf } = await render(batchesOf());

    expect(pageCount(pdf)).toBe(1);
    expect(drawnText()).toContain(LABELS.EMPTY);
  });

  it('collapses multi-line names and truncates names wider than the column', async () => {
    const longName =
      'A very very long student name that absolutely will not fit in the name column';
    await render(
      batchesOf([
        { id: '1', studentId: 'BIO-1', name: 'Multi\nLine\tName' },
        { id: '2', studentId: 'BIO-2', name: longName },
      ]),
    );

    expect(drawnText()).toContain('Multi Line Name');
    const truncated = drawnText().find((text) => text.startsWith('A very very long'));
    expect(truncated?.endsWith(ELLIPSIS)).toBe(true);
    expect(truncated!.length).toBeLessThan(longName.length);
  });

  it('draws names exactly as stored (no CSV formula prefix)', async () => {
    await render(batchesOf([{ id: '1', studentId: 'BIO-1', name: '=HYPERLINK("x")' }]));

    expect(drawnText()).toContain('=HYPERLINK("x")');
  });

  it('embeds the CJK fallback font only when a value needs it', async () => {
    const latinOnly = await render(
      batchesOf([{ id: '1', studentId: 'BIO-1', name: 'José Núñez' }]),
    );
    const withCjk = await render(batchesOf([{ id: '1', studentId: 'BIO-1', name: '李明' }]));

    expect(latinOnly.pdf).toContain('NotoSans-Regular');
    expect(latinOnly.pdf).not.toContain('NotoSansCJK');
    expect(withCjk.pdf).toContain('NotoSansCJKsc-Regular');
  });

  it('omits missing parts of the school/date line', async () => {
    await render(batchesOf(), {
      className: 'OldClass',
      schoolName: '',
      startDate: '2026-01-10',
      endDate: '',
    });

    expect(drawnText()).toContain('10 Jan 2026');
  });

  it('propagates a batch failure to the consumer instead of ending the file cleanly', async () => {
    async function* failing(): AsyncGenerator<ClassStudentCodesExportRow[]> {
      yield rows(1);
      throw new Error('db down');
    }

    await expect(render(failing())).rejects.toThrow('db down');
  });

  it('stops pulling more batches once the consumer stops early (client cancel mid-download)', async () => {
    // Same as the CSV writer (see student-codes-csv.util.spec.ts) — a client cancel propagates
    // to `batches`, so nothing keeps running unread.
    let pulled = 0;
    let cleanedUp = false;
    async function* trackedBatches(): AsyncGenerator<ClassStudentCodesExportRow[]> {
      try {
        for (let i = 0; i < 5; i++) {
          pulled += 1;
          yield rows(1, i + 1);
        }
      } finally {
        cleanedUp = true;
      }
    }

    const pdf = buildStudentCodesPdf(meta, trackedBatches());
    await pdf.next(); // first PDF chunk (page 1 + the drawn row)
    expect(pulled).toBe(1);

    await pdf.return(undefined);

    expect(cleanedUp).toBe(true);
    expect(pulled).toBe(1);
  });

  describe('an error emitted directly on the pdfkit document', () => {
    // No test-attached listener here — these check the real production code handles `doc`
    // emitting `'error'` by rejecting cleanly, not by crashing the process.
    let uncaught: unknown[];
    let methodSpy: jest.SpyInstance | undefined;
    const onUncaught = (err: unknown): void => {
      uncaught.push(err);
    };

    beforeEach(() => {
      uncaught = [];
      process.on('uncaughtException', onUncaught);
    });

    afterEach(() => {
      process.off('uncaughtException', onUncaught);
      methodSpy?.mockRestore();
      methodSpy = undefined;
      expect(uncaught).toEqual([]);
    });

    // `once(doc, 'end')` already registers its own 'error' listener, so this window was safe
    // even before the fix — this locks that in against a future refactor, not a regression test.
    it('during finalisation (doc.end()) rejects the generator instead of crashing the process', async () => {
      const err = new Error('font subset finalisation failed');
      methodSpy = jest.spyOn(PDFDocument.prototype, 'end').mockImplementation(function (
        this: InstanceType<typeof PDFDocument>,
      ) {
        // Off the call stack, like a real finalisation failure (font/PNG decode) would be.
        setImmediate(() => this.emit('error', err));
        return this;
      });

      await expect(render(batchesOf(rows(1)))).rejects.toBe(err);
    });

    // This window (before doc.end()) was genuinely unprotected pre-fix — verified this fails
    // against the old code with a lost error (Node's ERR_UNHANDLED_ERROR), not a clean rejection.
    it('during drawing (before doc.end() is ever called) rejects the generator instead of crashing', async () => {
      // Emitted synchronously, not deferred: a tiny PDF can finish before a setImmediate fires.
      const err = new Error('logo PNG decode failed');
      methodSpy = jest.spyOn(PDFDocument.prototype, 'image').mockImplementation(function (
        this: InstanceType<typeof PDFDocument>,
      ) {
        this.emit('error', err);
        return this;
      });

      await expect(render(batchesOf(rows(1)))).rejects.toBe(err);
    });
  });
});
