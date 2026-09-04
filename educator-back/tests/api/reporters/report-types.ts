export type ScenarioType = 'POSITIVE' | 'NEGATIVE' | 'UNKNOWN';
export type TestStatus = 'Passed' | 'Failed' | 'Skipped';

export interface TestSummaryRow {
  title: string;
  description: string;
  status: TestStatus;
  scenarioType: ScenarioType;
  fileName: string;
  moduleName: string;
  location: string;
  durationMs: number;
  expectedResult: string;
  actualResult: string;
  whyPassed: string;
  whyFailed: string;
}

export interface FileSummary {
  name: string;
  count: number;
  tests: TestSummaryRow[];
}

export interface ModuleSummary {
  name: string;
  tests: TestSummaryRow[];
  files: FileSummary[];
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
  durationMs?: number;
  durationDisplay?: string;
  modules: ModuleSummary[];
}
