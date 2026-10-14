import {
  extractLaunchCourseContext,
  extractStudentLaunchCourseIds,
} from '../../../src/lti/lti-launch-context.util';
import { extractCourseIdFromNrpsUrl } from '../../../src/lms/utils/nrps.util';
import {
  CANVAS_CLIENT_ID,
  CANVAS_COURSE_ID,
  CANVAS_COURSE_TITLE,
  CANVAS_DEPLOYMENT_ID,
  CANVAS_NRPS_URL,
  CANVAS_STUDENT_SUB,
  CANVAS_TEACHER_SUB,
  CANVAS_TEST_ISSUER,
  buildCanvasEducatorLaunchPayload,
  buildCanvasStudentLaunchPayload,
  extractNrpsUrlFromLaunchPayload,
  resolveLaunchClientId,
} from './fixtures/canvas-lti-launch.fixtures';

/** Same substring role checks used by LtiController educator/student launch. */
function classifyRoles(roles: string[]) {
  const normalizedRoles = roles.map((r) => r.toLowerCase());
  const isLearnerLike = normalizedRoles.some(
    (role) =>
      role.includes('learner') ||
      role.includes('student') ||
      role.endsWith('#learner') ||
      role.endsWith('/learner') ||
      role.endsWith('#student') ||
      role.endsWith('/student'),
  );
  const isInstructorLike = normalizedRoles.some(
    (role) =>
      role.includes('instructor') ||
      role.includes('teacher') ||
      role.includes('administrator') ||
      role.includes('admin') ||
      role.includes('manager') ||
      role.endsWith('#instructor') ||
      role.endsWith('/instructor'),
  );
  return { isLearnerLike, isInstructorLike };
}

describe('Canvas LTI launch fixtures (mocked payloads)', () => {
  describe('educator launch payload', () => {
    it('includes Canvas issuer, deployment_id, context, and NRPS URL', () => {
      const payload = buildCanvasEducatorLaunchPayload();

      expect(payload.iss).toBe(CANVAS_TEST_ISSUER);
      expect(payload.sub).toBe(CANVAS_TEACHER_SUB);
      expect(payload.aud).toBe(CANVAS_CLIENT_ID);
      expect(payload.email).toBe('ada@school.edu');
      expect(payload['https://purl.imsglobal.org/spec/lti/claim/message_type']).toBe(
        'LtiResourceLinkRequest',
      );
      expect(payload['https://purl.imsglobal.org/spec/lti/claim/version']).toBe('1.3.0');
      expect(payload['https://purl.imsglobal.org/spec/lti/claim/deployment_id']).toBe(
        CANVAS_DEPLOYMENT_ID,
      );
      expect(payload['https://purl.imsglobal.org/spec/lti/claim/roles']).toEqual([
        'http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor',
      ]);

      const context = payload['https://purl.imsglobal.org/spec/lti/claim/context'] as Record<
        string,
        unknown
      >;
      expect(context).toEqual({
        id: CANVAS_COURSE_ID,
        label: 'BIO101',
        title: CANVAS_COURSE_TITLE,
      });

      expect(extractNrpsUrlFromLaunchPayload(payload)).toBe(CANVAS_NRPS_URL);
      expect(CANVAS_NRPS_URL).toContain('/api/lti/courses/123/names_and_roles');
    });

    it('extracts course context via shared launch util (context.id)', () => {
      const payload = buildCanvasEducatorLaunchPayload({
        courseId: '999',
        courseTitle: 'Canvas Chem',
      });

      const course = extractLaunchCourseContext(payload);
      expect(course).toEqual({
        courseId: '999',
        courseTitle: 'Canvas Chem',
        source: 'context.id',
      });
    });

    it('supports Canvas-style aud array + azp', () => {
      const payload = buildCanvasEducatorLaunchPayload({ audAsArray: true });

      expect(payload.aud).toEqual([CANVAS_CLIENT_ID]);
      expect(payload.azp).toBe(CANVAS_CLIENT_ID);
      expect(resolveLaunchClientId(payload)).toBe(CANVAS_CLIENT_ID);
    });

    it('routes Instructor role to educator portal (not learner-only)', () => {
      const payload = buildCanvasEducatorLaunchPayload();
      const roles = payload['https://purl.imsglobal.org/spec/lti/claim/roles'] as string[];
      const { isLearnerLike, isInstructorLike } = classifyRoles(roles);

      expect(isInstructorLike).toBe(true);
      expect(isLearnerLike && !isInstructorLike).toBe(false);
    });

    it('treats Canvas TeachingAssistant URI as instructor-like', () => {
      const payload = buildCanvasEducatorLaunchPayload({
        roles: [
          'http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor',
          'http://purl.imsglobal.org/vocab/lis/v2/membership/Instructor#TeachingAssistant',
        ],
      });
      const roles = payload['https://purl.imsglobal.org/spec/lti/claim/roles'] as string[];
      const { isInstructorLike } = classifyRoles(roles);
      expect(isInstructorLike).toBe(true);
    });

    it('parses Canvas NRPS URLs for course id and still uses context.id for launch binding', () => {
      const payload = buildCanvasEducatorLaunchPayload();
      const nrpsUrl = extractNrpsUrlFromLaunchPayload(payload);

      expect(extractCourseIdFromNrpsUrl(nrpsUrl)).toBe(Number(CANVAS_COURSE_ID));
      expect(extractLaunchCourseContext(payload).courseId).toBe(CANVAS_COURSE_ID);
    });
  });

  describe('student launch payload', () => {
    it('includes Learner role and omits NRPS by default', () => {
      const payload = buildCanvasStudentLaunchPayload();

      expect(payload.iss).toBe(CANVAS_TEST_ISSUER);
      expect(payload.sub).toBe(CANVAS_STUDENT_SUB);
      expect(payload['https://purl.imsglobal.org/spec/lti/claim/roles']).toEqual([
        'http://purl.imsglobal.org/vocab/lis/v2/membership#Learner',
      ]);
      expect(extractNrpsUrlFromLaunchPayload(payload)).toBe('');
    });

    it('extracts student course ids from Canvas context.id', () => {
      const payload = buildCanvasStudentLaunchPayload({ courseId: '55' });
      expect(extractStudentLaunchCourseIds(payload)).toEqual(['55']);
    });

    it('routes Learner role to student app (not instructor)', () => {
      const payload = buildCanvasStudentLaunchPayload();
      const roles = payload['https://purl.imsglobal.org/spec/lti/claim/roles'] as string[];
      const { isLearnerLike, isInstructorLike } = classifyRoles(roles);

      expect(isLearnerLike).toBe(true);
      expect(isInstructorLike).toBe(false);
    });
  });
});
