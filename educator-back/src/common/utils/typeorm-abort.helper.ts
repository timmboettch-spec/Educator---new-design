import { Injectable, Logger } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { DataSource, QueryRunner } from 'typeorm';
import { AbortSignalUtil } from './abort-signal.util';

@Injectable()
export class TypeOrmAbortHelper {
  private readonly logger = new Logger(TypeOrmAbortHelper.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly cls: ClsService,
  ) {}

  async withAbortSignal<T>(
    query: Promise<T>,
    timeoutMs?: number,
    operationName?: string,
  ): Promise<T> {
    const requestAbortSignal = AbortSignalUtil.getAbortSignal(this.cls);
    const name = operationName || 'Database query';

    if (!requestAbortSignal && !timeoutMs) {
      return query;
    }

    const raceSignals: Promise<never>[] = [];

    if (requestAbortSignal) {
      raceSignals.push(
        new Promise<never>((_, reject) => {
          if (requestAbortSignal.aborted) {
            reject(
              new Error(`${name} aborted: ${AbortSignalUtil.getAbortReason(requestAbortSignal)}`),
            );
            return;
          }

          requestAbortSignal.addEventListener('abort', () => {
            reject(
              new Error(`${name} aborted: ${AbortSignalUtil.getAbortReason(requestAbortSignal)}`),
            );
          });
        }),
      );
    }

    if (timeoutMs) {
      raceSignals.push(
        new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`${name} timed out after ${timeoutMs}ms`));
          }, timeoutMs);
        }),
      );
    }

    if (raceSignals.length > 0) {
      return Promise.race([query, ...raceSignals]);
    }

    return query;
  }

  async executeQueryWithAbort<T>(query: () => Promise<T>, operationName?: string): Promise<T> {
    try {
      return await this.withAbortSignal(query(), undefined, operationName);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('aborted') || message.includes('timed out')) {
        this.logger.debug(`Database operation cancelled: ${message}`);
      }
      throw error;
    }
  }

  createAbortAwareQueryRunner(operationName?: string): QueryRunner {
    const queryRunner = this.dataSource.createQueryRunner();
    const abortSignal = AbortSignalUtil.getAbortSignal(this.cls);

    if (abortSignal) {
      abortSignal.addEventListener('abort', () => {
        const message = AbortSignalUtil.getAbortReason(abortSignal);
        this.logger.debug(
          `Releasing query runner due to abort: ${operationName || 'unknown'} - ${message}`,
        );

        // Handle async cleanup without blocking the event listener
        (async () => {
          try {
            if (queryRunner.isReleased === false) {
              await queryRunner.release();
            }
          } catch (error) {
            this.logger.debug(
              `Error releasing query runner: ${error instanceof Error ? error.message : 'unknown'}`,
            );
          }
        })().catch(() => {
          // Silently ignore cleanup errors
        });
      });
    }

    return queryRunner;
  }
}
