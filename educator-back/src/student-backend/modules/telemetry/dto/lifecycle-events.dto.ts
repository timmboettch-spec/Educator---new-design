import { Type } from 'class-transformer';
import { IsString, IsNumber, IsOptional, IsIn, IsUUID, IsBoolean } from 'class-validator';

/**
 * Schema version for lifecycle events.
 * Increment when making breaking changes to event schemas.
 */
export const LIFECYCLE_SCHEMA_VERSION = '1.0.0';

/**
 * Closed enum for session completion status.
 */
export enum SessionCompletionStatus {
  Completed = 'Completed',
  Submitted = 'Submitted',
  TimedOut = 'TimedOut',
  Abandoned = 'Abandoned',
}

/**
 * Closed enum for subsystem stop reasons.
 */
export enum SubsystemStopReason {
  Completed = 'Completed',
  TimedOut = 'TimedOut',
  Abandoned = 'Abandoned',
  Error = 'Error',
  Normal = 'Normal',
  PageUnload = 'PageUnload',
  NetworkFailure = 'NetworkFailure',
  Interrupted = 'Interrupted',
  Discard = 'Discard',
  Timeout = 'Timeout',
}

/**
 * Closed enum for grading type.
 */
export enum GradingType {
  Realtime = 'Realtime',
  Deferred = 'Deferred',
}

/**
 * Base interface for all lifecycle events.
 */
interface BaseLifecycleEvent {
  sessionId: string;
  transcriptId: string;
  schemaVersion: string;
}

/**
 * DTO for Sim.Session.Started event.
 * Consolidates fields from SessionStartedEventDto, ScenarioSubsystemStartedEventDto, and TrackScenarioStartedDto.
 */
export class SessionStartedEventDto implements BaseLifecycleEvent {
  @IsUUID('4')
  sessionId!: string;

  @IsString()
  transcriptId!: string;

  @IsUUID('4')
  scenarioInstanceId!: string;

  @IsString()
  scenarioId!: string;

  @IsString()
  scenarioName!: string;

  @IsString()
  @IsOptional()
  scenarioVersion?: string;

  @IsString()
  studentCode!: string;

  @IsString()
  @IsIn(['Practice', 'Assessment'])
  scenarioType!: 'Practice' | 'Assessment';

  @IsString()
  @IsOptional()
  loginSessionId?: string;

  @IsString()
  startedAtUtc!: string;

  @IsString()
  schemaVersion!: string;
}

/**
 * DTO for Sim.Session.Completed event.
 * Consolidates fields from SessionCompletedEventDto, ScenarioSubsystemStoppedEventDto, and TrackScenarioCompletedDto.
 */
export class SessionCompletedEventDto implements BaseLifecycleEvent {
  @IsUUID('4')
  sessionId!: string;

  @IsString()
  transcriptId!: string;

  @IsUUID('4')
  scenarioInstanceId!: string;

  @IsString()
  scenarioId!: string;

  @IsString()
  scenarioName!: string;

  @IsString()
  studentCode!: string;

  @IsString()
  @IsIn(['Practice', 'Assessment'])
  scenarioType!: 'Practice' | 'Assessment';

  @IsString()
  @IsOptional()
  loginSessionId?: string;

  @IsIn(Object.values(SessionCompletionStatus))
  completionStatus!: SessionCompletionStatus;

  @IsNumber()
  @Type(() => Number)
  durationMs!: number;

  @IsString()
  @IsOptional()
  errorCode?: string;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  finalScore?: number;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  passingScore?: number;

  @IsBoolean()
  @IsOptional()
  passedAssessment?: boolean;

  @IsString()
  endedAtUtc!: string;

  @IsString()
  schemaVersion!: string;
}

/**
 * DTO for Sim.Session.Scenario.Started event.
 */
export class ScenarioSubsystemStartedEventDto implements BaseLifecycleEvent {
  @IsUUID('4')
  sessionId!: string;

  @IsString()
  transcriptId!: string;

  @IsUUID('4')
  scenarioInstanceId!: string;

  @IsString()
  scenarioId!: string;

  @IsString()
  @IsOptional()
  scenarioVersion?: string;

