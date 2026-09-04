import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import type { SimulationReport } from "../../redux/class/SimsCompletedreportsRedux";
import {
  FetchClassesRequest,
  selectClassStatus,
  selectClasses,
} from "../../redux/class/GetClassRedux";
import { MarkReportViewed } from "../../redux/class/SimsCompletedreportsRedux";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import StudentEmailReportModal from "../../components/class/student/StudentEmailReportModal";
import StudentReportView from "../../student-reports/StudentReportView";
import { resolveStudentReportBlobId } from "../../api/resolveStudentReportBlobId";

export default function SimulationReportPage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const classes = useAppSelector(selectClasses) ?? [];
  const classStatus = useAppSelector(selectClassStatus);
  const { state } = useLocation() as {
    state?: {
      report?: SimulationReport & { class_id?: string };
      backPath?: string;
      backState?: Record<string, unknown>;
    };
  };
  const routeReport = state?.report;
  const backPath = state?.backPath ?? "/classes";
  const backState = state?.backState;
  const [showEmailModal, setShowEmailModal] = useState(false);

  
  const pdfGeneratorRef = useRef<(() => string | null) | null>(null);

  const handleRegisterPdfGenerator = (fn: (() => string | null) | null) => {
    pdfGeneratorRef.current = fn;
  };

  const reportId = routeReport
    ? resolveStudentReportBlobId(routeReport as unknown as Record<string, unknown>)
    : "";

  useEffect(() => {
    if (classStatus === "idle" && classes.length === 0) {
      void dispatch(FetchClassesRequest());
    }
  }, [classStatus, classes.length, dispatch]);

  useEffect(() => {
    if (!reportId || !routeReport?.class_id) return;
    void dispatch(
      MarkReportViewed({ reportId, classId: String(routeReport.class_id) }),
    );
  }, [dispatch, reportId, routeReport?.class_id]);

  const matchedClass = useMemo(() => {
    const classId = routeReport?.class_id;
    if (!classId) return undefined;
    return classes.find((c) => String(c.id) === String(classId));
  }, [classes, routeReport?.class_id]);

  const matchedStudent = useMemo(() => {
    if (!matchedClass?.students) return undefined;
    const userId = routeReport?.userId ?? routeReport?.student_id;
    if (!userId) return undefined;
    return matchedClass.students.find(
      (s) =>
        String(s.id) === String(userId) ||
        String(s.user_id) === String(userId) ||
        (s.student_id && String(s.student_id) === String(userId)),
    );
  }, [matchedClass, routeReport?.student_id, routeReport?.userId]);

  const studentName =
    routeReport?.studentName ??
    routeReport?.student_name ??
    matchedStudent?.student_name ??
    "Student";

  const studentEmail = matchedStudent?.email ?? undefined;

  
  const resolvedEmail: string | undefined =
    studentEmail ??
    (typeof (routeReport as unknown as Record<string, unknown>)?.['email'] === 'string'
      ? String((routeReport as unknown as Record<string, unknown>)['email'])
      : undefined) ??
    (typeof (routeReport as unknown as Record<string, unknown>)?.['student_email'] === 'string'
      ? String((routeReport as unknown as Record<string, unknown>)['student_email'])
      : undefined);

  const handleBack = () => {
    navigate(backPath, backState ? { state: backState } : undefined);
  };

  const handleViewTranscript = (id: string) => {
    navigate(`/transcript/${id}`, {
      state: {
        simulationName:
          routeReport?.scenarioTitle ??
          routeReport?.scenario_title ??
          routeReport?.simulation_name,
        reportMode: routeReport?.mode,
        className: matchedClass?.class_name,
        backPath: "/report-detail",
        backState: state,
      },
    });
  };

  if (!reportId) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="bg-white p-8 rounded-lg border border-gray-200 max-w-md text-center shadow-sm">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Report not found</h2>
          <p className="text-gray-600 mb-6">
            Open this page from a class or student report list.
          </p>
          <button
            onClick={() => navigate("/classes")}
            className="inline-flex items-center gap-2 px-5 py-2.5 border border-[#FB6033] text-[#FB6033] rounded-lg font-semibold hover:bg-[#E3F2FD] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Classes
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <StudentReportView
        reportId={reportId}
        variant="educator"
        classNameOverride={matchedClass?.class_name}
        onBack={handleBack}
        onViewTranscript={handleViewTranscript}
        onEmailReport={() => setShowEmailModal(true)}
        onRegisterPdfGenerator={handleRegisterPdfGenerator}
      />

      {showEmailModal && routeReport && (
        <StudentEmailReportModal
          report_id={routeReport.id}
          report_key={reportId}
          report_type="assessment"
          pdfGeneratorFn={() => pdfGeneratorRef.current?.() ?? null}
          student={{
            student_id:
              routeReport.student_id ??
              routeReport.userId ??
              matchedStudent?.id ??
              matchedStudent?.user_id ??
              "",
            student_name: studentName,
            email: resolvedEmail,
            class_id: routeReport.class_id,
            score: routeReport.score,
            attempt: routeReport.attempt,
            time_spent: routeReport.time_spent,
            sims_completed: (routeReport?.sims_completed as string | null | undefined) ?? null,
            scenario_title:
              routeReport.scenarioTitle ??
              routeReport.scenario_title ??
              routeReport.simulation_name,
          }}
          onClose={() => setShowEmailModal(false)}
        />
      )}
    </>
  );
}
