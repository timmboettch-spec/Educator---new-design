export const PaginationConstants = {
  DEFAULT_PAGE: 1,
  DEFAULT_PAGE_SIZE: 10,
  /** Highest accepted `page`: keeps the computed offset far inside Postgres `bigint`. */
  MAX_PAGE: 100000,
};
