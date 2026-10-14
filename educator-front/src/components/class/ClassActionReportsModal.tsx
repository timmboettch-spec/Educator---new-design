import { useNavigate } from 'react-router-dom';
import loginEn from '../../locales/auth/login/en.json';
import loginEs from '../../locales/auth/login/es.json';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { MarkReportViewed } from '../../redux/class/SimsCompletedreportsRedux';
import {
  selectViewedReportIds,
  isReportNew,
} from '../../redux/class/GetClassRedux';
import { useResolveStudentName } from '../../hooks/useResolveStudentName';
import Modal from '../ui/Modal';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { SelectCheckbox } from './reports/SelectCheckbox';
import { ReportBulkActionBar } from './reports/ReportBulkActionBar';
import { useReportTableReview } from './reports/useReportTableReview';
import type { SimulationReportItem } from '../../redux/simulation/GetSimulationReportsRedux';
import type { Student } from '../../types/Class_types';

interface ClassActionReportsModalProps {
  classId: string;
  className: string;
  reports: SimulationReportItem[];
  students: Student[];
  isClassInactive?: boolean;
  onClose: () => void;
}

function formatTime(
  totalSecs: number | null | undefined,
  fallback: string | null | undefined
): string {
  if (totalSecs != null && totalSecs > 0) {
    const secs = totalSecs > 86400 ? Math.round(totalSecs / 1000) : totalSecs;
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }
  return fallback ?? '—';
}

