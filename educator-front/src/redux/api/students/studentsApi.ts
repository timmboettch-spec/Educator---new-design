import { createApi } from '@reduxjs/toolkit/query/react';

import { axiosBaseQuery } from '../axiosBaseQuery';
import { getNextPageFromMeta, type ListWithMeta } from '../classes/classesApi';
import { GET_STUDENTS } from './students.endpoints';
import type {
  ListStudentsLiteReqDto,
  ListStudentsLiteResponseDto,
  ListStudentsReqDto,
  ListStudentsResponseDto,
  StudentLiteResDto,
  StudentSummaryResDto,
} from './students.types';

/** Infinite-list args: the page number is supplied by RTK Query's pageParam. */
export type ClassRosterInfiniteArg = Omit<ListStudentsReqDto, 'page'>;

export const studentsApi = createApi({
  reducerPath: 'studentsApi',
  baseQuery: axiosBaseQuery(),
  tagTypes: ['Students'],
  endpoints: (build) => ({
    // `lite: true` returns only { id, studentId, name } — for dropdowns.
    getStudentOptions: build.query<
      ListWithMeta<StudentLiteResDto>,
      ListStudentsLiteReqDto | void
    >({
      query: (params) => ({
        url: GET_STUDENTS,
        params: { ...(params ?? {}), lite: true },
      }),
      transformResponse: (response: ListStudentsLiteResponseDto) => ({
        data: response.data,
        meta: response.meta,
      }),
    }),

    /** A class's full roster with per-student aggregates, loaded page by page. */
    getClassRosterInfinite: build.infiniteQuery<
      ListWithMeta<StudentSummaryResDto>,
      ClassRosterInfiniteArg,
      number
    >({
      infiniteQueryOptions: {
        initialPageParam: 1,
        getNextPageParam: getNextPageFromMeta,
      },
      query: ({ queryArg, pageParam }) => ({
        url: GET_STUDENTS,
        params: { ...queryArg, lite: false, page: pageParam },
      }),
      providesTags: ['Students'],
      transformResponse: (response: ListStudentsResponseDto) => ({
        data: response.data,
        meta: response.meta,
      }),
    }),
  }),
});

export const {
  useGetStudentOptionsQuery,
  useGetClassRosterInfiniteInfiniteQuery: useGetClassRosterInfiniteQuery,
} = studentsApi;
