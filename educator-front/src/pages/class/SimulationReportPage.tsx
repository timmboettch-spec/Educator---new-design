import { useEffect, useMemo, useRef } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import type { SimulationReport } from '../../redux/class/SimsCompletedreportsRedux';
import {
  FetchClassesRequest,
  selectClassStatus,
  selectClasses,
} from '../../redux/class/GetClassRedux';
import { MarkReportViewed } from '../../redux/class/SimsCompletedreportsRedux';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import StudentReportView from '../../student-reports/StudentReportView';
import { resolveStudentReportBlobId } from '../../api/resolveStudentReportBlobId';
import { ROUTE_PATHS } from '../../routes/routePath';

export default function SimulationReportPage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [searchParams] = useSearchParams();
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

  // LMS submission-review handoff: /report-detail?reportId=&classId=&studentCode=&simulationId=
  const queryReportId = (searchParams.get('reportId') ?? '').trim();
  const queryClassId = (searchParams.get('classId') ?? '').trim();
  const queryStudentCode = (searchParams.get('studentCode') ?? '').trim();
  const querySimulationId = (searchParams.get('simulationId') ?? '').trim();
  const fromLmsHandoff = Boolean(
    queryReportId || queryClassId || queryStudentCode || querySimulationId
  );

  const classIdFromStateOrQuery =
    (routeReport?.class_id ? String(routeReport.class_id) : '') || queryClassId;

  const backPath =
    state?.backPath ??
    (queryClassId
      ? `${ROUTE_PATHS.schoolsEducators.classes}?reportsClass=${encodeURIComponent(queryClassId)}`
      : ROUTE_PATHS.schoolsEducators.classes);
  const backState = state?.backState;
  const pdfGeneratorRef = useRef<(() => string | null) | null>(null);

  const handleRegisterPdfGenerator = (fn: (() => string | null) | null) => {
    pdfGeneratorRef.current = fn;
  };

  const reportId = routeReport
    ? resolveStudentReportBlobId(
        routeReport as unknown as Record<string, unknown>
      )
    : queryReportId;

  useEffect(() => {
    if (classStatus === 'idle' && classes.length === 0) {
      void dispatch(FetchClassesRequest());
    }
  }, [classStatus, classes.length, dispatch]);

  useEffect(() => {
    if (!reportId || !classIdFromStateOrQuery) return;
    void dispatch(
      MarkReportViewed({
        reportId,
        classId: String(classIdFromStateOrQuery),
      })
    );
  }, [dispatch, reportId, classIdFromStateOrQuery]);

  const matchedClass = useMemo(() => {
    if (!classIdFromStateOrQuery) return undefined;
    return classes.find(
      (c) => String(c.id) === String(classIdFromStateOrQuery)
    );
  }, [classes, classIdFromStateOrQuery]);

  const handleBack = () => {
    navigate(backPath, backState ? { state: backState } : undefined);
  };

  const handleViewTranscript = (id: string) => {
    const handoffQuery = new URLSearchParams();
    if (queryReportId) handoffQuery.set('reportId', queryReportId);
    if (queryClassId) handoffQuery.set('classId', queryClassId);
    if (queryStudentCode) handoffQuery.set('studentCode', queryStudentCode);
    if (querySimulationId) handoffQuery.set('simulationId', querySimulationId);
    const handoffQs = handoffQuery.toString();

    navigate(`/transcript/${id}`, {
      state: {
        simulationName:
          routeReport?.scenarioTitle ??
          routeReport?.scenario_title ??
          routeReport?.simulation_name,
        reportMode: routeReport?.mode,
        className: matchedClass?.class_name,
        backPath: handoffQs
          ? `${ROUTE_PATHS.reports.reportDetail}?${handoffQs}`
          : ROUTE_PATHS.reports.reportDetail,
        backState: state,
      },
    });
  };

  if (!reportId) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="bg-white p-8 rounded-lg border border-gray-200 max-w-md text-center shadow-sm">
          <h2 className="mb-2 text-xl font-semibold text-gray-900">
            {fromLmsHandoff ? 'Report not available yet' : 'Report not found'}
          </h2>
          <p className="mb-6 text-gray-600">
            {fromLmsHandoff
              ? queryStudentCode
                ? `No completed RealityWorks report was found for student ${queryStudentCode}${
                    querySimulationId ? ' on this simulation' : ''
                  }.`
                : 'No completed RealityWorks report was found for this LMS grade.'
              : 'Open this page from a class or student report list.'}
          </p>
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex items-center gap-2 rounded-lg border border-[#FB6033] px-5 py-2.5 font-semibold text-[#FB6033] transition-colors hover:bg-[#E3F2FD]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Classes
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {fromLmsHandoff ? (
        <div className="mx-auto mb-6 max-w-6xl px-4 pt-4 sm:px-6">
          <div
            role="status"
            className="rounded-xl border border-[#ED621F]/25 bg-[#ED621F]/5 px-4 py-3 text-sm text-stone-800"
          >
            <p className="font-semibold text-stone-900">
              Opened from LMS gradebook
            </p>
            <p className="mt-1 text-stone-600">
              Showing this student&apos;s report only
              {queryStudentCode ? (
                <>
                  :{' '}
                  <span className="font-semibold text-stone-900">
                    {queryStudentCode}
                  </span>
                </>
              ) : null}
              {matchedClass?.class_name ? (
                <>
                  {' '}
                  in class{' '}
                  <span className="font-semibold text-stone-900">
                    {matchedClass.class_name}
                  </span>
                </>
              ) : null}
              .
            </p>
            {queryClassId ? (
              <button
                type="button"
                onClick={handleBack}
                className="mt-2 text-sm font-semibold text-[#ED621F] underline-offset-2 hover:underline"
              >
                View all reports for this class
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      <StudentReportView
        reportId={reportId}
        variant="educator"
        classNameOverride={matchedClass?.class_name}
        onBack={handleBack}
        onViewTranscript={handleViewTranscript}
        onRegisterPdfGenerator={handleRegisterPdfGenerator}
      />
    </>
  );
}
