import { ApiProperty } from '@nestjs/swagger';

export class ScenarioAnalyticsDto {
  @ApiProperty()
  scenarioId!: string;

  @ApiProperty()
  scenarioName!: string;

  @ApiProperty()
  totalSessions!: number;

  @ApiProperty()
  completedSessions!: number;

  @ApiProperty()
  abandonedSessions!: number;

  @ApiProperty()
  averageScore?: number;

  @ApiProperty()
  averageDurationMs!: number;

  @ApiProperty()
  practiceCount!: number;

  @ApiProperty()
  assessmentCount!: number;

  @ApiProperty()
  passRate?: number;

  @ApiProperty()
  failureRate?: number;
}

export class UsageAnalyticsDto {
  @ApiProperty({ description: 'Total number of login sessions tracked' })
  totalLoginSessions!: number;

  @ApiProperty({ description: 'Total number of scenario sessions (attempts) tracked' })
  totalScenarioSessions!: number;

  @ApiProperty({ description: 'Number of unique students who participated' })
  uniqueStudents!: number;

  @ApiProperty({
    description:
      'Average duration of scenario sessions in milliseconds (includes completed and abandoned scenarios)',
  })
  averageSessionDurationMs!: number;

  @ApiProperty({ description: 'Number of scenarios completed successfully' })
  totalCompletedScenarios!: number;

  @ApiProperty({ description: 'Number of scenarios abandoned or timed out' })
  totalAbandonedScenarios!: number;
}

export class PageAnalyticsDto {
  @ApiProperty({ description: 'Page path (e.g., /dashboard, /scenarios/*)' })
  pagePath!: string;

  @ApiProperty({ description: 'Human-readable page title' })
  pageTitle!: string;

  @ApiProperty({ description: 'Total number of views for this page' })
  totalViews!: number;

  @ApiProperty({ description: 'Number of unique students who viewed this page' })
  uniqueViewers!: number;

  @ApiProperty({ description: 'Average time spent on page in milliseconds' })
  averageTimeMs!: number;
}

export class AnalyticsResponseDto {
  @ApiProperty({ type: [ScenarioAnalyticsDto] })
  scenarioAnalytics!: ScenarioAnalyticsDto[];

  @ApiProperty()
  usageAnalytics!: UsageAnalyticsDto;

  @ApiProperty({ type: [PageAnalyticsDto] })
  pageAnalytics!: PageAnalyticsDto[];

  @ApiProperty()
  generatedAt!: string;
}

export class ExportAnalyticsQueryDto {
  @ApiProperty({ enum: ['csv', 'json'], required: false, default: 'csv' })
  format?: 'csv' | 'json';

  @ApiProperty({ required: false })
  startDate?: string;

  @ApiProperty({ required: false })
  endDate?: string;
}
