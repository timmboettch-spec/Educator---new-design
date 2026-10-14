import type { Class } from '@/types/Class_types';
import {
  getActiveStudentCount,
  getEffectiveClassStatus,
} from '@/utils/classUtils';

export interface DashboardSchool {
  id: string;
  name: string;
}

export interface SchoolSummary extends DashboardSchool {
  activeClasses: number;
  activeStudents: number;
}

/** The signed-in educator's schools, from the normalized user (`schools`). */
export const getEducatorSchools = (
  user: Record<string, unknown> | null | undefined
): DashboardSchool[] => {
  const raw = user?.['schools'];
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((school: unknown) => {
    if (!school || typeof school !== 'object') return [];
    const { id, school_name: name } = school as Record<string, unknown>;
    return typeof id === 'string' && id
      ? [{ id, name: typeof name === 'string' && name ? name : id }]
      : [];
  });
};

/** Active classes and their active students, per school. */
export const summarizeSchools = (
  schools: DashboardSchool[],
  classes: Class[]
): SchoolSummary[] => {
  const active = classes.filter(
    (cls) =>
      getEffectiveClassStatus(cls.status, cls.start_date, cls.end_date) ===
      'ACTIVE'
  );
  return schools.map((school) => {
    // The id is authoritative; the name is only a fallback for classes without
    // one, so a shared or stale name can't count a class under two schools.
    const own = active.filter((cls) =>
      cls.school_id
        ? cls.school_id === school.id
        : cls.school_name === school.name
    );
    return {
      ...school,
      activeClasses: own.length,
      activeStudents: own.reduce(
        (total, cls) => total + getActiveStudentCount(cls),
        0
      ),
    };
  });
};
