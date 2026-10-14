import {
  buildStudentCodesCsv,
  buildStudentCodesFilename,
} from 'src/common/utils/student-codes-csv.util';
import { ClassStudentCodesExportMeta, ClassStudentCodesExportRow } from 'src/common/interfaces';

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

const collect = async (gen: AsyncIterable<string>): Promise<string> => {
  let out = '';
  for await (const chunk of gen) out += chunk;
  return out;
};

const header =
  '﻿' +
  [
    'Class Name,Biology 101',
    'School,Lincoln High School',
    'Start Date,2026-09-01',
    'End Date,2026-12-15',
    '',
    'Student Code,Student Name',
  ].join('\r\n') +
  '\r\n';

describe('buildStudentCodesCsv', () => {
  it('renders the class header block then one row per student, matching the export layout', async () => {
    const csv = await collect(
      buildStudentCodesCsv(
        meta,
        batchesOf([
          { id: '1', studentId: 'BIO-4ZPT', name: null },
          { id: '2', studentId: 'BIO-JW6C', name: 'Ava Thompson' },
          { id: '3', studentId: 'BIO-H6XJ', name: null },
        ]),
      ),
    );

    expect(csv).toBe(header + 'BIO-4ZPT,\r\nBIO-JW6C,Ava Thompson\r\nBIO-H6XJ,\r\n');
  });

  it('renders only the header block for a class with no exportable students', async () => {
    expect(await collect(buildStudentCodesCsv(meta, batchesOf()))).toBe(header);
  });

  it('concatenates multiple batches in order without blank lines between them', async () => {
    const csv = await collect(
      buildStudentCodesCsv(
        meta,
        batchesOf(
          [{ id: '1', studentId: 'A-1', name: 'One' }],
          [],
          [
            { id: '2', studentId: 'A-2', name: 'Two' },
            { id: '3', studentId: 'A-3', name: 'Three' },
          ],
        ),
      ),
    );

    expect(csv).toBe(header + 'A-1,One\r\nA-2,Two\r\nA-3,Three\r\n');
  });

  it('escapes user-supplied header and name values', async () => {
    const csv = await collect(
      buildStudentCodesCsv(
        { ...meta, className: 'Bio, Period 2', schoolName: '=cmd' },
        batchesOf([{ id: '1', studentId: 'A-1', name: 'Doe, "J"' }]),
      ),
    );

    expect(csv).toContain('Class Name,"Bio, Period 2"\r\n');
    expect(csv).toContain(`School,'=cmd\r\n`);
    expect(csv).toContain('A-1,"Doe, ""J"""\r\n');
  });

  it('propagates a batch failure to the consumer instead of ending the file cleanly', async () => {
    async function* failing(): AsyncGenerator<ClassStudentCodesExportRow[]> {
      yield [{ id: '1', studentId: 'A-1', name: null }];
      throw new Error('db down');
    }

    await expect(collect(buildStudentCodesCsv(meta, failing()))).rejects.toThrow('db down');
  });

  it('stops pulling more batches once the consumer stops early (client cancel mid-download)', async () => {
    // A client disconnect destroys the response, which makes `Readable.from` call `.return()`
    // here — `for await` then propagates that to `batches`, so nothing keeps running unread.
    let pulled = 0;
    let cleanedUp = false;
    async function* trackedBatches(): AsyncGenerator<ClassStudentCodesExportRow[]> {
      try {
        for (let i = 1; i <= 5; i++) {
          pulled += 1;
          yield [{ id: String(i), studentId: `A-${i}`, name: null }];
        }
      } finally {
        cleanedUp = true;
      }
    }

    const csv = buildStudentCodesCsv(meta, trackedBatches());
    await csv.next(); // header block
    await csv.next(); // first batch chunk
    expect(pulled).toBe(1);

    await csv.return(undefined);

    expect(cleanedUp).toBe(true);
    expect(pulled).toBe(1);
  });
});

describe('buildStudentCodesFilename', () => {
  it('prefixes the class name and appends the format extension', () => {
    expect(buildStudentCodesFilename('Biology 101', 'csv')).toBe('student-codes-Biology 101.csv');
    expect(buildStudentCodesFilename('Biology 101', 'pdf')).toBe('student-codes-Biology 101.pdf');
  });

  it.each([null, undefined, '   '])('falls back to a generic name for %p', (name) => {
    expect(buildStudentCodesFilename(name, 'csv')).toBe('student-codes-class.csv');
  });
});
