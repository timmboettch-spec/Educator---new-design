import { LoggerService } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ManagedIdentityCredential, TokenCredential } from '@azure/identity';
import Redis from 'ioredis';
import { RedisEntraAuth } from '../common/interfaces/redis-entra-auth.interface';
import { isInMemoryAllowed } from './redis.constants';

// Scope required to obtain an Entra ID access token usable as the Redis AUTH
// password against Azure Managed Redis (see infra/modules/redisCache.bicep —
// the `accessPolicyAssignments` child resource grants the backend's
// system-assigned managed identity this data-plane access ahead of time).
const REDIS_AZURE_SCOPE = 'https://redis.azure.com/.default';

// Re-authenticate this long before actual expiry so a slow refresh (or a
// transient credential-endpoint hiccup) never leaves the client holding an
// expired token. Configurable via REDIS_TOKEN_REFRESH_BUFFER_MS for tuning
// without a code change.
const DEFAULT_TOKEN_REFRESH_MARGIN_MS = 40 * 60 * 1000;
const TOKEN_REFRESH_MIN_DELAY_MS = 30_000;
const TOKEN_REFRESH_MAX_BACKOFF_MS = 5 * 60 * 1000;

// Managed-mode clients (base and duplicates) and the Entra credentials that refresh them.
const managedAuthByClient = new WeakMap<Redis, RedisEntraAuth>();

function scheduleEntraTokenRefresh(
  client: Redis,
  credential: TokenCredential,
  username: string,
  logger: LoggerService,
  backoffAttempt = 0,
): void {
  const delay =
    backoffAttempt > 0
      ? Math.min(TOKEN_REFRESH_MIN_DELAY_MS * 2 ** backoffAttempt, TOKEN_REFRESH_MAX_BACKOFF_MS)
      : DEFAULT_TOKEN_REFRESH_MARGIN_MS;

  const timer = setTimeout(() => {
    void (async (): Promise<void> => {
      try {
        const token = await credential.getToken(REDIS_AZURE_SCOPE);
        if (!token) {
          throw new Error('credential returned no token');
        }

        try {
          await client.auth(username, token.token);
          // Reconnects (and duplicates) re-AUTH from `options`, so keep it current.
          client.options.password = token.token;
          logger.log(
            '[Redis] Entra ID token refreshed and re-authenticated on the existing connection.',
          );
        } catch (authErr) {
          // ioredis always supports live .auth(); this fallback only matters
          // if a future client/version drops that support.
          logger.warn(
            `[Redis] Live re-AUTH failed — falling back to a full reconnect. Reason: ${authErr instanceof Error ? authErr.message : String(authErr)
            }`,
          );
          client.options.username = username;
          client.options.password = token.token;
          client.disconnect(true);
        }

        scheduleEntraTokenRefresh(client, credential, username, logger);
      } catch (err) {
        logger.error(err);
        scheduleEntraTokenRefresh(client, credential, username, logger, backoffAttempt + 1);
      }
    })();
  }, delay);

  // Don't hold the process open just for this refresh, and stop rescheduling
  // once the underlying connection is gone for good.
  timer.unref();
  client.once('end', () => clearTimeout(timer));
}

