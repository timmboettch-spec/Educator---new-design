export interface IPaginationParams {
  page?: number;
  pageSize?: number;
}

export interface IPaginationResult {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

export interface IPaginationMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}
