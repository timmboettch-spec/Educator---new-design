/**
 * PostgreSQL driver error codes (`driverError.code`).
 * @see https://www.postgresql.org/docs/current/errcodes-appendix.html
 */
export const DbErrorConstants = {
  PG_UNIQUE_VIOLATION: '23505',
  PG_FOREIGN_KEY_VIOLATION: '23503',
  PG_INVALID_TEXT_REPRESENTATION: '22P02',
  PG_CHECK_VIOLATION: '23514',
} as const;
