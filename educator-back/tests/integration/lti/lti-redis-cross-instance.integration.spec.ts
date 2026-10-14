import { ConfigService } from '@nestjs/config';
import { Messages } from '../../../src/common/utils/messages';
import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import type Redis from 'ioredis';
import { LtiSessionService, LtiSessionError } from '../../../src/lti/lti-session.service';
import { LtiStateService } from '../../../src/lti/lti-state.service';
import { LtiConstants } from '../../../src/lti/lti.constants';
import { REDIS_CLIENT } from '../../../src/redis/redis.constants';
import { RedisService } from '../../../src/redis/redis.service';
import { LoggerService } from '../../../src/common/services';
import { educatorSessionPayload } from '../../test-data/lti-session.fixture';

const mockLoggerService = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  verbose: jest.fn(),
  fatal: jest.fn(),
};

interface StoredEntry {
  value: string;
  expiresAt: number;
}

class SharedFakeRedis {
  readonly store = new Map<string, StoredEntry>();

  set(key: string, value: string, _mode: string, ttlSeconds: number): Promise<'OK'> {
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    return Promise.resolve('OK');
  }

  eval(script: string, _numKeys: number, key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return Promise.resolve(null);
    if (script.includes("redis.call('DEL'")) {
      this.store.delete(key);
    }
    return Promise.resolve(Date.now() > entry.expiresAt ? null : entry.value);
  }

  age(ms: number): void {
    for (const entry of this.store.values()) {
      entry.expiresAt -= ms;
    }
  }
}

interface Instance {
  state: LtiStateService;
  session: LtiSessionService;
}

const CONFIGURED = { 'redis.host': 'redis.example.com', 'app.nodeEnv': 'production' };

async function bootInstance(
  client: SharedFakeRedis | null,
  config: Record<string, unknown> = CONFIGURED,
): Promise<Instance> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      RedisService,
      LtiStateService,
      LtiSessionService,
      { provide: REDIS_CLIENT, useValue: client as unknown as Redis | null },
      {
        provide: ConfigService,
        useValue: { get: jest.fn((key: string) => config[key]) },
      },
      { provide: LoggerService, useValue: mockLoggerService },
    ],
  }).compile();

  return {
    state: module.get<LtiStateService>(LtiStateService),
    session: module.get<LtiSessionService>(LtiSessionService),
  };
}

describe('LTI state/session across replicas (integration)', () => {
  let redis: SharedFakeRedis;
  let instanceA: Instance;
  let instanceB: Instance;

  beforeEach(async () => {
    redis = new SharedFakeRedis();
    instanceA = await bootInstance(redis);
    instanceB = await bootInstance(redis);
  });

  describe('state/nonce handoff', () => {
    it('validates on instance B a state created on instance A', async () => {
      await instanceA.state.createStatePair('state-abc', 'nonce-xyz', 'educator');

      await expect(
        instanceB.state.validateAndConsume('state-abc', 'nonce-xyz', 'educator'),
      ).resolves.toMatchObject({ nonce: 'nonce-xyz', toolType: 'educator' });
    });

    it('is one-time use across instances - B consumes, A is then rejected', async () => {
      await instanceA.state.createStatePair('state-abc', 'nonce-xyz', 'educator');
      await instanceB.state.validateAndConsume('state-abc', 'nonce-xyz', 'educator');

      await expect(
        instanceA.state.validateAndConsume('state-abc', 'nonce-xyz', 'educator'),
      ).rejects.toThrow('Invalid or expired state parameter');
    });

    it('rejects on instance B a state that outlived its 10 minute TTL', async () => {
      await instanceA.state.createStatePair('state-abc', 'nonce-xyz', 'educator');
      redis.age((LtiConstants.REDIS.STATE_TTL_SECONDS + 1) * 1000);

      await expect(
        instanceB.state.validateAndConsume('state-abc', 'nonce-xyz', 'educator'),
      ).rejects.toThrow('Invalid or expired state parameter');
    });
  });

  describe('session code handoff', () => {
    it('exchanges on instance B a session created on instance A', async () => {
      const code = await instanceA.session.createSession(educatorSessionPayload());

      const payload = await instanceB.session.consumeSession(code, 'educator');

      expect(payload.audience).toBe('educator');
      expect(payload.userId).toBe('edu-123');
      if (payload.audience === 'educator') {
        expect(payload.accessToken).toBe('test_access_token');
        expect(payload.user).toEqual({ id: 'edu-123', email: 'teacher@example.com' });
      }
    });

    it('is one-time use across instances - B consumes, A is then rejected', async () => {
      const code = await instanceA.session.createSession(educatorSessionPayload());
      await instanceB.session.consumeSession(code, 'educator');

      await expect(instanceA.session.consumeSession(code, 'educator')).rejects.toThrow(
        LtiSessionError,
      );
    });

    it('rejects on instance B a session that outlived its 5 minute TTL', async () => {
      const code = await instanceA.session.createSession(educatorSessionPayload());
      redis.age((LtiConstants.REDIS.SESSION_TTL_SECONDS + 1) * 1000);

      await expect(instanceB.session.consumeSession(code, 'educator')).rejects.toThrow(
        'Invalid or expired session code',
      );
    });
  });

  describe('Redis unavailable', () => {
    it('fails the launch instead of falling back to per-instance memory', async () => {
      const isolated = await bootInstance(null);

      // Surfaces as 503, not as a 400 that reads like a stale launch.
      await expect(
        isolated.state.createStatePair('state-abc', 'nonce-xyz', 'educator'),
      ).rejects.toThrow(ServiceUnavailableException);
      await expect(isolated.session.createSession(educatorSessionPayload())).rejects.toThrow(
        Messages.LTI_STORAGE_UNAVAILABLE,
      );
      expect(redis.store.size).toBe(0);
    });

    it('still refuses to fall back in development once REDIS_HOST is set', async () => {
      const isolated = await bootInstance(null, {
        'redis.host': 'redis.example.com',
        'app.nodeEnv': 'development',
      });

      await expect(isolated.session.createSession(educatorSessionPayload())).rejects.toThrow(
        Messages.LTI_STORAGE_UNAVAILABLE,
      );
    });
  });

  describe('REDIS_HOST unset in development', () => {
    const DEV_NO_REDIS = { 'app.nodeEnv': 'development' };

    it('uses in-memory storage so a local launch works without Redis', async () => {
      const local = await bootInstance(null, DEV_NO_REDIS);

      const code = await local.session.createSession(educatorSessionPayload());
      const payload = await local.session.consumeSession(code, 'educator');

      expect(payload.userId).toBe('edu-123');
      await expect(local.session.consumeSession(code, 'educator')).rejects.toThrow(LtiSessionError);
    });

    it('does NOT share across instances — why it is barred outside development', async () => {
      const instanceC = await bootInstance(null, DEV_NO_REDIS);
      const instanceD = await bootInstance(null, DEV_NO_REDIS);

      const code = await instanceC.session.createSession(educatorSessionPayload());

      await expect(instanceD.session.consumeSession(code, 'educator')).rejects.toThrow(
        LtiSessionError,
      );
    });
  });
});
