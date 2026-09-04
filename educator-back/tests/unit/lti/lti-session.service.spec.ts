import { Test, TestingModule } from '@nestjs/testing';
import { LtiSessionService, LtiSessionError } from '../../../src/lti/lti-session.service';
import type { CreateLtiSessionInput } from '../../../src/lti/lti-session.types';

const educatorSessionBase = (): CreateLtiSessionInput => ({
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

const studentSessionBase = (): CreateLtiSessionInput => ({
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

describe('LtiSessionService', () => {
  let service: LtiSessionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LtiSessionService],
    }).compile();

    service = module.get<LtiSessionService>(LtiSessionService);
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  describe('createSession', () => {
    it('should create a session and return a URL-safe code', () => {
      const code = service.createSession(educatorSessionBase());

      expect(code).toBeDefined();
      expect(code.length).toBeGreaterThan(20);
      expect(code).not.toMatch(/[+/=]/);
    });

    it('should create unique codes for each session', () => {
      const code1 = service.createSession(educatorSessionBase());
      const code2 = service.createSession(educatorSessionBase());

      expect(code1).not.toEqual(code2);
    });
  });

  describe('consumeSession', () => {
    it('should retrieve educator session with stored context', () => {
      const code = service.createSession(educatorSessionBase());
      const retrieved = service.consumeSession(code, 'educator');

      expect(retrieved.audience).toBe('educator');
      if (retrieved.audience === 'educator') {
        expect(retrieved.accessToken).toBe('test_access_token');
        expect(retrieved.userId).toBe('edu-123');
        expect(retrieved.schoolId).toBe('school-456');
        expect(retrieved.ltiContext.issuer).toBe('https://moodle.example.com');
      }
    });

    it('should retrieve student session when audience matches', () => {
      const code = service.createSession(studentSessionBase());
      const retrieved = service.consumeSession(code, 'student');

      expect(retrieved.audience).toBe('student');
      if (retrieved.audience === 'student') {
        expect(retrieved.studentCode).toBe('ABC123-8');
        expect(retrieved.className).toBe('Biology 101');
      }
    });

    it('should delete session atomically (one-time use)', () => {
      const code = service.createSession(educatorSessionBase());

      service.consumeSession(code, 'educator');

      expect(() => service.consumeSession(code, 'educator')).toThrow(LtiSessionError);
    });

    it('should reject wrong audience binding', () => {
      const code = service.createSession(educatorSessionBase());

      expect(() => service.consumeSession(code, 'student')).toThrow(LtiSessionError);
      expect(service.getActiveSessionCount()).toBe(0);
    });

    it('should reject malformed code format', () => {
      expect(() => service.consumeSession('short', 'educator')).toThrow(LtiSessionError);
      expect(() => service.consumeSession('bad+code/format', 'student')).toThrow(LtiSessionError);
    });

    it('should reject expired session', () => {
      const code = service.createSession(educatorSessionBase());
      const sessions = (service as unknown as { sessions: Map<string, { expiresAt: number }> }).sessions;
      const session = sessions.get(code);
      if (session) {
        session.expiresAt = Date.now() - 1;
        sessions.set(code, session);
      }

      expect(() => service.consumeSession(code, 'educator')).toThrow(LtiSessionError);
    });
  });

  describe('session cleanup', () => {
    it('should report active session count', () => {
      expect(service.getActiveSessionCount()).toBe(0);
      service.createSession(educatorSessionBase());
      expect(service.getActiveSessionCount()).toBe(1);
    });

    it('should clean up expired sessions', () => {
      const code = service.createSession(educatorSessionBase());
      const sessions = (service as unknown as { sessions: Map<string, { expiresAt: number }> }).sessions;
      const session = sessions.get(code);
      if (session) {
        session.expiresAt = Date.now() - 1;
        sessions.set(code, session);
      }

      (service as unknown as { cleanupExpiredSessions: () => void }).cleanupExpiredSessions();

      expect(service.getActiveSessionCount()).toBe(0);
    });
  });
});
