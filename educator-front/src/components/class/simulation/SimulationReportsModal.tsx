import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import { MarkReportViewed } from '../../../redux/class/SimsCompletedreportsRedux';
import { selectClasses } from '../../../redux/class/GetClassRedux';
import type { ReportListItemResDto } from '../../../redux/api/reports/reports.types';
import { useMarkAllSimReports } from '../../../hooks/useMarkAllSimReports';
import { useLmsGradeSync } from '../../../hooks/useLmsGradeSync';
import LmsSyncAction from '../LmsSyncAction';
import { ReportsListModal } from '../reports/ReportsListModal';
import { buildTranscriptState } from '../reports/reportTableFormat';

interface Props {
  classId: string;
  className?: string;
  schoolName?: string;
  // Catalog simulation id (scenario_id), never the ClassSimulation id.
  simulationId: string;
  simName: string;
  onClose: () => void;
}

/** One simulation's reports in one class, in the shared reports list modal. */
export default function SimulationReportsModal({
  classId,
  className,
  schoolName,
  simulationId,
  simName,
  onClose,
}: Props) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { t } = useTranslation('classManagement');

  const allClasses = useAppSelector(selectClasses);
  const lmsSync = useLmsGradeSync(classId);
  const { markAll: markAllSimReports } = useMarkAllSimReports();

  // The list row carries the student code only; resolve the class's student from it.
  const studentsByCode = useMemo(() => {
    const cls = allClasses?.find((c) => c.id === classId);
    return new Map(
      (cls?.students ?? [])
        .filter((s) => s.student_id)
        .map((s) => [String(s.student_id), s])
    );
  }, [allClasses, classId]);

  const filter = useMemo(
    () => ({ classIds: [classId], simulationIds: [simulationId] }),
    [classId, simulationId]
  );

  function handleViewReport(row: ReportListItemResDto) {
    const studentName =
      studentsByCode.get(row.studentCode)?.student_name || '—';
    dispatch(MarkReportViewed({ reportId: row.reportId, classId }));
    onClose();
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
        backPath: '/classes',
        backState: {
          classId,
          expandType: 'sims',
          simId: simulationId,
          openSimReports: true,
        },
      },
    });
  }

  function handleViewTranscript(row: ReportListItemResDto) {
    dispatch(MarkReportViewed({ reportId: row.reportId, classId }));
    onClose();
    navigate(`/transcript/${row.reportId}`, {
      state: buildTranscriptState(
        row.simulationName,
        row.mode,
        row.completedAt
      ),
    });
  }

  return (
    <ReportsListModal
      details={[
        { label: t('reportsModal.school'), value: schoolName },
        { label: t('reportsModal.class'), value: className },
        { label: t('reportsModal.simulation'), value: simName },
      ]}
      filter={filter}
      classId={classId}
      onMarkAll={(reviewed) =>
        markAllSimReports(classId, simulationId, reviewed)
      }
      onViewReport={handleViewReport}
      onViewTranscript={handleViewTranscript}
      renderRowExtraActions={(row) => (
        <LmsSyncAction
          sync={lmsSync}
          mode={row.mode}
          simulationId={simulationId}
          studentId={studentsByCode.get(row.studentCode)?.id}
        />
      )}
      fallbackSimulationName={simName}
      onClose={onClose}
    />
  );
}
