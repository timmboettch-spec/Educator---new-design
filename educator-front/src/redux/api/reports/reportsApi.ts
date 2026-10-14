import { createApi } from '@reduxjs/toolkit/query/react';

import { axiosBaseQuery } from '../axiosBaseQuery';
import {
  classesApi,
  getNextPageFromMeta,
  type ListWithMeta,
} from '../classes/classesApi';
import {
  BULK_REVIEW_REPORTS,
  GET_REPORTS_LIST,
  reportViewed,
} from './reports.endpoints';
import type {
  BulkReviewReportsReqDto,
  BulkReviewReportsResDto,
  BulkReviewReportsResponseDto,
  ListReportsReqDto,
  ListReportsResponseDto,
  ReportListItemResDto,
} from './reports.types';

/** Infinite-list args: the page number is supplied by RTK Query's pageParam. */
export type ReportsInfiniteArg = Omit<ListReportsReqDto, 'page'>;

// Reviewing changes the unread counts classesApi caches (activity overview, attention summary).
const invalidateClassCounts = async ({
  dispatch,
  queryFulfilled,
}: {
  dispatch: (action: unknown) => unknown;
  queryFulfilled: Promise<unknown>;
}) => {
  try {
    await queryFulfilled;
    dispatch(classesApi.util.invalidateTags(['Classes']));
  } catch {
    // Failed mutation: nothing changed, the caller handles the error.
  }
};

export const reportsApi = createApi({
  reducerPath: 'reportsApi',
  baseQuery: axiosBaseQuery(),
  tagTypes: ['Reports'],
  endpoints: (build) => ({
    getReports: build.query<
      ListWithMeta<ReportListItemResDto>,
      ListReportsReqDto | void
    >({
      query: (params) => ({
        url: GET_REPORTS_LIST,
        params: params ?? undefined,
      }),
      providesTags: ['Reports'],
      transformResponse: (response: ListReportsResponseDto) => ({
        data: response.data,
        meta: response.meta,
      }),
    }),

    getReportsInfinite: build.infiniteQuery<
      ListWithMeta<ReportListItemResDto>,
      ReportsInfiniteArg,
      number
    >({
      infiniteQueryOptions: {
        initialPageParam: 1,
        getNextPageParam: getNextPageFromMeta,
      },
      query: ({ queryArg, pageParam }) => ({
        url: GET_REPORTS_LIST,
        params: { ...queryArg, page: pageParam },
      }),
      providesTags: ['Reports'],
      transformResponse: (response: ListReportsResponseDto) => ({
        data: response.data,
        meta: response.meta,
      }),
    }),

    bulkReviewReports: build.mutation<
      BulkReviewReportsResDto,
      BulkReviewReportsReqDto
    >({
      query: (body) => ({
        url: BULK_REVIEW_REPORTS,
        method: 'PATCH',
        data: body,
      }),
      transformResponse: (response: BulkReviewReportsResponseDto) =>
        response.data,
      invalidatesTags: ['Reports'],
      onQueryStarted: (_arg, api) => invalidateClassCounts(api),
    }),

    // The BE returns the updated row; callers only need success, and the list refetches.
    markReportViewed: build.mutation<void, string>({
      query: (id) => ({
        url: reportViewed(id),
        method: 'PATCH',
      }),
      transformResponse: () => undefined,
      invalidatesTags: ['Reports'],
      onQueryStarted: (_arg, api) => invalidateClassCounts(api),
    }),
  }),
});

export const {
  useGetReportsQuery,
  useLazyGetReportsQuery,
  useGetReportsInfiniteInfiniteQuery: useGetReportsInfiniteQuery,
  useBulkReviewReportsMutation,
  useMarkReportViewedMutation,
} = reportsApi;
