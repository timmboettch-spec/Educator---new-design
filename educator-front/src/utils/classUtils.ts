import dayjs from 'dayjs';
import type { Class } from '../types/Class_types';

/** Future start → Inactive; today/past start → Active unless end date is already past. */
export function computeClassStatus(
  start_date: string | undefined,
  end_date: string | undefined,
): 'ACTIVE' | 'INACTIVE' {
  if (!start_date) return 'INACTIVE';

  const today = dayjs().startOf('day');
  const start = dayjs(start_date.split('T')[0]).startOf('day');

  if (start.isAfter(today, 'day')) return 'INACTIVE';

  if (end_date) {
    const end = dayjs(end_date.split('T')[0]).startOf('day');
    if (end.isBefore(today, 'day')) return 'INACTIVE';
  }

  return 'ACTIVE';
}

export function getEffectiveClassStatus(
  currentStatus: string | undefined,
  start_date: string | undefined,
  end_date: string | undefined,
): 'ACTIVE' | 'DRAFT' | 'INACTIVE' | 'ARCHIEVED' | 'ATTENTION' {
  if (
    currentStatus === 'DRAFT' ||
    currentStatus === 'ARCHIEVED' ||
    currentStatus === 'INACTIVE' ||
    currentStatus === 'ATTENTION'
  ) {
    return currentStatus;
  }

  return computeClassStatus(start_date, end_date);
}

/** A class the educator is currently running (effective status ACTIVE). */
export function isActiveClass(cls: Class): boolean {
  return (
    getEffectiveClassStatus(cls.status, cls.start_date, cls.end_date) === 'ACTIVE'
  );
}

/** A class that is finished: archived, or ended/past its dates (INACTIVE). */
export function isClosedClass(cls: Class): boolean {
  const s = getEffectiveClassStatus(cls.status, cls.start_date, cls.end_date);
  return s === 'ARCHIEVED' || s === 'INACTIVE';
}

/**
 * Active students in a class. Filters the roster by ACTIVE status (treating a
 * missing status as active); falls back to the backend `total_no_of_students`
 * when the roster array isn't populated on the response.
 */
export function getActiveStudentCount(cls: Class): number {
  const students = cls.students ?? [];
  if (students.length > 0) {
    return students.filter((s) => (s.status ?? 'ACTIVE') === 'ACTIVE').length;
  }
  return cls.total_no_of_students ?? 0;
}

/**
 * Inactive students in a class — roster entries whose status is not ACTIVE
 * (e.g. a finished/closed class). Returns 0 when the roster array isn't
 * populated on the response (we can't infer inactivity without it).
 */
export function getInactiveStudentCount(cls: Class): number {
  const students = cls.students ?? [];
  if (students.length > 0) {
    return students.filter((s) => (s.status ?? 'ACTIVE') !== 'ACTIVE').length;
  }
  return 0;
}

/**
 * Simulations attempted in a class. Each report is one attempt, so prefer the
 * report count / reports array when present; otherwise sum per-student attempts.
 * (The educator-classes endpoint may not populate reports — see CLAUDE.md.)
 */
export function getSimsAttempted(cls: Class): number {
  if (typeof cls.reportCount === 'number') return cls.reportCount;
  if (Array.isArray(cls.reports)) return cls.reports.length;
  return (cls.students ?? []).reduce((t, s) => t + (s.attempt ?? 0), 0);
}
