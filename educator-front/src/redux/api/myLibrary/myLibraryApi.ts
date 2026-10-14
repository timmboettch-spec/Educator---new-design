import { createApi } from '@reduxjs/toolkit/query/react';

import type { Simulation } from '@/types/simulation.types';
import { axiosBaseQuery } from '../axiosBaseQuery';
import { getNextPageFromMeta, type ListWithMeta } from '../classes/classesApi';
import {
  GET_MY_LIBRARY_LIST,
  GET_MY_LIBRARY_PRODUCT_NAME_OPTIONS,
  GET_MY_LIBRARY_TARGET_AUDIENCE_OPTIONS,
  GET_MY_LIBRARY_UNIT_OPTIONS,
} from './myLibrary.endpoints';
import type {
  FilterDropdownReqDto,
  ListMyLibraryReqDto,
  ListMyLibraryResponseDto,
  TextDropdownResponseDto,
  UnitDropdownResDto,
  UnitDropdownResponseDto,
} from './myLibrary.types';
import { toLibrarySimulation } from './myLibraryService';

/** Infinite-list args: the page number is supplied by RTK Query's pageParam. */
export type MyLibraryInfiniteArg = Omit<ListMyLibraryReqDto, 'page'>;
export type FilterDropdownInfiniteArg = Omit<FilterDropdownReqDto, 'page'>;

export const MY_LIBRARY_PAGE_SIZE = 24;

const infiniteQueryOptions = {
  initialPageParam: 1,
  getNextPageParam: getNextPageFromMeta,
};

export const myLibraryApi = createApi({
  reducerPath: 'myLibraryApi',
  baseQuery: axiosBaseQuery(),
  // The dropdowns list what the library holds, so they change with it.
  tagTypes: ['MyLibrary', 'MyLibraryFilterOptions'],
  endpoints: (build) => ({
    getMyLibraryInfinite: build.infiniteQuery<
      ListWithMeta<Simulation>,
      MyLibraryInfiniteArg,
      number
    >({
      infiniteQueryOptions,
      query: ({ queryArg, pageParam }) => ({
        url: GET_MY_LIBRARY_LIST,
        params: {
          pageSize: MY_LIBRARY_PAGE_SIZE,
          ...queryArg,
          page: pageParam,
        },
      }),
      // Long enough that opening a simulation's details and coming Back finds
      // the pages already loaded, so the scroll position can be restored.
      keepUnusedDataFor: 300,
      providesTags: ['MyLibrary'],
      transformResponse: (response: ListMyLibraryResponseDto) => ({
        data: response.data.map(toLibrarySimulation),
        meta: response.meta,
      }),
    }),

    /** Unit dropdown options: the library's units as id + name. */
    getMyLibraryUnitOptionsInfinite: build.infiniteQuery<
      ListWithMeta<UnitDropdownResDto>,
      FilterDropdownInfiniteArg,
      number
    >({
      infiniteQueryOptions,
      query: ({ queryArg, pageParam }) => ({
        url: GET_MY_LIBRARY_UNIT_OPTIONS,
        params: { ...queryArg, page: pageParam },
      }),
      providesTags: ['MyLibraryFilterOptions'],
      transformResponse: (response: UnitDropdownResponseDto) => ({
        data: response.data,
        meta: response.meta,
      }),
    }),

    /** Target Audience dropdown options. */
    getMyLibraryTargetAudienceOptionsInfinite: build.infiniteQuery<
      ListWithMeta<string>,
      FilterDropdownInfiniteArg,
      number
    >({
      infiniteQueryOptions,
      query: ({ queryArg, pageParam }) => ({
        url: GET_MY_LIBRARY_TARGET_AUDIENCE_OPTIONS,
        params: { ...queryArg, page: pageParam },
      }),
      providesTags: ['MyLibraryFilterOptions'],
      transformResponse: (response: TextDropdownResponseDto) => ({
        data: response.data,
        meta: response.meta,
      }),
    }),

    /** Required Product Name dropdown options. */
    getMyLibraryProductNameOptionsInfinite: build.infiniteQuery<
      ListWithMeta<string>,
      FilterDropdownInfiniteArg,
      number
    >({
      infiniteQueryOptions,
      query: ({ queryArg, pageParam }) => ({
        url: GET_MY_LIBRARY_PRODUCT_NAME_OPTIONS,
        params: { ...queryArg, page: pageParam },
      }),
      providesTags: ['MyLibraryFilterOptions'],
      transformResponse: (response: TextDropdownResponseDto) => ({
        data: response.data,
        meta: response.meta,
      }),
    }),
  }),
});

export const {
  useGetMyLibraryInfiniteInfiniteQuery: useGetMyLibraryInfiniteQuery,
  useGetMyLibraryUnitOptionsInfiniteInfiniteQuery:
    useGetMyLibraryUnitOptionsInfiniteQuery,
  useGetMyLibraryTargetAudienceOptionsInfiniteInfiniteQuery:
    useGetMyLibraryTargetAudienceOptionsInfiniteQuery,
  useGetMyLibraryProductNameOptionsInfiniteInfiniteQuery:
    useGetMyLibraryProductNameOptionsInfiniteQuery,
} = myLibraryApi;

/**
 * Refetches the cached My Library list and its filter options after the
 * library changed elsewhere.
 */
export const invalidateMyLibraryList = () =>
  myLibraryApi.util.invalidateTags(['MyLibrary', 'MyLibraryFilterOptions']);
