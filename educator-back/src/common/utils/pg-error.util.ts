import { IPostgresDriverError } from 'src/common/interfaces/exception-filter.interface';

/**
 * True when `error` is a Postgres driver error with SQLSTATE `code` (and, when given, the
 * violated `constraint`). Accepts a TypeORM `QueryFailedError` (the driver error sits on
 * `driverError`) or a bare driver error, so callers can match on both.
 */
export function isPgError(error: unknown, code: string, constraint?: string): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const wrapped = (error as { driverError?: unknown }).driverError;
  const driverError = (typeof wrapped === 'object' && wrapped !== null ? wrapped : error) as
    IPostgresDriverError | undefined;
  if (driverError?.code !== code) return false;
  return constraint === undefined || driverError.constraint === constraint;
}
