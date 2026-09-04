import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import dayjs from 'dayjs';
import { computeClassStatus, getEffectiveClassStatus } from '../../../src/utils/classUtils';

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
    expect(computeClassStatus('2026-08-03T00:00:00.000Z', '2026-09-01T00:00:00.000Z')).toBe(
      'ACTIVE',
    );
    expect(computeClassStatus('2026-08-04T00:00:00.000Z', '2026-09-01T00:00:00.000Z')).toBe(
      'INACTIVE',
    );
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
    expect(getEffectiveClassStatus('DRAFT', '2026-08-03', '2026-09-01')).toBe('DRAFT');
    expect(getEffectiveClassStatus('ARCHIEVED', '2026-08-03', '2026-09-01')).toBe('ARCHIEVED');
    expect(getEffectiveClassStatus('INACTIVE', '2026-08-03', '2026-09-01')).toBe('INACTIVE');
    expect(getEffectiveClassStatus('ATTENTION', '2026-08-03', '2026-09-01')).toBe('ATTENTION');
  });

  it('derives Active/Inactive for other statuses from dates', () => {
    expect(getEffectiveClassStatus('ACTIVE', '2026-08-03', undefined)).toBe('ACTIVE');
    expect(getEffectiveClassStatus('ACTIVE', '2026-08-04', undefined)).toBe('INACTIVE');
  });
});
