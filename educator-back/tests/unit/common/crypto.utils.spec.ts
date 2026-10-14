import { UnauthorizedException } from '@nestjs/common';
import { generateToken, verifyToken } from 'src/common/utils/crypto.utils';

/** Flips every bit of the first byte so the decoded value is guaranteed to differ. */
const flipFirstByte = (part: string): string => {
  const bytes = Buffer.from(part, 'base64url');
  bytes[0] ^= 0xff;
  return bytes.toString('base64url');
};

describe('crypto.utils', () => {
  const secret = 'test-crypto-secret';

  it('UNIT: round-trips an arbitrary payload', () => {
    const token = generateToken({ inviteId: 'invite-uuid' }, 60_000, secret);
    const payload = verifyToken<{ inviteId: string }>(token, secret);
    expect(payload.inviteId).toBe('invite-uuid');
    expect(typeof payload.exp).toBe('number');
  });

  it('UNIT: rejects a tampered ciphertext', () => {
    const token = generateToken({ inviteId: 'invite-uuid' }, 60_000, secret);
    const [iv, ciphertext, tag] = token.split('.');
    const tampered = [iv, flipFirstByte(ciphertext), tag].join('.');
    expect(() => verifyToken(tampered, secret)).toThrow(UnauthorizedException);
  });

  it('UNIT: rejects a tampered auth tag', () => {
    const token = generateToken({ inviteId: 'invite-uuid' }, 60_000, secret);
    const [iv, ciphertext, tag] = token.split('.');
    const tampered = [iv, ciphertext, flipFirstByte(tag)].join('.');
    expect(() => verifyToken(tampered, secret)).toThrow(UnauthorizedException);
  });

  it('UNIT: rejects a payload past its exp', () => {
    const token = generateToken({ inviteId: 'invite-uuid' }, -1, secret);
    expect(() => verifyToken(token, secret)).toThrow(UnauthorizedException);
  });

  it('UNIT: rejects garbage input', () => {
    expect(() => verifyToken('not-a-real-token', secret)).toThrow(UnauthorizedException);
  });

  it('UNIT: throws a plain Error when the secret is not configured', () => {
    const originalSecret = process.env.CRYPTO_SECRET;
    delete process.env.CRYPTO_SECRET;
    expect(() => generateToken({ inviteId: 'x' }, 1000)).toThrow('CRYPTO_SECRET is not set');
    process.env.CRYPTO_SECRET = originalSecret;
  });
});
