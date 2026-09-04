import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

const derivedKeys = new Map<string, Buffer>();

export function deriveAesKey(secret: string): Buffer {
  let derived = derivedKeys.get(secret);
  if (!derived) {
    derived = createHash('sha256').update(secret).digest();
    derivedKeys.set(secret, derived);
  }
  return derived;
}

export function aesGcmEncrypt(key: Buffer, plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    iv.toString('base64url'),
    encrypted.toString('base64url'),
    authTag.toString('base64url'),
  ].join('.');
}

export function aesGcmDecrypt(key: Buffer, payload: string): string {
  const [ivPart, dataPart, tagPart] = payload.split('.');

  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivPart ?? '', 'base64url'));
  decipher.setAuthTag(Buffer.from(tagPart ?? '', 'base64url'));

  return Buffer.concat([
    decipher.update(Buffer.from(dataPart ?? '', 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
