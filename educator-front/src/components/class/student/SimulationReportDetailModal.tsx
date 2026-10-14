import { useState } from 'react';
import type { SimulationReport } from '../../../redux/class/SimsCompletedreportsRedux';
import Modal from '../../ui/Modal';

interface Props {
  report: SimulationReport;
  studentName: string;
  onClose: () => void;
}

type TabId = 'overview' | 'summary' | 'rubrics' | 'communication';

// ── helpers ────────────────────────────────────────────────────────────────────

function fmtTime(secs: number | null | undefined): string {
  if (secs == null) return '—';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function fmtDate(val: string | null | undefined): string {
  if (!val) return '—';
  const d = new Date(val);
  return isNaN(d.getTime())
    ? val
    : d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-green-600';
  if (score >= 60) return 'text-yellow-600';
  return 'text-red-500';
}

function scoreBg(score: number): string {
  if (score >= 80) return 'bg-green-50 border-green-200';
  if (score >= 60) return 'bg-yellow-50 border-yellow-200';
  return 'bg-red-50 border-red-200';
}

function getRubricItems(report: SimulationReport): Record<string, unknown> {
  const ca = report.communicationAssessment as
    Record<string, unknown> | undefined;
  if (!ca) return {};
  // rubrics may live at multiple nesting levels
  const rubrics =
    (ca['rubrics'] as Record<string, unknown> | undefined) ??
    ((ca['communicationAssessment'] as Record<string, unknown> | undefined)?.[
      'rubrics'
    ] as Record<string, unknown> | undefined);
  return (rubrics?.['items'] as Record<string, unknown>) ?? {};
}

function getRubricsOverall(
  report: SimulationReport
): { score: number; label: string; summary: string } | null {
  const ca = report.communicationAssessment as
    Record<string, unknown> | undefined;
  if (!ca) return null;
  const overall = ca['overall'] as Record<string, unknown> | undefined;
  if (!overall) return null;
  return {
    score:
      (overall['score'] as number) ?? report.rubricsTotal ?? report.score ?? 0,
    label: (overall['label'] as string) ?? report.performanceLabel ?? '—',
    summary: (overall['summary'] as string) ?? report.summary ?? '',
  };
}

// ── sub-components ─────────────────────────────────────────────────────────────

function TabButton({
  id,
  active,
  label,
  onClick,
}: {
  id: TabId;
  active: boolean;
  label: string;
  onClick: (id: TabId) => void;
}) {
  return (
    <button
      onClick={() => onClick(id)}
      className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
        active
          ? 'border-orange-500 text-orange-600'
          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
      }`}
    >
      {label}
    </button>
  );
}

function ScoreCircle({ score, label }: { score: number; label: string }) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const filled = (score / 100) * circumference;
  const color = score >= 80 ? '#16a34a' : score >= 60 ? '#d97706' : '#ef4444';
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="100" height="100" viewBox="0 0 100 100">
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth="10"
        />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeDasharray={`${filled} ${circumference}`}
          strokeLinecap="round"
          transform="rotate(-90 50 50)"
        />
        <text
          x="50"
          y="46"
          textAnchor="middle"
          fontSize="16"
          fontWeight="bold"
          fill={color}
        >
          {Math.round(score)}%
        </text>
        <text x="50" y="62" textAnchor="middle" fontSize="8" fill="#6b7280">
          Score
        </text>
      </svg>
      <span
        className={`text-xs font-medium px-2 py-0.5 rounded-full ${score >= 80 ? 'bg-green-100 text-green-700' : score >= 60 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}
      >
        {label}
      </span>
    </div>
  );
}

