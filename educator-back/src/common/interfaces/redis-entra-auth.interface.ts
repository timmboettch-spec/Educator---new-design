import type { TokenCredential } from '@azure/identity';

/** What a managed-mode Redis client needs to keep re-authenticating with Entra ID tokens. */
export interface RedisEntraAuth {
  credential: TokenCredential;
  username: string;
}
