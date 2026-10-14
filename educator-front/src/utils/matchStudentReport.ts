const GENERIC_STUDENT_NAMES = new Set(['student', 'unknown', 'learner', '']);

export function normalizeStudentKey(value: string): string {
  return value.replace(/[-_\s]+/g, '').toUpperCase();
}

export type StudentMatchInput = {
  id?: string | null;
  user_id?: string | null;
  student_id?: string | null;
  student_name?: string | null;
};

export type ReportMatchInput = Record<string, unknown>;

export function buildUniqueStudentNames(
  students: Array<{ student_name?: string | null }>
): Set<string> {
  const counts = new Map<string, number>();
  for (const student of students) {
    const name = (student.student_name ?? '').toLowerCase().trim();
    if (!name || name === '-' || GENERIC_STUDENT_NAMES.has(name)) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  const unique = new Set<string>();
  for (const [name, count] of counts) {
    if (count === 1) unique.add(name);
  }
  return unique;
}

function readReportString(report: ReportMatchInput, keys: string[]): string[] {
  const values: string[] = [];
  for (const key of keys) {
    const val = report[key];
    if (typeof val === 'string' && val.trim()) values.push(val.trim());
  }
  return values;
}

export function reportMatchesStudent(
  student: StudentMatchInput,
  report: ReportMatchInput,
  options?: { uniqueStudentNames?: Set<string> }
): boolean {
  const studentCode = normalizeStudentKey(String(student.student_id ?? ''));
  const rawStudentCode = String(student.student_id ?? '')
    .trim()
    .toUpperCase();
  const userId = String(student.id ?? '').trim();
  const userIdAlt = String(student.user_id ?? '').trim();

  const reportStudentIds = readReportString(report, [
    'student_id',
    'studentId',
    'studentCode',
    'student_code',
  ]);
  const reportUserIds = readReportString(report, [
    'userId',
    'user_id',
    'UserID',
  ]);

  for (const sid of reportStudentIds) {
    const rStudentId = normalizeStudentKey(sid);
    const rStudentIdRaw = sid.toUpperCase();
    if (studentCode && rStudentId && rStudentId === studentCode) return true;
    if (rawStudentCode && rStudentIdRaw && rStudentIdRaw === rawStudentCode)
      return true;
  }

  for (const uid of reportUserIds) {
    const rUserId = uid.trim();
    const rUserIdNorm = normalizeStudentKey(rUserId);
    if (rUserId && userId && rUserId === userId) return true;
    if (rUserId && userIdAlt && rUserId === userIdAlt) return true;
    if (rUserIdNorm && studentCode && rUserIdNorm === studentCode) return true;
  }

  const enrichedStudentName = (student.student_name ?? '').toLowerCase().trim();
  const rStudentName = readReportString(report, [
    'studentName',
    'student_name',
  ])[0]
    ?.toLowerCase()
    .trim();

  if (
    rStudentName &&
    enrichedStudentName &&
    enrichedStudentName !== '-' &&
    !GENERIC_STUDENT_NAMES.has(enrichedStudentName) &&
    !GENERIC_STUDENT_NAMES.has(rStudentName) &&
    options?.uniqueStudentNames?.has(enrichedStudentName) &&
    rStudentName === enrichedStudentName
  ) {
    return true;
  }

  return false;
}
