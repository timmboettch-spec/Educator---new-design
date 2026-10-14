import { ClassStudentCodesExportConstants } from '../constants/class.constants';
import {
  ClassStudentCodesExportMeta,
  ClassStudentCodesExportRow,
} from '../interfaces/class.interface';
import { toCsvLine } from './csv.util';

/**
 * Lazily renders the per-class student-codes CSV: BOM + class header block, a blank separator
 * line, the table header, then one chunk per batch pulled from `batches`. Pulling is driven by
 * the consumer (`Readable.from` → HTTP response), so a slow client naturally pauses the DB reads.
 */
export async function* buildStudentCodesCsv(
  meta: ClassStudentCodesExportMeta,
  batches: AsyncIterable<ClassStudentCodesExportRow[]>,
): AsyncGenerator<string> {
  const { LABELS, LINE_BREAK, BOM } = ClassStudentCodesExportConstants.CSV;

  yield BOM +
    [
      toCsvLine([LABELS.CLASS_NAME, meta.className]),
      toCsvLine([LABELS.SCHOOL, meta.schoolName]),
      toCsvLine([LABELS.START_DATE, meta.startDate]),
      toCsvLine([LABELS.END_DATE, meta.endDate]),
      '',
      toCsvLine([LABELS.STUDENT_CODE, LABELS.STUDENT_NAME]),
    ].join(LINE_BREAK) +
    LINE_BREAK;

  for await (const batch of batches) {
    if (!batch.length) continue;
    yield batch.map((row) => toCsvLine([row.studentId, row.name])).join(LINE_BREAK) + LINE_BREAK;
  }
}

/**
 * `student-codes-<Class Name>.<extension>` — sanitised for the header by
 * `buildAttachmentDisposition`. Shared by the CSV and PDF formats.
 */
export function buildStudentCodesFilename(
  className: string | null | undefined,
  extension: string,
): string {
  const name = className?.trim() || ClassStudentCodesExportConstants.FILENAME_FALLBACK;
  return `${ClassStudentCodesExportConstants.FILENAME_PREFIX}-${name}.${extension}`;
}
