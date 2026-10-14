import { BlobServiceClient } from '@azure/storage-blob';
import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { RedisService } from 'src/redis/redis.service';

type HealthStatus = 'ok' | 'error';

interface CheckResult {
  status: HealthStatus;
  error?: string;
  skipped?: boolean;
  soft?: boolean;
}

@Injectable()
export class HealthService {
  private readonly startedAt = Date.now();

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    @Optional() private readonly redisService?: RedisService,
  ) {}

  liveness(): { status: HealthStatus; uptimeMs: number; timestamp: string } {
    return {
      status: 'ok',
      uptimeMs: Date.now() - this.startedAt,
      timestamp: new Date().toISOString(),
    };
  }

  async readiness(): Promise<{
    status: HealthStatus;
    uptimeMs: number;
    timestamp: string;
    checks: Record<string, Omit<CheckResult, 'soft'>>;
  }> {
    const [database, azureBlob, redis] = await Promise.all([
      this.checkDatabase(),
      this.checkAzureBlob(),
      this.checkRedis(),
    ]);

    const allChecks: Record<string, CheckResult> = { database, azureBlob, redis };

    const criticalFailed = Object.values(allChecks).some((c) => c.status === 'error' && !c.soft);

    const checks: Record<string, Omit<CheckResult, 'soft'>> = {};
    for (const [key, value] of Object.entries(allChecks)) {
      const { soft: _, ...rest } = value;
      void _;
      checks[key] = rest;
    }

    return {
      status: criticalFailed ? 'error' : 'ok',
      uptimeMs: Date.now() - this.startedAt,
      timestamp: new Date().toISOString(),
      checks,
    };
  }

  private async checkRedis(): Promise<CheckResult> {
    if (!this.redisService) {
      return { status: 'ok', skipped: true, soft: true };
    }
    try {
      const healthy = await Promise.race([
        this.redisService.isHealthy(),
        new Promise<never>((_, reject) => {
          const t = setTimeout(() => reject(new Error('Redis check timed out')), 800);
          t.unref();
        }),
      ]);
      return healthy
        ? { status: 'ok', soft: true }
        : { status: 'error', error: 'PING returned unexpected response', soft: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { status: 'error', error: message, soft: true };
    }
  }

  private async checkDatabase(): Promise<CheckResult> {
    try {
      await Promise.race([
        this.dataSource.query('SELECT 1'),
        new Promise<never>((_, reject) => {
          const t = setTimeout(() => reject(new Error('Database check timed out')), 800);
          t.unref();
        }),
      ]);
      return { status: 'ok' };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { status: 'error', error: message };
    }
  }

  private async checkAzureBlob(): Promise<CheckResult> {
    const conn = this.configService.get<string>('azureBlob.connectionString') ?? '';
    if (!conn.trim()) {
      return { status: 'ok', skipped: true, soft: true };
    }

    const containerName = this.configService.get<string>(
      'azureBlob.jsonCatalogContainer',
    ) as string;

    try {
      const blobServiceClient = BlobServiceClient.fromConnectionString(conn.trim());
      const containerClient = blobServiceClient.getContainerClient(containerName);
      await Promise.race([
        containerClient.getProperties(),
        new Promise<never>((_, reject) => {
          const t = setTimeout(() => reject(new Error('Azure blob check timed out')), 800);
          t.unref();
        }),
      ]);
      return { status: 'ok', soft: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { status: 'error', error: message, soft: true };
    }
  }
}
