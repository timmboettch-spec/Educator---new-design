import {
  ReportModeType,
  SimulationReportSelectorType,
} from 'src/common/constants/simulation-report.constants';
import type { SimulationReport } from 'src/database/entities/simulation-report.entity';

export interface BulkReviewParams {
  selectorType: SimulationReportSelectorType;
  ids: string[];
  reviewed: boolean;
  educatorId: string;
}

export interface BulkReviewResult {
  updatedIds: string[];
  notAccessibleIds: string[];
}

/** One updated `simulation_reports` row's ids, as returned by the bulk-review UPDATE's RETURNING clause. */
export interface BulkReviewRawRow {
  id: string;
  student_id: string;
  scenario_id: string;
  class_id: string;
}

/** A scenario timeline block, limited to the fields Timeline analysis reads. */
export interface TimelineBlock {
  id: string;
  label?: string;
  title?: string;
  sourceId?: string;
  start?: number | null;
  duration?: number | null;
  prerequisites?: string[];
  followups?: string[];
  sequenceChain?: string[];
}

/** Internal normalized copy of a block; `__verbalized` is set while matching vitals. */
export interface NormalizedTimelineBlock extends TimelineBlock {
  prerequisites: string[];
  followups: string[];
  __verbalized?: boolean;
}

/** A timed event (action, order, vital reading or log entry). */
export interface TimelineEvent {
  title?: string;
  elapsedSeconds?: number;
  timestamp?: string | number | Date;
  timestampValue?: number;
}

export interface TimelineActionLogEntry extends TimelineEvent {
  label?: string;
  text?: string;
  message?: string;
}

export interface TimelineActionItem extends TimelineEvent {
  vitals?: Record<string, TimelineEvent[]>;
}

export interface TimelineSummaryByCategory {
  actions?: TimelineActionItem[];
  orders?: TimelineEvent[];
  vitals?: Record<string, TimelineEvent[]>;
}

export interface TimelineCommonActionTrackerLike {
  actionLog?: TimelineActionLogEntry[];
}

export type TimelineStatus =
  | 'Completed'
  | 'Completed on time'
  | 'Completed too early'
  | 'Completed too late'
  | 'Not completed'
  | 'Pending AI Analysis';

export type TimelineCompletionSource =
  'action' | 'order' | 'summary' | 'summary-verbalized' | 'ppe';

export interface PendingAiTimingDetail {
  blockLabel?: string;
  blockId: string;
  sourceId?: string;
  completed: false;
  status: 'Pending AI Analysis';
  requiresAIAnalysis: true;
  prerequisites: string[];
  followups: string[];
}

export interface EvaluatedTimingDetail {
  blockLabel?: string;
  blockId: string;
  sourceId?: string;
  expectedStartSeconds?: number;
  expectedEndSeconds?: number;
  expectedStartFormatted?: string;
  expectedEndFormatted?: string;
  actualTimeSeconds?: number | null;
  actualTimeFormatted?: string;
  withinTimeWindow?: boolean;
  status: Exclude<TimelineStatus, 'Pending AI Analysis'>;
  completed: boolean;
  requiresAIAnalysis?: undefined;
  completionSource?: TimelineCompletionSource;
  verbalized?: true;
  prerequisites: string[];
  followups: string[];
  prerequisitesMet?: boolean;
  followupsCorrect?: boolean;
}

export type TimingDetail = PendingAiTimingDetail | EvaluatedTimingDetail;

export interface PatientDataBlock {
  blockLabel?: string;
  blockId: string;
  sourceId?: string;
  patientField: string;
  expectedStartSeconds: number;
  expectedEndSeconds: number;
  prerequisites: string[];
  followups: string[];
  block: NormalizedTimelineBlock;
}

export interface SequenceChainViolation {
  blockId: string;
  blockLabel: string;
  type: 'sequence_chain_violation';
  message: string;
  expectedAfter: string;
  expectedAfterLabel?: string;
  expectedTime: number | null;
  actualTime: number | null;
}

export interface PrerequisiteViolation {
  blockId: string;
  blockLabel?: string;
  type: 'missing_prerequisite' | 'prerequisite_order_violation';
  prereqId: string;
  prereqLabel: string;
  message: string;
  expectedTime?: number;
  actualTime?: number;
}

export interface FollowupViolation {
  blockId: string;
  blockLabel?: string;
  type: 'missing_followup' | 'followup_order_violation';
  followupId: string;
  followupLabel: string;
  message: string;
  expectedTime?: number;
  actualTime?: number;
}

