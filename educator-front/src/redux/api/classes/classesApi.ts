import { createApi } from '@reduxjs/toolkit/query/react';

import { axiosBaseQuery } from '../axiosBaseQuery';
import {
  CREATE_CLASS,
  classById,
  GET_ACTIVITY_OVERVIEW,
  GET_ATTENTION_SUMMARY,
  GET_CLASSES,
  GET_SCHOOL_GROUPS,
  GET_SIMULATIONS_COMPLETED_GRAPH,
} from './classes.endpoints';
import type {
  ActivityOverviewReqDto,
  ActivityOverviewResDto,
  ActivityOverviewResponseDto,
  AttentionSummaryReqDto,
  AttentionSummaryResDto,
  AttentionSummaryResponseDto,
  ClassLiteResDto,
  ClassResDto,
  ClassSummaryResDto,
  CreateClassReqDto,
  CreateClassResponseDto,
  DeleteClassResponseDto,
  ListClassesLiteReqDto,
  ListClassesLiteResponseDto,
  ListClassesReqDto,
  ListClassesResponseDto,
  ListSchoolGroupsReqDto,
  ListSchoolGroupsResponseDto,
  PaginationMetaDto,
  SchoolGroupResDto,
  SimulationsCompletedGraphReqDto,
  SimulationsCompletedGraphResDto,
  SimulationsCompletedGraphResponseDto,
  UpdateClassArgs,
  UpdateClassResponseDto,
} from './classes.types';

export interface ListWithMeta<T> {
  data: T[];
  meta: PaginationMetaDto;
}

/** Infinite-list args: the page number is supplied by RTK Query's pageParam. */
export type SchoolGroupsInfiniteArg = Omit<ListSchoolGroupsReqDto, 'page'>;
export type ClassesInfiniteArg = Omit<ListClassesReqDto, 'page'>;
/** Filter-panel dropdown args: server-side search, paged as the user scrolls. */
export type SchoolOptionsInfiniteArg = Pick<
  ListSchoolGroupsReqDto,
  'pageSize' | 'schoolName'
>;
export type ClassOptionsInfiniteArg = Pick<
  ListClassesReqDto,
  'pageSize' | 'search' | 'schoolIds'
>;

/** Next page from the BE meta, or undefined when the last page has loaded. */
export const getNextPageFromMeta = <T>(lastPage: ListWithMeta<T>) =>
  lastPage.meta.hasNextPage ? lastPage.meta.page + 1 : undefined;

