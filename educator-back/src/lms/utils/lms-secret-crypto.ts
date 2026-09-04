import { ValueTransformer } from 'typeorm';
import { aesGcmDecrypt, aesGcmEncrypt, deriveAesKey } from 'src/common/utils/aes-gcm.util';

export const LMS_SECRET_PREFIX = 'enc:v1:';

const CURRENT_KEY_ENV = 'LMS_SECRETS_ENCRYPTION_KEY';
const PREVIOUS_KEY_ENV = 'LMS_SECRETS_ENCRYPTION_KEY_PREVIOUS';

function resolveEncryptionKey(): Buffer {
  const raw = process.env[CURRENT_KEY_ENV]?.trim();
  if (!raw) {
    throw new Error(
      `${CURRENT_KEY_ENV} is not set — refusing to read or write LMS secrets. ` +
        'Generate one with: openssl rand -base64 32',
    );
  }
  return deriveAesKey(raw);
}

function resolvePreviousEncryptionKey(): Buffer | null {
  const raw = process.env[PREVIOUS_KEY_ENV]?.trim();
  return raw ? deriveAesKey(raw) : null;
}

export function isRotationInProgress(): boolean {
  return Boolean(process.env[PREVIOUS_KEY_ENV]?.trim());
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(LMS_SECRET_PREFIX);
}

export function encryptSecret(plaintext: string): string {
  if (!plaintext || isEncrypted(plaintext)) {
    return plaintext;
  }
  return `${LMS_SECRET_PREFIX}${aesGcmEncrypt(resolveEncryptionKey(), plaintext)}`;
}

export function decryptSecret(value: string): string {
  if (!value || !isEncrypted(value)) {
    return value;
  }

  const payload = value.slice(LMS_SECRET_PREFIX.length);

  const currentKey = resolveEncryptionKey();

  try {
    return aesGcmDecrypt(currentKey, payload);
  } catch {
    const previousKey = resolvePreviousEncryptionKey();

    if (!previousKey) {
      throw new Error(
        `Failed to decrypt LMS secret — ${CURRENT_KEY_ENV} does not match the key this ` +
          'value was encrypted with, or the stored value is malformed or corrupt.',
      );
    }

    try {
      return aesGcmDecrypt(previousKey, payload);
    } catch {
      throw new Error(
        `Failed to decrypt LMS secret with either ${CURRENT_KEY_ENV} or ${PREVIOUS_KEY_ENV} — ` +
          'the stored value is malformed, corrupt, or was encrypted with a third key.',
      );
    }
  }
}

export const lmsSecretTransformer: ValueTransformer = {
  to: (value: string | null): string | null => (value ? encryptSecret(value) : value),
  from: (value: string | null): string | null => (value ? decryptSecret(value) : value),
};
