import config from './env';
import type { LogLevel } from '../types/api.types';

type LoggerLike = {
  log: (level: LogLevel, message: string) => void;
};

let logger: LoggerLike | null = null;

function safeStringify(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (value instanceof Error) {
    return value.message;
  }

  if (typeof value === 'object' && value !== null) {
    try {
      return JSON.stringify(value);
    } catch {
      return '[Unserializable Object]';
    }
  }

  return String(value);
}

function getTimestamp(): string {
  return new Date().toISOString().replace('T', ' ').split('.')[0] ?? '';
}

function initializeLogger(): LoggerLike {
  if (logger) {
    return logger;
  }

  const minimumLevel = config.logLevel;
  const levelOrder: Record<LogLevel, number> = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
  };

  logger = {
    log: (level: LogLevel, message: string): void => {
      if (levelOrder[level] < levelOrder[minimumLevel]) {
        return;
      }

      const timestamp = getTimestamp();
      const formatted = `[${timestamp}] ${level.toUpperCase()}: ${message}`;

      switch (level) {
        case 'error':
          console.error(formatted);
          break;
        case 'warn':
          console.warn(formatted);
          break;
        case 'debug':
          console.debug(formatted);
          break;
        case 'info':
        default:
          console.info(formatted);
          break;
      }
    },
  };

  return logger;
}

function writeLog(level: LogLevel, message: string): void {
  initializeLogger().log(level, message);
}

export const logRequest = (): void => {
  // Intentionally muted to keep API test output concise.
};

export const logResponse = (): void => {
  // Intentionally muted to keep API test output concise.
};

export const logStep = (step: string): void => {
  if (step) {
    // Intentionally muted to keep API test output concise.
  }
};

export const logAssertion = (description: string, passed: boolean): void => {
  if (!passed) {
    writeLog('error', `Assertion Failed: ${description}`);
  }
};

export const logError = (message: string, error?: unknown): void => {
  writeLog('error', message);

  if (error) {
    writeLog('debug', `Error Details: ${safeStringify(error)}`);
  }
};

export const logDebug = (message: string): void => {
  writeLog('debug', message);
};

export default logger;
