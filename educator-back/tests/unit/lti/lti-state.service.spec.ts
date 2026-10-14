import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { LtiStateService } from '../../../src/lti/lti-state.service';
import { LtiConstants } from '../../../src/lti/lti.constants';
import { RedisService } from '../../../src/redis/redis.service';
import { Messages } from '../../../src/common/utils/messages';
import { createRedisServiceStub, RedisServiceStub } from './helpers/redis-service.stub';
import { LoggerService } from '../../../src/common/services';

const keyOf = (state: string): string => `${LtiConstants.REDIS.STATE_KEY_PREFIX}${state}`;

describe('LtiStateService', () => {
  let service: LtiStateService;
  let redis: RedisServiceStub;

  beforeEach(async () => {
    redis = createRedisServiceStub();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LtiStateService,
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

    service = module.get<LtiStateService>(LtiStateService);
  });

  describe('createStatePair', () => {
    it('should store nonce and toolType in Redis under the lti:state key', async () => {
      await service.createStatePair('state-uuid-123', 'nonce-uuid-456', 'educator');

      expect(redis.setStrict).toHaveBeenCalledWith(
        keyOf('state-uuid-123'),
        { nonce: 'nonce-uuid-456', toolType: 'educator' },
        LtiConstants.REDIS.STATE_TTL_SECONDS,
      );
    });

    it('should use a 10 minute TTL', () => {
      expect(LtiConstants.REDIS.STATE_TTL_SECONDS).toBe(600);
    });

    it('should store student pairs under the same prefix', async () => {
      await service.createStatePair('state-uuid-789', 'nonce-uuid-012', 'student');

      expect(redis.store.get(keyOf('state-uuid-789'))).toEqual({
        nonce: 'nonce-uuid-012',
        toolType: 'student',
      });
    });

    it('should keep each state under its own key', async () => {
      await service.createStatePair('state1', 'nonce1', 'educator');
      await service.createStatePair('state2', 'nonce2', 'student');

      expect(redis.store.size).toBe(2);
    });

    it('should overwrite when the same state is created twice', async () => {
      await service.createStatePair('same-state', 'nonce1', 'educator');
      await service.createStatePair('same-state', 'nonce2', 'educator');

      expect(redis.store.size).toBe(1);
      expect(redis.store.get(keyOf('same-state'))).toEqual({
        nonce: 'nonce2',
        toolType: 'educator',
      });
    });
  });

  describe('validateAndConsume - success cases', () => {
    it('should validate a matching educator state/nonce pair', async () => {
      await service.createStatePair('state-abc', 'nonce-xyz', 'educator');

      await expect(
        service.validateAndConsume('state-abc', 'nonce-xyz', 'educator'),
      ).resolves.toMatchObject({ nonce: 'nonce-xyz', toolType: 'educator' });
    });

    it('should validate a matching student state/nonce pair', async () => {
      await service.createStatePair('state-def', 'nonce-uvw', 'student');

      await expect(
        service.validateAndConsume('state-def', 'nonce-uvw', 'student'),
      ).resolves.toMatchObject({ nonce: 'nonce-uvw', toolType: 'student' });
    });

    it('should return canvasReviewToken when stored on the state pair', async () => {
      await service.createStatePair('state-rev', 'nonce-rev', 'educator', {
        canvasReviewToken: 'review.jwt.token',
      });

      await expect(
        service.validateAndConsume('state-rev', 'nonce-rev', 'educator'),
      ).resolves.toMatchObject({
        toolType: 'educator',
        canvasReviewToken: 'review.jwt.token',
      });
    });

    it('should read and delete atomically via getDelStrict', async () => {
      await service.createStatePair('state-abc', 'nonce-xyz', 'educator');
      await service.validateAndConsume('state-abc', 'nonce-xyz', 'educator');

      expect(redis.getDelStrict).toHaveBeenCalledWith(keyOf('state-abc'));
      expect(redis.store.has(keyOf('state-abc'))).toBe(false);
    });

    it('should only consume the state it was given', async () => {
      await service.createStatePair('state1', 'nonce1', 'educator');
      await service.createStatePair('state2', 'nonce2', 'student');

      await service.validateAndConsume('state2', 'nonce2', 'student');

      expect(redis.store.has(keyOf('state1'))).toBe(true);
      expect(redis.store.has(keyOf('state2'))).toBe(false);
    });
  });

  describe('validateAndConsume - missing state parameter', () => {
    it.each([
      ['undefined', undefined],
      ['empty', ''],
      ['whitespace-only', '   '],
    ])('should reject a %s state without touching Redis', async (_label, state) => {
      await expect(service.validateAndConsume(state, 'nonce123', 'educator')).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.validateAndConsume(state, 'nonce123', 'educator')).rejects.toThrow(
        'Missing state parameter',
      );
      expect(redis.getDelStrict).not.toHaveBeenCalled();
    });
  });

  describe('validateAndConsume - missing nonce parameter', () => {
    it.each([
      ['undefined', undefined],
      ['empty', ''],
      ['whitespace-only', '   '],
    ])('should reject a %s nonce without consuming the state', async (_label, nonce) => {
      await service.createStatePair('state-abc', 'nonce123', 'educator');

      await expect(service.validateAndConsume('state-abc', nonce, 'educator')).rejects.toThrow(
        'Missing nonce in id_token',
      );
      expect(redis.store.has(keyOf('state-abc'))).toBe(true);
    });
  });

  describe('validateAndConsume - state not found (CSRF protection)', () => {
    it('should reject a forged state', async () => {
      await expect(
        service.validateAndConsume('forged-state', 'nonce123', 'educator'),
      ).rejects.toThrow('Invalid or expired state parameter');
    });

    it('should reject reuse of an already-consumed state (one-time use)', async () => {
      await service.createStatePair('state-abc', 'nonce-xyz', 'educator');
      await service.validateAndConsume('state-abc', 'nonce-xyz', 'educator');

      await expect(
        service.validateAndConsume('state-abc', 'nonce-xyz', 'educator'),
      ).rejects.toThrow('Invalid or expired state parameter');
    });

    it('should reject a state that Redis has already expired', async () => {
      await service.createStatePair('state-abc', 'nonce-xyz', 'educator');
      redis.store.clear();

      await expect(
        service.validateAndConsume('state-abc', 'nonce-xyz', 'educator'),
      ).rejects.toThrow('Invalid or expired state parameter');
    });
  });

  describe('validateAndConsume - tool type mismatch', () => {
    it('should reject an educator state used on the student callback', async () => {
      await service.createStatePair('state-abc', 'nonce-xyz', 'educator');

      await expect(service.validateAndConsume('state-abc', 'nonce-xyz', 'student')).rejects.toThrow(
        'State parameter tool type mismatch',
      );
      expect(redis.store.has(keyOf('state-abc'))).toBe(false);
    });

    it('should reject a student state used on the educator callback', async () => {
      await service.createStatePair('state-abc', 'nonce-xyz', 'student');

      await expect(
        service.validateAndConsume('state-abc', 'nonce-xyz', 'educator'),
      ).rejects.toThrow('State parameter tool type mismatch');
      expect(redis.store.has(keyOf('state-abc'))).toBe(false);
    });
  });

  describe('validateAndConsume - nonce mismatch (replay protection)', () => {
    it('should reject a mismatched nonce and consume the state', async () => {
      await service.createStatePair('state-abc', 'stored-nonce', 'educator');

      await expect(
        service.validateAndConsume('state-abc', 'attacker-nonce', 'educator'),
      ).rejects.toThrow('Nonce mismatch - possible replay attack');
      expect(redis.store.has(keyOf('state-abc'))).toBe(false);
    });

    it('should compare nonces case-sensitively', async () => {
      await service.createStatePair('state-abc', 'NonceABC123', 'educator');

      await expect(
        service.validateAndConsume('state-abc', 'nonceabc123', 'educator'),
      ).rejects.toThrow('Nonce mismatch - possible replay attack');
    });
  });

  describe('Redis unavailable - no in-memory fallback', () => {
    it('should fail login initiation as 503 when Redis rejects the write', async () => {
      redis.setStrict.mockRejectedValueOnce(new Error('Connection is closed.'));

      await expect(service.createStatePair('state-abc', 'nonce-xyz', 'educator')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('should fail the launch as 503 when Redis rejects the read', async () => {
      redis.getDelStrict.mockRejectedValueOnce(new Error('Connection is closed.'));

      await expect(
        service.validateAndConsume('state-abc', 'nonce-xyz', 'educator'),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('should not disguise an outage as an invalid state parameter', async () => {
      redis.getDelStrict.mockRejectedValueOnce(new Error('Connection is closed.'));

      await expect(
        service.validateAndConsume('state-abc', 'nonce-xyz', 'educator'),
      ).rejects.toThrow(Messages.LTI_STORAGE_UNAVAILABLE);
    });
  });
});
