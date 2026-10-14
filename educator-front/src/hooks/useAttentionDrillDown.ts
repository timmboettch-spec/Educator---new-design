import { useCallback, useRef } from 'react';
import { useDispatch } from 'react-redux';
import { classesApi } from '@/redux/api/classes/classesApi';
import type { ClassAttentionMeasure } from '@/redux/api/classes/classes.types';
import { buildAttentionParams } from '@/redux/api/classes/classesService';
import type { AppDispatch } from '@/store';

// BE max page size; larger buckets are fetched across several pages.
const DRILL_DOWN_PAGE_SIZE = 50;

/**
 * Fetches the IDs of all the educator's active classes matching one attention measure:
 * page 1 first, then the remaining pages (per `meta.totalPages`) in parallel. Resolves to
 * null when a newer call has started, so a slow earlier response can't overwrite the latest
 * selection. Rejects if any page fails.
 */
export function useAttentionDrillDown() {
  const dispatch = useDispatch<AppDispatch>();
  const latestRequest = useRef(0);

  const fetchClassIds = useCallback(
    async (measure: ClassAttentionMeasure): Promise<string[] | null> => {
      const requestId = ++latestRequest.current;

      const fetchPage = async (page: number) => {
        const subscription = dispatch(
          classesApi.endpoints.getClasses.initiate({
            ...buildAttentionParams(measure, DRILL_DOWN_PAGE_SIZE),
            page,
          })
        );
        try {
          return await subscription.unwrap();
        } finally {
          subscription.unsubscribe();
        }
      };

      const isStale = () => requestId !== latestRequest.current;

      try {
        const firstPage = await fetchPage(1);
        if (isStale()) return null;

        const remainingPages = await Promise.all(
          Array.from({ length: firstPage.meta.totalPages - 1 }, (_, i) =>
            fetchPage(i + 2)
          )
        );
        if (isStale()) return null;

        return [firstPage, ...remainingPages].flatMap((result) =>
          result.data.map((c) => c.classId)
        );
      } catch (error) {
        // A superseded request's failure isn't the current selection's failure.
        if (isStale()) return null;
        throw error;
      }
    },
    [dispatch]
  );

  return { fetchClassIds };
}
