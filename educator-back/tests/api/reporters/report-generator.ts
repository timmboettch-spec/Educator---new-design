import fs from 'fs';
import path from 'path';
import type { ReportData, ScenarioType, TestSummaryRow } from './report-types';
import { renderHtmlReport } from './report-template';

const normalizeText = (value: string): string => value.trim().toLowerCase();

const formatCapitalized = (value: string): string =>
  value.replace(/(^|\s)([a-z])/g, (_, prefix: string, letter: string): string => `${prefix}${letter.toUpperCase()}`);

const inferScenarioType = (title: string): ScenarioType => {
  const negativePatterns = [
    'invalid',
    'missing',
    'unauthorized',
    'expired',
    'duplicate',
    'not found',
    'notfound',
    'error',
    'malformed',
    'empty',
    'forbidden',
    'unauthenticated',
    'bad request',
    'failed',
    'invalid token',
    'invalid email',
    'invalid password',
    'invalid uuid',
    'invalid id',
    'invalid query',
    'invalid path',
    'invalid enum',
    'invalid status',
  ];

  if (negativePatterns.some((pattern) => normalizeText(title).includes(pattern))) {
    return 'NEGATIVE';
  }

  return 'POSITIVE';
};

const createModuleName = (filePath: string): string => {
  const normalized = filePath.replace(/\\/g, '/');
  const parts = normalized.split('/');
  const modulesIndex = parts.indexOf('modules');
  if (modulesIndex !== -1 && parts.length > modulesIndex + 1) {
    const moduleName = parts[modulesIndex + 1];
    return `${formatCapitalized(moduleName)} Module`;
  }
  return 'General Module';
};

const buildFileName = (filePath: string): string => path.basename(filePath);

const createReportRow = (title: string, filePath: string, status: 'Passed' | 'Failed' | 'Skipped', duration: number, errorMessage?: string): TestSummaryRow => {
  const scenarioType = inferScenarioType(title);
  const whyPassed = 'All validation checks passed, including status and response payload assertions.';
  const whyFailed = errorMessage || 'Assertion failed or response validation did not match expected values.';

  return {
    title,
    description: title,
    status,
    scenarioType,
    fileName: buildFileName(filePath),
    moduleName: createModuleName(filePath),
    location: buildFileName(filePath),
    durationMs: duration,
    expectedResult: 'The API should return the expected HTTP status and response body with the expected contract.',
    actualResult: status === 'Failed' ? whyFailed : 'The API responded as expected and all assertions passed successfully.',
    whyPassed,
    whyFailed,
  };
};

const groupByModule = (rows: TestSummaryRow[]): Map<string, TestSummaryRow[]> => {
  const moduleMap = new Map<string, Array<TestSummaryRow>>();
  for (const row of rows) {
    const moduleRows = moduleMap.get(row.moduleName) ?? [];
    moduleRows.push(row);
    moduleMap.set(row.moduleName, moduleRows);
  }
  return moduleMap;
};

const groupFiles = (rows: TestSummaryRow[]): Map<string, TestSummaryRow[]> => {
  const fileMap = new Map<string, Array<TestSummaryRow>>();
  for (const row of rows) {
    const fileRows = fileMap.get(row.fileName) ?? [];
    fileRows.push(row);
    fileMap.set(row.fileName, fileRows);
  }
  return fileMap;
};

const computeModuleSummary = (
  name: string,
  rows: TestSummaryRow[]
): {
  name: string;
  tests: TestSummaryRow[];
  files: Array<{ name: string; count: number; tests: TestSummaryRow[] }>;
  passed: number;
  failed: number;
  skipped: number;
  positive: number;
  negative: number;
} => {
  const fileMap = groupFiles(rows);
  const files = Array.from(fileMap.entries()).map(([name, tests]) => ({
    name,
    count: tests.length,
    tests,
  }));

  const passed = rows.filter((row) => row.status === 'Passed').length;
  const failed = rows.filter((row) => row.status === 'Failed').length;
  const skipped = rows.filter((row) => row.status === 'Skipped').length;
  const positive = rows.filter((row) => row.scenarioType === 'POSITIVE').length;
  const negative = rows.filter((row) => row.scenarioType === 'NEGATIVE').length;

  return {
    name,
    tests: rows,
    files,
    passed,
    failed,
    skipped,
    positive,
    negative,
  };
};

const buildReportData = (rows: TestSummaryRow[]): ReportData => {
  const moduleMap = groupByModule(rows);
  const modules = Array.from(moduleMap.entries()).map(([module, moduleRows]) => computeModuleSummary(module, moduleRows));

  const passed = rows.filter((row) => row.status === 'Passed').length;
  const failed = rows.filter((row) => row.status === 'Failed').length;
  const skipped = rows.filter((row) => row.status === 'Skipped').length;
  const positive = rows.filter((row) => row.scenarioType === 'POSITIVE').length;
  const negative = rows.filter((row) => row.scenarioType === 'NEGATIVE').length;
  const durationMs = rows.reduce((s, r) => s + (r.durationMs || 0), 0);
  const durationDisplay = ((): string => {
    const totalSeconds = Math.round((durationMs || 0) / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
  })();

  return {
    title: 'Educator API Test Report',
    generatedAt: new Date().toISOString(),
    totalTests: rows.length,
    passed,
    failed,
    skipped,
    positive,
    negative,
    durationMs,
    durationDisplay,
    modules,
  };
};

const ensureReportsDirectory = (reportPath: string): void => {
  const directory = path.dirname(reportPath);
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
};

export const generateHtmlReportFromJestResults = (testResults: { testFilePath: string; testResults: Array<{ status: string; failureMessages?: string[]; duration?: number; title: string }> }[]): void => {
  const rows: TestSummaryRow[] = [];

  for (const testResult of testResults) {
    const filePath = testResult.testFilePath;

    for (const test of testResult.testResults) {
      const status = test.status === 'passed' ? 'Passed' : test.status === 'skipped' ? 'Skipped' : 'Failed';
      const errorMessage = test.failureMessages ? test.failureMessages.join(' | ') : undefined;
      const duration = test.duration || 0;

      const row = createReportRow(test.title, filePath, status, duration, errorMessage);
      rows.push(row);
    }
  }

  const reportData = buildReportData(rows);
  const htmlContent = renderHtmlReport(reportData);
  const reportPath = path.resolve(__dirname, '../reports/html/api-test-report.html');

  ensureReportsDirectory(reportPath);
  fs.writeFileSync(reportPath, htmlContent, 'utf-8');
};
