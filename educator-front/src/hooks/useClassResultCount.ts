import { skipToken } from '@reduxjs/toolkit/query/react';
import { useGetClassesQuery } from '../redux/api/classes/classesApi';
import {
  buildFilteredClassCountArg,
  type ClassListFilters,
} from '../redux/api/classes/classesService';

/**
 * How many classes match the list query across every school, for announcing
 * the result count after a search, Apply or Reset. Shares its request (and
 * cache entry) with the "Showing:" chip's count. `undefined` while loading or
 * if the count request fails; the list itself shows any error.
 */
export function useClassResultCount(
  filters: ClassListFilters,
  enabled: boolean
): number | undefined {
  const { currentData } = useGetClassesQuery(
    enabled ? buildFilteredClassCountArg(filters) : skipToken
  );
  return currentData?.meta.total;
}
