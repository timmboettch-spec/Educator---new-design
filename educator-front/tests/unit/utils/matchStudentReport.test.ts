import { describe, expect, it } from 'vitest';

import {
  buildUniqueStudentNames,
  reportMatchesStudent,
} from '../../../src/utils/matchStudentReport';

describe('reportMatchesStudent', () => {
  it('matches by student access code', () => {
    const student = {
      id: 'uuid-1',
      student_id: '99190352',
      student_name: 'Student',
    };
    const report = { userId: '99190352', studentName: 'Student' };

    expect(reportMatchesStudent(student, report)).toBe(true);
  });

  it('does not match all students when only the name is shared', () => {
    const students = [
      { id: 'uuid-1', student_id: '99190352', student_name: 'Student' },
      { id: 'uuid-2', student_id: '53762692', student_name: 'Student' },
    ];
    const uniqueStudentNames = buildUniqueStudentNames(students);
    const report = { userId: '99190352', studentName: 'Student' };

    expect(
      reportMatchesStudent(students[0], report, { uniqueStudentNames })
    ).toBe(true);
    expect(
      reportMatchesStudent(students[1], report, { uniqueStudentNames })
    ).toBe(false);
  });

  it('allows unique non-generic name fallback', () => {
    const students = [
      { id: 'uuid-1', student_id: '111', student_name: 'Jane Doe' },
      { id: 'uuid-2', student_id: '222', student_name: 'John Smith' },
    ];
    const uniqueStudentNames = buildUniqueStudentNames(students);
    const report = { studentName: 'Jane Doe' };

    expect(
      reportMatchesStudent(students[0], report, { uniqueStudentNames })
    ).toBe(true);
    expect(
      reportMatchesStudent(students[1], report, { uniqueStudentNames })
    ).toBe(false);
  });
});
