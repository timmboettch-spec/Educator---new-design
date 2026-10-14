import { ReportSortField } from '@/redux/api/reports/reports.types';

// Table header field → BE sort key. Performance quality isn't sortable on the BE.
export const REPORT_SORT_FIELDS: Record<string, ReportSortField> = {
  studentCode: ReportSortField.STUDENT_CODE,
  mode: ReportSortField.MODE,
  simulationName: ReportSortField.SIMULATION_NAME,
  score: ReportSortField.SCORE,
  timeSpent: ReportSortField.TIME_SPENT,
  completedAt: ReportSortField.COMPLETED_AT,
};

/** "HH:MM:SS" → "1h 5m" / "12m 34s" / "9s", matching the other report tables. */
export const formatTimeSpent = (value: string | null | undefined): string => {
  const parts = (value ?? '').split(':').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    return value || '—';
  }
  const [h = 0, m = 0, s = 0] = parts;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

/** ISO → "MM/DD/YYYY HH:mm" in local time. */
export const formatCompletedAt = (value: string | null | undefined): string => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** Mode badge colours: assessment blue, practice green, anything else gray. */
export const getModeBadgeClass = (mode: string | null | undefined): string => {
  const m = mode?.toLowerCase();
  if (m === 'assessment') return 'bg-blue-50 text-blue-700';
  if (m === 'practice') return 'bg-green-50 text-green-700';
  return 'bg-gray-50 text-gray-500';
};

/** Navigation state the transcript page expects ("Oct 05" / "14:30"). */
export const buildTranscriptState = (
  simulationName: string | null,
  mode: string | null,
  completedAt: string | null
) => {
  const d = completedAt ? new Date(completedAt) : null;
  const valid = d && !Number.isNaN(d.getTime());
  return {
    simulationName,
    reportMode: mode,
    simulationDate: valid
      ? d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' })
      : '',
    simulationTime: valid
      ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
      : '',
  };
};

/**
 * A sortable column's aria-sort: its direction while it is the sort, "none" otherwise.
 * Undefined for a column that can't be sorted (`field` empty).
 */
export const getAriaSort = (
  field: string,
  sortField: string,
  sortDirection: 'asc' | 'desc'
): 'ascending' | 'descending' | 'none' | undefined => {
  if (!field) return undefined;
  if (field !== sortField) return 'none';
  return sortDirection === 'asc' ? 'ascending' : 'descending';
};
