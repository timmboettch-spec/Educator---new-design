import { useCallback, useEffect, useState } from 'react';
import api from '../redux/api';
import config from '../redux/config';

export type LmsGradeSyncStatus = 'sent' | 'failed';

export type LmsSyncFailureReason =
  | 'lms_configuration'
  | 'lms_authentication'
  | 'lms_assignment_not_found'
  | 'lms_rejected_grade'
  | 'lms_unreachable'
  | 'unknown';

interface LmsGradeSyncRow {
  simulationId: string;
  studentId: string;
  status: LmsGradeSyncStatus;
  failureReason?: LmsSyncFailureReason;
}

export interface LmsGradeSyncEntry {
  status: LmsGradeSyncStatus;
  failureReason?: LmsSyncFailureReason;
}

export interface LmsGradeSync {
  statuses: Record<string, LmsGradeSyncEntry>;
  resyncing: Record<string, boolean>;
  resync: (simulationId: string, studentId: string) => Promise<boolean>;
}

export const lmsSyncKey = (simulationId: string, studentId: string): string =>
  `${simulationId}:${studentId}`;

export const hasDeletedLmsAssignment = (
  statuses: Record<string, LmsGradeSyncEntry>
): boolean =>
  Object.values(statuses).some(
    (entry) => entry.failureReason === 'lms_assignment_not_found'
  );

export function useLmsGradeSync(classId: string): LmsGradeSync {
  const [statuses, setStatuses] = useState<Record<string, LmsGradeSyncEntry>>(
    {}
  );
  const [resyncing, setResyncing] = useState<Record<string, boolean>>({});
  const url = `${config.SimsclassCompletedReport}/${classId}/lms-grade-sync`;

  const load = useCallback(async () => {
    const res = await api.get<{ data?: LmsGradeSyncRow[] }>(url);
    return Object.fromEntries(
      (res.data?.data ?? []).map((r) => [
        lmsSyncKey(r.simulationId, r.studentId),
        { status: r.status, failureReason: r.failureReason },
      ])
    );
  }, [url]);

  useEffect(() => {
    let cancelled = false;
    load()
      .then((next) => {
        if (!cancelled) setStatuses(next);
      })
      .catch(() => {
        if (!cancelled) setStatuses({});
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const resync = async (
    simulationId: string,
    studentId: string
  ): Promise<boolean> => {
    const key = lmsSyncKey(simulationId, studentId);
    setResyncing((prev) => ({ ...prev, [key]: true }));
    let ok = false;
    try {
      const res = await api.post<{ data?: { status?: LmsGradeSyncStatus } }>(
        url,
        { scenarioId: simulationId, studentId }
      );
      ok = res.data?.data?.status === 'sent';
    } catch {
      ok = false;
    }
    const next = await load().catch(() => null);
    setStatuses(
      (prev) => next ?? (ok ? { ...prev, [key]: { status: 'sent' } } : prev)
    );
    setResyncing((prev) => ({ ...prev, [key]: false }));
    return ok;
  };

  return { statuses, resyncing, resync };
}
