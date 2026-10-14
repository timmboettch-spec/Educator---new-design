import type { ComponentProps, RefObject } from 'react';
import ListTable, { type Column } from '../common/ListTable';
import ClassRowActions from './Classrowactions';
import SimSubTable from './Simsubtable';
import StudentSubTable from './student/Studentsubtable';
import ReportSubTable from './ReportSubTable';
import { toAssignContextClass } from '../../utils/assignSimulationOptions';
import { getClassAvailability } from '../../utils/classUtils';
import { mergeStudentsWithLiveRoster } from '../../utils/mergeStudentsWithLiveRoster';
import type { LmsStudent } from '../../redux/lms/SyncLmsClassesRedux';
import type { SimulationReportItem } from '../../redux/simulation/GetSimulationReportsRedux';
import type { Class, ClassWithStudents } from '../../types/Class_types';
import type { ExpandedType } from '../../hooks/useClassDeepLinkExpansion';

interface LocationState {
  openStudentReports?: boolean;
  studentId?: string;
  pinStudentId?: string;
  openSimReports?: boolean;
  simId?: string;
  openReportsModal?: boolean;
}

export interface ClassTableProps {
  columns: Column<ClassWithStudents>[];
  data: ClassWithStudents[];
  emptyMessage?: string;
  actionHeader?: string;
  loading?: boolean;
  /** Hide the header row when a shared header is rendered above several tables. */
  hideHeader?: boolean;
  /** Client-side pagination; off for infinite-loaded rows. Default: true */
  paginated?: boolean;
  targetClassId: string | null;
  targetSimulationId: string | null;
  expandedId: string | null;
  expandedType: ExpandedType;
  liveRosterByClassName: Record<string, LmsStudent[]>;
  reportsByClassId: Map<string, SimulationReportItem[]>;
  onStudentAdded: () => void;
  openMenuId: string | null;
  openStatusId: string | null;
  onMenuToggle: (id: string | null) => void;
  onStatusToggle: (id: string | null) => void;
  onEdit: (row: ClassWithStudents) => void;
  onDelete: (row: ClassWithStudents) => void;
  onStatusChange: (
    row: ClassWithStudents,
    status: NonNullable<Class['status']>
  ) => void;
  locationState: LocationState | null;
  /** The element the list scrolls in, for sub-tables that load more as they scroll. */
  scrollRootRef?: RefObject<Element | null>;
}

export default function ClassTable({
  columns,
  data,
  emptyMessage,
  actionHeader,
  loading,
  hideHeader,
  paginated,
  targetClassId,
  targetSimulationId,
  expandedId,
  expandedType,
  liveRosterByClassName,
  reportsByClassId,
  onStudentAdded,
  openMenuId,
  openStatusId,
  onMenuToggle,
  onStatusToggle,
  onEdit,
  onDelete,
  onStatusChange,
  locationState,
  scrollRootRef,
}: ClassTableProps) {
  return (
    <div className="overflow-x-auto">
      <ListTable
        columns={columns}
        data={data}
        emptyMessage={emptyMessage}
        actionHeader={actionHeader}
        loading={loading}
        hideHeader={hideHeader}
        paginated={paginated}
        targetRowId={targetClassId}
        rowClassName={() => ''}
        renderSubRow={(row) => {
          if (expandedId !== row.id) {
            return null;
          }
          if (expandedType === 'students') {
            return (
              <StudentSubTable
                classId={row.id}
                className={row.class_name}
                schoolName={row.school_name}
                onStudentAdded={onStudentAdded}
                closeStudentMenu={openMenuId !== null}
                onStudentMenuOpen={() => onMenuToggle(null)}
                isClassInactive={row.status?.toUpperCase() === 'ARCHIEVED'}
                isStatus={row.status}
                availability={getClassAvailability(row.status, row.end_date)}
                defaultReportsStudentId={
                  locationState?.openStudentReports && row.id === targetClassId
                    ? locationState.studentId
                    : undefined
                }
                defaultPinStudentId={
                  locationState?.pinStudentId && row.id === targetClassId
                    ? locationState.pinStudentId
                    : undefined
                }
              />
            );
          }
          if (expandedType === 'sims') {
            return (
              <SimSubTable
                classId={row.id}
                isLmsLinked={!!row.lms_linkage}
                className={row.class_name}
                assignContext={toAssignContextClass(row)}
                schoolName={row.school_name}
                simulations={row.sims ?? []}
                reports={
                  (reportsByClassId.get(row.id) ??
                    []) as unknown as ComponentProps<
                    typeof SimSubTable
                  >['reports']
                }
                students={mergeStudentsWithLiveRoster(
                  row.students || [],
                  row.class_name,
                  liveRosterByClassName
                )}
                isClassArchived={row.status?.toUpperCase() === 'ARCHIEVED'}
                availability={getClassAvailability(row.status, row.end_date)}
                targetSimulationId={
                  expandedId === row.id && expandedType === 'sims'
                    ? (targetSimulationId ?? undefined)
                    : undefined
                }
                defaultSimReportsId={
                  locationState?.openSimReports && row.id === targetClassId
                    ? locationState.simId
                    : undefined
                }
              />
            );
          }

          if (expandedType === 'reports') {
            return (
              <ReportSubTable
                classId={row.id}
                scrollRootRef={scrollRootRef}
                isClassInactive={row.status?.toUpperCase() === 'ARCHIEVED'}
                targetScenarioId={
                  expandedId === row.id
                    ? (targetSimulationId ?? undefined)
                    : undefined
                }
              />
            );
          }
        }}
        renderActions={(row) => (
          <ClassRowActions
            row={row}
            openMenuId={openMenuId}
            openStatusId={openStatusId}
            onMenuToggle={onMenuToggle}
            onStatusToggle={onStatusToggle}
            onEdit={onEdit}
            onDelete={onDelete}
            onStatusChange={onStatusChange}
            onAIInsights={() => {}}
            defaultViewModalOpen={
              locationState?.openReportsModal === true &&
              row.id === targetClassId
            }
          />
        )}
      />
    </div>
  );
}
