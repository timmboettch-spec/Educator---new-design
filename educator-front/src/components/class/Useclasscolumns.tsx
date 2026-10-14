import { ChevronDown, GraduationCap, Monitor } from 'lucide-react';
import { LmsLinkagePill } from '../ui/LmsLinkagePill';
import { useTranslation } from 'react-i18next';
import { formatDisplayDate } from '../../utils/displayDate';
import type { Column } from '../../components/common/ListTable';
import SortableHeader from '../../components/common/SortableHeader';
import type { ClassWithStudents } from '../../types/Class_types';
import { getStatusLabel } from '../../types/Class_types';
import { getEffectiveClassStatus } from '../../utils/classUtils';
import { useAppSelector } from '../../store/hooks';
import { selectSimulationsByClassId } from '../../redux/class/GetSimsRedux';
import {
  selectEducatorReports,
  selectEducatorReportsStatus,
} from '../../redux/reports/EducatorReportsRedux';
import {
  selectViewedReportIds,
  isReportNew,
} from '../../redux/class/GetClassRedux';
import ReportsNotificationBadge from '../ui/ReportsNotificationBadge';
import StatusBadge from '../ui/StatusBadge';
import { getStatusTone } from '../../utils/statusTone';

const formatClassDate = (d?: string) => formatDisplayDate(d, '—');

function toSafeNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

interface ClassColumnsProps {
  sortField: keyof ClassWithStudents | null;
  sortDirection: 'asc' | 'desc' | null;
  onSort: (field: keyof ClassWithStudents) => void;
  expandedId: string | null;
  expandedType: 'students' | 'sims' | 'reports' | null;
  onToggleExpand: (
    id: string,
    type: 'students' | 'sims' | 'reports',
    e: React.MouseEvent | React.KeyboardEvent
  ) => void;
}

function ReportsBadge({
  row,
  expandedId,
  expandedType,
  onToggleExpand,
}: {
  row: ClassWithStudents;
  expandedId: string | null;
  expandedType: 'students' | 'sims' | 'reports' | null;
  onToggleExpand: (
    id: string,
    type: 'students' | 'sims' | 'reports',
    e: React.MouseEvent | React.KeyboardEvent
  ) => void;
}) {
  const selected = expandedId === row.id && expandedType === 'reports';
  const { t } = useTranslation('classManagement');
  const educatorReports = useAppSelector(selectEducatorReports);
  const educatorReportsStatus = useAppSelector(selectEducatorReportsStatus);
  const viewedReportIds = useAppSelector(selectViewedReportIds);

  // Count reports whose userId matches any known student identifier in this class.
  // Some APIs return user_id while others return student_id; include both so
  // report counts remain stable after refresh/navigation.
  const studentIds = new Set(
    (row.students ?? [])
      .flatMap((s) => [s.user_id, s.student_id])
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      .map((v) => v.trim())
  );
  const classReports = educatorReports.filter(
    (r) => r.userId != null && studentIds.has(String(r.userId).trim())
  );
  const isReportsLoading = educatorReportsStatus === 'loading';
  const liveDataReady = educatorReportsStatus === 'succeeded';
  const fallbackCount =
    typeof row.reportCount === 'number'
      ? row.reportCount
      : Array.isArray(row.reports)
        ? row.reports.length
        : toSafeNumber(row.reports);
  // The class-list API count wins; otherwise count the educator's reports.
  const reportCount =
    row.reportsCount ?? (liveDataReady ? classReports.length : fallbackCount);
  // Use the shared isReportNew helper so class-level badge logic is
  // identical to student-level and report-level logic.
  const newCount = classReports.filter((r) =>
    isReportNew(r.id, r.isNew, viewedReportIds)
  ).length;
  const hasNewReports = liveDataReady
    ? newCount > 0
    : row.needsAttention === true || toSafeNumber(row.unreadReportCount) > 0;

  return (
    <ReportsNotificationBadge
      count={reportCount}
      loading={row.reportsCount === undefined && isReportsLoading}
      hasNew={hasNewReports}
      selected={selected}
      showIcon
      onClick={(e) => onToggleExpand(row.id, 'reports', e)}
      ariaLabel={t('rowActions.reportsFor', {
        className: row.class_name,
        count: reportCount,
      })}
      // Extra right margin gives the top-right NEW chip room to render
      // without being clipped by the table cell boundary.
      className="mr-5"
    />
  );
}