export type SequenceViolation = SequenceChainViolation | PrerequisiteViolation | FollowupViolation;

export interface TimelineAnalysisResult {
  completedBlocks: string[];
  missedBlocks: string[];
  timingDetails: TimingDetail[];
  completionRate: number;
  timingComplianceRate: number;
  sequenceComplianceRate: number;
  sequenceViolations: SequenceViolation[];
  patientDataBlocks: PatientDataBlock[];
}

/**
 * Shapes of a generated simulation report (one `reports/{id}.json` entry), limited to the fields
 * backend code reads from a generated report. The generator writes more than this;
 * unlisted fields are ignored. Every property is
 * optional: readers must not assume presence.
 */

// ── commonActionTracker ─────────────────────────────────────────────────────

/** Read by the transcript endpoint (common actions, sim date/time). */
export interface ReportCommonActionLogEntry {
  label?: string;
  type?: string;
  timestamp?: string;
  timestampSimMs?: number;
}

export interface ReportCommonActionTracker {
  actionLog?: ReportCommonActionLogEntry[];
}

// ── scoreJson ───────────────────────────────────────────────────────────────

/** Score fallback (listing, class stats) and performance-quality label. */
export interface ReportScoreJson {
  overallScore?: number | null;
  overallLabel?: string;
}

// ── summaryEntries / summaryByCategory ──────────────────────────────────────

/** Returned by the transcript endpoint's summary entries. */
export interface ReportSummaryEntry {
  id?: string;
  title?: string;
  details?: string;
  category?: string;
  elapsedSeconds?: number;
  timestampValue?: number;
  elapsedTime?: string;
}

/** Transcript endpoint flattens every array-valued category; `vitals` is excluded. */
export interface ReportSummaryByCategory {
  demographics?: ReportSummaryEntry[];
  history?: ReportSummaryEntry[];
  debriefMeta?: ReportSummaryEntry[];
  actions?: ReportSummaryEntry[];
  medications?: ReportSummaryEntry[];
  orders?: ReportSummaryEntry[];
}

// ── communicationAssessment ─────────────────────────────────────────────────

/** Read by the email report (rubric breakdown). */
export interface ReportRubricPoint {
  point?: string;
  example?: string;
}

export interface ReportRubricItem {
  name?: string;
  subCategory?: string;
  score?: number | null;
  weight?: number;
  summary?: string;
  strengths?: ReportRubricPoint[];
  weaknesses?: ReportRubricPoint[];
  recommendations?: string[];
}

export interface ReportRubrics {
  overallSummary?: string;
  /** Rubric item id → item. */
  items?: Record<string, ReportRubricItem>;
}

export interface ReportCommunicationAssessment {
  rubrics?: ReportRubrics;
}

// ── whole entry ─────────────────────────────────────────────────────────────

/** One generated report as written to `reports/{id}.json`. */
export interface SimulationReportEntry {
  /** Attempt identity (dedupe, lookup by id). */
  id?: string;
  key?: string;
  userId?: string;
  studentName?: string;
  /** Student Code, not the `students.id` uuid. */
  student_id?: string;
  studentClass?: string;
  scenarioId?: string;
  scenarioTitle?: string;
  transcriptId?: string;
  scenarioStartTime?: string;
  scenarioEndTime?: string;
  totalTimeSeconds?: number | null;
  commonActionTracker?: ReportCommonActionTracker;
  mode?: ReportModeType;
  score?: number | null;
  performanceLabel?: string;
  scoreJson?: ReportScoreJson;
  summary?: string;
  summaryEntries?: ReportSummaryEntry[];
  summaryByCategory?: ReportSummaryByCategory;
  feedback?: string;
  communicationAssessment?: ReportCommunicationAssessment;
  debriefReflection?: string;
  rubricsSummary?: string;
  rubricsTotal?: number | null;
  actionScores?: object;
  actionSummary?: object;
  mandatoryActions?: object[];
  optionalActions?: object[];
  distractorActions?: object[];
  createdAt?: string;
}

/**
 * Writable columns of one Attempt row, as built from a generated report by `buildAttemptRow`.
 * Everything except the database-managed columns (uuid PK and timestamps). `attemptNumber` is
 * optional: it stays null until Simulation Progress assigns it (ADR-0010).
 */
export type AttemptRowInput = Omit<
  SimulationReport,
  'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'attemptNumber'
> &
  Partial<Pick<SimulationReport, 'attemptNumber'>>;

/** A student's stored Attempts: how many, and the sum of their `total_time_seconds`. */
export interface StudentAttemptTotals {
  attemptCount: number;
  totalSeconds: number;
}

