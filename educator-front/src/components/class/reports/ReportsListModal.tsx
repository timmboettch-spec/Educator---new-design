import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ReportSortField,
  type ListReportsReqDto,
  type ReportListItemResDto,
} from '../../../redux/api/reports/reports.types';
import { buildListReportsParams } from '../../../redux/api/reports/reportsService';
import { useInfiniteReports } from '../../../hooks/useInfiniteReports';
import { cn } from '../../../lib/utils';
import Modal from '../../ui/Modal';
import SortableHeader from '../../common/SortableHeader';
import { InfiniteListFooter } from '../InfiniteListFooter';
import { SelectCheckbox } from './SelectCheckbox';
import { ReportBulkActionBar } from './ReportBulkActionBar';
import { ReportSkeletonRows } from './ReportSkeletonRows';
import { useReportTableReview } from './useReportTableReview';
import {
  REPORT_SORT_FIELDS,
  formatCompletedAt,
  getAriaSort,
  formatTimeSpent,
  getModeBadgeClass,
} from './reportTableFormat';

export interface ReportsListModalDetail {
  label: string;
  value?: string;
}

export type ReportsListFilter = Pick<
  ListReportsReqDto,
  'classIds' | 'simulationIds' | 'studentIds' | 'schoolIds'
>;

export interface ReportsListModalProps {
  /** Modal title; "Reports" by default. */
  title?: string;
  /** Lines under the title, e.g. School / Class / Simulation; empty values are hidden. */
  details: ReportsListModalDetail[];
  /** Which reports to list. */
  filter: ReportsListFilter;
  /** The class the reports belong to, for bulk review. */
  classId: string;
  /** Show row selection and bulk review; off when review can't run (e.g. no class). */
  canReview?: boolean;
  /** Replaces the default "mark all", e.g. to scope it to the filtered reports. */
  onMarkAll?: (reviewed: boolean) => Promise<boolean>;
  onViewReport: (row: ReportListItemResDto) => void;
  onViewTranscript: (row: ReportListItemResDto) => void;
  /** Extra actions after View Report / View Transcript, e.g. an LMS sync. */
  renderRowExtraActions?: (row: ReportListItemResDto) => ReactNode;
  /** The empty state's second line; the generic text by default. */
  emptySubtitle?: string;
  /** Shown when a row has no simulation name. */
  fallbackSimulationName?: string;
  onClose: () => void;
}

const PAGE_SIZE = 10;
const COLUMN_COUNT = 9;

const pillBase =
  'inline-flex items-center justify-center px-2 py-1 border text-[12px] rounded-full font-medium transition-colors whitespace-nowrap cursor-pointer';
const pillNeutral =
  'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100';

/**
 * A modal listing reports from GET /api/simulation-reports/list, sorted server-side and
 * loaded page by page as the table scrolls, with row selection and bulk review. Callers
 * choose the reports (`filter`) and what the row actions do.
 */