function SimsBadge({
  row,
  expandedId,
  expandedType,
  onToggleExpand,
}: {
  row: ClassWithStudents;
  expandedId: string | null;
  expandedType: 'students' | 'sims' | 'reports' | null;
  onToggleExpand: (
    id: string,
    type: 'students' | 'sims' | 'reports',
    e: React.MouseEvent | React.KeyboardEvent
  ) => void;
}) {
  const selected = expandedId === row.id && expandedType === 'sims';
  // Prefer live store count (updated on add/delete) over the stale class-list snapshot
  const liveSimulations = useAppSelector(selectSimulationsByClassId(row.id));
  const simCount =
    liveSimulations !== null
      ? liveSimulations?.length
      : (row.simsCount ?? row.sims?.length ?? 0);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggleExpand(row.id, 'sims', e);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          onToggleExpand(row.id, 'sims', e);
        }
      }}
      className={`flex items-center gap-2 px-3 py-1 rounded-full border-2 w-fit transition-colors cursor-pointer focus:outline-none focus-visible:border-primary-500 ${
        selected
          ? 'bg-primary-500 text-white border-primary-500'
          : 'bg-transparent text-[#5f6060] border-gray-300'
      }`}
    >
      <Monitor
        size={13}
        aria-hidden="true"
        className={selected ? 'text-white' : 'text-[#5f6060]'}
      />
      <span className="text-xs font-semibold">{simCount}</span>
    </button>
  );
}