async function createManagedRedisClient(
  configService: ConfigService,
  host: string,
  port: number,
  logger: LoggerService,
): Promise<Redis | null> {
  // Azure Managed Redis, authenticated via Entra ID using this app's
  // user-assigned Managed Identity (the same UAI attached in
  // containerApp-backend.bicep and granted data-plane access in
  // redisCache.bicep's accessPolicyAssignments) — no static password. The
  // "username" AUTH expects is that identity's object (principal) ID, read
  // from REDIS_USERNAME rather than derived from the token at runtime, so
  // it stays predictable across restarts. AZURE_CLIENT_ID (already wired for
  // TelemetryAnalyticsService) selects which identity ManagedIdentityCredential
  // targets — without it, the credential would target a system-assigned
  // identity, which this app doesn't have.
  const username = configService.get<string>('redis.username');
  if (!username) {
    logger.error(
      "[Redis] IS_MANAGED_REDIS=true but REDIS_USERNAME (the managed identity's object ID) " +
      'is not set — Redis disabled, falling back to in-memory cache.',
    );
    return null;
  }

  const clientId = configService.get<string>('telemetry.azureClientId');
  const credential = clientId
    ? new ManagedIdentityCredential({ clientId })
    : new ManagedIdentityCredential();
  let token: Awaited<ReturnType<TokenCredential['getToken']>>;
  try {
    token = await credential.getToken(REDIS_AZURE_SCOPE);
  } catch (err) {
    logger.error(err);
    return null;
  }
  if (!token) {
    logger.error(
      '[Redis] Failed to acquire an Entra ID token for Redis (credential returned none) — Redis disabled, falling back to in-memory cache.',
    );
    return null;
  }

  logger.log(
    `[Redis] Startup token acquired for scope ${REDIS_AZURE_SCOPE} via ${clientId ? 'user-assigned' : 'system-assigned'
    } Managed Identity.`,
  );

  const client = new Redis({
    host,
    port,
    username,
    password: token.token,
    tls: {}, // Entra ID auth on Azure Managed Redis always requires TLS.
    retryStrategy: (times: number): number => Math.min(times * 500, 30_000),
    reconnectOnError: (): boolean => true,
    enableOfflineQueue: false,
    connectTimeout: 120_000,
  });

  client.on('error', (err: Error) => {
    logger.error(err);
  });

  managedAuthByClient.set(client, { credential, username });
  client.on('connect', () => {
    logger.log('Redis connected');
    scheduleEntraTokenRefresh(client, credential, username, logger);
  });

  logger.log(
    '[Redis] Mode: managed (system-assigned) — Azure Managed Redis via Entra ID System-assigned Managed Identity.',
  );
  return client;
}

function createAccessKeyRedisClient(
  configService: ConfigService,
  host: string,
  port: number,
  logger: LoggerService,
): Redis {
  // Static access-key auth — the pre-existing behavior, unchanged unless
  // IS_MANAGED_REDIS is explicitly set to 'true'.
  const password = configService.get<string>('redis.password');
  const tlsEnabled = configService.get<boolean>('redis.tls') ?? false;

  logger.log('[Redis] Mode: local — access-key/password authentication.');

  return new Redis({
    host,
    port,
    password: password || undefined,
    tls: tlsEnabled ? {} : undefined,
    retryStrategy: (times: number): number => Math.min(times * 500, 30_000),
    reconnectOnError: (): boolean => true,
    enableOfflineQueue: false,
  });
}

export async function createRedisClient(
  configService: ConfigService,
  logger: LoggerService,
): Promise<Redis | null> {
  const host = configService.get<string>('redis.host');
  const port = configService.get<number>('redis.port', 6379);

  if (!host) {
    const nodeEnv = configService.get<string>('app.nodeEnv');
    if (!isInMemoryAllowed(nodeEnv)) {
      throw new Error(
        `[Redis] REDIS_HOST is required when NODE_ENV="${nodeEnv ?? 'unset'}". ` +
        'In-memory LTI state/session storage is permitted in development only.',
      );
    }

    logger.warn(
      `[Redis] REDIS_HOST unset — LTI state/session will use in-memory storage ` +
      `(NODE_ENV="${nodeEnv ?? 'development'}"). Single replica only; never use this deployed.`,
    );
    return null;
  }

  // IS_MANAGED_REDIS toggles between the two Azure Managed Redis auth modes:
  // 'false'/unset (default) keeps the existing access-key/password flow
  // untouched; 'true' switches to Entra ID auth via the System-assigned
  // Managed Identity, with no other code path changing.
  const isManagedRedis = configService.get<boolean>('redis.isManaged');

  if (isManagedRedis) {
    return createManagedRedisClient(configService, host, port, logger);
  }

  return createAccessKeyRedisClient(configService, host, port, logger);
}

/**
 * Copies the base client for a long-lived extra connection (e.g. pub/sub). Unlike the base
 * client, the copy queues commands while connecting, so a boot-time subscribe doesn't fail.
 * In managed (Entra) mode the copy is refreshed on the same schedule and trigger as the base.
 */
export function duplicateRedisClient(client: Redis, logger: LoggerService): Redis {
  const copy = client.duplicate({ enableOfflineQueue: true });
  copy.on('error', (err: Error) => {
    logger.error(err);
  });

  const auth = managedAuthByClient.get(client);
  if (auth) {
    managedAuthByClient.set(copy, auth);
    copy.on('connect', () => {
      scheduleEntraTokenRefresh(copy, auth.credential, auth.username, logger);
    });
  }
  return copy;
}
