import { ChevronDown, GraduationCap, Monitor } from 'lucide-react';
import dayjs from 'dayjs';
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
import { selectViewedReportIds, isReportNew } from '../../redux/class/GetClassRedux';
import ReportsNotificationBadge from '../ui/ReportsNotificationBadge';
import StatusPill, { type StatusTone } from '../common/StatusPill';

/** Map an effective class status to the shared admin StatusPill tone. */
const classStatusTone = (s: string): StatusTone =>
  s === 'ACTIVE'
    ? 'success'
    : s === 'ARCHIEVED'
      ? 'danger'
      : s === 'INACTIVE' || s === 'ATTENTION'
        ? 'warning'
        : 'neutral';

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
  labels?: {
    className?: string;
    school?: string;
    students?: string;
    sims?: string;
    reports?: string;
    status?: string;
    statusActive?: string;
    statusDraft?: string;
    statusInactive?: string;
    statusArchived?: string;
    statusNeedAttention?: string;
    ariaExpandClassDetails?: string;
    ariaCollapseClassDetails?: string;
  };
  onToggleExpand: (
    id: string,
    type: 'students' | 'sims' | 'reports',
    e: React.MouseEvent | React.KeyboardEvent,
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
    e: React.MouseEvent | React.KeyboardEvent,
  ) => void;
}) {
  const selected = expandedId === row.id && expandedType === 'reports';
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
      .map((v) => v.trim()),
  );
  const classReports = educatorReports.filter(
    (r) => r.userId != null && studentIds.has(String(r.userId).trim()),
  );
  const isReportsLoading = educatorReportsStatus === 'loading';
  const liveDataReady = educatorReportsStatus === 'succeeded';
  const fallbackCount =
    typeof row.reportCount === 'number'
      ? row.reportCount
      : Array.isArray(row.reports)
        ? row.reports.length
        : toSafeNumber(row.reports);
  const reportCount = liveDataReady ? classReports.length : fallbackCount;
  // Use the shared isReportNew helper so class-level badge logic is
  // identical to student-level and report-level logic.
  const newCount = classReports.filter((r) => isReportNew(r.id, r.isNew, viewedReportIds)).length;
  const hasNewReports = liveDataReady ? newCount > 0 : row.needsAttention === true || toSafeNumber(row.unreadReportCount) > 0;

  return (
    <ReportsNotificationBadge
      count={reportCount}
      loading={isReportsLoading}
      hasNew={hasNewReports}
      selected={selected}
      showIcon
      onClick={(e) => onToggleExpand(row.id, 'reports', e)}
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
    e: React.MouseEvent | React.KeyboardEvent,
  ) => void;
}) {
  const selected = expandedId === row.id && expandedType === 'sims';
  // Prefer live store count (updated on add/delete) over the stale class-list snapshot
  const liveSimulations = useAppSelector(selectSimulationsByClassId(row.id));
  const simCount = liveSimulations !== null ? liveSimulations.length : (row?.sims?.length ?? 0);

  return (
    <button
      type="button"
      aria-label={`${simCount} simulations — toggle simulations`}
      aria-expanded={selected}
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

/**
 * Class Name cell: the name + expand chevron, with the class's start/end dates
 * shown beneath (read-only — class dates are set at creation and not editable
 * from the list).
 */
function ClassNameCell({
  row,
  isOpen,
  activeType,
  labels,
  onToggleExpand,
}: {
  row: ClassWithStudents;
  isOpen: boolean;
  activeType: 'students' | 'sims' | 'reports';
  labels?: ClassColumnsProps['labels'];
  onToggleExpand: ClassColumnsProps['onToggleExpand'];
}) {
  const fmt = (d?: string) => (d ? dayjs(d).format('MM-DD-YYYY') : '—');

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
              ? labels?.ariaCollapseClassDetails ?? 'Collapse class details'
              : labels?.ariaExpandClassDetails ?? 'Expand class details'
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
        {fmt(row.start_date)} – {fmt(row.end_date)}
      </span>
    </div>
  );
}

export function useClassColumns({
  sortField,
  sortDirection,
  onSort,
  expandedId,
  expandedType,
  labels,
  onToggleExpand,
}: ClassColumnsProps): Column<ClassWithStudents>[] {
  const resolveStatusLabel = (status?: string) => {
    if (status === 'ACTIVE') return labels?.statusActive ?? getStatusLabel(status);
    if (status === 'DRAFT') return labels?.statusDraft ?? getStatusLabel(status);
    if (status === 'INACTIVE') return labels?.statusInactive ?? getStatusLabel(status);
    if (status === 'ARCHIEVED') return labels?.statusArchived ?? getStatusLabel(status);
    if (status === 'ATTENTION') return labels?.statusNeedAttention ?? getStatusLabel(status);
    return getStatusLabel(status);
  };

  return [
    {
      header: (
        <SortableHeader
          label={labels?.className ?? 'Class Name'}
          field="class_name"
          sortField={sortField}
          sortDirection={sortDirection}
          onSort={(field) => onSort(field as keyof ClassWithStudents)}
        />
      ),

      width: 'minmax(160px, 1.6fr)',

      render: (row) => {
        const isOpen = expandedId === row.id && expandedType !== null;
        const activeType = expandedId === row.id && expandedType ? expandedType : 'students';

        return (
          <ClassNameCell
            row={row}
            isOpen={isOpen}
            activeType={activeType}
            labels={labels}
            onToggleExpand={onToggleExpand}
          />
        );
      },
    },
    {
      header: (
        <SortableHeader
          label={labels?.students ?? 'Students'}
          field="students"
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
            aria-label={`${(row.students || []).length} students — toggle students`}
            aria-expanded={selected}
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
            <GraduationCap size={13} aria-hidden="true" className={selected ? 'text-white' : 'text-[#5f6060]'} />
            <span className="text-xs font-semibold">{(row.students || []).length}</span>
          </button>
        );
      },
    },

    {
      header: (
        <SortableHeader
          label={labels?.sims ?? 'Sims'}
          field="sims"
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
          label={labels?.reports ?? 'Reports'}
          field="reports"
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
            label={labels?.status ?? 'Status'}
            field="status"
            sortField={sortField}
            sortDirection={sortDirection}
            onSort={(field) => onSort(field as keyof ClassWithStudents)}
          />
        </div>
      ),
      render: (row) => {
        const displayStatus = getEffectiveClassStatus(row.status, row.start_date, row.end_date);
        return (
          <div className="flex items-center justify-center h-full">
            <StatusPill
              label={resolveStatusLabel(displayStatus)}
              tone={classStatusTone(displayStatus)}
            />
          </div>
        );
      },
    },
  ];
}