export function useClassColumns({
  sortField,
  sortDirection,
  onSort,
  expandedId,
  expandedType,
  onToggleExpand,
}: ClassColumnsProps): Column<ClassWithStudents>[] {
  const { t } = useTranslation('classManagement');
  const resolveStatusLabel = (status?: string) => {
    if (status === 'ACTIVE') return t('table.status.active');
    if (status === 'DRAFT') return t('table.status.draft');
    if (status === 'INACTIVE') return t('table.status.inactive');
    if (status === 'ARCHIEVED') return t('table.status.archived');
    if (status === 'ATTENTION') return t('table.status.needAttention');
    return getStatusLabel(status);
  };

  // The header's accessible name carries its sort state.
  const sortStateLabel = (label: string, field: keyof ClassWithStudents) => {
    if (sortField !== field || !sortDirection) {
      return t('table.sortState.none', { label });
    }
    return sortDirection === 'asc'
      ? t('table.sortState.ascending', { label })
      : t('table.sortState.descending', { label });
  };

  return [
    {
      header: (
        <SortableHeader
          label={t('table.headers.className')}
          field="class_name"
          focusable
          ariaLabel={sortStateLabel(t('table.headers.className'), 'class_name')}
          sortField={sortField}
          sortDirection={sortDirection}
          onSort={(field) => onSort(field as keyof ClassWithStudents)}
        />
      ),

      width: 'minmax(160px, 1.6fr)',

      render: (row) => {
        const isOpen = expandedId === row.id && expandedType !== null;
        const activeType =
          expandedId === row.id && expandedType ? expandedType : 'students';

        return (
          <div className="flex flex-col gap-1 min-w-0 pl-6">
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                className="text-[#5f6060] font-medium min-w-0 whitespace-normal break-words leading-snug"
                title={row.class_name}
              >
                {row.class_name}
              </span>

              <button
                type="button"
                aria-label={
                  isOpen
                    ? t('table.aria.collapseClassDetails')
                    : t('table.aria.expandClassDetails')
                }
                aria-expanded={isOpen}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleExpand(row.id, activeType, e);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    onToggleExpand(row.id, activeType, e);
                  }
                }}
                className={`flex-shrink-0 self-start flex items-center justify-center transition-transform duration-200 text-primary-500 focus:outline-none focus-visible:shadow-[inset_0_0_0_2px_#db8833] p-1 ${isOpen ? 'rotate-180' : ''}`}
              >
                <ChevronDown size={16} />
              </button>
            </div>
            <span className="text-sm text-gray-500 tabular-nums">
              {formatClassDate(row.start_date)} –{' '}
              {formatClassDate(row.end_date)}
            </span>
            {row.lms_linkage && (
              <LmsLinkagePill
                linkage={row.lms_linkage}
                fallbackCourseName={row.class_name}
              />
            )}
          </div>
        );
      },
    },
    {
      header: (
        <SortableHeader
          label={t('table.headers.students')}
          field="students"
          focusable
          ariaLabel={sortStateLabel(t('table.headers.students'), 'students')}
          sortField={sortField}
          sortDirection={sortDirection}
          onSort={(field) => onSort(field as keyof ClassWithStudents)}
        />
      ),
      render: (row) => {
        const selected = expandedId === row.id && expandedType === 'students';

        return (
          <button
            type="button"
            onClick={(e) => onToggleExpand(row.id, 'students', e)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onToggleExpand(row.id, 'students', e);
              }
            }}
            className={`flex items-center gap-2 px-3 py-1 rounded-full border-2 w-fit cursor-pointer focus:outline-none focus-visible:border-primary-400 ${
              selected
                ? 'bg-primary-500 text-white border-primary-500'
                : 'bg-transparent text-[#5f6060] border-gray-300'
            }`}
          >
            <GraduationCap
              size={13}
              aria-hidden="true"
              className={selected ? 'text-white' : 'text-[#5f6060]'}
            />
            <span className="text-xs font-semibold">
              {row.studentsCount ?? (row.students || []).length}
            </span>
          </button>
        );
      },
    },

    {
      header: (
        <SortableHeader
          label={t('table.headers.sims')}
          field="sims"
          focusable
          ariaLabel={sortStateLabel(t('table.headers.sims'), 'sims')}
          sortField={sortField}
          sortDirection={sortDirection}
          onSort={(field) => onSort(field as keyof ClassWithStudents)}
        />
      ),
      render: (row) => {
        return (
          <SimsBadge
            row={row}
            expandedId={expandedId}
            expandedType={expandedType}
            onToggleExpand={onToggleExpand}
          />
        );
      },
    },

    {
      header: (
        <SortableHeader
          label={t('table.headers.reports')}
          field="reports"
          focusable
          ariaLabel={sortStateLabel(t('table.headers.reports'), 'reports')}
          sortField={sortField}
          sortDirection={sortDirection}
          onSort={(field) => onSort(field as keyof ClassWithStudents)}
        />
      ),
      render: (row) => (
        <ReportsBadge
          row={row}
          expandedId={expandedId}
          expandedType={expandedType}
          onToggleExpand={onToggleExpand}
        />
      ),
    },

    {
      header: (
        <div className="flex justify-center">
          <SortableHeader
            label={t('table.headers.status')}
            field="status"
            focusable
            ariaLabel={sortStateLabel(t('table.headers.status'), 'status')}
            sortField={sortField}
            sortDirection={sortDirection}
            onSort={(field) => onSort(field as keyof ClassWithStudents)}
          />
        </div>
      ),
      render: (row) => {
        const displayStatus = getEffectiveClassStatus(
          row.status,
          row.start_date,
          row.end_date
        );
        return (
          <div className="flex items-center justify-center h-full">
            <StatusBadge
              tone={getStatusTone(displayStatus)}
              label={resolveStatusLabel(displayStatus)}
              className="text-[10px] uppercase tracking-wide font-semibold py-0.5"
            />
          </div>
        );
      },
    },
  ];
}
