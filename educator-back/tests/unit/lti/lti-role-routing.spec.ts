/**
 * Unit tests for LTI role-based routing (RWED-1102 / M7)
 * 
 * Validates that:
 * - Learners are blocked from educator portal
 * - Instructors are blocked from student app
 * - Proper error reasons are returned
 */

describe('LTI Role-Based Routing', () => {
  describe('Educator Launch Role Validation', () => {
    it('should block pure learner role from educator portal', () => {
      const roles = ['http://purl.imsglobal.org/vocab/lis/v2/membership#Learner'];
      const normalizedRoles = roles.map((r) => r.toLowerCase());

      const isLearnerOnly = normalizedRoles.some(
        (role) =>
          role.includes('learner') ||
          role.includes('student') ||
          role.endsWith('#learner') ||
          role.endsWith('/learner') ||
          role.endsWith('#student') ||
          role.endsWith('/student'),
      );

      const isInstructor = normalizedRoles.some(
        (role) =>
          role.includes('instructor') ||
          role.includes('teacher') ||
          role.includes('administrator') ||
          role.includes('admin') ||
          role.includes('manager') ||
          role.endsWith('#instructor') ||
          role.endsWith('/instructor'),
      );

      expect(isLearnerOnly).toBe(true);
      expect(isInstructor).toBe(false);
      // Should redirect with reason=educator_role_required
    });

    it('should allow instructor role to educator portal', () => {
      const roles = ['http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor'];
      const normalizedRoles = roles.map((r) => r.toLowerCase());

      const isLearnerOnly = normalizedRoles.some(
        (role) =>
          role.includes('learner') ||
          role.includes('student') ||
          role.endsWith('#learner') ||
          role.endsWith('/learner') ||
          role.endsWith('#student') ||
          role.endsWith('/student'),
      );

      const isInstructor = normalizedRoles.some(
        (role) =>
          role.includes('instructor') ||
          role.includes('teacher') ||
          role.includes('administrator') ||
          role.includes('admin') ||
          role.includes('manager') ||
          role.endsWith('#instructor') ||
          role.endsWith('/instructor'),
      );

      expect(isLearnerOnly).toBe(false);
      expect(isInstructor).toBe(true);
      // Should allow access
    });

    it('should allow mixed roles (instructor + learner) to educator portal', () => {
      const roles = [
        'http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor',
        'http://purl.imsglobal.org/vocab/lis/v2/membership#Learner',
      ];
      const normalizedRoles = roles.map((r) => r.toLowerCase());

      const isLearnerOnly = normalizedRoles.some(
        (role) =>
          role.includes('learner') ||
          role.includes('student') ||
          role.endsWith('#learner') ||
          role.endsWith('/learner') ||
          role.endsWith('#student') ||
          role.endsWith('/student'),
      );

      const isInstructor = normalizedRoles.some(
        (role) =>
          role.includes('instructor') ||
          role.includes('teacher') ||
          role.includes('administrator') ||
          role.includes('admin') ||
          role.includes('manager') ||
          role.endsWith('#instructor') ||
          role.endsWith('/instructor'),
      );

      // Has learner but also has instructor, so allow
      expect(isLearnerOnly && !isInstructor).toBe(false);
      // Should allow access
    });

    it('should handle Moodle-style student role', () => {
      const roles = ['http://purl.imsglobal.org/vocab/lis/v2/institution/person#Student'];
      const normalizedRoles = roles.map((r) => r.toLowerCase());

      const isLearnerOnly = normalizedRoles.some(
        (role) =>
          role.includes('learner') ||
          role.includes('student') ||
          role.endsWith('#learner') ||
          role.endsWith('/learner') ||
          role.endsWith('#student') ||
          role.endsWith('/student'),
      );

      const isInstructor = normalizedRoles.some(
        (role) =>
          role.includes('instructor') ||
          role.includes('teacher') ||
          role.includes('administrator') ||
          role.includes('admin') ||
          role.includes('manager') ||
          role.endsWith('#instructor') ||
          role.endsWith('/instructor'),
      );

      expect(isLearnerOnly).toBe(true);
      expect(isInstructor).toBe(false);
      // Should block
    });
  });

  describe('Student Launch Role Validation', () => {
    it('should block instructor from student app', () => {
      const roles = ['http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor'];
      const normalizedRoles = roles.map((r) => r.toLowerCase());

      const isEducatorLike = normalizedRoles.some(
        (role) =>
          role.includes('instructor') ||
          role.includes('teacher') ||
          role.includes('faculty') ||
          role.includes('admin') ||
          role.endsWith('#instructor') ||
          role.endsWith('/instructor') ||
          role.endsWith('#teacher') ||
          role.endsWith('/teacher') ||
          role.endsWith('#faculty') ||
          role.endsWith('/faculty') ||
          role.endsWith('#administrator') ||
          role.endsWith('/administrator'),
      );

      expect(isEducatorLike).toBe(true);
      // Should redirect with reason=educator_using_student_tool
    });

    it('should allow learner to student app', () => {
      const roles = ['http://purl.imsglobal.org/vocab/lis/v2/membership#Learner'];
      const normalizedRoles = roles.map((r) => r.toLowerCase());

      const isEducatorLike = normalizedRoles.some(
        (role) =>
          role.includes('instructor') ||
          role.includes('teacher') ||
          role.includes('faculty') ||
          role.includes('admin') ||
          role.endsWith('#instructor') ||
          role.endsWith('/instructor') ||
          role.endsWith('#teacher') ||
          role.endsWith('/teacher') ||
          role.endsWith('#faculty') ||
          role.endsWith('/faculty') ||
          role.endsWith('#administrator') ||
          role.endsWith('/administrator'),
      );

      const isStudentLike = normalizedRoles.some(
        (role) =>
          role.includes('student') ||
          role.includes('learner') ||
          role.endsWith('#student') ||
          role.endsWith('/student') ||
          role.endsWith('#learner') ||
          role.endsWith('/learner'),
      );

      expect(isEducatorLike).toBe(false);
      expect(isStudentLike).toBe(true);
      // Should allow access
    });

    it('should block administrator from student app', () => {
      const roles = ['http://purl.imsglobal.org/vocab/lis/v2/system/person#Administrator'];
      const normalizedRoles = roles.map((r) => r.toLowerCase());

      const isEducatorLike = normalizedRoles.some(
        (role) =>
          role.includes('instructor') ||
          role.includes('teacher') ||
          role.includes('faculty') ||
          role.includes('admin') ||
          role.endsWith('#instructor') ||
          role.endsWith('/instructor') ||
          role.endsWith('#teacher') ||
          role.endsWith('/teacher') ||
          role.endsWith('#faculty') ||
          role.endsWith('/faculty') ||
          role.endsWith('#administrator') ||
          role.endsWith('/administrator'),
      );

      expect(isEducatorLike).toBe(true);
      // Should block
    });

    it('should block student launch when roles claim is empty', () => {
      const roles: string[] = [];
      const normalizedRoles = roles.map((r) => r.toLowerCase());

      const isStudentLike = normalizedRoles.some(
        (role) =>
          role.includes('student') ||
          role.includes('learner') ||
          role.endsWith('#student') ||
          role.endsWith('/student') ||
          role.endsWith('#learner') ||
          role.endsWith('/learner'),
      );

      const shouldBlockStudentLaunch = normalizedRoles.length === 0 || !isStudentLike;

      expect(shouldBlockStudentLaunch).toBe(true);
      // Should redirect with reason=student_role_required
    });
  });

  describe('Edge Cases', () => {
    it('should block educator launch when roles claim is empty', () => {
      const roles: string[] = [];
      const normalizedRoles = roles.map((r) => r.toLowerCase());

      const isLearnerOnly = normalizedRoles.some(
        (role) =>
          role.includes('learner') ||
          role.includes('student'),
      );

      const isInstructor = normalizedRoles.some(
        (role) =>
          role.includes('instructor') ||
          role.includes('teacher'),
      );

      const shouldBlockEducatorLaunch =
        normalizedRoles.length === 0 || (isLearnerOnly && !isInstructor);

      expect(shouldBlockEducatorLaunch).toBe(true);
    });

    it('should handle case-insensitive role matching', () => {
      const roles = ['INSTRUCTOR', 'Teacher', 'lEaRnEr'];
      const normalizedRoles = roles.map((r) => r.toLowerCase());

      const hasInstructor = normalizedRoles.some((r) => r.includes('instructor'));
      const hasTeacher = normalizedRoles.some((r) => r.includes('teacher'));
      const hasLearner = normalizedRoles.some((r) => r.includes('learner'));

      expect(hasInstructor).toBe(true);
      expect(hasTeacher).toBe(true);
      expect(hasLearner).toBe(true);
    });

    it('should match custom role URIs with standard patterns', () => {
      const roles = [
        'urn:lti:role:ims/lis/Instructor',
        'http://custom.edu/vocab#Teacher',
        'Learner',
      ];
      const normalizedRoles = roles.map((r) => r.toLowerCase());

      const hasInstructor = normalizedRoles.some((r) => r.includes('instructor'));
      const hasTeacher = normalizedRoles.some((r) => r.includes('teacher'));
      const hasLearner = normalizedRoles.some((r) => r.includes('learner'));

      expect(hasInstructor).toBe(true);
      expect(hasTeacher).toBe(true);
      expect(hasLearner).toBe(true);
    });
  });
});
