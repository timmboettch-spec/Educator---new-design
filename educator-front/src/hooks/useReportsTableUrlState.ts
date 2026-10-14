import { useSearchParams } from 'react-router-dom';
import { REPORTS_TABLE_PARAMS } from '@/routes/routePath';
import { ReportReviewStatus } from '@/redux/api/reports/reports.types';

export type ReportsTableSortDir = 'asc' | 'desc';

const DEFAULT_SORT = 'completedAt';
const DEFAULT_DIR: ReportsTableSortDir = 'desc';

const parseStatus = (value: string | null): ReportReviewStatus | undefined =>
  value === ReportReviewStatus.UNREAD || value === ReportReviewStatus.READ
    ? value
    : undefined;

/**
 * Review filter and sort for one class's Reports table, kept in the URL so the view
 * can be shared and survives a reload. Params only apply to the class named in the URL.
 * `sortFields` are the accepted sort keys; anything else falls back to newest first.
 */
export function useReportsTableUrlState(
  classId: string,
  sortFields: readonly string[]
) {
  const [searchParams, setSearchParams] = useSearchParams();
  const isThisClass =
    searchParams.get(REPORTS_TABLE_PARAMS.classId) === classId;
  const read = (key: string) => (isThisClass ? searchParams.get(key) : null);

  const rawSort = read(REPORTS_TABLE_PARAMS.sort);
  const sortField =
    rawSort && sortFields.includes(rawSort) ? rawSort : DEFAULT_SORT;
  const rawDir = read(REPORTS_TABLE_PARAMS.dir);
  const sortDirection: ReportsTableSortDir =
    rawDir === 'asc' || rawDir === 'desc' ? rawDir : DEFAULT_DIR;
  const reviewStatus = parseStatus(read(REPORTS_TABLE_PARAMS.status));

  // Every write names this class and replaces the entry, so sorting doesn't flood history.
  const update = (changes: Record<string, string | null>) =>
    setSearchParams(
      (params) => {
        params.set(REPORTS_TABLE_PARAMS.classId, classId);
        Object.entries(changes).forEach(([key, value]) => {
          if (value === null) params.delete(key);
          else params.set(key, value);
        });
        return params;
      },
      { replace: true }
    );

  return {
    reviewStatus,
    sortField,
    sortDirection,
    setReviewStatus: (status: ReportReviewStatus | undefined) =>
      update({ [REPORTS_TABLE_PARAMS.status]: status ?? null }),
    setSort: (field: string, dir: ReportsTableSortDir) =>
      update({
        [REPORTS_TABLE_PARAMS.sort]: field,
        [REPORTS_TABLE_PARAMS.dir]: dir,
      }),
  };
}
