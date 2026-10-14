import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { LtiSessionService, LtiSessionError } from '../../../src/lti/lti-session.service';
import { LtiConstants } from '../../../src/lti/lti.constants';
import { Messages } from '../../../src/common/utils/messages';
import { RedisService } from '../../../src/redis/redis.service';
import { educatorSessionPayload, studentSessionPayload } from '../../test-data/lti-session.fixture';
import { createRedisServiceStub, RedisServiceStub } from './helpers/redis-service.stub';
import { LoggerService } from '../../../src/common/services';

const keyOf = (code: string): string => `${LtiConstants.REDIS.SESSION_KEY_PREFIX}${code}`;

describe('LtiSessionService', () => {
  let service: LtiSessionService;
  let redis: RedisServiceStub;

  beforeEach(async () => {
    redis = createRedisServiceStub();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LtiSessionService,
        { provide: RedisService, useValue: redis },
        {
          provide: LoggerService,
          useValue: {
            log: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn(),
            verbose: jest.fn(),
            fatal: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<LtiSessionService>(LtiSessionService);
  });

  describe('createSession', () => {
    it('should create a session and return a URL-safe code', async () => {
      const code = await service.createSession(educatorSessionPayload());

      expect(code).toMatch(/^[A-Za-z0-9_-]{40,50}$/);
      expect(service.isValidCodeFormat(code)).toBe(true);
    });

    it('should generate a unique code per session', async () => {
      const code1 = await service.createSession(educatorSessionPayload());
      const code2 = await service.createSession(educatorSessionPayload());

      expect(code1).not.toBe(code2);
    });

    it('should store the payload in Redis under the lti:session key with a 30 minute TTL', async () => {
      const code = await service.createSession(educatorSessionPayload());

      expect(LtiConstants.REDIS.SESSION_TTL_SECONDS).toBe(30 * 60);
      expect(redis.setStrict).toHaveBeenCalledWith(
        keyOf(code),
        expect.objectContaining({ audience: 'educator', userId: 'edu-123' }),
        LtiConstants.REDIS.SESSION_TTL_SECONDS,
      );
    });
  });

  describe('consumeSession', () => {
    it('should return the educator payload for a valid code', async () => {
      const code = await service.createSession(educatorSessionPayload());
      const retrieved = await service.consumeSession(code, 'educator');

      expect(retrieved.audience).toBe('educator');
      if (retrieved.audience === 'educator') {
        expect(retrieved.userId).toBe('edu-123');
        expect(retrieved.schoolId).toBe('school-456');
        expect(retrieved.accessToken).toBe('test_access_token');
        expect(retrieved.csrfToken).toBe('test_csrf_token');
        expect(retrieved.lmsCourseName).toBe('Test Course');
      }
    });

    it('should return the student payload for a valid code', async () => {
      const code = await service.createSession(studentSessionPayload());
      const retrieved = await service.consumeSession(code, 'student');

      expect(retrieved.audience).toBe('student');
      if (retrieved.audience === 'student') {
        expect(retrieved.studentCode).toBe('ABC123-8');
        expect(retrieved.className).toBe('Biology 101');
      }
    });

    it('should read and delete atomically via getDelStrict', async () => {
      const code = await service.createSession(educatorSessionPayload());
      await service.consumeSession(code, 'educator');

      expect(redis.getDelStrict).toHaveBeenCalledWith(keyOf(code));
      expect(redis.store.has(keyOf(code))).toBe(false);
    });

    it('should reject a second use of the same code (one-time use)', async () => {
      const code = await service.createSession(educatorSessionPayload());
      await service.consumeSession(code, 'educator');

      await expect(service.consumeSession(code, 'educator')).rejects.toThrow(LtiSessionError);
    });

    it('should reject an audience mismatch and still consume the code', async () => {
      const code = await service.createSession(educatorSessionPayload());

      await expect(service.consumeSession(code, 'student')).rejects.toThrow(LtiSessionError);
      expect(redis.store.has(keyOf(code))).toBe(false);
    });

    it('should reject a malformed code without touching Redis', async () => {
      await expect(service.consumeSession('short', 'educator')).rejects.toThrow(LtiSessionError);
      await expect(service.consumeSession('bad+code/format', 'student')).rejects.toThrow(
        LtiSessionError,
      );
      expect(redis.getDelStrict).not.toHaveBeenCalled();
    });

    it('should reject a code Redis has already expired', async () => {
      const code = await service.createSession(educatorSessionPayload());
      redis.store.clear();

      await expect(service.consumeSession(code, 'educator')).rejects.toThrow(
        'Invalid or expired session code',
      );
    });
  });

  describe('Redis unavailable - no in-memory fallback', () => {
    it('should fail session creation as 503 when Redis rejects the write', async () => {
      redis.setStrict.mockRejectedValueOnce(new Error('Connection is closed.'));

      await expect(service.createSession(educatorSessionPayload())).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('should fail the exchange as 503 when Redis rejects the read', async () => {
      const code = await service.createSession(educatorSessionPayload());
      redis.getDelStrict.mockRejectedValueOnce(new Error('Connection is closed.'));

      await expect(service.consumeSession(code, 'educator')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('should not disguise an outage as an invalid session code', async () => {
      const code = await service.createSession(educatorSessionPayload());
      redis.getDelStrict.mockRejectedValueOnce(new Error('Connection is closed.'));

      // An LtiSessionError here would surface to the caller as a 400.
      await expect(service.consumeSession(code, 'educator')).rejects.toThrow(
        Messages.LTI_STORAGE_UNAVAILABLE,
      );
    });
  });
});
