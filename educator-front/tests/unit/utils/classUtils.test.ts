import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import dayjs from 'dayjs';
import {
  computeClassStatus,
  getActiveStudentCount,
  getClassAvailability,
  getEffectiveClassStatus,
  hasClassEnded,
} from '../../../src/utils/classUtils';
import type { Class, Student } from '../../../src/types/Class_types';

const makeStudent = (overrides: Partial<Student> = {}): Student => ({
  student_id: 'stu-1',
  student_name: 'Test Student',
  email: null,
  score: null,
  ...overrides,
});

const makeClass = (overrides: Partial<Class> = {}): Class => ({
  id: 'class-1',
  class_name: 'Test Class',
  ...overrides,
});

describe('computeClassStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-03T12:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps Active when start date is today and end date is empty', () => {
    expect(computeClassStatus('2026-08-03', undefined)).toBe('ACTIVE');
    expect(computeClassStatus('2026-08-03', '')).toBe('ACTIVE');
  });

  it('keeps Active when start date is today and end date is in the future', () => {
    expect(computeClassStatus('2026-08-03', '2026-09-01')).toBe('ACTIVE');
  });

  it('sets Inactive when start date is in the future', () => {
    expect(computeClassStatus('2026-08-04', undefined)).toBe('INACTIVE');
    expect(computeClassStatus('2026-08-04', '2026-09-01')).toBe('INACTIVE');
  });

  it('keeps Active when start date is in the past and end date is today or future', () => {
    expect(computeClassStatus('2026-08-01', '2026-08-03')).toBe('ACTIVE');
    expect(computeClassStatus('2026-08-01', '2026-08-10')).toBe('ACTIVE');
  });

  it('sets Inactive when end date is in the past', () => {
    expect(computeClassStatus('2026-07-01', '2026-08-02')).toBe('INACTIVE');
  });

  it('sets Inactive when start date is missing', () => {
    expect(computeClassStatus(undefined, '2026-09-01')).toBe('INACTIVE');
    expect(computeClassStatus('', '2026-09-01')).toBe('INACTIVE');
  });

  it('handles ISO datetime strings by comparing calendar days', () => {
    expect(
      computeClassStatus('2026-08-03T00:00:00.000Z', '2026-09-01T00:00:00.000Z')
    ).toBe('ACTIVE');
    expect(
      computeClassStatus('2026-08-04T00:00:00.000Z', '2026-09-01T00:00:00.000Z')
    ).toBe('INACTIVE');
  });

  it('uses day-level comparison consistent with dayjs today', () => {
    const today = dayjs().format('YYYY-MM-DD');
    const tomorrow = dayjs().add(1, 'day').format('YYYY-MM-DD');
    expect(computeClassStatus(today, undefined)).toBe('ACTIVE');
    expect(computeClassStatus(tomorrow, undefined)).toBe('INACTIVE');
  });
});

describe('getEffectiveClassStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-03T12:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('preserves DRAFT, ARCHIEVED, INACTIVE, and ATTENTION', () => {
    expect(getEffectiveClassStatus('DRAFT', '2026-08-03', '2026-09-01')).toBe(
      'DRAFT'
    );
    expect(
      getEffectiveClassStatus('ARCHIEVED', '2026-08-03', '2026-09-01')
    ).toBe('ARCHIEVED');
    expect(
      getEffectiveClassStatus('INACTIVE', '2026-08-03', '2026-09-01')
    ).toBe('INACTIVE');
    expect(
      getEffectiveClassStatus('ATTENTION', '2026-08-03', '2026-09-01')
    ).toBe('ATTENTION');
  });

  it('derives Active/Inactive for other statuses from dates', () => {
    expect(getEffectiveClassStatus('ACTIVE', '2026-08-03', undefined)).toBe(
      'ACTIVE'
    );
    expect(getEffectiveClassStatus('ACTIVE', '2026-08-04', undefined)).toBe(
      'INACTIVE'
    );
  });
});

describe('getActiveStudentCount', () => {
  it('counts only ACTIVE students when the roster is populated', () => {
    const cls = makeClass({
      students: [
        makeStudent({ student_id: 's1', status: 'ACTIVE' }),
        makeStudent({ student_id: 's2', status: 'INACTIVE' }),
        makeStudent({ student_id: 's3', status: 'ACTIVE' }),
      ],
    });
    expect(getActiveStudentCount(cls)).toBe(2);
  });

  it('returns 0 for an all-inactive roster without falling back to the backend count', () => {
    const cls = makeClass({
      total_no_of_students: 5,
      students: [
        makeStudent({ student_id: 's1', status: 'INACTIVE' }),
        makeStudent({ student_id: 's2', status: 'ARCHIEVED' }),
      ],
    });
    expect(getActiveStudentCount(cls)).toBe(0);
  });

  it('treats a student with no status as active', () => {
    const cls = makeClass({
      students: [
        makeStudent({ student_id: 's1' }),
        makeStudent({ student_id: 's2', status: 'INACTIVE' }),
      ],
    });
    expect(getActiveStudentCount(cls)).toBe(1);
  });

  it('falls back to total_no_of_students when the roster is empty or missing', () => {
    expect(
      getActiveStudentCount(
        makeClass({ students: [], total_no_of_students: 4 })
      )
    ).toBe(4);
    expect(getActiveStudentCount(makeClass({ total_no_of_students: 3 }))).toBe(
      3
    );
  });

  it('returns 0 when neither a roster nor a backend count is available', () => {
    expect(getActiveStudentCount(makeClass())).toBe(0);
  });
});

describe('class availability', () => {
  const today = dayjs('2026-10-08');

  it('ends the day after the end date, not on it', () => {
    expect(hasClassEnded('2026-10-07', today)).toBe(true);
    expect(hasClassEnded('2026-10-07T00:00:00.000Z', today)).toBe(true);
    expect(hasClassEnded('2026-10-08', today)).toBe(false);
    expect(hasClassEnded('2026-12-31', today)).toBe(false);
    expect(hasClassEnded(undefined, today)).toBe(false);
  });

  it('is ended past the end date whatever the status', () => {
    expect(getClassAvailability('ACTIVE', '2026-10-01', today)).toBe('ended');
    expect(getClassAvailability('INACTIVE', '2026-10-01', today)).toBe('ended');
  });

  it('is inactive for an inactive class that has not ended', () => {
    expect(getClassAvailability('INACTIVE', '2026-12-31', today)).toBe(
      'inactive'
    );
    expect(getClassAvailability('inactive', undefined, today)).toBe('inactive');
  });

  it('is open otherwise', () => {
    expect(getClassAvailability('ACTIVE', '2026-12-31', today)).toBe('open');
    expect(getClassAvailability('DRAFT', '2026-10-08', today)).toBe('open');
    expect(getClassAvailability(undefined, undefined, today)).toBe('open');
  });
});