  @IsString()
  startedAtUtc!: string;

  @IsString()
  schemaVersion!: string;
}

/**
 * DTO for Sim.Session.Scenario.Stopped event.
 */
export class ScenarioSubsystemStoppedEventDto implements BaseLifecycleEvent {
  @IsUUID('4')
  sessionId!: string;

  @IsString()
  transcriptId!: string;

  @IsUUID('4')
  scenarioInstanceId!: string;

  @IsString()
  scenarioId!: string;

  @IsNumber()
  @Type(() => Number)
  durationMs!: number;

  @IsString()
  @IsIn(['Completed', 'TimedOut', 'Abandoned', 'Error'])
  stopReason!: SubsystemStopReason;

  @IsString()
  @IsOptional()
  errorCode?: string;

  @IsString()
  schemaVersion!: string;
}

/**
 * DTO for Sim.Session.Grading.Started event.
 */
export class GradingSubsystemStartedEventDto implements BaseLifecycleEvent {
  @IsUUID('4')
  sessionId!: string;

  @IsString()
  transcriptId!: string;

  @IsUUID('4')
  gradingInstanceId!: string;

  @IsString()
  @IsIn(['Realtime', 'Deferred'])
  gradingType!: GradingType;

  @IsString()
  startedAtUtc!: string;

  @IsString()
  schemaVersion!: string;
}

/**
 * DTO for Sim.Session.Grading.Stopped event.
 */
export class GradingSubsystemStoppedEventDto implements BaseLifecycleEvent {
  @IsUUID('4')
  sessionId!: string;

  @IsString()
  transcriptId!: string;

  @IsUUID('4')
  gradingInstanceId!: string;

  @IsNumber()
  @Type(() => Number)
  durationMs!: number;

  @IsIn(Object.values(SubsystemStopReason))
  stopReason!: SubsystemStopReason;

  @IsString()
  @IsOptional()
  errorCode?: string;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  score?: number;

  @IsString()
  @IsOptional()
  reportId?: string;

  @IsString()
  @IsOptional()
  studentId?: string;

  @IsString()
  schemaVersion!: string;
}

/**
 * Generic DTO for frontend subsystem lifecycle events.
 * Supports Avatar, SpeechAI, LLM, TTS, and Media subsystems.
 */
export class SubsystemLifecycleEventDto {
  @IsString()
  @IsIn([
    'Sim.Session.Avatar.Started',
    'Sim.Session.Avatar.Stopped',
    'Sim.Session.SpeechAI.Started',
    'Sim.Session.SpeechAI.Stopped',
    'Sim.Session.SttReceived',
    'Sim.Session.SttError',
    'Sim.Session.LLM.Started',
    'Sim.Session.LLM.Stopped',
    'Sim.Session.LlmReceived',
    'Sim.Session.LlmError',
    'Sim.Session.TTS.Started',
    'Sim.Session.TTS.Stopped',
    'Sim.Session.TtsReceived',
    'Sim.Session.TtsError',
    'Sim.Session.Media.Started',
    'Sim.Session.Media.Stopped',
    'Sim.Session.Dialog.Initialized',
    'Sim.Session.Dialog.Failed',
  ])
  eventName!: string;

  @IsUUID('4')
  sessionId!: string;

  @IsString()
  transcriptId!: string;

  @IsUUID('4')
  subsystemInstanceId!: string;

  @IsString()
  startedAtUtc!: string;

  @IsString()
  @IsOptional()
  stoppedAtUtc?: string;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  durationMs?: number;

  @IsString()
  @IsOptional()
  stopReason?: string;

  @IsString()
  @IsOptional()
  errorCode?: string;

  @IsString()
  @IsOptional()
  provider?: string;

  @IsString()
  @IsOptional()
  providerModelVersion?: string;

  @IsString()
  @IsOptional()
  avatarType?: string;

  @IsString()
  @IsOptional()
  voiceId?: string;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  charactersSynthesizedTotal?: number;

  @IsString()
  @IsOptional()
  transport?: string;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  reconnectCount?: number;

  @IsString()
  schemaVersion!: string;
}
