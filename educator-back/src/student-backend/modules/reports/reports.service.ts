import * as os from 'os';

import { BlobServiceClient, type ContainerClient } from '@azure/storage-blob';
import { HttpService } from '@nestjs/axios';
import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as ExcelJS from 'exceljs';
import * as nodemailer from 'nodemailer';
import { firstValueFrom } from 'rxjs';

import {
  JsonDataService,
  type CommunicationCriterion,
  type Report,
  type RubricItem,
  type Scenario,
  type Transcript,
} from '../../data/json-data.service';
import {
  LIFECYCLE_SCHEMA_VERSION,
  GradingType,
  SubsystemStopReason,
} from '../telemetry/dto/lifecycle-events.dto';
import { LifecycleTelemetryService } from '../telemetry/lifecycle-telemetry.service';

import {
  ActionsInterventionsService,
  type ActionAttempt,
  type ScenarioActionDef,
  type SummaryByCategoryLike,
  type StudentSummaryLike as ActionStudentSummaryLike,
} from './actions-interventions.service';
import { ClinicalDocumentationService } from './clinical-documentation.service';
import { CommunicationService } from './communication.service';
import { type CreateReportDto } from './dto/create-report.dto';
import { PpePrivacyService } from './ppe-privacy.service';
import { SequencingService, type SequencingEnrichedEntry } from './sequencing.service';
import { computeTimelineAnalysis } from './timeline-analysis';
import {
  TimelineTimingService,
  type StudentSummary,
  type VitalConfig,
  type MedicationsItem,
} from './timeline-timing.service';
import {
  type ActionDetail,
  type DeterministicActionMarksResult,
  type MedicationsAnalysisResult,
} from './types/scoring.types';

// -- Medication normalization helpers -------------------------------------------
export function normalizeMedicationName(name?: string): string {
  if (!name || typeof name !== 'string') {
    return '';
  }
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/(\d+(?:\.\d+)?)\s*([a-zA-Z]+)/g, '$1$2')
    .replace(/\s*\/\s*/g, '/');
}

export function normalizeMedicationKey(nameOrTitle?: string, medicationId?: string): string {
  if (medicationId && typeof medicationId === 'string' && medicationId.trim().length > 0) {
    return `id:${medicationId.trim().toLowerCase()}`;
  }
  const normName = normalizeMedicationName(nameOrTitle);
  return normName ? `name:${normName}` : '';
}

// -- Report constants -----------------------------------------------------------
/** Score threshold above which performance is labelled "Exceptional". */
const SCORE_EXCEPTIONAL_MIN = 90;
/** Score threshold above which performance is labelled "Meets Expectations". */
const SCORE_MEETS_EXPECTATIONS_MIN = 75;
/** Coverage/completion rate threshold for "high" label (85 %). */
const COVERAGE_HIGH_PCT = 85;
/** Coverage/completion rate threshold for "medium-high" label (80 %). */
const COVERAGE_MEDIUM_HIGH_PCT = 80;
/** Coverage/completion rate threshold for "medium" label (70 %). */
const COVERAGE_MEDIUM_PCT = 70;
/** Coverage/completion rate threshold for "low-medium" label (60 %). */
const COVERAGE_LOW_MEDIUM_PCT = 60;
/** Coverage/completion rate threshold for "low" label (50 %). */
const COVERAGE_LOW_PCT = 50;
/** Temperature for unified reporting LLM call (slightly creative for narrative). */
const UNIFIED_REPORT_AI_TEMPERATURE = 0.2;
/** Maximum tokens for the unified reporting LLM response. */
const UNIFIED_REPORT_AI_MAX_TOKENS = 10_000;
/** Temperature for focused extraction LLM calls (deterministic). */
const EXTRACTION_AI_TEMPERATURE = 0;
/** Maximum tokens for a short JSON-extraction LLM response. */
const EXTRACTION_AI_MAX_TOKENS_SHORT = 250;
/** Maximum tokens for a medium JSON-extraction LLM response. */
const EXTRACTION_AI_MAX_TOKENS_MEDIUM = 300;
/** Maximum number of attempts to fetch a transcript before giving up. */
const TRANSCRIPT_FETCH_MAX_RETRIES = 10;
/** Delay (ms) between transcript fetch retries. */
const TRANSCRIPT_FETCH_RETRY_DELAY_MS = 1000;
/** Default SMTP port used when EMAIL_PORT env-var is absent. */
const DEFAULT_SMTP_PORT = 587;
/**
 * Maximum number of graded Assessment attempts a student may have per
 * scenario. Once this many Assessment reports exist for a given
 * (scenarioId, studentId) pair, further createReport calls return the most
 * recent existing report instead of generating another one.
 */
const MAX_ASSESSMENT_ATTEMPTS = 3;

type ScenarioRubricItem = RubricItem;

interface RubricItemRecord {
  id?: string;
  name?: string;
  subCategory?: string;
  weight?: number;
  score?: number | null;
  maxScore?: number;
  weightedScore?: number;
  summary?: string;
  strengths?: Array<{ point: string; example: string }>;
  weaknesses?: Array<{ point: string; example: string }>;
  recommendations?: string[];
  timingDetails?: TimingDetail[];
  sequenceViolations?: SequenceViolation[];
  criteriaResults?: Array<{
    criterionId?: string;
    title?: string;
    passed?: boolean;
    rationale?: string;
  }>;
  actionDetails?: Array<{
    title?: string;
    type?: string;
    completed?: boolean;
    isCorrect?: boolean;
    isOptional?: boolean;
    response?: unknown;
    pointsAwarded?: number;
  }>;
  feedback?: string;
}

interface RubricsContainer {
  overallSummary?: string;
  totalScore: number;
  totalWeight: number;
  feedback?: string;
  items: Record<string, RubricItemRecord>;
}

interface CommunicationAssessment {
  rubrics?: RubricsContainer;
  technicalSkills?: { totalScore?: number; totalWeight?: number; items?: Record<string, unknown> };
  softSkills?: { totalScore?: number; totalWeight?: number; items?: Record<string, unknown> };
  overall?: { summary?: string; score?: number; label?: string; feedback?: string };
  feedback?: string;
  [key: string]: unknown;
}

interface TimingDetail {
  blockId?: string;
  sourceId?: string;
  blockLabel?: string;
  completed?: boolean;
  actualTimeSeconds?: number;
  actualTimeFormatted?: string;
  expectedStartSeconds?: number;
  expectedEndSeconds?: number;
  expectedStartFormatted?: string;
  expectedEndFormatted?: string;
  withinTimeWindow?: boolean;
  status?: string;
  requiresAIAnalysis?: boolean;
  prerequisitesMet?: boolean;
  followupsCorrect?: boolean;
  prerequisites?: string[];
  followups?: string[];
  verbalized?: boolean;
  [key: string]: unknown;
}

interface SequenceViolation {
  blockId: string;
  blockLabel?: string;
  type: string;
  prereqId?: string;
  prereqLabel?: string;
  followupId?: string;
  followupLabel?: string;
  expectedAfterLabel?: string;
  expectedBefore?: string;
  message?: string;
  expectedTime?: number;
  actualTime?: number;
}

interface ScenarioTitleLike {
  title?: string;
  requirements?: Array<{ text?: string; keywords?: string[]; required?: boolean }>;
  [key: string]: unknown;
}

interface ReportExportRow {
  id?: string;
  studentName?: string;
  studentClass?: string;
  scenarioTitle?: string;
  scenarioId?: string;
  scenarioStartTime?: string;
  scenarioEndTime?: string;
  totalTimeSeconds?: number;
  score?: number;
  createdAt?: string;
  [key: string]: unknown;
}

interface OpenAIRawResponse {
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  choices?: Array<{ message?: { content?: string } }>;
}

interface EnrichedMessage {
  elapsedSeconds: number;
  elapsedTimeFormatted: string;
  speaker?: string;
  text?: string;
  timestampValue?: number;
  timestamp?: string;
  [key: string]: unknown;
}

interface ScenarioActionLike {
  isExcluded?: boolean;
  typeRequirement?: string;
  type?: string;
  isOptional?: boolean;
  title?: string;
  [key: string]: unknown;
}

/** Typed shape of a transcript message (used in conversation-quality helpers). */
interface TranscriptMessage {
  speaker?: string;
  text?: string;
  timestamp?: string;
  timestampValue?: number;
  elapsedSeconds?: number;
  [key: string]: unknown;
}

/** Typed shape of a phase item used in analyzePhaseTaskCompletion.
 * Kept here as a named type for clarity even if the actual parameter uses an inline shape.
 */
type _PhaseItem = {
  id?: string;
  name?: string;
  tasks?: Array<{
    id?: string;
    label?: string;
    required?: boolean;
  }>;
};

/** A rubric item as it appears in the email HTML (post-AI enrichment). */
interface EmailRubricItem {
  id?: string;
  name?: string;
  subCategory?: string;
  score?: number;
  maxScore?: number;
  weightedScore?: number;
  weight?: number;
  summary?: string;
  strengths?: Array<{ point?: string; example?: string } | string>;
  weaknesses?: Array<{ point?: string; example?: string } | string>;
  recommendations?: string[];
  actionDetails?: Array<{ type?: string; title?: string; [key: string]: unknown }>;
  [key: string]: unknown;
}

/** Full report shape that includes all optional runtime fields beyond base Report. */
interface FullReport extends Record<string, unknown> {
  id: string;
  userId: string;
  key?: string;
  studentName?: string;
  studentClass?: string;
  scenarioId: string;
  scenarioTitle?: string;
  transcriptId: string;
  scenarioStartTime?: string;
  scenarioEndTime?: string;
  score: number;
  scoreJson?: Record<string, unknown>;
  summary?: string;
  strengths?: string[];
  improvements?: string[];
  feedback?: string;
  createdAt: string;
  debriefReflection?: string;
  communicationAssessment?: CommunicationAssessment & {
    technicalSkills?: {
      totalScore?: number;
      totalWeight?: number;
      items?: Record<string, EmailRubricItem>;
      overallstrengths?: Array<{ point?: string; example?: string } | string>;
      overallweaknesses?: Array<{ point?: string; example?: string } | string>;
    };
    softSkills?: {
      totalScore?: number;
      totalWeight?: number;
      items?: Record<string, EmailRubricItem>;
      overallstrengths?: Array<{ point?: string; example?: string } | string>;
      overallweaknesses?: Array<{ point?: string; example?: string } | string>;
    };
    overall?: {
      score?: number;
      summary?: string;
      feedback?: string;
      strengths?: string[];
      weaknesses?: string[];
      recommendations?: string[];
    };
  };
  transcript?: { scenario?: { title?: string; [key: string]: unknown }; [key: string]: unknown };
}

