import { Type } from 'class-transformer';
import { IsString, IsOptional, IsIn, IsNumber, IsBoolean } from 'class-validator';

import { CompletionStatus } from '../telemetry.service';

/**
 * Schema version for login session telemetry events.
 */
export const LOGIN_SESSION_SCHEMA_VERSION = '1.0.0';

/**
 * Schema version for scenario telemetry events.
 */
export const SCENARIO_SCHEMA_VERSION = '1.0.0';

/**
 * Schema version for page view telemetry events.
 */
export const PAGE_VIEW_SCHEMA_VERSION = '1.0.0';

export class TrackLoginSessionStartedDto {
  @IsString()
  loginSessionId!: string;

  @IsString()
  studentCode!: string;

  @IsString()
  loginTimestamp!: string;

  @IsString()
  @IsOptional()
  deviceType?: string;

  @IsString()
  @IsOptional()
  platform?: string;

  @IsString()
  @IsOptional()
  authMethod?: string;

  @IsString()
  schemaVersion!: string;
}

export class TrackLoginSessionEndedDto {
  @IsString()
  loginSessionId!: string;

  @IsString()
  studentCode!: string;

  @IsString()
  logoutTimestamp!: string;

  @IsNumber()
  @Type(() => Number)
  sessionDurationMs!: number;

  @IsString()
  @IsIn(['Logout', 'Timeout', 'Expired'])
  endReason!: 'Logout' | 'Timeout' | 'Expired';

  @IsString()
  schemaVersion!: string;
}

export class TrackPageViewDto {
  @IsString()
  @IsOptional()
  loginSessionId?: string;

  @IsString()
  @IsOptional()
  studentCode?: string;

  @IsString()
  pagePath!: string;

  @IsString()
  @IsOptional()
  pageTitle?: string;

  @IsString()
  @IsOptional()
  referrer?: string;

  @IsString()
  timestamp!: string;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  durationMs?: number;

  @IsString()
  schemaVersion!: string;
}

export class TrackScenarioStartedDto {
  @IsString()
  scenarioSessionId!: string;

  @IsString()
  loginSessionId!: string;

  @IsString()
  transcriptId!: string;

  @IsString()
  studentCode!: string;

  @IsString()
  scenarioId!: string;

  @IsString()
  scenarioName!: string;

  @IsString()
  @IsIn(['Practice', 'Assessment'])
  scenarioType!: 'Practice' | 'Assessment';

  @IsString()
  startTimestamp!: string;

  @IsString()
  schemaVersion!: string;
}

export class TrackScenarioCompletedDto {
  @IsString()
  scenarioSessionId!: string;

  @IsString()
  loginSessionId!: string;

  @IsString()
  transcriptId!: string;

  @IsString()
  studentCode!: string;

  @IsString()
  scenarioId!: string;

  @IsString()
  scenarioName!: string;

  @IsString()
  @IsIn(['Practice', 'Assessment'])
  scenarioType!: 'Practice' | 'Assessment';

  @IsNumber()
  @Type(() => Number)
  durationMs!: number;

  @IsString()
  @IsIn(['Completed', 'Submitted', 'Abandoned', 'TimedOut'])
  completionStatus!: CompletionStatus;

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
  endTimestamp!: string;

  @IsString()
  schemaVersion!: string;
}