export function ReportsListModal({
  title,
  details,
  filter,
  classId,
  canReview = true,
  onMarkAll,
  onViewReport,
  onViewTranscript,
  renderRowExtraActions,
  fallbackSimulationName,
  emptySubtitle,
  onClose,
}: ReportsListModalProps) {
  const { t } = useTranslation('classManagement');
  const scrollRootRef = useRef<HTMLDivElement>(null);

  const [sortField, setSortField] = useState('completedAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const params = buildListReportsParams({
    ...filter,
    pageSize: PAGE_SIZE,
    sortBy: REPORT_SORT_FIELDS[sortField] ?? ReportSortField.COMPLETED_AT,
    sortDirection: sortDirection === 'asc' ? 'ASC' : 'DESC',
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
    useReportTableReview(reportIds, classId, { paged: true, onMarkAll });

  const statusLabelMap: Record<string, string> = {
    exceptional: t('reportTable.statusExceptional'),
    'meets expectation': t('reportTable.statusMeetsExpectation'),
    'needs improvement': t('reportTable.statusNeedsImprovement'),
    needs_improvement: t('reportTable.statusNeedsImprovement'),
  };

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

  const handleSort = (field: string) => {
    const next =
      sortField === field && sortDirection === 'asc' ? 'desc' : 'asc';
    setSortField(field);
    setSortDirection(next);
    scrollRootRef.current?.scrollTo?.({ top: 0 });
  };

  const hasReports = rows.length > 0;
  const visibleDetails = details.filter((d) => d.value);

  const renderBody = () => {
    if (isInitialLoading) {
      return (
        <ReportSkeletonRows
          count={3}
          columnCount={COLUMN_COUNT}
          label={t('reportReview.loading')}
        />
      );
    }
    if (isLoadError) {
      return (
        <tr>
          <td
            colSpan={COLUMN_COUNT}
            className="px-3 py-8 text-center text-sm text-red-500"
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
            <p className="text-sm font-semibold text-gray-600">
              {t('reportsModal.emptyTitle')}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              {emptySubtitle ?? t('reportsModal.emptySubtitle')}
            </p>
          </td>
        </tr>
      );
    }

    return rows.map((row) => {
      const mode = row.mode?.toLowerCase();
      const modeLabel =
        mode === 'assessment'
          ? t('reportTable.modeAssessment')
          : mode === 'practice'
            ? t('reportTable.modePractice')
            : row.mode;
      const statusText =
        statusLabelMap[(row.performanceQuality ?? '').toLowerCase()] ??
        (row.performanceQuality || '—');
      const isNewReport = row.viewedAt === null;

      return (
        <tr
          key={row.reportId}
          className="border-b border-gray-100 bg-white hover:bg-gray-50 transition-colors"
        >
          <td className="px-3 py-2.5">
            {canReview && (
              <SelectCheckbox
                checked={selection.isSelected(row.reportId)}
                onChange={() => selection.toggle(row.reportId)}
                label={t('reportReview.selectReport', {
                  name: `${row.studentCode} ${row.simulationName ?? ''}`.trim(),
                })}
              />
            )}
          </td>
          <td className="px-3 py-2.5 text-gray-500 font-semibold text-sm">
            {row.studentCode || '—'}
          </td>
          <td className="px-3 py-2.5">
            {modeLabel ? (
              <span
                className={cn(
                  'px-1.5 py-0.5 rounded text-sm font-semibold',
                  getModeBadgeClass(row.mode)
                )}
              >
                {modeLabel}
              </span>
            ) : (
              <span className="text-gray-400">—</span>
            )}
          </td>
          <td className="px-3 py-2.5 text-gray-800 font-medium">
            {row.simulationName || fallbackSimulationName || '—'}
          </td>
          <td className="px-3 py-2.5 text-gray-700">
            {typeof row.score === 'number' ? `${row.score}%` : '—'}
          </td>
          <td className="px-3 py-2.5 text-sm font-medium capitalize text-gray-700">
            {statusText}
          </td>
          <td className="px-3 py-2.5 text-gray-600">
            {formatTimeSpent(row.timeSpent)}
          </td>
          <td className="px-3 py-2.5 text-gray-600">
            {formatCompletedAt(row.completedAt)}
          </td>
          <td className="px-3 py-2.5">
            <div className="flex flex-row items-center gap-1.5">
              <button
                type="button"
                onClick={() => onViewReport(row)}
                className={cn(
                  pillBase,
                  isNewReport
                    ? 'bg-primary-500 border-primary-500 text-white hover:bg-primary-600'
                    : pillNeutral
                )}
              >
                {t('reportTable.viewReport')}
              </button>
              <button
                type="button"
                onClick={() => onViewTranscript(row)}
                className={cn(pillBase, pillNeutral)}
              >
                {t('reportTable.viewTranscript')}
              </button>
              {renderRowExtraActions?.(row)}
            </div>
          </td>
        </tr>
      );
    });
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={title ?? t('reportsModal.title')}
      className="max-w-[1280px] w-full"
    >
      <div className="mb-4 text-center text-sm space-y-0.5">
        {visibleDetails.map(({ label, value }) => (
          <p key={label}>
            <span className="text-primary-500 font-semibold">{label}</span>{' '}
            <span className="text-[#5f6060] font-medium">{value}</span>
          </p>
        ))}
      </div>

      {canReview && hasReports && (
        <ReportBulkActionBar
          selectedCount={selection.selectedIds.length}
          totalCount={total ?? reportIds.length}
          onMarkSelected={markSelected}
          onMarkAll={markAll}
          busy={isReviewing}
        />
      )}

      {/* The table scrolls inside this box, so the header stays visible and the next page
          loads as its end comes into view. */}
      <div
        ref={scrollRootRef}
        aria-busy={isFetching || isReviewing}
        className="max-h-[60vh] overflow-auto rounded-xl border border-gray-200"
      >
        <table className="w-full text-sm border-separate border-spacing-0">
          <thead className="sticky top-0 z-10 bg-primary-500 text-white">
            <tr>
              <th className="px-3 py-2.5 w-10 rounded-tl-lg">
                {canReview && (
                  <SelectCheckbox
                    checked={selection.isAllSelected}
                    indeterminate={selection.isPartial}
                    onChange={selection.toggleAll}
                    label={t('reportReview.selectAll')}
                    disabled={!hasReports}
                    className="accent-white"
                  />
                )}
              </th>
              {headers.map(({ label, field }, i) => (
                <th
                  key={label}
                  aria-sort={getAriaSort(field, sortField, sortDirection)}
                  className={cn(
                    'px-3 py-2.5 text-left font-medium whitespace-nowrap',
                    i === headers.length - 1 && 'rounded-tr-lg'
                  )}
                >
                  {field ? (
                    <SortableHeader
                      label={label}
                      field={field}
                      sortField={sortField}
                      sortDirection={sortDirection}
                      onSort={handleSort}
                      focusable
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
              <ReportSkeletonRows
                count={3}
                columnCount={COLUMN_COUNT}
                label={t('reportReview.loading')}
              />
            )}
          </tbody>
        </table>

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
            loadedMoreMessage={(count) =>
              t('table.loadedMoreReports', { count })
            }
            scrollRootRef={scrollRootRef}
          />
        )}
      </div>
    </Modal>
  );
}
