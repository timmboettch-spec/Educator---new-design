import { UnauthorizedException } from '@nestjs/common';
import { aesGcmDecrypt, aesGcmEncrypt, deriveAesKey } from 'src/common/utils/aes-gcm.util';

/** Every payload signed via `generateToken` carries its own expiry — checked on every `verifyToken` call. */
interface TimeBoundPayload {
  exp: number;
}

/**
 * Generic, payload-agnostic time-bound token codec: `generateToken(secret, payload, ttlMs)`
 * encrypts an arbitrary object (plus an `exp` claim) with AES-256-GCM under the given secret, and
 * `verifyToken(secret, token)` decrypts it back, rejecting anything tampered, malformed, or past
 * its `exp`.
 *
 * Deliberately stateless — nothing is persisted for a token to be issued or verified, and no DI
 * container is involved. The caller resolves its own secret (e.g. via `ConfigService`) and passes
 * it in; the only source of truth for what a token means, and whether it's already been consumed,
 * is whatever record the caller's own payload points at.
 */
function resolveCryptoKey(secret: string | undefined): Buffer {
  if (!secret?.trim()) {
    throw new Error(
      'CRYPTO_SECRET is not set — refusing to issue or verify tokens. ' +
      'Generate one with: openssl rand -base64 32',
    );
  }
  return deriveAesKey(secret);
}

/** Encrypts `payload` together with an `exp` (epoch ms) computed from `ttlMs`. */
export function generateToken<T extends object>(
  payload: T,
  ttlMs: number,
  secret?: string,
): string {
  const secretConfig = secret ?? process.env.CRYPTO_SECRET
  const key = resolveCryptoKey(secretConfig);
  const withExpiry: T & TimeBoundPayload = { ...payload, exp: Date.now() + ttlMs };
  return aesGcmEncrypt(key, JSON.stringify(withExpiry));
}

/**
 * Decrypts `token` and returns its payload. Throws `UnauthorizedException` for a tampered,
 * malformed, or expired token — the same error for every failure mode, so callers can't be
 * used to distinguish "forged" from "expired" from the outside.
 */
export function verifyToken<T extends object>(
  token: string,
  secret?: string,
): T & TimeBoundPayload {
  const secretConfig = secret ?? process.env.CRYPTO_SECRET
  const key = resolveCryptoKey(secretConfig);

  let decrypted: string;
  try {
    decrypted = aesGcmDecrypt(key, token);
  } catch {
    throw new UnauthorizedException('Invalid or expired token');
  }

  let payload: T & TimeBoundPayload;
  try {
    payload = JSON.parse(decrypted) as T & TimeBoundPayload;
  } catch {
    throw new UnauthorizedException('Invalid or expired token');
  }

  if (typeof payload?.exp !== 'number' || Date.now() > payload.exp) {
    throw new UnauthorizedException('Invalid or expired token');
  }

  return payload;
}
