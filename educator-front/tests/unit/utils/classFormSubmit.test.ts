import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildUpdateClassPayload } from '../../../src/utils/classFormSubmit';
import type { Class, ClassFormValues } from '../../../src/types/Class_types';

function makeValues(overrides: Partial<ClassFormValues> = {}): ClassFormValues {
  return {
    school_id: '',
    class_name: 'New Class',
    status: 'ACTIVE',
    start_date: '2026-08-03',
    end_date: '',
    total_no_of_students: '',
    ...overrides,
  };
}

describe('buildUpdateClassPayload', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-03T12:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports no change when submitted values match the selected class', () => {
    const selectedClass: Class = {
      id: '1',
      class_name: 'Class A',
      status: 'ACTIVE',
      start_date: '2026-08-01',
      end_date: '2026-09-01',
      school_id: 'sch-1',
    };
    const values = makeValues({
      class_name: 'Class A',
      status: 'ACTIVE',
      start_date: '2026-08-01',
      end_date: '2026-09-01',
      school_id: 'sch-1',
    });
    expect(buildUpdateClassPayload(values, selectedClass)).toEqual({
      noChange: true,
    });
  });

  it('returns the update data when the class name changes', () => {
    const selectedClass: Class = {
      id: '1',
      class_name: 'Class A',
      status: 'ACTIVE',
      start_date: '2026-08-01',
      end_date: '2026-09-01',
    };
    const values = makeValues({
      class_name: 'Class B',
      status: 'ACTIVE',
      start_date: '2026-08-01',
      end_date: '2026-09-01',
    });
    const result = buildUpdateClassPayload(values, selectedClass);
    expect(result).toEqual({
      noChange: false,
      data: {
        class_name: 'Class B',
        status: 'ACTIVE',
        start_date: '2026-08-01',
        end_date: '2026-09-01',
      },
    });
  });

  it('includes school_id in the diff only when the form provides one', () => {
    const selectedClass: Class = {
      id: '1',
      class_name: 'Class A',
      status: 'ACTIVE',
      start_date: '2026-08-01',
      end_date: '2026-09-01',
      school_id: 'sch-1',
    };
    const values = makeValues({
      class_name: 'Class A',
      status: 'ACTIVE',
      start_date: '2026-08-01',
      end_date: '2026-09-01',
      school_id: 'sch-2',
    });
    const result = buildUpdateClassPayload(values, selectedClass);
    expect(result).toEqual({
      noChange: false,
      data: expect.objectContaining({ school_id: 'sch-2' }),
    });
  });

  it('treats a DRAFT class as its date-derived status, since DRAFT cannot be picked', () => {
    const selectedClass: Class = {
      id: '1',
      class_name: 'Class A',
      status: 'DRAFT',
      start_date: '2026-08-01',
      end_date: '2026-09-01',
    };
    const values = makeValues({
      class_name: 'Class A',
      status: 'ACTIVE',
      start_date: '2026-08-01',
      end_date: '2026-09-01',
    });
    expect(buildUpdateClassPayload(values, selectedClass)).toEqual({
      noChange: true,
    });
  });

  it('derives the original status from dates when the class has no terminal status', () => {
    // selectedClass has no explicit status; computeClassStatus resolves it to
    // ACTIVE given the mocked "today". Submitting the same computed status
    // with unchanged fields should be treated as no change.
    const selectedClass: Class = {
      id: '1',
      class_name: 'Class A',
      start_date: '2026-08-01',
      end_date: '2026-09-01',
    };
    const values = makeValues({
      class_name: 'Class A',
      status: 'ACTIVE',
      start_date: '2026-08-01',
      end_date: '2026-09-01',
    });
    expect(buildUpdateClassPayload(values, selectedClass)).toEqual({
      noChange: true,
    });
  });
});