export const classesApi = createApi({
  reducerPath: 'classesApi',
  baseQuery: axiosBaseQuery(),
  tagTypes: ['Classes'],
  endpoints: (build) => ({
    getActivityOverview: build.query<
      ActivityOverviewResDto,
      ActivityOverviewReqDto | void
    >({
      query: (params) => ({
        url: GET_ACTIVITY_OVERVIEW,
        params: params ?? undefined,
      }),
      transformResponse: (response: ActivityOverviewResponseDto) =>
        response.data,
      providesTags: ['Classes'],
    }),

    getAttentionSummary: build.query<
      AttentionSummaryResDto,
      AttentionSummaryReqDto | void
    >({
      query: (params) => ({
        url: GET_ATTENTION_SUMMARY,
        params: params ?? undefined,
      }),
      transformResponse: (response: AttentionSummaryResponseDto) =>
        response.data,
      providesTags: ['Classes'],
    }),

    getSchoolGroups: build.query<
      ListWithMeta<SchoolGroupResDto>,
      ListSchoolGroupsReqDto | void
    >({
      query: (params) => ({
        url: GET_SCHOOL_GROUPS,
        params: params ?? undefined,
      }),
      providesTags: ['Classes'],
      transformResponse: (response: ListSchoolGroupsResponseDto) => ({
        data: response.data,
        meta: response.meta,
      }),
    }),

    getClasses: build.query<
      ListWithMeta<ClassSummaryResDto>,
      ListClassesReqDto | void
    >({
      query: (params) => ({
        url: GET_CLASSES,
        params: params ?? undefined,
      }),
      providesTags: ['Classes'],
      transformResponse: (response: ListClassesResponseDto) => ({
        data: response.data,
        meta: response.meta,
      }),
    }),

    // `lite: true` returns only { classId, className } — for dropdowns.
    getClassOptions: build.query<
      ListWithMeta<ClassLiteResDto>,
      ListClassesLiteReqDto | void
    >({
      query: (params) => ({
        url: GET_CLASSES,
        params: { ...(params ?? {}), lite: true },
      }),
      providesTags: ['Classes'],
      transformResponse: (response: ListClassesLiteResponseDto) => ({
        data: response.data,
        meta: response.meta,
      }),
    }),

    getSchoolGroupsInfinite: build.infiniteQuery<
      ListWithMeta<SchoolGroupResDto>,
      SchoolGroupsInfiniteArg,
      number
    >({
      infiniteQueryOptions: {
        initialPageParam: 1,
        getNextPageParam: getNextPageFromMeta,
      },
      query: ({ queryArg, pageParam }) => ({
        url: GET_SCHOOL_GROUPS,
        params: { ...queryArg, page: pageParam },
      }),
      providesTags: ['Classes'],
      transformResponse: (response: ListSchoolGroupsResponseDto) => ({
        data: response.data,
        meta: response.meta,
      }),
    }),

    getClassesInfinite: build.infiniteQuery<
      ListWithMeta<ClassSummaryResDto>,
      ClassesInfiniteArg,
      number
    >({
      infiniteQueryOptions: {
        initialPageParam: 1,
        getNextPageParam: getNextPageFromMeta,
      },
      query: ({ queryArg, pageParam }) => ({
        url: GET_CLASSES,
        params: { ...queryArg, page: pageParam },
      }),
      providesTags: ['Classes'],
      transformResponse: (response: ListClassesResponseDto) => ({
        data: response.data,
        meta: response.meta,
      }),
    }),

    /** School dropdown options (school groups), searched by `schoolName`. */
    getSchoolOptionsInfinite: build.infiniteQuery<
      ListWithMeta<SchoolGroupResDto>,
      SchoolOptionsInfiniteArg,
      number
    >({
      infiniteQueryOptions: {
        initialPageParam: 1,
        getNextPageParam: getNextPageFromMeta,
      },
      query: ({ queryArg, pageParam }) => ({
        url: GET_SCHOOL_GROUPS,
        params: { ...queryArg, page: pageParam },
      }),
      providesTags: ['Classes'],
      transformResponse: (response: ListSchoolGroupsResponseDto) => ({
        data: response.data,
        meta: response.meta,
      }),
    }),

    /** Class Name dropdown options: classes as id + name (`lite=true`). */
    getClassOptionsInfinite: build.infiniteQuery<
      ListWithMeta<ClassLiteResDto>,
      ClassOptionsInfiniteArg,
      number
    >({
      infiniteQueryOptions: {
        initialPageParam: 1,
        getNextPageParam: getNextPageFromMeta,
      },
      query: ({ queryArg, pageParam }) => ({
        url: GET_CLASSES,
        params: { ...queryArg, lite: true, page: pageParam },
      }),
      providesTags: ['Classes'],
      transformResponse: (response: ListClassesLiteResponseDto) => ({
        data: response.data,
        meta: response.meta,
      }),
    }),

    /**
     * The assign modal's Class Name options: full class rows (for their dates
     * and student counts), with the dropdown's own loading row.
     */
    getAssignClassOptionsInfinite: build.infiniteQuery<
      ListWithMeta<ClassSummaryResDto>,
      ClassesInfiniteArg,
      number
    >({
      infiniteQueryOptions: {
        initialPageParam: 1,
        getNextPageParam: getNextPageFromMeta,
      },
      query: ({ queryArg, pageParam }) => ({
        url: GET_CLASSES,
        params: { ...queryArg, page: pageParam },
      }),
      providesTags: ['Classes'],
      transformResponse: (response: ListClassesResponseDto) => ({
        data: response.data,
        meta: response.meta,
      }),
    }),

    getSimulationsCompletedGraph: build.query<
      SimulationsCompletedGraphResDto,
      SimulationsCompletedGraphReqDto | void
    >({
      query: (params) => ({
        url: GET_SIMULATIONS_COMPLETED_GRAPH,
        params: params ?? undefined,
      }),
      transformResponse: (response: SimulationsCompletedGraphResponseDto) =>
        response.data,
      providesTags: ['Classes'],
    }),

    createClass: build.mutation<ClassResDto, CreateClassReqDto>({
      query: (body) => ({
        url: CREATE_CLASS,
        method: 'POST',
        data: body,
        timeout: 30_000,
      }),
      transformResponse: (response: CreateClassResponseDto) => response.data,
      invalidatesTags: ['Classes'],
    }),

    updateClass: build.mutation<ClassResDto, UpdateClassArgs>({
      query: ({ id, body }) => ({
        url: classById(id),
        method: 'PUT',
        data: body,
      }),
      transformResponse: (response: UpdateClassResponseDto) => response.data,
      invalidatesTags: ['Classes'],
    }),

    deleteClass: build.mutation<DeleteClassResponseDto['data'], string>({
      query: (id) => ({
        url: classById(id),
        method: 'DELETE',
        headers: { 'ngrok-skip-browser-warning': 'true' },
      }),
      transformResponse: (response: DeleteClassResponseDto) => response.data,
      invalidatesTags: ['Classes'],
    }),
  }),
});

export const {
  useGetActivityOverviewQuery,
  useGetAttentionSummaryQuery,
  useGetSchoolGroupsQuery,
  useGetSchoolGroupsInfiniteInfiniteQuery: useGetSchoolGroupsInfiniteQuery,
  useGetClassesQuery,
  useGetClassesInfiniteInfiniteQuery: useGetClassesInfiniteQuery,
  useLazyGetClassesQuery,
  useGetClassOptionsQuery,
  useGetSimulationsCompletedGraphQuery,
  useGetSchoolOptionsInfiniteInfiniteQuery: useGetSchoolOptionsInfiniteQuery,
  useGetClassOptionsInfiniteInfiniteQuery: useGetClassOptionsInfiniteQuery,
  useGetAssignClassOptionsInfiniteInfiniteQuery:
    useGetAssignClassOptionsInfiniteQuery,
  useCreateClassMutation,
  useUpdateClassMutation,
  useDeleteClassMutation,
} = classesApi;
