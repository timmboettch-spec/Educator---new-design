import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { LtiStateService } from '../../../src/lti/lti-state.service';

interface StateRecord {
  nonce: string;
  createdAt: number;
  toolType: 'educator' | 'student';
}

function setStateAge(service: LtiStateService, state: string, ageMs: number): void {
  const stateStore = (service as unknown as { stateStore: Map<string, StateRecord> }).stateStore;
  const record = stateStore.get(state);
  if (!record) {
    throw new Error(`State not found: ${state}`);
  }
  record.createdAt = Date.now() - ageMs;
}

describe('LtiStateService', () => {
  let service: LtiStateService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LtiStateService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<LtiStateService>(LtiStateService);
  });

  afterEach(() => {
    // Stop the cleanup timer to prevent Jest from hanging
    service.stopCleanupTimer();
    service.clearAll();
  });

  describe('createStatePair', () => {
    it('should store state/nonce pair for educator tool', () => {
      const state = 'state-uuid-123';
      const nonce = 'nonce-uuid-456';

      service.createStatePair(state, nonce, 'educator');

      expect(service.getStoreSize()).toBe(1);
    });

    it('should store state/nonce pair for student tool', () => {
      const state = 'state-uuid-789';
      const nonce = 'nonce-uuid-012';

      service.createStatePair(state, nonce, 'student');

      expect(service.getStoreSize()).toBe(1);
    });

    it('should store multiple state/nonce pairs', () => {
      service.createStatePair('state1', 'nonce1', 'educator');
      service.createStatePair('state2', 'nonce2', 'student');
      service.createStatePair('state3', 'nonce3', 'educator');

      expect(service.getStoreSize()).toBe(3);
    });

    it('should overwrite existing state if called twice with same state', () => {
      const state = 'state-same';
      service.createStatePair(state, 'nonce1', 'educator');
      service.createStatePair(state, 'nonce2', 'educator');

      expect(service.getStoreSize()).toBe(1);
    });
  });

  describe('validateAndConsume - success cases', () => {
    it('should successfully validate and consume valid educator state/nonce', () => {
      const state = 'state-valid-edu';
      const nonce = 'nonce-valid-edu';

      service.createStatePair(state, nonce, 'educator');
      
      expect(() => {
        service.validateAndConsume(state, nonce, 'educator');
      }).not.toThrow();

      // State should be deleted after consumption
      expect(service.getStoreSize()).toBe(0);
    });

    it('should successfully validate and consume valid student state/nonce', () => {
      const state = 'state-valid-stu';
      const nonce = 'nonce-valid-stu';

      service.createStatePair(state, nonce, 'student');
      
      expect(() => {
        service.validateAndConsume(state, nonce, 'student');
      }).not.toThrow();

      // State should be deleted after consumption
      expect(service.getStoreSize()).toBe(0);
    });

    it('should allow multiple pairs to exist but consume only one', () => {
      service.createStatePair('state1', 'nonce1', 'educator');
      service.createStatePair('state2', 'nonce2', 'student');
      service.createStatePair('state3', 'nonce3', 'educator');

      expect(service.getStoreSize()).toBe(3);

      service.validateAndConsume('state2', 'nonce2', 'student');
      expect(service.getStoreSize()).toBe(2);
    });
  });

  describe('validateAndConsume - missing state parameter', () => {
    it('should throw when state is undefined', () => {
      expect(() => {
        service.validateAndConsume(undefined, 'nonce123', 'educator');
      }).toThrow(UnauthorizedException);
      expect(() => {
        service.validateAndConsume(undefined, 'nonce123', 'educator');
      }).toThrow('Missing state parameter');
    });

    it('should throw when state is empty string', () => {
      expect(() => {
        service.validateAndConsume('', 'nonce123', 'educator');
      }).toThrow(UnauthorizedException);
      expect(() => {
        service.validateAndConsume('', 'nonce123', 'educator');
      }).toThrow('Missing state parameter');
    });

    it('should throw when state is whitespace only', () => {
      expect(() => {
        service.validateAndConsume('   ', 'nonce123', 'educator');
      }).toThrow(UnauthorizedException);
      expect(() => {
        service.validateAndConsume('   ', 'nonce123', 'educator');
      }).toThrow('Missing state parameter');
    });
  });

  describe('validateAndConsume - missing nonce parameter', () => {
    it('should throw when nonce is undefined', () => {
      const state = 'state-valid';
      service.createStatePair(state, 'nonce123', 'educator');

      expect(() => {
        service.validateAndConsume(state, undefined, 'educator');
      }).toThrow(UnauthorizedException);
      expect(() => {
        service.validateAndConsume(state, undefined, 'educator');
      }).toThrow('Missing nonce in id_token');
    });

    it('should throw when nonce is empty string', () => {
      const state = 'state-valid';
      service.createStatePair(state, 'nonce123', 'educator');

      expect(() => {
        service.validateAndConsume(state, '', 'educator');
      }).toThrow(UnauthorizedException);
      expect(() => {
        service.validateAndConsume(state, '', 'educator');
      }).toThrow('Missing nonce in id_token');
    });

    it('should throw when nonce is whitespace only', () => {
      const state = 'state-valid';
      service.createStatePair(state, 'nonce123', 'educator');

      expect(() => {
        service.validateAndConsume(state, '   ', 'educator');
      }).toThrow(UnauthorizedException);
      expect(() => {
        service.validateAndConsume(state, '   ', 'educator');
      }).toThrow('Missing nonce in id_token');
    });
  });

  describe('validateAndConsume - state not found (CSRF protection)', () => {
    it('should throw when state does not exist in store', () => {
      expect(() => {
        service.validateAndConsume('forged-state', 'nonce123', 'educator');
      }).toThrow(UnauthorizedException);
      expect(() => {
        service.validateAndConsume('forged-state', 'nonce123', 'educator');
      }).toThrow('Invalid or expired state parameter');
    });

    it('should throw when attempting to reuse already consumed state', () => {
      const state = 'state-once';
      const nonce = 'nonce-once';

      service.createStatePair(state, nonce, 'educator');
      service.validateAndConsume(state, nonce, 'educator');

      // Second attempt should fail
      expect(() => {
        service.validateAndConsume(state, nonce, 'educator');
      }).toThrow(UnauthorizedException);
      expect(() => {
        service.validateAndConsume(state, nonce, 'educator');
      }).toThrow('Invalid or expired state parameter');
    });
  });

  describe('validateAndConsume - state expiration', () => {
    it('should reject expired state (older than 10 minutes)', () => {
      const state = 'state-old';
      const nonce = 'nonce-old';

      service.createStatePair(state, nonce, 'educator');

      // Manually set createdAt to 11 minutes ago (exceed TTL)
      setStateAge(service, state, 11 * 60 * 1000);

      expect(() => {
        service.validateAndConsume(state, nonce, 'educator');
      }).toThrow(UnauthorizedException);
      expect(() => {
        service.validateAndConsume(state, nonce, 'educator');
      }).toThrow('expired');

      // State should be deleted after expiration check
      expect(service.getStoreSize()).toBe(0);
    });

    it('should accept state that is just under TTL (9 minutes old)', () => {
      const state = 'state-fresh';
      const nonce = 'nonce-fresh';

      service.createStatePair(state, nonce, 'educator');

      // Set createdAt to 9 minutes ago (within TTL)
      setStateAge(service, state, 9 * 60 * 1000);

      expect(() => {
        service.validateAndConsume(state, nonce, 'educator');
      }).not.toThrow();
    });
  });

  describe('validateAndConsume - tool type mismatch', () => {
    it('should reject educator state used for student tool', () => {
      const state = 'state-edu';
      const nonce = 'nonce-edu';

      service.createStatePair(state, nonce, 'educator');

      expect(() => {
        service.validateAndConsume(state, nonce, 'student');
      }).toThrow('tool type mismatch');

      // State should be deleted after mismatch
      expect(service.getStoreSize()).toBe(0);
    });

    it('should reject student state used for educator tool', () => {
      const state = 'state-stu';
      const nonce = 'nonce-stu';

      service.createStatePair(state, nonce, 'student');

      expect(() => {
        service.validateAndConsume(state, nonce, 'educator');
      }).toThrow('tool type mismatch');

      // State should be deleted after mismatch
      expect(service.getStoreSize()).toBe(0);
    });
  });

  describe('validateAndConsume - nonce mismatch (replay protection)', () => {
    it('should reject when nonce does not match stored nonce', () => {
      const state = 'state-valid';
      const storedNonce = 'nonce-original';
      const wrongNonce = 'nonce-forged';

      service.createStatePair(state, storedNonce, 'educator');

      expect(() => {
        service.validateAndConsume(state, wrongNonce, 'educator');
      }).toThrow('Nonce mismatch');

      // State should be deleted after nonce mismatch
      expect(service.getStoreSize()).toBe(0);
    });

    it('should be case-sensitive for nonce matching', () => {
      const state = 'state-case';
      const storedNonce = 'Nonce-CaseSensitive';
      const wrongCaseNonce = 'nonce-casesensitive';

      service.createStatePair(state, storedNonce, 'educator');

      expect(() => {
        service.validateAndConsume(state, wrongCaseNonce, 'educator');
      }).toThrow('Nonce mismatch');
    });
  });

  describe('clearAll', () => {
    it('should clear all entries', () => {
      service.createStatePair('state1', 'nonce1', 'educator');
      service.createStatePair('state2', 'nonce2', 'student');
      service.createStatePair('state3', 'nonce3', 'educator');

      expect(service.getStoreSize()).toBe(3);

      service.clearAll();

      expect(service.getStoreSize()).toBe(0);
    });

    it('should allow new entries after clearing', () => {
      service.createStatePair('state1', 'nonce1', 'educator');
      service.clearAll();

      expect(service.getStoreSize()).toBe(0);

      service.createStatePair('state2', 'nonce2', 'educator');
      expect(service.getStoreSize()).toBe(1);
    });
  });

  describe('getStoreSize', () => {
    it('should return 0 for empty store', () => {
      expect(service.getStoreSize()).toBe(0);
    });

    it('should return correct size as entries are added', () => {
      expect(service.getStoreSize()).toBe(0);
      service.createStatePair('state1', 'nonce1', 'educator');
      expect(service.getStoreSize()).toBe(1);
      service.createStatePair('state2', 'nonce2', 'student');
      expect(service.getStoreSize()).toBe(2);
    });

    it('should return correct size as entries are consumed', () => {
      service.createStatePair('state1', 'nonce1', 'educator');
      service.createStatePair('state2', 'nonce2', 'student');
      expect(service.getStoreSize()).toBe(2);

      service.validateAndConsume('state1', 'nonce1', 'educator');
      expect(service.getStoreSize()).toBe(1);

      service.validateAndConsume('state2', 'nonce2', 'student');
      expect(service.getStoreSize()).toBe(0);
    });
  });
});
