export type ScenarioType = 'POSITIVE' | 'NEGATIVE';

export interface TestSummaryRow {
  title: string;
  description: string;
  status: 'Passed' | 'Failed' | 'Skipped';
  scenarioType: ScenarioType;
  fileName: string;
  specFile: string;
  suiteTitle: string;
  location: string;
  durationMs?: number;
  expectedResult: string;
  actualResult: string;
  whyPassed: string;
  whyFailed: string;
  errorShort?: string;
  recommendedCheck?: string;
}

export interface SuiteSummary {
  specFile: string;
  suiteTitle: string;
  tests: TestSummaryRow[];
  passed: number;
  failed: number;
  skipped: number;
  positive: number;
  negative: number;
}

export interface ReportData {
  title: string;
  generatedAt: string;
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  positive: number;
  negative: number;
  durationMs: number;
  durationDisplay: string;
  suites: SuiteSummary[];
}
