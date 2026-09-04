import {
  encryptSecret,
  decryptSecret,
  isEncrypted,
  lmsSecretTransformer,
  LMS_SECRET_PREFIX,
  isRotationInProgress,
} from '../../../src/lms/utils/lms-secret-crypto';
import { randomBytes } from 'crypto';

const KEY = randomBytes(32).toString('base64');
const OTHER_KEY = randomBytes(32).toString('base64');

describe('LMS Secret Crypto', () => {
  const originalKey = process.env.LMS_SECRETS_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.LMS_SECRETS_ENCRYPTION_KEY = KEY;
    delete process.env.LMS_SECRETS_ENCRYPTION_KEY_PREVIOUS;
  });

  afterAll(() => {
    if (originalKey === undefined) {
      delete process.env.LMS_SECRETS_ENCRYPTION_KEY;
    } else {
      process.env.LMS_SECRETS_ENCRYPTION_KEY = originalKey;
    }
  });

  describe('encryptSecret / decryptSecret', () => {
    it('round-trips a value', () => {
      const plaintext = 'moodle-ws-token-abc123';
      const encrypted = encryptSecret(plaintext);

      expect(encrypted).not.toBe(plaintext);
      expect(encrypted).not.toContain(plaintext);
      expect(decryptSecret(encrypted)).toBe(plaintext);
    });

    it('round-trips a multi-line PEM', () => {
      const pem = '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADAN\nBgkq\n-----END PRIVATE KEY-----\n';

      expect(decryptSecret(encryptSecret(pem))).toBe(pem);
    });

    it('produces a different ciphertext each time (random IV)', () => {
      const plaintext = 'same-input';

      expect(encryptSecret(plaintext)).not.toBe(encryptSecret(plaintext));
    });

    it('tags encrypted values with the versioned prefix', () => {
      expect(encryptSecret('anything').startsWith(LMS_SECRET_PREFIX)).toBe(true);
    });

    it('does not double-encrypt an already-encrypted value', () => {
      const once = encryptSecret('token');

      expect(encryptSecret(once)).toBe(once);
      expect(decryptSecret(encryptSecret(once))).toBe('token');
    });

    it('passes legacy plaintext through untouched on read', () => {
      expect(decryptSecret('legacy-plaintext-token')).toBe('legacy-plaintext-token');
    });

    it('leaves empty values alone in both directions', () => {
      expect(encryptSecret('')).toBe('');
      expect(decryptSecret('')).toBe('');
    });

    it('throws when the ciphertext was tampered with', () => {
      const encrypted = encryptSecret('sensitive');
      const [prefixedIv, data, tag] = encrypted.split('.');
      const tampered = `${prefixedIv}.${Buffer.from('evil').toString('base64url')}.${tag}`;

      expect(() => decryptSecret(tampered)).toThrow(/Failed to decrypt/);
    });

    it('throws when decrypting with the wrong key', () => {
      const encrypted = encryptSecret('sensitive');
      process.env.LMS_SECRETS_ENCRYPTION_KEY = OTHER_KEY;

      expect(() => decryptSecret(encrypted)).toThrow(/Failed to decrypt/);
    });

    it('throws when the value is malformed', () => {
      expect(() => decryptSecret(`${LMS_SECRET_PREFIX}not-a-valid-payload`)).toThrow(
        /Failed to decrypt/,
      );
    });
  });

  describe('key resolution', () => {
    it('throws when LMS_SECRETS_ENCRYPTION_KEY is unset', () => {
      delete process.env.LMS_SECRETS_ENCRYPTION_KEY;

      expect(() => encryptSecret('token')).toThrow(/LMS_SECRETS_ENCRYPTION_KEY/);
      expect(() => decryptSecret(`${LMS_SECRET_PREFIX}a.b.c`)).toThrow(
        /LMS_SECRETS_ENCRYPTION_KEY/,
      );
    });

    it('throws when LMS_SECRETS_ENCRYPTION_KEY is blank', () => {
      process.env.LMS_SECRETS_ENCRYPTION_KEY = '   ';

      expect(() => encryptSecret('token')).toThrow(/LMS_SECRETS_ENCRYPTION_KEY/);
    });

    it('never falls back to JWT_SECRET', () => {
      delete process.env.LMS_SECRETS_ENCRYPTION_KEY;
      process.env.JWT_SECRET = 'some-jwt-secret';

      expect(() => encryptSecret('token')).toThrow(/LMS_SECRETS_ENCRYPTION_KEY/);
    });
  });

  describe('isEncrypted', () => {
    it('recognises encrypted and plaintext values', () => {
      expect(isEncrypted(encryptSecret('x'))).toBe(true);
      expect(isEncrypted('plaintext')).toBe(false);
      expect(isEncrypted('')).toBe(false);
    });
  });

  describe('lmsSecretTransformer', () => {
    it('round-trips through the TypeORM transformer hooks', () => {
      const stored = lmsSecretTransformer.to('ws-token');

      expect(stored).not.toBe('ws-token');
      expect(lmsSecretTransformer.from(stored)).toBe('ws-token');
    });

    it('preserves null so nullable columns stay null', () => {
      expect(lmsSecretTransformer.to(null)).toBeNull();
      expect(lmsSecretTransformer.from(null)).toBeNull();
    });

    it('reads legacy plaintext rows during rollout', () => {
      expect(lmsSecretTransformer.from('legacy-token')).toBe('legacy-token');
    });
  });

  describe('key rotation', () => {
    const OLD_KEY = randomBytes(32).toString('base64');
    const NEW_KEY = randomBytes(32).toString('base64');

    function encryptedUnderOldKey(plaintext: string): string {
      process.env.LMS_SECRETS_ENCRYPTION_KEY = OLD_KEY;
      const value = encryptSecret(plaintext);
      process.env.LMS_SECRETS_ENCRYPTION_KEY = NEW_KEY;
      return value;
    }

    it('reads a row encrypted with the previous key during rotation', () => {
      const legacy = encryptedUnderOldKey('pre-rotation-token');
      process.env.LMS_SECRETS_ENCRYPTION_KEY_PREVIOUS = OLD_KEY;

      expect(decryptSecret(legacy)).toBe('pre-rotation-token');
    });

    it('still reads rows written with the current key during rotation', () => {
      process.env.LMS_SECRETS_ENCRYPTION_KEY = NEW_KEY;
      process.env.LMS_SECRETS_ENCRYPTION_KEY_PREVIOUS = OLD_KEY;
      const fresh = encryptSecret('post-rotation-token');

      expect(decryptSecret(fresh)).toBe('post-rotation-token');
    });

    it('always encrypts with the current key, never the previous one', () => {
      const legacy = encryptedUnderOldKey('value');
      process.env.LMS_SECRETS_ENCRYPTION_KEY_PREVIOUS = OLD_KEY;

      const reEncrypted = encryptSecret(decryptSecret(legacy));
      delete process.env.LMS_SECRETS_ENCRYPTION_KEY_PREVIOUS;

      expect(decryptSecret(reEncrypted)).toBe('value');
    });

    it('fails once the previous key is removed, if the row was never re-encrypted', () => {
      const legacy = encryptedUnderOldKey('orphaned');

      expect(() => decryptSecret(legacy)).toThrow(/Failed to decrypt/);
    });

    it('reports both keys in the error when neither works', () => {
      process.env.LMS_SECRETS_ENCRYPTION_KEY_PREVIOUS = randomBytes(32).toString('base64');
      const stranded = encryptedUnderOldKey('unreachable');

      expect(() => decryptSecret(stranded)).toThrow(
        /LMS_SECRETS_ENCRYPTION_KEY or LMS_SECRETS_ENCRYPTION_KEY_PREVIOUS/,
      );
    });

    it('a missing current key is still a config error, not a decrypt error', () => {
      const legacy = encryptedUnderOldKey('x');
      process.env.LMS_SECRETS_ENCRYPTION_KEY_PREVIOUS = OLD_KEY;
      delete process.env.LMS_SECRETS_ENCRYPTION_KEY;

      expect(() => decryptSecret(legacy)).toThrow(/LMS_SECRETS_ENCRYPTION_KEY is not set/);
    });

    it('isRotationInProgress reflects whether the previous key is set', () => {
      expect(isRotationInProgress()).toBe(false);

      process.env.LMS_SECRETS_ENCRYPTION_KEY_PREVIOUS = OLD_KEY;
      expect(isRotationInProgress()).toBe(true);

      process.env.LMS_SECRETS_ENCRYPTION_KEY_PREVIOUS = '   ';
      expect(isRotationInProgress()).toBe(false);
    });
  });
});
