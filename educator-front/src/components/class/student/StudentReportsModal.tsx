import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAppDispatch } from '../../../store/hooks';
import { MarkReportViewed } from '../../../redux/class/SimsCompletedreportsRedux';
import {
  SimulationReportSelectorType,
  type ReportListItemResDto,
} from '../../../redux/api/reports/reports.types';
import { useBulkReportReview } from '../../../hooks/useBulkReportReview';
import { ReportsListModal } from '../reports/ReportsListModal';
import { buildTranscriptState } from '../reports/reportTableFormat';

interface Props {
  // The student's id (UUID), not the student code.
  studentId: string;
  studentName: string;
  studentCode: string;
  studentEmail?: string | null;
  classId?: string;
  className?: string;
  schoolName?: string;
  onClose: () => void;
}

/** One student's reports (in one class, when given), in the shared reports list modal. */
export default function StudentReportsModal({
  studentId,
  studentName,
  studentCode,
  studentEmail,
  classId,
  className,
  schoolName,
  onClose,
}: Props) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { t } = useTranslation('classManagement');
  const { review } = useBulkReportReview();

  const filter = useMemo(
    () => ({
      classIds: classId ? [classId] : undefined,
      studentIds: [studentId],
    }),
    [classId, studentId]
  );

  function markViewed(row: ReportListItemResDto) {
    if (classId) {
      void dispatch(MarkReportViewed({ reportId: row.reportId, classId }));
    }
  }

  function handleViewReport(row: ReportListItemResDto) {
    markViewed(row);
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
          student_email: studentEmail ?? undefined,
        },
        backPath: '/classes',
        backState: {
          classId,
          expandType: 'students',
          studentId,
          openStudentReports: true,
        },
      },
    });
  }

  function handleViewTranscript(row: ReportListItemResDto) {
    markViewed(row);
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
        { label: t('reportsModal.studentCode'), value: studentCode },
      ]}
      emptySubtitle={t('reportsModal.emptySubtitleStudent')}
      filter={filter}
      classId={classId ?? ''}
      // Review needs the class for its unread count.
      canReview={Boolean(classId)}
      // Every report of the student server-side, not only the loaded pages.
      onMarkAll={(reviewed) =>
        review({
          type: SimulationReportSelectorType.STUDENT,
          ids: [studentId],
          reviewed,
          classId: classId ?? '',
        })
      }
      onViewReport={handleViewReport}
      onViewTranscript={handleViewTranscript}
      onClose={onClose}
    />
  );
}