@Injectable()
export class ReportsService {
  private readonly azureConnectionString = process.env.AZURE_STORAGE_CONNECTION_STRING ?? '';
  private readonly blobContainerName =
    process.env.AZURE_BLOB_CONTAINER_NAME ??
    process.env.AZURE_STORAGE_CONTAINER_NAME ??
    'json-data';
  private readonly blobPrefix = process.env.AZURE_BLOB_PREFIX ?? '';
  private readonly azureEnabled = this.azureConnectionString.trim().length > 0;
  private containerClient?: ContainerClient;
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private httpService: HttpService,
    private configService: ConfigService,
    private jsonDataService: JsonDataService,
    private actionsService: ActionsInterventionsService,
    private ppeService: PpePrivacyService,
    private documentationService: ClinicalDocumentationService,
    private communicationSvc: CommunicationService,
    private timelineTimingService: TimelineTimingService,
    private sequencingService: SequencingService,
    private lifecycleTelemetry: LifecycleTelemetryService,
  ) {
    if (this.azureEnabled) {
      const blobServiceClient = BlobServiceClient.fromConnectionString(this.azureConnectionString);
      this.containerClient = blobServiceClient.getContainerClient(this.blobContainerName);
    }
  }

  // Backward-compatible helpers (previously local-file based)
  readReports(): Report[] {
    return this.jsonDataService.getReports();
  }

  async getReportsFresh(): Promise<Report[]> {
    return this.jsonDataService.getReportsFresh();
  }

  private async writeReports(reports: Report[]): Promise<void> {
    // Always refresh before overwriting to avoid clobbering existing reports
    // in multi-instance deployments.
    const current = await this.jsonDataService.getReportsFresh();
    const byId = new Map<string, Report>(current.map((r) => [r.id, r]));
    reports.forEach((r) => byId.set(r.id, r));
    this.jsonDataService.setReports(Array.from(byId.values()));
    await this.jsonDataService.flushJson('reports.json');
  }

  // Blob name helper for non-JSON payloads (email fallback HTML)
  private getBlobName(relativeName: string): string {
    const prefix = this.blobPrefix.trim().replace(/^\/+|\/+$/g, '');
    return prefix ? `${prefix}/${relativeName}` : relativeName;
  }

  async generate(transcriptId: string, userId: string): Promise<Report> {
    // Find the transcript with retries (helps with latency between save and report generation)
    let transcript: Transcript | undefined;
    const maxRetries = TRANSCRIPT_FETCH_MAX_RETRIES;
    const delayMs = TRANSCRIPT_FETCH_RETRY_DELAY_MS;

    for (let i = 0; i < maxRetries; i++) {
      transcript = await this.jsonDataService.getTranscriptByIdFresh(transcriptId);
      if (transcript) {
        break;
      }

      if (i < maxRetries - 1) {
        this.logger.warn(
          `[ReportsService] Transcript ${transcriptId} not found, retrying (${i + 1}/${maxRetries})...`,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    if (!transcript || (transcript.userId && transcript.userId !== userId)) {
      throw new NotFoundException(`Transcript with ID ${transcriptId} not found`);
    }

    // Check if report already exists
    const existingReport = this.jsonDataService.getReportByTranscriptId(transcriptId);
    if (existingReport) {
      return existingReport;
    }

    // Get scenario and unit info
    const scenario = this.jsonDataService.getScenarioById(transcript.scenarioId);
    /* const unit = scenario
      ? this.jsonDataService.getUnitById(scenario.unitId)
      : null; */

    // Get user actions for this scenario
    // const actions = this.jsonDataService.getActionsByUserId(userId, transcript.scenarioId);

    // Build dynamic assessment based on transcript, scenario, and actions
    const staticAssessment = this.buildDynamicAssessment({
      messages: transcript.messages,
      scenario: scenario,
      expectedActions: scenario?.expectedActions,
      // actions: actions,
    });

    const createdAt = transcript.endedAt ?? transcript.startedAt ?? new Date().toISOString();

    const report = {
      id: this.jsonDataService.generateId(),
      userId,
      scenarioId: transcript.scenarioId,
      transcriptId,
      score: staticAssessment.score,
      scoreJson: staticAssessment.scoreJson,
      summary: staticAssessment.summary,
      strengths: staticAssessment.strengths,
      improvements: staticAssessment.improvements,
      feedback: staticAssessment.feedback,
      createdAt,
    };

    await this.jsonDataService.addReportFresh(report);
    return report;
  }

  async generateMockAssessment(transcriptId: string, userId: string, scenarioId: string) {
    // Create mock assessment with 18-component grading
    const report = {
      id: this.jsonDataService.generateId(),
      userId,
      scenarioId,
      transcriptId,
      score: 85,
      scoreJson: {
        communication: 4,
        clinicalJudgment: 4,
        technicalAccuracy: 4,
        ethicalCompetence: 5,
        reflection: 4,
        overallScore: 85,
      },
      summary:
        'Student demonstrated strong communication skills and followed appropriate assessment protocols. Good attention to patient comfort and safety throughout the scenario.',
      strengths: [
        'Clear and professional communication with patient',
        'Systematic approach to assessment',
        'Proper hand hygiene and infection control',
        'Accurate documentation of findings',
      ],
      improvements: [
        'Include more follow-up questions about symptoms',
        'Check vital signs more thoroughly',
        'Explain procedures to patient before performing',
      ],
      feedback:
        'Student demonstrated good communication skills and followed appropriate assessment protocols. Strong ethical awareness and professional conduct. Continue to focus on thorough clinical reasoning and technical accuracy.',
      createdAt: new Date().toISOString(),
    };

    await this.jsonDataService.addReportFresh(report);
    return report;
  }

  async findAll(userId?: string): Promise<Report[]> {
    const reports = await this.getReportsFresh();
    if (userId) {
      return reports.filter((r) => r.userId === userId);
    }
    return reports;
  }

  async findOne(id: string, userId?: string) {
    const report = await this.jsonDataService.getReportByIdFresh(id);

    if (!report) {
      throw new NotFoundException(`Report with ID ${id} not found`);
    }

    const transcript = this.jsonDataService.getTranscriptById(report.transcriptId);
    const ownerId = transcript?.userId ?? report.userId;

    // Check ownership if userId provided
    if (userId && ownerId && ownerId !== userId) {
      throw new NotFoundException(`Report with ID ${id} not found`);
    }

    const scenario = this.jsonDataService.getScenarioById(report.scenarioId);

    return {
      ...report,
      _transcript: {
        ...transcript,
        scenario,
      },
    };
  }

  async findByTranscriptId(transcriptId: string, userId: string) {
    const report = await this.jsonDataService.getReportByTranscriptIdFresh(transcriptId);

    if (!report) {
      throw new NotFoundException(`Report for transcript ${transcriptId} not found`);
    }

    const transcript = this.jsonDataService.getTranscriptById(transcriptId);
    const ownerId = transcript?.userId ?? report.userId;

    if (ownerId && ownerId !== userId) {
      throw new NotFoundException(`Report for transcript ${transcriptId} not found`);
    }

    const scenario = this.jsonDataService.getScenarioById(report.scenarioId);

    return {
      ...report,
      _transcript: {
        ...transcript,
        scenario,
      },
    };
  }

  async sendReportEmail(options: SendReportEmailOptions) {
    const reportRaw = await this.findOne(options.reportId);
    const report = reportRaw as unknown as FullReport;
    const scenario =
      (reportRaw._transcript?.scenario as { title?: string } | undefined) ??
      this.jsonDataService.getScenarioById(reportRaw.scenarioId);

    const recipient =
      options.recipient ??
      this.configService.get<string>('REPORT_EMAIL_TO') ??
      'timm.boettcher@rwthrive.com';

    if (!recipient) {
      throw new Error('No recipient email configured');
    }

    const user = this.configService.get<string>('EMAIL_USER');
    const pass = this.configService.get<string>('EMAIL_PASS');
    const host = this.configService.get<string>('EMAIL_HOST') ?? 'smtp.gmail.com';
    const port = Number(this.configService.get<string>('EMAIL_PORT') ?? DEFAULT_SMTP_PORT);
    const from = this.configService.get<string>('EMAIL_FROM') ?? user ?? 'reports@realityworks.ai';

    const studentName = options.studentName ?? report.studentName;
    const studentClass = options.studentClass ?? report.studentClass;
    const studentKey = options.key ?? report.key;

    const ca = report.communicationAssessment;
    const rubrics = (
      ca as typeof ca & {
        rubrics?: {
          items?: Record<string, EmailRubricItem>;
          overallSummary?: string;
          strengths?: string[];
          improvements?: string[];
          feedback?: string;
        };
      }
    )?.rubrics;
    const hasRubrics = !!rubrics?.items && Object.keys(rubrics.items ?? {}).length > 0;

    const executiveSummaryText = rubrics?.overallSummary ?? reportRaw.summary ?? '';
    const keyStrengths = rubrics?.strengths ?? reportRaw.strengths ?? [];
    const areasForImprovement = rubrics?.improvements ?? reportRaw.improvements ?? [];
    const _detailedFeedbackText = rubrics?.feedback ?? reportRaw.feedback ?? '';
    const debriefReflectionText = report.debriefReflection ?? '';

    const scenarioStartTimeText = report.scenarioStartTime
      ? new Date(report.scenarioStartTime).toLocaleString()
      : '';
    const scenarioEndTimeText = report.scenarioEndTime
      ? new Date(report.scenarioEndTime).toLocaleString()
      : '';

    const buildEmailContent = () => {
      const htmlParts = [
        `<div style="font-family: Arial, Helvetica, sans-serif; max-width: 800px; margin: 0 auto; padding: 24px; color: #333333; line-height: 1.6;">`,
        /* Header */
        `<h1 style="color: #1f4e79; border-bottom: 2px solid #d9e2ec; padding-bottom: 10px; margin-bottom: 20px;">
          Assessment Report
        </h1>`,
        `<p style="margin-bottom: 20px;">
          ${options.message ?? 'Please find the assessment summary below for your review.'}
        </p>`,
        /* Student Information */
        `<div style="background-color: #f5f7fa; padding: 16px; border-radius: 6px; margin-bottom: 24px;">
          <h3 style="margin-top: 0; color: #1f4e79;">Student Information</h3>
          ${studentName ? `<p><strong>Student Name:</strong> ${studentName}</p>` : ''}
          ${studentClass ? `<p><strong>Class:</strong> ${studentClass}</p>` : ''}
          ${studentKey ? `<p><strong>Key:</strong> ${studentKey}</p>` : ''}
          <p><strong>Scenario:</strong> ${scenario?.title ?? 'Simulation Scenario'}</p>
          ${scenarioStartTimeText ? `<p><strong>Simulation Started:</strong> ${scenarioStartTimeText}</p>` : ''}
          ${scenarioEndTimeText ? `<p><strong>Simulation Submitted:</strong> ${scenarioEndTimeText}</p>` : ''}
          <p><strong>Report Generated:</strong> ${new Date(report.createdAt).toLocaleString()}</p>
          <p><strong>Report ID:</strong> ${options.reportId}</p>
        </div>`,

        /* Overall Score */
        `<div style="text-align: center; padding: 20px; border: 1px solid #d9e2ec; border-radius: 8px; margin-bottom: 30px;">
          <h2 style="font-size: 42px; margin: 0; color: #1f4e79;">${report.score}%</h2>
          <p style="margin: 6px 0 0; font-size: 16px; color: #555555;">
            Overall Performance Score
          </p>
        </div>`,
        /* Executive Summary */
        executiveSummaryText
          ? `
        <div style="margin-bottom: 24px;">
          <h3 style="color: #1f4e79;">Executive Summary</h3>
          <div style="background-color: #f5f7fa; padding: 16px; border-left: 4px solid #1f4e79;">
            <p style="margin: 0;">${executiveSummaryText}</p>
          </div>
        </div>`
          : '',
        /* Debrief Reflection */
        debriefReflectionText
          ? `
        <div style="margin-bottom: 24px; background-color: #ffffff; padding: 16px; border-radius: 6px; border: 1px solid #d9e2ec;">
          <h3 style="color: #1f4e79; margin-top: 0;">Debrief Reflection</h3>
          <p style="margin: 0 0 12px 0; color: #666666; font-size: 14px;">
            This reflection does not affect your score.
          </p>
          <div style="background-color: #f5f7fa; padding: 16px; border-radius: 6px;">
            <p style="white-space: pre-line; margin: 0;">${debriefReflectionText}</p>
          </div>
        </div>`
          : '',
        /* Communication Assessment */
        report.communicationAssessment
          ? `
        <div style="margin-bottom: 24px;">
          <h3 style="color: #1f4e79;">Communication Assessment</h3>
          ${
            hasRubrics
              ? `
          <div style="background-color: #f5f7fa; padding: 16px; border-radius: 6px;">
            <h4 style="margin-top: 0; color: #1f4e79;">Rubrics Breakdown</h4>
            ${(() => {
              const itemsArray: EmailRubricItem[] = rubrics?.items
                ? Object.values(rubrics.items)
                : [];

              // Preserve first-seen ordering per subCategory
              const grouped = new Map<string, typeof itemsArray>();
              for (const it of itemsArray) {
                const key = it?.subCategory ?? 'Other';
                if (!grouped.has(key)) {
                  grouped.set(key, []);
                }
                const group = grouped.get(key);
                if (group) {
                  group.push(it);
                }
              }

              const getPerformanceLabel = (score?: number) => {
                if (score === undefined || score === null) {
                  return { text: 'N/A', color: '#666666' };
                }
                if (score > SCORE_EXCEPTIONAL_MIN) {
                  return { text: 'Exceptional', color: '#0066cc' };
                }
                if (score >= SCORE_MEETS_EXPECTATIONS_MIN) {
                  return { text: 'Meets Expectations', color: '#00a651' };
                }
                return { text: 'Needs Improvement', color: '#d63031' };
              };

              const renderStrengthWeakness = (
                items: Array<{ point?: string; example?: string } | string> = [],
                showExamples: boolean = true,
              ) => {
                if (!Array.isArray(items) || items.length === 0) {
                  return '<p style="color:#666; margin: 0;">No items identified.</p>';
                }
                return `
                    <ul style="margin: 0 0 0 18px;">
                      ${items
                        .map((x) => {
                          const point = typeof x === 'string' ? x : (x.point ?? '');
                          const example = typeof x === 'string' ? '' : (x.example ?? '');
                          return `
                        <li style="margin-bottom: 6px;">
                          <strong>${point}</strong>${showExamples && example ? `: "${example}"` : ''}
                        </li>`;
                        })
                        .join('')}
                    </ul>
                  `;
              };

              const renderRecommendations = (items: string[] = []) => {
                if (!Array.isArray(items) || items.length === 0) {
                  return '';
                }
                return `
                    <ul style="margin: 0 0 0 18px;">
                      ${items.map((r) => `<li style="margin-bottom: 6px;">${r}</li>`).join('')}
                    </ul>
                  `;
              };

              const distSummary =
                'During this simulation, one or more actions were performed that are classified as inappropriate or distractor actions within the context of this scenario. These actions were not aligned with the expected clinical pathway or the defined scenario objectives. Although identified as inappropriate, these actions do not impact the overall score or grading for this simulation. This section is provided solely for learning and professional development purposes and is intended to support performance improvement.';

              const improvementRecommendations = [
                'Avoid initiating interventions without confirmed clinical need.',
                "Refrain from performing tasks that are not aligned with the scenario's primary priorities.",
                'Ensure patient data is reassessed thoroughly before taking action.',
                'Maintain focus on primary objectives before addressing secondary or unrelated tasks.',
                'Pause and verify clinical reasoning when uncertainty arises.',
              ];

              const disclaimerText =
                'This section is intended for educational feedback only. The inappropriate actions identified here do not impact your score for this simulation. They are highlighted to support reflection, strengthen clinical reasoning, and promote safe practice in future patient encounters.';

              let out = '';

              for (const [subCategory, items] of grouped.entries()) {
                out += `
                    <div style="margin-bottom: 18px;">
                      <h4 style="color: #1f4e79; margin: 0 0 10px 0;">${subCategory}</h4>
                      ${items
                        .map((item) => {
                          const score = item?.score;
                          const strengths = item?.strengths ?? [];
                          const weaknesses = item?.weaknesses ?? [];
                          const recommendations = item?.recommendations ?? [];

                          const distractors =
                            Array.isArray(item?.actionDetails) &&
                            item.actionDetails.filter((d) => d?.type === 'distractor');

                          const subCat = (item?.subCategory ?? '').toLowerCase();
                          const showDistractors =
                            (subCat === 'action' || subCat === 'action / clinical interventions') &&
                            distractors &&
                            distractors.length > 0;

                          return `
                            <div style="margin-bottom: 15px; padding: 12px; border: 1px solid #d9e2ec; border-radius: 6px; background-color: #ffffff;">
                              <h5 style="margin: 0 0 6px 0; color:#1f4e79;">${
                                item?.name ?? 'Rubric Item'
                              }</h5>
                              ${
                                item?.summary
                                  ? `<p style="margin: 0 0 10px 0; color:#333;">${item.summary}</p>`
                                  : ''
                              }
                              <p style="margin: 0 0 10px 0; font-size: 13px; color:#555;">
                                <strong>Score:</strong> ${score ?? '—'}% — ${getPerformanceLabel(score).text}
                              </p>

                              <p style="margin: 0 0 6px 0; color: #0d7377; font-weight: bold; font-size: 13px;">
                                Strengths
                              </p>
                              ${renderStrengthWeakness(strengths, false)}

                              <div style="height: 10px;"></div>

                              <p style="margin: 0 0 6px 0; color: #d63031; font-weight: bold; font-size: 13px;">
                                Weaknesses
                              </p>
                              ${renderStrengthWeakness(weaknesses, true)}

                              ${
                                Array.isArray(recommendations) && recommendations.length > 0
                                  ? `
                                <div style="height: 10px;"></div>
                                <p style="margin: 0 0 6px 0; color: #0984e3; font-weight: bold; font-size: 13px;">
                                  Improvement Recommendations
                                </p>
                                ${renderRecommendations(recommendations)}
                              `
                                  : ''
                              }

                              ${
                                showDistractors
                                  ? `
                                <div style="height: 14px;"></div>
                                <h5 style="margin: 0 0 8px 0;">Inappropriate Actions</h5>
                                <p style="margin: 0 0 10px 0; color:#444; line-height: 1.6;">${distSummary}</p>
                                <p style="margin: 0 0 8px 0; color:#444;">Inappropriate actions may reflect:</p>
                                <ul style="margin: 0 0 12px 18px;">
                                  ${distractors
                                    .map(
                                      (d) =>
                                        `<li style="margin-bottom: 6px;">� ${d?.title ?? ''}</li>`,
                                    )
                                    .join('')}
                                </ul>
                                <div style="padding: 12px; border-radius: 6px; border: 1px solid #d9e2ec; background-color: #f0f7ff;">
                                  <p style="margin: 0 0 10px 0; font-weight: bold;">Improvement Recommendations</p>
                                  <ul style="margin: 0 0 12px 18px;">
                                    ${improvementRecommendations
                                      .map((r) => `<li style="margin-bottom: 6px;">${r}</li>`)
                                      .join('')}
                                  </ul>
                                  <p style="margin: 0; color:#666; font-size: 12px;">This report is made available for administrative review through the admin side of the application.</p>
                                </div>
                                <div style="padding: 12px; border-radius: 6px; border: 1px solid #f6d9e0; background-color: #fff1f4; margin-top: 12px;">
                                  <p style="margin: 0 0 8px 0; font-weight: bold;">Disclaimer:</p>
                                  <p style="margin: 0; color:#a00; font-size: 13px; line-height: 1.6;">${disclaimerText}</p>
                                </div>
                              `
                                  : ''
                              }
                            </div>
                          `;
                        })
                        .join('')}
                    </div>
                  `;
              }

              return out;
            })()}
          </div>`
              : `
          ${
            ca?.technicalSkills
              ? `
          <h4>Technical Skills Assessment</h4>
          <div style="background-color: #f5f7fa; padding: 16px; border-radius: 6px;">
            <p><strong>Total Score:</strong> ${ca.technicalSkills?.totalScore ?? 0}/${ca.technicalSkills?.totalWeight ?? 0}</p>
            ${(() => {
              const technicalSkillsRaw: EmailRubricItem[] = Object.values(
                ca.technicalSkills?.items ?? {},
              );
              const technicalSkillItemsMap = new Map<string, EmailRubricItem>();
              technicalSkillsRaw.forEach((item) => {
                const key = (item.subCategory ??
                  item.name ??
                  item.aiCheckId ??
                  item.id ??
                  '') as string;
                if (technicalSkillItemsMap.has(key)) {
                  const existing = technicalSkillItemsMap.get(key);
                  if (
                    !existing ||
                    (item.score ?? 0) > (existing.score ?? 0) ||
                    ((item.score ?? 0) === (existing.score ?? 0) &&
                      item.summary &&
                      !existing.summary)
                  ) {
                    technicalSkillItemsMap.set(key, item);
                  }
                } else {
                  technicalSkillItemsMap.set(key, item);
                }
              });

              return Array.from(technicalSkillItemsMap.values())
                .map((item) => {
                  const score = item?.score ?? 0;
                  const maxScore = item?.maxScore ?? 10;
                  const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0;
                  const performanceData =
                    percentage > SCORE_EXCEPTIONAL_MIN
                      ? { text: 'Exceptional', color: '#0066cc' }
                      : percentage >= SCORE_MEETS_EXPECTATIONS_MIN
                        ? { text: 'Meets Expectations', color: '#00a651' }
                        : { text: 'Needs Improvement', color: '#d63031' };
                  const strengths = Array.isArray(item?.strengths) ? item.strengths : [];
                  const weaknesses = Array.isArray(item?.weaknesses) ? item.weaknesses : [];
                  const recommendations = Array.isArray(item?.recommendations)
                    ? item.recommendations
                    : [];

                  return `
                    <div style="margin-bottom: 15px; padding: 10px; border-left: 3px solid #1f4e79;">
                      <h5 style="margin: 0 0 6px 0; color:#1f4e79;">
                        ${item?.name ?? 'Technical skill'}
                      </h5>
                      <p style="margin: 0 0 10px 0; font-size: 14px;">
                        <strong style="color: ${performanceData.color};">${performanceData.text}</strong>
                      </p>
                      ${item.summary ? `<p style="margin: 0 0 10px 0;">${item.summary}</p>` : ''}
                      ${
                        strengths.length > 0
                          ? `
                        <p style="margin: 0 0 6px 0; color:#0d7377; font-weight: bold; font-size: 13px;">Strengths</p>
                        <ul style="margin: 0 0 10px 18px;">
                          ${strengths
                            .map((x) => {
                              const pt = typeof x === 'string' ? x : (x?.point ?? '');
                              const ex =
                                typeof x === 'string' ? '' : x?.example ? `: "${x.example}"` : '';
                              return `<li style="margin-bottom: 6px;"><strong>${pt}</strong>${ex}</li>`;
                            })
                            .join('')}
                        </ul>`
                          : ''
                      }
                      ${
                        weaknesses.length > 0
                          ? `
                        <p style="margin: 0 0 6px 0; color:#d63031; font-weight: bold; font-size: 13px;">Weaknesses</p>
                        <ul style="margin: 0 0 10px 18px;">
                          ${weaknesses
                            .map((x) => {
                              const pt = typeof x === 'string' ? x : (x?.point ?? '');
                              const ex =
                                typeof x === 'string' ? '' : x?.example ? `: "${x.example}"` : '';
                              return `<li style="margin-bottom: 6px;"><strong>${pt}</strong>${ex}</li>`;
                            })
                            .join('')}
                        </ul>`
                          : ''
                      }
                      ${
                        recommendations.length > 0
                          ? `
                        <p style="margin: 0 0 6px 0; color:#0984e3; font-weight: bold; font-size: 13px;">Improvement Recommendations</p>
                        <ul style="margin: 0 0 0 18px;">
                          ${recommendations
                            .map((r) => `<li style="margin-bottom: 6px;">${r}</li>`)
                            .join('')}
                        </ul>`
                          : ''
                      }
                    </div>
                  `;
                })
                .join('');
            })()}
          </div>`
              : ''
          }
          ${
            ca?.softSkills
              ? `
          <h4>Soft Skills Assessment</h4>
          <div style="background-color: #f5f7fa; padding: 16px; border-radius: 6px; margin-bottom: 16px;">
            <p><strong>Total Score:</strong> ${ca.softSkills?.totalScore ?? 0}/${ca.softSkills?.totalWeight ?? 0}</p>
            ${Object.values(ca.softSkills?.items ?? {})
              .map((item) => {
                const score = item?.score ?? 0;
                const maxScore = item?.maxScore ?? 10;
                const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0;
                const performanceData =
                  percentage > SCORE_EXCEPTIONAL_MIN
                    ? { text: 'Exceptional', color: '#0066cc' }
                    : percentage >= SCORE_MEETS_EXPECTATIONS_MIN
                      ? { text: 'Meets Expectations', color: '#00a651' }
                      : { text: 'Needs Improvement', color: '#d63031' };
                const strengths: Array<{ point?: string; example?: string } | string> =
                  Array.isArray(item?.strengths) ? item.strengths : [];
                const weaknesses: Array<{ point?: string; example?: string } | string> =
                  Array.isArray(item?.weaknesses) ? item.weaknesses : [];
                const recommendations: string[] = Array.isArray(item?.recommendations)
                  ? item.recommendations
                  : [];

                return `
                  <div style="margin-bottom: 15px; padding: 10px; border-left: 3px solid #1f4e79;">
                    <h5 style="margin: 0 0 6px 0; color:#1f4e79;">
                      ${item?.name ?? 'Soft skill'}
                    </h5>
                    <p style="margin: 0 0 10px 0; font-size: 14px;">
                      <strong style="color: ${performanceData.color};">${performanceData.text}</strong>
                    </p>
                    ${item?.summary ? `<p style="margin: 0 0 10px 0;">${item.summary}</p>` : ''}
                    ${
                      strengths.length > 0
                        ? `
                      <p style="margin: 0 0 6px 0; color:#0d7377; font-weight: bold; font-size: 13px;">Strengths</p>
                      <ul style="margin: 0 0 10px 18px;">
                        ${strengths
                          .map((x) => {
                            const pt = typeof x === 'string' ? x : (x?.point ?? '');
                            const ex =
                              typeof x === 'string' ? '' : x?.example ? `: "${x.example}"` : '';
                            return `<li style="margin-bottom: 6px;"><strong>${pt}</strong>${ex}</li>`;
                          })
                          .join('')}
                      </ul>`
                        : ''
                    }
                    ${
                      weaknesses.length > 0
                        ? `
                      <p style="margin: 0 0 6px 0; color:#d63031; font-weight: bold; font-size: 13px;">Weaknesses</p>
                      <ul style="margin: 0 0 10px 18px;">
                        ${weaknesses
                          .map((x) => {
                            const pt = typeof x === 'string' ? x : (x?.point ?? '');
                            const ex =
                              typeof x === 'string' ? '' : x?.example ? `: "${x.example}"` : '';
                            return `<li style="margin-bottom: 6px;"><strong>${pt}</strong>${ex}</li>`;
                          })
                          .join('')}
                      </ul>`
                        : ''
                    }
                    ${
                      recommendations.length > 0
                        ? `
                      <p style="margin: 0 0 6px 0; color:#0984e3; font-weight: bold; font-size: 13px;">Improvement Recommendations</p>
                      <ul style="margin: 0 0 0 18px;">
                        ${recommendations
                          .map((r) => `<li style="margin-bottom: 6px;">${r}</li>`)
                          .join('')}
                      </ul>`
                        : ''
                    }
                  </div>
                `;
              })
              .join('')}
          </div>`
              : ''
          }
        `
          }
        </div>`
          : '',
        /* Technical Skills Overview */
        !hasRubrics && ca?.technicalSkills
          ? `
        <div style="margin-bottom: 24px;">
          <h3 style="color: #1f4e79;">Technical Skills Overview</h3>
          <div style="background-color: #f5f7fa; padding: 16px; border-radius: 6px; margin-bottom: 16px;">
            <p><strong>Total Score:</strong> ${ca.technicalSkills?.totalScore ?? 0}/${ca.technicalSkills?.totalWeight ?? 0}</p>
            ${
              ca.technicalSkills?.overallstrengths?.length
                ? `
              <h4 style="color: #0d7377; margin: 15px 0 10px 0;">Strengths:</h4>
              <ul style="margin: 0 0 15px 20px;">
                ${ca.technicalSkills.overallstrengths
                  .map((s) => {
                    const pt = typeof s === 'string' ? s : (s?.point ?? '');
                    const ex = typeof s === 'string' ? '' : s?.example ? `: "${s.example}"` : '';
                    return `<li style="margin-bottom: 5px;"><strong>${pt}</strong>${ex}</li>`;
                  })
                  .join('')}
              </ul>`
                : ''
            }
            ${
              ca.technicalSkills?.overallweaknesses?.length
                ? `
              <h4 style="color: #d63031; margin: 15px 0 10px 0;">Weaknesses:</h4>
              <ul style="margin: 0 0 15px 20px;">
                ${ca.technicalSkills.overallweaknesses
                  .map((w) => {
                    const pt = typeof w === 'string' ? w : (w?.point ?? '');
                    const ex = typeof w === 'string' ? '' : w?.example ? `: "${w.example}"` : '';
                    return `<li style="margin-bottom: 5px;"><strong>${pt}</strong>${ex}</li>`;
                  })
                  .join('')}
              </ul>`
                : ''
            }
          </div>
        </div>`
          : '',

        /* Soft Skills Overview */
        !hasRubrics && ca?.softSkills
          ? `
        <div style="margin-bottom: 24px;">
          <h3 style="color: #1f4e79;">Soft Skills Overview</h3>
          <div style="background-color: #f5f7fa; padding: 16px; border-radius: 6px; margin-bottom: 16px;">
            <p><strong>Total Score:</strong> ${ca.softSkills?.totalScore ?? 0}/${ca.softSkills?.totalWeight ?? 0}</p>
            ${
              ca.softSkills?.overallstrengths?.length
                ? `
              <h4 style="color: #0d7377; margin: 15px 0 10px 0;">Strengths:</h4>
              <ul style="margin: 0 0 15px 20px;">
                ${ca.softSkills.overallstrengths
                  .map((s) => {
                    const pt = typeof s === 'string' ? s : (s?.point ?? '');
                    const ex = typeof s === 'string' ? '' : s?.example ? `: "${s.example}"` : '';
                    return `<li style="margin-bottom: 5px;"><strong>${pt}</strong>${ex}</li>`;
                  })
                  .join('')}
              </ul>`
                : ''
            }
            ${
              ca.softSkills?.overallweaknesses?.length
                ? `
              <h4 style="color: #d63031; margin: 15px 0 10px 0;">Weaknesses:</h4>
              <ul style="margin: 0 0 15px 20px;">
                ${ca.softSkills.overallweaknesses
                  .map((w) => {
                    const pt = typeof w === 'string' ? w : (w?.point ?? '');
                    const ex = typeof w === 'string' ? '' : w?.example ? `: "${w.example}"` : '';
                    return `<li style="margin-bottom: 5px;"><strong>${pt}</strong>${ex}</li>`;
                  })
                  .join('')}
              </ul>`
                : ''
            }
          </div>
        </div>`
          : '',
        /* Overall Communication Strengths / Weaknesses / Recommendations (non-rubrics UI) */
        !hasRubrics && (ca?.overall?.strengths?.length ?? 0) > 0
          ? `
        <div style="margin-bottom: 24px;">
          <h3 style="color: #0d7377;">Strengths</h3>
          <ul>
            ${(ca?.overall?.strengths ?? []).map((s) => `<li>${s}</li>`).join('')}
          </ul>
        </div>`
          : '',
        !hasRubrics && (ca?.overall?.weaknesses?.length ?? 0) > 0
          ? `
        <div style="margin-bottom: 24px;">
          <h3 style="color: #d63031;">Weaknesses</h3>
          <ul>
            ${(ca?.overall?.weaknesses ?? []).map((w) => `<li>${w}</li>`).join('')}
          </ul>
        </div>`
          : '',
        !hasRubrics && (ca?.overall?.recommendations?.length ?? 0) > 0
          ? `
        <div style="margin-bottom: 24px;">
          <h3 style="color: #0984e3;">Areas for Improvement</h3>
          <ul>
            ${(ca?.overall?.recommendations ?? []).map((r) => `<li>${r}</li>`).join('')}
          </ul>
        </div>`
          : '',
        /* Strengths & Improvements */
        `<div style="margin-bottom: 24px;">
          ${
            keyStrengths?.length
              ? `
            <h3 style="color: #1f4e79;">Key Strengths</h3>
            <ul>
              ${keyStrengths.map((s: string) => `<li>${s}</li>`).join('')}
            </ul>`
              : ''
          }
    
          ${
            areasForImprovement?.length
              ? `
            <h3 style="color: #1f4e79;">Areas for Improvement</h3>
            <ul>
              ${areasForImprovement.map((i: string) => `<li>${i}</li>`).join('')}
            </ul>`
              : ''
          }
        </div>`,
        /* Session Details */
        // (report as any).summaryByCategory ? `
        // <div style="margin-bottom: 24px;">
        //   <h3 style="color: #1f4e79;">Session Details</h3>
        //   <div style="background-color: #f8f9fa; padding: 15px; border-radius: 6px;">
        //     ${Object.entries((report as any).summaryByCategory).map(([category, entries]: [string, any]) => `
        //       <h4>${category.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())} (${Array.isArray(entries) ? entries.length : 0} entries):</h4>
        //       ${Array.isArray(entries) && entries.length > 0 ? `
        //         <ul>
        //           ${entries.map((entry: any) => `<li><strong>${entry.title || entry.name || 'Entry'}:</strong> ${entry.details || entry.value || 'No details'}</li>`).join('')}
        //         </ul>
        //       ` : '<p>No entries recorded</p>'}
        //     `).join('')}
        //   </div>
        // </div>` : "",
        /* Footer */
        `<div style="margin-top: 30px; padding-top: 16px; border-top: 1px solid #d9e2ec; text-align: center; color: #666666;">
          <p style="margin: 0;">
            Please log in to the RealityWorks AI dashboard to view the full interactive report.
          </p>
        </div>`,

        `</div>`,
      ];

      return htmlParts.filter(Boolean).join('');
    };

    const mailPayload = {
      from,
      to: recipient,
      subject: `Assessment Report - ${scenario?.title ?? report.scenarioId}`,
      text: [
        options.message ?? 'Please find the latest assessment summary below.',
        studentName ? `Student Name: ${studentName}` : '',
        studentClass ? `Class: ${studentClass}` : '',
        studentKey ? `Key: ${studentKey}` : '',
        `Score: ${report.score}%`,
        `Scenario: ${scenario?.title ?? 'Simulation scenario'}`,
        scenarioStartTimeText ? `Simulation Started: ${scenarioStartTimeText}` : '',
        scenarioEndTimeText ? `Simulation Submitted: ${scenarioEndTimeText}` : '',
        `Generated: ${new Date(report.createdAt).toLocaleString()}`,
        `Report ID: ${options.reportId}`,
        executiveSummaryText ? `Summary: ${executiveSummaryText}` : '',
        keyStrengths?.length ? `Strengths: ${keyStrengths.join('; ')}` : '',
        areasForImprovement?.length
          ? `Areas for improvement: ${areasForImprovement.join('; ')}`
          : '',
        debriefReflectionText ? `Debrief reflection: ${debriefReflectionText}` : '',
      ]
        .filter(Boolean)
        .join('\n\n'),
      html: buildEmailContent(),
    };

    const smtpConfigured = Boolean(user && pass);
    const shouldFallbackToFile =
      !smtpConfigured || this.configService.get<string>('EMAIL_MODE') === 'file';

    if (smtpConfigured) {
      try {
        const transporter = nodemailer.createTransport({
          host,
          port,
          secure: port === 465,
          auth: {
            user,
            pass,
          },
        });

        await transporter.sendMail(mailPayload);

        return { success: true, message: `Report emailed to ${recipient}` };
      } catch (error) {
        console.error('[ReportsService] Failed to send report email via SMTP:', error);
        if (!shouldFallbackToFile) {
          throw new Error('Unable to deliver email via configured SMTP server');
        }
      }
    }

    // Fallback: store the email HTML in Blob Storage (no local fs writes)
    if (this.containerClient) {
      try {
        await this.containerClient.createIfNotExists();
        const blobName = this.getBlobName(
          `email-outbox/report-${options.reportId}-${Date.now()}.html`,
        );
        const blobClient = this.containerClient.getBlockBlobClient(blobName);
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Assessment Report</title></head><body>\n<!-- Email saved because SMTP delivery is unavailable -->\n${mailPayload.html}</body></html>`;
        await blobClient.uploadData(Buffer.from(html, 'utf-8'), {
          blobHTTPHeaders: { blobContentType: 'text/html; charset=utf-8' },
        });

        return {
          success: true,
          message: `SMTP not configured. Email saved to blob ${blobName}`,
        };
      } catch (error) {
        console.error('[ReportsService] Failed to save email fallback to blob:', error);
      }
    }

    return { success: true, message: 'SMTP not configured. Email not sent.' };
  }

  async evaluateCommunication(transcript: string, threshold?: number) {
    return this.communicationSvc.evaluateCommunication(transcript, threshold);
  }

  async evaluateQuestionResponse(
    responseText: string,
    concepts: Parameters<typeof this.communicationSvc.evaluateQuestionResponse>[1],
  ) {
    return this.communicationSvc.evaluateQuestionResponse(responseText, concepts);
  }

  async evaluateMedicationSite(
    expectedSite: string,
    actualSite: string,
  ): Promise<{
    match: boolean;
    confidence: number;
    explanation: string;
  }> {
    const exp = (expectedSite ?? '').trim();
    const act = (actualSite ?? '').trim();

    if (!exp || !act) {
      throw new BadRequestException('expectedSite and actualSite are required');
    }

    // Deterministic exact-site normalization first (e.g., Right Eye == OD).
    // If this returns an exact-equivalence match, keep it authoritative and
    // skip LLM variability.
    const deterministic = this.evaluateMedicationSiteHeuristic(exp, act);
    if (deterministic.match && deterministic.confidence >= 0.9) {
      return deterministic;
    }

    const openaiApiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!openaiApiKey) {
      return this.evaluateMedicationSiteHeuristic(exp, act);
    }

    const model = this.configService.get<string>('AI_MODEL', 'gpt-4.1');
    const prompt = `
You are evaluating whether a documented medication administration site is clinically equivalent to the expected site.

Expected site: "${exp}"
Documented site: "${act}"

Rules:
- Accept common abbreviations (RUQ, LLQ, RUE, LUE, etc.)
- Accept ophthalmic abbreviations and terms (OD=right eye, OS=left eye, OU=both eyes)
- Accept synonyms and anatomical equivalents
- Accept clinically valid wording variations and order changes
- Reject different anatomical regions (e.g., upper vs lower quadrant mismatch)
- Be strict about laterality mismatch unless the phrase clearly indicates bilateral equivalence

Return ONLY JSON with this schema:
{
  "match": true|false,
  "confidence": 0 to 1,
  "explanation": "brief clinical reasoning"
}`;

    try {
      const response = await firstValueFrom(
        this.httpService.post<OpenAIRawResponse>(
          'https://api.openai.com/v1/chat/completions',
          {
            model,
            messages: [
              {
                role: 'system',
                content:
                  'You are a nursing medication administration evaluator. Return valid JSON only.',
              },
              {
                role: 'user',
                content: prompt,
              },
            ],
            temperature: EXTRACTION_AI_TEMPERATURE,
            max_tokens: EXTRACTION_AI_MAX_TOKENS_SHORT,
            response_format: { type: 'json_object' },
          },
          {
            headers: {
              Authorization: `Bearer ${openaiApiKey}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      const content = response.data?.choices?.[0]?.message?.content;
      if (!content) {
        return this.evaluateMedicationSiteHeuristic(exp, act);
      }

      const parsed = JSON.parse(content) as {
        match?: boolean;
        confidence?: number;
        explanation?: string;
      };

      const confidenceNum =
        typeof parsed.confidence === 'number' && !Number.isNaN(parsed.confidence)
          ? Math.max(0, Math.min(1, parsed.confidence))
          : 0.5;

      return {
        match: Boolean(parsed.match),
        confidence: confidenceNum,
        explanation:
          typeof parsed.explanation === 'string' && parsed.explanation.trim().length > 0
            ? parsed.explanation.trim()
            : 'LLM evaluation completed.',
      };
    } catch (error) {
      this.logger.warn(
        `[SiteEvaluation] LLM evaluation failed; using heuristic fallback. ${String(error)}`,
      );
      return this.evaluateMedicationSiteHeuristic(exp, act);
    }
  }

  private evaluateMedicationSiteHeuristic(
    expectedSite: string,
    actualSite: string,
  ): {
    match: boolean;
    confidence: number;
    explanation: string;
  } {
    const normalize = (value: string): string =>
      value
        .toLowerCase()
        .replace(/[()]/g, ' ')
        .replace(/\bquadrant\b/g, 'quadrant')
        .replace(/\babdomen\b/g, 'abdominal')
        .replace(/\bright upper quadrant\b/g, 'ruq')
        .replace(/\bleft upper quadrant\b/g, 'luq')
        .replace(/\bright lower quadrant\b/g, 'rlq')
        .replace(/\bleft lower quadrant\b/g, 'llq')
        .replace(/\bupper right quadrant\b/g, 'ruq')
        .replace(/\blower right quadrant\b/g, 'rlq')
        .replace(/\bupper left quadrant\b/g, 'luq')
        .replace(/\blower left quadrant\b/g, 'llq')
        .replace(/\bright upper abdomen\b/g, 'ruq')
        .replace(/\bleft upper abdomen\b/g, 'luq')
        .replace(/\bright lower abdomen\b/g, 'rlq')
        .replace(/\bleft lower abdomen\b/g, 'llq')
        .replace(/\boculus dexter\b/g, 'od')
        .replace(/\boculus sinister\b/g, 'os')
        .replace(/\boculus uterque\b/g, 'ou')
        .replace(/\bboth eyes\b/g, 'ou')
        .replace(/\bbilateral eyes\b/g, 'ou')
        .replace(/\bright eye\b/g, 'od')
        .replace(/\bleft eye\b/g, 'os')
        .replace(/\bright ocular\b/g, 'od')
        .replace(/\bleft ocular\b/g, 'os')
        .replace(/\bboth ocular\b/g, 'ou')
        .replace(/\bbilateral ocular\b/g, 'ou')
        .replace(/\bright conjunctival sac\b/g, 'od')
        .replace(/\bleft conjunctival sac\b/g, 'os')
        .replace(/\bboth conjunctival sacs\b/g, 'ou')
        .replace(/\bconjunctival sac od\b/g, 'od')
        .replace(/\bconjunctival sac os\b/g, 'os')
        .replace(/\bconjunctival sac ou\b/g, 'ou')
        .replace(/\bposterior right upper extremity\b/g, 'posterior rue')
        .replace(/\bright upper arm\b/g, 'rue')
        .replace(/\bleft upper arm\b/g, 'lue')
        .replace(/\bright arm\b/g, 'rue')
        .replace(/\bleft arm\b/g, 'lue')
        .replace(/\bright upper extremity\b/g, 'rue')
        .replace(/\bleft upper extremity\b/g, 'lue')
        .replace(/\bod\b/g, 'od')
        .replace(/\bos\b/g, 'os')
        .replace(/\bou\b/g, 'ou')
        .replace(/\s+/g, ' ')
        .trim();

    const expNorm = normalize(expectedSite);
    const actNorm = normalize(actualSite);

    const exact = expNorm === actNorm;
    const tokenSubset =
      expNorm.split(' ').every((t) => actNorm.includes(t)) ||
      actNorm.split(' ').every((t) => expNorm.includes(t));

    if (exact) {
      return {
        match: true,
        confidence: 0.95,
        explanation: 'Expected and documented administration sites are equivalent.',
      };
    }

    if (tokenSubset) {
      return {
        match: true,
        confidence: 0.78,
        explanation:
          'Documented site is a clinically acceptable variant/abbreviation of the expected site.',
      };
    }

    return {
      match: false,
      confidence: 0.2,
      explanation: 'Documented site does not map to the expected anatomical site.',
    };
  }

  async evaluateMedicationRouteSite(
    expectedRoute: string,
    actualRoute: string,
    expectedSite: string,
    actualSite: string,
  ): Promise<{
    route: { match: boolean; confidence: number; explanation: string };
    site: { match: boolean; confidence: number; explanation: string };
  }> {
    const expRoute = (expectedRoute ?? '').trim();
    const actRoute = (actualRoute ?? '').trim();
    const expSite = (expectedSite ?? '').trim();
    const actSite = (actualSite ?? '').trim();

    const openaiApiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!openaiApiKey) {
      return {
        route: this.evaluateMedicationRouteHeuristic(expRoute, actRoute, actSite),
        site: this.evaluateMedicationSiteHeuristic(expSite, actSite),
      };
    }

    const model = this.configService.get<string>('AI_MODEL', 'gpt-4.1');
    const prompt = `
You are a nursing expert evaluating whether a documented medication administration is clinically correct.

Expected Route: "${expRoute}"
Documented Route: "${actRoute}"

Expected Site (optional, may be blank): "${expSite}"
Documented Site (anatomical location chosen by the student): "${actSite}"

ROUTE EVALUATION RULES � set route.match = true ONLY when BOTH conditions are satisfied:
  (A) The Documented Route is clinically equivalent to the Expected Route. Accept:
      - Common abbreviations (IV, IM, SQ/SC, PO, PR, TOP, INH, OPTIC, OTIC, SL, etc.)
      - Synonyms (intravenous = IV, intramuscular = IM, by mouth = PO, etc.)
      - Valid wording / anatomical variations of the SAME route
      - Reject entirely different routes.
  (B) The Documented Site is anatomically COMPATIBLE with the Documented Route.
      A site is INCOMPATIBLE when it could not physically/clinically be used for that route.
      Examples of INCOMPATIBLE combinations (must fail):
        - Route = Intravenous (IV) with Site = "By Mouth" / "Oral" / "Sublingual" / "Rectum" / "Inhalation" / "Topical skin" / "Eye" / "Ear"
        - Route = Oral (PO) with Site = "Hand vein" / "Deltoid muscle" / "Gluteal" / "Eye" / "Ear"
        - Route = Intramuscular (IM) with Site = "By Mouth" / "Hand vein" / "Eye drops"
        - Route = Subcutaneous (SQ) with Site = "By Mouth" / "Rectum" / "Eye"
        - Route = Ophthalmic / Eye drops with Site = "Hand vein" / "Deltoid" / "By Mouth"
        - Route = Otic / Ear with Site = "Hand vein" / "Deltoid" / "By Mouth" / "Eye"
        - Route = Rectal (PR) with Site = "By Mouth" / "Hand vein" / "Deltoid"
        - Route = Inhalation with Site = "Hand vein" / "Deltoid" / "Rectum"
        - Route = Topical with Site = "Hand vein" / "By Mouth" / "Rectum"
      Examples of COMPATIBLE combinations (acceptable):
        - IV with Site = "Hand (Dorsal Metacarpal Veins)", "Antecubital", "Forearm vein", "Central line", "PICC", any peripheral or central venous site
        - IM with Site = "Deltoid", "Vastus lateralis", "Ventrogluteal", "Dorsogluteal"
        - SQ with Site = "Abdomen", "Upper arm", "Thigh"
        - PO with Site = "By Mouth", "Oral", "" (blank), "Sublingual" (if route is SL/PO)
        - Ophthalmic with Site = "OD", "OS", "OU", "right eye", "left eye"
        - Otic with Site = "right ear", "left ear", "AD", "AS"
      If Documented Site is blank/empty and the route does not require a specific site distinction (e.g., PO, IV with unspecified vein), treat compatibility as satisfied.
      If Documented Site is blank but the route REQUIRES site specification (e.g., IM, SQ, ophthalmic, otic) � do not fail solely on blank site; only fail when the documented site actively contradicts the route.

When route.match = false because of an incompatible site, explanation MUST clearly state the site is incompatible with the route (e.g., "Documented site 'By Mouth' is not anatomically valid for an Intravenous route.").

SITE EVALUATION RULES (this is a separate informational signal � the caller may ignore it):
- match = true if Documented Site is clinically equivalent to Expected Site (synonyms / abbreviations / anatomical equivalents) OR if Expected Site is blank.
- Otherwise match = false.

Return ONLY JSON with this schema:
{
  "route": {
    "match": true|false,
    "confidence": 0 to 1,
    "explanation": "brief clinical reasoning (mention site incompatibility if that caused the failure)"
  },
  "site": {
    "match": true|false,
    "confidence": 0 to 1,
    "explanation": "brief clinical reasoning"
  }
}`;

    try {
      const response = await firstValueFrom(
        this.httpService.post<OpenAIRawResponse>(
          'https://api.openai.com/v1/chat/completions',
          {
            model,
            messages: [
              {
                role: 'system',
                content:
                  'You are a nursing medication administration evaluator. Return valid JSON only.',
              },
              {
                role: 'user',
                content: prompt,
              },
            ],
            temperature: EXTRACTION_AI_TEMPERATURE,
            max_tokens: EXTRACTION_AI_MAX_TOKENS_MEDIUM,
            response_format: { type: 'json_object' },
          },
          {
            headers: {
              Authorization: `Bearer ${openaiApiKey}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      const content = response.data?.choices?.[0]?.message?.content;
      if (!content) {
        return {
          route: this.evaluateMedicationRouteHeuristic(expRoute, actRoute, actSite),
          site: this.evaluateMedicationSiteHeuristic(expSite, actSite),
        };
      }

      const parsed = JSON.parse(content) as {
        route?: { match?: boolean; confidence?: number; explanation?: string };
        site?: { match?: boolean; confidence?: number; explanation?: string };
      };

      const parseResult = (
        result: { match?: boolean; confidence?: number; explanation?: string } | undefined,
        fallback: {
          match: boolean;
          confidence: number;
          explanation: string;
        },
      ) => ({
        match: Boolean(result?.match ?? fallback.match),
        confidence:
          typeof result?.confidence === 'number' && !Number.isNaN(result.confidence)
            ? Math.max(0, Math.min(1, result.confidence))
            : fallback.confidence,
        explanation:
          typeof result?.explanation === 'string' && result.explanation.trim().length > 0
            ? result.explanation.trim()
            : fallback.explanation,
      });

      const routeResult = parseResult(
        parsed.route,
        this.evaluateMedicationRouteHeuristic(expRoute, actRoute, actSite),
      );
      const siteResult = parseResult(
        parsed.site,
        this.evaluateMedicationSiteHeuristic(expSite, actSite),
      );

      // Final safety guard: even if the LLM said route matches, override to
      // a failure when the documented Site is anatomically incompatible with
      // the documented Route (deterministic clinical rule).
      if (routeResult.match) {
        const compat = this.checkRouteSiteCompatibility(actRoute, actSite);
        if (!compat.compatible) {
          return {
            route: {
              match: false,
              confidence: Math.max(routeResult.confidence, 0.9),
              explanation: compat.reason,
            },
            site: siteResult,
          };
        }
      }

      return { route: routeResult, site: siteResult };
    } catch (error) {
      this.logger.warn(
        `[RouteAndSiteEvaluation] LLM evaluation failed; using heuristic fallback. ${String(error)}`,
      );
      return {
        route: this.evaluateMedicationRouteHeuristic(expRoute, actRoute, actSite),
        site: this.evaluateMedicationSiteHeuristic(expSite, actSite),
      };
    }
  }

  private evaluateMedicationRouteHeuristic(
    expectedRoute: string,
    actualRoute: string,
    actualSite = '',
  ): {
    match: boolean;
    confidence: number;
    explanation: string;
  } {
    const normalize = (value: string): string =>
      value
        .toLowerCase()
        .replace(/[()]/g, ' ')
        .replace(/\bintravenous\b/g, 'iv')
        .replace(/\bintramuscular\b/g, 'im')
        .replace(/\bsubcutaneous\b/g, 'sq')
        .replace(/\bper os\b/g, 'po')
        .replace(/\bby mouth\b/g, 'po')
        .replace(/\bper rectum\b/g, 'pr')
        .replace(/\btopical\b/g, 'top')
        .replace(/\binhalation\b/g, 'inh')
        .replace(/\bophthalmic\b/g, 'optic')
        .replace(/\botic\b/g, 'otic')
        .replace(/\bsublingual\b/g, 'sl')
        .replace(/\bintrathecal\b/g, 'it')
        .replace(/\bepidural\b/g, 'epi')
        .replace(/\s+/g, ' ')
        .trim();

    const expNorm = normalize(expectedRoute);
    const actNorm = normalize(actualRoute);

    if (expNorm === actNorm) {
      // Route text matches � now make sure the documented Site is anatomically
      // compatible with the documented Route (e.g. an IV route with a "By Mouth"
      // site must still fail).
      const compat = this.checkRouteSiteCompatibility(actualRoute, actualSite);
      if (!compat.compatible) {
        return {
          match: false,
          confidence: 0.9,
          explanation: compat.reason,
        };
      }
      return {
        match: true,
        confidence: 0.95,
        explanation: 'Route matches expected administration route.',
      };
    }

    return {
      match: false,
      confidence: 0.2,
      explanation: 'Documented route does not match expected route.',
    };
  }

  /**
   * Checks whether a documented anatomical site is clinically compatible
   * with a documented route of administration. Returns { compatible: false }
   * for obvious anatomical contradictions (e.g. IV + "By Mouth").
   *
   * Conservative: when the route or site is unknown / blank / not in the
   * keyword tables, returns compatible = true so we never block on edge cases.
   */
  private checkRouteSiteCompatibility(
    route: string,
    site: string,
  ): { compatible: boolean; reason: string } {
    const r = (route ?? '').toLowerCase().trim();
    const s = (site ?? '').toLowerCase().trim();

    if (!r || !s) {
      return { compatible: true, reason: '' };
    }

    type RouteCategory =
      'iv' | 'im' | 'sq' | 'po' | 'pr' | 'inh' | 'top' | 'eye' | 'ear' | 'sl' | 'unknown';

    const classifyRoute = (text: string): RouteCategory => {
      if (/\b(iv|intravenous|intra-venous)\b/.test(text)) {
        return 'iv';
      }
      if (/\b(im|intramuscular|intra-muscular)\b/.test(text)) {
        return 'im';
      }
      if (/\b(sq|sc|subcut|subcutaneous|subq)\b/.test(text)) {
        return 'sq';
      }
      if (/\b(po|oral|by mouth|per os)\b/.test(text)) {
        return 'po';
      }
      if (/\b(pr|rectal|per rectum)\b/.test(text)) {
        return 'pr';
      }
      if (/\b(inh|inhalation|inhaled|nebuliz|nebulis)\b/.test(text)) {
        return 'inh';
      }
      if (/\b(top|topical|transdermal|cutaneous)\b/.test(text)) {
        return 'top';
      }
      if (/\b(ophthalmic|eye drop|optic|ocular|conjunctival)\b/.test(text)) {
        return 'eye';
      }
      if (/\b(otic|ear drop|aural)\b/.test(text)) {
        return 'ear';
      }
      if (/\b(sl|sublingual|buccal)\b/.test(text)) {
        return 'sl';
      }
      return 'unknown';
    };

    const siteHasOral = /(oral|by mouth|per os|\bpo\b|mouth|tongue|buccal)/.test(s);
    const siteHasVein =
      /(vein|venous|antecubital|cephalic|basilic|metacarpal|picc|central line|port|cannula|cvc)/.test(
        s,
      );
    const siteHasMuscle =
      /(deltoid|vastus|gluteal|gluteus|ventroglut|dorsoglut|rectus femoris|muscle|intramuscular)/.test(
        s,
      );
    const siteHasSubcutSpot =
      /(abdomen|abdominal|umbilic|periumbil|upper arm|thigh|fatty|subcut)/.test(s);
    const siteHasEye = /(eye|ocular|conjunctival|\bod\b|\bos\b|\bou\b)/.test(s);
    const siteHasEar = /(ear|aural|\bad\b|\bas\b|\bau\b|tympanic)/.test(s);
    const siteHasRectum = /(rectum|rectal|anus|anal)/.test(s);
    const siteHasSkin = /(skin|topical|transdermal|patch|forearm skin|arm skin)/.test(s);
    const siteHasLung = /(lung|airway|inhal|nebuliz|nebulis|bronchi|trachea)/.test(s);

    const cat = classifyRoute(r);

    const fail = (reason: string) => ({ compatible: false, reason });

    switch (cat) {
      case 'iv':
        if (siteHasOral) {
          return fail(
            `Documented site "${site}" is not anatomically valid for an Intravenous route (oral sites cannot receive IV medication).`,
          );
        }
        if (siteHasMuscle && !siteHasVein) {
          return fail(
            `Documented site "${site}" is a muscular site, not appropriate for an Intravenous route.`,
          );
        }
        if (siteHasEye || siteHasEar || siteHasRectum || siteHasLung) {
          return fail(
            `Documented site "${site}" is not anatomically valid for an Intravenous route.`,
          );
        }
        return { compatible: true, reason: '' };

      case 'im':
        if (
          siteHasOral ||
          siteHasVein ||
          siteHasEye ||
          siteHasEar ||
          siteHasRectum ||
          siteHasLung
        ) {
          return fail(
            `Documented site "${site}" is not anatomically valid for an Intramuscular route.`,
          );
        }
        return { compatible: true, reason: '' };

      case 'sq':
        if (
          siteHasOral ||
          siteHasVein ||
          siteHasEye ||
          siteHasEar ||
          siteHasRectum ||
          siteHasLung
        ) {
          return fail(
            `Documented site "${site}" is not anatomically valid for a Subcutaneous route.`,
          );
        }
        return { compatible: true, reason: '' };

      case 'po':
      case 'sl':
        if (
          siteHasVein ||
          siteHasMuscle ||
          siteHasEye ||
          siteHasEar ||
          siteHasRectum ||
          siteHasLung
        ) {
          return fail(
            `Documented site "${site}" is not anatomically valid for an Oral/Sublingual route.`,
          );
        }
        return { compatible: true, reason: '' };

      case 'pr':
        if (
          siteHasOral ||
          siteHasVein ||
          siteHasMuscle ||
          siteHasEye ||
          siteHasEar ||
          siteHasLung
        ) {
          return fail(`Documented site "${site}" is not anatomically valid for a Rectal route.`);
        }
        return { compatible: true, reason: '' };

      case 'inh':
        if (
          siteHasOral ||
          siteHasVein ||
          siteHasMuscle ||
          siteHasEye ||
          siteHasEar ||
          siteHasRectum
        ) {
          return fail(
            `Documented site "${site}" is not anatomically valid for an Inhalation route.`,
          );
        }
        return { compatible: true, reason: '' };

      case 'top':
        if (
          siteHasOral ||
          siteHasVein ||
          siteHasEye ||
          siteHasEar ||
          siteHasRectum ||
          siteHasLung
        ) {
          return fail(`Documented site "${site}" is not anatomically valid for a Topical route.`);
        }
        return { compatible: true, reason: '' };

      case 'eye':
        if (
          !siteHasEye &&
          (siteHasOral ||
            siteHasVein ||
            siteHasMuscle ||
            siteHasEar ||
            siteHasRectum ||
            siteHasLung ||
            siteHasSkin ||
            siteHasSubcutSpot)
        ) {
          return fail(
            `Documented site "${site}" is not an ocular site, but the route is Ophthalmic.`,
          );
        }
        return { compatible: true, reason: '' };

      case 'ear':
        if (
          !siteHasEar &&
          (siteHasOral ||
            siteHasVein ||
            siteHasMuscle ||
            siteHasEye ||
            siteHasRectum ||
            siteHasLung ||
            siteHasSkin ||
            siteHasSubcutSpot)
        ) {
          return fail(`Documented site "${site}" is not an aural site, but the route is Otic.`);
        }
        return { compatible: true, reason: '' };

      default:
        return { compatible: true, reason: '' };
    }
  }

  private buildDynamicAssessment(args: BuildDynamicAssessmentArgs) {
    const scenario = args.scenario;
    const studentMessages = args.messages.filter((m) => m.speaker === 'student');
    const studentTexts = studentMessages.map((m) => normalize(m.text || ''));

    // CRITICAL: If no student messages/questions, check actions performance before setting score
    if (studentTexts.length === 0 || studentTexts.every((t) => t.trim().length === 0)) {
      // Get actions analysis to check if actions were performed well
      const actionsAnalysis = this.analyzeActions(
        studentTexts,
        args.actions ?? [],
        args.expectedActions ?? {},
      );

      // If actions completion rate is high, don't zero out score completely
      let score = 0;
      if (actionsAnalysis.completionRate >= COVERAGE_MEDIUM_HIGH_PCT) {
        score = 40; // Allow minimum score of 40 if actions are good
      } else if (actionsAnalysis.completionRate >= COVERAGE_LOW_MEDIUM_PCT) {
        score = 20; // Allow minimum score of 20 if actions are decent
      }

      return {
        score,
        scoreJson: {
          communication: 1,
          clinicalJudgment: 1,
          technicalAccuracy: 1,
          ethicalCompetence: 1,
          reflection: 1,
          overallScore: score,
        },
        summary: 'No conversation detected. Student did not engage with the patient.',
        strengths: [],
        improvements: [
          'CRITICAL: No questions were asked to the patient',
          "Begin the encounter by introducing yourself and asking about the patient's condition",
          'Engage in conversation to gather patient information',
        ],
        feedback:
          'No conversation was detected between you and the patient. To provide proper care, you must communicate with the patient, ask questions about their condition, verify their identity, check for allergies, and gather medical history. Please engage with the patient in future scenarios.',
      };
    }

    // const allConversationText = studentTexts.join(" ");
    /* const avatarResponses = args.messages
      .filter((m) => m.speaker === "avatar")
      .map((m) => normalize(m.text || ""))
      .join(" "); */

    // 1. Analyze Patient Data Coverage (Enhanced)
    const patientDataCoverage = this.analyzePatientDataCoverageEnhanced(
      studentTexts,
      studentMessages,
      scenario?.patientData,
      scenario?.conversationResponses,
    );

    // 2. Check Phases and Tasks Completion
    const phaseTaskAnalysis = this.analyzePhaseTaskCompletion(studentTexts, scenario?.phases);

    // 3. Check Expected Actions vs Actions Taken
    const actionsAnalysis = this.analyzeActions(
      studentTexts,
      args.actions ?? [],
      args.expectedActions ?? {},
    );

    // 4. Evaluate Conversation Quality (Enhanced)
    const conversationQuality = this.evaluateConversationQualityEnhanced(args.messages);

    // 5. Check Scenario-Specific Requirements
    const scenarioRequirements = this.checkScenarioRequirements(
      studentTexts,
      scenario as unknown as Record<string, unknown> | null,
    );

    // 6. Calculate Scores Based on Analysis (Stricter)
    const scores = this.calculateScoresStrict(
      patientDataCoverage,
      phaseTaskAnalysis,
      actionsAnalysis,
      conversationQuality,
      scenarioRequirements,
      studentTexts.length,
      scenario?.grading,
    );

    // 7. Generate Strengths and Improvements
    const { strengths, improvements } = this.generateFeedbackEnhanced(
      patientDataCoverage,
      phaseTaskAnalysis,
      actionsAnalysis,
      conversationQuality,
      scenarioRequirements,
      studentTexts.length,
    );

    // 8. Generate Summary and Detailed Feedback
    const summary = this.generateSummaryEnhanced(
      patientDataCoverage,
      phaseTaskAnalysis,
      actionsAnalysis,
      scores.overallScore,
      studentTexts.length,
      scenario as unknown as ScenarioTitleLike | undefined,
    );

    const feedback = this.generateDetailedFeedbackEnhanced(
      patientDataCoverage,
      phaseTaskAnalysis,
      actionsAnalysis,
      conversationQuality,
      scenarioRequirements,
      scores,
      studentTexts.length,
    );

    return {
      score: scores.overallScore,
      scoreJson: scores,
      summary,
      strengths,
      improvements,
      feedback,
    };
  }

  private analyzePatientDataCoverageEnhanced(
    studentTexts: string[],
    studentMessages: Array<{ speaker: string; text?: string }>,
    patientData?: Record<string, unknown>,
    conversationResponses?: Record<string, unknown>,
  ): PatientDataCoverage {
    if (!patientData) {
      return {
        coverage: 0,
        askedFields: [],
        missingFields: [],
        criticalMissing: [],
        availableFields: [],
      };
    }

    // Enhanced keyword matching with more variations
    const coverageMap: Record<string, string[]> = {
      name: [
        'name',
        'what is your name',
        'who are you',
        'identify',
        'identity',
        'verify identity',
        'can you tell me your name',
        'may i have your name',
      ],
      age: [
        'age',
        'how old',
        'date of birth',
        'birthday',
        'dob',
        'born',
        'when were you born',
        'what is your age',
      ],
      gender: ['gender', 'sex', 'male', 'female', 'are you male or female'],
      chiefComplaint: [
        'chief complaint',
        'why are you here',
        'what brings you',
        'reason for visit',
        'problem',
        'symptom',
        'what is wrong',
        'what is the problem',
        'how can i help',
        'what brings you in',
        'what is bothering you',
      ],
      medicalHistory: [
        'medical history',
        'past medical',
        'previous illness',
        'health problems',
        'chronic conditions',
        'diagnosis',
        'any medical conditions',
        'past medical history',
        'have you been diagnosed',
        'any health issues',
      ],
      allergies: [
        'allergies',
        'allergic',
        'allergy',
        'reaction',
        'sensitive',
        'are you allergic',
        'do you have allergies',
        'any allergies',
        'allergic to anything',
      ],
      currentMedications: [
        'medications',
        'meds',
        'prescriptions',
        'taking any',
        'current medications',
        'drugs',
        'are you taking',
        'what medications',
        'any medications',
        'prescribed medications',
      ],
      vitals: [
        'vitals',
        'vital signs',
        'blood pressure',
        'heart rate',
        'pulse',
        'respiration',
        'temperature',
        'oxygen',
        'spo2',
        'bp',
        'hr',
        'rr',
        'temp',
        'o2',
      ],
      presentingNote: ['presenting', 'presentation', 'why here', 'what happened'],
    };

    const allText = studentTexts.join(' ').toLowerCase();
    const askedFields: string[] = [];
    const availableFields: string[] = [];
    const criticalFields = ['name', 'allergies', 'chiefComplaint', 'medicalHistory'];

    // Check basic fields with better matching
    Object.entries(coverageMap).forEach(([field, keywords]) => {
      if (field === 'vitals') {
        // Check vitals separately - check individual vital signs
        if (patientData.vitals && Object.keys(patientData.vitals).length > 0) {
          availableFields.push('vitals');
          // Check if any vital sign keywords are mentioned
          const vitalKeywords = [
            'blood pressure',
            'bp',
            'heart rate',
            'pulse',
            'hr',
            'respiration',
            'breathing',
            'temperature',
            'temp',
            'oxygen',
            'spo2',
            'o2',
          ];
          if (vitalKeywords.some((kw) => allText.includes(kw))) {
            askedFields.push('vitals');
          }
        }
      } else if (
        patientData[field] !== undefined &&
        patientData[field] !== null &&
        patientData[field] !== ''
      ) {
        availableFields.push(field);
        // Check if any keyword is found in the conversation
        const found = keywords.some((kw) => {
          const lowerKw = kw.toLowerCase();
          // Check for exact phrase or word boundary matching
          return (
            allText.includes(lowerKw) ||
            studentTexts.some((text) => {
              const lowerText = text.toLowerCase();
              return (
                lowerText.includes(lowerKw) ||
                lowerText.split(/\s+/).some((word) => word === lowerKw || word.startsWith(lowerKw))
              );
            })
          );
        });
        if (found) {
          askedFields.push(field);
        }
      }
    });

    // Check conversationResponses from scenario for expected questions
    if (conversationResponses) {
      Object.keys(conversationResponses).forEach((category) => {
        const responses = conversationResponses[category];
        if (Array.isArray(responses)) {
          responses.forEach((response: unknown) => {
            const responseRecord = (response ?? {}) as Record<string, unknown>;
            const keywords = responseRecord.keywords;
            if (Array.isArray(keywords)) {
              const found = keywords.some(
                (keyword) => typeof keyword === 'string' && allText.includes(normalize(keyword)),
              );
              if (found && !askedFields.includes(category)) {
                // Map category to patient data field if applicable
                if (category.includes('identity') || category.includes('verification')) {
                  if (!askedFields.includes('name')) {
                    askedFields.push('name');
                  }
                } else if (category.includes('allergy')) {
                  if (!askedFields.includes('allergies')) {
                    askedFields.push('allergies');
                  }
                } else if (category.includes('medical') || category.includes('history')) {
                  if (!askedFields.includes('medicalHistory')) {
                    askedFields.push('medicalHistory');
                  }
                }
              }
            }
          });
        }
      });
    }

    const missingFields = availableFields.filter((f) => !askedFields.includes(f));
    const criticalMissing = missingFields.filter((f) => criticalFields.includes(f));

    const coverage =
      availableFields.length > 0
        ? Math.round((askedFields.length / availableFields.length) * 100)
        : 0;

    return {
      coverage,
      askedFields,
      missingFields,
      criticalMissing,
      availableFields,
    };
  }

  private analyzePatientDataCoverage(
    studentTexts: string[],
    patientData?: Record<string, unknown>,
  ): PatientDataCoverage {
    if (!patientData) {
      return {
        coverage: 0,
        askedFields: [],
        missingFields: [],
        criticalMissing: [],
      };
    }

    const coverageMap: Record<string, string[]> = {
      name: ['name', 'what is your name', 'who are you', 'identify', 'identity', 'verify identity'],
      age: ['age', 'how old', 'date of birth', 'birthday', 'dob', 'born'],
      gender: ['gender', 'sex', 'male', 'female'],
      chiefComplaint: [
        'chief complaint',
        'why are you here',
        'what brings you',
        'reason for visit',
        'problem',
        'symptom',
      ],
      medicalHistory: [
        'medical history',
        'past medical',
        'previous illness',
        'health problems',
        'chronic conditions',
        'diagnosis',
      ],
      allergies: ['allergies', 'allergic', 'allergy', 'reaction', 'sensitive'],
      currentMedications: [
        'medications',
        'meds',
        'prescriptions',
        'taking any',
        'current medications',
        'drugs',
      ],
      vitals: [
        'vitals',
        'vital signs',
        'blood pressure',
        'heart rate',
        'pulse',
        'respiration',
        'temperature',
        'oxygen',
        'spo2',
      ],
    };

    const allText = studentTexts.join(' ');
    const askedFields: string[] = [];
    const availableFields: string[] = [];
    const criticalFields = ['name', 'allergies', 'chiefComplaint', 'medicalHistory'];

    // Check basic fields
    Object.entries(coverageMap).forEach(([field, keywords]) => {
      if (field === 'vitals') {
        // Check vitals separately
        if (patientData.vitals && Object.keys(patientData.vitals).length > 0) {
          availableFields.push('vitals');
          if (keywords.some((kw) => allText.includes(kw))) {
            askedFields.push('vitals');
          }
        }
      } else if (patientData[field] !== undefined && patientData[field] !== null) {
        availableFields.push(field);
        if (keywords.some((kw) => allText.includes(kw))) {
          askedFields.push(field);
        }
      }
    });

    const missingFields = availableFields.filter((f) => !askedFields.includes(f));
    const criticalMissing = missingFields.filter((f) => criticalFields.includes(f));

    const coverage =
      availableFields.length > 0
        ? Math.round((askedFields.length / availableFields.length) * 100)
        : 0;

    return {
      coverage,
      askedFields,
      missingFields,
      criticalMissing,
      availableFields,
    };
  }

  private analyzePhaseTaskCompletion(
    studentTexts: string[],
    phases?: Array<{
      id?: string;
      name?: string;
      tasks?: Array<{ id?: string; label?: string; required?: boolean }>;
    }>,
  ): PhaseTaskAnalysis {
    if (!phases || phases.length === 0) {
      return {
        completedPhases: 0,
        totalPhases: 0,
        completedTasks: 0,
        totalTasks: 0,
        phaseDetails: [],
      };
    }

    const allText = studentTexts.join(' ');
    const phaseDetails: PhaseDetail[] = [];
    let totalTasks = 0;
    let completedTasks = 0;

    phases.forEach((phase) => {
      if (!phase.tasks || phase.tasks.length === 0) {
        return;
      }

      totalTasks += phase.tasks.length;

      const phaseCompletedTasks = phase.tasks.filter((task) => {
        const label = task.label ?? '';
        const taskKeywords = normalize(label).split(' ');
        return taskKeywords.some(
          (keyword) =>
            allText.includes(keyword) ||
            label
              .toLowerCase()
              .split(' ')
              .some((word: string) => allText.includes(word.toLowerCase())),
        );
      }).length;

      completedTasks += phaseCompletedTasks;

      phaseDetails.push({
        phaseId: phase.id ?? '',
        phaseName: phase.name ?? '',
        completedTasks: phaseCompletedTasks,
        totalTasks: phase.tasks.length,
        tasks: phase.tasks.map((task) => ({
          taskId: task.id ?? '',
          taskLabel: task.label ?? '',
          required: task.required ?? false,
          completed: taskKeywordsCheck(task.label ?? '', allText),
        })),
      });
    });

    function taskKeywordsCheck(label: string, text: string): boolean {
      const keywords = normalize(label).split(' ');
      return keywords.some(
        (kw) =>
          text.includes(kw) ||
          label
            .toLowerCase()
            .split(' ')
            .some((word) => text.includes(word.toLowerCase())),
      );
    }

    const completedPhases = phaseDetails.filter((p) => p.completedTasks === p.totalTasks).length;

    return {
      completedPhases,
      totalPhases: phases.length,
      completedTasks,
      totalTasks,
      phaseDetails,
    };
  }

  private analyzeActions(
    studentTexts: string[],
    actionsTaken: unknown[],
    expectedActions: Record<string, unknown>,
  ): ActionsAnalysis {
    // const allText = studentTexts.join(" ");
    const expected = {
      labs: ((expectedActions.labs as string[] | undefined) ?? []).map(normalize),
      imaging: ((expectedActions.imaging as string[] | undefined) ?? []).map(normalize),
      physicalExam: ((expectedActions.physicalExam as string[] | undefined) ?? []).map(normalize),
      medications: ((expectedActions.medications as string[] | undefined) ?? []).map(normalize),
    };

    /* const taken = {
      labs: actionsTaken
        .filter((a) => a.type === "lab")
        .map((a) => normalize(a.details?.name || "")),
      imaging: actionsTaken
        .filter((a) => a.type === "imaging")
        .map((a) => normalize(a.details?.name || "")),
      physicalExam: actionsTaken
        .filter((a) => a.type === "exam")
        .map((a) => normalize(a.details?.name || "")),
      medications: actionsTaken
        .filter((a) => a.type === "medication")
        .map((a) => normalize(a.details?.name || "")),
    }; */

    // Check if mentioned in conversation
    const mentionedInConversation = {
      labs: expected.labs.filter((e: string) => studentTexts.some((t) => t.includes(e))).length,
      imaging: expected.imaging.filter((e: string) => studentTexts.some((t) => t.includes(e)))
        .length,
      physicalExam: expected.physicalExam.filter((e: string) =>
        studentTexts.some((t) => t.includes(e)),
      ).length,
      medications: expected.medications.filter((e: string) =>
        studentTexts.some((t) => t.includes(e)),
      ).length,
    };

    const totalExpected = Object.values(expected).reduce((sum, arr) => sum + arr.length, 0);
    const totalMentioned = Object.values(mentionedInConversation).reduce(
      (sum, val) => sum + val,
      0,
    );
    const totalTaken = actionsTaken.length;

    return {
      totalExpected,
      totalMentioned,
      totalTaken,
      mentionedInConversation,
      completionRate: totalExpected > 0 ? Math.round((totalMentioned / totalExpected) * 100) : 0,
    };
  }

  private evaluateConversationQualityEnhanced(messages: TranscriptMessage[]): ConversationQuality {
    const studentMessages = messages.filter((m) => m.speaker === 'student');
    // const avatarMessages = messages.filter((m) => m.speaker === "avatar");

    // Check for professional communication
    const professionalKeywords = [
      'please',
      'thank you',
      'understand',
      'explain',
      'help',
      'may i',
      'could you',
      'would you',
    ];
    const unprofessionalKeywords = ['hey', 'um', 'uh', 'like', 'whatever'];

    const allStudentText = studentMessages.map((m) => normalize(m.text ?? '')).join(' ');
    const professionalismScore =
      professionalKeywords.filter((kw) => allStudentText.includes(kw)).length * 2 -
      unprofessionalKeywords.filter((kw) => allStudentText.includes(kw)).length;

    // Check response timing and length
    const avgResponseLength =
      studentMessages.length > 0
        ? studentMessages.reduce((sum, m) => sum + (m.text?.length ?? 0), 0) /
          studentMessages.length
        : 0;

    // Check if student asked clarifying questions (more sophisticated)
    const questionWords = [
      'what',
      'why',
      'how',
      'when',
      'where',
      'can',
      'do',
      'does',
      'is',
      'are',
      'did',
      'have',
      'has',
      'tell me',
      'explain',
    ];
    const questionCount = studentMessages.filter((m) => {
      const text = normalize(m.text ?? '');
      return questionWords.some(
        (qw) => text.startsWith(qw) || text.includes(` ${qw} `) || text.includes(`?`),
      );
    }).length;

    // Check for patient-centered language
    const patientCenteredKeywords = [
      'how are you',
      'how do you feel',
      'tell me about',
      'describe',
      'can you tell me',
    ];
    const patientCenteredCount = studentMessages.filter((m) => {
      const text = normalize(m.text ?? '');
      return patientCenteredKeywords.some((kw) => text.includes(kw));
    }).length;

    // Check for empathy and reassurance
    const empatheticKeywords = [
      'i understand',
      'i can see',
      'that must be',
      "i'm sorry",
      'i hear you',
    ];
    const empathyCount = studentMessages.filter((m) => {
      const text = normalize(m.text ?? '');
      return empatheticKeywords.some((kw) => text.includes(kw));
    }).length;

    // Engagement score based on multiple factors
    const engagementScore = Math.min(
      10,
      studentMessages.length * 0.5 +
        questionCount * 0.3 +
        patientCenteredCount * 0.5 +
        empathyCount * 0.5,
    );

    return {
      messageCount: studentMessages.length,
      avgResponseLength,
      professionalismScore,
      questionCount,
      engagementScore,
    };
  }

  private evaluateConversationQuality(messages: TranscriptMessage[]): ConversationQuality {
    const studentMessages = messages.filter((m) => m.speaker === 'student');
    // const avatarMessages = messages.filter((m) => m.speaker === "avatar");

    // Check for professional communication
    const professionalKeywords = ['please', 'thank you', 'understand', 'explain', 'help'];
    const unprofessionalKeywords = ['hey', 'um', 'uh', 'like'];

    const allStudentText = studentMessages.map((m) => normalize(m.text ?? '')).join(' ');
    const professionalismScore =
      professionalKeywords.filter((kw) => allStudentText.includes(kw)).length * 2 -
      unprofessionalKeywords.filter((kw) => allStudentText.includes(kw)).length;

    // Check response timing (basic - could be enhanced with actual timestamps)
    const avgResponseLength =
      studentMessages.length > 0
        ? studentMessages.reduce((sum, m) => sum + (m.text?.length ?? 0), 0) /
          studentMessages.length
        : 0;

    // Check if student asked clarifying questions
    const questionWords = ['what', 'why', 'how', 'when', 'where', 'can', 'do', 'does', 'is', 'are'];
    const questionCount = studentMessages.filter((m) =>
      questionWords.some((qw) => normalize(m.text ?? '').startsWith(qw)),
    ).length;

    return {
      messageCount: studentMessages.length,
      avgResponseLength,
      professionalismScore,
      questionCount,
      engagementScore: Math.min(10, studentMessages.length + questionCount / 2),
    };
  }

  private checkScenarioRequirements(
    studentTexts: string[],
    scenario?: Record<string, unknown> | null,
  ): { met: number; total: number; details: string[] } {
    if (!scenario) {
      return { met: 0, total: 0, details: [] };
    }

    const allText = studentTexts.join(' ').toLowerCase();
    const details: string[] = [];
    let met = 0;
    let total = 0;

    // Check if scenario has specific requirements
    const learningObjective = scenario.learningObjective;
    const learningObjectiveText = Array.isArray(learningObjective)
      ? learningObjective.filter((x) => typeof x === 'string').join(' ')
      : typeof learningObjective === 'string'
        ? learningObjective
        : '';
    if (learningObjectiveText) {
      total++;
      // Check if student addressed learning objective (basic check)
      const objectiveKeywords = normalize(learningObjectiveText).split(' ');
      const addressed = objectiveKeywords.some((kw) => allText.includes(kw));
      if (addressed) {
        met++;
        details.push('Addressed learning objectives');
      } else {
        details.push('Did not fully address learning objectives');
      }
    }

    // Check conversationResponses requirements
    const conversationResponses = scenario.conversationResponses as
      Record<string, unknown> | undefined;
    if (conversationResponses) {
      Object.keys(conversationResponses).forEach((category) => {
        total++;
        const responses = conversationResponses[category];
        if (Array.isArray(responses)) {
          const found = responses.some((response: unknown) => {
            const responseRecord = (response ?? {}) as Record<string, unknown>;
            const keywords = responseRecord.keywords;
            if (!Array.isArray(keywords)) {
              return false;
            }
            return keywords.some(
              (keyword) => typeof keyword === 'string' && allText.includes(normalize(keyword)),
            );
          });
          if (found) {
            met++;
            details.push(`Asked about ${category}`);
          } else {
            details.push(`Missing: ${category} questions`);
          }
        }
      });
    }

    return { met, total, details };
  }

  private calculateScoresStrict(
    patientData: PatientDataCoverage,
    phases: PhaseTaskAnalysis,
    actions: ActionsAnalysis,
    conversation: ConversationQuality,
    scenarioRequirements: { met: number; total: number; details: string[] },
    messageCount: number,
    // eslint-disable-next-line unused-imports/no-unused-vars
    grading?: unknown,
  ): ScoreComponents {
    // Start with base scores - much stricter
    let communication = 1;
    let clinicalJudgment = 1;
    let technicalAccuracy = 1;
    let ethicalCompetence = 1;
    let reflection = 1;

    // Communication Score - based on actual engagement
    if (messageCount === 0) {
      communication = 1;
    } else if (messageCount < 3) {
      communication = 2;
    } else {
      communication = 3;
      // Add points for quality
      communication += Math.min(2, Math.floor(conversation.questionCount / 5));
      communication += Math.min(1, Math.floor(conversation.professionalismScore / 3));
      communication = Math.min(5, communication);
    }

    // Clinical Judgment Score - based on patient data coverage
    if (patientData.coverage === 0) {
      clinicalJudgment = 1;
    } else if (patientData.coverage < 30) {
      clinicalJudgment = 2;
    } else if (patientData.coverage < 50) {
      clinicalJudgment = 3;
    } else if (patientData.coverage >= COVERAGE_HIGH_PCT) {
      clinicalJudgment = 5;
    } else if (patientData.coverage >= COVERAGE_MEDIUM_PCT) {
      clinicalJudgment = 4;
    } else {
      clinicalJudgment = 3;
    }

    // Penalties for critical missing data
    if (patientData.criticalMissing.includes('allergies')) {
      clinicalJudgment = Math.max(1, clinicalJudgment - 2);
    }
    if (patientData.criticalMissing.includes('chiefComplaint')) {
      clinicalJudgment = Math.max(1, clinicalJudgment - 1);
    }

    // Phase completion boost
    if (phases.totalTasks > 0) {
      const taskRate = phases.completedTasks / phases.totalTasks;
      if (taskRate >= 0.8) {
        clinicalJudgment = Math.min(5, clinicalJudgment + 1);
      } else if (taskRate < 0.5) {
        clinicalJudgment = Math.max(1, clinicalJudgment - 1);
      }
    }

    // Technical Accuracy Score - based on actions
    if (actions.totalExpected === 0) {
      technicalAccuracy = 3; // No expected actions, neutral score
    } else if (actions.completionRate === 0) {
      technicalAccuracy = 1;
    } else if (actions.completionRate < 30) {
      technicalAccuracy = 2;
    } else if (actions.completionRate >= COVERAGE_MEDIUM_HIGH_PCT) {
      technicalAccuracy = 5;
    } else if (actions.completionRate >= COVERAGE_LOW_MEDIUM_PCT) {
      technicalAccuracy = 4;
    } else {
      technicalAccuracy = 3;
    }

    // Ethical Competence Score - critical for patient safety
    if (patientData.askedFields.includes('name')) {
      ethicalCompetence = 3;
    } else {
      ethicalCompetence = 1; // Didn't verify identity
    }

    if (patientData.askedFields.includes('allergies')) {
      ethicalCompetence = Math.min(5, ethicalCompetence + 2);
    } else {
      ethicalCompetence = Math.max(1, ethicalCompetence - 2); // Critical safety issue
    }

    if (patientData.askedFields.includes('chiefComplaint')) {
      ethicalCompetence = Math.min(5, ethicalCompetence + 1);
    }

    // Reflection Score - based on engagement depth
    if (messageCount === 0) {
      reflection = 1;
    } else if (messageCount < 3) {
      reflection = 2;
    } else if (messageCount >= 10) {
      reflection = 5;
    } else if (messageCount >= 5) {
      reflection = 4;
    } else {
      reflection = 3;
    }

    // Calculate overall score
    const baseScore = Math.round(
      ((communication + clinicalJudgment + technicalAccuracy + ethicalCompetence + reflection) /
        25) *
        100,
    );

    // Apply strict penalties
    let finalScore = baseScore;

    // DEBUG: Log values to understand scoring
    this.logger.debug(
      '[DEBUG] Score calculation:',
      JSON.stringify({
        baseScore,
        messageCount,
        actionsCompletionRate: actions.completionRate,
        criticalMissing: patientData.criticalMissing.length,
        coverage: patientData.coverage,
      }),
    );

    // Penalty for no conversation - zero out regardless of action completion
    if (messageCount === 0) {
      finalScore = 0;
      this.logger.debug('[DEBUG] Zeroed score due to no conversation messages');
    } else if (messageCount < 3) {
      finalScore = Math.max(0, finalScore - 30);
      this.logger.debug(
        '[DEBUG] Applied low message count penalty, finalScore:',
        String(finalScore),
      );
    }

    // Penalty for critical missing data
    const criticalPenalty = patientData.criticalMissing.length * 15;
    finalScore -= criticalPenalty;
    this.logger.debug(
      '[DEBUG] Applied critical missing data penalty:',
      String(criticalPenalty),
      'finalScore:',
      String(finalScore),
    );

    // Penalty for very low coverage
    if (patientData.coverage < 30) {
      finalScore = Math.max(0, finalScore - 20);
      this.logger.debug('[DEBUG] Applied low coverage penalty, finalScore:', String(finalScore));
    }

    // Ensure score is between 0 and 100
    finalScore = Math.max(0, Math.min(100, finalScore));
    this.logger.debug('[DEBUG] Final score after all penalties:', String(finalScore));

    return {
      communication,
      clinicalJudgment,
      technicalAccuracy,
      ethicalCompetence,
      reflection,
      overallScore: finalScore,
    };
  }

  private calculateScores(
    patientData: PatientDataCoverage,
    phases: PhaseTaskAnalysis,
    actions: ActionsAnalysis,
    conversation: ConversationQuality,
    grading?: { components?: unknown } | null,
  ): ScoreComponents {
    let communication = 3;
    let clinicalJudgment = 3;
    let technicalAccuracy = 3;
    let ethicalCompetence = 4;
    let reflection = 3;

    // Communication Score
    communication += Math.min(2, Math.floor(conversation.questionCount / 5));
    communication += Math.min(1, Math.floor(conversation.professionalismScore / 3));
    communication = Math.min(5, Math.max(1, communication));

    // Clinical Judgment Score
    const coverageBoost =
      patientData.coverage >= COVERAGE_HIGH_PCT
        ? 2
        : patientData.coverage >= COVERAGE_MEDIUM_PCT
          ? 1
          : 0;
    const phaseBoost =
      phases.totalPhases > 0
        ? Math.min(1, Math.floor((phases.completedPhases / phases.totalPhases) * 2))
        : 0;
    clinicalJudgment = Math.min(5, Math.max(1, 3 + coverageBoost + phaseBoost));

    // Technical Accuracy Score
    const actionBoost =
      actions.completionRate >= COVERAGE_MEDIUM_HIGH_PCT
        ? 2
        : actions.completionRate >= COVERAGE_LOW_MEDIUM_PCT
          ? 1
          : 0;
    technicalAccuracy = Math.min(5, Math.max(1, 3 + actionBoost));

    // Ethical Competence Score
    if (patientData.askedFields.includes('name')) {
      ethicalCompetence = Math.min(5, ethicalCompetence + 1);
    }
    if (patientData.askedFields.includes('allergies')) {
      ethicalCompetence = Math.min(5, ethicalCompetence + 1);
    }
    if (patientData.criticalMissing.includes('allergies')) {
      ethicalCompetence = Math.max(1, ethicalCompetence - 2);
    }
    if (patientData.criticalMissing.includes('name')) {
      ethicalCompetence = Math.max(1, ethicalCompetence - 1);
    }

    // Reflection Score
    reflection += conversation.messageCount > 5 ? 1 : 0;
    reflection = Math.min(5, Math.max(1, reflection));

    // Apply grading rubric weights if available
    if (grading?.components) {
      // Could apply custom weights here
    }

    const overallScore = Math.round(
      ((communication + clinicalJudgment + technicalAccuracy + ethicalCompetence + reflection) /
        25) *
        100,
    );

    // Adjust for critical missing data
    const finalScore = Math.max(0, overallScore - patientData.criticalMissing.length * 10);

    return {
      communication,
      clinicalJudgment,
      technicalAccuracy,
      ethicalCompetence,
      reflection,
      overallScore: finalScore,
    };
  }

  private generateFeedbackEnhanced(
    patientData: PatientDataCoverage,
    phases: PhaseTaskAnalysis,
    actions: ActionsAnalysis,
    conversation: ConversationQuality,
    scenarioRequirements: { met: number; total: number; details: string[] },
    messageCount: number,
  ): { strengths: string[]; improvements: string[] } {
    const strengths: string[] = [];
    const improvements: string[] = [];

    // If no conversation, all improvements
    if (messageCount === 0) {
      return {
        strengths: [],
        improvements: [
          'CRITICAL: No conversation with patient detected',
          'You must engage with the patient to provide care',
          "Start by introducing yourself and asking about the patient's condition",
        ],
      };
    }

    // Patient Data Coverage Feedback
    if (patientData.askedFields.includes('name')) {
      strengths.push('Verified patient identity appropriately');
    } else {
      improvements.push('CRITICAL: Always verify patient identity at the start of the encounter');
    }

    if (patientData.askedFields.includes('allergies')) {
      strengths.push('Checked for allergies and contraindications - critical for patient safety');
    } else {
      improvements.push(
        'CRITICAL SAFETY ISSUE: Always ask about allergies before any intervention or medication',
      );
    }

    if (patientData.askedFields.includes('chiefComplaint')) {
      strengths.push('Identified chief complaint and reason for visit');
    } else {
      improvements.push(
        'CRITICAL: Clarify chief complaint early in the assessment - this is the primary reason for the visit',
      );
    }

    if (patientData.askedFields.includes('medicalHistory')) {
      strengths.push('Obtained relevant medical history');
    } else {
      improvements.push(
        'Gather complete medical history to inform clinical decisions and avoid complications',
      );
    }

    // Coverage feedback
    if (patientData.coverage >= COVERAGE_HIGH_PCT) {
      strengths.push(
        `Excellent comprehensive patient data assessment (${patientData.coverage}% coverage)`,
      );
    } else if (patientData.coverage >= COVERAGE_MEDIUM_PCT) {
      strengths.push(`Good patient data assessment (${patientData.coverage}% coverage)`);
    } else if (patientData.coverage >= COVERAGE_LOW_PCT) {
      improvements.push(
        `Patient data coverage was ${patientData.coverage}% - aim for at least 70% for comprehensive assessment`,
      );
    } else if (patientData.coverage > 0) {
      improvements.push(
        `Patient data coverage was only ${patientData.coverage}% - many important questions were not asked`,
      );
    } else {
      improvements.push(
        "CRITICAL: No patient data was gathered - you must ask questions to understand the patient's condition",
      );
    }

    // Missing critical fields
    if (patientData.criticalMissing.length > 0) {
      improvements.push(`Missing critical information: ${patientData.criticalMissing.join(', ')}`);
    }

    // Phase/Task Completion Feedback
    if (phases.totalTasks > 0) {
      const taskCompletionRate = Math.round((phases.completedTasks / phases.totalTasks) * 100);
      if (taskCompletionRate >= COVERAGE_MEDIUM_HIGH_PCT) {
        strengths.push(
          `Completed most required tasks (${phases.completedTasks}/${phases.totalTasks} tasks, ${taskCompletionRate}%)`,
        );
      } else if (taskCompletionRate >= COVERAGE_LOW_MEDIUM_PCT) {
        improvements.push(
          `Complete more required tasks (${phases.completedTasks}/${phases.totalTasks} completed, ${taskCompletionRate}%)`,
        );
      } else {
        improvements.push(
          `CRITICAL: Only completed ${phases.completedTasks}/${phases.totalTasks} required tasks (${taskCompletionRate}%) - many essential tasks were missed`,
        );
      }

      // Check required tasks
      const missingRequired = phases.phaseDetails.flatMap((p) =>
        p.tasks.filter((t) => t.required && !t.completed),
      );
      if (missingRequired.length > 0) {
        improvements.push(
          `Missing ${missingRequired.length} REQUIRED task(s): ${missingRequired
            .slice(0, 3)
            .map((t) => t.taskLabel)
            .join(', ')}`,
        );
      }
    }

    // Actions Feedback
    if (actions.totalExpected > 0) {
      if (actions.completionRate >= COVERAGE_MEDIUM_HIGH_PCT) {
        strengths.push(
          `Appropriately selected and ordered expected clinical actions (${actions.completionRate}% completion)`,
        );
      } else if (actions.completionRate >= COVERAGE_LOW_MEDIUM_PCT) {
        improvements.push(
          `Order more appropriate clinical actions (${actions.totalMentioned}/${actions.totalExpected} expected actions addressed, ${actions.completionRate}%)`,
        );
      } else if (actions.completionRate > 0) {
        improvements.push(
          `CRITICAL: Only addressed ${actions.completionRate}% of expected clinical actions (${actions.totalMentioned}/${actions.totalExpected}) - many necessary interventions were missed`,
        );
      } else {
        improvements.push(
          `CRITICAL: No expected clinical actions were addressed (0/${actions.totalExpected}) - patient care may be incomplete`,
        );
      }
    }

    // Conversation Quality Feedback
    if (conversation.questionCount >= 10) {
      strengths.push(
        `Asked ${conversation.questionCount} clarifying questions, demonstrating excellent active engagement`,
      );
    } else if (conversation.questionCount >= 5) {
      strengths.push(
        `Asked ${conversation.questionCount} clarifying questions, showing good engagement`,
      );
    } else if (conversation.questionCount > 0) {
      improvements.push(
        `Ask more clarifying questions (only ${conversation.questionCount} questions asked) to better understand the patient`,
      );
    } else {
      improvements.push(
        "CRITICAL: No clarifying questions were asked - you must ask questions to understand the patient's condition",
      );
    }

    if (conversation.professionalismScore >= 5) {
      strengths.push('Maintained professional communication throughout the encounter');
    } else if (conversation.professionalismScore < 0) {
      improvements.push(
        'Improve professional communication - use appropriate language and maintain professional demeanor',
      );
    }

    // Message count feedback
    if (messageCount < 3) {
      improvements.push(
        `Very limited conversation (only ${messageCount} message(s)) - engage more with the patient`,
      );
    } else if (messageCount >= 10) {
      strengths.push(
        `Engaged in comprehensive conversation (${messageCount} exchanges with patient)`,
      );
    }

    // Scenario requirements
    if (scenarioRequirements.total > 0) {
      const reqRate = Math.round((scenarioRequirements.met / scenarioRequirements.total) * 100);
      if (reqRate >= COVERAGE_MEDIUM_HIGH_PCT) {
        strengths.push(
          `Met ${scenarioRequirements.met}/${scenarioRequirements.total} scenario-specific requirements`,
        );
      } else {
        improvements.push(
          `Only met ${scenarioRequirements.met}/${scenarioRequirements.total} scenario-specific requirements - review scenario expectations`,
        );
      }
    }

    // Defaults if empty
    if (strengths.length === 0 && messageCount > 0) {
      strengths.push('Engaged with patient');
    }
    if (improvements.length === 0 && messageCount > 0) {
      improvements.push('Continue to refine clinical assessment skills');
    }

    return { strengths, improvements };
  }

  private generateFeedback(
    patientData: PatientDataCoverage,
    phases: PhaseTaskAnalysis,
    actions: ActionsAnalysis,
    conversation: ConversationQuality,
  ): { strengths: string[]; improvements: string[] } {
    const strengths: string[] = [];
    const improvements: string[] = [];

    // Patient Data Coverage Feedback
    if (patientData.askedFields.includes('name')) {
      strengths.push('Verified patient identity appropriately');
    } else {
      improvements.push('Always verify patient identity at the start of the encounter');
    }

    if (patientData.askedFields.includes('allergies')) {
      strengths.push('Checked for allergies and contraindications');
    } else {
      improvements.push('CRITICAL: Always ask about allergies before any intervention');
    }

    if (patientData.askedFields.includes('medicalHistory')) {
      strengths.push('Obtained relevant medical history');
    } else {
      improvements.push('Gather complete medical history to inform clinical decisions');
    }

    if (patientData.askedFields.includes('chiefComplaint')) {
      strengths.push('Identified chief complaint and reason for visit');
    } else {
      improvements.push('Clarify chief complaint early in the assessment');
    }

    if (patientData.coverage >= COVERAGE_MEDIUM_PCT) {
      strengths.push('Comprehensive patient data assessment');
    } else if (patientData.coverage < 50) {
      improvements.push('Conduct more thorough patient assessment');
    }

    // Phase/Task Completion Feedback
    if (phases.totalTasks > 0) {
      const taskCompletionRate = (phases.completedTasks / phases.totalTasks) * 100;
      if (taskCompletionRate >= COVERAGE_MEDIUM_HIGH_PCT) {
        strengths.push('Completed most required tasks in the scenario');
      } else if (taskCompletionRate < 60) {
        improvements.push(
          `Complete more required tasks (${phases.completedTasks}/${phases.totalTasks} completed)`,
        );
      }

      // Check required tasks
      const missingRequired = phases.phaseDetails.flatMap((p) =>
        p.tasks.filter((t) => t.required && !t.completed),
      );
      if (missingRequired.length > 0) {
        improvements.push(
          `Missing ${missingRequired.length} required task(s): ${missingRequired
            .slice(0, 2)
            .map((t) => t.taskLabel)
            .join(', ')}`,
        );
      }
    }

    // Actions Feedback
    if (actions.completionRate >= COVERAGE_MEDIUM_HIGH_PCT) {
      strengths.push('Appropriately selected and ordered expected clinical actions');
    } else if (actions.totalExpected > 0 && actions.completionRate < 60) {
      improvements.push(
        `Order more appropriate clinical actions (${actions.totalMentioned}/${actions.totalExpected} expected actions addressed)`,
      );
    }

    // Conversation Quality Feedback
    if (conversation.questionCount >= 5) {
      strengths.push('Asked appropriate clarifying questions');
    } else {
      improvements.push('Ask more clarifying questions to better understand the patient');
    }

    if (conversation.professionalismScore >= 5) {
      strengths.push('Maintained professional communication throughout');
    }

    // Defaults if empty
    if (strengths.length === 0) {
      strengths.push('Followed basic assessment protocols');
    }
    if (improvements.length === 0) {
      improvements.push('Continue to refine clinical assessment skills');
    }

    return { strengths, improvements };
  }

  private generateSummaryEnhanced(
    patientData: PatientDataCoverage,
    phases: PhaseTaskAnalysis,
    actions: ActionsAnalysis,
    score: number,
    messageCount: number,
    scenario?: ScenarioTitleLike,
  ): string {
    if (messageCount === 0) {
      return `No conversation detected. Student did not engage with the patient in the ${scenario?.title ?? 'scenario'} simulation. Score: ${score}%.`;
    }

    const parts: string[] = [];

    parts.push(`Student completed the ${scenario?.title ?? 'scenario'} simulation`);

    if (messageCount > 0) {
      parts.push(`with ${messageCount} conversation exchange${messageCount !== 1 ? 's' : ''}`);
    }

    if (patientData.coverage > 0) {
      parts.push(`achieving ${patientData.coverage}% patient data coverage`);
    } else {
      parts.push(`with 0% patient data coverage (no questions asked)`);
    }

    if (phases.totalTasks > 0) {
      const taskRate = Math.round((phases.completedTasks / phases.totalTasks) * 100);
      parts.push(
        `completing ${phases.completedTasks}/${phases.totalTasks} required tasks (${taskRate}%)`,
      );
    }

    if (actions.totalExpected > 0) {
      parts.push(
        `addressing ${actions.totalMentioned}/${actions.totalExpected} expected clinical actions (${actions.completionRate}%)`,
      );
    }

    if (patientData.criticalMissing.length > 0) {
      parts.push(
        `. CRITICAL: Missing essential information (${patientData.criticalMissing.join(', ')})`,
      );
    }

    parts.push(`. Overall score: ${score}%`);

    return parts.join(' ') + '.';
  }

  private generateSummary(
    patientData: PatientDataCoverage,
    phases: PhaseTaskAnalysis,
    actions: ActionsAnalysis,
    score: number,
    scenario?: ScenarioTitleLike,
  ): string {
    const parts: string[] = [];

    parts.push(`Student completed the ${scenario?.title ?? 'scenario'} simulation`);

    if (patientData.coverage > 0) {
      parts.push(`with ${patientData.coverage}% patient data coverage`);
    }

    if (phases.totalTasks > 0) {
      parts.push(`completing ${phases.completedTasks}/${phases.totalTasks} required tasks`);
    }

    parts.push(
      `and addressing ${actions.totalMentioned}/${actions.totalExpected} expected actions`,
    );

    if (patientData.criticalMissing.length > 0) {
      parts.push(
        `. Note: Missing critical information (${patientData.criticalMissing.join(', ')})`,
      );
    }

    return parts.join(' ') + '.';
  }

  private generateDetailedFeedbackEnhanced(
    patientData: PatientDataCoverage,
    phases: PhaseTaskAnalysis,
    actions: ActionsAnalysis,
    conversation: ConversationQuality,
    scenarioRequirements: { met: number; total: number; details: string[] },
    scores: ScoreComponents,
    messageCount: number,
  ): string {
    if (messageCount === 0) {
      return 'No conversation was detected between you and the patient. To provide proper care, you must communicate with the patient, ask questions about their condition, verify their identity, check for allergies, and gather medical history. Please engage with the patient in future scenarios.';
    }

    const feedback: string[] = [];

    feedback.push(`Overall Performance Score: ${scores.overallScore}%`);
    feedback.push(`\nComponent Scores:`);
    feedback.push(`- Communication: ${scores.communication}/5`);
    feedback.push(`- Clinical Judgment: ${scores.clinicalJudgment}/5`);
    feedback.push(`- Technical Accuracy: ${scores.technicalAccuracy}/5`);
    feedback.push(`- Ethical Competence: ${scores.ethicalCompetence}/5`);
    feedback.push(`- Reflection & Critical Thinking: ${scores.reflection}/5`);

    feedback.push(`\nConversation Analysis:`);
    feedback.push(`- Total exchanges with patient: ${messageCount}`);
    feedback.push(`- Questions asked: ${conversation.questionCount}`);

    if (patientData.coverage >= COVERAGE_HIGH_PCT) {
      feedback.push(
        `\n[OK] Excellent patient data gathering with ${patientData.coverage}% coverage.`,
      );
    } else if (patientData.coverage >= COVERAGE_MEDIUM_PCT) {
      feedback.push(`\n[OK] Good patient data gathering with ${patientData.coverage}% coverage.`);
    } else if (patientData.coverage >= COVERAGE_LOW_PCT) {
      feedback.push(
        `\n[!] Patient data coverage was ${patientData.coverage}% - aim for at least 70% for comprehensive assessment.`,
      );
    } else if (patientData.coverage > 0) {
      feedback.push(
        `\n[!] Patient data coverage was only ${patientData.coverage}% - many important questions were not asked.`,
      );
    } else {
      feedback.push(
        `\n[-] CRITICAL: No patient data was gathered (0% coverage) - you must ask questions to understand the patient's condition.`,
      );
    }

    if (patientData.askedFields.length > 0) {
      feedback.push(`\nPatient information you asked about: ${patientData.askedFields.join(', ')}`);
    }

    if (patientData.missingFields.length > 0) {
      feedback.push(
        `\nMissing patient information: ${patientData.missingFields.slice(0, 5).join(', ')}${patientData.missingFields.length > 5 ? ` and ${patientData.missingFields.length - 5} more` : ''}`,
      );
    }

    if (patientData.criticalMissing.length > 0) {
      feedback.push(
        `\n[-] CRITICAL MISSING: ${patientData.criticalMissing.join(', ')} - These are essential for patient safety and proper care.`,
      );
    }

    if (phases.totalTasks > 0) {
      const taskRate = Math.round((phases.completedTasks / phases.totalTasks) * 100);
      feedback.push(
        `\nTask Completion: ${taskRate}% (${phases.completedTasks}/${phases.totalTasks} tasks completed)`,
      );

      const missingRequired = phases.phaseDetails.flatMap((p) =>
        p.tasks.filter((t) => t.required && !t.completed),
      );
      if (missingRequired.length > 0) {
        feedback.push(
          `[-] Missing ${missingRequired.length} REQUIRED task(s): ${missingRequired
            .slice(0, 3)
            .map((t) => t.taskLabel)
            .join(', ')}`,
        );
      }
    }

    if (actions.totalExpected > 0) {
      if (actions.completionRate >= COVERAGE_MEDIUM_PCT) {
        feedback.push(
          `\n[OK] Appropriately addressed ${actions.completionRate}% of expected clinical actions (${actions.totalMentioned}/${actions.totalExpected}).`,
        );
      } else if (actions.completionRate > 0) {
        feedback.push(
          `\n[!] Only addressed ${actions.completionRate}% of expected clinical actions (${actions.totalMentioned}/${actions.totalExpected}) - consider additional interventions.`,
        );
      } else {
        feedback.push(
          `\n[-] CRITICAL: No expected clinical actions were addressed (0/${actions.totalExpected}) - patient care may be incomplete.`,
        );
      }
    }

    if (conversation.questionCount >= 5) {
      feedback.push(
        `\n[OK] Asked ${conversation.questionCount} clarifying questions, demonstrating active engagement and thorough assessment.`,
      );
    } else if (conversation.questionCount > 0) {
      feedback.push(
        `\n[!] Only asked ${conversation.questionCount} question(s) - ask more clarifying questions to better understand the patient.`,
      );
    } else {
      feedback.push(
        `\n[-] CRITICAL: No clarifying questions were asked - you must ask questions to understand the patient's condition.`,
      );
    }

    if (scenarioRequirements.total > 0) {
      const reqRate = Math.round((scenarioRequirements.met / scenarioRequirements.total) * 100);
      feedback.push(
        `\nScenario-Specific Requirements: ${reqRate}% met (${scenarioRequirements.met}/${scenarioRequirements.total})`,
      );
    }

    feedback.push(
      `\nRecommendations: Continue to focus on comprehensive patient assessment, patient safety protocols, and thorough clinical reasoning.`,
    );

    return feedback.join(' ');
  }

  private generateDetailedFeedback(
    patientData: PatientDataCoverage,
    phases: PhaseTaskAnalysis,
    actions: ActionsAnalysis,
    conversation: ConversationQuality,
    scores: ScoreComponents,
  ): string {
    const feedback: string[] = [];

    feedback.push(`Overall performance score: ${scores.overallScore}%. `);
    feedback.push(
      `Communication: ${scores.communication}/5, Clinical Judgment: ${scores.clinicalJudgment}/5, Technical Accuracy: ${scores.technicalAccuracy}/5. `,
    );

    if (patientData.coverage >= COVERAGE_MEDIUM_PCT) {
      feedback.push(`Excellent patient data gathering with ${patientData.coverage}% coverage. `);
    } else if (patientData.coverage >= COVERAGE_LOW_PCT) {
      feedback.push(`Good patient data gathering with ${patientData.coverage}% coverage. `);
    } else {
      feedback.push(`Patient data coverage was ${patientData.coverage}% - aim for at least 70%. `);
    }

    if (phases.totalTasks > 0) {
      const taskRate = Math.round((phases.completedTasks / phases.totalTasks) * 100);
      feedback.push(
        `Task completion: ${taskRate}% (${phases.completedTasks}/${phases.totalTasks} tasks). `,
      );
    }

    if (actions.completionRate >= COVERAGE_MEDIUM_PCT) {
      feedback.push(
        `Appropriately addressed ${actions.completionRate}% of expected clinical actions. `,
      );
    } else {
      feedback.push(
        `Consider addressing more expected clinical actions (${actions.completionRate}% completion). `,
      );
    }

    if (conversation.questionCount >= 5) {
      feedback.push(
        `Asked ${conversation.questionCount} clarifying questions, demonstrating active engagement. `,
      );
    }

    feedback.push('Continue to focus on comprehensive assessment and patient safety.');

    return feedback.join('');
  }

  async createReport(dto: CreateReportDto) {
    const existing = this.jsonDataService.getReportByTranscriptId(dto.transcriptId);
    if (existing) {
      return existing;
    }

    const dtoExtended = dto as CreateReportDto & {
      score?: number;
      scoreJson?: Report['scoreJson'];
      feedback?: string;
    };
    const newReport: Report = {
      id: this.jsonDataService.generateId(),
      key: os.userInfo().username,
      ...dtoExtended,
      score: dtoExtended.score ?? 0,
      scoreJson: dtoExtended.scoreJson ?? {
        communication: 0,
        clinicalJudgment: 0,
        technicalAccuracy: 0,
        ethicalCompetence: 0,
        reflection: 0,
        overallScore: 0,
      },
      feedback: dtoExtended.feedback ?? '',
      createdAt: new Date().toISOString(),
    };

    await this.jsonDataService.addReportFresh(newReport);
    return newReport;
  }

  async createReportWithAI(dto: CreateReportDto, language: 'en' | 'es' = 'en'): Promise<Report> {
    const gradingInstanceId = LifecycleTelemetryService.generateInstanceId();
    const gradingStartTime = Date.now();

    this.logger.log(
      `[ReportsService] createReportWithAI called for transcriptId: "${dto.transcriptId}" (len: ${dto.transcriptId?.length ?? 0}), scenarioId: "${dto.scenarioId}", language: "${language}"`,
    );

    if (!dto.transcriptId) {
      this.logger.error(
        `[ReportsService] ERROR: transcriptId is missing in DTO:`,
        JSON.stringify(dto).substring(0, 500),
      );
      throw new BadRequestException('transcriptId is required for report generation');
    }

    // ── Duplicate-report guard ──────────────────────────────────────────────
    // 1. Check by transcriptId first (fresh read — works across all workers /
    //    deployment instances that share the same blob storage).
    const existingByTranscript = await this.jsonDataService.getReportByTranscriptIdFresh(
      dto.transcriptId,
    );
    if (existingByTranscript) {
      this.logger.log(
        `[ReportsService] Duplicate report detected by transcriptId "${dto.transcriptId}" — returning existing report ${existingByTranscript.id}`,
      );
      return existingByTranscript;
    }

    // 2. Assessment mode only: enforce the per-student attempt limit
    //    (`MAX_ASSESSMENT_ATTEMPTS`).  Concurrent tabs on the *same* attempt
    //    are already deduplicated above via transcriptId.  Once the student
    //    has consumed all allotted graded attempts for a scenario, return
    //    the most recent existing report instead of generating another one.
    const isAssessment = (dto.mode ?? 'Assessment') === 'Assessment';
    if (isAssessment && dto.scenarioId && dto.student_id) {
      const existingAssessments =
        await this.jsonDataService.getAssessmentReportsByScenarioAndStudentFresh(
          dto.scenarioId,
          dto.student_id,
        );
      if (existingAssessments.length >= MAX_ASSESSMENT_ATTEMPTS) {
        const mostRecent = existingAssessments[0];
        this.logger.log(
          `[ReportsService] Assessment attempt limit (${MAX_ASSESSMENT_ATTEMPTS}) reached for scenarioId "${dto.scenarioId}" + studentId "${dto.student_id}" — returning most recent report ${mostRecent.id}`,
        );
        return mostRecent;
      }
    }
    // ────────────────────────────────────────────────────────────────────────

    // Get transcript data with retries to handle Azure Storage sync delays
    let transcript: Transcript | undefined;
    const maxRetries = 10;
    const delayMs = 1000;

    for (let i = 0; i < maxRetries; i++) {
      transcript = await this.jsonDataService.getTranscriptByIdFresh(dto.transcriptId);
      if (transcript) {
        break;
      }

      if (i < maxRetries - 1) {
        console.warn(
          `[ReportsService] createReportWithAI: Transcript ${dto.transcriptId} not found, retrying (${i + 1}/${maxRetries})...`,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    if (!transcript) {
      console.error(
        `[ReportsService] ERROR: Transcript "${dto.transcriptId}" not found after ${maxRetries} retries`,
      );
      throw new NotFoundException(`Transcript with ID ${dto.transcriptId} not found`);
    }

    // Emit Grading.Started event
    try {
      if (transcript.sessionId) {
        this.lifecycleTelemetry.emitGradingStarted({
          sessionId: transcript.sessionId,
          transcriptId: dto.transcriptId,
          gradingInstanceId,
          gradingType: GradingType.Deferred,
          startedAtUtc: new Date().toISOString(),
          schemaVersion: LIFECYCLE_SCHEMA_VERSION,
        });
      }
    } catch (error) {
      this.logger.warn(`Failed to emit Grading.Started: ${error}`);
    }

    // Get scenario details — fetch the localized variant when a non-English
    // language is requested so that action/order titles resolved by
    // `resolveDisplayLabelForRef` (sequencing, actions analysis) are already
    // in the target language. Falls back to the English scenario transparently
    // when no localized file exists for this scenario.
    const scenario = await this.jsonDataService.getScenarioByIdLocalized(dto.scenarioId, language);
    if (!scenario) {
      throw new NotFoundException(`Scenario with ID ${dto.scenarioId} not found`);
    }

    // Prepare conversation text for AI analysis with timing
    const scenarioStart = new Date(
      dto.scenarioStartTime ?? transcript.startedAt ?? new Date(),
    ).getTime();
    const enrichedMessages: EnrichedMessage[] = transcript.messages.map(
      (msg: Record<string, unknown>) => {
        let elapsedSeconds: number;
        if (
          typeof msg.elapsedSeconds === 'number' &&
          Number.isFinite(msg.elapsedSeconds) &&
          msg.elapsedSeconds >= 0
        ) {
          elapsedSeconds = msg.elapsedSeconds;
        } else {
          const tsValue = typeof msg.timestampValue === 'number' ? msg.timestampValue : undefined;
          const msgTime = tsValue ?? new Date(msg.timestamp as string).getTime();
          elapsedSeconds = Math.max(0, Math.round((msgTime - scenarioStart) / 1000));
        }
        return {
          ...msg,
          elapsedSeconds,
          elapsedTimeFormatted: this.formatSecondsToTime(elapsedSeconds),
        };
      },
    );

    const conversationText = enrichedMessages
      .map(
        (msg) =>
          `[${msg.elapsedTimeFormatted}] ${String(msg.speaker ?? '')}: ${String(msg.text ?? '')} (elapsedSeconds: ${msg.elapsedSeconds})`,
      )
      .join('\n');

    // Enrich all student data with timing
    const summaryByCategory = this.enrichTimingData(dto.summaryByCategory, scenarioStart) as
      StudentSummary | undefined;
    const commonActionTracker = this.enrichTimingData(dto.commonActionTracker, scenarioStart) as
      Record<string, unknown> | EnrichedMessage[] | undefined;
    const actionsTimeline = this.enrichTimingData(
      dto.actionsTimeline ?? [],
      scenarioStart,
    ) as EnrichedMessage[];

    try {
      // Send to OpenAI for analysis
      const aiAnalysis = await this.analyzeWithOpenAI(
        conversationText,
        summaryByCategory,
        scenario,
        dto.scenarioStartTime,
        actionsTimeline,
        commonActionTracker,
        dto.mode ?? 'Assessment',
        { ...transcript, messages: enrichedMessages },
        (dto.summaryEntries ?? []) as ActionAttempt[],
        language,
      );
      this.logger.debug(JSON.stringify(aiAnalysis));

      // Check if Communication is enabled in the grading rubric
      const communicationRubricItem = (
        Array.isArray(scenario?.grading?.rubric) ? scenario.grading.rubric : []
      ).find(
        (item) =>
          String(item?.subCategory ?? '')
            .trim()
            .toLowerCase() === 'communication',
      );
      const isCommunicationEnabled = !!communicationRubricItem;

      // Check if Team Communication is configured as Mandatory
      const isTeamCommunicationMandatory =
        (
          scenario as unknown as Record<string, unknown> & {
            teamCommunication?: { typeRequirement?: string };
          }
        )?.teamCommunication?.typeRequirement === 'Mandatory';

      // Map soft skill results into legacy communicationAssessment (empathy/clarity)
      // Only enrich if Communication is enabled in the grading rubric
      const communicationAssessment = isCommunicationEnabled
        ? (this.enrichCommunicationAssessment(aiAnalysis) as Report['communicationAssessment'])
        : undefined;

      //
      // COMPUTE ACTION SCORES WITH RUBRIC WEIGHTS FOR REPORT
      //
      const actionsToGrade = scenario?.actions ?? [];
      const expectedActionMarks = await this.computeDeterministicActionMarks(
        (actionsTimeline ?? []) as unknown as ActionAttempt[],
        actionsToGrade as Parameters<
          ActionsInterventionsService['computeDeterministicActionMarks']
        >[1],
        dto.mode ?? 'Assessment',
        summaryByCategory as Parameters<
          ActionsInterventionsService['computeDeterministicActionMarks']
        >[3],
      );
      this.logger.debug(
        '[createReportWithAI] expectedActionMarks:',
        JSON.stringify(expectedActionMarks),
      );

      const actionScores = this.calculateScoreByCategory(expectedActionMarks, scenario);

      // Reconcile vital action isCorrect in mandatoryActionDetails using
      // generateVitalActionFeedback (the source of truth for vital scoring).
      // This mirrors the same reconciliation done for rubric actionDetails in analyzeWithOpenAI.
      const vitalFeedbackForReport = this.generateVitalActionFeedback(
        (actionsTimeline ?? []) as unknown as ActionAttempt[],
        (scenario?.actions ?? []) as ScenarioActionDef[],
        summaryByCategory as Parameters<
          ActionsInterventionsService['generateVitalActionFeedback']
        >[2],
        (dto.summaryEntries ?? []) as ActionAttempt[],
      );
      const vitalTitlesCorrectInReport = new Set(
        vitalFeedbackForReport.strengths.map((s) =>
          s.point.replace(/^Correctly performed vital signs action "(.+)"$/, '$1').toLowerCase(),
        ),
      );
      actionScores.mandatoryActionDetails = actionScores.mandatoryActionDetails.map((d) => {
        if (String(d.type ?? '').toLowerCase() !== 'vital') {
          return d;
        }
        const isCorrect = vitalTitlesCorrectInReport.has((d.title ?? '').toLowerCase());
        return { ...d, isCorrect, pointsAwarded: isCorrect && !d.isOptional ? 1 : 0 };
      });

      // Optional vital actions: reconcile isCorrect from expectedActionMarks.details
      // (which uses evaluateActionAttempt, now fixed to accept response text as proof).
      // generateVitalActionFeedback excludes optional vitals from its strengths, so we
      // use the deterministic marks directly instead of vitalTitlesCorrectInReport.
      const optionalVitalCorrectTitles = new Set(
        expectedActionMarks.details
          .filter(
            (d) =>
              String(d.type ?? '').toLowerCase() === 'vital' &&
              d.isOptional === true &&
              d.isCorrect === true,
          )
          .map((d) => (d.title ?? '').toLowerCase()),
      );
      actionScores.optionalActionDetails = actionScores.optionalActionDetails.map((d) => {
        if (String(d.type ?? '').toLowerCase() !== 'vital') {
          return d;
        }
        const isCorrect = optionalVitalCorrectTitles.has((d.title ?? '').toLowerCase());
        return { ...d, isCorrect, pointsAwarded: 0 };
      });

      this.logger.debug('[createReportWithAI] actionScores:', JSON.stringify(actionScores));

      // ----------------------------------------------------------------------------------
      // EVALUATE TEAM COMMUNICATION (SBAR) IF CONFIGURED AND ATTEMPTED
      // ----------------------------------------------------------------------------------
      const teamCommunicationEnabled =
        (
          scenario as unknown as Record<string, unknown> & {
            teamCommunication?: { isButtonEnabled?: boolean };
          }
        )?.teamCommunication?.isButtonEnabled === true;
      let teamCommunicationStatus: 'Satisfactory' | 'Unsatisfactory' | 'Not Attempted' | null =
        null;
      let sbarResult: {
        score: number;
        passed: boolean;
        flagged: boolean;
        results: Array<{ concept: string; status: string; evidence: string }>;
      } | null = null;

      // CRITICAL FIX: Team Communication data comes through dto.summaryByCategory.actions array
      // NOT as a separate property. Check if there's an action entry with title === 'Team Communication'
      const actionsArray = (dto.summaryByCategory as Record<string, unknown>)?.['actions'];
      const teamCommActionEntry = Array.isArray(actionsArray)
        ? (actionsArray as Array<{ title?: string }>).find(
            (item) => item.title === 'Team Communication',
          )
        : null;

      this.logger.debug(
        `[createReportWithAI] Team Communication entry found in actions: ${!!teamCommActionEntry}`,
      );
      this.logger.debug(
        `[createReportWithAI] teamCommActionEntry: ${JSON.stringify(teamCommActionEntry)}`,
      );

      if (teamCommunicationEnabled) {
        if (teamCommActionEntry) {
          // ONLY evaluate if student actually attempted Team Communication (entry exists in actions)
          try {
            sbarResult = await this.communicationSvc.evaluateCommunication(
              conversationText,
              50, // default threshold
            );
            teamCommunicationStatus = sbarResult.passed ? 'Satisfactory' : 'Unsatisfactory';
            this.logger.debug(
              `[createReportWithAI] Team Communication evaluated: ${teamCommunicationStatus} (score: ${sbarResult.score}%)`,
            );
            this.logger.debug(
              `[createReportWithAI] SBAR Results: ${JSON.stringify(sbarResult.results)}`,
            );
          } catch (error) {
            this.logger.error('[createReportWithAI] Team Communication evaluation failed:', error);
            teamCommunicationStatus = 'Unsatisfactory'; // Default to unsatisfactory if evaluation fails
          }
        } else {
          // Team Communication is enabled but student did NOT attempt it (no entry in actions array)
          // Use 'Not Attempted' so the report can distinguish this from a graded Unsatisfactory
          teamCommunicationStatus = 'Not Attempted';
          this.logger.debug(
            '[createReportWithAI] Team Communication NOT attempted by student (no entry in actions array) - marking as Not Attempted',
          );
        }
      }

      // Add Team Communication status and AI summaries to communicationAssessment if it's Mandatory
      if (isTeamCommunicationMandatory && teamCommunicationStatus && communicationAssessment) {
        (communicationAssessment as Record<string, unknown>).sbarStatus = teamCommunicationStatus;

        // Generate AI summaries if evaluation was performed
        if (sbarResult) {
          const sbarSummaries = this.generateSBARSummaries(sbarResult);
          (communicationAssessment as Record<string, unknown>).sbarScore = sbarResult.score;
          (communicationAssessment as Record<string, unknown>).sbarSummary = sbarSummaries.summary;
          (communicationAssessment as Record<string, unknown>).sbarStrengths =
            sbarSummaries.strengths;
          (communicationAssessment as Record<string, unknown>).sbarWeaknesses =
            sbarSummaries.weaknesses;
          (communicationAssessment as Record<string, unknown>).sbarRecommendations =
            sbarSummaries.recommendations;
          (communicationAssessment as Record<string, unknown>).sbarDetails = sbarResult.results;

          this.logger.debug(
            `[createReportWithAI] Added SBAR summaries to communicationAssessment: score=${sbarResult.score}, strengths=${sbarSummaries.strengths.length}, weaknesses=${sbarSummaries.weaknesses.length}`,
          );
        }

        this.logger.debug(
          `[createReportWithAI] Added sbarStatus "${teamCommunicationStatus}" to communicationAssessment (Team Communication is Mandatory)`,
        );
      }

      // Create report with AI-generated dynamic values
      // Calculate overall score by iterating exactly the scenario's configured rubric items.
      // This avoids counting duplicates that arise when the AI returns an item AND the
      // guarantee loop creates a second entry for the same subCategory.
      const rubricsBucket: Partial<RubricsContainer> = aiAnalysis.rubrics ?? {};
      const rubricItemsForScore = Array.isArray(scenario?.grading?.rubric)
        ? scenario.grading.rubric
        : [];

      // ADJUST COMMUNICATION RUBRIC SCORE BASED ON TEAM COMMUNICATION STATUS
      // If Team Communication is Mandatory, adjust the Communication rubric item's score
      if (isTeamCommunicationMandatory && teamCommunicationStatus) {
        const bucketItems: Record<string, RubricItemRecord> =
          rubricsBucket.items && typeof rubricsBucket.items === 'object' ? rubricsBucket.items : {};

        // Find the Communication rubric item
        const communicationRecordItem = Object.values(bucketItems).find(
          (item) =>
            String(item.subCategory ?? '')
              .trim()
              .toLowerCase() === 'communication',
        );

        if (communicationRecordItem) {
          // FORMULA CALCULATION: (Completed Mandatory Criteria / Total Mandatory Criteria) * 100
          // Team Communication is ONE of the mandatory criteria

          // Get the AI-evaluated Communication criteria
          const aiCriteria = (communicationRecordItem.criteriaResults ?? []) as Array<{
            title?: string;
            passed?: boolean;
          }>;

          // Count AI criteria that are mandatory and completed
          let mandatoryCriteriaCompleted = aiCriteria.filter((c) => c.passed === true).length;
          let totalMandatoryCriteria = aiCriteria.length;

          // Add Team Communication as ONE mandatory criterion
          if (isTeamCommunicationMandatory) {
            totalMandatoryCriteria += 1;
            if (teamCommunicationStatus === 'Satisfactory') {
              mandatoryCriteriaCompleted += 1;
            }
            // For 'Unsatisfactory' or 'Not Attempted', don't add to completed count
          }

          // Calculate score using formula: (completed / total) * 100
          const calculatedScore =
            totalMandatoryCriteria > 0
              ? (mandatoryCriteriaCompleted / totalMandatoryCriteria) * 100
              : 0;

          this.logger.debug(
            `[createReportWithAI] Communication Formula Calculation: ${mandatoryCriteriaCompleted}/${totalMandatoryCriteria} mandatory criteria = ${calculatedScore.toFixed(2)}%`,
          );

          communicationRecordItem.score = Math.round(calculatedScore);
          communicationRecordItem.weightedScore =
            (calculatedScore / 100) * (communicationRubricItem?.weight ?? 0);
        }
      }

      let rubricPoints = 0;
      let rubricMax = 0;

      for (const ri of rubricItemsForScore) {
        const itemId = String(ri.id ?? ri.aiMapping?.aiCheckId ?? '');
        const subCat = String(ri.subCategory ?? '').toLowerCase();
        const weight = typeof ri.weight === 'number' ? ri.weight : 0;

        // Look up by ID first (guarantee item), then fall back to subCategory match
        const bucketItems: Record<string, RubricItemRecord> =
          rubricsBucket.items && typeof rubricsBucket.items === 'object' ? rubricsBucket.items : {};

        const recordItem: RubricItemRecord | undefined =
          bucketItems[itemId] ??
          Object.values(bucketItems).find((item) => {
            const itemSub = String(item.subCategory ?? '').toLowerCase();
            if (itemSub === subCat) {
              return true;
            }
            // Normalise common subCategory aliases so that, e.g., a scenario
            // configured with subCategory:'Action' still matches a bucket item
            // stored as 'Actions & Interventions' or 'Expected Actions'.
            const norm = (s: string) =>
              s.replace(/[&,]/g, ' ').replace(/\s+/g, ' ').trim().split(' ')[0].toLowerCase();
            return norm(itemSub) === norm(subCat);
          });

        // item.score is a 0–100 percentage after all deterministic overrides (or null / N/A when zero mandatory items)
        const score = recordItem?.score;
        if (typeof score === 'number' && isFinite(score)) {
          rubricPoints += (score / 100) * weight;
          rubricMax += weight;
        }
      }

      // When scenario.grading.rubric is empty or no items matched (rubricMax = 0),
      // fall back to the deterministic totalScore / totalWeight already computed
      // inside analyzeWithAI so the overall score is never silently zeroed out.
      let overallScore0to100: number;
      if (rubricMax > 0) {
        overallScore0to100 = (rubricPoints / rubricMax) * 100;
      } else {
        const fallbackTotal =
          typeof rubricsBucket.totalScore === 'number' && isFinite(rubricsBucket.totalScore)
            ? rubricsBucket.totalScore
            : 0;
        const fallbackWeight =
          typeof rubricsBucket.totalWeight === 'number' && rubricsBucket.totalWeight > 0
            ? rubricsBucket.totalWeight
            : 0;
        overallScore0to100 = fallbackWeight > 0 ? (fallbackTotal / fallbackWeight) * 100 : 0;
        this.logger.warn(
          `[createReportWithAI] rubricMax=0 – no rubric items matched scenario.grading.rubric. ` +
            `Falling back to rubrics.totalScore=${fallbackTotal} / totalWeight=${fallbackWeight} → ${overallScore0to100.toFixed(1)}%`,
        );
      }

      // Respect scenario.grading.maxScore if admin changed the maximum (default 100)
      const grading = scenario.grading;
      const gradingMaxScore =
        typeof grading?.maxScore === 'number' && grading.maxScore > 0 ? grading.maxScore : 100;

      const overallScore = Number(((overallScore0to100 / 100) * gradingMaxScore).toFixed(2));

      const performanceLabel = this.getPerformanceCategory(overallScore0to100);

      const dynamicReport = {
        id: `report-${Date.now()}`,
        key: os.userInfo().username,
        userId: dto.userId,
        studentName: dto.studentName,
        student_id: dto.student_id,
        studentClass: dto.studentClass,
        scenarioId: dto.scenarioId,
        scenarioTitle: scenario.title,
        transcriptId: dto.transcriptId,
        scenarioStartTime: new Date(scenarioStart).toISOString(),
        scenarioEndTime: dto.scenarioEndTime,
        totalTimeSeconds: dto.totalTimeSeconds,
        commonActionTracker: dto.commonActionTracker,
        mode: dto.mode ?? 'Assessment',
        // Use AI-generated dynamic values
        score: overallScore,
        performanceLabel: performanceLabel,
        scoreJson: {
          // Derive component scores (1–5) and labels from percentage performance
          communication: rubricMax > 0 ? Math.round((rubricPoints / rubricMax) * 5) : 1,
          communicationLabel: this.getPerformanceCategory(
            rubricMax > 0 ? (rubricPoints / rubricMax) * 100 : 0,
          ),
          clinicalJudgment: rubricMax > 0 ? Math.round((rubricPoints / rubricMax) * 5) : 1,
          clinicalJudgmentLabel: this.getPerformanceCategory(
            rubricMax > 0 ? (rubricPoints / rubricMax) * 100 : 0,
          ),
          technicalAccuracy: rubricMax > 0 ? Math.round((rubricPoints / rubricMax) * 5) : 1,
          technicalAccuracyLabel: this.getPerformanceCategory(
            rubricMax > 0 ? (rubricPoints / rubricMax) * 100 : 0,
          ),
          ethicalCompetence: rubricMax > 0 ? Math.round((rubricPoints / rubricMax) * 5) : 1,
          ethicalCompetenceLabel: this.getPerformanceCategory(
            rubricMax > 0 ? (rubricPoints / rubricMax) * 100 : 0,
          ),
          reflection: rubricMax > 0 ? Math.round((rubricPoints / rubricMax) * 5) : 1,
          reflectionLabel: this.getPerformanceCategory(
            rubricMax > 0 ? (rubricPoints / rubricMax) * 100 : 0,
          ),
          overallScore: overallScore,
          overallLabel: performanceLabel,
          // Expose raw points for debugging / UI if needed
          rubricsTotal: rubricPoints,
        },
        summary: aiAnalysis.overall?.summary ?? 'Assessment completed',
        summaryEntries: dto.summaryEntries,
        summaryByCategory: {
          ...dto.summaryByCategory,
          actions: (() => {
            type ActionEntry = Record<string, unknown>;

            const rawActions = (dto.summaryByCategory as Record<string, unknown>)?.['actions'];
            const actionsArray: ActionEntry[] = Array.isArray(rawActions)
              ? (rawActions as ActionEntry[]).map((item) => ({ ...item, category: 'actions' }))
              : [];

            // Calculate scenario start time (epoch ms) for computing elapsed times
            const scenarioStartMs =
              typeof dto.scenarioStartTime === 'string' && dto.scenarioStartTime.trim().length > 0
                ? new Date(dto.scenarioStartTime).getTime()
                : undefined;

            this.logger.debug(
              `[enrichedActionsArray] dto.scenarioStartTime: "${dto.scenarioStartTime}", parsed scenarioStartMs: ${scenarioStartMs}`,
            );

            // Enrich action entries with per-attempt correctness and timing from actionsTimeline
            // Each action entry should have its individual `correct` field preserved,
            // not the aggregated best-attempt-wins result
            this.logger.debug(
              `[enrichedActionsArray] Processing ${actionsArray.length} actions, actionsTimeline length: ${Array.isArray(dto.actionsTimeline) ? dto.actionsTimeline.length : 'N/A'}`,
            );
            const enrichedActionsArray = actionsArray.map((actionEntry, index) => {
              const entry = actionEntry as { title?: string; [key: string]: unknown };

              this.logger.debug(
                `[enrichedActionsArray] Processing action index ${index}: title="${String(entry.title)}", existing elapsedTime="${String(entry.elapsedTime)}", existing timestampValue="${String(entry.timestampValue)}"`,
              );

              // Find the corresponding entry in actionsTimeline (by index/order)
              // The timeline entries are in the same order as summary entries
              if (Array.isArray(dto.actionsTimeline) && index < dto.actionsTimeline.length) {
                const timelineEntry = dto.actionsTimeline[index];
                const timelineData = timelineEntry as {
                  correct?: boolean;
                  grading?: boolean | number;
                  completedAtValue?: number;
                  completedAtRealValue?: number;
                  timestampValue?: number;
                  durationSeconds?: number;
                  [key: string]: unknown;
                };

                this.logger.debug(
                  `[enrichedActionsArray] index: ${index}, timelineData.timestampValue: ${timelineData.timestampValue}, completedAtRealValue: ${timelineData.completedAtRealValue}, completedAtValue: ${timelineData.completedAtValue}`,
                );

                // Build enriched entry preserving original fields
                const enriched: { [key: string]: unknown } = { ...entry };

                // Use real wall-clock ms for elapsed calculation. Priority order:
                //   1. completedAtRealValue � explicitly named real time (future-proof)
                //   2. timestampValue � set by frontend as completedAtRealValue || startedAtRealValue
                //   3. Skip recalculation � completedAtValue is SIMULATED clock time and must
                //      never be used here: when a scenario date in Oct/Nov/Dec is configured
                //      it sits months ahead of the real session start, producing values like 246766:03.
                const realCompletedMs: number | undefined =
                  typeof timelineData.completedAtRealValue === 'number'
                    ? timelineData.completedAtRealValue
                    : typeof timelineData.timestampValue === 'number'
                      ? timelineData.timestampValue
                      : undefined;

                if (realCompletedMs !== undefined && scenarioStartMs !== undefined) {
                  // Handle both milliseconds and seconds format
                  const completedAtMs =
                    realCompletedMs > 10000000000 ? realCompletedMs : realCompletedMs * 1000;

                  const elapsedSeconds = Math.round((completedAtMs - scenarioStartMs) / 1000);

                  // Only use recalculated values if they're sensible (non-negative)
                  if (elapsedSeconds >= 0) {
                    enriched.elapsedSeconds = elapsedSeconds;
                    enriched.timestampValue = completedAtMs;

                    // Format as mm:ss
                    const minutes = Math.floor(elapsedSeconds / 60);
                    const seconds = elapsedSeconds % 60;
                    enriched.elapsedTime = `${minutes}:${String(seconds).padStart(2, '0')}`;

                    this.logger.debug(
                      `[enrichedActionsArray] Action: "${String(entry.title)}", completedAtMs: ${completedAtMs}, scenarioStartMs: ${scenarioStartMs}, elapsedSeconds: ${elapsedSeconds}, elapsedTime: ${String(enriched.elapsedTime)}`,
                    );
                  } else {
                    this.logger.warn(
                      `[enrichedActionsArray] SKIPPED negative elapsed for Action: "${String(entry.title)}" (elapsedSeconds: ${elapsedSeconds}). Keeping original elapsedTime: ${String(entry.elapsedTime)}`,
                    );
                  }
                } else {
                  // No real-time value available � keep the elapsedTime already on the entry
                  // (set correctly by the frontend). Do NOT fall back to completedAtValue.
                  this.logger.debug(
                    `[enrichedActionsArray] No real timestamp for action index ${index} ("${String(entry.title)}") � keeping existing elapsedTime: ${String(entry.elapsedTime)}`,
                  );
                }

                // Copy the individual attempt's correctness if it exists in timeline.
                // For vital-type actions the `grading` field is always stored as `false`
                // by the simulation engine regardless of whether the student recorded
                // report and cause "Unsatisfactory" to appear on completed vital entries.
                const rawEntryType =
                  (entry as { type?: unknown }).type ?? timelineData.type ?? '';
                const entryType = (
                  typeof rawEntryType === 'string'
                    ? rawEntryType
                    : typeof rawEntryType === 'number'
                      ? String(rawEntryType)
                      : ''
                ).toLowerCase();
                const isVitalEntry = entryType === 'vital' || entryType === 'vital-signs';

                if (timelineData.correct !== undefined) {
                  enriched.correct = timelineData.correct;
                } else if (!isVitalEntry && timelineData.grading !== undefined) {
                  // Fallback: check the grading field (non-vital actions only)
                  const isCorrect = timelineData.grading === true || timelineData.grading === 1;
                  enriched.correct = isCorrect;
                }
                // For vital entries with no explicit `correct` field, leave `correct`
                // unset � the frontend suppresses the badge when correct is undefined.

                return enriched;
              } else {
                this.logger.debug(
                  `[enrichedActionsArray] No timeline entry found for action index ${index} (actionsTimeline length: ${Array.isArray(dto.actionsTimeline) ? dto.actionsTimeline.length : 0})`,
                );
              }

              return entry;
            });

            const updatedActionsArray: ActionEntry[] = [...enrichedActionsArray];

            this.logger.debug(
              `[enrichedActionsArray] Final updatedActionsArray: ${JSON.stringify(
                updatedActionsArray.map((a) => ({
                  title: (a as { title?: string })?.title,
                  elapsedTime: (a as { elapsedTime?: string })?.elapsedTime,
                  elapsedSeconds: (a as { elapsedSeconds?: number })?.elapsedSeconds,
                  timestampValue: (a as { timestampValue?: number })?.timestampValue,
                })),
              )}`,
            );

            // Check if Team Communication entry already exists from frontend (student attempted it)
            const hasTeamCommAttempt = updatedActionsArray.some(
              (item) => (item as { title?: string })?.title === 'Team Communication',
            );

            // If Team Communication is enabled and not already in the array:
            // - Add an entry with the actual evaluation result (Satisfactory/Unsatisfactory)
            // - Use the backend evaluation result (teamCommunicationStatus)
            if (teamCommunicationEnabled && !hasTeamCommAttempt && teamCommunicationStatus) {
              updatedActionsArray.push({
                title: 'Team Communication',
                details: `Result: ${teamCommunicationStatus}`,
                category: 'actions',
              });
            }

            return updatedActionsArray;
          })(),
        },
        feedback:
          aiAnalysis.overall?.feedback ?? aiAnalysis.overall?.summary ?? 'Assessment completed',
        communicationAssessment: isCommunicationEnabled ? communicationAssessment : undefined,
        // Save rubrics summaries
        rubricsSummary: aiAnalysis.rubrics?.overallSummary ?? '',
        rubricsTotal: rubricPoints,
        debriefReflection: dto.debriefReflection,

        //
        // ACTION SCORING WITH RUBRIC WEIGHTS & CATEGORIZED DETAILS
        //
        actionScores: actionScores.scoreByCategory,
        actionSummary: actionScores.actionSummary,

        // Separated action details for report display
        mandatoryActions: actionScores.mandatoryActionDetails,
        optionalActions: actionScores.optionalActionDetails,
        distractorActions: actionScores.distractorActionDetails,

        createdAt: new Date().toISOString(),
      };

      // Persist safely (refresh + merge + flush) to avoid 404 right after create
      await this.jsonDataService.addReportFresh(dynamicReport as unknown as Report);

      this.logger.log('Report saved with ID:', dynamicReport.id);

      // Emit Grading.Stopped event (success)
      try {
        if (transcript.sessionId) {
          const gradingDurationMs = Date.now() - gradingStartTime;
          this.lifecycleTelemetry.emitGradingStopped({
            sessionId: transcript.sessionId,
            transcriptId: dto.transcriptId,
            gradingInstanceId,
            durationMs: gradingDurationMs,
            stopReason: SubsystemStopReason.Completed,
            score: dynamicReport.score,
            reportId: dynamicReport.id,
            studentId: dto.student_id,
            schemaVersion: LIFECYCLE_SCHEMA_VERSION,
          });
        }
      } catch (error) {
        this.logger.warn(`Failed to emit Grading.Stopped: ${error}`);
      }

      return dynamicReport as unknown as Report;
    } catch (error) {
      this.logger.error('AI analysis failed:', error);

      // Emit Grading.Stopped event (error)
      try {
        if (transcript?.sessionId) {
          const gradingDurationMs = Date.now() - gradingStartTime;
          const errorMessage =
            error instanceof Error ? error.message : String(error) || 'Unknown error';
          this.lifecycleTelemetry.emitGradingStopped({
            sessionId: transcript.sessionId,
            transcriptId: dto.transcriptId,
            gradingInstanceId,
            durationMs: gradingDurationMs,
            stopReason: SubsystemStopReason.Error,
            errorCode: errorMessage,
            studentId: dto.student_id,
            schemaVersion: LIFECYCLE_SCHEMA_VERSION,
          });
        }
      } catch (telemetryError) {
        this.logger.warn(`Failed to emit Grading.Stopped: ${telemetryError}`);
      }

      throw new Error('Failed to analyze transcript with AI');
    }
  }

  private enrichCommunicationAssessment(aiAnalysis: unknown): unknown {
    const analysis = (aiAnalysis ?? {}) as Record<string, unknown>;

    const rubrics = analysis.rubrics as RubricsContainer | undefined;
    if (!rubrics?.items) {
      return analysis;
    }

    // Recalculate totals for rubrics
    const recalcTotals = (bucket: RubricsContainer | undefined) => {
      if (!bucket?.items) {
        return;
      }

      const values = Object.values(bucket.items);
      let totalWeight = 0;
      let totalWeightedScore = 0;

      values.forEach((item) => {
        const weight = typeof item.weight === 'number' ? item.weight : Number(item.weight ?? 0);
        if (item.score === null || item.score === undefined) {
          item.weightedScore = undefined;
          return;
        }
        const score = typeof item.score === 'number' && !isNaN(item.score) ? item.score : 0;
        const maxScore =
          typeof item.maxScore === 'number' && item.maxScore > 0 ? item.maxScore : 10;

        const weightedScore = maxScore > 0 ? (score / maxScore) * weight : 0;

        item.weight = weight;
        item.maxScore = maxScore;
        item.weightedScore = weightedScore;

        totalWeight += weight;
        totalWeightedScore += weightedScore;
      });

      bucket.totalWeight = totalWeight;
      bucket.totalScore = Number(totalWeightedScore.toFixed(2));
    };

    recalcTotals(rubrics);

    return analysis;
  }

  private generateSBARSummaries(sbarResult: {
    score: number;
    passed: boolean;
    flagged: boolean;
    results: Array<{ concept: string; status: string; evidence: string }>;
  }): {
    summary: string;
    strengths: Array<{ point: string; evidence: string }>;
    weaknesses: Array<{ point: string; evidence: string }>;
    recommendations: Array<string>;
  } {
    const results = sbarResult.results ?? [];
    const strengths: Array<{ point: string; evidence: string }> = [];
    const weaknesses: Array<{ point: string; evidence: string }> = [];
    const recommendations: Array<string> = [];

    // Map concept labels for user-friendly output
    const conceptLabels: Record<string, string> = {
      introduces_self: 'Introduces Self',
      explains_situation: 'Explains Situation',
      provides_background: 'Provides Background',
      provides_assessment: 'Provides Assessment',
      provides_recommendation: 'Provides Recommendation',
    };

    // Process each SBAR concept result
    results.forEach((result) => {
      const conceptLabel = conceptLabels[result.concept] || result.concept;
      const status = (result.status ?? '').toLowerCase();

      if (status === 'satisfied') {
        strengths.push({
          point: `Effectively ${conceptLabel.toLowerCase()}`,
          evidence: result.evidence || 'Demonstrated clear understanding of this SBAR component',
        });
      } else if (status === 'partially_satisfied') {
        weaknesses.push({
          point: `Incomplete ${conceptLabel.toLowerCase()}`,
          evidence: result.evidence || 'Only partially addressed this SBAR component',
        });
        recommendations.push(
          `Expand on "${conceptLabel}" to provide more complete information in future communications`,
        );
      } else if (status === 'not_satisfied') {
        weaknesses.push({
          point: `Missing ${conceptLabel.toLowerCase()}`,
          evidence: result.evidence || 'Did not address this SBAR component',
        });
        recommendations.push(
          `Always include "${conceptLabel}" when communicating clinical information using SBAR format`,
        );
      } else if (status === 'contradicted') {
        weaknesses.push({
          point: `Contradictory information in ${conceptLabel.toLowerCase()}`,
          evidence: result.evidence || 'Provided conflicting information in this component',
        });
        recommendations.push(
          `Review "${conceptLabel}" carefully to ensure consistency and accuracy in clinical communication`,
        );
      }
    });

    // Generate overall summary based on score
    let summary = '';
    if (sbarResult.score >= 80) {
      summary = `Excellent SBAR communication with a score of ${sbarResult.score}%. Student demonstrated strong proficiency in structured clinical handoff communication.`;
    } else if (sbarResult.score >= 60) {
      summary = `Good SBAR communication with a score of ${sbarResult.score}%. Student demonstrated adequate proficiency in structured clinical handoff, with some areas for improvement.`;
    } else if (sbarResult.score >= 40) {
      summary = `Fair SBAR communication with a score of ${sbarResult.score}%. Student has fundamental understanding of SBAR but needs significant improvement in several components.`;
    } else {
      summary = `Needs improvement in SBAR communication with a score of ${sbarResult.score}%. Student should focus on learning the structured SBAR format for clinical handoff.`;
    }

    // Add recommendation for overall improvement if needed
    if (sbarResult.score < 50) {
      recommendations.push(
        'Review SBAR framework and practice structured clinical communication with peers or mentors',
      );
    }

    return {
      summary,
      strengths:
        strengths.length > 0 ? strengths : [{ point: 'SBAR attempt documented', evidence: '' }],
      weaknesses:
        weaknesses.length > 0
          ? weaknesses
          : [{ point: 'All SBAR components covered', evidence: '' }],
      recommendations:
        recommendations.length > 0
          ? recommendations
          : ['Continue to refine SBAR communication in future clinical scenarios'],
    };
  }

  private async analyzeWithOpenAI(
    conversationText: string,
    summaryByCategory?: StudentSummary,
    scenario?: Scenario,
    scenarioStartTime?: string,
    actionsTimeline?: EnrichedMessage[],
    commonActionTracker?: Record<string, unknown> | EnrichedMessage[],
    mode: 'Practice' | 'Assessment' = 'Assessment',
    _transcript?: unknown,
    summaryEntries?: ActionAttempt[],
    language: 'en' | 'es' = 'en',
  ): Promise<CommunicationAssessment> {
    const openaiApiKey = this.configService.get<string>('OPENAI_API_KEY');
    this.logger.debug(JSON.stringify([summaryByCategory]));
    this.logger.debug(JSON.stringify([actionsTimeline]));
    this.logger.debug('convo', conversationText);
    this.logger.debug([commonActionTracker], 'commonActionTracker');

    if (!openaiApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    // Extract all rubric items from the scenario
    const rubricItems: ScenarioRubricItem[] = Array.isArray(scenario?.grading?.rubric)
      ? scenario.grading.rubric
      : [];

    // Separate soft skills and technical skills
    const softSkillItems = rubricItems.filter((item) => item?.categoryType === 'Soft Skill');
    const technicalSkillItems = rubricItems.filter(
      (item) => item?.categoryType === 'Technical Skill' || item?.categoryType !== 'Soft Skill',
    );

    // Prepare AI-evaluated rubric items (for soft skills and technical skills with AI evaluation)
    const aiRubricItems = rubricItems
      .filter(
        (item) =>
          (item?.evaluationSource === 'AI' || item?.evaluationSource === 'Combined') &&
          item?.aiMapping?.aiCheckId,
      )
      .map((item) => ({
        id: String(item.id ?? item.aiMapping?.aiCheckId),
        aiCheckId: String(item.aiMapping?.aiCheckId),
        name: String(item.name ?? item.subCategory ?? ''),
        categoryType: String(item.categoryType ?? ''),
        subCategory: String(item.subCategory ?? ''),
        weight: typeof item.weight === 'number' ? item.weight : (Number(item.weight) || 0),
        scoringModel: String(item.scoringModel ?? 'Graded'),
        evaluationSource: String(item.evaluationSource ?? 'AI'),
        aiDescription: String(item.aiMapping?.aiDescription ?? ''),
        aiPromptParameter: String(item.aiMapping?.aiPromptParameter ?? ''),
        // Include technical skill specific configurations
        vitalsFields: item.vitalsFields ?? [],
        expectedActions: item.expectedActions ?? [],
        patientDataFields: item.patientDataFields ?? [],
      }));

    // Extract technical skill configurations
    /* const _learningObjectivesItem = */ technicalSkillItems.find(
      (item) => item?.subCategory === 'Learning Objectives',
    );
    const patientDataCoverageItem = technicalSkillItems.find(
      (item) => item?.subCategory === 'Patient Data Coverage',
    );
    const vitalsItem = technicalSkillItems.find((item) => item?.subCategory === 'Vitals');
    const expectedActionsItem = technicalSkillItems.find(
      (item) => item?.subCategory === 'Expected Actions',
    );
    const medicationsItem = technicalSkillItems.find((item) => item?.subCategory === 'Medications');
    const actionItem = technicalSkillItems.find(
      (item) =>
        item?.subCategory === 'Action' || item?.subCategory === 'Action / Clinical Interventions',
    );
    const timelineItem = technicalSkillItems.find((item) => item?.subCategory === 'Timeline');
    const _documentationItem = technicalSkillItems.find(
      (item) =>
        String(item?.subCategory || '')
          .trim()
          .toLowerCase() === 'documentation',
    );

    // Keep track of IDs for deterministic overrides to prevent duplicates
    const deterministicIds = {
      expectedActions: expectedActionsItem
        ? String(expectedActionsItem.id ?? expectedActionsItem.aiMapping?.aiCheckId ?? '')
        : '',
      action: actionItem ? String(actionItem.id ?? actionItem.aiMapping?.aiCheckId ?? '') : '',
      timeline: timelineItem
        ? String(timelineItem.id ?? timelineItem.aiMapping?.aiCheckId ?? '')
        : '',
      medications: medicationsItem
        ? String(medicationsItem.id ?? medicationsItem.aiMapping?.aiCheckId ?? '')
        : '',
    };

    // Get student summary data by category - filter to only include configured subcategories
    const studentSummary = summaryByCategory ?? {};
    const filteredStudentSummary: Record<string, unknown> = {};

    // Only include summary data for configured subcategories
    const configuredSubCats = technicalSkillItems
      .map((item) => item.subCategory)
      .map((subCat) => subCat?.toLowerCase())
      .filter(Boolean);
    this.logger.debug({ configuredSubCats }, 'configuredSubCats');

    if (configuredSubCats.includes('vitals') && studentSummary.vitals) {
      filteredStudentSummary.vitals = studentSummary.vitals;
    }
    if (configuredSubCats.includes('medications') && studentSummary.medications) {
      filteredStudentSummary.medications = studentSummary.medications;
    }
    if (configuredSubCats.includes('expected actions') && studentSummary.actions) {
      filteredStudentSummary.actions = studentSummary.actions;
    }
    if (configuredSubCats.includes('patient data coverage') && studentSummary.patientData) {
      filteredStudentSummary.patientData = studentSummary.patientData;
    }
    if (
      (configuredSubCats.includes('action') ||
        configuredSubCats.includes('action / clinical interventions')) &&
      studentSummary.actions
    ) {
      filteredStudentSummary.actions = studentSummary.actions;
    }
    if (configuredSubCats.includes('follow-up') && studentSummary.followUp) {
      filteredStudentSummary.followUp = studentSummary.followUp;
    }
    if (configuredSubCats.includes('assessment narrative') && studentSummary.assessmentNarrative) {
      filteredStudentSummary.assessmentNarrative = studentSummary.assessmentNarrative;
    }

    const studentSummaryText = JSON.stringify(filteredStudentSummary, null, 2);

    // Get teacher-defined learning objectives
    const learningObjectives = Array.isArray(scenario?.learningObjective)
      ? scenario.learningObjective
      : scenario?.learningObjective
        ? [scenario.learningObjective]
        : [];

    // Get teacher-defined required vitals
    const requiredVitals = vitalsItem?.vitalsFields ?? [];

    // Get admin-defined expected actions
    const expectedActions = scenario?.expectedActions ?? {};
    const expectedActionsList = expectedActionsItem?.expectedActions ?? [];

    // Get unit actions (pre-defined correct answers)
    const unit = scenario ? this.jsonDataService.getUnitById(scenario.unitId) : null;
    const unitActions = unit?.actions ?? [];

    // Get patient data fields for Patient Data Coverage
    const _patientDataFields = patientDataCoverageItem?.patientDataFields ?? [];

    // PRE-COMPUTED (DETERMINISTIC) ANALYSIS FOR ALL TECHNICAL SKILLS
    // Patient Data Coverage: Let OpenAI analyze from transcript
    // Everything else: Deterministic backend analysis

    const vitalsAnalysis = this.computeVitalsAnalysisFromSummary(
      studentSummary,
      requiredVitals,
      scenarioStartTime,
      actionsTimeline,
    );
    this.logger.debug('vitalsAnalysis', JSON.stringify(vitalsAnalysis));

    const actionsAnalysis = this.computeActionsAnalysisFromSummary(
      studentSummary as unknown as ActionStudentSummaryLike,
      expectedActions,
      expectedActionsList as unknown as Array<{ name?: string; title?: string }>,
      unitActions,
    );

    const timelineAnalysis = computeTimelineAnalysis(
      actionsTimeline ?? [],
      scenario?.timeline?.blocks ?? [],
      scenarioStartTime,
      (seconds: number): string => this.formatSecondsToTime(seconds),
      studentSummary,
      commonActionTracker,
      // Array.isArray(transcript?.messages) ? transcript.messages : [],
      (scenario?.timeline?.sequenceChain ?? []) as string[],
    );
    this.logger.debug('timelineAnalysis', JSON.stringify(timelineAnalysis));

    // Get all scenario actions for grading
    let actionsToGrade = (scenario?.actions ?? []) as unknown as ScenarioActionLike[];

    // DEBUG: Log raw scenario actions before filtering
    this.logger.debug('=== RAW SCENARIO ACTIONS ===');
    actionsToGrade.forEach((action, idx) => {
      this.logger.debug(
        `Raw action ${idx}: title="${action.title}", isOptional=${action.isOptional}, typeRequirement="${action.typeRequirement}"`,
      );
    });
    this.logger.debug('=== END RAW SCENARIO ACTIONS ===');

    // Filter to only mandatory, optional, and distractor actions (exclude truly excluded actions)
    // Distractor actions (typeRequirement === 'distractor' OR isExcluded without typeRequirement)
    // are kept so they can be detected and shown in the report, but computeDeterministicActionMarks
    // excludes them from scoring.
    if (actionItem) {
      actionsToGrade = actionsToGrade.filter((a) => {
        const isDistractor =
          a.typeRequirement?.toLowerCase() === 'distractor' ||
          (a.isExcluded === true && !a.typeRequirement); // backwards compatibility
        if (isDistractor) {
          return true;
        } // handled in computeDeterministicActionMarks
        const isExcluded = a.isExcluded === true || a.typeRequirement?.toLowerCase() === 'exclude';
        return !isExcluded;
      });
    }

    const expectedActionMarks = await this.computeDeterministicActionMarks(
      (actionsTimeline ?? []) as unknown as ActionAttempt[],
      actionsToGrade,
      mode,
      studentSummary as Parameters<
        ActionsInterventionsService['computeDeterministicActionMarks']
      >[3],
    );
    this.logger.debug('expectedActionMarks', JSON.stringify(expectedActionMarks));

    // --- PRE-RECONCILE VITAL ACTION DETAILS -----------------------------------
    // evaluateActionAttempt can return false for vitals when the actionsTimeline
    // attempt lacks a full vitals object, while generateVitalActionFeedback has
    // richer summaryByCategory fallback logic and is the authoritative source.
    // Fix firstAttemptCorrect / anyAttemptCorrect / isCorrect for vital actions
    // BEFORE the data is embedded in the AI prompt, so the AI generates correct
    // criteriaResults and summary text.
    const preVitalFeedback = this.generateVitalActionFeedback(
      (actionsTimeline ?? []) as unknown as ActionAttempt[],
      (scenario?.actions ?? []) as ScenarioActionDef[],
      summaryByCategory as SummaryByCategoryLike | undefined,
      summaryEntries ?? [],
    );
    const preVitalCorrectTitles = new Set(
      preVitalFeedback.strengths.map((s) =>
        s.point.replace(/^Correctly performed vital signs action "(.+)"$/, '$1').toLowerCase(),
      ),
    );
    expectedActionMarks.details = expectedActionMarks.details.map((d) => {
      if (String(d.type ?? '').toLowerCase() !== 'vital') {
        return d;
      }
      const isCorrect = preVitalCorrectTitles.has((d.title ?? '').toLowerCase());
      return {
        ...d,
        isCorrect,
        firstAttemptCorrect: isCorrect,
        anyAttemptCorrect: isCorrect,
        pointsAwarded: isCorrect && !d.isOptional ? 1 : 0,
      };
    });
    // Recount positiveActions after reconciliation
    expectedActionMarks.positiveActions = expectedActionMarks.details.filter(
      (d) =>
        d.isCorrect === true &&
        d.isOptional !== true &&
        String(d.type ?? '').toLowerCase() !== 'distractor',
    ).length;
    // --------------------------------------------------------------------------

    // --- AI-BASED PPE SCORE ----------------------------------------------------
    // Both the conversation transcript AND the action log are sent to OpenAI.
    // An item is detected if EITHER source provides evidence.
    // Formula: (Detected mandatory PPE � Total mandatory PPE) � 100
    const rawTracker = commonActionTracker;
    const normalizedActionLog: Array<{ label: string; timestamp: string; type: string }> =
      Array.isArray(rawTracker)
        ? (rawTracker as unknown as Array<{ label: string; timestamp: string; type: string }>)
        : Array.isArray((rawTracker as Record<string, unknown>)?.actionLog)
          ? ((rawTracker as Record<string, unknown>).actionLog as Array<{
              label: string;
              timestamp: string;
              type: string;
            }>)
          : [];

    const ppeAnalysis = this.computePPEScore(
      expectedActionsItem?.checklistItems ?? [],
      conversationText,
      normalizedActionLog,
    );
    this.logger.debug('ppeAnalysis', JSON.stringify(ppeAnalysis));

    // -- SEQUENCING & PRIORITIZATION: deterministic evaluation ------------------
    // Extract enriched transcript messages for sequencing evaluation.
    const seqTranscriptMessages: TranscriptMessage[] = Array.isArray(
      (_transcript as { messages?: TranscriptMessage[] } | undefined)?.messages,
    )
      ? ((_transcript as { messages?: TranscriptMessage[] }).messages ?? [])
      : [];

    // Merge common action log entries into actionsTimeline so the sequencing
    // service can resolve refs that point to PPE / privacy / environmental actions
    // (e.g. "Ppe Knock", "Ppe OpenDoor").  Common actions are tracked separately
    // from the actionsTimeline so we normalise them here before the sequencing call.
    const rawCommonActionLog: Array<Record<string, unknown>> = Array.isArray(
      (commonActionTracker as Record<string, unknown>)?.actionLog,
    )
      ? ((commonActionTracker as Record<string, unknown>).actionLog as Array<
          Record<string, unknown>
        >)
      : Array.isArray(commonActionTracker)
        ? commonActionTracker
        : [];

    const seqActionsTimeline: SequencingEnrichedEntry[] = [
      ...((actionsTimeline as SequencingEnrichedEntry[]) ?? []),
      ...rawCommonActionLog.map((entry) => ({
        ...entry,
        // Expose label as both 'title' (for alias matching) and 'id' (for exact ID
        // matching when the admin uses the exact label as the sequence ref).
        id:
          typeof entry.id === 'string'
            ? entry.id
            : typeof entry.label === 'string'
              ? entry.label
              : undefined,
        title: typeof entry.label === 'string' ? entry.label : undefined,
        // Use the real wall-clock timestamp for relative ordering.
        timestampValue: typeof entry.timestampMs === 'number' ? entry.timestampMs : undefined,
        // Leave elapsedSeconds undefined if not present - will be calculated from timestampValue
        elapsedSeconds: typeof entry.elapsedSeconds === 'number' ? entry.elapsedSeconds : undefined,
        elapsedTimeFormatted: typeof entry.elapsedTime === 'string' ? entry.elapsedTime : '',
      })),
    ];

    const sequencingEvaluation = await this.sequencingService.evaluateSequencingPrioritization(
      scenario,
      seqTranscriptMessages,
      studentSummary,
      (summaryEntries ?? []) as Array<Record<string, unknown>>,
      seqActionsTimeline,
      scenarioStartTime,
    );
    this.logger.debug('sequencingEvaluation', JSON.stringify(sequencingEvaluation));

    // Build a concise sequence definitions summary for the AI
    const sequenceDefinitions = Array.isArray(scenario?.sequences) ? scenario.sequences : [];
    const sequenceDefinitionsSummary = sequenceDefinitions.map((seq) => ({
      parentRef: seq.parentRef,
      assessmentMethod: seq.assessmentMethod ?? 'patientInformationUpdated',
      orderControl: seq.orderControl ?? 'flexible',
      timing: seq.timing ?? null,
      before: (Array.isArray(seq.before) ? seq.before : []).map((r) => r.ref),
      after: (Array.isArray(seq.after) ? seq.after : []).map((r) => r.ref),
    }));

    // Pre-build the full sequencing analysis � AI only writes prose, never re-analyzes
    const seqPassedParents = sequencingEvaluation.parentResults.filter((p) => p.passed);
    const seqFailedParents = sequencingEvaluation.parentResults.filter((p) => !p.passed);

    // Build rich detail strings per step so AI has everything it needs to write prose
    const _seqStepsForNarrative = sequencingEvaluation.parentResults.map((p) => {
      const label = p.parentLabel ?? p.parentRef;
      const facts: string[] = [];
      if (p.passed) {
        if (p.beforePassed) {
          facts.push('all required preparatory steps were completed before this step');
        }
        if (p.afterPassed) {
          facts.push('all required follow-up steps were completed after this step');
        }
        if (p.timingPassed) {
          facts.push('timing requirements were met');
        }
        if (facts.length === 0) {
          facts.push('all sequencing conditions were met');
        }
      } else {
        if (!p.assessmentPassed) {
          facts.push(`"${label}" was never completed during the session`);
        }
        if (!p.beforePassed) {
          facts.push(
            'required preparatory steps were skipped or performed out of order before this step',
          );
        }
        if (!p.afterPassed) {
          facts.push('required follow-up steps were not completed after this step');
        }
        if (!p.timingPassed) {
          facts.push(
            'preparatory steps were not completed within the required time window before this step',
          );
        }
        if (facts.length === 0) {
          facts.push('sequencing conditions were not met');
        }
      }
      return { step: label, result: p.passed ? 'PASSED' : 'FAILED', facts };
    });

    const seqPassedList =
      seqPassedParents.map((p) => `"${p.parentLabel ?? p.parentRef}"`).join(', ') || 'none';
    const seqFailedList =
      seqFailedParents.map((p) => `"${p.parentLabel ?? p.parentRef}"`).join(', ') || 'none';
    const seqOverall =
      seqPassedParents.length === sequencingEvaluation.parentResults.length
        ? `All ${sequencingEvaluation.parentResults.length} configured step(s) PASSED.`
        : seqPassedParents.length === 0
          ? `All ${sequencingEvaluation.parentResults.length} configured step(s) FAILED.`
          : `${seqPassedParents.length} of ${sequencingEvaluation.parentResults.length} step(s) PASSED, ${seqFailedParents.length} FAILED.`;

    const sequencingInstructions = `
[!] ANALYSIS IS ALREADY DONE. Do NOT re-analyze. Do NOT use any other rubric data, transcript, PPE results, overall score, or actions. Your ONLY job is to write clinical narrative text for each entry below.

ADMIN-CONFIGURED SEQUENCES:
${JSON.stringify(sequenceDefinitionsSummary, null, 2)}

DETAILED EVALUATION RESULTS (USE THIS FOR YOUR NARRATIVE):
${JSON.stringify(sequencingEvaluation.parentResults, null, 2)}

PRE-GENERATED STRENGTHS (use these as reference, refine the examples if needed):
${JSON.stringify(sequencingEvaluation.strengths, null, 2)}

PRE-GENERATED WEAKNESSES (use these as reference, refine the examples if needed):
${JSON.stringify(sequencingEvaluation.weaknesses, null, 2)}

KEY DEFINITIONS FOR UNDERSTANDING THE RESULTS:
- assessmentPassed: Whether the main step was completed
- beforePassed: Whether all prerequisite steps were completed before the main step
- afterPassed: Whether all follow-up steps were completed after the main step
- orderPassed: Whether the sequence order was correct
- timingPassed: Whether timing requirements were met
- failedReasons: Detailed explanations of what went wrong
- detailedContext: Complete breakdown of each item's status and timing

OVERALL: ${seqOverall}
Passed steps: ${seqPassedList}
Failed steps: ${seqFailedList}

CRITICAL INSTRUCTION FOR WEAKNESSES:
For each FAILED step, you MUST read the failedReasons array and detailedContext object.
These contain specific, detailed explanations such as:
- "Item not completed"
- "Item completed but prerequisites not done"
- "Item completed, prerequisites done but in wrong sequence"
- "Prerequisites done outside the timing window"
- "Group items not in strict order"
- "Items interspersed in strict mode group"

Use these detailed reasons to write SPECIFIC, ACTIONABLE examples that help the student understand:
1. WHAT they did wrong
2. WHEN it happened (with timestamps from detailedContext)
3. WHY it's wrong (the requirement they violated)
4. WHAT they should have done instead

WRITE THE FOLLOWING � one entry per step:

strengths ? Use the PRE-GENERATED STRENGTHS as a starting point. You may refine the examples to be more clinical and specific:
  point = "Correctly sequenced: <step name>"
  example = 1�2 clinical sentences describing what the student did right.
           Include specific timing from detailedContext if available (e.g., "completed at 1:30")

weaknesses ? Use the PRE-GENERATED WEAKNESSES as a starting point. You may refine the examples to be more clinical and specific:
  point = "<step name>"
  example = Read the failedReasons array for this step. If the ONLY reason is that the item was not completed (e.g., "was not completed during the session"), then simply state that fact and STOP - do NOT add extra explanation about what the student should have done.
           For OTHER failures (sequencing violations, timing issues, order problems), be SPECIFIC about:
           - Which items were completed in wrong order (from failedReasons)
           - What the timing window was and what was outside it (from detailedContext.timingWindow)
           - What the correct sequence should have been
           Examples:
           - If only reason is "not completed": "Chief Complaint was not completed during the session."
           - If sequence violation: "The learner asked for the patient's name before completing required PPE steps. Specifically, 'Hand Hygiene' and 'Don Standard Gloves' were never completed, and 'Door Knocked' was completed AFTER asking the name (at 0:45 vs 0:30)."
           - If timing issue: "Prerequisites were completed outside the required 2-minute window. 'Check Blood Pressure' was completed at 3:15, which is outside the 0:00-2:00 window before 'Administer Medication' (completed at 2:00)."
           - If group order violation: "Group items were not in strict order. In Group A, 'Close Door' (at 0:20) was completed BEFORE 'Open Door' (at 0:30), violating the required sequence."

summary ? 1�2 concise sentences summarizing the strengths and weaknesses above:
  - Based ONLY on the strengths and weaknesses you just wrote
  - Use the EXACT step names from the strengths and weaknesses - DO NOT convert them to generic terms like "medication administration", "vital signs collection", etc.
  - Mention what was done correctly (from strengths) and what failed (from weaknesses)
  - Be specific about the types of failures: not completed, timing violations, or sequencing errors
  - Example (all failed): "All configured sequencing steps failed. Patient Name and Immediate Management were not completed, while Tab Paracetamol 500 mg and Initial Assessment Steps had timing violations for prerequisites."
  - Example (mixed): "The student successfully completed Obtain Vital Signs with proper sequencing and timing. However, Patient Name was not asked, and Initial Assessment Steps had a timing violation for the History of Present Illness prerequisite."
  - Example (all passed): "All sequencing and prioritization steps were completed successfully in the correct order and within required timing windows."
  - Do NOT mention PPE, documentation, communication, actions, or overall score

recommendations ? Use the PRE-GENERATED RECOMMENDATIONS: ${JSON.stringify(sequencingEvaluation.recommendations)}
  You may refine them to be more clinical and actionable if needed.
  If score is 100%, return ["No items identified."]

OUTPUT FORMAT (strict � follow exactly):
{
  "strengths": [{"point": "...", "example": "..."}],
  "weaknesses": [{"point": "...", "example": "..."}],
  "summary": "...",
  "recommendations": ["..."]
}`;
    // ---------------------------------------------------------------------------

    // Filter PPE analysis for AI: ONLY send mandatory items to prevent AI from generating
    // strengths for optional PPE items. The full ppeAnalysis is used later for deterministic override.
    const ppeAnalysisForAI = {
      ...ppeAnalysis,
      matchedItems: ppeAnalysis.matchedItems.filter(
        (m) => (m.status ?? 'Mandatory') === 'Mandatory',
      ),
      unmatchedItems: ppeAnalysis.unmatchedItems, // already filtered to mandatory only
    };
    // ────────────────────────────────────────────────────────────────────────

    const expectedActionsInstructions = expectedActionsItem
      ? `3. EXPECTED ACTIONS / PPE ASSESSMENT (if present in rubric):

     AI-DETECTED PPE SCORE (USE THIS - DO NOT OVERRIDE):
     ${JSON.stringify(ppeAnalysisForAI, null, 2)}

     DATA SOURCES:
     - PPE checklist items: Detected from the simulation transcript by AI
     - matchedItems: MANDATORY items the AI found evidence for (explicit or implicit)
     - unmatchedItems: MANDATORY items with no evidence in transcript
     - NOTE: Optional PPE items are tracked separately and do NOT affect score or appear in strengths

     SCORING RULES (MANDATORY):
     - The numeric score MUST be derived from ppeAnalysis.ppeScore.
     - Convert to maxScore: score = (ppeAnalysis.ppeScore / 100) x maxScore

     FEEDBACK RULES:
     - ppeAnalysis.matchedItems = Strengths (one per matched MANDATORY item; use matchedAction as evidence quote)
     - ppeAnalysis.unmatchedItems = Weaknesses (one per unmatched MANDATORY item)
     - CRITICAL: Do NOT create strengths for optional PPE items - they are tracked separately
     - RECOMMENDATIONS: If ppeAnalysis.ppeScore is 100%, state "No items identified." If below 100%, provide specific PPE/safety improvements.
     - Provide: strengths, weaknesses, recommendations, summary`
      : '';

    const documentationInstructions = this.buildDocumentationInstructions(
      studentSummary as Parameters<
        ClinicalDocumentationService['buildDocumentationInstructions']
      >[0],
      technicalSkillItems,
      scenario as Parameters<ClinicalDocumentationService['buildDocumentationInstructions']>[2],
    );

    const actionInstructions = actionItem
      ? `5. ACTION / CLINICAL INTERVENTIONS (if present in rubric): Analyze based on: 
     - Deterministic Action Scoring (MANDATORY): ${JSON.stringify(expectedActionMarks)}
     - ACTION CATEGORIES:
        * MANDATORY: Must be completed for points. Affects BOTH numerator (X) and denominator (Y) in score calculation.
        * OPTIONAL: Can be completed for recognition. Does NOT affect score calculation (neither X nor Y). Show in Strengths if completed, Weaknesses if missed.
        * DISTRACTOR: Should NOT be completed. If selected, show as "Inappropriate Action" in Weaknesses. Does NOT affect score calculation.
     - Grading Rules:
        1. Result Pick: Mark if correct, no mark if incorrect.
        2. Drag & Drop: Mark if order is correct, no mark if incorrect.
        3. Question & Response: Similarity check against ideal response.
        4. Observations: No marks for observation notes.
     - Mode: ${mode}
     
     CRITICAL - SCORING FORMULA (MANDATORY - DO NOT OVERRIDE OR RECALCULATE):
     The score has been DETERMINISTICALLY calculated by the backend. You MUST use this exact score:
     
        * X = ${expectedActionMarks.positiveActions} (mandatory actions completed correctly)
        * Y = ${expectedActionMarks.totalRequiredActions} (total mandatory actions)
        * Score = (X / Y) × 100 = ${expectedActionMarks.totalRequiredActions > 0 ? ((expectedActionMarks.positiveActions / expectedActionMarks.totalRequiredActions) * 100).toFixed(2) : 0}%
        
     DO NOT recalculate this score. DO NOT override this score based on your analysis.
     The backend has already evaluated each action deterministically.
     Your job is ONLY to provide feedback (strengths, weaknesses, recommendations, summary).
     
     DETAILED ACTION BREAKDOWN:
     ${JSON.stringify(expectedActionMarks.details, null, 2)}
     
     ACTION FEEDBACK RULES:
     - Include ALL action types in your feedback (vital, single, drag, result, question, ordering, etc.)
     - Vital actions are marked as mandatory or optional and should be treated like all other actions
     
     Use the 'isCorrect' field from each action detail above to determine strengths/weaknesses.
     If isCorrect=true AND not optional, add to strengths. If isCorrect=false AND not optional, add to weaknesses.
     
     - FEEDBACK RULES:
        * STRENGTHS: List all completed mandatory actions (including vital actions). Label optional completed actions as "Optional".
        * WEAKNESSES: List all missed mandatory actions (including vital actions). Do NOT list missed optional actions.
        * RECOMMENDATIONS: If score is 100%, state "No items identified." Otherwise, provide specific improvements for missed mandatory actions.
     - Provide: strengths, weaknesses, recommendations, and summary based on these rules.`
      : '';

    const timelineInstructions = (() => {
      if (!timelineItem || !scenario?.timeline?.blocks) {
        return '';
      }

      return `TIMELINE ASSESSMENT:
DETERMINISTIC TIMELINE ANALYSIS (USE THIS — DO NOT OVERRIDE):
${JSON.stringify(timelineAnalysis, null, 2)}

CRITICAL TIMING RULES: 
- check CONVERSATION TRANSCRIPT before analysing the patient data blocks which is for Ai analysis
- Block timing is in MINUTES (e.g., start: 0, duration: 1 means 0-60 seconds)
- actualTimeSeconds is in SECONDS (e.g., 18 means 18 seconds elapsed)
- withinTimeWindow is ALREADY CALCULATED - DO NOT recalculate or override
- If withinTimeWindow=true, the block was completed ON TIME
- If withinTimeWindow=false, the block was completed LATE or EARLY
- Use the deterministic status field: "Completed on time" | "Completed too early" | "Completed too late"
- SPECIAL CASE: If a block has "placement": "always", that means no timing restrictions - it can be asked anytime during the scenario and should always be considered "on time"

DATA SOURCES:
- Vitals blocks: From summaryByCategory.vitals with timing (DETERMINISTIC)
- Action blocks: From actionsTimeline with timing (DETERMINISTIC)
- Patient data blocks: REQUIRES YOUR AI ANALYSIS from conversation transcript
- Sequence validation: Prerequisites and followups checked (DETERMINISTIC)

PATIENT DATA BLOCKS TO ANALYZE:
${JSON.stringify(timelineAnalysis.patientDataBlocks, null, 2)}

SEQUENCE VIOLATIONS DETECTED:
${JSON.stringify(timelineAnalysis.sequenceViolations, null, 2)}

CRITICAL - PATIENT DATA ANALYSIS INSTRUCTIONS:
For EACH patient data block in patientDataBlocks array:
1. Read the CONVERSATION TRANSCRIPT provided above carefully
2. Determine if the student asked about this specific patient information
3. The student's question does NOT need to match the exact wording - analyze the MEANING
4. If the student asked about it (even with different words), find the FIRST message where they asked
5. EXTRACT THE elapsedSeconds VALUE DIRECTLY FROM THE RELEVANT MESSAGE - each message has an (elapsedSeconds: X) tag
6. BLOCK TIMING: expectedStartSeconds and expectedEndSeconds are ALREADY IN SECONDS (not minutes)
   - Example: expectedStartSeconds: 60, expectedEndSeconds: 120 means 60-120 seconds window
   - Compare: if message elapsedSeconds (e.g., 75) is between 60 and 120? YES = within window
7. Check if the elapsedSeconds value falls within the expected time window (expectedStartSeconds to expectedEndSeconds)
7. Set withinTimeWindow=true ONLY if timing is within the window, otherwise set withinTimeWindow=false
8. **PREREQUISITES CHECK** (if block has prerequisites array):
   - For each prerequisite, check if it was completed BEFORE this block
   - Use the timingDetails array to find prerequisite completion times
   - If prerequisite is also a patient data block, analyze from conversation when it was asked
   - CRITICAL: Compare actualTimeSeconds - prerequisite must have LOWER actualTimeSeconds than current block
   - If prerequisite was NOT completed or completed AFTER this block (higher actualTimeSeconds), set prerequisitesMet=false
   - If ALL prerequisites were completed BEFORE this block (lower actualTimeSeconds), set prerequisitesMet=true
9. **FOLLOWUPS CHECK** (if block has followups array):
   - For each followup, check if it was completed AFTER this block
   - Use the timingDetails array to find followup completion times
   - If followup is also a patient data block, analyze from conversation when it was asked
   - CRITICAL: Compare actualTimeSeconds - followup must have HIGHER actualTimeSeconds than current block
   - If followup was completed BEFORE this block (lower actualTimeSeconds), set followupsCorrect=false
   - If ALL followups were completed AFTER this block (higher actualTimeSeconds), set followupsCorrect=true
10. Update the corresponding entry in timingDetails array with:
   - completed: true/false
   - actualTimeSeconds: elapsed seconds when asked (REQUIRED if completed=true)
   - withinTimeWindow: true/false (REQUIRED if completed=true)
   - status: "Completed on time" / "Completed too early" / "Completed too late" / "Not asked in conversation"
   - prerequisitesMet: true/false (if prerequisites exist) - MUST compare actualTimeSeconds
   - followupsCorrect: true/false (if followups exist) - MUST compare actualTimeSeconds

EXAMPLE:
If patient data block is "Patient Name" and student asked "What's your name?" or "Can you tell me who you are?" or "I need to verify your identity"
→ All of these should be marked as completed=true because the MEANING is the same

If patient data block is "Date of Birth" and student asked "What's your date of birth?" or "When were you born?" or "Can you tell me your birthday?"
→ All of these should be marked as completed=true because the MEANING is the same

IMPORTANT - USE DETERMINISTIC RESULTS FOR NON-PATIENT-DATA:
- For vitals and actions: Use the deterministic timingDetails provided
- For patient data: Analyze from transcript and UPDATE the timingDetails entries marked with requiresAIAnalysis=true
- For sequence violations: Use the deterministic sequenceViolations provided

IMPORTANT: Prerequisites and followups validation:
- For NON-patient-data blocks: Already validated deterministically (use provided prerequisitesMet/followupsCorrect)
- For PATIENT-DATA blocks: YOU must validate by analyzing conversation timing
- CRITICAL: When checking followups, verify that followup blocks were completed AFTER the current block
- If a block has followups and they were NOT completed after, this is a followup violation (add to weaknesses)

SCORING RULES (MANDATORY):
- Use completionRate, timingComplianceRate, and sequenceComplianceRate from deterministic analysis
- ADD your patient data analysis results to calculate final rates
- Score = (completionRate × 0.3) + (timingComplianceRate × 0.3) + (sequenceComplianceRate × 0.4)
- Convert to percentage (0-100)

FEEDBACK RULES (TIMELINE ONLY):
- Strengths: List items completed on time.
  * FORMAT: "[Block Label] completed on time at [actualTimeFormatted] (within expected [expectedStartFormatted] to [expectedEndFormatted] window)."
- Weaknesses: List items that were missed, late, or early.
  * FORMAT FOR LATE/EARLY: "[Block Label] completed at [actualTimeFormatted], which was outside the expected [expectedStartFormatted] to [expectedEndFormatted] window."
  * FORMAT FOR MISSED: "[Block Label] was not addressed during the conversation."
- Sequence Violations: Mention if items were done in the wrong order.
- Summary: Briefly summarize timing and sequence performance.
- Recommendations: Suggest timing or sequence improvements. If 100%, state "No items identified."
- CRITICAL DEDUPLICATION RULE: Each weakness should represent a unique issue. Do not create multiple weakness entries for the same problem.

Provide: strengths (one per completed block with proper timing and sequence), weaknesses (one per timing/sequence issue ONLY), recommendations (timing/sequence ONLY), summary (timing/sequence ONLY)`;
    })();

    /* const technicalSkillSubcategoryInstructions = [
      expectedActionsInstructions,
      documentationInstructions,
      actionInstructions,
      timelineInstructions,
    ]
      .filter(Boolean)
      .join("\n\n"); */

    // Determine if any rubric item uses checklistItems
    const _hasChecklistRubric = [...softSkillItems, ...technicalSkillItems, ...aiRubricItems].some(
      (item) => {
        const ci = (item as { checklistItems?: unknown })?.checklistItems;
        return Array.isArray(ci) && ci.length > 0;
      },
    );

    // Checklist-related instructions (only included if any rubric has checklistItems)
    /* const checklistInstructions = hasChecklistRubric
      ? `TECHNICAL SKILLS – COMPLETE CHECKLIST REPORTING RULE:
 From checklistItems, include ALL mandatory checklist items.
 Non-mandatory checklist items may be addressed but do not affect scoring if omitted.
 Provide:
 Strengths: One strength entry for EACH completed checklist item (list all completed items for every rubric).
 Weaknesses: One weakness entry for EACH missed or unattempted checklist item (list all missed items for every rubric).
 Clearly label mandatory and safety-critical checklist items.
 Do NOT filter, rank, or select only “important” checklist items.
 Do NOT merge, group, or summarize multiple checklist items into a single point.
  
 CRITICAL RULE: ONLY analyze subcategories that are explicitly configured in the rubric items above. DO NOT analyze any subcategory that is not present in the TECHNICAL SKILL RUBRIC ITEMS list.
 
 Configured Technical Skill Subcategories: ${technicalSkillItems
   .map((item) => item.subCategory)
   .filter(Boolean)
   .join(", ")}
 
 CHECKLIST EVALUATION (for rubric items with checklistItems): 
 For rubric items that include checklistItems array: 
 - Evaluate each checklist item against the transcript and student performance 
 - Mandatory items (mandatory: true): Required for full credit 
 - Non-mandatory items (mandatory: false): Bonus points but not required 
 - Calculate mandatory completion rate: (completed mandatory items / total mandatory items) * 100 
 - Score based on mandatory completion percentage based on total weight of the rubric item 
 - Provide: strengths, weaknesses, recommendations, and summary based on that
 
 ABSOLUTE OVERRIDE RULE (DO NOT VIOLATE):
  
 For overallstrengths and overallweaknesses:
 - DO NOT summarize
 - DO NOT select top items
 - DO NOT limit to 2–3 points
 - DO NOT rank by importance
 - DO NOT merge multiple checklist items
  
 If a rubric contains both completed and missed checklist items:
 - The rubric name MUST appear in BOTH overallstrengths and overallweaknesses
 CHECKLIST OUTPUT ENFORCEMENT (MANDATORY):
  
 Checklist evaluation is STRICTLY item-level.
 A rubric MUST NEVER be marked as entirely failed or entirely weak.
  
 For EACH checklist item:
 - If the checklist item is completed → create EXACTLY ONE entry in overallstrengths
 - If the checklist item is missed or unattempted → create EXACTLY ONE entry in overallweaknesses
  
 This rule applies EVEN IF:
 - Mandatory checklist items are missed
 - The rubric score is very low
 - The rubric is considered "failed"
  
 Completed checklist items MUST ALWAYS appear in overallstrengths.
 Missed checklist items MUST ALWAYS appear in overallweaknesses.
  
 QUESTION VS ANSWER RULE (MANDATORY):
  
 If the student ASKED a required question,
 it MUST be treated as a COMPLETED checklist item,
 EVEN IF:
 - The patient could not recall
 - The patient gave an incomplete answer
 - The answer was uncertain or vague
  
 Checklist completion is based on STUDENT INITIATION,
 NOT on patient response quality.
 `
      : ""; */

    // Extract ONLY student messages from the transcript for communication assessment
    // This is the ONLY data source the AI is allowed to use for communication scoring
    const studentOnlyTranscript = conversationText
      .split('\n')
      .filter((line) => /^\[.*?\]\s+student:/i.test(line.trim()))
      .join('\n');
    const studentMessageCount = studentOnlyTranscript
      .split('\n')
      .filter((l) => l.trim().length > 0).length;
    this.logger.debug('[Communication] studentOnlyTranscript lines:', String(studentMessageCount));

    try {
      // Build the language directive that tells the LLM which natural
      // language to use for every human-facing string in its JSON reply.
      // We keep field names, enum values, IDs, scores and clinical
      // abbreviations in English — only free-text prose is translated —
      // so downstream grading / storage / lookups keep working identically
      // in both languages.
      const languageDirective =
        language === 'es'
          ? `\nLANGUAGE OF RESPONSE:\nWrite EVERY human-readable free-text string in your JSON reply in NATURAL, PROFESSIONAL SPANISH (es-419). This includes: summary, executiveSummary, overallSummary, description, strengths[].point / .example, weaknesses[].point / .example, recommendations[], criteriaResults[].rationale, feedback, and any narrative paragraphs.\nDO NOT translate: JSON field names, rubric IDs, subCategory codes, enum values (e.g. 'Assessment'/'Practice'), numeric scores, action titles that reference a specific configured action name from the scenario data, medication names, dosages, units (mg, mcg, mL, IU), lab codes, or clinical abbreviations (SBAR, PPE, NPO, PRN, PO, IV, etc.).\nUse formal medical Spanish (usted form). Do NOT prefix or suffix any string with English. Do NOT mix languages inside one string.\n`
          : '';

      // Single unified OpenAI call for all 5 rubrics
      const unifiedPrompt = `
You are an expert nursing education assessor following AACN standards.
Analyze the following medical simulation transcript and provide a comprehensive assessment based on the 5 dynamic rubric criteria below.${languageDirective}
 
SCENARIO INFORMATION:

Title: ${scenario?.title ?? 'Medical Simulation'}
Description: ${scenario?.description ?? ''}
 
Teacher-Defined Learning Objectives:
${JSON.stringify(learningObjectives)}
 
Patient Information:
${JSON.stringify(scenario?.patientData ?? {})}
 
CONVERSATION TRANSCRIPT:
${conversationText}

Student-Performed commonactions:
${JSON.stringify(commonActionTracker)}

System-Computed Actions Analysis:
${JSON.stringify(actionsAnalysis)}

STUDENT SUMMARY BY CATEGORY:
${studentSummaryText}

DYNAMIC GRADING RUBRIC:

${rubricItems
  .map((item) => {
    const subCatRaw = String(item.subCategory ?? '')
      .trim()
      .toLowerCase();
    if (subCatRaw === 'communication' && Array.isArray(item.communicationCriteria)) {
      const sanitized = {
        ...item,
        communicationCriteria: item.communicationCriteria.filter((c) => c.enabled !== false),
      };
      return `${item.name ?? item.subCategory ?? 'Rubric'}: ${JSON.stringify(sanitized)}`;
    }
    return `${item.name ?? item.subCategory ?? 'Rubric'}: ${JSON.stringify(item)}`;
  })
  .join('\n\n')}

ASSESSMENT INSTRUCTIONS:

GENERAL FEEDBACK RULES FOR ALL RUBRICS:
- When score is 100% (perfect performance): Recommendations should state "No items identified." or "Excellent performance - no improvements needed."
- When score is 90-99%: Provide 1-2 specific, actionable improvements
- When score is below 90%: Provide specific improvements based on identified weaknesses
- NEVER provide generic recommendations when performance is perfect or near-perfect

${rubricItems
  .map((item, index: number) => {
    const subCat = String(item.subCategory ?? '')
      .trim()
      .toLowerCase();
    if (subCat === 'expected actions') {
      return `${index + 1}. EXPECTED ACTIONS:\n${expectedActionsInstructions}`;
    }
    if (subCat === 'communication') {
      const commDesc = String(item.description ?? '').trim();
      const communicationCriteria: CommunicationCriterion[] = item.communicationCriteria ?? [];
      const enabledCriteria: CommunicationCriterion[] = communicationCriteria.filter(
        (c) => c.enabled,
      );

      // Check FIRST: if all criteria are disabled, award full marks regardless of student messages
      if (communicationCriteria.length > 0 && enabledCriteria.length === 0) {
        this.logger.debug(
          '[Communication] All criteria disabled � awarding full marks, skipping AI evaluation.',
        );
        return `${index + 1}. COMMUNICATION:\n- DETERMINISTIC RESULT: All communication criteria are disabled by the instructor.\n- score MUST be 100\n- summary: "Communication evaluation will be determined by system configuration."\n- strengths: []\n- weaknesses: []\n- recommendations: []`;
      }

      if (studentMessageCount === 0) {
        // Generate weaknesses based on enabled criteria, or use generic if no criteria configured
        const weaknessesJson =
          enabledCriteria.length > 0
            ? enabledCriteria
                .map(
                  (criterion) =>
                    `{"point": "Criterion not met: ${criterion.title}", "example": "No verbal communication was present in the transcript to demonstrate this criterion."}`,
                )
                .join(',')
            : `{"point": "No communication demonstrated.", "example": "There is no evidence of any verbal communication with the patient in the transcript."}`;

        return `${index + 1}. COMMUNICATION:\n- DETERMINISTIC RESULT: The student transcript contains ZERO student messages.\n- score MUST be 0\n- summary: "No verbal communication with the patient was documented in the conversation transcript."\n- strengths: []\n- weaknesses: [${weaknessesJson}]\n- recommendations: ["Engage verbally with the patient during the simulation."]`;
      }

      // Multi-criteria evaluation mode
      if (enabledCriteria.length > 0) {
        const criteriaInstructions: string = enabledCriteria
          .map(
            (criterion: CommunicationCriterion, idx: number) => `
  Criterion ${idx + 1}: "${criterion.title}"
  Evaluator Prompt: ${criterion.prompt}
  Return: {"passed": true/false, "rationale": "Brief explanation with evidence from transcript"}
`,
          )
          .join('\n');

        const summaryPrompt = item.communicationSummaryPrompt
          ? `

[CRITICAL - SUMMARY GENERATION INSTRUCTIONS]
${item.communicationSummaryPrompt}

YOU MUST follow the above instruction when writing the "summary" field in your response. This is a mandatory requirement from the instructor.`
          : `

Generate a balanced "summary" field that reflects both strengths and weaknesses identified in the criteria evaluation.`;

        return `${index + 1}. COMMUNICATION (Multi-Criteria Evaluation):
[!] STRICT RULE: Evaluate ONLY the STUDENT MESSAGES below. DO NOT use documentation, action notes, summaryByCategory, commonactions, or any other data source.

STUDENT MESSAGES FROM TRANSCRIPT (this is the ONLY source you may use):
${studentOnlyTranscript}

EVALUATION CRITERIA:
${criteriaInstructions}

INSTRUCTIONS:
- Evaluate each criterion independently based ONLY on the student messages above
- For each criterion, return PASS (passed: true) or FAIL (passed: false) with a brief rationale
- Quote specific evidence from the transcript when possible
- Score calculation: (Number of passed criteria � Total enabled criteria) � 100
- CRITICAL: Do not include the same criterion or statement in both "strengths" and "weaknesses". Each criterion must appear in only ONE array: strengths if passed, weaknesses if failed${summaryPrompt}

OUTPUT FORMAT:
{
  "criteriaResults": [
    {
      "criterionId": "string (from criterion)",
      "title": "string (criterion title)",
      "passed": boolean,
      "rationale": "Brief explanation with evidence"
    }
  ],
  "score": number (0-100),
  "summary": "Overall summary of communication performance",
  "strengths": [{"point": "Criterion title that passed", "example": "Evidence"}],
  "weaknesses": [{"point": "Criterion title that failed", "example": "What was missing"}],
  "recommendations": ["Actionable suggestions based on failed criteria"]
}`;
      }

      // Legacy single evaluation mode (fallback when no criteria are configured at all)
      const summaryPromptLegacy = item.communicationSummaryPrompt
        ? `

[CRITICAL - SUMMARY GENERATION INSTRUCTIONS]
${item.communicationSummaryPrompt}

YOU MUST follow the above instruction when writing your summary. This is a mandatory requirement from the instructor.`
        : '';
      return `${index + 1}. COMMUNICATION:\n[!] STRICT RULE: Evaluate ONLY the STUDENT MESSAGES below. DO NOT use documentation, action notes, summaryByCategory, commonactions, or any other data source.\n\nSTUDENT MESSAGES FROM TRANSCRIPT (this is the ONLY source you may use):\n${studentOnlyTranscript}\n\nADMIN-DEFINED ASSESSMENT LOGIC:\n  ${commDesc || 'Evaluate professional, empathetic, and clear communication with the patient.'}\n\n- Score based ONLY on what the student said in the messages above\n- If a student message exists, score MUST be > 0 and reflect actual quality\n- Provide: strengths (quote from student messages), weaknesses (gaps per admin criteria), recommendations, summary${summaryPromptLegacy}`;
    }
    if (subCat === 'documentation') {
      return `${index + 1}. DOCUMENTATION:\n${documentationInstructions}`;
    }
    if (subCat === 'action' || subCat === 'action / clinical interventions') {
      return `${index + 1}. ACTION:\n${actionInstructions}`;
    }
    if (subCat === 'timeline') {
      return `${index + 1}. TIMELINE:\n${timelineInstructions}`;
    }
    if (subCat === 'sequencing & prioritization') {
      return `${index + 1}. SEQUENCING & PRIORITIZATION:\n${sequencingInstructions}`;
    }
    return `${index + 1}. ${subCat.toUpperCase()}:\n- Assess based on transcript and rubric configuration\n- Apply general feedback rules: If score is 100%, recommendations should be "No items identified."\n- Provide: strengths, weaknesses, recommendations, summary`;
  })
  .join('\n\n')}


OUTPUT REQUIREMENTS (STRICT JSON ONLY):
Return ONLY valid JSON. Do NOT include markdown, headings, or explanations.

{
  "communicationAssessment": {
    "rubrics": {
      "overallSummary": "Comprehensive summary of all rubrics performance",
      "totalScore": number(0-100),
      "totalWeight": number,
      "feedback": "Comprehensive feedback paragraph",
      "items": {
        "<rubricId>": {
          "id": "string",
          "name": "string",
          "subCategory": "Dynamic based on scenario rubric configuration",
          "score": number(0-100),
          "summary": "Detailed analysis for this rubric",
          "timingDetails": [
            {
              "blockLabel": "string",
              "blockId": "string",
              "sourceId": "string",
              "completed": boolean,
              "actualTimeSeconds": number,
              "actualTimeFormatted": "string",
              "expectedStartSeconds": number,
              "expectedEndSeconds": number,
              "expectedStartFormatted": "string",
              "expectedEndFormatted": "string",
              "withinTimeWindow": boolean,
              "status": "Completed on time | Completed too early | Completed too late | Not asked in conversation"
            }
          ],
          "strengths": [
            {
              "point": "Specific achievement for this rubric",
              "example": "Evidence from transcript or analysis"
            }
          ],
          "weaknesses": [
            {
              "point": "Area needing improvement for this rubric",
              "example": "Evidence from transcript or analysis"
            }
          ],
          "recommendations": [
            "Actionable improvement suggestion for this rubric"
          ],
          "criteriaResults": [
            {
              "criterionId": "string",
              "title": "string",
              "passed": boolean,
              "rationale": "string"
            }
          ]
        }
      }
    }
  },
  "meta": {
    "generatedBy": "AI",
    "assessmentType": "Unified Dynamic Rubric Assessment",
    "standards": "AACN Standards"
  }
}

IMPORTANT:
- Each rubric score is a percentage (0-100)
- For Timeline rubric: Include timingDetails array with your AI analysis of patient data blocks
- For Communication rubric with multi-criteria: Include criteriaResults array with PASS/FAIL for each criterion
- Ensure all configured rubrics are evaluated and documented
`;

      const systemMessage =
        language === 'es'
          ? 'You are an expert nursing education assessor. Always return valid JSON exactly matching the requested structure. Every free-text (prose) field value in your reply MUST be written in natural, professional Spanish (es-419) using formal usted-form. Field names, enum values, IDs and numeric scores stay in English.'
          : 'You are an expert nursing education assessor. Always return valid JSON exactly matching the requested structure.';

      const response = await firstValueFrom(
        this.httpService.post<OpenAIRawResponse>(
          'https://api.openai.com/v1/chat/completions',
          {
            model: 'gpt-4.1',
            messages: [
              {
                role: 'system',
                content: systemMessage,
              },
              {
                role: 'user',
                content: unifiedPrompt,
              },
            ],
            temperature: UNIFIED_REPORT_AI_TEMPERATURE,
            max_tokens: UNIFIED_REPORT_AI_MAX_TOKENS,
            response_format: { type: 'json_object' },
          },
          {
            headers: {
              Authorization: `Bearer ${openaiApiKey}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      const usage = response.data?.usage;
      this.logger.debug(
        'Unified Assessment Token Usage:',
        JSON.stringify({
          promptTokens: usage?.prompt_tokens,
          completionTokens: usage?.completion_tokens,
          totalTokens: usage?.total_tokens,
        }),
      );

      const content = response.data?.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from OpenAI');
      }

      let analysisRaw: CommunicationAssessment & {
        communicationAssessment?: CommunicationAssessment;
      };
      try {
        analysisRaw = JSON.parse(content) as typeof analysisRaw;
      } catch (parseError) {
        this.logger.error('Invalid JSON returned from OpenAI:', content);
        throw new Error('Failed to parse OpenAI response JSON');
      }

      const analysis: CommunicationAssessment =
        analysisRaw.communicationAssessment ?? analysisRaw ?? {};

      // Ensure we have a reference to the main assessment container
      const comm = analysis;

      const seqItemRaw = Object.values(comm.rubrics?.items ?? {}).find((v) => {
        const rawSub = (v as { subCategory?: unknown })?.subCategory;
        const sub = (
          typeof rawSub === 'string'
            ? rawSub
            : typeof rawSub === 'number'
              ? String(rawSub)
              : ''
        ).toLowerCase();
        return (
          sub === 'sequencing & prioritization' || sub === 'timeline' || sub.includes('sequenc')
        );
      });

      // Capture AI-generated narrative for the sequencing rubric BEFORE any overrides wipe it
      const seqAINarrative = seqItemRaw
        ? {
            strengths: (seqItemRaw as Record<string, unknown>).strengths,
            weaknesses: (seqItemRaw as Record<string, unknown>).weaknesses,
            summary: (seqItemRaw as Record<string, unknown>).summary,
            recommendations: (seqItemRaw as Record<string, unknown>).recommendations,
          }
        : null;
      this.logger.debug('Assessment Analysis:', JSON.stringify(comm));

      // Ensure rubrics structure exists
      if (!comm.rubrics) {
        comm.rubrics = {
          overallSummary: '',
          totalScore: 0,
          totalWeight: 0,
          items: {},
        };
      }

      if (!comm.rubrics.items) {
        comm.rubrics.items = {};
      }

      const rubrics = comm.rubrics;
      const rubricItemsRecord = rubrics.items;

      // Ensure all configured rubrics exist by checking their specific IDs
      rubricItems.forEach((ri) => {
        const id = String(ri.id ?? ri.aiMapping?.aiCheckId ?? '');
        const subCategory = String(ri.subCategory ?? '');
        if (!id && !subCategory) {
          return;
        }

        // Try matching by ID first, then by subCategory as fallback
        const existingItem =
          rubricItemsRecord[id] ??
          Object.values(rubricItemsRecord).find(
            (item) =>
              item.id === id || (item.subCategory === subCategory && item.subCategory && !item.id),
          );

        if (!existingItem) {
          const rubricId = id || `rubric_${subCategory.toLowerCase().replace(/\s+/g, '_')}`;
          rubricItemsRecord[rubricId] = {
            id: rubricId,
            name: ri.name ?? subCategory,
            subCategory: subCategory,
            weight: ri.weight ?? 20,
            score: 0,
            maxScore: 100,
            weightedScore: 0,
            summary: `${ri.name ?? subCategory} not evaluated`,
          };
        }
      });

      // CRITICAL: Set weights from rubricItems config (match by ID or subCategory)
      Object.values(rubricItemsRecord).forEach((item) => {
        const id = String(item.id ?? '');
        const sub = String(item.subCategory ?? '').toLowerCase();

        const rubricConfig = rubricItems.find(
          (ri) =>
            (ri.id && String(ri.id) === id) || String(ri.subCategory ?? '').toLowerCase() === sub,
        );

        if (rubricConfig && typeof rubricConfig.weight === 'number') {
          item.weight = rubricConfig.weight;
        }
      });

      // -- DETERMINISTIC COMMUNICATION SCORE FROM criteriaResults -----------------
      // In multi-criteria mode the AI is asked to compute the score itself.
      // Intermittently (observed more on Chromebook / slow devices) the AI
      // returns score=0 while criteriaResults contain passed:true entries and
      // strengths are populated. Always recompute the score deterministically
      // from criteriaResults so the AI's arithmetic is never trusted.
      Object.values(rubricItemsRecord).forEach((item) => {
        if (String(item.subCategory ?? '').toLowerCase() !== 'communication') {
          return;
        }
        const criteriaResults = item.criteriaResults;
        if (!Array.isArray(criteriaResults) || criteriaResults.length === 0) {
          return;
        }
        const passedCount = criteriaResults.filter((cr) => cr.passed === true).length;
        // Use enabled criteria count from scenario config as the authoritative denominator.
        // This prevents diluted scores if the AI hallucinates extra criteriaResults entries.
        const scenarioCommRubric = (scenario?.grading?.rubric ?? []).find(
          (r) =>
            String(r?.subCategory ?? '')
              .trim()
              .toLowerCase() === 'communication',
        );
        const enabledCount = (scenarioCommRubric?.communicationCriteria ?? []).filter(
          (c) => c.enabled,
        ).length;
        const totalCount = enabledCount > 0 ? enabledCount : criteriaResults.length;
        item.score = Math.round((passedCount / totalCount) * 100);
        this.logger.debug(
          `[Communication] Recomputed score from criteriaResults: ${passedCount}/${totalCount} (enabledCount=${enabledCount}) = ${item.score}%`,
        );
      });
      // ---------------------------------------------------------------------------

      // ── DETERMINISTIC COMMUNICATION OVERRIDE ──────────────────────────────
      // If the conversation transcript has NO student messages, force score=0
      // regardless of what the AI returned. The AI must not infer communication
      // quality from documentation or action notes.
      const hasStudentMessages = conversationText
        .split('\n')
        .some(
          (line) =>
            /^\[.*?\]\s+student:/i.test(line.trim()) &&
            line.replace(/^\[.*?\]\s+student:/i, '').trim().length > 0,
        );

      // Language shorthand used across all deterministic override blocks below.
      const es = language === 'es';

      if (!hasStudentMessages) {
        Object.values(rubricItemsRecord).forEach((item) => {
          if (String(item.subCategory ?? '').toLowerCase() === 'communication') {
            // Find the matching scenario rubric item to check if all criteria are disabled
            const scenarioCommRubric = (scenario?.grading?.rubric ?? []).find(
              (r) =>
                String(r?.subCategory ?? '')
                  .trim()
                  .toLowerCase() === 'communication',
            );
            const commCriteria = scenarioCommRubric?.communicationCriteria ?? [];
            const allCriteriaDisabled =
              commCriteria.length > 0 && commCriteria.every((c) => !c.enabled);

            // When all criteria are disabled, award full marks � do NOT override with score 0
            if (allCriteriaDisabled) {
              item.score = null;
              // Check if Team Communication is Mandatory
              const isTeamCommunicationMandatory =
                (
                  scenario as unknown as Record<string, unknown> & {
                    teamCommunication?: { typeRequirement?: string };
                  }
                )?.teamCommunication?.typeRequirement === 'Mandatory';

              if (isTeamCommunicationMandatory) {
                // If Team Communication is Mandatory, show that message instead
                item.summary = es
                  ? 'Solo se evalúa la comunicación en equipo (SBAR) en este escenario.'
                  : 'Only Team Communication (SBAR) is evaluated in this scenario.';
              } else {
                // Standard "not evaluated" message when Team Communication is not mandatory
                item.summary = es
                  ? 'La comunicación no se evalúa para este escenario.'
                  : 'Communication is not evaluated for this scenario.';
              }
              item.strengths = [];
              item.weaknesses = [];
              item.recommendations = [];
              return;
            }

            item.score = 0;
            item.summary = es
              ? 'No se documentó comunicación verbal con el paciente en la transcripción de la conversación. Esto representa una ausencia total de comunicación profesional, empática y clara.'
              : 'No verbal communication with the patient was documented in the conversation transcript. This represents a complete lack of professional, empathetic, and clear communication.';
            item.strengths = [];

            // Generate per-criteria weaknesses if criteriaResults exist, otherwise use generic
            const criteriaResults = item.criteriaResults ?? [];
            if (criteriaResults.length > 0) {
              item.weaknesses = criteriaResults.map((criterion) => ({
                point: es
                  ? `Criterio no cumplido: ${criterion.title ?? 'Criterio desconocido'}`
                  : `Criterion not met: ${criterion.title ?? 'Unknown criterion'}`,
                example: es
                  ? 'No se encontró comunicación verbal en la transcripción para demostrar este criterio.'
                  : 'No verbal communication was present in the transcript to demonstrate this criterion.',
              }));
            } else {
              item.weaknesses = [
                {
                  point: es ? 'No se demostró comunicación.' : 'No communication demonstrated.',
                  example: es
                    ? 'No hay evidencia de comunicación verbal con el paciente en la transcripción.'
                    : 'There is no evidence of any verbal communication with the patient in the transcript.',
                },
              ];
            }

            item.recommendations = es
              ? [
                  'Interactúe verbalmente con el paciente durante la simulación. Preséntese, pregunte sobre sus inquietudes y demuestre empatía y profesionalismo a lo largo del encuentro.',
                ]
              : [
                  'Engage verbally with the patient during the simulation. Introduce yourself, ask about their concerns, and demonstrate empathy and professionalism throughout the encounter.',
                ];
          }
        });
      }
      // ────────────────────────────────────────────────────────────────────────

      // Apply deterministic scoring overrides (Pinned to specific IDs to prevent duplicates)
      // Store summaryEntries in a variable for use in nested callbacks
      const summaryEntriesForVitals = summaryEntries ?? [];

      Object.values(rubricItemsRecord).forEach((item) => {
        const id = String(item.id ?? '');
        const sub = String(item.subCategory ?? '').toLowerCase();

        // Expected Actions: override with deterministic PPE score
        if (
          (id === deterministicIds.expectedActions ||
            (sub === 'expected actions' && !deterministicIds.expectedActions)) &&
          ppeAnalysis
        ) {
          // Lookup table: canonical English PPE text → Spanish. Covers every
          // item in CANONICAL_PPE_ITEMS (ppe-privacy.service.ts).  The map is
          // only consulted when language === 'es' so there is zero overhead for
          // English reports.
          const PPE_ES: Record<string, string> = {
            'Eye Protection Donned': 'Protección Ocular Colocada',
            'Eye Protection Doffed': 'Protección Ocular Retirada',
            'Isolation Gown Donned': 'Bata de Aislamiento Colocada',
            'Isolation Gown Doffed': 'Bata de Aislamiento Retirada',
            'Standard Gloves Donned': 'Guantes Estándar Colocados',
            'Standard Gloves Doffed': 'Guantes Estándar Retirados',
            'Sterile Gloves Donned': 'Guantes Estériles Colocados',
            'Sterile Gloves Doffed': 'Guantes Estériles Retirados',
            'Respirator Mask (N95) Donned': 'Mascarilla Respirador (N95) Colocada',
            'Respirator Mask (N95) Doffed': 'Mascarilla Respirador (N95) Retirada',
            'Surgical Mask Donned': 'Mascarilla Quirúrgica Colocada',
            'Surgical Mask Doffed': 'Mascarilla Quirúrgica Retirada',
            'Hand Hygiene Performed': 'Higiene de Manos Realizada',
            'Sharps Discarded': 'Objetos Punzocortantes Descartados',
            'Non-Infectious Waste Discarded': 'Residuos No Infecciosos Descartados',
            'Infectious Waste Discarded': 'Residuos Infecciosos Descartados',
            'Knock / Announce Entry': 'Tocar / Anunciar Entrada',
            'Door Closed': 'Puerta Cerrada',
            'Door Opened': 'Puerta Abierta',
            'Curtain Drawn': 'Cortina Cerrada',
            'Curtain Opened': 'Cortina Abierta',
            'Bed/Chair Locked': 'Cama/Silla Bloqueada',
            'Bed/Chair Alarm Activated': 'Alarma de Cama/Silla Activada',
            'Bed Lowered to Lowest Position': 'Cama Bajada a la Posición Más Baja',
            'Call Light In Reach': 'Luz de Llamada al Alcance',
            'Equipment Checked': 'Equipo Revisado',
            'Lines / Tubes / Drains Checked': 'Líneas / Tubos / Drenes Revisados',
            'Personal Items Within Reach': 'Artículos Personales al Alcance',
          };
          const translatePpe = (text: string) => (es ? (PPE_ES[text] ?? text) : text);

          if (ppeAnalysis.totalStandalonePPE > 0) {
            // Store as percentage (0-100), weight will be applied in final calculation
            item.score = Number(ppeAnalysis.ppeScore.toFixed(2));
          } else {
            item.score = null;
          }

          // Deterministically split matched PPE items by status:
          // - Mandatory completed ? Strengths (overrides AI-generated strengths)
          // - Optional completed  ? actionDetails (feeds "Optional Actions Completed" on the frontend)
          const mandatoryMatched = ppeAnalysis.matchedItems.filter(
            (m) => (m.status ?? 'Mandatory') === 'Mandatory',
          );
          const optionalMatched = ppeAnalysis.matchedItems.filter((m) => m.status === 'Optional');

          if (mandatoryMatched.length > 0) {
            item.strengths = mandatoryMatched.map((m) => ({
              point: translatePpe(m.checklistText),
              example: m.matchedAction,
              count: m.count,
            }));
          }

          if (optionalMatched.length > 0) {
            item.actionDetails = optionalMatched.map((m) => ({
              title: translatePpe(m.checklistText),
              type: 'optional',
              completed: true,
              isCorrect: true,
              isOptional: true,
              response: m.matchedAction,
            }));
          }

          // Build weaknesses from unmatched MANDATORY items only
          if (ppeAnalysis.totalStandalonePPE === 0) {
            item.weaknesses = [];
            item.recommendations = ['No items identified.'];
            item.summary = es
              ? 'No se configuraron requisitos obligatorios de EPP, privacidad o seguridad para este escenario.'
              : 'No mandatory PPE, privacy, or safety requirements were configured for this scenario.';
          } else if (ppeAnalysis.ppeScore >= 100) {
            item.weaknesses = [];
            if (ppeAnalysis.completedPPE === ppeAnalysis.totalStandalonePPE) {
              item.summary = es
                ? 'Todas las medidas obligatorias de EPP, privacidad y seguridad se completaron exitosamente.'
                : 'All required PPE, privacy, and safety measures were completed successfully.';
            }
          } else if (ppeAnalysis.unmatchedItems.length > 0) {
            item.weaknesses = ppeAnalysis.unmatchedItems.map((text) => {
              const translatedPoint = translatePpe(text);
              return {
                point: translatedPoint,
                example: es
                  ? `No hay evidencia de ${translatedPoint.toLowerCase()} en el registro de acciones.`
                  : `No evidence of ${text.toLowerCase()} in the action log.`,
              };
            });
          }
        }

        // Action: override with deterministic action marks
        if (
          (id === deterministicIds.action ||
            ((sub === 'action' || sub === 'action / clinical interventions') &&
              !deterministicIds.action)) &&
          expectedActionMarks
        ) {
          // Compute Medications counts for combining with Actions
          let medMandatoryTotal = 0;
          let medMandatoryCorrect = 0;

          // Get mandatory medication orders from scenario orders
          const scenarioOrders = (scenario?.orders ?? []) as Array<{
            id?: string;
            title?: string;
            category?: string;
            medicationConfig?: {
              gradingConfig?: { enabled?: boolean; gradingType?: string };
            };
          }>;
          const mandatoryMedicationOrders = scenarioOrders
            .filter((o) => {
              if (o?.category !== 'Medication') {
                return false;
              }
              const gc = o?.medicationConfig?.gradingConfig;
              return gc?.gradingType
                ? gc.gradingType === 'Mandatory'
                : gc?.enabled === true;
            })
            .map((o) => ({
              id: o.id,
              title: (o.title ?? '').trim(),
              idKey: o.id ? `id:${o.id.trim().toLowerCase()}` : '',
              nameKey: normalizeMedicationName(o.title) ? `name:${normalizeMedicationName(o.title)}` : '',
            }))
            .filter((o) => o.title.length > 0);

          const administeredKeys = new Set<string>();

          const studentMeds = (studentSummary as Record<string, unknown>)?.medications as Array<{
            administrationDetails?: {
              medicationId?: string;
              medicationName?: string;
              orderTitle?: string;
              gradingResult?: {
                medicationId?: string;
                medicationName?: string;
                overallScore?: number;
                totalExpected?: number;
                totalCorrect?: number;
                mandatory?: boolean;
              };
            };
          }>;

          if (studentMeds) {
            const seenMedKeys = new Set<string>();
            const dedupedResults = studentMeds
              .map((entry) => ({
                medicationId:
                  entry.administrationDetails?.gradingResult?.medicationId ??
                  entry.administrationDetails?.medicationId,
                orderTitle:
                  entry.administrationDetails?.orderTitle ??
                  entry.administrationDetails?.gradingResult?.medicationName ??
                  entry.administrationDetails?.medicationName ??
                  '',
                gradingResult: entry.administrationDetails?.gradingResult,
              }))
              .filter(
                (r): r is typeof r & { gradingResult: NonNullable<typeof r.gradingResult> } =>
                  !!r.gradingResult,
              )
              .filter((r) => {
                const key = normalizeMedicationKey(r.orderTitle, r.medicationId);
                if (!key) {
                  return true;
                }
                if (seenMedKeys.has(key)) {
                  return false;
                }
                seenMedKeys.add(key);
                return true;
              });

            for (const entry of dedupedResults) {
              const gr = entry.gradingResult;
              const medName = entry.orderTitle ?? gr.medicationName ?? '';
              const idKey = entry.medicationId ? `id:${entry.medicationId.trim().toLowerCase()}` : '';
              const nameKey = normalizeMedicationName(medName) ? `name:${normalizeMedicationName(medName)}` : '';
              if (idKey) administeredKeys.add(idKey);
              if (nameKey) administeredKeys.add(nameKey);

              const isCorrect = (gr.overallScore ?? 0) >= 100;
              const isMandatory = gr.mandatory !== false;
              if (!isMandatory) {
                continue;
              }
              medMandatoryTotal += 1;
              if (isCorrect) {
                medMandatoryCorrect += 1;
              }
            }
          }

          // Count missed mandatory medications
          for (const order of mandatoryMedicationOrders) {
            const isAdministered =
              (order.idKey && administeredKeys.has(order.idKey)) ||
              (order.nameKey && administeredKeys.has(order.nameKey));
            if (isAdministered) {
              continue;
            }
            medMandatoryTotal += 1;
          }

          const totalRequired = expectedActionMarks.totalRequiredActions + medMandatoryTotal;
          const positiveActions = expectedActionMarks.positiveActions + medMandatoryCorrect;

          const percentage = totalRequired > 0 ? (positiveActions / totalRequired) * 100 : null;
          item.score = percentage !== null ? Number(percentage.toFixed(2)) : null;
          item.actionDetails = expectedActionMarks.details;

          const vitalFeedback = this.generateVitalActionFeedback(
            (actionsTimeline ?? []) as unknown as ActionAttempt[],
            (scenario?.actions ?? []) as ScenarioActionDef[],
            summaryByCategory as SummaryByCategoryLike | undefined,
            summaryEntriesForVitals,
          );
          const actionFeedback = this.buildActionFeedback(expectedActionMarks.details);
          item.strengths = vitalFeedback.strengths.concat(actionFeedback.strengths);
          item.weaknesses = vitalFeedback.improvements.concat(actionFeedback.weaknesses);

          // When Spanish is active, translate the deterministic English templates
          // produced by buildActionFeedback / generateVitalActionFeedback (those
          // helpers don't yet accept a language parameter).
          if (language === 'es') {
            item.weaknesses = item.weaknesses.map((w) => ({
              point: w.point
                .replace(
                  /^Did not perform vital signs action "(.*)"$/,
                  'No se realiz\u00f3 la acci\u00f3n de signos vitales "$1"',
                )
                .replace(
                  /^Action "(.*)" was not completed correctly$/,
                  'La acci\u00f3n "$1" no se complet\u00f3 correctamente',
                ),
              example: w.example
                .replace(
                  /^The expected action was not completed in the scenario\.$/,
                  'La acci\u00f3n esperada no se complet\u00f3 en el escenario.',
                )
                .replace(
                  /^The action "(.*)" was not performed\.$/,
                  'La acci\u00f3n "$1" no fue realizada.',
                )
                .replace(
                  /^Action was performed but did not satisfy all mandatory clinical concepts\.$/,
                  'La acci\u00f3n fue realizada pero no cumpli\u00f3 todos los conceptos cl\u00ednicos obligatorios.',
                )
                .replace(
                  /^Action was performed but the response\/selection was incorrect\.$/,
                  'La acci\u00f3n fue realizada pero la respuesta o selecci\u00f3n fue incorrecta.',
                ),
            }));
            item.strengths = item.strengths.map((s) => ({
              point: s.point
                .replace(
                  /^Correctly performed vital signs action "(.*)"$/,
                  'Acci\u00f3n de signos vitales realizada correctamente: "$1"',
                )
                .replace(
                  /^Completed action "(.*)" correctly$/,
                  'Acci\u00f3n "$1" completada correctamente',
                ),
              example: s.example.replace(
                /^Action "(.*)" was completed successfully\.$/,
                'La acci\u00f3n "$1" fue completada con \u00e9xito.',
              ),
            }));
          }

          // Reconcile score: generateVitalActionFeedback is the source of truth for
          // vital actions (it has the full summaryByCategory fallback). Replace the
          // vital isCorrect results in expectedActionMarks with what vitalFeedback found.
          const vitalActionTitlesCorrect = new Set(
            vitalFeedback.strengths.map((s) =>
              s.point
                .replace(/^Correctly performed vital signs action "(.+)"$/, '$1')
                .toLowerCase(),
            ),
          );
          const nonVitalPositive = expectedActionMarks.details.filter(
            (d) =>
              String(d.type ?? '').toLowerCase() !== 'vital' &&
              d.isCorrect === true &&
              d.isOptional !== true,
          ).length;
          const vitalPositive = vitalFeedback.strengths.length;
          const vitalTotal = ((scenario?.actions ?? []) as unknown as ScenarioActionLike[]).filter(
            (a) =>
              String(a.type ?? '').toLowerCase() === 'vital' &&
              a.isOptional !== true &&
              a.typeRequirement?.toLowerCase() !== 'optional' &&
              a.typeRequirement?.toLowerCase() !== 'distractor',
          ).length;
          const nonVitalTotal = expectedActionMarks.totalRequiredActions - vitalTotal;
          const reconciledTotal = nonVitalTotal + vitalTotal;
          const reconciledPositive = nonVitalPositive + vitalPositive;
          const reconciledPercentage =
            reconciledTotal > 0 ? (reconciledPositive / reconciledTotal) * 100 : null;
          // Store as percentage (0-100), weight will be applied in final calculation
          item.score =
            reconciledPercentage !== null ? Number(reconciledPercentage.toFixed(2)) : null;

          // When there are no mandatory actions (all Distractor/Optional/excluded), override
          // the AI-generated summary so it matches the N/A score instead of saying "critical gap".
          if (reconciledTotal === 0) {
            item.summary = es
              ? 'No se configuraron acciones o intervenciones obligatorias para este escenario.'
              : 'No mandatory actions or interventions were configured for this scenario.';
            item.weaknesses = [];
            item.recommendations = ['No items identified.'];
          }

          // Sync actionDetails so vital actions reflect the reconciled isCorrect value.
          // Also sync firstAttemptCorrect and anyAttemptCorrect so they are consistent
          // with isCorrect and the AI no longer receives conflicting signals.
          item.actionDetails = expectedActionMarks.details.map((d) => {
            if (String(d.type ?? '').toLowerCase() !== 'vital') {
              return d;
            }
            const isCorrect = vitalActionTitlesCorrect.has((d.title ?? '').toLowerCase());
            return {
              ...d,
              isCorrect,
              firstAttemptCorrect: isCorrect,
              anyAttemptCorrect: isCorrect,
              pointsAwarded: isCorrect && !d.isOptional ? 1 : 0,
            };
          });
        }

        // Timeline: override with deterministic timeline analysis + AI patient data analysis
        // Skip if the configured rubric for this item is actually "Sequencing & Prioritization"
        // (AI may return subCategory="Timeline" for it, but it must be handled by the sequencing block)
        const isActuallySequencingRubric = rubricItems.some(
          (ri) =>
            (String(ri.id ?? '') === id || String(ri.subCategory ?? '').toLowerCase() === sub) &&
            String(ri.subCategory ?? '').toLowerCase() === 'sequencing & prioritization',
        );
        if (
          !isActuallySequencingRubric &&
          (id === deterministicIds.timeline ||
            (sub === 'timeline' && !deterministicIds.timeline)) &&
          timelineAnalysis
        ) {
          // Merge AI-analyzed patient data blocks back into timeline analysis
          const aiTimingDetails: TimingDetail[] = item.timingDetails ?? [];
          const rawTimingDetails = (timelineAnalysis.timingDetails ?? []) as TimingDetail[];
          const mergedTimingDetails: TimingDetail[] = [...rawTimingDetails];
          const rawPatientDataBlocks = (timelineAnalysis.patientDataBlocks ?? []) as Array<{
            blockId: string;
            expectedStartSeconds?: number;
            expectedEndSeconds?: number;
          }>;
          const patientDataBlocksMap = new Map(
            rawPatientDataBlocks.map((b) => [b.blockId, b]),
          );

          // Update ONLY patient data blocks with AI analysis
          // NEVER override deterministic action/vital/PPE blocks
          mergedTimingDetails.forEach((detail, index) => {
            if (detail.requiresAIAnalysis) {
              const aiDetail = aiTimingDetails.find(
                (ai) => ai.blockId === detail.blockId || ai.sourceId === detail.sourceId,
              );
              const patientDataBlock = detail.blockId
                ? patientDataBlocksMap.get(detail.blockId)
                : undefined;
              if (aiDetail) {
                // For patient data blocks, take ALL fields from AI including prerequisite/followup validation
                mergedTimingDetails[index] = {
                  ...detail,
                  completed: aiDetail.completed,
                  actualTimeSeconds: aiDetail.actualTimeSeconds,
                  actualTimeFormatted: aiDetail.actualTimeFormatted,
                  withinTimeWindow: aiDetail.withinTimeWindow,
                  status: aiDetail.status,
                  prerequisitesMet: aiDetail.prerequisitesMet,
                  followupsCorrect: aiDetail.followupsCorrect,
                  requiresAIAnalysis: false,
                  expectedStartSeconds: patientDataBlock?.expectedStartSeconds,
                  expectedEndSeconds: patientDataBlock?.expectedEndSeconds,
                };
              }
            }
            // CRITICAL: For non-patient-data blocks (actions, vitals, PPE),
            // NEVER allow AI to override the deterministic values
            // The withinTimeWindow, completed, actualTimeSeconds are already correct
          });

          // CRITICAL: Re-validate prerequisites and followups after merging AI-analyzed patient data
          // This ensures that blocks with patient data prerequisites/followups are correctly validated
          const isBlockCompletedAfterMerge = (
            blockId: string,
          ): { completed: boolean; time: number | null } => {
            const detail = mergedTimingDetails.find((d) => d.blockId === blockId);
            if (
              detail?.completed &&
              detail.actualTimeSeconds !== null &&
              detail.actualTimeSeconds !== undefined
            ) {
              return { completed: true, time: detail.actualTimeSeconds };
            }
            return { completed: false, time: null };
          };

          mergedTimingDetails.forEach((detail) => {
            if (!detail.completed || detail.requiresAIAnalysis) {
              return;
            }
            const blockTime = detail.actualTimeSeconds;
            if (blockTime === null || blockTime === undefined) {
              return;
            }

            let prerequisitesMet = true;
            let followupsCorrect = true;

            // Re-check prerequisites
            (detail.prerequisites ?? []).forEach((prereqId) => {
              const { completed: prereqCompleted, time: prereqTime } =
                isBlockCompletedAfterMerge(prereqId);
              if (!prereqCompleted || prereqTime === null) {
                prerequisitesMet = false;
              } else if (prereqTime > blockTime) {
                prerequisitesMet = false;
              }
            });

            // Re-check followups
            (detail.followups ?? []).forEach((followupId) => {
              const { completed: followupCompleted, time: followupTime } =
                isBlockCompletedAfterMerge(followupId);
              if (!followupCompleted || followupTime === null) {
                followupsCorrect = false;
              } else if (followupTime < blockTime) {
                followupsCorrect = false;
              }
            });

            detail.prerequisitesMet = prerequisitesMet;
            detail.followupsCorrect = followupsCorrect;
          });

          // Recalculate completion and timing rates with AI-analyzed patient data
          const allCompleted = mergedTimingDetails.filter((d) => d.completed);
          const allWithCorrectTiming = allCompleted.filter((d) => d.withinTimeWindow);
          const totalBlocks = mergedTimingDetails.length;

          // Rebuild sequence violations after merging AI-analyzed patient data
          let sequenceViolations: SequenceViolation[] = [];

          // Re-check all prerequisite and followup violations with updated patient data
          mergedTimingDetails.forEach((detail) => {
            if (!detail.completed) {
              return;
            }
            const blockTime = detail.actualTimeSeconds;
            if (blockTime === null || blockTime === undefined) {
              return;
            }

            // Check prerequisites
            (detail.prerequisites ?? []).forEach((prereqId: string) => {
              const prereqDetail = mergedTimingDetails.find((d) => d.blockId === prereqId);
              const { completed: prereqCompleted, time: prereqTime } =
                isBlockCompletedAfterMerge(prereqId);

              if (!prereqCompleted || prereqTime === null) {
                // Prerequisite was not completed at all
                if (
                  !sequenceViolations.find(
                    (v) =>
                      v.blockId === detail.blockId &&
                      v.prereqId === prereqId &&
                      v.type === 'missing_prerequisite',
                  )
                ) {
                  sequenceViolations.push({
                    blockId: detail.blockId ?? '',
                    blockLabel: detail.blockLabel,
                    type: 'missing_prerequisite',
                    prereqId,
                    prereqLabel: prereqDetail?.blockLabel ?? prereqId,
                    message: 'Completed without prerequisite block',
                  });
                }
              } else if (prereqTime > blockTime) {
                // Prerequisite was completed after this block
                if (
                  !sequenceViolations.find(
                    (v) =>
                      v.blockId === detail.blockId &&
                      v.prereqId === prereqId &&
                      v.type === 'prerequisite_order_violation',
                  )
                ) {
                  sequenceViolations.push({
                    blockId: detail.blockId ?? '',
                    blockLabel: detail.blockLabel,
                    type: 'prerequisite_order_violation',
                    prereqId,
                    prereqLabel: prereqDetail?.blockLabel ?? prereqId,
                    message: 'Completed before prerequisite block',
                    expectedTime: prereqTime,
                    actualTime: blockTime,
                  });
                }
              }
            });

            // Check followups
            (detail.followups ?? []).forEach((followupId: string) => {
              const followupDetail = mergedTimingDetails.find((d) => d.blockId === followupId);
              const { completed: followupCompleted, time: followupTime } =
                isBlockCompletedAfterMerge(followupId);

              if (!followupCompleted || followupTime === null) {
                // Followup was not completed at all
                if (
                  !sequenceViolations.find(
                    (v) =>
                      v.blockId === detail.blockId &&
                      v.followupId === followupId &&
                      v.type === 'missing_followup',
                  )
                ) {
                  sequenceViolations.push({
                    blockId: detail.blockId ?? '',
                    blockLabel: detail.blockLabel,
                    type: 'missing_followup',
                    followupId,
                    followupLabel: followupDetail?.blockLabel ?? followupId,
                    message: 'Followup block was not completed',
                  });
                }
              } else if (followupTime < blockTime) {
                // Followup was completed before this block
                if (
                  !sequenceViolations.find(
                    (v) =>
                      v.blockId === detail.blockId &&
                      v.followupId === followupId &&
                      v.type === 'followup_order_violation',
                  )
                ) {
                  sequenceViolations.push({
                    blockId: detail.blockId ?? '',
                    blockLabel: detail.blockLabel,
                    type: 'followup_order_violation',
                    followupId,
                    followupLabel: followupDetail?.blockLabel ?? followupId,
                    message: 'Followup block completed before this block',
                    expectedTime: blockTime,
                    actualTime: followupTime,
                  });
                }
              }
            });
          });

          // Keep original sequence chain violations from deterministic analysis
          const originalSequenceViolations: SequenceViolation[] =
            (timelineAnalysis.sequenceViolations ?? []) as SequenceViolation[];

          // CRITICAL: Do NOT merge original sequence violations that involve patient data blocks
          // because those were created before AI analysis and may be incorrect
          originalSequenceViolations.forEach((origViolation: SequenceViolation) => {
            // Check if this violation involves a patient data block
            const involvesPatientData =
              patientDataBlocksMap.has(origViolation.blockId) ||
              !!(origViolation.prereqId && patientDataBlocksMap.has(origViolation.prereqId)) ||
              !!(origViolation.followupId && patientDataBlocksMap.has(origViolation.followupId));

            // Only keep violations that don't involve patient data blocks
            // (patient data violations are re-validated above after AI analysis)
            if (
              !involvesPatientData &&
              !sequenceViolations.find(
                (v: SequenceViolation) =>
                  v.blockId === origViolation.blockId &&
                  v.type === origViolation.type &&
                  (v.prereqId === origViolation.prereqId ||
                    v.followupId === origViolation.followupId),
              )
            ) {
              sequenceViolations.push(origViolation);
            }
          });

          // Filter out ONLY circular dependency violations, but keep missing prerequisite/followup violations
          sequenceViolations = sequenceViolations.filter((violation) => {
            const violatedBlock = mergedTimingDetails.find((d) => d.blockId === violation.blockId);
            if (!violatedBlock) {
              return true;
            }

            // Check if this block has circular dependency
            const hasPrereqs =
              violatedBlock.prerequisites && violatedBlock.prerequisites.length > 0;
            const hasFollowups = violatedBlock.followups && violatedBlock.followups.length > 0;
            const hasCircularDep =
              hasPrereqs &&
              hasFollowups &&
              (violatedBlock.prerequisites ?? []).some((p: string) =>
                (violatedBlock.followups ?? []).includes(p),
              );

            // CRITICAL: Keep missing violations even if circular dependency exists
            // Only filter out order violations for circular dependencies
            if (
              hasCircularDep &&
              (violation.type === 'missing_prerequisite' || violation.type === 'missing_followup')
            ) {
              return true; // Keep the violation - prerequisite/followup was not completed at all
            }

            return !hasCircularDep; // Filter out other violations if circular dependency
          });

          // CRITICAL: Score is based on blocks completed WITHIN time window AND correct sequence
          /* const finalCompletionRate =
            totalBlocks > 0
              ? Math.round((allWithCorrectTiming.length / totalBlocks) * 100)
              : 0;
          const finalTimingComplianceRate =
            allCompleted.length > 0
              ? Math.round(
                (allWithCorrectTiming.length / allCompleted.length) * 100,
              )
              : 0;
          const finalSequenceComplianceRate =
            totalBlocks > 0
              ? Math.round(
                ((allCompleted.length - sequenceViolations.length) /
                  totalBlocks) *
                100,
              )
              : 100; */

          // CORRECTED FORMULA: Score based on blocks that are BOTH completed correctly AND in sequence
          // Only count blocks that are: completed + within time window + no sequence violations
          const blocksCorrectAndInSequence = allWithCorrectTiming.filter(
            (d) => !sequenceViolations.some((v) => v.blockId === d.blockId),
          ).length;

          // Guard: if no blocks are configured, score is null (N/A)
          item.score =
            totalBlocks > 0
              ? Number(((blocksCorrectAndInSequence / totalBlocks) * 100).toFixed(2))
              : null;

          item.timingDetails = mergedTimingDetails;
          item.sequenceViolations = sequenceViolations;

          // Override strengths and weaknesses
          item.strengths = [];
          item.weaknesses = [];

          // Add strengths for completed blocks ONLY if within time window AND correct sequence
          mergedTimingDetails.forEach((detail: TimingDetail) => {
            if (detail.completed && detail.withinTimeWindow) {
              const hasSequenceViolation = sequenceViolations.some(
                (v: SequenceViolation) => v.blockId === detail.blockId,
              );

              // Skip if there's a sequence violation
              if (hasSequenceViolation) {
                return;
              }

              // Check for circular dependencies
              const hasPrerequisites = detail.prerequisites && detail.prerequisites.length > 0;
              const hasFollowups = detail.followups && detail.followups.length > 0;

              // Identify circular blocks (blocks that reference each other mutually)
              const circularBlocks = new Set<string>();
              if (hasPrerequisites && hasFollowups && detail.prerequisites && detail.followups) {
                detail.prerequisites.forEach((prereqId: string) => {
                  if (detail.followups?.includes(prereqId)) {
                    circularBlocks.add(prereqId);
                  }
                });
              }

              // For blocks with circular dependencies, we need special handling:
              // - If BOTH blocks in the circular pair are completed, BOTH should appear in strengths
              // - We ignore the order requirement between circular blocks
              // - But we still check non-circular prerequisites/followups

              const hasCircularDependency = circularBlocks.size > 0;

              if (hasCircularDependency) {
                // Check if all circular blocks are completed (ignore order between them)
                const allCircularBlocksCompleted = Array.from(circularBlocks).every(
                  (circularId: string) => {
                    const circularDetail = mergedTimingDetails.find(
                      (d) => d.blockId === circularId || d.sourceId === circularId,
                    );
                    return circularDetail?.completed;
                  },
                );

                if (!allCircularBlocksCompleted) {
                  return; // Skip if not all circular blocks are completed
                }

                // Get non-circular prerequisites (those NOT in the circular set)
                const nonCircularPrereqs = (detail.prerequisites ?? []).filter(
                  (p: string) => !circularBlocks.has(p),
                );
                const nonCircularFollowups = (detail.followups ?? []).filter(
                  (f: string) => !circularBlocks.has(f),
                );

                // Check if non-circular prerequisites are met
                if (nonCircularPrereqs.length > 0) {
                  const allNonCircularPrereqsMet = nonCircularPrereqs.every((prereqId: string) => {
                    const prereqDetail = mergedTimingDetails.find(
                      (d) => d.blockId === prereqId || d.sourceId === prereqId,
                    );
                    return (
                      prereqDetail?.completed &&
                      (prereqDetail.actualTimeSeconds ?? 0) < (detail.actualTimeSeconds ?? 0)
                    );
                  });
                  if (!allNonCircularPrereqsMet) {
                    return; // Skip if non-circular prerequisites not met
                  }
                }

                // Check if non-circular followups are correct
                if (nonCircularFollowups.length > 0) {
                  const allNonCircularFollowupsCorrect = nonCircularFollowups.every(
                    (followupId: string) => {
                      const followupDetail = mergedTimingDetails.find(
                        (d) => d.blockId === followupId || d.sourceId === followupId,
                      );
                      return (
                        followupDetail?.completed &&
                        (followupDetail.actualTimeSeconds ?? 0) > (detail.actualTimeSeconds ?? 0)
                      );
                    },
                  );
                  if (!allNonCircularFollowupsCorrect) {
                    return; // Skip if non-circular followups not correct
                  }
                }
              } else {
                // No circular dependency - check all prerequisites and followups normally
                if (detail.prerequisitesMet === false || detail.followupsCorrect === false) {
                  return;
                }
              }

              const timeInfo =
                detail.actualTimeFormatted ??
                (detail.actualTimeSeconds
                  ? this.formatSecondsToTime(detail.actualTimeSeconds)
                  : 'completed');

              // Note: Circular dependency already detected above
              const prerequisitesMet = detail.prerequisitesMet !== false;
              const followupsCorrect = detail.followupsCorrect !== false;

              // Only consider sequence "correct" if prerequisites/followups exist AND are validated AND no circular dependency
              const hasSequenceRequirements = !!hasPrerequisites || !!hasFollowups;
              const sequenceIsCorrect =
                !hasCircularDependency &&
                hasSequenceRequirements &&
                prerequisitesMet &&
                followupsCorrect;

              // Build point message
              let point = '';
              if (hasCircularDependency) {
                // Circular dependency detected - just say completed on time without sequence judgment
                point = `${detail.blockLabel} completed on time`;
              } else if (sequenceIsCorrect) {
                point = `${detail.blockLabel} completed on time and in correct sequence`;
              } else if (!hasSequenceRequirements) {
                point = `${detail.blockLabel} completed on time`;
              } else {
                // Has sequence requirements but not met - skip this as strength
                return;
              }

              let example = detail.verbalized
                ? `${detail.blockLabel} was completed and verbalized at ${timeInfo}.`
                : `${detail.blockLabel} was completed at ${timeInfo}.`;

              // ONLY add prerequisite/followup info if they were actually met AND exist
              if (hasPrerequisites && prerequisitesMet) {
                example += ` All prerequisites were completed first.`;
              }
              if (hasFollowups && followupsCorrect) {
                // Verify all followup blocks are actually completed before claiming they were done
                const allFollowupsCompleted = (detail.followups ?? []).every((fId: string) =>
                  mergedTimingDetails.some(
                    (d) => (d.blockId === fId || d.sourceId === fId) && d.completed,
                  ),
                );
                if (allFollowupsCompleted) {
                  example += ` All followups were completed after.`;
                }
              }

              if (!item.strengths) {
                item.strengths = [];
              }
              item.strengths.push({ point, example });
            }
          });

          // Add weaknesses for missed blocks and violations
          mergedTimingDetails.forEach((detail) => {
            if (!detail.completed) {
              const point = `Did not complete ${detail.blockLabel} block`;
              const example =
                detail.status === 'Not asked in conversation'
                  ? `${detail.blockLabel} was not asked during the scenario.`
                  : `${detail.blockLabel} was not completed.`;
              // Only add if not already present (prevents duplicate labels across blocks)
              if (
                !(item.weaknesses ?? []).some((w) => w.point === point && w.example === example)
              ) {
                (item.weaknesses ??= []).push({ point, example });
              }
            } else if (detail.completed && detail.withinTimeWindow === false) {
              // Block completed but outside time window - always a weakness
              const point = `${detail.blockLabel} completed outside time window`;
              let example = '';

              if (detail.expectedStartFormatted && detail.expectedEndFormatted) {
                const timeInfo =
                  detail.actualTimeFormatted && detail.actualTimeFormatted !== 'unknown time'
                    ? detail.actualTimeFormatted
                    : detail.actualTimeSeconds
                      ? this.formatSecondsToTime(detail.actualTimeSeconds)
                      : 'unknown time';
                example = `${detail.blockLabel} was completed at ${timeInfo} but expected between ${detail.expectedStartFormatted} and ${detail.expectedEndFormatted}.`;
              } else if (
                detail.expectedStartSeconds !== undefined &&
                detail.expectedEndSeconds !== undefined
              ) {
                const timeInfo = detail.actualTimeSeconds
                  ? this.formatSecondsToTime(detail.actualTimeSeconds)
                  : 'unknown time';
                const expectedStart = this.formatSecondsToTime(detail.expectedStartSeconds);
                const expectedEnd = this.formatSecondsToTime(detail.expectedEndSeconds);
                example = `${detail.blockLabel} was completed at ${timeInfo} but expected between ${expectedStart} and ${expectedEnd}.`;
              } else {
                const timeInfo =
                  detail.actualTimeFormatted && detail.actualTimeFormatted !== 'unknown time'
                    ? detail.actualTimeFormatted
                    : detail.actualTimeSeconds
                      ? this.formatSecondsToTime(detail.actualTimeSeconds)
                      : 'unknown time';
                example = `${detail.blockLabel} was completed at ${timeInfo} but timing could not be validated.`;
              }

              (item.weaknesses ??= []).push({ point, example });
            } else if (
              detail.completed &&
              detail.verbalized === false &&
              detail.sourceId?.includes('vitals')
            ) {
              const point = `${detail.blockLabel} completed but not verbalized`;
              const example = `${detail.blockLabel} was completed but not communicated aloud.`;
              // Only add if not already present
              if (
                !(item.weaknesses ?? []).some((w) => w.point === point && w.example === example)
              ) {
                if (!item.weaknesses) {
                  item.weaknesses = [];
                }
                item.weaknesses.push({ point, example });
              }
            }

            // Check for prerequisite violations
            if (
              detail.completed &&
              detail.prerequisitesMet === false &&
              detail.prerequisites &&
              detail.prerequisites.length > 0
            ) {
              // Find the specific prerequisite violations for this block
              const prereqViolations = sequenceViolations.filter(
                (v) =>
                  v.blockId === detail.blockId &&
                  (v.type === 'missing_prerequisite' || v.type === 'prerequisite_order_violation'),
              );

              prereqViolations.forEach((violation) => {
                const point = `${detail.blockLabel} prerequisite violation`;
                let example = '';
                if (violation.type === 'missing_prerequisite') {
                  example = `${detail.blockLabel} was completed without completing prerequisite "${violation.prereqLabel}" first.`;
                } else {
                  example = `${detail.blockLabel} was completed before prerequisite "${violation.prereqLabel}" was done.`;
                }
                // Only add if not already present
                if (
                  !(item.weaknesses ?? []).some((w) => w.point === point && w.example === example)
                ) {
                  if (!item.weaknesses) {
                    item.weaknesses = [];
                  }
                  item.weaknesses.push({ point, example });
                }
              });
            }

            // Check followup violations
            if (
              detail.completed &&
              detail.followupsCorrect === false &&
              detail.followups &&
              detail.followups.length > 0
            ) {
              // Find the specific followup violations for this block
              const followupViolations = sequenceViolations.filter(
                (v) =>
                  v.blockId === detail.blockId &&
                  (v.type === 'followup_order_violation' || v.type === 'missing_followup'),
              );

              followupViolations.forEach((violation) => {
                let point = '';
                let example = '';

                if (violation.type === 'missing_followup') {
                  point = `${detail.blockLabel} followup not completed`;
                  example = `Required followup "${violation.followupLabel}" was not completed after ${detail.blockLabel}.`;
                } else {
                  point = `${detail.blockLabel} followup sequence violation`;
                  example = `Followup block "${violation.followupLabel}" was completed before ${detail.blockLabel}.`;
                }

                // Only add if not already present
                if (
                  !(item.weaknesses ?? []).some((w) => w.point === point && w.example === example)
                ) {
                  if (!item.weaknesses) {
                    item.weaknesses = [];
                  }
                  item.weaknesses.push({ point, example });
                }
              });
            }
          });

          // Add sequence violations to weaknesses

          sequenceViolations.forEach((violation) => {
            const violatedBlock = mergedTimingDetails.find((d) => d.blockId === violation.blockId);
            if (!violatedBlock?.completed) {
              return;
            }

            let point = '';
            let example = '';
            if (violation.type === 'sequence_chain_violation') {
              point = `${violatedBlock.blockLabel} sequence violation`;
              example = `${violatedBlock.blockLabel} was completed before ${violation.expectedAfterLabel ?? 'required block'}.`;
            } else if (
              violation.type === 'missing_prerequisite' ||
              violation.type === 'prerequisite_order_violation'
            ) {
              point = `${violatedBlock.blockLabel} prerequisite violation`;
              const prereqLabel = violation.prereqLabel ?? 'prerequisite block';
              // Canonical wording (matches per-block prerequisite violation wording)
              example = `${violatedBlock.blockLabel} was completed without completing prerequisite "${prereqLabel}" first.`;
            } else if (violation.type === 'followup_order_violation') {
              point = `${violatedBlock.blockLabel} followup violation`;
              const followupLabel = violation.followupLabel ?? 'followup block';
              example = `${followupLabel} was completed before ${violatedBlock.blockLabel}.`;
            } else if (violation.type === 'missing_followup') {
              point = `${violatedBlock.blockLabel} followup not completed`;
              const followupLabel = violation.followupLabel ?? 'followup block';
              example = `Required followup ${followupLabel} was not completed after ${violatedBlock.blockLabel}.`;
            } else {
              point = `${violatedBlock.blockLabel} sequence violation`;
              example = `${violatedBlock.blockLabel} was completed before ${violation.expectedBefore ?? 'required block'}.`;
            }

            // Only add if not already present
            if (!(item.weaknesses ?? []).some((w) => w.point === point && w.example === example)) {
              if (!item.weaknesses) {
                item.weaknesses = [];
              }
              item.weaknesses.push({ point, example });
            }
          });

          // Final dedupe pass (guards against duplicated blocks/config/whitespace)
          if (Array.isArray(item.weaknesses) && item.weaknesses.length > 1) {
            const seen = new Set<string>();
            item.weaknesses = item.weaknesses.filter((w) => {
              const p = String(w?.point ?? '').trim();
              const e = String(w?.example ?? '').trim();
              const key = `${p}__${e}`;
              if (seen.has(key)) {
                return false;
              }
              seen.add(key);
              return true;
            });
          }
        }

        // Sequencing & Prioritization: deterministic score + parentResults + narrative.
        // Use deterministic strengths/weaknesses instead of AI-generated ones for accuracy.
        if (sub === 'timeline' || sub === 'sequencing & prioritization') {
          item.name = 'Sequencing & Prioritization';
          item.subCategory = 'Sequencing & Prioritization';
          item.score = sequencingEvaluation.score;
          (item as Record<string, unknown>).parentResults = sequencingEvaluation.parentResults;

          // Use deterministic strengths/weaknesses from backend evaluation
          item.strengths = sequencingEvaluation.strengths;
          item.weaknesses = sequencingEvaluation.weaknesses;
          item.recommendations = sequencingEvaluation.recommendations;

          // Use AI narrative for summary only (if available and better than deterministic)
          if (seqAINarrative?.summary && typeof seqAINarrative.summary === 'string') {
            item.summary = seqAINarrative.summary;
          } else {
            item.summary = sequencingEvaluation.summary;
          }

          // Clear timeline-specific fields that don't belong on a sequencing rubric
          item.timingDetails = [];
          item.sequenceViolations = [];
        }

        // Medications: deterministic override from summaryByCategory.medications gradingResults
        if (
          (id === deterministicIds.medications ||
            (sub === 'medications' && !deterministicIds.medications)) &&
          studentSummary
        ) {
          // Extract medication grading results from summaryByCategory.medications
          const medicationEntries = (studentSummary.medications ?? []) as Array<{
            administrationDetails?: {
              medicationId?: string;
              medicationName?: string;
              orderTitle?: string;
              gradingResult?: {
                medicationId?: string;
                medicationName: string;
                overallScore: number;
                totalExpected: number;
                totalCorrect: number;
                mandatory?: boolean;
              };
            };
          }>;

          // Get mandatory medication orders from scenario orders
          const scenarioOrders = (scenario?.orders ?? []) as Array<{
            id?: string;
            title?: string;
            category?: string;
            medicationConfig?: {
              gradingConfig?: { enabled?: boolean; gradingType?: string };
            };
          }>;
          const mandatoryMedicationOrders = scenarioOrders
            .filter((o) => {
              if (o?.category !== 'Medication') {
                return false;
              }
              const gc = o?.medicationConfig?.gradingConfig;
              return gc?.gradingType
                ? gc.gradingType === 'Mandatory'
                : gc?.enabled === true;
            })
            .map((o) => ({
              id: o.id,
              title: (o.title ?? '').trim(),
              idKey: o.id ? `id:${o.id.trim().toLowerCase()}` : '',
              nameKey: normalizeMedicationName(o.title) ? `name:${normalizeMedicationName(o.title)}` : '',
            }))
            .filter((o) => o.title.length > 0);

          // Dedupe medication results by medicationId or normalized medication title (first admin counts)
          const seenMedKeys = new Set<string>();
          const dedupedResults = medicationEntries
            .map((entry) => ({
              medicationId:
                entry.administrationDetails?.gradingResult?.medicationId ??
                entry.administrationDetails?.medicationId,
              orderTitle:
                entry.administrationDetails?.orderTitle ??
                entry.administrationDetails?.gradingResult?.medicationName ??
                entry.administrationDetails?.medicationName ??
                '',
              gradingResult: entry.administrationDetails?.gradingResult,
            }))
            .filter(
              (r): r is typeof r & { gradingResult: NonNullable<typeof r.gradingResult> } =>
                !!r.gradingResult,
            )
            .filter((r) => {
              const key = normalizeMedicationKey(r.orderTitle, r.medicationId);
              if (!key) {
                return true;
              }
              if (seenMedKeys.has(key)) {
                return false;
              }
              seenMedKeys.add(key);
              return true;
            });

          let mandatoryTotal = 0;
          let mandatoryCorrect = 0;
          const medStrengths: Array<{ point: string; example: string }> = [];
          const medWeaknesses: Array<{ point: string; example: string }> = [];
          const administeredKeys = new Set<string>();

          for (const entry of dedupedResults) {
            const gr = entry.gradingResult;
            const medName = entry.orderTitle || gr.medicationName;
            const idKey = entry.medicationId ? `id:${entry.medicationId.trim().toLowerCase()}` : '';
            const nameKey = normalizeMedicationName(medName) ? `name:${normalizeMedicationName(medName)}` : '';
            if (idKey) administeredKeys.add(idKey);
            if (nameKey) administeredKeys.add(nameKey);

            const isCorrect = gr.overallScore >= 100;
            const isMandatory = gr.mandatory !== false;
            if (!isMandatory) {
              continue;
            }
            mandatoryTotal += 1;
            if (isCorrect) {
              mandatoryCorrect += 1;
              medStrengths.push({
                point: medName,
                example: 'Medication administered correctly.',
              });
            } else {
              medWeaknesses.push({
                point: medName,
                example: 'Medication was not administered correctly.',
              });
            }
          }

          // Surface mandatory medications that were never attempted
          for (const order of mandatoryMedicationOrders) {
            const isAdministered =
              (order.idKey && administeredKeys.has(order.idKey)) ||
              (order.nameKey && administeredKeys.has(order.nameKey));
            if (isAdministered) {
              continue;
            }
            mandatoryTotal += 1;
            medWeaknesses.push({
              point: order.title,
              example: 'Mandatory medication was not administered.',
            });
          }

          const avgScore =
            mandatoryTotal > 0 ? Math.round((mandatoryCorrect / mandatoryTotal) * 100) : null;
          item.score = avgScore;
          item.strengths = medStrengths;
          item.weaknesses = medWeaknesses;
          item.summary =
            mandatoryTotal === 0
              ? es
                ? 'No se configuraron órdenes de medicamentos obligatorias.'
                : 'No mandatory medication orders configured.'
              : mandatoryCorrect === mandatoryTotal
                ? es
                  ? 'Todas las órdenes de medicamentos obligatorias se administraron correctamente.'
                  : 'All mandatory medication orders were administered correctly.'
                : es
                  ? `${mandatoryCorrect} de ${mandatoryTotal} orden(es) de medicamentos obligatoria(s) se administraron correctamente.`
                  : `${mandatoryCorrect} of ${mandatoryTotal} mandatory medication order(s) were administered correctly.`;
        }
      });

      // -- DOCUMENTATION: deterministic score + strengths/weaknesses reconciliation --
      // The AI can return an inconsistent response (e.g. score=33 but 0 strengths,
      // all items in weaknesses). We override with the deterministic result so that
      // the displayed strengths/weaknesses always match the numeric score.
      Object.values(rubricItemsRecord).forEach((item) => {
        const sub = String(item.subCategory ?? '').toLowerCase();
        if (sub !== 'documentation' && sub !== 'clinical documentation') {
          return;
        }

        const docConfig = technicalSkillItems.find((ri: ScenarioRubricItem) => {
          const s = String(ri?.subCategory ?? '').toLowerCase();
          return s === 'documentation' || s === 'clinical documentation';
        });
        if (!docConfig?.checklistItems?.length) {
          item.score = null;
          item.summary = es
            ? 'No se configuraron elementos obligatorios de documentación para este escenario.'
            : 'No mandatory clinical documentation items were configured for this scenario.';
          item.weaknesses = [];
          item.recommendations = ['No items identified.'];
          return;
        }

        // ── Normalize & deduplicate checklist items ───────────────────────
        // Scenarios may have stale legacy doc-* text saved before a rename
        // (e.g. "Interventions documented" → "Actions, Assessment & Intervention
        // Documentation"). Normalise the text here so reports always show the
        // current canonical labels.
        // Also deduplicate: if both a legacy doc-* item AND a newer checklist-*
        // item cover the same evaluation rule, the checklist-* duplicate is
        // removed so it doesn't produce spurious Optional criteria in the report.
        const DOC_CANONICAL_TEXTS: Record<string, string> = {
          'doc-1': 'Actions, Assessment & Intervention Documentation',
          'doc-2': 'Medical and health history updated',
          'doc-3': 'Patient emotional response documented',
        };

        // Step 1: normalise legacy doc-* texts
        const normalised = docConfig.checklistItems.map((ci) => {
          const canonical = DOC_CANONICAL_TEXTS[ci.id ?? ''];
          return canonical ? { ...ci, text: canonical } : ci;
        });

        // Step 2: always drop every checklist-* item — they are stale legacy
        // data saved by older versions of the scenario editor and never belong
        // in the documentation scoring regardless of which doc-* items exist.
        const deduplicatedChecklistItems = normalised.filter(
          (ci) => !String(ci.id ?? '').startsWith('checklist-'),
        );

        const docResult = this.computeDocumentationScore(
          deduplicatedChecklistItems,
          studentSummary as Parameters<
            ClinicalDocumentationService['computeDocumentationScore']
          >[1],
          scenario as Parameters<ClinicalDocumentationService['computeDocumentationScore']>[2],
          language,
        );

        // For doc-3 (Patient Emotional Response), AI evaluation takes precedence
        // For other criteria, use deterministic results
        const doc3Items = deduplicatedChecklistItems.filter(
          (ci) =>
            ci.id === 'doc-3' ||
            String(ci.text ?? '')
              .toLowerCase()
              .includes('emotional'),
        );
        const hasDoc3 = doc3Items.length > 0;
        const doc3IsMandatory = doc3Items.some(
          (ci) => ci.status === 'Mandatory' || (ci.mandatory !== false && !ci.status),
        );

        this.logger.debug(`[DOC-3-DEBUG] Found doc3Items: ${doc3Items.length}`);
        if (hasDoc3) {
          this.logger.debug(
            `[DOC-3-DEBUG] doc3 text: "${doc3Items[0].text}", id: "${doc3Items[0].id}", status: "${doc3Items[0].status}", mandatory: ${doc3Items[0].mandatory}`,
          );
          this.logger.debug(`[DOC-3-DEBUG] doc3IsMandatory: ${doc3IsMandatory}`);
        }

        // Check if AI determined doc-3 passed (look for doc-3 in AI strengths and criteriaResults)
        const aiStrengths = item.strengths ?? [];
        const aiCriteriaResults = item.criteriaResults ?? [];

        this.logger.debug(`[DOC-3-DEBUG] AI strengths count: ${aiStrengths.length}`);
        this.logger.debug(`[DOC-3-DEBUG] AI criteriaResults count: ${aiCriteriaResults.length}`);

        // Check both strengths and criteriaResults for doc-3 passed status
        const doc3PassedInAIStrengths = aiStrengths.some((s) =>
          doc3Items.some((ci) =>
            String(s.point ?? '')
              .toLowerCase()
              .includes(
                String(ci.text ?? '')
                  .toLowerCase()
                  .substring(0, 20),
              ),
          ),
        );

        const doc3PassedInCriteria = aiCriteriaResults.some((cr) =>
          doc3Items.some(
            (_ci) =>
              (String(cr.title ?? '')
                .toLowerCase()
                .includes('emotional') ||
                cr.criterionId === 'doc-3') &&
              cr.passed === true,
          ),
        );

        // Fallback: Check deterministically if observation contains emotional keywords
        // This handles cases where AI fails to detect emotional content
        const emotionalKeywords = [
          'emotional',
          'emotion',
          'happy',
          'sad',
          'angry',
          'upset',
          'anxious',
          'worried',
          'scared',
          'fear',
          'frustrated',
          'relieved',
          'calm',
          'nervous',
          'distressed',
          'tearful',
          'crying',
          'laugh',
          'smile',
          'agitated',
        ];

        let doc3PassedDeterministic = false;
        if (hasDoc3) {
          // Check if any action observation contains emotional keywords
          const actions = (studentSummary?.actions ?? []) as Array<{
            notes?: string;
            title?: string;
          }>;
          this.logger.debug(
            `[DOC-3-DETERMINISTIC] Checking ${actions.length} actions for emotional keywords`,
          );
          const hasEmotionalObservation = actions.some((action) => {
            const notes = String(action.notes ?? '').toLowerCase();
            this.logger.debug(
              `[DOC-3-DETERMINISTIC] Action "${action.title ?? ''}": notes="${notes.substring(0, 100)}"`,
            );
            const hasKeyword = emotionalKeywords.some((keyword) => notes.includes(keyword));
            if (hasKeyword) {
              this.logger.debug(
                `[DOC-3-DETERMINISTIC]   ? Found emotional keyword in this action!`,
              );
            }
            return hasKeyword;
          });
          doc3PassedDeterministic = hasEmotionalObservation;
        }

        const doc3PassedInAI =
          doc3PassedInAIStrengths || doc3PassedInCriteria || doc3PassedDeterministic;

        this.logger.debug(`[DOC-3-DEBUG] doc3PassedInAIStrengths: ${doc3PassedInAIStrengths}`);
        this.logger.debug(`[DOC-3-DEBUG] doc3PassedInCriteria: ${doc3PassedInCriteria}`);
        this.logger.debug(`[DOC-3-DEBUG] doc3PassedDeterministic: ${doc3PassedDeterministic}`);
        this.logger.debug(`[DOC-3-DEBUG] doc3PassedInAI (final): ${doc3PassedInAI}`);

        // NOTE: doc-3 is already included in the deterministic calculation (docResult),
        // so we don't need to adjust the totals. The deterministic check uses emotional keywords
        // and is accurate. We just need to ensure AI strengths/weaknesses are used for display.

        // Use the deterministic score directly when mandatory items exist, otherwise null (N/A)
        item.score = docResult.totalMandatory > 0 ? Number(docResult.docScore.toFixed(2)) : null;
        if (docResult.totalMandatory === 0) {
          item.summary = es
            ? 'No se configuraron elementos obligatorios de documentación para este escenario.'
            : 'No mandatory clinical documentation items were configured for this scenario.';
          item.weaknesses = [];
          item.recommendations = ['No items identified.'];
        }

        // Rebuild strengths: use deterministic results for non-doc-3 items, keep AI results for doc-3
        // ONLY include Mandatory items in strengths
        // EXCLUDE doc-3 from deterministic strengths because it's handled separately below
        const deterministicStrengths = docResult.results
          .filter(
            (r) =>
              r.status === 'Mandatory' &&
              r.passed &&
              r.text !== 'Patient emotional response documented' &&
              !String(r.text ?? '')
                .toLowerCase()
                .includes('emotional'),
          )
          .map((r) => ({ point: r.text, example: r.reason }));

        // Add doc-3 to strengths: ONLY if doc-3 is Mandatory and passed (AI or deterministic)
        let doc3StrengthsFromAI: Array<{ point: string; example: string }> = [];
        if (doc3IsMandatory && doc3PassedInAI) {
          // Check if doc-3 passed in AI criteriaResults first
          const doc3PassedInCriteria = aiCriteriaResults.find(
            (cr) =>
              (cr.criterionId === 'doc-3' ||
                String(cr.title ?? '')
                  .toLowerCase()
                  .includes('emotional')) &&
              cr.passed === true,
          );

          if (doc3PassedInCriteria) {
            this.logger.debug(`[DOC-3-STRENGTH] Adding doc-3 to strengths (from AI)`);
            doc3StrengthsFromAI = [
              {
                point: doc3Items[0].text,
                example:
                  doc3PassedInCriteria.rationale ??
                  'Emotional response documented in action observations',
              },
            ];
          } else if (doc3PassedDeterministic) {
            // AI didn't detect it, but deterministic fallback did
            this.logger.debug(
              `[DOC-3-STRENGTH] Adding doc-3 to strengths (from deterministic fallback)`,
            );
            const actions = (studentSummary?.actions ?? []) as Array<{
              notes?: string;
              title?: string;
            }>;
            const actionWithEmotion = actions.find((action) => {
              const notes = String(action.notes ?? '').toLowerCase();
              return emotionalKeywords.some((keyword) => notes.includes(keyword));
            });
            const example = actionWithEmotion
              ? `Observation: '${actionWithEmotion.notes ?? ''}'`
              : 'Emotional response documented in action observations';
            doc3StrengthsFromAI = [
              {
                point: doc3Items[0].text,
                example,
              },
            ];
          }
        }

        item.strengths = [...deterministicStrengths, ...doc3StrengthsFromAI];

        // Rebuild mandatory weaknesses: deterministic failures + doc-3 weakness if failed (AI evaluated)
        // EXCLUDE doc-3 from deterministic weaknesses because it's handled separately below
        const mandatoryFailures = docResult.results.filter(
          (r) =>
            r.status === 'Mandatory' &&
            !r.passed &&
            r.text !== 'Patient emotional response documented' &&
            !String(r.text ?? '')
              .toLowerCase()
              .includes('emotional'),
        );

        // Lookup table: canonical English checklist item text → Spanish.
        // These are the standard doc checklist names used across all scenarios.
        const DOC_ITEM_ES: Record<string, string> = {
          'assessment findings documented via action tab observations':
            'Hallazgos de evaluación documentados mediante observaciones de la pestaña de acciones',
          'assessment findings documented': 'Hallazgos de evaluación documentados',
          'interventions documented via action tab observations':
            'Intervenciones documentadas mediante observaciones de la pestaña de acciones',
          'interventions documented': 'Intervenciones documentadas',
          'vital signs documented': 'Signos vitales documentados',
          'medical & health history updated': 'Historia médica y de salud actualizada',
          'medical history updated': 'Historia médica actualizada',
          'patient emotional response documented': 'Respuesta emocional del paciente documentada',
          'patient education documented': 'Educación al paciente documentada',
        };
        const translateDocText = (text?: string | null) => {
          if (!text) {
            return text ?? '';
          }
          return es ? (DOC_ITEM_ES[text.toLowerCase().trim()] ?? text) : text;
        };

        const deterministicWeaknesses = mandatoryFailures.map((r) => ({
          point: translateDocText(r.text),
          example: r.reason,
        }));

        // Add doc-3 to weaknesses: ONLY if doc-3 is Mandatory and failed (AI or deterministic)
        let doc3WeaknessFromAI: { point: string; example: string } | null = null;
        if (doc3IsMandatory && !doc3PassedInAI) {
          // Check if doc-3 failed in AI criteriaResults first
          const doc3FailedInCriteria = aiCriteriaResults.find(
            (cr) =>
              (cr.criterionId === 'doc-3' ||
                String(cr.title ?? '')
                  .toLowerCase()
                  .includes('emotional')) &&
              cr.passed === false,
          );

          if (doc3FailedInCriteria) {
            this.logger.debug(`[DOC-3-WEAKNESS] Adding doc-3 to weaknesses (from AI)`);
            doc3WeaknessFromAI = {
              point: translateDocText(doc3Items[0].text),
              example:
                doc3FailedInCriteria.rationale ??
                (es
                  ? 'No se documentó respuesta emocional en ninguna observación de acción'
                  : 'No emotional response documented in action observations'),
            };
          } else {
            // AI didn't explicitly fail it, but it's not passed either (deterministic didn't find it)
            this.logger.debug(`[DOC-3-WEAKNESS] Adding doc-3 to weaknesses (not detected)`);
            doc3WeaknessFromAI = {
              point: translateDocText(doc3Items[0].text),
              example: es
                ? 'No se documentó respuesta emocional en ninguna observación de acción'
                : 'No emotional response documented in action observations',
            };
          }
        }

        item.weaknesses = doc3WeaknessFromAI
          ? [...deterministicWeaknesses, doc3WeaknessFromAI]
          : deterministicWeaknesses;

        // Rebuild criteriaResults: include ALL criteria (deterministic + AI)
        // This ensures doc-1 and doc-2 appear in the report UI
        const deterministicCriteriaResults = docResult.results
          .filter((r) => r.status !== 'Exclude')
          .map((r, index) => {
            // Find the matching checklist item to get the ID
            const matchingItem = (deduplicatedChecklistItems ?? []).find(
              (ci) => ci.text === r.text,
            );
            return {
              criterionId: matchingItem?.id ?? `doc-${index + 1}`,
              title: translateDocText(r.text),
              passed: r.passed,
              rationale: r.reason,
            };
          });

        // Merge: use deterministic for doc-1/doc-2, AI for doc-3
        // IMPORTANT: Filter AI results to ONLY include doc-3, exclude doc-1/doc-2 to prevent duplicates
        const doc3CriteriaFromAI = aiCriteriaResults.filter(
          (cr) =>
            (cr.criterionId === 'doc-3' ||
              String(cr.title ?? '')
                .toLowerCase()
                .includes('emotional')) &&
            cr.criterionId !== 'doc-1' &&
            cr.criterionId !== 'doc-2',
        );
        const nonDoc3Criteria = deterministicCriteriaResults.filter(
          (cr) => cr.criterionId !== 'doc-3',
        );

        // If AI didn't return doc-3 but we have doc-3 configured, add it from deterministic fallback
        if (hasDoc3 && doc3CriteriaFromAI.length === 0) {
          this.logger.debug(
            `[DOC-3-CRITERIA] AI didn't return doc-3, adding from deterministic fallback`,
          );
          const actions = (studentSummary?.actions ?? []) as Array<{
            notes?: string;
            title?: string;
          }>;
          const actionWithEmotion = actions.find((action) => {
            const notes = String(action.notes ?? '').toLowerCase();
            return emotionalKeywords.some((keyword) => notes.includes(keyword));
          });
          const rationale = actionWithEmotion
            ? `Observation: '${actionWithEmotion.notes}'`
            : 'No emotional response documented in action observations';
          doc3CriteriaFromAI.push({
            criterionId: 'doc-3',
            title: doc3Items[0].text,
            passed: doc3PassedDeterministic,
            rationale,
          });
        }

        item.criteriaResults = [...nonDoc3Criteria, ...doc3CriteriaFromAI];

        // Track optional completed items for UI display
        // EXCLUDE doc-3 from deterministic optional completed because it's handled separately below
        const optionalCompleted = docResult.results.filter(
          (r) =>
            r.status === 'Optional' &&
            r.passed &&
            r.text !== 'Patient emotional response documented' &&
            !String(r.text ?? '')
              .toLowerCase()
              .includes('emotional'),
        );

        // Add doc-3 to optional completed if it's Optional and passed (AI or deterministic)
        const doc3IsOptional = doc3Items.some((ci) => ci.status === 'Optional');

        if (hasDoc3 && doc3IsOptional && doc3PassedInAI) {
          // Check if doc-3 passed in AI criteriaResults first
          const doc3PassedInCriteria = aiCriteriaResults.find(
            (cr) =>
              (cr.criterionId === 'doc-3' ||
                String(cr.title ?? '')
                  .toLowerCase()
                  .includes('emotional')) &&
              cr.passed === true,
          );

          if (doc3PassedInCriteria) {
            this.logger.debug(`[DOC-3-OPTIONAL] Adding doc-3 to optional completed (from AI)`);
            optionalCompleted.push({
              text: doc3Items[0].text,
              status: 'Optional',
              passed: true,
              reason:
                doc3PassedInCriteria.rationale ??
                'Emotional response documented in action observations',
            });
          } else if (doc3PassedDeterministic) {
            // AI didn't detect it, but deterministic fallback did
            this.logger.debug(
              `[DOC-3-OPTIONAL] Adding doc-3 to optional completed (from deterministic fallback)`,
            );
            const actions = (studentSummary?.actions ?? []) as Array<{
              notes?: string;
              title?: string;
            }>;
            const actionWithEmotion = actions.find((action) => {
              const notes = String(action.notes ?? '').toLowerCase();
              return emotionalKeywords.some((keyword) => notes.includes(keyword));
            });
            const reason = actionWithEmotion
              ? `Observation: '${actionWithEmotion.notes ?? ''}'`
              : 'Emotional response documented in action observations';
            optionalCompleted.push({
              text: doc3Items[0].text,
              status: 'Optional',
              passed: true,
              reason,
            });
          }
        }

        if (optionalCompleted.length > 0) {
          item.actionDetails = optionalCompleted.map((r) => ({
            title: r.text,
            type: 'optional',
            completed: true,
            isCorrect: true,
            isOptional: true,
            response: r.reason,
          }));
        }
      });

      // -- COMMUNICATION: Check if all criteria are disabled --
      Object.values(rubricItemsRecord).forEach((item) => {
        const subComm = String(item.subCategory ?? '').toLowerCase();
        if (subComm !== 'communication') {
          return;
        }

        const scenarioCommRubric = (scenario?.grading?.rubric ?? []).find(
          (r) =>
            String(r?.subCategory ?? '')
              .trim()
              .toLowerCase() === 'communication',
        );
        const commCriteria = scenarioCommRubric?.communicationCriteria ?? [];
        const allCriteriaDisabled =
          commCriteria.length > 0 && commCriteria.every((c) => !c.enabled);
        if (allCriteriaDisabled) {
          item.score = null;
          // Check if Team Communication is Mandatory
          const isTeamCommunicationMandatory =
            (
              scenario as unknown as Record<string, unknown> & {
                teamCommunication?: { typeRequirement?: string };
              }
            )?.teamCommunication?.typeRequirement === 'Mandatory';

          if (isTeamCommunicationMandatory) {
            // If Team Communication is Mandatory, show that message instead
            item.summary = es
              ? 'Solo se evalúa la comunicación en equipo (SBAR) en este escenario.'
              : 'Only Team Communication (SBAR) is evaluated in this scenario.';
          } else {
            // Standard "not evaluated" message when Team Communication is not mandatory
            item.summary = es
              ? 'La comunicación no se evalúa para este escenario.'
              : 'Communication is not evaluated for this scenario.';
          }
          item.strengths = [];
          item.weaknesses = [];
          item.recommendations = [];
          item.criteriaResults = [];
        }
      });
      // -----------------------------------------------------------------------------

      // Calculate totalScore manually using formula: ∑(Score × Weight) / 100
      // Score is a percentage (0-100), Weight is the rubric weight
      let totalWeightedScore = 0;
      let totalWeight = 0;

      this.logger.debug(
        'Debug - rubricItemsRecord before calculation:',
        JSON.stringify(
          Object.values(rubricItemsRecord).map((item) => ({
            name: item.name,
            subCategory: item.subCategory,
            weight: item.weight,
            score: item.score,
          })),
          null,
          2,
        ),
      );

      Object.values(rubricItemsRecord).forEach((item) => {
        const weight = typeof item.weight === 'number' && isFinite(item.weight) ? item.weight : 0;
        const rawScore = item.score;

        // Skip N/A / null scores from totalWeight and totalWeightedScore
        if (rawScore === null || rawScore === undefined) {
          item.weightedScore = undefined;
          this.logger.debug(
            `Debug - Item: ${item.name} is N/A (null/undefined score), excluded from weighted totals`,
          );
          return;
        }

        const score = typeof rawScore === 'number' && isFinite(rawScore) ? rawScore : 0;

        // Score is a percentage (0-100), apply weight to get weighted score
        const weightedScore = (score * weight) / 100;

        // Keep score as percentage for display, store weighted score separately
        item.maxScore = 100;
        item.weightedScore = Number(weightedScore.toFixed(2));

        this.logger.debug(
          `Debug - Item: ${item.name}, weight: ${weight}, score: ${score}, weightedScore: ${weightedScore}`,
        );

        totalWeightedScore += weightedScore;
        totalWeight += weight;
      });

      rubrics.totalScore = Number(totalWeightedScore.toFixed(2));
      rubrics.totalWeight = totalWeight;
      this.logger.debug(
        'Rubrics Calculation - totalScore:',
        String(rubrics.totalScore),
        'totalWeight:',
        String(rubrics.totalWeight),
      );

      // -- FINAL SAFETY FILTER: Remove Optional items from strengths/weaknesses --
      // This applies ONLY to rubrics with checklist items (e.g., Documentation, Communication)
      // Actions & PPE are already handled deterministically, so skip them
      Object.values(rubricItemsRecord).forEach((item) => {
        const subCat = String(item.subCategory ?? '').toLowerCase();

        // Skip rubrics that are already handled deterministically
        if (subCat === 'action' || subCat === 'expected actions') {
          return;
        }

        const rubricConfig = technicalSkillItems.find(
          (ri: ScenarioRubricItem) => String(ri?.subCategory ?? '').toLowerCase() === subCat,
        );

        if (!rubricConfig?.checklistItems?.length) {
          return;
        }

        const mandatoryChecklistTexts = new Set(
          rubricConfig.checklistItems
            .filter((ci) => ci.status === 'Mandatory' || (ci.mandatory !== false && !ci.status))
            .map((ci) => String(ci.text ?? '').toLowerCase()),
        );

        // For Documentation, strengths are already filtered, so skip
        // For Communication/Timeline, filter strengths to only include Mandatory items
        if (subCat !== 'documentation' && Array.isArray(item.strengths)) {
          item.strengths = item.strengths.filter((s) => {
            const pointLower = String(s.point ?? '').toLowerCase();
            // Check if this strength matches any mandatory checklist item
            return Array.from(mandatoryChecklistTexts).some(
              (mandatoryText) =>
                pointLower.includes(mandatoryText.substring(0, 20)) ||
                mandatoryText.includes(pointLower.substring(0, 20)),
            );
          });
        }

        // Filter weaknesses to only include Mandatory items (for all checklist-based rubrics)
        if (Array.isArray(item.weaknesses)) {
          item.weaknesses = item.weaknesses.filter((w) => {
            const pointLower = String(w.point ?? '').toLowerCase();
            // Check if this weakness matches any mandatory checklist item
            return Array.from(mandatoryChecklistTexts).some(
              (mandatoryText) =>
                pointLower.includes(mandatoryText.substring(0, 20)) ||
                mandatoryText.includes(pointLower.substring(0, 20)),
            );
          });
        }

        // Deduplicate: if the same strength appears in weaknesses, remove it from strengths.
        // Weaknesses take precedence because they have specific evidence/rationale.
        if (Array.isArray(item.strengths) && Array.isArray(item.weaknesses)) {
          const weaknessSet = new Set(
            item.weaknesses.map((w) =>
              JSON.stringify({
                point: String(w.point ?? '').toLowerCase(),
                example: String(w.example ?? '').toLowerCase(),
              }),
            ),
          );
          item.strengths = item.strengths.filter((s) => {
            const strengthKey = JSON.stringify({
              point: String(s.point ?? '').toLowerCase(),
              example: String(s.example ?? '').toLowerCase(),
            });
            return !weaknessSet.has(strengthKey);
          });
        }
      });
      // --------------------------------------------------------------------------

      // Prepare the final unified analysis object
      // This ensures that createReportWithAI finds rubrics and overall at the top level
      const finalAnalysis = {
        ...analysisRaw,
        ...comm, // Spread comm to bring rubrics and overall to top level if they were nested
        rubrics,
        overall: comm.overall ??
          analysisRaw.overall ?? {
            summary: comm.feedback ?? 'Assessment completed',
            score: rubrics.totalScore,
            label: this.getPerformanceCategory(rubrics.totalScore),
          },
        communicationAssessment: comm,
      };

      return finalAnalysis;
    } catch (error: unknown) {
      const errWithResponse = error as { response?: { data?: unknown } };
      console.error('OpenAI API error:', errWithResponse?.response?.data ?? error);
      throw error;
    }
  }

  private formatSecondsToTime(seconds: number): string {
    return this.timelineTimingService.formatSecondsToTime(seconds);
  }

  // (Sequencing & Prioritization logic has been moved to SequencingService)

  private enrichTimingData(data: unknown, scenarioStart: number): unknown {
    return this.timelineTimingService.enrichTimingData(data, scenarioStart);
  }

  /**
   * Deterministic medications analysis
   */
  private computeMedicationsAnalysis(
    studentSummary: StudentSummary | null | undefined,
    medicationsItem: MedicationsItem | null | undefined,
  ): MedicationsAnalysisResult {
    return this.timelineTimingService.computeMedicationsAnalysis(studentSummary, medicationsItem);
  }

  /**
   * Deterministic vitals analysis based only on the student's summary
   * and the list of required vitals from the rubric/scenario.
   * Returns which required vitals were taken vs missing.
   *
   * Supports new summaryByCategory.vitals structure where vitals are grouped by type:
   * {
   *   "Heart Rate": [{ id, title, details, timestamp, timestampValue, elapsedSeconds, ... }, ...],
   *   "Blood Pressure": [...],
   *   ...
   * }
   *
   * Handles two types of requirements:
   * - "Required Within X minutes": First reading must be within X minutes of scenario start
   * - "Reassess Within X minutes": All subsequent readings must be within X minutes of each other
   */
  private computeVitalsAnalysisFromSummary(
    studentSummary: StudentSummary | null | undefined,
    requiredVitals: VitalConfig[],
    scenarioStartTime?: string,
    actionsTimeline?: unknown[],
  ) {
    return this.timelineTimingService.computeVitalsAnalysisFromSummary(
      studentSummary,
      requiredVitals,
      scenarioStartTime,
      actionsTimeline,
    );
  }
  /**
   * Deterministic expected actions analysis based on:
   * - studentSummary.actions / studentSummary.medications
   * - scenario.expectedActions / expectedActionsList
   * - unit.actions (pre-defined correct answers)
   */
  private computeActionsAnalysisFromSummary(
    studentSummary: ActionStudentSummaryLike | null | undefined,
    expectedActions: Record<string, unknown> | undefined,
    expectedActionsList: Array<{ name?: string; title?: string }> | undefined,
    unitActions: Array<{ name?: string; title?: string }> | undefined,
  ) {
    return this.actionsService.computeActionsAnalysisFromSummary(
      studentSummary,
      expectedActions as Parameters<
        ActionsInterventionsService['computeActionsAnalysisFromSummary']
      >[1],
      expectedActionsList,
      unitActions,
    );
  }
  private computePPEScore(
    checklistItems: Array<{
      id: string;
      text: string;
      status?: 'Mandatory' | 'Optional' | 'Exclude';
      mandatory?: boolean;
    }>,
    transcript: string,
    actionLog: Array<{ label: string; timestamp: string; type: string }> = [],
  ) {
    return this.ppeService.computePPEScore(checklistItems, transcript, actionLog);
  }
  /**
   * Calculates deterministic marks for actions in the timeline.
   * - Result Pick: +1 if correct, 0 if incorrect
   * - Drag & Drop: +1 if correct order
   * - Question & Response: Similarity check against ideal response
   * - Distractor: tracked but excluded from score denominator
   * - Practice Mode: any correct attempt; Assessment Mode: first attempt only
   */
  private async computeDeterministicActionMarks(
    actionsTimeline: ActionAttempt[],
    scenarioActions: Parameters<ActionsInterventionsService['computeDeterministicActionMarks']>[1],
    mode: 'Practice' | 'Assessment' = 'Assessment',
    summaryByCategory?: Parameters<
      ActionsInterventionsService['computeDeterministicActionMarks']
    >[3],
  ): Promise<DeterministicActionMarksResult> {
    return this.actionsService.computeDeterministicActionMarks(
      actionsTimeline,
      scenarioActions,
      mode,
      summaryByCategory,
    );
  }

  private async evaluateActionAttempt(
    attempt: ActionAttempt,
    actionDef: Parameters<ActionsInterventionsService['evaluateActionAttempt']>[1],
  ): Promise<boolean> {
    return this.actionsService.evaluateActionAttempt(attempt, actionDef);
  }

  private calculateScoreByCategory(
    actionMarks: DeterministicActionMarksResult,
    scenario: Parameters<ActionsInterventionsService['calculateScoreByCategory']>[1],
  ) {
    return this.actionsService.calculateScoreByCategory(actionMarks, scenario);
  }

  private calculateSimilarity(s1: string, s2: string): number {
    return this.actionsService.calculateSimilarity(s1, s2);
  }

  private buildActionFeedback(details: ActionDetail[]) {
    return this.actionsService.buildActionFeedback(details);
  }

  private getPerformanceCategory(percentage: number): string {
    return this.actionsService.getPerformanceCategory(percentage);
  }

  private generateVitalActionFeedback(
    actionsTimeline: ActionAttempt[],
    scenarioActions: ScenarioActionDef[],
    summaryByCategory?: Parameters<ActionsInterventionsService['generateVitalActionFeedback']>[2],
    summaryEntries?: ActionAttempt[],
  ) {
    return this.actionsService.generateVitalActionFeedback(
      actionsTimeline,
      scenarioActions,
      summaryByCategory,
      summaryEntries,
    );
  }

  private computeDocumentationScore(
    checklistItems: Parameters<ClinicalDocumentationService['computeDocumentationScore']>[0],
    studentSummary: Parameters<ClinicalDocumentationService['computeDocumentationScore']>[1],
    scenario: Parameters<ClinicalDocumentationService['computeDocumentationScore']>[2],
    language: 'en' | 'es' = 'en',
  ) {
    return this.documentationService.computeDocumentationScore(
      checklistItems,
      studentSummary,
      scenario,
      language,
    );
  }

  private buildDocumentationInstructions(
    studentSummary: Parameters<ClinicalDocumentationService['buildDocumentationInstructions']>[0],
    technicalSkillItems: Parameters<
      ClinicalDocumentationService['buildDocumentationInstructions']
    >[1],
    scenario: Parameters<ClinicalDocumentationService['buildDocumentationInstructions']>[2],
  ) {
    return this.documentationService.buildDocumentationInstructions(
      studentSummary,
      technicalSkillItems,
      scenario,
    );
  }
  async generateExcelReport(startDate?: string, endDate?: string): Promise<Buffer> {
    const allReports = (await this.getReportsFresh()) as unknown as ReportExportRow[];

    // Filter reports by date range if provided
    let reports = allReports;
    if (startDate ?? endDate) {
      reports = allReports.filter((report: ReportExportRow) => {
        const reportDate = report.scenarioStartTime ?? report.createdAt;
        if (!reportDate) {
          return false;
        }

        // Convert report date to CST for comparison
        const reportTime = new Date(reportDate).toLocaleString('en-US', {
          timeZone: 'America/Chicago',
        });
        const reportDateOnly = new Date(reportTime).toDateString();

        if (startDate && endDate) {
          const startDateOnly = new Date(startDate).toDateString();
          const endDateOnly = new Date(endDate).toDateString();
          return reportDateOnly >= startDateOnly && reportDateOnly <= endDateOnly;
        } else if (startDate) {
          const startDateOnly = new Date(startDate).toDateString();
          return reportDateOnly >= startDateOnly;
        } else if (endDate) {
          const endDateOnly = new Date(endDate).toDateString();
          return reportDateOnly <= endDateOnly;
        }
        return true;
      });
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Simulation Reports');

    // Define columns
    worksheet.columns = [
      { header: 'Report ID', key: 'id', width: 20 },
      { header: 'Student Name', key: 'studentName', width: 25 },
      { header: 'Student Class', key: 'studentClass', width: 20 },
      { header: 'Scenario Title', key: 'scenarioTitle', width: 30 },
      { header: 'Start Time', key: 'startTime', width: 25 },
      { header: 'End Time', key: 'endTime', width: 25 },
      { header: 'Duration', key: 'duration', width: 15 },
      { header: 'Score', key: 'score', width: 10 },
    ];

    // Style header row
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFF6600' },
    };

    // Add data rows
    reports.forEach((report: ReportExportRow) => {
      const startTime = report.scenarioStartTime
        ? this.formatDateTime(report.scenarioStartTime)
        : 'N/A';

      const endTime = report.scenarioEndTime ? this.formatDateTime(report.scenarioEndTime) : 'N/A';

      const duration = this.calculateDuration(
        report.scenarioStartTime,
        report.scenarioEndTime,
        report.totalTimeSeconds,
      );

      const scenario = this.jsonDataService.getScenarioById(report.scenarioId ?? '');

      worksheet.addRow({
        id: report.id ?? 'N/A',
        studentName: report.studentName ?? 'N/A',
        studentClass: report.studentClass ?? 'N/A',
        scenarioTitle: scenario?.title ?? report.scenarioTitle ?? 'N/A',
        startTime,
        endTime,
        duration,
        score: report.score ?? 0,
      });
    });

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private formatDateTime(timestamp: string | Date): string {
    if (!timestamp) {
      return 'N/A';
    }

    try {
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) {
        return 'N/A';
      }

      // Format: "09 Apr 2026, 03:53 PM"
      const options: Intl.DateTimeFormatOptions = {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZone: 'America/Chicago',
      };

      return date.toLocaleString('en-US', options);
    } catch (error) {
      return 'N/A';
    }
  }

  private calculateDuration(
    startTime?: string | Date,
    endTime?: string | Date,
    totalTimeSeconds?: number,
  ): string {
    // If totalTimeSeconds is provided, use it
    if (totalTimeSeconds && totalTimeSeconds > 0) {
      return this.formatDuration(totalTimeSeconds);
    }

    // Otherwise calculate from start and end times
    if (!startTime || !endTime) {
      return 'N/A';
    }

    try {
      const start = new Date(startTime).getTime();
      const end = new Date(endTime).getTime();

      if (isNaN(start) || isNaN(end)) {
        return 'N/A';
      }

      const durationSeconds = Math.floor((end - start) / 1000);
      return this.formatDuration(durationSeconds);
    } catch (error) {
      return 'N/A';
    }
  }

  private formatDuration(seconds: number): string {
    if (seconds < 0) {
      return 'N/A';
    }

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    if (minutes === 0) {
      return `${remainingSeconds} sec`;
    }

    return `${minutes} min ${remainingSeconds} sec`;
  }
}

interface BuildDynamicAssessmentArgs {
  messages: Array<{
    id: string;
    timestamp: string;
    text: string;
    speaker: 'student' | 'avatar';
  }>;
  scenario?: Scenario;
  expectedActions?: {
    labs?: string[];
    imaging?: string[];
    physicalExam?: string[];
    medications?: string[];
  };
  actions?: unknown[];
}

interface PatientDataCoverage {
  coverage: number;
  askedFields: string[];
  missingFields: string[];
  criticalMissing: string[];
  availableFields?: string[];
}

interface PhaseTaskAnalysis {
  completedPhases: number;
  totalPhases: number;
  completedTasks: number;
  totalTasks: number;
  phaseDetails: PhaseDetail[];
}

interface PhaseDetail {
  phaseId: string;
  phaseName: string;
  completedTasks: number;
  totalTasks: number;
  tasks: TaskDetail[];
}

interface TaskDetail {
  taskId: string;
  taskLabel: string;
  required: boolean;
  completed: boolean;
}

interface ActionsAnalysis {
  totalExpected: number;
  totalMentioned: number;
  totalTaken: number;
  mentionedInConversation: {
    labs: number;
    imaging: number;
    physicalExam: number;
    medications: number;
  };
  completionRate: number;
}

interface ConversationQuality {
  messageCount: number;
  avgResponseLength: number;
  professionalismScore: number;
  questionCount: number;
  engagementScore: number;
}

export interface ScoreComponents {
  communication: number;
  clinicalJudgment: number;
  technicalAccuracy: number;
  ethicalCompetence: number;
  reflection: number;
  overallScore: number;
}

// Simple, deterministic scoring based on whether the student asked about key topics
// and referenced expected actions. This replaces the AI call with a static method.
interface SendReportEmailOptions {
  reportId: string;
  userId: string;
  recipient?: string;
  message?: string;
  studentName?: string;
  studentClass?: string;
  key?: string;
}

export function normalize(text: string): string {
  return (text || '').toLowerCase();
}