function formatScore(r: SimulationReportItem): string {
  const raw = r.score ?? r.scoreJson?.overallScore ?? null;
  if (raw !== null) {
    const pct = raw <= 1 && raw >= 0 ? Math.round(raw * 100) : Math.round(raw);
    return `${pct}%`;
  }
  return r.performanceLabel ?? '—';
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${mm}/${dd}/${yyyy} ${hh}:${min}`;
}

function getStatusColorClass(score: number | null | undefined): string {
  if (score === null || score === undefined) return 'text-gray-600';
  const pct =
    score <= 1 && score >= 0 ? Math.round(score * 100) : Math.round(score);
  if (pct > 90) return 'text-blue-600';
  if (pct >= 75) return 'text-green-600';
  return 'text-red-600';
}

export default function ClassActionReportsModal({
  classId,
  className,
  reports,
  students,
  isClassInactive,
  onClose,
}: ClassActionReportsModalProps) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const isEs = localStorage.getItem('app_language')?.toLowerCase() === 'es';
  const t = (isEs ? loginEs : loginEn).classActionReportsModal;
  const viewedReportIds = useAppSelector(selectViewedReportIds);

  const { resolveStudentDisplayName, resolveStudentCode } =
    useResolveStudentName(students);

  function handleViewTranscript(r: SimulationReportItem) {
    if (isClassInactive) return;
    onClose();
    const raw = r as unknown as Record<string, unknown>;
    const summaryByCategory = raw['summaryByCategory'] as
      Record<string, unknown> | undefined;
    const actions = Array.isArray(summaryByCategory?.['actions'])
      ? (summaryByCategory?.['actions'] as Record<string, unknown>[])
      : [];
    const firstAction = (actions[0] ?? {}) as Record<string, unknown>;
    const startedAtCombined =
      (firstAction['startedAt'] as string | undefined) ??
      (firstAction['started_at'] as string | undefined) ??
      r.scenarioStartTime;
    let transcriptSimDate = '';
    let transcriptSimTime = '';
    if (startedAtCombined && startedAtCombined.includes(',')) {
      const [datePart, timePart] = startedAtCombined.split(',');
      transcriptSimDate = (datePart ?? '').trim();
      transcriptSimTime = (timePart ?? '').trim();
    } else if (startedAtCombined) {
      const d = new Date(startedAtCombined);
      if (!Number.isNaN(d.getTime())) {
        transcriptSimDate = d.toLocaleDateString('en-US', {
          month: 'short',
          day: '2-digit',
        });
        transcriptSimTime = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      }
    }
    navigate(`/transcript/${r.id}`, {
      state: {
        simulationName:
          r.scenarioTitle ?? r.scenario_title ?? r.simulation_name ?? '',
        reportMode: (raw['mode'] as string | undefined) ?? '',
        simulationDate: transcriptSimDate,
        simulationTime: transcriptSimTime,
      },
    });
  }

  function handleRowClick(r: SimulationReportItem) {
    if (isClassInactive) return;
    const studentName = resolveStudentDisplayName(r);
    if (r.id) {
      void dispatch(MarkReportViewed({ reportId: r.id, classId }));
    }
    onClose();
    navigate('/report-detail', {
      state: {
        report: { ...r, student_name: studentName, class_id: classId },
        backPath: '/classes',
        backState: { classId, openReportsModal: true },
      },
    });
  }

  const { t: tReview } = useTranslation('classManagement');
  const reportIds = useMemo(
    () => reports.map((r) => r.id).filter(Boolean),
    [reports]
  );
  const { selection, isReviewing, markSelected, markAll } =
    useReportTableReview(reportIds, classId);

  const totalSecs = reports.reduce((sum, r) => {
    let t = r.totalTimeSeconds ?? 0;
    if (t > 86400) t = Math.round(t / 1000);
    return sum + t;
  }, 0);

  const scoreValues = reports
    .map((r) => {
      const raw = r.score ?? r.scoreJson?.overallScore ?? null;
      if (raw === null) return null;
      return raw <= 1 && raw >= 0 ? Math.round(raw * 100) : Math.round(raw);
    })
    .filter((v): v is number => v !== null);

  const avgScore =
    scoreValues.length > 0
      ? Math.round(scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length)
      : null;

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`${t.titlePrefix} ${className}`}
      className="max-w-5xl w-full"
    >
      {reports.length > 0 && (
        <ReportBulkActionBar
          selectedCount={selection.selectedIds.length}
          totalCount={reportIds.length}
          onMarkSelected={markSelected}
          onMarkAll={markAll}
          busy={isReviewing}
          disabled={isClassInactive}
        />
      )}
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm border-separate border-spacing-0">
          <thead className="bg-primary-500 text-white">
            <tr>
              <th className="px-3 py-2.5 w-10 rounded-tl-lg">
                <SelectCheckbox
                  checked={selection.isAllSelected}
                  indeterminate={selection.isPartial}
                  onChange={selection.toggleAll}
                  label={tReview('reportReview.selectAll')}
                  disabled={reportIds.length === 0 || isClassInactive}
                  className="accent-white"
                />
              </th>
              <th className="px-3 py-2.5 text-left font-medium">
                {t.headerStudentName ?? 'Student Name'}
              </th>
              <th className="px-3 py-2.5 text-left font-medium">
                {t.headerStudentCode}
              </th>
              <th className="px-3 py-2.5 text-left font-medium">
                {t.headerMode}
              </th>
              <th className="px-3 py-2.5 text-left font-medium">
                {t.headerSimName}
              </th>
              <th className="px-3 py-2.5 text-left font-medium">
                {t.headerScore}
              </th>
              <th className="px-3 py-2.5 text-left font-medium">
                {t.headerStatus}
              </th>
              <th className="px-3 py-2.5 text-left font-medium">
                {t.headerTimeSpent}
              </th>
              <th className="px-3 py-2.5 text-left font-medium">
                {t.headerCompletedAt}
              </th>
              <th className="px-3 py-2.5 text-left font-medium rounded-tr-lg">
                {t.headerActions}
              </th>
            </tr>
          </thead>
          <tbody>
            {reports.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-10 text-center">
                  <p className="text-sm font-semibold text-gray-600">
                    {t.noReportsTitle}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {t.noReportsSubtitle}
                  </p>
                </td>
              </tr>
            ) : (
              reports.map((r, i) => {
                // Blank titles count as missing, so they get "—" and no NEW badge.
                const simName =
                  (
                    r.scenarioTitle ??
                    r.scenario_title ??
                    r.simulation_name ??
                    ''
                  ).trim() || '—';
                const completedAt = r.scenarioEndTime ?? r.completed_at ?? null;
                const studentName = resolveStudentDisplayName(r);
                const studentCode = resolveStudentCode(r);
                const rawMode = (r as unknown as Record<string, unknown>)[
                  'mode'
                ] as string | undefined;
                const modeLabel = rawMode
                  ? rawMode.toLowerCase() === 'assessment'
                    ? t.modeAssessment
                    : rawMode.toLowerCase() === 'practice'
                      ? t.modePractice
                      : rawMode.charAt(0).toUpperCase() +
                        rawMode.slice(1).toLowerCase()
                  : '—';
                const modeBadgeClass =
                  rawMode?.toLowerCase() === 'assessment'
                    ? 'bg-blue-50 text-blue-700'
                    : rawMode?.toLowerCase() === 'practice'
                      ? 'bg-green-50 text-green-700'
                      : 'bg-gray-50 text-gray-500';
                const isNew = isReportNew(r.id, r.isNew, viewedReportIds);
                const rawScore = r.score ?? r.scoreJson?.overallScore ?? null;
                const rawStatusText =
                  r.status ??
                  r.performanceLabel ??
                  (r.scoreJson?.overallLabel as string | undefined) ??
                  (rawScore !== null
                    ? rawScore > 90
                      ? 'Exceptional'
                      : rawScore >= 75
                        ? 'Meets Expectation'
                        : 'Needs Improvement'
                    : '—');

                const statusLabelMap: Record<string, string> = {
                  Exceptional:
                    t.statusExceptional ??
                    (isEs ? 'Excepcional' : 'Exceptional'),
                  EXCEPTIONAL:
                    t.statusExceptional ??
                    (isEs ? 'Excepcional' : 'Exceptional'),
                  'Meets Expectation':
                    t.statusMeetsExpectation ??
                    (isEs ? 'Cumple las expectativas' : 'Meets Expectation'),
                  'MEETS EXPECTATION':
                    t.statusMeetsExpectation ??
                    (isEs ? 'Cumple las expectativas' : 'Meets Expectation'),
                  'Needs Improvement':
                    t.statusNeedsImprovement ??
                    (isEs ? 'Necesita mejorar' : 'Needs Improvement'),
                  'NEEDS IMPROVEMENT':
                    t.statusNeedsImprovement ??
                    (isEs ? 'Necesita mejorar' : 'Needs Improvement'),
                  needs_improvement:
                    t.statusNeedsImprovement ??
                    (isEs ? 'Necesita mejorar' : 'Needs Improvement'),
                };

                const statusText =
                  (rawStatusText && statusLabelMap[rawStatusText]) ??
                  rawStatusText;
                return (
                  <tr
                    key={r.id ?? i}
                    className={`border-b border-gray-100 transition-colors ${
                      isNew ? 'bg-primary-50' : 'bg-white hover:bg-gray-50'
                    } ${isClassInactive ? 'opacity-60' : ''}`}
                  >
                    <td className="px-3 py-2.5">
                      {r.id && (
                        <SelectCheckbox
                          checked={selection.isSelected(r.id)}
                          onChange={() => selection.toggle(r.id)}
                          label={tReview('reportReview.selectReport', {
                            name: `${studentName} ${r.scenarioTitle ?? r.scenario_title ?? r.simulation_name ?? ''}`.trim(),
                          })}
                          disabled={isClassInactive}
                        />
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-gray-700 font-medium text-sm">
                      {studentName}
                    </td>
                    <td className="px-3 py-2.5 text-gray-500 font-mono text-sm">
                      {studentCode}
                    </td>
                    <td className="px-3 py-2.5">
                      {rawMode ? (
                        <span
                          className={`px-1.5 py-0.5 rounded text-sm font-semibold ${modeBadgeClass}`}
                        >
                          {modeLabel}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-gray-800 font-medium">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleRowClick(r)}
                          disabled={isClassInactive}
                          className={`text-left hover:text-primary-600 hover:underline focus:outline-none ${isClassInactive ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                        >
                          {simName}
                        </button>
                        {/* No NEW badge beside a missing name ("—"). */}
                        {isNew && simName !== '—' && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-sm font-bold bg-primary-500 text-white leading-none whitespace-nowrap">
                            {t.badgeNew ?? (isEs ? 'Nuevo' : 'New')}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-gray-700">
                      {formatScore(r)}
                    </td>
                    <td
                      className={`px-3 py-2.5 text-[11px] font-medium capitalize ${getStatusColorClass(rawScore)}`}
                    >
                      {statusText}
                    </td>
                    <td className="px-3 py-2.5 text-gray-600">
                      {formatTime(r.totalTimeSeconds, r.time_spent)}
                    </td>
                    <td className="px-3 py-2.5 text-gray-600">
                      {formatDate(completedAt)}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-row items-center gap-1.5">
                        <button
                          onClick={() => handleRowClick(r)}
                          disabled={isClassInactive}
                          className={`inline-flex items-center justify-center px-2 py-1 border text-[10px] rounded-full font-medium transition-colors whitespace-nowrap ${
                            isClassInactive
                              ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
                              : isNew
                                ? 'bg-primary-500 border-primary-500 text-white hover:bg-primary-600 cursor-pointer'
                                : 'bg-primary-50 border-primary-200 text-primary-600 hover:bg-primary-100 cursor-pointer'
                          }`}
                        >
                          {t.viewReport}
                        </button>
                        <button
                          onClick={() => handleViewTranscript(r)}
                          disabled={isClassInactive}
                          className={`inline-flex items-center justify-center px-2 py-1 border text-[10px] rounded-full font-medium transition-colors whitespace-nowrap ${
                            isClassInactive
                              ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
                              : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100 cursor-pointer'
                          }`}
                        >
                          {t.viewTranscript}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {reports.length > 0 && (
        <div className="flex items-center justify-between mt-3 px-1">
          <div className="flex gap-4 text-xs text-gray-500">
            <span>
              <span className="font-semibold text-gray-700">
                {t.totalTime}{' '}
              </span>
              {formatTime(totalSecs, '—')}
            </span>
            {avgScore !== null && (
              <span>
                <span className="font-semibold text-gray-700">
                  {t.avgScore}{' '}
                </span>
                {avgScore}%
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400">
            {reports.length} report{reports.length !== 1 ? 's' : ''}
          </p>
        </div>
      )}
    </Modal>
  );
}
