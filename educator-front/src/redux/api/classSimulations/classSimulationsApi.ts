import { createApi } from '@reduxjs/toolkit/query/react';

import { axiosBaseQuery } from '../axiosBaseQuery';
import { getNextPageFromMeta, type ListWithMeta } from '../classes/classesApi';
import {
  BULK_ASSIGN_CLASS_SIMULATIONS,
  classSimulationById,
  GET_CLASS_SIMULATIONS,
} from './classSimulations.endpoints';
import type {
  BulkAssignClassSimulationsReqDto,
  BulkAssignClassSimulationsResDto,
  BulkAssignClassSimulationsResponseDto,
  ClassSimulationListItemResDto,
  ListClassSimulationsReqDto,
  ListClassSimulationsResponseDto,
  UpdateClassSimulationArgs,
  UpdateClassSimulationResDto,
  UpdateClassSimulationResponseDto,
} from './classSimulations.types';

/** Infinite-list args: the page number is supplied by RTK Query's pageParam. */
export type ClassSimulationsInfiniteArg = Omit<
  ListClassSimulationsReqDto,
  'page'
>;

export const classSimulationsApi = createApi({
  reducerPath: 'classSimulationsApi',
  baseQuery: axiosBaseQuery(),
  tagTypes: ['ClassSimulations'],
  endpoints: (build) => ({
    /** A class's simulation assignments with per-assignment stats, loaded page by page. */
    getClassSimulationsInfinite: build.infiniteQuery<
      ListWithMeta<ClassSimulationListItemResDto>,
      ClassSimulationsInfiniteArg,
      number
    >({
      infiniteQueryOptions: {
        initialPageParam: 1,
        getNextPageParam: getNextPageFromMeta,
      },
      query: ({ queryArg, pageParam }) => ({
        url: GET_CLASS_SIMULATIONS,
        params: { ...queryArg, page: pageParam },
      }),
      providesTags: ['ClassSimulations'],
      transformResponse: (response: ListClassSimulationsResponseDto) => ({
        data: response.data,
        meta: response.meta,
      }),
    }),

    /** Changes an assignment's start, due and/or close date. */
    updateClassSimulation: build.mutation<
      UpdateClassSimulationResDto,
      UpdateClassSimulationArgs
    >({
      query: ({ id, body }) => ({
        url: classSimulationById(id),
        method: 'PUT',
        data: body,
      }),
      transformResponse: (response: UpdateClassSimulationResponseDto) =>
        response.data,
      invalidatesTags: ['ClassSimulations'],
    }),

    /**
     * Assigns every simulation to every class with one set of dates. All or
     * nothing: a 422 lists each pair and nothing is saved.
     */
    bulkAssignClassSimulations: build.mutation<
      BulkAssignClassSimulationsResDto,
      BulkAssignClassSimulationsReqDto
    >({
      query: (body) => ({
        url: BULK_ASSIGN_CLASS_SIMULATIONS,
        method: 'POST',
        data: body,
        timeout: 30_000,
      }),
      transformResponse: (response: BulkAssignClassSimulationsResponseDto) =>
        response.data,
      invalidatesTags: ['ClassSimulations'],
    }),
  }),
});

export const {
  useGetClassSimulationsInfiniteInfiniteQuery:
    useGetClassSimulationsInfiniteQuery,
  useUpdateClassSimulationMutation,
  useBulkAssignClassSimulationsMutation,
} = classSimulationsApi;
