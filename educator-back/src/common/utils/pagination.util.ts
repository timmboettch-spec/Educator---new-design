import { PaginationConstants } from '../constants/pagination.constants';
import { IPaginationMeta, IPaginationParams, IPaginationResult } from '../interfaces/pagination.interface';

export function getPagination(params: IPaginationParams): IPaginationResult {
  const page = params.page ?? PaginationConstants.DEFAULT_PAGE;
  const pageSize = params.pageSize ?? PaginationConstants.DEFAULT_PAGE_SIZE;

  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize,
  };
}

/**
 * Builds the `meta` payload for a paginated list response — pass alongside
 * `data` (the plain items array) to `ResponseResult`, never nested inside it.
 */
export function buildPaginationMeta<M extends object = object>(
  total: number,
  page: number,
  pageSize: number,
  extraMeta?: M,
): IPaginationMeta & M {
  return {
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
    hasNextPage: page * pageSize < total,
    hasPrevPage: page > 1,
    ...(extraMeta as M),
  };
}
