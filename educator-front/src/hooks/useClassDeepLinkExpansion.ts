import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { REPORTS_TABLE_PARAMS } from '@/routes/routePath';

export type ExpandedType = 'students' | 'sims' | 'reports' | null;

type LocationState = {
  classId?: string;
  expandType?: 'students' | 'sims' | 'reports';
  simulationId?: string;
  openReportsModal?: boolean;
  openStudentReports?: boolean;
  studentId?: string;
  pinStudentId?: string;
  openSimReports?: boolean;
  simId?: string;
};

/** Flags that reopen a report modal once, e.g. on a "back" link from a report page. */
type OneShotFlags = Pick<
  LocationState,
  'openReportsModal' | 'openStudentReports' | 'openSimReports'
>;

const NO_FLAGS: OneShotFlags = {
  openReportsModal: undefined,
  openStudentReports: undefined,
  openSimReports: undefined,
};

const pickOneShotFlags = (state: LocationState | null): OneShotFlags => ({
  openReportsModal: state?.openReportsModal,
  openStudentReports: state?.openStudentReports,
  openSimReports: state?.openSimReports,
});

export interface UseClassDeepLinkExpansionParams {
  allClassesLength: number;
  setSearchTerm: (term: string) => void;
  /** Resets both the draft and applied filter state to empty. */
  resetFilters: () => void;
}

/**
 * Owns row-expansion state and the deep-link navigation that can drive it:
 * clearing one-shot "open modal" flags from `location.state` on mount (so a
 * refresh doesn't reopen them), and auto-expanding a target class's sub-table
 * when navigated here with classId/expandType in state (e.g. from a
 * notification link).
 *
 * The class table mounts only once its school/class queries load, after the
 * router state is cleared, so the returned `locationState` keeps the flags from
 * mount until the user first expands or collapses a row.
 */
export function useClassDeepLinkExpansion({
  allClassesLength,
  setSearchTerm,
  resetFilters,
}: UseClassDeepLinkExpansionParams) {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const locationState = location.state as LocationState | null;
  // ?reportsClass=<id> (shared or reloaded URL) re-opens that class's Reports table, so it
  // is also the target class the page scrolls to and whose school it opens.
  const reportsClassParam = searchParams.get(REPORTS_TABLE_PARAMS.classId);
  const targetClassId = locationState?.classId ?? reportsClassParam ?? null;
  const targetSimulationId = locationState?.simulationId ?? null;

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedType, setExpandedType] = useState<ExpandedType>(null);
  const [oneShotFlags, setOneShotFlags] = useState(() =>
    pickOneShotFlags(locationState)
  );
  const deepLinkState = useMemo(
    () => (locationState ? { ...locationState, ...oneShotFlags } : null),
    [locationState, oneShotFlags]
  );

  useEffect(() => {
    const hasFlag =
      locationState?.openReportsModal ||
      locationState?.openStudentReports ||
      locationState?.openSimReports;
    if (hasFlag) {
      navigate('.', {
        replace: true,
        state: {
          ...locationState,
          openReportsModal: undefined,
          openStudentReports: undefined,
          openSimReports: undefined,
        },
      });
    }
    // Mount-only: clears one-shot navigation flags.
  }, []);

  const lastAppliedExpansion = useRef('');
  useEffect(() => {
    if (
      !locationState?.classId ||
      !locationState?.expandType ||
      allClassesLength === 0
    ) {
      return;
    }

    const expansionKey = `${location.key}:${locationState.classId}:${locationState.expandType}:${locationState.simulationId ?? ''}`;
    if (lastAppliedExpansion.current === expansionKey) {
      return;
    }

    lastAppliedExpansion.current = expansionKey;
    setSearchTerm('');
    resetFilters();
    setExpandedId(locationState.classId);
    setExpandedType(locationState.expandType);
  }, [
    location.key,
    locationState,
    allClassesLength,
    setSearchTerm,
    resetFilters,
  ]);

  const restoredReportsClass = useRef<string | null>(null);
  useEffect(() => {
    if (!reportsClassParam || allClassesLength === 0) return;
    if (restoredReportsClass.current === reportsClassParam) return;
    restoredReportsClass.current = reportsClassParam;
    setExpandedId(reportsClassParam);
    setExpandedType('reports');
  }, [reportsClassParam, allClassesLength]);

  const toggleExpand = useCallback(
    (
      id: string,
      type: 'students' | 'sims' | 'reports',
      e: React.MouseEvent | React.KeyboardEvent
    ) => {
      e.stopPropagation();
      // The user has taken over; don't reopen a deep-linked modal on re-expand.
      setOneShotFlags(NO_FLAGS);

      const isClosing = expandedId === id && expandedType === type;
      if (isClosing) {
        setExpandedId(null);
        setExpandedType(null);
      } else {
        setExpandedId(id);
        setExpandedType(type);
      }
      // The Reports table's URL state belongs to the open table: drop the old one, and
      // name the class when a Reports table opens so a reload re-opens it.
      const openingReports = !isClosing && type === 'reports';
      if (expandedType === 'reports' || openingReports) {
        restoredReportsClass.current = openingReports ? id : null;
        setSearchParams(
          (params) => {
            Object.values(REPORTS_TABLE_PARAMS).forEach((key) =>
              params.delete(key)
            );
            if (openingReports) params.set(REPORTS_TABLE_PARAMS.classId, id);
            return params;
          },
          { replace: true }
        );
      }
    },
    [expandedId, expandedType, setSearchParams]
  );

  return {
    expandedId,
    expandedType,
    toggleExpand,
    locationState: deepLinkState,
    targetClassId,
    targetSimulationId,
  };
}
