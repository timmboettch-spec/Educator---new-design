import { useMemo } from 'react';
import type { ClassWithStudents } from '../types/Class_types';
import type { SimulationReportItem } from '../redux/simulation/GetSimulationReportsRedux';

type ClassResponse = {
  data?: {
    classes?: ClassWithStudents[];
  };
};

export interface UseClassDerivedDataParams {
  classResponse: ClassResponse | null;
  reports: SimulationReportItem[];
  needAttentionByClassId: Record<string, number>;
  needsAttentionByIdMap: Record<string, boolean>;
}

/**
 * Normalizes the raw class list and derives the two lookups that both
 * filtering and sorting depend on: per-class "needs attention" and
 * per-class reports. Must run *before* `useClassFilters`, which consumes
 * `allClasses`/`localNeedsAttentionById` to produce `filteredClasses`.
 */
export function useClassDerivedData({
  classResponse,
  reports,
  needAttentionByClassId,
  needsAttentionByIdMap,
}: UseClassDerivedDataParams) {
  const allClasses = useMemo<ClassWithStudents[]>(
    () =>
      classResponse?.data?.classes?.map((cls) => ({
        ...cls,
        sims: cls.sims ?? [],
        students: cls.students ?? [],
      })) ?? [],
    [classResponse]
  );

  const localNeedsAttentionById = useMemo<Record<string, boolean>>(() => {
    const result: Record<string, boolean> = {};
    for (const cls of allClasses) {
      const id = cls.id;
      if (id in needAttentionByClassId) {
        result[id] = (needAttentionByClassId[id] ?? 0) > 0;
      } else if (id in needsAttentionByIdMap) {
        result[id] = needsAttentionByIdMap[id] === true;
      } else {
        result[id] = cls.needsAttention === true;
      }
    }
    return result;
  }, [allClasses, needsAttentionByIdMap, needAttentionByClassId]);

  const reportsByClassId = useMemo(() => {
    const map = new Map<string, SimulationReportItem[]>();
    for (const cls of allClasses) {
      const userIds = new Set<string>();
      for (const s of cls.students ?? []) {
        if (s.user_id) userIds.add(s.user_id);
        if (s.student_id) userIds.add(s.student_id);
      }
      map.set(
        cls.id,
        reports.filter((r) => r.userId != null && userIds.has(r.userId))
      );
    }
    return map;
  }, [allClasses, reports]);

  return { allClasses, localNeedsAttentionById, reportsByClassId };
}
