import { createPrivateKey, createPublicKey, randomUUID } from 'crypto';
import { exportJWK, exportPKCS8, generateKeyPair } from 'jose';

export interface PlatformKeyPair {
  platformKeyId: string;
  platformPrivateKeyPem: string;
}

export function normalizePem(pem: string): string {
  return pem.replace(/\\n/g, '\n').trim();
}

export async function generatePlatformKeyPair(): Promise<PlatformKeyPair> {
  const platformKeyId = `edu-portal-${randomUUID().slice(0, 8)}`;
  const { privateKey } = await generateKeyPair('RS256', { modulusLength: 2048 });
  const platformPrivateKeyPem = await exportPKCS8(privateKey);
  return { platformKeyId, platformPrivateKeyPem };
}

export async function publicJwkFromPrivatePem(
  pem: string,
  kid: string,
): Promise<Record<string, unknown>> {
  // Derive public key from PEM via Node crypto so only public material (kty, n, e) is exported
  const privateKey = createPrivateKey(normalizePem(pem));
  const publicKey = createPublicKey(privateKey);
  const publicJwk = await exportJWK(publicKey);

  // Return only public fields with LTI metadata
  return {
    kty: publicJwk.kty,
    n: publicJwk.n,
    e: publicJwk.e,
    kid: kid.trim(),
    alg: 'RS256',
    use: 'sig',
  };
}
