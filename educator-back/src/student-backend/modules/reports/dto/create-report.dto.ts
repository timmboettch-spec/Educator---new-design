import { IsString, IsNumber, IsArray, IsOptional } from 'class-validator';
import { ReportModeType } from 'src/common/constants/simulation-report.constants';

export class CreateReportDto {
  @IsString()
  userId!: string;

  @IsOptional()
  @IsString()
  student_id?: string;

  @IsString()
  studentName!: string;

  @IsString()
  scenarioId!: string;

  @IsString()
  scenarioTitle!: string;

  @IsString()
  transcriptId!: string;

  @IsString()
  studentClass!: string;

  // Optional structured summary data coming from the Summary tab
  @IsOptional()
  @IsArray()
  summaryEntries?: unknown[];

  @IsOptional()
  summaryByCategory?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  actionsTimeline?: Array<{
    title?: string;
    id?: string;
    category?: string;
    type?: string;
    selectedItem?: string;
    notes?: string;
    observation?: string;
    question?: string;
    answer?: string | string[];
    startedAt?: string;
    startedAtValue?: number;
    completedAt?: string;
    completedAtValue?: number;
    durationSeconds?: number;
    currentItems?: string[];
    correctItems?: unknown[];
    vitals?: Record<string, unknown>;
    response?: string | string[];
    grading?: boolean | number;
    status?: string;
    score?: number;
    conceptEvaluations?: unknown[];
  }>;

  // Timing information
  @IsOptional()
  @IsString()
  scenarioStartTime?: string;

  @IsOptional()
  @IsString()
  scenarioEndTime?: string;

  @IsOptional()
  @IsNumber()
  totalTimeSeconds?: number;

  // Common Action Tracker — full state snapshot from CommonActionsPanel
  @IsOptional()
  commonActionTracker?: {
    selectedPPE?: string[];
    selectedPrivacy?: string[];
    selectedEnvironmental?: string | null;
    actionLog?: Array<{
      label: string;
      timestamp: string;
    }>;
  };

  @IsOptional()
  @IsString()
  mode?: ReportModeType;

  @IsOptional()
  @IsString()
  debriefReflection?: string;
}
