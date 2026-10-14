import type { Student } from '../types/Class_types';
import type { LmsStudent } from '../redux/lms/SyncLmsClassesRedux';

function normalizeUserId(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/^0+(?=\d)/, '');
}

function extractLmsUserIdFromStudentCode(
  studentCode: string | null | undefined
): string {
  const code = String(studentCode ?? '').trim();
  if (!code) return '';
  const parts = code.split('-');
  const suffix = parts[parts.length - 1]?.trim() ?? '';
  if (!suffix) return '';

  const legacyMatch = suffix.match(/^M0*(\d+)$/i);
  if (legacyMatch?.[1]) return normalizeUserId(legacyMatch[1]);
  if (/^\d+$/.test(suffix)) return normalizeUserId(suffix);
  return '';
}

/**
 * Merges a class's DB student roster with the live LMS roster for that class
 * (matched by normalized user id, then student-code suffix, then position),
 * so student name/email reflect the LMS source of truth. Falls back to
 * synthesizing rows from the live roster when there are no DB students yet.
 */
export function mergeStudentsWithLiveRoster(
  dbStudents: Student[],
  className: string,
  liveRosterByClassName: Record<string, LmsStudent[]>
): Student[] {
  const liveStudents =
    liveRosterByClassName[className.toLowerCase().trim()] ?? [];
  if (!liveStudents.length) return dbStudents;

  const liveByUserId = new Map<string, LmsStudent>();
  for (const lmsStudent of liveStudents) {
    const rawKey = String(
      lmsStudent.userId ?? lmsStudent.user_id ?? lmsStudent.id ?? ''
    ).trim();
    const normalizedKey = normalizeUserId(rawKey);
    if (rawKey) liveByUserId.set(rawKey, lmsStudent);
    if (normalizedKey) liveByUserId.set(normalizedKey, lmsStudent);
  }

  if (!dbStudents.length) {
    return liveStudents.map((s, index) => {
      const id = String(s.userId ?? s.user_id ?? s.id ?? `lms-${index}`);
      const name =
        s.name ?? `${s.given_name ?? ''} ${s.family_name ?? ''}`.trim() ?? null;
      return {
        id,
        user_id: String(s.userId ?? s.user_id ?? s.id ?? '') || undefined,
        student_id: null,
        student_name: name || null,
        email: s.email ?? null,
        status: 'ACTIVE',
        score: null,
      };
    });
  }

  return dbStudents.map((dbStudent, index) => {
    const runtimeDbStudent = dbStudent as Student & {
      studentName?: string | null;
      student_email?: string | null;
    };
    const dbUserIdRaw = String(dbStudent.user_id ?? '').trim();
    const dbUserIdNormalized = normalizeUserId(dbUserIdRaw);
    const codeSuffixUserId = extractLmsUserIdFromStudentCode(
      dbStudent.student_id
    );

    const matched =
      (dbUserIdRaw ? liveByUserId.get(dbUserIdRaw) : undefined) ??
      (dbUserIdNormalized ? liveByUserId.get(dbUserIdNormalized) : undefined) ??
      (codeSuffixUserId ? liveByUserId.get(codeSuffixUserId) : undefined) ??
      liveStudents[index];

    const lmsName = matched
      ? (matched.name ??
        `${matched.given_name ?? ''} ${matched.family_name ?? ''}`.trim() ??
        null)
      : null;
    const mergedName =
      dbStudent.student_name || runtimeDbStudent.studentName || lmsName || null;
    const mergedEmail =
      dbStudent.email ||
      runtimeDbStudent.student_email ||
      matched?.email ||
      null;

    return {
      ...dbStudent,
      student_name: mergedName,
      studentName: mergedName,
      email: mergedEmail,
      student_email: mergedEmail,
      user_id:
        dbStudent.user_id ||
        codeSuffixUserId ||
        String(matched?.userId ?? matched?.user_id ?? matched?.id ?? '') ||
        undefined,
    };
  });
}
