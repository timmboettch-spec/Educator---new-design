import {
  IsNotEmpty,
  IsString,
  IsObject,
  IsArray,
  IsUUID,
  ValidateNested,
  IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateSimulationReportDto {
  @IsNotEmpty()
  @IsUUID('4')
  student_id!: string;

  @IsNotEmpty()
  @IsString()
  student_name!: string;

  @IsNotEmpty()
  @IsString()
  scenario_id!: string;

  @IsNotEmpty()
  @IsObject()
  report_data!: object;

  @IsOptional()
  @IsString()
  report_id?: string;

  @IsOptional()
  @IsString()
  report_key?: string;

  @IsOptional()
  @IsString()
  report_type?: string;
}

export class BulkCreateSimulationReportDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSimulationReportDto)
  reports!: CreateSimulationReportDto[];
}

export interface ClassAttentionMetadata {
  classId: string;
  reportCount: number;
  unreadReportCount: number;
  needsAttention: boolean;
}

// ─── User Transcript ──────────────────────────────────────────────────────────

/** Internal intermediate shape — used only within the service pipeline */
export interface TranscriptEventDto {
  id: string;
  timestamp: string | null;
  simulationTime: string | null;
  type: string;
  title: string | null;
  category: string | null;
  subCategory: string | null;
  speaker: string | null;
  startedAt: string | null;
  endedAt: string | null;
  duration: number | null;
  status: string | null;
  transcript: string | null;
  metadata: Record<string, unknown>;
}

/** Allowed speaker values — mirrors the frontend TranscriptMessage.speaker union */
export type TranscriptSpeaker =
  'user' | 'assistant' | 'provider' | 'sbar_report' | 'system' | 'order' | 'student_team_comm';

/**
 * Public-facing message shape — mirrors the frontend TranscriptMessage interface
 * so the API response can be consumed directly without transformation.
 */
export interface TranscriptMessageDto {
  id: string;
  speaker: TranscriptSpeaker;
  message: string;
  timestamp: string; // wall-clock display string
  timestampValue?: number; // epoch ms for wall-clock derivation
  elapsedTime?: string; // mm:ss since scenario start
  elapsedSeconds?: number; // numeric ordering key
  duration?: number;
  _orderKey?: number; // same as elapsedSeconds — for client-side sorting
  _originalIndex?: number; // original array index for stable tiebreaker
}

export interface TranscriptHeaderDto {
  studentName: string;
  studentCode: string;
  className: string;
  simulationName: string;
  simulationType: string | null;
  /** Attempt mode — "Practice" or "Assessment". Extracted from report.mode. */
  mode: string | null;
  attemptId: string;
  realDate: string;
  realTime: string;
  simulationDate: string | null;
  simulationTime: string | null;
  totalDuration: number | null;
}

/**
 * Mirrors the frontend SummaryEntry interface — passed through verbatim so the
 * client can consume it without further transformation.
 */
export interface SummaryEntryDto {
  id: string;
  category: string;
  title: string;
  details?: string;
  type?: string;
  timestamp: string;
  timestampValue: number;
  startTimestampValue?: number;
  elapsedTime?: string;
  elapsedSeconds?: number;
  duration?: number;
  score?: number;
  question?: string;
  answer?: string;
  correct?: boolean;
  notes?: string;
  observations?: string;
  vitals?: Record<string, unknown> | unknown[] | string | null;
  sbarPrompt?: string;
  sbarSubmission?: string;
  sbarQualitativeResult?: string;
  sbarStartElapsed?: string;
  sbarSubmitElapsed?: string;
  sbarStartMs?: number;
  sbarSubmitMs?: number;
  administrationDetails?: Record<string, unknown>;
}

/** Mirrors the frontend CommonActionEntry interface */
export interface CommonActionDto {
  label: string;
  timestamp: string;
  type: 'infection' | 'privacy' | 'environmental';
  timestampMs: number;
  elapsedTime?: string;
  elapsedSeconds?: number;
  duration?: number;
  question?: string;
  answer?: string;
  correct?: boolean;
  notes?: string;
  observations?: string;
}

export interface UserTranscriptResponseDto {
  header: TranscriptHeaderDto;
  /** Conversation messages — mirrors frontend TranscriptMessage[] */
  messages: TranscriptMessageDto[];
  /** Flattened summaryByCategory entries — mirrors frontend SummaryEntry[] */
  summaryEntries: SummaryEntryDto[];
  /** Common action log — mirrors frontend CommonActionEntry[] */
  commonActions: CommonActionDto[];
  /** Epoch-ms when the scenario started — used by the client to derive elapsedSeconds */
  scenarioStartMs: number | null;
}
