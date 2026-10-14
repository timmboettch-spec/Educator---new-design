/**
 * Structured logging contracts for LoggerService.
 * All app-level logging methods accept LogInfo as their sole parameter.
 *
 * @example
 * ```typescript
 * this.logger.log({
 *   topic: 'UserService',
 *   subTopic: 'createUser',
 *   operation: 'user-creation',
 *   refData: { emailDomain: email.split('@')[1] },
 *   metadata: { userId: user.id, roleId: userRole.roleId },
 * });
 * ```
 */
export interface LogInfo {
  /** Class identifier — typically the service/repository/controller class name. */
  topic: string;

  /** Method identifier — the specific method generating the log. */
  subTopic: string;

  /** Human-readable action description, kebab-case. */
  operation: string;

  /**
   * Request trace ID for correlating logs across a request.
   * Optional — auto-filled from the active ClsService context when omitted.
   */
  traceId?: string;

  /** Optional human-readable message; derived from topic/subTopic/operation when omitted. */
  message?: string;

  /**
   * Reference input data that drove decision logic. Should not contain PII —
   * only decision-driving factors.
   */
  refData?: unknown;

  /** Dynamic runtime context (IDs, attributes, state). Automatically sanitized to remove PII. */
  metadata?: Record<string, unknown>;

  /** Error object for error-level logs. Should be an Error instance or error-shaped object. */
  error?: unknown;
}

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

/** Structured error format written to logs for easier parsing/querying. */
export interface ErrorOutput {
  name: string;
  message: string;
  stack?: string;
}

export function isError(error: unknown): error is Error {
  return error instanceof Error;
}

/** Input for LoggerService.logRequestTrace — a completed HTTP request/response. */
export interface RequestTraceInfo {
  method: string;
  url: string;
  userId: string;
  statusCode: number;
  responseTimeMs: number;
  requestBody?: unknown;
  route: string;
}

export interface ClsUser {
  userId: string;
  email?: string;
}

export interface RequestRoute {
  path?: string;
}
