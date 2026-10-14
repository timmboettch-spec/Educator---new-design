import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  isClassListFilterMeasure,
  type ClassListFilterMeasure,
} from '../components/class/AttentionFilterChip';
import {
  selectClassListQuery,
  setClassListAttentionFilter,
} from '../redux/api/classes/classesSlice';
import { ATTENTION_MEASURE_PARAM } from '../routes/routePath';
import { useAppDispatch, useAppSelector } from '../store/hooks';

/**
 * The class list's attention quick filter. It lives in the class list query
 * (Redux) and is mirrored to the `?measure=` URL param, so dashboard links,
 * refreshes and back/forward select it too; invalid params are stripped.
 * Selecting a quick filter leaves search and panel filters as they are.
 */
export function useClassAttentionMeasure() {
  const dispatch = useAppDispatch();
  const { attentionFilter } = useAppSelector(selectClassListQuery);
  const [searchParams, setSearchParams] = useSearchParams();
  const measureParam = searchParams.get(ATTENTION_MEASURE_PARAM);
  const urlMeasure = isClassListFilterMeasure(measureParam)
    ? measureParam
    : null;

  // Our own URL write lands a render after the store update (the router
  // updates in a transition); until then the store is already right.
  const pendingUrlWrite = useRef<ClassListFilterMeasure | null | undefined>(
    undefined
  );
  const latestAttentionFilter = useRef(attentionFilter);
  latestAttentionFilter.current = attentionFilter;

  // URL → store, for changes that don't come from this page (links, history).
  useEffect(() => {
    if (pendingUrlWrite.current !== undefined) {
      if (urlMeasure === pendingUrlWrite.current) {
        pendingUrlWrite.current = undefined;
      }
      return;
    }
    if (measureParam !== null && !urlMeasure) {
      setSearchParams(
        (params) => {
          params.delete(ATTENTION_MEASURE_PARAM);
          return params;
        },
        { replace: true }
      );
      return;
    }
    if (urlMeasure !== latestAttentionFilter.current) {
      dispatch(setClassListAttentionFilter(urlMeasure));
    }
  }, [urlMeasure, measureParam, dispatch, setSearchParams]);

  /** Selects a quick filter (one at a time), or clears it with `null`. */
  const setMeasure = (next: ClassListFilterMeasure | null) => {
    pendingUrlWrite.current = next === urlMeasure ? undefined : next;
    dispatch(setClassListAttentionFilter(next));
    setSearchParams((params) => {
      if (next) params.set(ATTENTION_MEASURE_PARAM, next);
      else params.delete(ATTENTION_MEASURE_PARAM);
      return params;
    });
  };

  /** Selects a quick filter, or turns it off when it's already active. */
  const toggleMeasure = (next: ClassListFilterMeasure) =>
    setMeasure(attentionFilter === next ? null : next);

  return {
    measure: attentionFilter ?? undefined,
    /**
     * False for the one render between a URL change from outside the page and
     * the store catching up; lists wait so they don't fetch with a stale filter.
     */
    isMeasureSynced:
      urlMeasure === attentionFilter ||
      pendingUrlWrite.current === attentionFilter,
    setMeasure,
    toggleMeasure,
  };
}
