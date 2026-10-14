import { describe, expect, it } from 'vitest';
import {
  extractImportableNrpsStudents,
  hasInstructorOrAdminRole,
  hasLearnerOnlyRole,
  isNrpsGuestUser,
  normalizeImportableEmail,
  toBulkCreateStudent,
} from '../../../src/utils/lmsNrpsStudentImport';

describe('lmsNrpsStudentImport', () => {
  it('detects Moodle guest by userId 1', () => {
    expect(isNrpsGuestUser({ userId: '1', email: 'root@localhost' })).toBe(
      true
    );
  });

  it('detects guest by root@localhost email', () => {
    expect(isNrpsGuestUser({ userId: '99', email: 'root@localhost' })).toBe(
      true
    );
  });

  it('detects guest by display name', () => {
    expect(isNrpsGuestUser({ userId: '42', name: 'Guest user' })).toBe(true);
  });

  it('does not treat regular learners as guest', () => {
    expect(
      isNrpsGuestUser({
        userId: '8',
        name: 'Test Student',
        email: 'student@school.edu',
      })
    ).toBe(false);
  });

  it('normalizeImportableEmail rejects invalid and localhost guest email', () => {
    expect(normalizeImportableEmail(null)).toBeUndefined();
    expect(normalizeImportableEmail('')).toBeUndefined();
    expect(normalizeImportableEmail('not-an-email')).toBeUndefined();
    expect(normalizeImportableEmail('root@localhost')).toBeUndefined();
    expect(normalizeImportableEmail('student@school.edu')).toBe(
      'student@school.edu'
    );
  });

  it('toBulkCreateStudent skips guest', () => {
    expect(
      toBulkCreateStudent({
        userId: '1',
        name: 'Guest user',
        email: 'root@localhost',
      })
    ).toBeNull();
  });

  it('toBulkCreateStudent includes valid learner with email', () => {
    expect(
      toBulkCreateStudent({
        userId: '8',
        name: 'Test Student',
        email: 'student@school.edu',
      })
    ).toEqual({
      student_id: '8',
      student_name: 'Test Student',
      email: 'student@school.edu',
      score: null,
    });
  });

  it('toBulkCreateStudent omits invalid email instead of sending null', () => {
    expect(
      toBulkCreateStudent({
        userId: '9',
        name: 'No Email Student',
        email: '',
      })
    ).toEqual({
      student_id: '9',
      student_name: 'No Email Student',
      score: null,
    });
  });

  it('extractImportableNrpsStudents keeps valid learners and drops guest', () => {
    const result = extractImportableNrpsStudents(
      [
        {
          userId: '1',
          name: 'Guest user',
          email: 'root@localhost',
          roles: ['Learner'],
        },
        {
          userId: '8',
          name: 'Real Student',
          email: 'student@school.edu',
          roles: ['Learner'],
        },
        {
          userId: '2',
          name: 'Teacher',
          email: 'teacher@school.edu',
          roles: ['Instructor'],
        },
      ],
      (member) =>
        Array.isArray(member.roles) && member.roles.includes('Learner')
    );

    expect(result).toEqual([
      {
        student_id: '8',
        student_name: 'Real Student',
        email: 'student@school.edu',
        score: null,
      },
    ]);
  });

  it('hasInstructorOrAdminRole detects instructor', () => {
    expect(
      hasInstructorOrAdminRole({ userId: '1', roles: ['Instructor'] })
    ).toBe(true);
    expect(hasInstructorOrAdminRole({ userId: '2', roles: ['Teacher'] })).toBe(
      true
    );
    expect(
      hasInstructorOrAdminRole({ userId: '3', roles: ['Administrator'] })
    ).toBe(true);
    expect(hasInstructorOrAdminRole({ userId: '4', roles: ['Learner'] })).toBe(
      false
    );
  });

  it('hasInstructorOrAdminRole detects LTI 1.3 role URNs', () => {
    expect(
      hasInstructorOrAdminRole({
        userId: '1',
        roles: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor'],
      })
    ).toBe(true);
  });

  it('hasLearnerOnlyRole returns false if member has instructor role', () => {
    expect(
      hasLearnerOnlyRole({
        userId: '1',
        roles: ['Learner', 'Instructor'],
      })
    ).toBe(false);
  });

  it('hasLearnerOnlyRole returns true only for learner-only members', () => {
    expect(
      hasLearnerOnlyRole({
        userId: '1',
        roles: ['Learner'],
      })
    ).toBe(true);
    expect(
      hasLearnerOnlyRole({
        userId: '2',
        roles: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Learner'],
      })
    ).toBe(true);
  });

  it('toBulkCreateStudent skips instructor even without learner role check', () => {
    expect(
      toBulkCreateStudent({
        userId: '99',
        name: 'Test Teacher',
        email: 'teacher@school.edu',
        roles: ['Instructor'],
      })
    ).toBeNull();
  });

  it('extractImportableNrpsStudents excludes instructor with mixed Learner/Instructor roles', () => {
    const result = extractImportableNrpsStudents(
      [
        {
          userId: '10',
          name: 'Student Only',
          email: 'student@school.edu',
          roles: ['Learner'],
        },
        {
          userId: '11',
          name: 'Teacher with Learner',
          email: 'teacher@school.edu',
          roles: ['Learner', 'Instructor'],
        },
      ],
      (member) =>
        Array.isArray(member.roles) && member.roles.includes('Learner')
    );

    expect(result).toEqual([
      {
        student_id: '10',
        student_name: 'Student Only',
        email: 'student@school.edu',
        score: null,
      },
    ]);
  });
});
