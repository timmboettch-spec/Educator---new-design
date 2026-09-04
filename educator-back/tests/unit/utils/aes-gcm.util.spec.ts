import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { aesGcmEncrypt, aesGcmDecrypt, deriveAesKey } from '../../../src/common/utils/aes-gcm.util';

function legacyEncrypt(secret: string, plaintext: string): string {
  const key = createHash('sha256').update(secret).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${encrypted.toString('base64url')}.${authTag.toString('base64url')}`;
}

function legacyDecrypt(secret: string, value: string): string {
  const [ivPart, cipherPart, tagPart] = value.split('.');
  const key = createHash('sha256').update(secret).digest();
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivPart, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(cipherPart, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

describe('AES-GCM utility', () => {
  const SECRET = 'some-shared-secret';

  describe('round-trip', () => {
    it('encrypts and decrypts a value', () => {
      const key = deriveAesKey(SECRET);

      expect(aesGcmDecrypt(key, aesGcmEncrypt(key, 'REP-PH9N'))).toBe('REP-PH9N');
    });

    it('produces a different payload each time', () => {
      const key = deriveAesKey(SECRET);

      expect(aesGcmEncrypt(key, 'x')).not.toBe(aesGcmEncrypt(key, 'x'));
    });

    it('emits exactly three base64url segments', () => {
      const parts = aesGcmEncrypt(deriveAesKey(SECRET), 'value').split('.');

      expect(parts).toHaveLength(3);
      parts.forEach((p) => expect(p).toMatch(/^[A-Za-z0-9_-]+$/));
    });
  });

  describe('wire-format compatibility with the pre-refactor implementation', () => {
    it('decrypts a value produced by the legacy implementation', () => {
      const legacy = legacyEncrypt(SECRET, 'REP-PH9N');

      expect(aesGcmDecrypt(deriveAesKey(SECRET), legacy)).toBe('REP-PH9N');
    });

    it('produces a value the legacy implementation can decrypt', () => {
      const fresh = aesGcmEncrypt(deriveAesKey(SECRET), 'REP-PH9N');

      expect(legacyDecrypt(SECRET, fresh)).toBe('REP-PH9N');
    });

    it('derives the identical key bytes', () => {
      expect(deriveAesKey(SECRET)).toEqual(createHash('sha256').update(SECRET).digest());
    });
  });

  describe('failure modes', () => {
    it('throws on the wrong key', () => {
      const encrypted = aesGcmEncrypt(deriveAesKey(SECRET), 'secret');

      expect(() => aesGcmDecrypt(deriveAesKey('other-secret'), encrypted)).toThrow();
    });

    it('throws on a tampered payload', () => {
      const [iv, , tag] = aesGcmEncrypt(deriveAesKey(SECRET), 'secret').split('.');
      const tampered = `${iv}.${Buffer.from('evil').toString('base64url')}.${tag}`;

      expect(() => aesGcmDecrypt(deriveAesKey(SECRET), tampered)).toThrow();
    });

    it('throws on a malformed payload instead of returning garbage', () => {
      expect(() => aesGcmDecrypt(deriveAesKey(SECRET), 'not-a-payload')).toThrow();
    });
  });

  describe('deriveAesKey memoization', () => {
    it('returns the same buffer instance for a repeated secret', () => {
      expect(deriveAesKey('repeat-me')).toBe(deriveAesKey('repeat-me'));
    });

    it('returns different keys for different secrets', () => {
      expect(deriveAesKey('key-a')).not.toEqual(deriveAesKey('key-b'));
    });
  });
});
