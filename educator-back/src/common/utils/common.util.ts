import { HttpException, InternalServerErrorException } from '@nestjs/common';

export const handleError = (error: unknown): never => {
  if (error instanceof HttpException) {
    throw error;
  } else {
    throw new InternalServerErrorException(error);
  }
};

export const sanitize = (obj: unknown, sensitiveKeys: string[], depth: number = 0): unknown => {
  try {
    if (depth > 10) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => sanitize(item, sensitiveKeys, depth + 1));
    } else if (obj !== null && typeof obj === 'object') {
      const sanitized: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        const isSensitive = sensitiveKeys.some((sensitiveKey) =>
          key.toLowerCase().includes(sensitiveKey),
        );
        sanitized[key] = isSensitive ? '[REDACTED]' : sanitize(value, sensitiveKeys, depth + 1);
      }
      return sanitized;
    }
  } catch {
    // If sanitization fails, return the original object
  }
  return obj;
};

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Resolve class validation property path */
export const resolveDtoPath = (obj: unknown, path: string) =>
  path.split('.').reduce((acc, key) => (acc as Record<string, unknown>)?.[key], obj);
