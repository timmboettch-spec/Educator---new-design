import { Injectable, LoggerService as NestLoggerService } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import pino from 'pino';
import { Env, SENSITIVE_KEYS } from '../constants';
import { ErrorOutput, LogInfo, LogLevel, RequestTraceInfo } from '../interfaces';
import { sanitize } from '../utils';
import { randomUUID } from 'crypto';

function isLogInfo(value: unknown): value is LogInfo {
  return (
    typeof value === 'object' &&
    value !== null &&
    'topic' in value &&
    'subTopic' in value &&
    'operation' in value
  );
}

/**
 * Application-wide structured logger, backed by a standalone pino instance.
 * Registered as Nest's global logger (see main.ts `app.useLogger`), so it also
 * has to accept the framework's own `log(message, context)`-style calls, not
 * just the structured LogInfo shape used by application code.
 */
@Injectable()
export class LoggerService implements NestLoggerService {
  private readonly pino: pino.Logger;

  constructor(
    configService: ConfigService,
    private readonly cls: ClsService,
  ) {
    const nodeEnv = configService.getOrThrow<Env>('app.nodeEnv');
    const isPrettyPrint = nodeEnv === Env.LOCAL;

    this.pino = pino({
      messageKey: 'message',
      level: LogLevel.INFO,
      timestamp: pino.stdTimeFunctions.isoTime,
      transport: isPrettyPrint
        ? {
            target: 'pino-pretty',
            options: { singleLine: true, colorize: true, messageKey: 'message' },
          }
        : undefined,
    });
  }

  log(message: LogInfo | string, ...optionalParams: unknown[]): void {
    this.dispatch(LogLevel.INFO, message, optionalParams);
  }

  error(message: LogInfo | string, ...optionalParams: unknown[]): void {
    this.dispatch(LogLevel.ERROR, message, optionalParams);
  }

  warn(message: LogInfo | string, ...optionalParams: unknown[]): void {
    this.dispatch(LogLevel.WARN, message, optionalParams);
  }

  debug(message: LogInfo | string, ...optionalParams: unknown[]): void {
    this.dispatch(LogLevel.DEBUG, message, optionalParams);
  }

  verbose(message: LogInfo | string, ...optionalParams: unknown[]): void {
    this.dispatch(LogLevel.DEBUG, message, optionalParams);
  }

  fatal(message: LogInfo | string, ...optionalParams: unknown[]): void {
    this.dispatch(LogLevel.ERROR, message, optionalParams);
  }

  private dispatch(level: LogLevel, message: LogInfo | string, optionalParams: unknown[]): void {
    if (isLogInfo(message)) {
      this.writeStructured(level, message);
      return;
    }
    this.writeFrameworkMessage(level, message, optionalParams);
  }

  /** Structured application logging — the LogInfo-based API used throughout the app. */
  private writeStructured(level: LogLevel, logInfo: LogInfo): void {
    try {
      const message =
        logInfo.message ?? `${logInfo.topic}.${logInfo.subTopic} - ${logInfo.operation}`;

      this.pino[level](
        {
          topic: logInfo.topic,
          subTopic: logInfo.subTopic,
          traceId: this.getTrace(logInfo.traceId),
          operation: logInfo.operation,
          refData: logInfo.refData ? sanitize(logInfo.refData, SENSITIVE_KEYS) : null,
          metadata: logInfo.metadata ? sanitize(logInfo.metadata, SENSITIVE_KEYS) : null,
          error: this.formatError(logInfo.error),
        },
        message,
      );
    } catch (error) {
      // Never let a logging failure take down the caller.
      console.error('Logger failed:', error);
      console.error('Original log:', logInfo);
    }
  }

  /** Nest framework-style logging — `log(message, context)` / `error(message, stack, context)`. */
  private writeFrameworkMessage(
    level: LogLevel,
    message: LogInfo | string,
    optionalParams: unknown[],
  ): void {
    const context =
      optionalParams.length > 0 && typeof optionalParams[optionalParams.length - 1] === 'string'
        ? (optionalParams[optionalParams.length - 1] as string)
        : undefined;

    // Nest's Logger interface allows any `message`. A plain object here means a caller
    // is passing structured data that didn't satisfy `isLogInfo` (e.g. missing a
    // required field) — log it as sanitized data instead of stringifying to
    // "[object Object]".
    if (typeof message === 'object' && message !== null) {
      this.pino[level](
        { context, traceId: this.getTrace(), data: sanitize(message, SENSITIVE_KEYS) },
        context ?? 'log',
      );
      return;
    }

    this.pino[level]({ context, traceId: this.getTrace() }, String(message));
  }

  private getTrace(explicitTrace?: string): string | undefined {
    if (explicitTrace) return explicitTrace;
    return this.cls.isActive() ? this.cls.getId() : randomUUID();
  }

  private formatError(error: unknown): ErrorOutput | null {
    if (!error) return null;

    if (error instanceof Error) {
      return { name: error.name, message: error.message, stack: error.stack };
    }

    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    return { name: 'Unknown', message: String(error), stack: undefined };
  }

  /** Structured audit log for a completed HTTP request/response — level follows statusCode. */
  logRequestTrace(requestInfo: RequestTraceInfo): void {
    this.writeStructured(this.levelForStatus(requestInfo.statusCode), {
      topic: 'RequestTrace',
      subTopic: 'audit',
      operation: 'request-completed',
      message: `${requestInfo.statusCode} ${requestInfo.method} ${requestInfo.route}`,
      metadata: {
        method: requestInfo.method,
        url: requestInfo.url,
        userId: requestInfo.userId,
        statusCode: requestInfo.statusCode,
        responseTime: `${requestInfo.responseTimeMs}ms`,
        requestBody: requestInfo.requestBody,
      },
    });
  }

  /** 5xx → error, 4xx → warn, everything else → info. */
  private levelForStatus(statusCode: number): LogLevel {
    if (statusCode >= 500) return LogLevel.ERROR;
    if (statusCode >= 400) return LogLevel.WARN;
    return LogLevel.INFO;
  }
}
