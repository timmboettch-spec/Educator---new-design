import { ManagedIdentityCredential, TokenCredential } from '@azure/identity';

// Scope required to obtain an Entra ID access token usable as the Postgres
// AUTH password against Azure Database for PostgreSQL Flexible Server (see
// infra/modules/postgres.bicep's aadAdminAssignments, which grants the
// caller's identity DB administrator rights ahead of time — mirrors
// src/redis/redis.provider.ts's REDIS_AZURE_SCOPE pattern for the same
// managed identity).
const POSTGRES_AZURE_SCOPE = 'https://ossrdbms-aad.database.windows.net/.default';

// Re-fetch well before actual expiry so a slow token exchange never leaves
// a new pool connection attempting auth with an expired token.
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

interface CachedToken {
  token: string;
  expiresOnTimestamp: number;
}

// node-postgres (pg >= 8.11) accepts `password` as a function returning a
// string/Promise<string>, called on every new pool connection — see
// node_modules/typeorm/driver/postgres/PostgresDriver.js's createPool,
// which merges `options.extra` over the top-level `password`, and
// node_modules/@types/pg's `password?: string | (() => string |
// Promise<string>)`. That per-connection call is what keeps this fresh; no
// manual reconnect/re-auth scheduling is needed the way
// redis.provider.ts's ioredis client requires.
export function createEntraPasswordProvider(clientId?: string): () => Promise<string> {
  const credential: TokenCredential = clientId
    ? new ManagedIdentityCredential({ clientId })
    : new ManagedIdentityCredential();

  let cached: CachedToken | null = null;

  return async function getEntraPassword(): Promise<string> {
    const now = Date.now();
    if (cached && cached.expiresOnTimestamp - TOKEN_REFRESH_MARGIN_MS > now) {
      return cached.token;
    }

    const result = await credential.getToken(POSTGRES_AZURE_SCOPE);
    if (!result) {
      throw new Error(
        'Failed to acquire an Entra ID access token for Postgres (credential returned none).',
      );
    }

    cached = { token: result.token, expiresOnTimestamp: result.expiresOnTimestamp };
    return result.token;
  };
}
