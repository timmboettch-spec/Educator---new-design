import { describe, expect, it } from 'vitest';
import {
  StudentCodeStatus,
  StudentSortField,
  type StudentSummaryResDto,
} from '../../../src/redux/api/students/students.types';
import {
  buildClassRosterInfiniteArg,
  formatDuration,
  formatScore,
  mapStudentSummaryToRosterRow,
} from '../../../src/redux/api/students/studentsService';

const summary = (
  overrides: Partial<StudentSummaryResDto> = {}
): StudentSummaryResDto => ({
  id: 'stu-1',
  studentId: 'STU-AB12',
  name: 'Ava Thompson',
  email: 'ava@example.com',
  classId: 'c1',
  schoolId: 's1',
  status: 'ACTIVE',
  isActive: true,
  submissionDate: '2026-01-15',
  simsCompleted: '3',
  score: 87.5,
  timeSpent: '02:15:00',
  timeRemaining: '00:45:00',
  reportsCount: 3,
  codeStatus: StudentCodeStatus.ACTIVE,
  ...overrides,
});

describe('studentsService', () => {
  describe('buildClassRosterInfiniteArg', () => {
    it('scopes to the class and omits the sort by default (BE newest first)', () => {
      expect(buildClassRosterInfiniteArg('c1')).toEqual({
        pageSize: 10,
        classIds: ['c1'],
      });
    });

    it('sends sortBy with its direction', () => {
      expect(
        buildClassRosterInfiniteArg('c1', StudentSortField.CODE_STATUS, 'desc')
      ).toEqual({
        pageSize: 10,
        classIds: ['c1'],
        sortBy: 'codeStatus',
        sortDir: 'desc',
      });
    });

    it('drops a direction without a sort column', () => {
      expect(buildClassRosterInfiniteArg('c1', undefined, 'asc')).toEqual({
        pageSize: 10,
        classIds: ['c1'],
      });
    });
  });

  describe('formatDuration', () => {
    it.each([
      ['02:15:00', '2h 15m'],
      ['400:00:00', '400h 0m'],
      ['00:45:10', '45m 10s'],
      ['00:00:30', '30s'],
      ['00:00:00', '0s'],
    ])('formats %s as %s', (hms, expected) => {
      expect(formatDuration(hms)).toBe(expected);
    });

    it.each([[null], [''], ['2h 15m'], ['00:75:00']])(
      'shows a dash for %s',
      (hms) => {
        expect(formatDuration(hms)).toBe('-');
      }
    );
  });

  it('formatScore rounds to a percentage, or a dash when missing', () => {
    expect(formatScore(87.5)).toBe('88%');
    expect(formatScore(0)).toBe('0%');
    expect(formatScore(null)).toBe('-');
  });

  describe('mapStudentSummaryToRosterRow', () => {
    it('maps the BE row to display values and the legacy student', () => {
      expect(mapStudentSummaryToRosterRow(summary())).toEqual({
        id: 'stu-1',
        studentCode: 'STU-AB12',
        name: 'Ava Thompson',
        timeSpent: '2h 15m',
        timeRemaining: '45m 0s',
        simsCompleted: '3',
        hasCompletedSims: true,
        avgScore: '88%',
        reportsCount: 3,
        isCodeRevoked: false,
        student: {
          id: 'stu-1',
          student_id: 'STU-AB12',
          student_name: 'Ava Thompson',
          email: 'ava@example.com',
          class_id: 'c1',
          status: 'ACTIVE',
          score: 87.5,
          sims_completed: '3',
          submission_date: '2026-01-15',
          time_spent: '02:15:00',
          time_remaining: '00:45:00',
        },
      });
    });

    it('reads a revoked code from codeStatus', () => {
      expect(
        mapStudentSummaryToRosterRow(
          summary({ codeStatus: StudentCodeStatus.REVOKED })
        ).isCodeRevoked
      ).toBe(true);
    });

    it('falls back for a missing code, name and sims', () => {
      const row = mapStudentSummaryToRosterRow(
        summary({ studentId: '', name: null, simsCompleted: null })
      );
      expect(row.studentCode).toBe('---');
      expect(row.name).toBe('');
      expect(row.simsCompleted).toBe('-');
      expect(row.hasCompletedSims).toBe(false);
      expect(row.student.student_id).toBeNull();
    });

    it('leaves a status the legacy shape lacks undefined', () => {
      expect(
        mapStudentSummaryToRosterRow(summary({ status: 'PENDING' })).student
          .status
      ).toBeUndefined();
    });
  });
});
