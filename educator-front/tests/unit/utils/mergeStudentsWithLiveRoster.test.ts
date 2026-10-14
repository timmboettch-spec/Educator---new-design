import { describe, expect, it } from 'vitest';
import { mergeStudentsWithLiveRoster } from '../../../src/utils/mergeStudentsWithLiveRoster';
import type { Student } from '../../../src/types/Class_types';
import type { LmsStudent } from '../../../src/redux/lms/SyncLmsClassesRedux';

function makeStudent(overrides: Partial<Student> = {}): Student {
  return {
    student_id: null,
    student_name: null,
    email: null,
    score: null,
    ...overrides,
  };
}

describe('mergeStudentsWithLiveRoster', () => {
  it('returns db students unchanged when no live roster exists for the class', () => {
    const dbStudents = [makeStudent({ student_name: 'Alex' })];
    const result = mergeStudentsWithLiveRoster(dbStudents, 'Period 1', {});
    expect(result).toBe(dbStudents);
  });

  it('matches by exact user_id', () => {
    const dbStudents = [makeStudent({ user_id: '42' })];
    const live: LmsStudent[] = [
      { userId: '42', name: 'Live Name', email: 'live@example.com' },
    ];
    const [result] = mergeStudentsWithLiveRoster(dbStudents, 'Period 1', {
      'period 1': live,
    });
    expect(result!.student_name).toBe('Live Name');
    expect(result!.email).toBe('live@example.com');
    expect(result!.user_id).toBe('42');
  });

  it('matches by normalized (zero-padded) user_id', () => {
    const dbStudents = [makeStudent({ user_id: '007' })];
    const live: LmsStudent[] = [{ userId: '7', name: 'Live Name' }];
    const [result] = mergeStudentsWithLiveRoster(dbStudents, 'Period 1', {
      'period 1': live,
    });
    expect(result!.student_name).toBe('Live Name');
  });

  it('matches by LMS user id encoded in the student_id suffix', () => {
    const dbStudents = [makeStudent({ student_id: 'ABC-M0012' })];
    const live: LmsStudent[] = [{ userId: '12', name: 'Suffix Match' }];
    const [result] = mergeStudentsWithLiveRoster(dbStudents, 'Period 1', {
      'period 1': live,
    });
    expect(result!.student_name).toBe('Suffix Match');
    expect(result!.user_id).toBe('12');
  });

  it('falls back to positional match when no id match is found', () => {
    const dbStudents = [makeStudent({}), makeStudent({})];
    const live: LmsStudent[] = [
      { userId: 'a', name: 'First' },
      { userId: 'b', name: 'Second' },
    ];
    const result = mergeStudentsWithLiveRoster(dbStudents, 'Period 1', {
      'period 1': live,
    });
    expect(result[0]?.student_name).toBe('First');
    expect(result[1]?.student_name).toBe('Second');
  });

  it('prefers existing db name/email over the live roster values', () => {
    const dbStudents = [
      makeStudent({
        user_id: '1',
        student_name: 'DB Name',
        email: 'db@example.com',
      }),
    ];
    const live: LmsStudent[] = [
      { userId: '1', name: 'Live Name', email: 'live@example.com' },
    ];
    const [result] = mergeStudentsWithLiveRoster(dbStudents, 'Period 1', {
      'period 1': live,
    });
    expect(result!.student_name).toBe('DB Name');
    expect(result!.email).toBe('db@example.com');
  });

  it('synthesizes rows from the live roster when there are no db students', () => {
    const live: LmsStudent[] = [
      { userId: '1', name: 'Only Live', email: 'live@example.com' },
    ];
    const result = mergeStudentsWithLiveRoster([], 'Period 1', {
      'period 1': live,
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: '1',
      user_id: '1',
      student_name: 'Only Live',
      email: 'live@example.com',
      status: 'ACTIVE',
    });
  });

  it('matches the class name case-insensitively and trims whitespace', () => {
    const dbStudents = [makeStudent({ user_id: '1' })];
    const live: LmsStudent[] = [{ userId: '1', name: 'Live Name' }];
    const [result] = mergeStudentsWithLiveRoster(dbStudents, '  Period 1  ', {
      'period 1': live,
    });
    expect(result!.student_name).toBe('Live Name');
  });
});
