import type { LtiSessionPayload } from '../../src/lti/lti-session.types';

export const educatorSessionPayload = (): LtiSessionPayload => ({
  audience: 'educator',
  userId: 'edu-123',
  schoolId: 'school-456',
  ltiContext: {
    issuer: 'https://moodle.example.com',
    lmsUserId: 'moodle-user-1',
    lmsCourseId: 'course-789',
    clientId: 'client-abc',
  },
  accessToken: 'test_access_token',
  csrfToken: 'test_csrf_token',
  user: { id: 'edu-123', email: 'teacher@example.com' },
  nrpsUrl: 'https://moodle.example.com/nrps',
  lmsCourseId: 'course-789',
  lmsCourseName: 'Test Course',
  provisioningStatus: 'queued',
  courseSource: 'context.id',
});

export const studentSessionPayload = (): LtiSessionPayload => ({
  audience: 'student',
  userId: 'stu-db-1',
  schoolId: 'school-456',
  ltiContext: {
    issuer: 'https://moodle.example.com',
    lmsUserId: 'moodle-learner-1',
    lmsCourseId: 'course-789',
    clientId: 'client-student',
  },
  studentCode: 'ABC123-8',
  classId: 'class-1',
  className: 'Biology 101',
  accessToken: 'student_jwt_token',
  studentData: { student_id: 'ABC123-8', class_name: 'Biology 101' },
});
