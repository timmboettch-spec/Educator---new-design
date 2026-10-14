import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SimulationReport } from '../entities/simulation-report.entity';
import { ReportModeType } from 'src/common/constants/simulation-report.constants';
import type {
  ReportCommonActionTracker,
  ReportCommunicationAssessment,
  ReportScoreJson,
  ReportSummaryByCategory,
  ReportSummaryEntry,
} from 'src/common/interfaces';

export class SimulationReportResponseDto implements SimulationReport {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  id!: string;

  @ApiProperty({ example: '7c9e6679-7425-40de-944b-e07fc1f90ae7' })
  studentId!: string;

  @ApiProperty({ example: 'Ava Thompson', nullable: true })
  studentName!: string | null;

  @ApiProperty({ example: 'cardiac-arrest-101', nullable: true })
  scenarioId!: string | null;

  @ApiProperty({ example: 'tr_8f14e45fceea167a', nullable: true })
  transcriptId!: string | null;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z', nullable: true })
  viewedAt!: Date | null;

  @ApiProperty({ example: '9b2e1a34-1111-4f2a-8b3c-2c963f66afa6', nullable: true })
  viewedBy!: string | null;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  updatedAt!: Date;

  @ApiPropertyOptional({ example: null, nullable: true })
  deletedAt?: Date | null;

  @ApiProperty({ example: 'report-1787129912644', nullable: true })
  reportId!: string | null;

  @ApiProperty({ example: 'DELL', nullable: true })
  key!: string | null;

  @ApiProperty({ example: 'LIN-4RJR', nullable: true })
  userId!: string | null;

  @ApiProperty({ example: 'LIN-4RJR', nullable: true })
  studentCode!: string | null;

  @ApiProperty({ example: 'Line Test', nullable: true })
  studentClass!: string | null;

  @ApiProperty({ example: 'Post-Op Cardiac Assessment', nullable: true })
  scenarioTitle!: string | null;

  @ApiProperty({ example: '2026-08-19T08:47:49.913Z', nullable: true })
  scenarioStartTime!: Date | null;

  @ApiProperty({ example: '2026-08-19T08:58:14.637Z', nullable: true })
  scenarioEndTime!: Date | null;

  @ApiProperty({ example: 622, nullable: true })
  totalTimeSeconds!: number | null;

  @ApiProperty({ enum: ReportModeType, example: ReportModeType.ASSESSMENT, nullable: true })
  mode!: ReportModeType | null;

  @ApiProperty({ example: 2, nullable: true })
  attemptNumber!: number | null;

  @ApiProperty({ example: 78.5, nullable: true })
  score!: number | null;

  @ApiProperty({ example: 'Proficient', nullable: true })
  performanceLabel!: string | null;

  @ApiProperty({
    example: {
      communication: 3,
      communicationLabel: 'Satisfactory',
      overallScore: 68,
      overallLabel: 'Satisfactory',
      rubricsTotal: 68,
    },
    nullable: true,
  })
  scoreJson!: ReportScoreJson | null;

  @ApiProperty({ example: 'Assessment completed', nullable: true })
  summary!: string | null;

  @ApiProperty({ example: [{ title: 'Vitals checked', category: 'vitals' }], nullable: true })
  summaryEntries!: ReportSummaryEntry[] | null;

  @ApiProperty({ example: { vitals: { 'Heart Rate': ['88 bpm'] }, allergies: '' }, nullable: true })
  summaryByCategory!: ReportSummaryByCategory | null;

  @ApiProperty({ example: 'Good SBAR handover; reassess pain sooner.', nullable: true })
  feedback!: string | null;

  @ApiProperty({
    example: {
      selectedPPE: ['Gloves', 'Mask'],
      selectedEnvironmental: 'Bed Lowered',
      actionLog: [],
    },
    nullable: true,
  })
  commonActionTracker!: ReportCommonActionTracker | null;

  @ApiProperty({
    example: {
      overall: { score: 68, label: 'Satisfactory' },
      sbarStatus: 'Satisfactory',
      sbarScore: 80,
    },
    nullable: true,
  })
  communicationAssessment!: ReportCommunicationAssessment | null;

  @ApiProperty({ example: 'Completed 5 of 7 required actions.', nullable: true })
  rubricsSummary!: string | null;

  @ApiProperty({ example: 12, nullable: true })
  rubricsTotal!: number | null;

  @ApiProperty({
    example: 'I should have checked allergies before giving morphine.',
    nullable: true,
  })
  debriefReflection!: string | null;

  @ApiProperty({
    example: {
      'Actions & Interventions': { weight: 30, score: 66.67, mandatoryCount: 3, completedCount: 2 },
    },
    nullable: true,
  })
  actionScores!: object | null;

  @ApiProperty({ example: { totalMandatory: 5, completedMandatory: 3 }, nullable: true })
  actionSummary!: object | null;

  @ApiProperty({ example: [{ title: 'Hand hygiene', isCorrect: true }], nullable: true })
  mandatoryActions!: object[] | null;

  @ApiProperty({ example: [{ title: 'Elevate legs', isOptional: true }], nullable: true })
  optionalActions!: object[] | null;

  @ApiProperty({ example: [{ title: 'Give oral fluids', isCorrect: false }], nullable: true })
  distractorActions!: object[] | null;
}
