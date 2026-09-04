import { publicJwkFromPrivatePem, generatePlatformKeyPair } from '../../../src/lms/utils/lms-key.util';

describe('LMS Key Utility', () => {
  describe('publicJwkFromPrivatePem', () => {
    let testPrivateKeyPem: string;
    let testKid: string;

    beforeAll(async () => {
      // Generate a test key pair
      const keyPair = await generatePlatformKeyPair();
      testPrivateKeyPem = keyPair.platformPrivateKeyPem;
      testKid = keyPair.platformKeyId;
    });

    it('should export only public JWK fields (no private key material)', async () => {
      const jwk = await publicJwkFromPrivatePem(testPrivateKeyPem, testKid);

      // Must have public RSA fields
      expect(jwk.kty).toBe('RSA');
      expect(typeof jwk.n).toBe('string');
      expect(typeof jwk.e).toBe('string');
      expect(jwk.kid).toBe(testKid);
      expect(jwk.alg).toBe('RS256');
      expect(jwk.use).toBe('sig');

      // Must NOT have private key fields
      expect(jwk).not.toHaveProperty('d');   // Private exponent
      expect(jwk).not.toHaveProperty('p');   // First prime factor
      expect(jwk).not.toHaveProperty('q');   // Second prime factor
      expect(jwk).not.toHaveProperty('dp');  // First factor CRT exponent
      expect(jwk).not.toHaveProperty('dq');  // Second factor CRT exponent
      expect(jwk).not.toHaveProperty('qi');  // First CRT coefficient

      // Must have exactly the expected keys (no extras)
      const expectedKeys = ['kty', 'n', 'e', 'kid', 'alg', 'use'];
      const actualKeys = Object.keys(jwk).sort();
      expect(actualKeys).toEqual(expectedKeys.sort());
    });

    it('should handle kid with whitespace', async () => {
      const jwk = await publicJwkFromPrivatePem(testPrivateKeyPem, '  test-kid-123  ');
      expect(jwk.kid).toBe('test-kid-123');
    });

    it('should reject invalid PEM', async () => {
      await expect(
        publicJwkFromPrivatePem('not-a-valid-pem', 'test-kid')
      ).rejects.toThrow();
    });

    it('should normalize PEM with escaped newlines', async () => {
      // Some configs store PEM with literal \n strings instead of actual newlines
      const escapedPem = testPrivateKeyPem.replace(/\n/g, '\\n');
      const jwk = await publicJwkFromPrivatePem(escapedPem, testKid);
      
      expect(jwk.kty).toBe('RSA');
      expect(jwk).not.toHaveProperty('d');
    });
  });

  describe('generatePlatformKeyPair', () => {
    it('should generate a valid key pair with kid prefix', async () => {
      const keyPair = await generatePlatformKeyPair();
      
      expect(keyPair.platformKeyId).toMatch(/^edu-portal-[a-f0-9]{8}$/);
      expect(keyPair.platformPrivateKeyPem).toContain('BEGIN PRIVATE KEY');
      expect(keyPair.platformPrivateKeyPem).toContain('END PRIVATE KEY');
    });

    it('should generate unique kids', async () => {
      const kp1 = await generatePlatformKeyPair();
      const kp2 = await generatePlatformKeyPair();
      
      expect(kp1.platformKeyId).not.toBe(kp2.platformKeyId);
    });
  });
});
