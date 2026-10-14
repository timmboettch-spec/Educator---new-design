import { GatewayTimeoutException, Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError, AxiosRequestConfig, AxiosResponse, isAxiosError } from 'axios';
import { ClsService } from 'nestjs-cls';
import { OutboundHttpConstants, OutboundIntegration } from '../constants/outbound-http.constants';
import { outboundHttpTimeoutCounter } from '../metrics/app.metrics';
import { ERROR_MSG } from '../messages/error.message';
import { AbortSignalUtil } from '../utils/abort-signal.util';
import { LoggerService } from './logger.service';

/**
 * Single entry point for outbound HTTP calls — `fetch` and axios (ADR-0011). Bounds each call by
 * the integration's own timeout and links it to the inbound request's abort signal.
 */
@Injectable()
export class OutboundHttpClient implements OnModuleInit {
  constructor(
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
    private readonly cls: ClsService,
  ) {}

  onModuleInit(): void {
    const apiTimeoutMs =
      this.configService.get<number>('app.apiTimeoutMs') ??
      OutboundHttpConstants.FALLBACK_API_TIMEOUT_MS;
    for (const integration of Object.values(OutboundIntegration)) {
      const timeoutMs = this.getTimeoutMs(integration);
      if (timeoutMs >= apiTimeoutMs) {
        this.logger.warn(
          `Outbound HTTP timeout for "${integration}" (${timeoutMs}ms) is not lower than API_TIMEOUT_MS (${apiTimeoutMs}ms); it can never fire`,
        );
      }
    }
  }

  getTimeoutMs(integration: OutboundIntegration): number {
    return OutboundHttpConstants.TIMEOUT_MS[integration];
  }

  async fetch(
    integration: OutboundIntegration,
    url: string | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const timeoutMs = this.getTimeoutMs(integration);
    const timeoutController = new AbortController();
    const timer = setTimeout(() => {
      timeoutController.abort(new Error(`Outbound ${integration} call timed out`));
    }, timeoutMs);
    timer.unref();

    const inboundSignal = AbortSignalUtil.getAbortSignal(this.cls);
    const callerSignal = init?.signal ?? undefined;
    const signal = AbortSignalUtil.combineAbortSignals(
      timeoutController.signal,
      inboundSignal,
      callerSignal,
    );

    try {
      return await fetch(url, { ...init, signal });
    } catch (error) {
      const cancelledByCaller = inboundSignal?.aborted || callerSignal?.aborted;
      if (timeoutController.signal.aborted && !cancelledByCaller) {
        this.logger.warn(
          `Outbound ${integration} call timed out after ${timeoutMs}ms — host ${this.hostOf(url)}`,
        );
        outboundHttpTimeoutCounter.inc({ integration });
        throw new GatewayTimeoutException(ERROR_MSG.COMMON.UPSTREAM_TIMEOUT(integration), {
          cause: error,
        });
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * POST through axios, bounded by the integration's timeout and the inbound request's abort
   * signal. An axios timeout maps to the same 504, log line and metric as `fetch`.
   */
  async post<T = unknown>(
    integration: OutboundIntegration,
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    try {
      return await axios.post<T>(url, data, {
        ...config,
        timeout: config?.timeout || this.getTimeoutMs(integration),
        signal: AbortSignalUtil.combineAbortSignals(
          AbortSignalUtil.getAbortSignal(this.cls),
          config?.signal as AbortSignal | undefined,
        ),
      });
    } catch (error) {
      throw this.mapAxiosError(integration, error);
    }
  }

  /** Returns a `GatewayTimeoutException` for an axios timeout; any other error is returned as-is. */
  private mapAxiosError(integration: OutboundIntegration, error: unknown): unknown {
    if (!isAxiosError(error) || !this.isAxiosTimeout(error)) {
      return error;
    }
    const url = error.config?.url;
    const host = url ? this.hostOf(url, error.config?.baseURL) : 'unknown';
    this.logger.warn(
      `Outbound ${integration} call timed out after ${error.config?.timeout ?? this.getTimeoutMs(integration)}ms — host ${host}`,
    );
    outboundHttpTimeoutCounter.inc({ integration });
    return new GatewayTimeoutException(ERROR_MSG.COMMON.UPSTREAM_TIMEOUT(integration), {
      cause: error,
    });
  }

  private isAxiosTimeout(error: AxiosError): boolean {
    return error.code === AxiosError.ECONNABORTED || error.code === AxiosError.ETIMEDOUT;
  }

  private hostOf(url: string | URL, base?: string): string {
    try {
      return new URL(url, base).host;
    } catch {
      return 'unknown';
    }
  }
}