/** Columns the score is read from: the `score` column, then `score_json.overallScore`. */
export type ReportScoreRow = Pick<SimulationReport, 'score' | 'scoreJson'>;

/** Columns an Attempt's score and mode are read from, for best-score selection. */
export type ReportScoreModeRow = ReportScoreRow & Pick<SimulationReport, 'mode'>;

/** An Attempt's owner, scenario, mode and score columns, for authoritative grade passback. */
export type ReportOwnedScoreRow = ReportScoreModeRow &
  Pick<SimulationReport, 'id' | 'studentId' | 'scenarioId'>;

/** Columns the performance label is read from: `score_json.overallLabel`, then `performance_label`. */
export type ReportLabelRow = Pick<SimulationReport, 'scoreJson' | 'performanceLabel'>;

/** Typed per-field columns the list entry is built from. */
export type ReportListRow = Pick<
  SimulationReport,
  | 'reportId'
  | 'userId'
  | 'studentCode'
  | 'key'
  | 'studentName'
  | 'studentClass'
  | 'scenarioId'
  | 'scenarioTitle'
  | 'transcriptId'
  | 'scenarioStartTime'
  | 'scenarioEndTime'
  | 'totalTimeSeconds'
  | 'mode'
  | 'score'
  | 'performanceLabel'
  | 'scoreJson'
  | 'createdAt'
>;

/** Typed per-field columns the detail (`reports/{id}.json`) shape is built from. */
export type ReportDetailRow = ReportListRow &
  Pick<
    SimulationReport,
    | 'summary'
    | 'summaryEntries'
    | 'summaryByCategory'
    | 'feedback'
    | 'commonActionTracker'
    | 'communicationAssessment'
    | 'rubricsSummary'
    | 'rubricsTotal'
    | 'debriefReflection'
    | 'actionScores'
    | 'actionSummary'
    | 'mandatoryActions'
    | 'optionalActions'
    | 'distractorActions'
  >;

/** One entry of the student's `GET /reports` list. */
export type ReportListEntry = Pick<
  SimulationReportEntry,
  | 'id'
  | 'userId'
  | 'student_id'
  | 'key'
  | 'studentName'
  | 'studentClass'
  | 'scenarioId'
  | 'scenarioTitle'
  | 'transcriptId'
  | 'scenarioStartTime'
  | 'scenarioEndTime'
  | 'totalTimeSeconds'
  | 'mode'
  | 'score'
  | 'performanceLabel'
  | 'scoreJson'
  | 'createdAt'
>;

/** The `reports/{id}.json` shape, rebuilt from columns. */
export type ReportDetail = SimulationReportEntry;

/**
 * The report fields callers read today, rebuilt from one `simulation_reports` row. `score` keeps
 * its name; `overallScore` is the `score` column, else `score_json.overallScore`. `performanceLabel`
 * is `score_json.overallLabel`, else the `performance_label` column. Missing values are omitted.
 */
export type ReportRowFields = ReportDetail & { overallScore?: number };

/** A stored Attempt as the educator reads return it. */
export type SimulationReportRow = SimulationReport;

/** A Report row on the class reports route, plus the temporary snake_case `student_id` alias. */
export type ClassReportRow = SimulationReportRow & { student_id: string };

/** A detail row plus the ids needed to resolve its owning Student. */
export type ReportDetailWithStudentRow = ReportDetailRow &
  Pick<SimulationReport, 'id' | 'studentId'>;

/** Optional filters and the page window for the unscoped Reports read (`GET /simulation-reports`). */
export interface ReportPageParams {
  studentId?: string;
  scenarioId?: string;
  skip: number;
  take: number;
}

/** `since` is the first instant (UTC) of the oldest month counted; `adminId` is a `users.id`. */
export interface ReportMonthlyCountParams {
  since: Date;
  adminId?: string;
}

/** Reports completed in one UTC month. `month` is `YYYY-MM`. */
export interface ReportMonthlyCount {
  month: string;
  count: number;
}

/** A student who has at least one Attempt at a scenario. */
export interface StudentScenarioPair {
  studentId: string;
  scenarioId: string;
}

/** The latest Attempt's identity, as the educator notification needs it. */
export type LatestAttemptNotificationRow = Pick<
  SimulationReport,
  'reportId' | 'scenarioId' | 'studentName'
>;

/** Result of resolving a caller to a Student: the `students.id` uuid, or `null` when not found. */
export type ResolvedStudentId = string | null;
