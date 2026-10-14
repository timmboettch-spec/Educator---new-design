import type {
  AttemptRowInput,
  ICurrentUser,
  ReportDetail,
  ReportDetailRow,
  ReportListEntry,
  ReportListRow,
  ReportRowFields,
  ResolvedStudentId,
  SimulationReportEntry,
} from 'src/common/interfaces';
import {
  extractOverallScoreFromRow,
  extractPerformanceQualityFromRow,
} from 'src/simulation-reports/utils/report-score.util';
import { toUtc, toUtcIsoString } from './dayjs.utils';

/** The caller's `students.id`, read straight from the verified token; `null` when it carries none. */
export function resolveStudentId(currentUser: ICurrentUser | undefined): ResolvedStudentId {
  return currentUser?.studentId ?? null;
}

/** `HH:MM:SS` for a duration in seconds, hours uncapped. */
export function formatSecondsAsClock(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':');
}

function toDateOrNull(value?: string): Date | null {
  if (!value) return null;
  const parsed = toUtc(value);
  return parsed.isValid() ? parsed.toDate() : null;
}

/**
 * Builds the `simulation_reports` row for one Attempt from its generated report. Every per-field
 * column is filled from the report.
 *
 * @param report the generated report.
 * @param studentId the `students.id` uuid of the current student — not the entry's `student_id`,
 *   which is a Student Code and goes to `student_code`.
 */
export function buildAttemptRow(report: SimulationReportEntry, studentId: string): AttemptRowInput {
  return {
    studentId: studentId,
    studentName: report.studentName ?? null,
    scenarioId: report.scenarioId ?? null,
    transcriptId: report.transcriptId ?? null,
    viewedAt: null,
    viewedBy: null,
    reportId: report.id ?? null,
    key: report.key ?? null,
    userId: report.userId ?? null,
    studentCode: report.student_id ?? null,
    studentClass: report.studentClass ?? null,
    scenarioTitle: report.scenarioTitle ?? null,
    scenarioStartTime: toDateOrNull(report.scenarioStartTime),
    scenarioEndTime: toDateOrNull(report.scenarioEndTime),
    totalTimeSeconds: report.totalTimeSeconds ?? null,
    mode: report.mode ?? null,
    score: report.score ?? null,
    performanceLabel: report.performanceLabel ?? null,
    scoreJson: report.scoreJson ?? null,
    summary: report.summary ?? null,
    summaryEntries: report.summaryEntries ?? null,
    summaryByCategory: report.summaryByCategory ?? null,
    feedback: report.feedback ?? null,
    commonActionTracker: report.commonActionTracker ?? null,
    communicationAssessment: report.communicationAssessment ?? null,
    rubricsSummary: report.rubricsSummary ?? null,
    rubricsTotal: report.rubricsTotal ?? null,
    debriefReflection: report.debriefReflection ?? null,
    actionScores: report.actionScores ?? null,
    actionSummary: report.actionSummary ?? null,
    mandatoryActions: report.mandatoryActions ?? null,
    optionalActions: report.optionalActions ?? null,
    distractorActions: report.distractorActions ?? null,
  };
}

function isoOrUndefined(value: Date | null): string | undefined {
  return value ? toUtcIsoString(value) : undefined;
}

/** Drops keys whose value is `null`/`undefined`, as a blob entry simply omits missing fields. */
function omitMissing<T extends object>(entry: T): T {
  return Object.fromEntries(
    Object.entries(entry).filter(([, value]) => value !== null && value !== undefined),
  ) as T;
}

/** Fields the list entry and the detail shape have in common. */
function mapSharedFields(row: ReportListRow): ReportListEntry {
  return omitMissing<ReportListEntry>({
    id: row.reportId ?? undefined,
    userId: row.userId ?? undefined,
    student_id: row.studentCode ?? undefined,
    key: row.key ?? undefined,
    studentName: row.studentName ?? undefined,
    studentClass: row.studentClass ?? undefined,
    scenarioId: row.scenarioId ?? undefined,
    scenarioTitle: row.scenarioTitle ?? undefined,
    transcriptId: row.transcriptId ?? undefined,
    scenarioStartTime: isoOrUndefined(row.scenarioStartTime),
    scenarioEndTime: isoOrUndefined(row.scenarioEndTime),
    totalTimeSeconds: row.totalTimeSeconds,
    mode: row.mode ?? undefined,
    score: row.score,
    performanceLabel: row.performanceLabel ?? undefined,
    scoreJson: row.scoreJson ?? undefined,
    createdAt: isoOrUndefined(row.createdAt),
  });
}

/** Builds one `GET /reports` list entry from the selected columns. Reads no `report_data`. */
export function mapRowToReportListEntry(row: ReportListRow): ReportListEntry {
  return mapSharedFields(row);
}

/** Builds the `reports/{id}.json` shape from the typed columns. Reads no `report_data`. */
export function mapRowToReportDetail(row: ReportDetailRow): ReportDetail {
  return omitMissing<ReportDetail>({
    ...mapSharedFields(row),
    summary: row.summary ?? undefined,
    summaryEntries: row.summaryEntries ?? undefined,
    summaryByCategory: row.summaryByCategory ?? undefined,
    feedback: row.feedback ?? undefined,
    commonActionTracker: row.commonActionTracker ?? undefined,
    communicationAssessment: row.communicationAssessment ?? undefined,
    rubricsSummary: row.rubricsSummary ?? undefined,
    rubricsTotal: row.rubricsTotal,
    debriefReflection: row.debriefReflection ?? undefined,
    actionScores: row.actionScores ?? undefined,
    actionSummary: row.actionSummary ?? undefined,
    mandatoryActions: row.mandatoryActions ?? undefined,
    optionalActions: row.optionalActions ?? undefined,
    distractorActions: row.distractorActions ?? undefined,
  });
}

/**
 * Builds the report fields callers used to read from `report_data`, from the typed columns.
 * Reads no `report_data`. `transcriptId` is the `transcript_id` column.
 */
export function mapRowToReportFields(row: ReportDetailRow): ReportRowFields {
  return omitMissing<ReportRowFields>({
    ...mapRowToReportDetail(row),
    overallScore: extractOverallScoreFromRow(row) ?? undefined,
    performanceLabel: extractPerformanceQualityFromRow(row) ?? undefined,
  });
}
