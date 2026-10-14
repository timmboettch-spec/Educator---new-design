import { useCallback, useMemo } from 'react';

/** Minimal student shape needed to resolve display names in report tables. */
export type StudentNameSource = {
  id?: string;
  student_id?: string | null;
  user_id?: string | null;
  student_name?: string | null;
  studentName?: string | null;
};

/** Minimal report shape for name/code lookup. */
export type ReportNameSource = {
  userId?: string | null;
  student_id?: string | null;
  studentCode?: string | null;
  student_code?: string | null;
  studentName?: string | null;
  student_name?: string | null;
};

function buildStudentNameMap(
  students: StudentNameSource[]
): Map<string, string> {
  const map = new Map<string, string>();
  for (const student of students) {
    const raw = student as unknown as Record<string, unknown>;
    const name =
      (typeof student.student_name === 'string' &&
        student.student_name.trim()) ||
      (typeof student.studentName === 'string' && student.studentName.trim()) ||
      (typeof raw['studentName'] === 'string' &&
        (raw['studentName'] as string).trim()) ||
      '';
    if (!name) continue;
    if (student.student_id) map.set(String(student.student_id), name);
    if (student.user_id) map.set(String(student.user_id), name);
    if (student.id) map.set(String(student.id), name);
  }
  return map;
}

function buildStudentCodeMap(
  students: StudentNameSource[]
): Map<string, string> {
  const map = new Map<string, string>();
  for (const student of students) {
    if (student.user_id && student.student_id) {
      map.set(String(student.user_id), String(student.student_id));
    }
    if (student.student_id) {
      map.set(String(student.student_id), String(student.student_id));
    }
  }
  return map;
}

/**
 * Shared student name/code resolution for Class Management report tables.
 * Prefer roster name, then report name, then student code.
 */
export function useResolveStudentName(students: StudentNameSource[]) {
  const codeOrIdToStudentName = useMemo(
    () => buildStudentNameMap(students),
    [students]
  );
  const userIdToStudentCode = useMemo(
    () => buildStudentCodeMap(students),
    [students]
  );

  const resolveStudentDisplayName = useCallback(
    (
      report: ReportNameSource,
      reportData?: Record<string, unknown>
    ): string => {
      const code =
        report.studentCode ??
        report.student_code ??
        (typeof reportData?.['studentCode'] === 'string'
          ? (reportData['studentCode'] as string)
          : undefined) ??
        (typeof reportData?.['student_code'] === 'string'
          ? (reportData['student_code'] as string)
          : undefined) ??
        (report.userId
          ? userIdToStudentCode.get(String(report.userId))
          : undefined) ??
        report.userId ??
        report.student_id ??
        '';

      const fromRoster =
        (report.userId
          ? codeOrIdToStudentName.get(String(report.userId))
          : undefined) ||
        (code ? codeOrIdToStudentName.get(String(code)) : undefined) ||
        (report.student_id
          ? codeOrIdToStudentName.get(String(report.student_id))
          : undefined);
      if (fromRoster) return fromRoster;

      const fromReport =
        (typeof report.studentName === 'string' && report.studentName.trim()) ||
        (typeof report.student_name === 'string' &&
          report.student_name.trim()) ||
        (typeof reportData?.['studentName'] === 'string' &&
          (reportData['studentName'] as string).trim()) ||
        (typeof reportData?.['student_name'] === 'string' &&
          (reportData['student_name'] as string).trim()) ||
        '';
      if (fromReport) return fromReport;
      return String(code || '—');
    },
    [codeOrIdToStudentName, userIdToStudentCode]
  );

  const resolveStudentCode = useCallback(
    (
      report: ReportNameSource,
      reportData?: Record<string, unknown>
    ): string => {
      const isUUID = (v: string) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          v
        );
      const resolveCode = (v: unknown) =>
        typeof v === 'string' && v.trim() && !isUUID(v) ? v.trim() : null;

      return (
        resolveCode(report.studentCode) ??
        resolveCode(report.student_code) ??
        resolveCode(reportData?.['studentCode']) ??
        resolveCode(reportData?.['student_code']) ??
        (report.userId
          ? resolveCode(userIdToStudentCode.get(String(report.userId)))
          : null) ??
        resolveCode(report.student_id) ??
        '—'
      );
    },
    [userIdToStudentCode]
  );

  return {
    codeOrIdToStudentName,
    userIdToStudentCode,
    resolveStudentDisplayName,
    resolveStudentCode,
  };
}
