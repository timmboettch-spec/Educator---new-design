import type { SimulationReport } from '../../src/database/entities/simulation-report.entity';

/**
 * Every column mirrored from a `reports.json` entry, all null — spread into a fixture so it
 * only spells out the fields its test actually cares about.
 */
export const emptyReportEntryColumns = (): Omit<
  SimulationReport,
  'id' | 'studentId' | 'studentName' | 'scenarioId' | 'viewedAt' | 'viewedBy' | 'createdAt'
> => ({
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  transcriptId: null,
  reportId: null,
  key: null,
  userId: null,
  studentCode: null,
  studentClass: null,
  scenarioTitle: null,
  scenarioStartTime: null,
  scenarioEndTime: null,
  totalTimeSeconds: null,
  mode: null,
  score: null,
  performanceLabel: null,
  scoreJson: null,
  summary: null,
  summaryEntries: null,
  summaryByCategory: null,
  feedback: null,
  commonActionTracker: null,
  communicationAssessment: null,
  rubricsSummary: null,
  rubricsTotal: null,
  debriefReflection: null,
  actionScores: null,
  actionSummary: null,
  mandatoryActions: null,
  optionalActions: null,
  distractorActions: null,
});
