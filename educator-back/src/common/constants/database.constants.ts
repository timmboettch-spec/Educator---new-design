/**
 * Postgres connection settings applied to every pooled connection, so plain
 * `timestamp` columns and `now()`/`CURRENT_DATE` evaluate in UTC regardless of
 * the server's default `TimeZone`.
 */
const SESSION_TIMEZONE = 'UTC';

export const DatabaseConstants = {
  SESSION_TIMEZONE,
  CONNECTION_OPTIONS: `-c timezone=${SESSION_TIMEZONE}`,
} as const;
