import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { MarkReportViewed } from '../../redux/class/SimsCompletedreportsRedux';
import { selectClasses } from '../../redux/class/GetClassRedux';
import {
  selectSimulationsByClassId,
  FetchSimulationsByClass,
} from '../../redux/class/GetSimsRedux';
import {
  ReportReviewStatus,
  ReportSortField,
  type ReportListItemResDto,
  type ReportSortDirection,
} from '../../redux/api/reports/reports.types';
import { buildListReportsParams } from '../../redux/api/reports/reportsService';
import { useReportsTableUrlState } from '../../hooks/useReportsTableUrlState';
import { useInfiniteReports } from '../../hooks/useInfiniteReports';
import { cn } from '../../lib/utils';
import SortableHeader from '../common/SortableHeader';
import { SkeletonRows, type SkeletonColumn } from '../ui/Skeleton';
import {
  SKELETON_INITIAL_ROW_COUNT,
  SKELETON_REFETCH_ROW_COUNT,
} from '../../utils/constants/skeleton';
import {
  useLmsGradeSync,
  hasDeletedLmsAssignment,
  lmsSyncKey,
  type LmsGradeSyncEntry,
} from '../../hooks/useLmsGradeSync';
import LmsSyncAction from './LmsSyncAction';
import { InfiniteListFooter } from './InfiniteListFooter';
import { SelectCheckbox } from './reports/SelectCheckbox';
import { ReportBulkActionBar } from './reports/ReportBulkActionBar';
import { useReportTableReview } from './reports/useReportTableReview';
import {
  REPORT_SORT_FIELDS,
  buildTranscriptState,
  formatCompletedAt,
  formatTimeSpent,
  getAriaSort,
  getModeBadgeClass,
} from './reports/reportTableFormat';

interface ReportSubTableProps {
  classId: string;
  isClassInactive?: boolean;
  // Simulation (assignment or library id) to highlight, e.g. when opened from the Sims table.
  targetScenarioId?: string;
  /** The element the class list scrolls in, so the next page loads before the end shows. */
  scrollRootRef?: RefObject<Element | null>;
}

const PAGE_SIZE = 10;
const REVIEW_FILTERS: (ReportReviewStatus | undefined)[] = [
  undefined,
  ReportReviewStatus.UNREAD,
  ReportReviewStatus.READ,
];
const COLUMN_COUNT = 9;

// Loading placeholders: checkbox, seven text columns, then the action pills.
const SKELETON_COLUMNS: SkeletonColumn[] = [
  { barClassName: 'w-4' },
  ...Array.from({ length: COLUMN_COUNT - 2 }, () => ({})),
  { barClassName: 'h-7 w-40 rounded-full' },
];

const SORT_KEYS = Object.keys(REPORT_SORT_FIELDS);