function CategoryScoreBar({
  name,
  score,
  weight,
  weightedScore,
}: {
  name: string;
  score: number;
  weight: number;
  weightedScore: number;
}) {
  const color =
    score >= 80 ? 'bg-green-500' : score >= 60 ? 'bg-yellow-500' : 'bg-red-400';
  return (
    <div className="mb-3">
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs font-medium text-gray-700">{name}</span>
        <span className={`text-xs font-bold ${scoreColor(score)}`}>
          {score}%{' '}
          <span className="text-gray-400 font-normal">
            ({weightedScore.toFixed(1)}/{weight}pts)
          </span>
        </span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

// ── tabs ───────────────────────────────────────────────────────────────────────

function OverviewTab({ report }: { report: SimulationReport }) {
  const overall = getRubricsOverall(report);
  const score = overall?.score ?? report.score ?? 0;
  const label = overall?.label ?? report.performanceLabel ?? '—';
  const scoreJson = report.scoreJson ?? ({} as Record<string, unknown>);

  const categories = [
    { key: 'communication', label: 'Communication' },
    { key: 'clinicalJudgment', label: 'Clinical Judgment' },
    { key: 'technicalAccuracy', label: 'Technical Accuracy' },
    { key: 'ethicalCompetence', label: 'Ethical Competence' },
    { key: 'reflection', label: 'Reflection' },
  ] as const;

  return (
    <div className="space-y-4">
      {/* Score + scenario info */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-shrink-0 flex items-start justify-center pt-2">
          <ScoreCircle
            score={typeof score === 'number' ? score : 0}
            label={label}
          />
        </div>
        <div className="flex-1 space-y-2">
          <div
            className={`rounded-lg border p-3 ${scoreBg(typeof score === 'number' ? score : 0)}`}
          >
            <p className="text-xs text-gray-500 mb-0.5">Simulation</p>
            <p className="text-sm font-semibold text-gray-800">
              {report.scenarioTitle ??
                report.scenario_title ??
                report.scenarioId ??
                '—'}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-gray-50 rounded-lg p-2.5">
              <p className="text-gray-400 mb-0.5">Start Time</p>
              <p className="font-medium text-gray-700">
                {fmtDate(report.scenarioStartTime)}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-2.5">
              <p className="text-gray-400 mb-0.5">End Time</p>
              <p className="font-medium text-gray-700">
                {fmtDate(report.scenarioEndTime)}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-2.5">
              <p className="text-gray-400 mb-0.5">Total Time</p>
              <p className="font-medium text-gray-700">
                {fmtTime(report.totalTimeSeconds)}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-2.5">
              <p className="text-gray-400 mb-0.5">Class</p>
              <p className="font-medium text-gray-700">
                {report.studentClass ?? '—'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Category score bars */}
      {categories.some((c) => scoreJson[c.key] != null) && (
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <p className="text-xs font-semibold text-gray-600 mb-3 uppercase tracking-wide">
            Category Scores
          </p>
          {categories.map((c) => {
            const val = scoreJson[c.key];
            if (val == null) return null;
            const pct = typeof val === 'number' ? val * 25 : 0; // scale 1-4 → 25-100
            return (
              <CategoryScoreBar
                key={c.key}
                name={c.label}
                score={pct}
                weight={20}
                weightedScore={pct * 0.2}
              />
            );
          })}
        </div>
      )}

      {/* Summary / Feedback */}
      {(report.summary ?? report.feedback) && (
        <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
          <p className="text-xs font-semibold text-blue-700 mb-1">Feedback</p>
          <p className="text-xs text-gray-700 leading-relaxed">
            {report.feedback ?? report.summary}
          </p>
        </div>
      )}
    </div>
  );
}

function SummaryTab({ report }: { report: SimulationReport }) {
  const entries = report.summaryEntries ?? [];
  const actionSummary = report.actionSummary as
    Record<string, unknown> | undefined;
  const mandatoryActions =
    (report.mandatoryActions as {
      title: string;
      type: string;
      isCorrect: boolean;
      attemptsCount: number;
      pointsAwarded: number;
    }[]) ?? [];

  return (
    <div className="space-y-4">
      {/* Action summary stats */}
      {actionSummary && (
        <div className="grid grid-cols-3 gap-2">
          {[
            {
              label: 'Mandatory Actions',
              value: `${actionSummary['completedMandatory'] ?? 0} / ${actionSummary['totalMandatory'] ?? 0}`,
            },
            {
              label: 'Optional Actions',
              value: `${actionSummary['completedOptional'] ?? 0} / ${actionSummary['totalOptional'] ?? 0}`,
            },
            {
              label: 'Mandatory %',
              value: `${actionSummary['mandatoryPercentage'] ?? 0}%`,
            },
          ].map((s) => (
            <div
              key={s.label}
              className="bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-center"
            >
              <p className="text-lg font-bold text-gray-800">{s.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Mandatory actions checklist */}
      {mandatoryActions.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="bg-gray-50 px-3 py-2 border-b border-gray-200">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
              Mandatory Actions
            </p>
          </div>
          <ul className="divide-y divide-gray-100">
            {mandatoryActions.map((a, i) => (
              <li key={i} className="flex items-center gap-2.5 px-3 py-2">
                <span
                  className={`w-4 h-4 flex-shrink-0 rounded-full flex items-center justify-center text-white text-xs ${a.isCorrect ? 'bg-green-500' : 'bg-red-400'}`}
                >
                  {a.isCorrect ? '✓' : '✗'}
                </span>
                <span className="text-xs text-gray-700 flex-1">{a.title}</span>
                <span className="text-xs text-gray-400 capitalize">
                  {a.type}
                </span>
                <span
                  className={`text-xs font-medium ${a.isCorrect ? 'text-green-600' : 'text-red-500'}`}
                >
                  {a.pointsAwarded}pts
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Activity entries – rich action cards */}
      {entries.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
            Actions ({entries.length})
          </p>
          {entries.map((entry, i) => {
            const e = entry as Record<string, unknown>;
            const title = (e['title'] as string) ?? '—';
            const category = (e['category'] as string) ?? '';
            const elapsedTime = (e['elapsedTime'] as string) ?? '';
            const duration = e['duration'] as number | undefined;
            const timestamp = (e['timestamp'] as string) ?? '';
            const startTime = (e['startedAt'] ??
              e['started_at'] ??
              e['startTime']) as string | undefined;
            const endTime = ((e['endedAt'] ??
              e['ended_at'] ??
              e['endTime'] ??
              (startTime ? null : timestamp)) ||
              undefined) as string | undefined;
            const clinicalPrompt = (e['clinicalPrompt'] ??
              e['clinical_prompt'] ??
              e['prompt']) as string | undefined;
            const studentResponse = (e['studentResponse'] ??
              e['student_response'] ??
              e['response']) as string | undefined;
            const clinicalObservations = (e['clinicalObservations'] ??
              e['clinical_observations'] ??
              e['observations']) as string | undefined;
            const isCorrect = e['isCorrect'] as boolean | undefined;
            const performanceLabel = (e['performanceLabel'] ?? e['result']) as
              string | undefined;
            const questionType = (e['questionType'] ?? e['actionType']) as
              string | undefined;
            const hasClinicalData = !!(
              clinicalPrompt ||
              studentResponse ||
              clinicalObservations
            );
            const resultLabel =
              performanceLabel ??
              (isCorrect === true
                ? 'Satisfactory'
                : isCorrect === false
                  ? 'Unsatisfactory'
                  : null);
            const resultIsGood =
              isCorrect === true ||
              (typeof performanceLabel === 'string' &&
                performanceLabel.toLowerCase().includes('satisf') &&
                !performanceLabel.toLowerCase().includes('un'));
            return (
              <div
                key={i}
                className="border border-gray-200 rounded-lg overflow-hidden"
              >
                {/* Card header */}
                <div className="flex items-center justify-between bg-gray-50 px-3 py-2 border-b border-gray-100">
                  <div className="flex items-center gap-2">
                    {elapsedTime && (
                      <span className="text-xs text-gray-500">
                        ⏱ {elapsedTime}
                      </span>
                    )}
                    {category && (
                      <span className="text-xs font-semibold text-gray-600 bg-gray-200 px-2 py-0.5 rounded uppercase tracking-wide">
                        [{category}]
                      </span>
                    )}
                  </div>
                  {resultLabel && (
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                        resultIsGood
                          ? 'bg-green-100 text-green-700 border-green-300'
                          : 'bg-red-100 text-red-700 border-red-300'
                      }`}
                    >
                      {resultIsGood ? '✓' : '⊘'} {resultLabel.toUpperCase()}
                    </span>
                  )}
                </div>

                <div className="px-3 py-2.5 space-y-2">
                  {/* Timestamps */}
                  {(startTime || endTime || duration != null) && (
                    <p className="text-xs text-gray-400">
                      {startTime && `Started: ${fmtDate(startTime)}`}
                      {startTime && endTime && ' | '}
                      {endTime && `Ended: ${fmtDate(endTime)}`}
                      {duration != null && ` | Duration: ${duration}s`}
                    </p>
                  )}
                  {!startTime && !endTime && timestamp && (
                    <p className="text-xs text-gray-400">
                      {fmtDate(timestamp)}
                    </p>
                  )}

                  {/* Title + question type */}
                  <div>
                    <p className="text-sm font-semibold text-gray-800">
                      {title}
                    </p>
                    {(questionType ?? category) && (
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        {questionType ?? category}
                      </span>
                    )}
                  </div>

                  {/* Clinical Prompt */}
                  {clinicalPrompt && (
                    <div>
                      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
                        Clinical Prompt
                      </p>
                      <div className="bg-amber-50 border border-amber-200 rounded p-2">
                        <p className="text-xs text-gray-700 leading-relaxed">
                          {clinicalPrompt}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Student Response */}
                  {studentResponse && (
                    <div>
                      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
                        Student Response
                      </p>
                      <div className="bg-green-50 border border-green-200 rounded p-2">
                        <p className="text-xs text-gray-700 leading-relaxed">
                          {studentResponse}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Clinical Observations */}
                  {clinicalObservations && (
                    <div>
                      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
                        Clinical Observations
                      </p>
                      <p className="text-xs text-gray-600 italic">
                        {clinicalObservations}
                      </p>
                    </div>
                  )}

                  {/* Fallback details */}
                  {!hasClinicalData && (e['details'] as string) && (
                    <p className="text-xs text-gray-500">
                      {e['details'] as string}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {entries.length === 0 && !mandatoryActions.length && (
        <p className="text-sm text-gray-400 text-center py-8">
          No activity data available.
        </p>
      )}
    </div>
  );
}

function RubricsTab({ report }: { report: SimulationReport }) {
  const items = getRubricItems(report);
  const keys = Object.keys(items);

  if (!keys.length) {
    // Fallback: use rubricsPayload if available
    return (
      <p className="text-sm text-gray-400 text-center py-8">
        No rubric data available.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* Overall */}
      {report.rubricsTotal != null && (
        <div
          className={`rounded-lg border p-3 ${scoreBg(report.rubricsTotal)}`}
        >
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
              Overall Score
            </p>
            <span
              className={`text-lg font-bold ${scoreColor(report.rubricsTotal)}`}
            >
              {report.rubricsTotal.toFixed(1)}%
            </span>
          </div>
          {report.rubricsSummary && (
            <p className="text-xs text-gray-600 leading-relaxed line-clamp-3">
              {report.rubricsSummary}
            </p>
          )}
        </div>
      )}

      {/* Individual rubric items */}
      {keys.map((key) => {
        const item = items[key] as Record<string, unknown>;
        const name = (item['name'] as string) ?? key;
        const score = (item['score'] as number) ?? 0;
        const weight = (item['weight'] as number) ?? 0;
        const weightedScore = (item['weightedScore'] as number) ?? 0;
        const summary = (item['summary'] as string) ?? '';
        const strengths =
          (item['strengths'] as { point: string; example?: string }[]) ?? [];
        const weaknesses =
          (item['weaknesses'] as { point: string; example?: string }[]) ?? [];
        const recommendations = (item['recommendations'] as string[]) ?? [];

        return (
          <div
            key={key}
            className="border border-gray-200 rounded-lg overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50 border-b border-gray-200">
              <p className="text-xs font-semibold text-gray-800">{name}</p>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-bold ${scoreColor(score)}`}>
                  {score}%
                </span>
                <span className="text-xs text-gray-400">
                  {weightedScore.toFixed(1)}/{weight}pts
                </span>
              </div>
            </div>
            {/* Score bar */}
            <div className="px-3 pt-2 pb-1">
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${score >= 80 ? 'bg-green-500' : score >= 60 ? 'bg-yellow-500' : 'bg-red-400'}`}
                  style={{ width: `${score}%` }}
                />
              </div>
            </div>
            {/* Body */}
            <div className="px-3 pb-3 space-y-2">
              {summary && (
                <p className="text-xs text-gray-600 leading-relaxed">
                  {summary}
                </p>
              )}

              {strengths.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-green-600 mb-1">
                    ✓ Strengths
                  </p>
                  <ul className="space-y-0.5">
                    {strengths.map((s, i) => (
                      <li
                        key={i}
                        className="text-xs text-gray-600 pl-2 border-l-2 border-green-300"
                      >
                        {s.point}
                        {s.example && (
                          <span className="text-gray-400"> — {s.example}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {weaknesses.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-red-500 mb-1">
                    {localStorage.getItem('app_language')?.toLowerCase() ===
                    'es'
                      ? '✗ Necesita mejorar'
                      : '✗ Needs Improvement'}
                  </p>
                  <ul className="space-y-0.5">
                    {weaknesses.map((w, i) => (
                      <li
                        key={i}
                        className="text-xs text-gray-600 pl-2 border-l-2 border-red-300"
                      >
                        {w.point}
                        {w.example && (
                          <span className="text-gray-400"> — {w.example}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {recommendations.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-blue-600 mb-1">
                    💡 Recommendations
                  </p>
                  <ul className="space-y-0.5">
                    {recommendations.map((r, i) => (
                      <li
                        key={i}
                        className="text-xs text-gray-600 pl-2 border-l-2 border-blue-300"
                      >
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CommunicationTab({ report }: { report: SimulationReport }) {
  const ca = report.communicationAssessment as
    Record<string, unknown> | undefined;
  if (!ca)
    return (
      <p className="text-sm text-gray-400 text-center py-8">
        No communication assessment data available.
      </p>
    );

  // Navigate to rubric_communication item
  const allItems = getRubricItems(report);
  const commItem = allItems['rubric_communication'] as
    Record<string, unknown> | undefined;

  // Top-level communication assessment nested object
  const innerCa = ca['communicationAssessment'] as
    Record<string, unknown> | undefined;
  const caRubrics = (innerCa?.['rubrics'] ?? ca['rubrics']) as
    Record<string, unknown> | undefined;
  const overall = ca['overall'] as Record<string, unknown> | undefined;
  const meta = ca['meta'] as Record<string, unknown> | undefined;

  const criteriaResults =
    (commItem?.['criteriaResults'] as {
      criterionId: string;
      title: string;
      passed: boolean;
      rationale: string;
    }[]) ?? [];
  const strengths =
    (commItem?.['strengths'] as { point: string; example?: string }[]) ?? [];
  const weaknesses =
    (commItem?.['weaknesses'] as { point: string; example?: string }[]) ?? [];
  const recommendations = (commItem?.['recommendations'] as string[]) ?? [];

  return (
    <div className="space-y-3">
      {/* Meta / overall */}
      {!!(meta || overall) && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3">
          <div className="flex items-center justify-between mb-1">
            <div>
              <p className="text-xs font-semibold text-indigo-700">
                {(meta?.['assessmentType'] as string) ??
                  'Communication Assessment'}
              </p>
              {!!meta?.['standards'] && (
                <p className="text-xs text-indigo-500">
                  {meta['standards'] as string}
                </p>
              )}
            </div>
            {overall?.['score'] != null && (
              <div className="text-right">
                <p
                  className={`text-xl font-bold ${scoreColor(overall['score'] as number)}`}
                >
                  {(overall['score'] as number).toFixed(1)}%
                </p>
                <p className="text-xs text-gray-500">
                  {(overall['label'] as string) ?? ''}
                </p>
              </div>
            )}
          </div>
          {!!overall?.['summary'] && (
            <p className="text-xs text-gray-600 mt-1">
              {overall['summary'] as string}
            </p>
          )}
        </div>
      )}

      {/* Overall rubric summary */}
      {!!caRubrics?.['overallSummary'] && (
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <p className="text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
            Overall Assessment
          </p>
          <p className="text-xs text-gray-600 leading-relaxed">
            {caRubrics['overallSummary'] as string}
          </p>
          {!!caRubrics['feedback'] && (
            <div className="mt-2 pt-2 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-600 mb-1">
                Feedback
              </p>
              <p className="text-xs text-gray-600 leading-relaxed">
                {caRubrics['feedback'] as string}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Communication rubric item detail */}
      {commItem && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50 border-b border-gray-200">
            <p className="text-xs font-semibold text-gray-800">
              {(commItem['name'] as string) ?? 'Communication'}
            </p>
            <span
              className={`text-sm font-bold ${scoreColor((commItem['score'] as number) ?? 0)}`}
            >
              {(commItem['score'] as number) ?? 0}%
            </span>
          </div>
          <div className="px-3 py-2">
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-2">
              <div
                className={`h-full rounded-full ${((commItem['score'] as number) ?? 0) >= 80 ? 'bg-green-500' : ((commItem['score'] as number) ?? 0) >= 60 ? 'bg-yellow-500' : 'bg-red-400'}`}
                style={{ width: `${(commItem['score'] as number) ?? 0}%` }}
              />
            </div>
            {!!commItem['summary'] && (
              <p className="text-xs text-gray-600 leading-relaxed mb-2">
                {commItem['summary'] as string}
              </p>
            )}

            {criteriaResults.length > 0 && (
              <div className="space-y-1.5 mb-2">
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                  Criteria
                </p>
                {criteriaResults.map((c) => (
                  <div key={c.criterionId} className="flex items-start gap-2">
                    <span
                      className={`mt-0.5 w-4 h-4 flex-shrink-0 rounded-full flex items-center justify-center text-white text-xs ${c.passed ? 'bg-green-500' : 'bg-red-400'}`}
                    >
                      {c.passed ? '✓' : '✗'}
                    </span>
                    <div>
                      <p className="text-xs font-medium text-gray-700">
                        {c.title}
                      </p>
                      <p className="text-xs text-gray-400">{c.rationale}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {strengths.length > 0 && (
              <div className="mb-2">
                <p className="text-xs font-semibold text-green-600 mb-1">
                  ✓ Strengths
                </p>
                {strengths.map((s, i) => (
                  <p
                    key={i}
                    className="text-xs text-gray-600 pl-2 border-l-2 border-green-300 mb-0.5"
                  >
                    {s.point}
                  </p>
                ))}
              </div>
            )}

            {weaknesses.length > 0 && (
              <div className="mb-2">
                <p className="text-xs font-semibold text-red-500 mb-1">
                  {localStorage.getItem('app_language')?.toLowerCase() === 'es'
                    ? '✗ Necesita mejorar'
                    : '✗ Needs Improvement'}
                </p>
                {weaknesses.map((w, i) => (
                  <p
                    key={i}
                    className="text-xs text-gray-600 pl-2 border-l-2 border-red-300 mb-0.5"
                  >
                    {w.point}
                  </p>
                ))}
              </div>
            )}

            {recommendations.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-blue-600 mb-1">
                  💡 Recommendations
                </p>
                {recommendations.map((r, i) => (
                  <p
                    key={i}
                    className="text-xs text-gray-600 pl-2 border-l-2 border-blue-300 mb-0.5"
                  >
                    {r}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {!commItem && !caRubrics && (
        <p className="text-sm text-gray-400 text-center py-4">
          Detailed communication data not available.
        </p>
      )}
    </div>
  );
}

// ── main component ─────────────────────────────────────────────────────────────

export default function SimulationReportDetailModal({
  report,
  studentName,
  onClose,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  const simName =
    report.scenarioTitle ??
    report.scenario_title ??
    report.scenarioId ??
    'Report';
  const score = report.rubricsTotal ?? report.score ?? 0;
  const label = report.performanceLabel ?? '—';

  const tabs: { id: TabId; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'summary', label: 'Actions & Summary' },
    { id: 'rubrics', label: 'Rubrics' },
    { id: 'communication', label: 'Communication' },
  ];

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={simName}
      subtitle={`${studentName} · ${typeof score === 'number' ? score.toFixed(1) + '%' : '—'} · ${label}`}
      className="max-w-2xl w-full"
    >
      {/* Tab bar */}
      <div className="flex border-b border-gray-200 -mt-1 mb-4 overflow-x-auto">
        {tabs.map((t) => (
          <TabButton
            key={t.id}
            id={t.id}
            active={activeTab === t.id}
            label={t.label}
            onClick={setActiveTab}
          />
        ))}
      </div>

      {/* Tab content */}
      <div className="max-h-[65vh] overflow-y-auto pr-0.5">
        {activeTab === 'overview' && <OverviewTab report={report} />}
        {activeTab === 'summary' && <SummaryTab report={report} />}
        {activeTab === 'rubrics' && <RubricsTab report={report} />}
        {activeTab === 'communication' && <CommunicationTab report={report} />}
      </div>
    </Modal>
  );
}
