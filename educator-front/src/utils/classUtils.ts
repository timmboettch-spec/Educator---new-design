import dayjs from 'dayjs';
import type { Class } from '../types/Class_types';

/** True once the class's end date is behind us; the end date itself still counts. */
export function hasClassEnded(
  end_date: string | undefined,
  today: dayjs.Dayjs = dayjs()
): boolean {
  if (!end_date) return false;
  const end = dayjs(end_date.split('T')[0]).startOf('day');
  return end.isBefore(today.startOf('day'), 'day');
}

/**
 * What an educator may do with a class: `ended` (past its end date, whatever
 * its status) blocks adding students and assigning simulations; `inactive`
 * allows both with a note; `open` is a normal class. Archived classes are
 * handled separately (their actions are hidden).
 */
export type ClassAvailability = 'open' | 'inactive' | 'ended';

export function getClassAvailability(
  status: string | undefined,
  end_date: string | undefined,
  today: dayjs.Dayjs = dayjs()
): ClassAvailability {
  if (hasClassEnded(end_date, today)) return 'ended';
  return status?.toUpperCase() === 'INACTIVE' ? 'inactive' : 'open';
}

/** Future start → Inactive; today/past start → Active unless end date is already past. */
export function computeClassStatus(
  start_date: string | undefined,
  end_date: string | undefined
): 'ACTIVE' | 'INACTIVE' {
  if (!start_date) return 'INACTIVE';

  const today = dayjs().startOf('day');
  const start = dayjs(start_date.split('T')[0]).startOf('day');

  if (start.isAfter(today, 'day')) return 'INACTIVE';

  return hasClassEnded(end_date, today) ? 'INACTIVE' : 'ACTIVE';
}

export function getEffectiveClassStatus(
  currentStatus: string | undefined,
  start_date: string | undefined,
  end_date: string | undefined
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