const normalizeTitle = (v: string | null | undefined) =>
  (v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Class sim due dates come as MM-DD-YYYY or ISO; due means end of that day.
const parseDueDate = (raw: string | null | undefined): Date | null => {
  if (!raw) return null;
  const mdY = raw.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  const d = mdY
    ? new Date(`${mdY[3]}-${mdY[1]}-${mdY[2]}T23:59:59`)
    : new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
};

// Start of the assignment's first day (dates come as MM-DD-YYYY or ISO).
const parseStartDate = (raw: string | null | undefined): Date | null => {
  const end = parseDueDate(raw);
  if (!end) return null;
  const d = new Date(end);
  d.setHours(0, 0, 0, 0);
  return d;
};

/**
 * The assignment a report belongs to. The list row has no assignment id yet, only the sim
 * title, and one sim can be assigned several times with different windows, so pick the
 * one whose window contains the completion, else the latest one that started before it.
 * TODO: match on the assignment id once the list API returns it.
 */
const pickAssignment = <T extends { start_date?: string; end_date?: string }>(
  assignments: T[] | undefined,
  completedAt: string | null
): T | undefined => {
  if (!assignments?.length) return undefined;
  const done = completedAt ? new Date(completedAt) : null;
  if (!done || Number.isNaN(done.getTime())) return assignments[0];
  const window = (a: T) => ({
    start: parseStartDate(a.start_date),
    end: parseDueDate(a.end_date),
  });
  const inWindow = assignments.find((a) => {
    const { start, end } = window(a);
    return (!start || start <= done) && (!end || done <= end);
  });
  if (inWindow) return inWindow;
  const startedBefore = assignments
    .map((a) => ({ a, start: window(a).start }))
    .filter((x) => x.start && x.start <= done)
    .sort((x, y) => (y.start?.getTime() ?? 0) - (x.start?.getTime() ?? 0));
  return startedBefore[0]?.a ?? assignments[0];
};

const getScoreColorClass = (score: number | null): string => {
  if (score === null) return 'text-gray-600';
  if (score > 90) return 'text-blue-600';
  if (score >= 75) return 'text-green-600';
  return 'text-red-600';
};

/**
 * A class's reports, loaded page by page as the class list scrolls, from
 * GET /api/simulation-reports/list with server-side sorting, plus row / select-all selection and bulk review (RE-38).
 */
export default function ReportSubTable({
  classId,
  isClassInactive,
  targetScenarioId,
  scrollRootRef,
}: ReportSubTableProps) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation('classManagement');

  const { reviewStatus, sortField, sortDirection, setReviewStatus, setSort } =
    useReportsTableUrlState(classId, SORT_KEYS);
  const [highlightedTitle, setHighlightedTitle] = useState<string | null>(null);
  const firstMatchRef = useRef<HTMLTableRowElement | null>(null);

  const allClasses = useAppSelector(selectClasses);
  const classSims = useAppSelector(selectSimulationsByClassId(classId));
  const lmsSync = useLmsGradeSync(classId);

  useEffect(() => {
    if (classSims === null) {
      dispatch(FetchSimulationsByClass({ classId }));
    }
  }, [classId, classSims, dispatch]);

  const sortBy = REPORT_SORT_FIELDS[sortField] ?? ReportSortField.COMPLETED_AT;
  const apiSortDirection: ReportSortDirection =
    sortDirection === 'asc' ? 'ASC' : 'DESC';
  const params = buildListReportsParams({
    pageSize: PAGE_SIZE,
    classIds: [classId],
    reviewStatus,
    sortBy,
    sortDirection: apiSortDirection,
  });
  const {
    rows,
    total,
    isInitialLoading,
    isLoadError,
    isFetching,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    isRefreshError,
    fetchNextPage,
    refetch,
  } = useInfiniteReports(params);

  const reportIds = useMemo(() => rows.map((r) => r.reportId), [rows]);
  const { selection, isReviewing, markSelected, markAll } =
    useReportTableReview(reportIds, classId, { paged: true });
  const clearSelection = selection.clear;

  // A new filter is a new result set: drop the selection (also on back/forward in the URL).
  useEffect(() => {
    clearSelection();
  }, [reviewStatus, clearSelection]);

  // The list row carries codes/names only; resolve the class's student and sim from them.
  const studentsByCode = useMemo(() => {
    const cls = allClasses?.find((c) => c.id === classId);
    return new Map(
      (cls?.students ?? [])
        .filter((s) => s.student_id)
        .map((s) => [String(s.student_id), s])
    );
  }, [allClasses, classId]);

  // Every assignment per sim title: a sim can be assigned more than once (see pickAssignment).
  const simsByTitle = useMemo(() => {
    const map = new Map<string, NonNullable<typeof classSims>>();
    for (const sim of classSims ?? []) {
      const key = normalizeTitle(sim.simulation_title);
      map.set(key, [...(map.get(key) ?? []), sim]);
    }
    return map;
  }, [classSims]);

  const visibleLmsStatuses = useMemo(() => {
    const visible: Record<string, LmsGradeSyncEntry> = {};
    for (const row of rows) {
      if (row.mode?.toLowerCase() !== 'assessment') continue;
      const student = studentsByCode.get(row.studentCode);
      const sim = pickAssignment(
        simsByTitle.get(normalizeTitle(row.simulationName)),
        row.completedAt
      );
      if (!student?.id || !sim?.simulation_id) continue;
      const key = lmsSyncKey(String(sim.simulation_id), String(student.id));
      const entry = lmsSync.statuses[key];
      if (entry) visible[key] = entry;
    }
    return visible;
  }, [rows, studentsByCode, simsByTitle, lmsSync.statuses]);

  // Highlight the target sim's rows briefly when opened from the Sims table.
  const targetTitle = useMemo(() => {
    if (!targetScenarioId) return null;
    const sim = (classSims ?? []).find(
      (s) =>
        String(s.id) === targetScenarioId ||
        String(s.simulation_id) === targetScenarioId
    );
    return sim ? normalizeTitle(sim.simulation_title) : null;
  }, [targetScenarioId, classSims]);

  const firstMatchIndex = highlightedTitle
    ? rows.findIndex(
        (r) => normalizeTitle(r.simulationName) === highlightedTitle
      )
    : -1;

  useEffect(() => {
    if (!targetTitle) return;
    if (!rows.some((r) => normalizeTitle(r.simulationName) === targetTitle))
      return;
    setHighlightedTitle(targetTitle);
    const timer = setTimeout(() => setHighlightedTitle(null), 2500);
    return () => clearTimeout(timer);
  }, [targetTitle, rows]);

  useEffect(() => {
    if (firstMatchIndex >= 0 && firstMatchRef.current) {
      firstMatchRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [firstMatchIndex]);

  const headers = [
    { label: t('reportTable.studentCode'), field: 'studentCode' },
    { label: t('reportTable.mode'), field: 'mode' },
    { label: t('reportTable.simulationName'), field: 'simulationName' },
    { label: t('reportTable.score'), field: 'score' },
    { label: t('reportReview.columns.performanceQuality'), field: '' },
    { label: t('reportTable.timeSpent'), field: 'timeSpent' },
    { label: t('reportTable.completedAt'), field: 'completedAt' },
    { label: t('rowActions.viewReport'), field: '' },
  ];

  const handleSort = (field: string) =>
    setSort(
      field,
      sortField === field && sortDirection === 'asc' ? 'desc' : 'asc'
    );

  const statusLabelMap: Record<string, string> = {
    exceptional: t('reportTable.statusExceptional'),
    'meets expectation': t('reportTable.statusMeetsExpectation'),
    'needs improvement': t('reportTable.statusNeedsImprovement'),
    needs_improvement: t('reportTable.statusNeedsImprovement'),
  };

  function handleViewReport(row: ReportListItemResDto, studentName: string) {
    dispatch(MarkReportViewed({ reportId: row.reportId, classId }));
    // The detail page loads the full report by id.
    navigate('/report-detail', {
      state: {
        report: {
          id: row.reportId,
          class_id: classId,
          mode: row.mode,
          scenarioTitle: row.simulationName,
          student_name: studentName,
        },
        // Keep the table's filter / sort for when the educator comes back.
        backPath: `/classes${location.search}`,
        backState: { classId, expandType: 'reports' },
      },
    });
  }

  function handleViewTranscript(row: ReportListItemResDto) {
    navigate(`/transcript/${row.reportId}`, {
      state: buildTranscriptState(
        row.simulationName,
        row.mode,
        row.completedAt
      ),
    });
  }

  const hasReports = rows.length > 0;
  const actionButtonBase =
    'inline-flex items-center justify-center px-2.5 py-1 border text-[11px] rounded-full font-medium transition-colors whitespace-nowrap';
  const disabledButton =
    'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed';

  const renderBody = () => {
    // First load and sort/filter changes load in the body only; a refresh after a
    // review keeps the loaded rows.
    if (isInitialLoading) {
      return (
        <SkeletonRows
          rows={SKELETON_INITIAL_ROW_COUNT}
          columns={SKELETON_COLUMNS}
          label={t('reportReview.loading')}
          rowClassName="border-t border-gray-100"
          cellClassName="px-4 py-5"
        />
      );
    }
    if (isLoadError) {
      return (
        <tr>
          <td
            colSpan={COLUMN_COUNT}
            className="px-3 py-10 text-center text-sm text-red-500"
          >
            {t('reportReview.loadError')}
          </td>
        </tr>
      );
    }
    if (!hasReports) {
      return (
        <tr>
          <td colSpan={COLUMN_COUNT} className="px-3 py-10 text-center">
            <div className="flex flex-col items-center gap-2">
              <p className="text-sm font-semibold text-gray-600">
                {reviewStatus
                  ? t('reportReview.noMatches')
                  : t('reportTable.noReportTitle')}
              </p>
              {!reviewStatus && (
                <p className="text-xs text-gray-400">
                  {t('reportTable.noReportSubtitle')}
                </p>
              )}
            </div>
          </td>
        </tr>
      );
    }

    return rows.map((row, i) => {
      const student = studentsByCode.get(row.studentCode);
      const studentName = student?.student_name || '—';
      const sim = pickAssignment(
        simsByTitle.get(normalizeTitle(row.simulationName)),
        row.completedAt
      );
      const mode = row.mode?.toLowerCase();
      const isAssessment = mode === 'assessment';
      const isPractice = mode === 'practice';
      const modeLabel = isAssessment
        ? t('reportTable.modeAssessment')
        : isPractice
          ? t('reportTable.modePractice')
          : row.mode || '—';
      const modeBadgeClass = getModeBadgeClass(row.mode);
      const score = typeof row.score === 'number' ? row.score : null;
      const statusText =
        statusLabelMap[(row.performanceQuality ?? '').toLowerCase()] ??
        (row.performanceQuality || '—');

      const completed = row.completedAt ? new Date(row.completedAt) : null;
      const due = parseDueDate(sim?.due_date ?? sim?.end_date);
      const isLate = isAssessment && !!completed && !!due && completed > due;
      const completedAtColor = !completed
        ? 'text-gray-500'
        : !due
          ? 'text-gray-700'
          : completed <= due
            ? 'text-green-600'
            : 'text-red-500';

      const isNewReport = row.viewedAt === null;
      const simulationName = row.simulationName?.trim() ?? '';
      const isTargetRow =
        !!highlightedTitle &&
        normalizeTitle(row.simulationName) === highlightedTitle;

      return (
        <tr
          key={row.reportId}
          ref={i === firstMatchIndex ? firstMatchRef : undefined}
          className={`border-t border-gray-100 hover:bg-gray-50 transition-colors ${
            isTargetRow
              ? 'bg-primary-100'
              : isNewReport
                ? 'bg-primary-50/30'
                : ''
          }`}
        >
          <td className="px-4 py-3">
            <SelectCheckbox
              checked={selection.isSelected(row.reportId)}
              onChange={() => selection.toggle(row.reportId)}
              label={t('reportReview.selectReport', {
                name: `${studentName} ${row.simulationName}`,
              })}
              disabled={isClassInactive}
            />
          </td>
          <td className="px-4 py-3 text-[13px] font-mono text-gray-700">
            {row.studentCode || '—'}
          </td>
          <td className="px-4 py-3">
            <span
              className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${modeBadgeClass}`}
            >
              {modeLabel}
            </span>
          </td>
          <td className="px-4 py-3 text-[15px] text-gray-700">
            <div className="flex items-center gap-2">
              {simulationName || '—'}
              {/* With no name there's nothing to badge; the row tint and the filled
                  View Report button still mark it unread. */}
              {isNewReport && simulationName && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-primary-500 text-white leading-none tracking-wide">
                  {t('reportTable.badgeNew')}
                </span>
              )}
            </div>
          </td>
          <td className="px-4 py-3 text-[15px] font-medium text-gray-700">
            {score !== null ? `${score}%` : '—'}
          </td>
          <td
            className={`px-4 py-3 text-[14px] capitalize font-medium ${getScoreColorClass(score)}`}
          >
            {statusText}
          </td>
          <td className="px-4 py-3 text-[15px] text-gray-500">
            {formatTimeSpent(row.timeSpent)}
          </td>
          <td
            className={`px-4 py-3 text-[15px] font-medium ${completedAtColor}`}
          >
            <div className="flex items-center gap-1.5 flex-wrap">
              {formatCompletedAt(row.completedAt)}
              {isLate && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-500 text-white leading-none tracking-wide whitespace-nowrap">
                  {t('reportTable.badgeLate')}
                </span>
              )}
            </div>
          </td>
          <td className="px-4 py-3">
            <div className="flex flex-row flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={isClassInactive}
                onClick={() =>
                  !isClassInactive && handleViewReport(row, studentName)
                }
                className={`${actionButtonBase} ${
                  isClassInactive
                    ? disabledButton
                    : isNewReport
                      ? 'bg-primary-500 border-primary-500 text-white hover:bg-primary-600 cursor-pointer'
                      : 'bg-primary-50 border-primary-200 text-primary-600 hover:bg-primary-100 cursor-pointer'
                }`}
              >
                {t('reportTable.viewReport')}
              </button>
              <button
                type="button"
                disabled={isClassInactive}
                onClick={() => !isClassInactive && handleViewTranscript(row)}
                className={`${actionButtonBase} ${
                  isClassInactive
                    ? disabledButton
                    : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100 cursor-pointer'
                }`}
              >
                {t('reportTable.viewTranscript')}
              </button>
              <LmsSyncAction
                sync={lmsSync}
                mode={row.mode}
                simulationId={sim?.simulation_id}
                studentId={student?.id}
              />
            </div>
          </td>
        </tr>
      );
    });
  };

  return (
    <div className="relative mx-3 my-4 rounded-xl border border-gray-200 bg-white shadow-md overflow-hidden transition-opacity duration-150 ease-out">
      {hasDeletedLmsAssignment(visibleLmsStatuses) && (
        <div
          role="status"
          className="mx-4 mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] leading-snug text-amber-900"
        >
          <AlertCircle
            size={14}
            aria-hidden="true"
            className="mt-0.5 shrink-0"
          />
          <span>{t('reportReview.lmsAssignmentDeleted')}</span>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3 px-4 pt-3 pb-1">
        <div
          role="group"
          aria-label={t('reportReview.filterLabel')}
          className="inline-flex items-center rounded-full bg-[#e9e9e9] p-0.5 text-xs font-semibold"
        >
          {REVIEW_FILTERS.map((status) => (
            <button
              key={status ?? 'all'}
              type="button"
              aria-pressed={reviewStatus === status}
              onClick={() => setReviewStatus(status)}
              className={cn(
                'px-3 py-1 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400',
                reviewStatus === status
                  ? 'bg-primary-500 text-white'
                  : 'text-[#5f6060]'
              )}
            >
              {t(`reportReview.filters.${status ?? 'all'}`)}
            </button>
          ))}
        </div>
        {hasReports && (
          <div className="flex-1 min-w-0 [&>div]:mb-0">
            <ReportBulkActionBar
              selectedCount={selection.selectedIds.length}
              totalCount={total ?? reportIds.length}
              onMarkSelected={markSelected}
              onMarkAll={markAll}
              busy={isReviewing}
              disabled={isClassInactive}
            />
          </div>
        )}
      </div>
      {/* Horizontal scroll only: the class list is the one vertical scroller, and loads
          the next page of reports as the end of this table comes into view. */}
      <div
        aria-busy={isFetching || isReviewing}
        className="overflow-x-auto border-t border-gray-200"
      >
        <table className="w-full min-w-[1124px] table-auto text-sm">
          <colgroup>
            <col className="w-[44px]" />
            <col className="w-[130px]" />
            <col className="w-[110px]" />
            <col />
            <col className="w-[70px]" />
            <col className="w-[150px]" />
            <col className="w-[95px]" />
            <col className="w-[155px]" />
            <col className="w-[240px]" />
          </colgroup>
          <thead className="bg-[#5a6475]">
            <tr className="bg-[#5a6475] text-white text-left">
              <th className="px-4 py-3 w-[44px]">
                <SelectCheckbox
                  checked={selection.isAllSelected}
                  indeterminate={selection.isPartial}
                  onChange={selection.toggleAll}
                  label={t('reportReview.selectAll')}
                  disabled={!hasReports || isClassInactive}
                  className="accent-white"
                />
              </th>
              {headers.map(({ label, field }) => (
                <th
                  key={label}
                  aria-sort={getAriaSort(field, sortField, sortDirection)}
                  className="px-4 py-3 font-semibold text-sm text-left whitespace-nowrap"
                >
                  {field ? (
                    <SortableHeader
                      label={label}
                      field={field}
                      sortField={sortField}
                      sortDirection={sortDirection}
                      onSort={handleSort}
                    />
                  ) : (
                    label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {renderBody()}
            {isFetchingNextPage && (
              <SkeletonRows
                rows={SKELETON_REFETCH_ROW_COUNT}
                columns={SKELETON_COLUMNS}
                label={t('reportReview.loading')}
                rowClassName="border-t border-gray-100"
                cellClassName="px-4 py-5"
              />
            )}
          </tbody>
        </table>
      </div>
      {hasReports && (
        <InfiniteListFooter
          key={JSON.stringify(params)}
          itemCount={rows.length}
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          isFetching={isFetching}
          isFetchNextPageError={isFetchNextPageError}
          fetchNextPage={() => void fetchNextPage()}
          isRefreshError={isRefreshError}
          refetch={() => void refetch()}
          endMessage={t('table.endOfReports')}
          shouldShowLoadingMessage={false}
          loadedMoreMessage={(count) => t('table.loadedMoreReports', { count })}
          scrollRootRef={scrollRootRef}
        />
      )}
    </div>
  );
}
