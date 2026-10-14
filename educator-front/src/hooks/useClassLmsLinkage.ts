import { useEffect, useMemo, useState } from 'react';
import api from '../redux/api';
import config from '../redux/config';

export type ClassLinkageProvider =
  'moodle' | 'canvas' | 'google_classroom' | 'lms';

export interface ClassLinkageAssignment {
  simulationId: string;
  label: string | null;
  url: string | null;
}

export interface ClassLinkageCourse {
  id: string;
  name: string | null;
  url: string | null;
}

export interface ClassLmsLinkage {
  provider: ClassLinkageProvider | null;
  course: ClassLinkageCourse | null;
  assignments: ClassLinkageAssignment[];
}

const UNLINKED: ClassLmsLinkage = {
  provider: null,
  course: null,
  assignments: [],
};

export interface ClassLmsLinkageView extends ClassLmsLinkage {
  assignmentBySimulationId: Map<string, ClassLinkageAssignment>;
}

export function useClassLmsLinkage(
  classId: string,
  linked = true
): ClassLmsLinkageView {
  const [linkage, setLinkage] = useState<ClassLmsLinkage>(UNLINKED);

  useEffect(() => {
    if (!classId || !linked) {
      setLinkage(UNLINKED);
      return;
    }
    let cancelled = false;
    api
      .get<{ data?: ClassLmsLinkage }>(
        `${config.ClassAPI}/${classId}/lms-linkage`
      )
      .then((res) => {
        if (!cancelled) setLinkage(res.data?.data ?? UNLINKED);
      })
      .catch(() => {
        if (!cancelled) setLinkage(UNLINKED);
      });
    return () => {
      cancelled = true;
    };
  }, [classId, linked]);

  return useMemo(
    () => ({
      ...linkage,
      assignmentBySimulationId: new Map(
        linkage.assignments
          .filter((a) => a.simulationId)
          .map((a) => [a.simulationId, a])
      ),
    }),
    [linkage]
  );
}
