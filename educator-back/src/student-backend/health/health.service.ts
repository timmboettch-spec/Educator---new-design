import { BlobServiceClient } from '@azure/storage-blob';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from 'src/redis/redis.service';

/** Timeout (ms) for the Redis ping health check. */
// const REDIS_HEALTH_CHECK_TIMEOUT_MS = 1500;
/** Timeout (ms) for the Azure Blob Storage health check. */
const AZURE_BLOB_HEALTH_CHECK_TIMEOUT_MS = 4000;

type HealthStatus = 'ok' | 'error';

@Injectable()
export class HealthService {
  private readonly startedAt = Date.now();

  constructor(
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {}

  liveness() {
    return {
      status: 'ok' as HealthStatus,
      uptimeMs: Date.now() - this.startedAt,
      timestamp: new Date().toISOString(),
    };
  }

  async readiness() {
    const checks: Record<string, { status: HealthStatus; error?: string; skipped?: boolean }> = {};

    // try {
    //   await this.redisService.ping({ timeoutMs: REDIS_HEALTH_CHECK_TIMEOUT_MS });
    //   checks.redis = { status: 'ok' };
    // } catch (err: unknown) {
    //   const message = err instanceof Error ? err.message : String(err);
    //   checks.redis = { status: 'error', error: message };
    // }

    checks.azureBlob = await this.checkAzureBlob();

    const allOk = Object.values(checks).every((c) => c.status === 'ok');

    return {
      status: allOk ? 'ok' : 'error',
      uptimeMs: Date.now() - this.startedAt,
      timestamp: new Date().toISOString(),
      checks,
    };
  }

  private async checkAzureBlob(): Promise<{
    status: HealthStatus;
    error?: string;
    skipped?: boolean;
  }> {
    const conn = this.configService.get<string>('AZURE_STORAGE_CONNECTION_STRING') ?? '';
    if (!conn.trim()) {
      return { status: 'ok', skipped: true };
    }

    const containerName =
      this.configService.get<string>('AZURE_BLOB_CONTAINER_NAME') ??
      this.configService.get<string>('AZURE_STORAGE_CONTAINER_NAME') ??
      'json-data';

    try {
      const blobServiceClient = BlobServiceClient.fromConnectionString(conn.trim());
      const containerClient = blobServiceClient.getContainerClient(containerName);
      await Promise.race([
        containerClient.getProperties(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('Azure blob check timed out')),
            AZURE_BLOB_HEALTH_CHECK_TIMEOUT_MS,
          ),
        ),
      ]);
      return { status: 'ok' };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { status: 'error', error: message };
    }
  }
}
