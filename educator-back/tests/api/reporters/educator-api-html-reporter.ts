import fs from 'fs';
import path from 'path';
import { renderHtmlReport } from './report-template';
import type { ReportData, ScenarioType, TestSummaryRow } from './report-types';

type Annotation = {
  type?: string;
  description?: string;
};

type TestCaseLike = {
  title: string;
  location: {
    file: string;
  };
  annotations?: Annotation[];
};

type ResultErrorLike = {
  message?: string;
};

type TestResultLike = {
  status: string;
  duration?: number;
  errors?: ResultErrorLike[];
  error?: ResultErrorLike;
};

const normalizeText = (value: string): string => value.trim().toLowerCase();

const formatCapitalized = (value: string): string =>
  value.replace(/(^|\s)([a-z])/g, (_, prefix: string, letter: string): string => `${prefix}${letter.toUpperCase()}`);

const findAnnotation = (testCase: TestCaseLike, match: (type: string) => boolean): Annotation | undefined => {
  return (testCase.annotations ?? []).find((item) => {
    const annotationType = typeof item.type === 'string' ? item.type.toLowerCase() : '';
    return match(annotationType);
  });
};

const firstNonEmpty = (values: Array<string | undefined>): string | undefined => {
  return values.find((value) => typeof value === 'string' && value.trim().length > 0);
};

const inferScenarioType = (testCase: TestCaseLike): ScenarioType => {
  const annotation = findAnnotation(
    testCase,
    (type) => type === 'scenario' || type === 'scenariotype' || type === 'type'
  );

  const rawType = firstNonEmpty([annotation?.description]);
  if (rawType) {
    const value = rawType.trim().toUpperCase();
    if (value === 'POSITIVE' || value === 'NEGATIVE') {
      return value;
    }
  }

  const title = normalizeText(testCase.title);
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

  if (negativePatterns.some((pattern) => title.includes(pattern))) {
    return 'NEGATIVE';
  }

  return 'POSITIVE';
};

const inferDescription = (testCase: TestCaseLike): string => {
  const annotation = findAnnotation(testCase, (type) => type === 'description');
  return firstNonEmpty([annotation?.description, testCase.title]) ?? testCase.title;
};

const inferExpectedResult = (testCase: TestCaseLike): string => {
  const annotation = findAnnotation(testCase, (type) => type === 'expectedresult');
  return (
    firstNonEmpty([annotation?.description]) ??
    'The API should return the expected HTTP status and response body with the expected contract.'
  );
};

const inferActualResult = (result: TestResultLike): string => {
  if (result.status === 'failed') {
    const errorMessage =
      firstNonEmpty([
        (result.errors ?? []).map((error) => error.message ?? '').filter((msg) => msg.length > 0).join(' | '),
        result.error?.message,
      ]) ?? 'The test failed due to an unexpected assertion or runtime error.';

    return errorMessage;
  }

  return 'The API responded as expected and all assertions passed successfully.';
};

const inferWhy = (result: TestResultLike): { whyPassed: string; whyFailed: string } => {
  if (result.status === 'failed') {
    const message =
      firstNonEmpty([
        (result.errors ?? []).map((error) => error.message ?? '').filter((msg) => msg.length > 0).join(' | '),
        result.error?.message,
      ]) ?? 'Assertion failed or response validation did not match expected values.';

    return {
      whyPassed: 'Not applicable for failed tests.',
      whyFailed: message,
    };
  }

  return {
    whyPassed: 'All validation checks passed, including status and response payload assertions.',
    whyFailed: 'Not applicable for passed tests.',
  };
};

const createLocation = (testCase: TestCaseLike): string => {
  const fileName = path.basename(testCase.location.file);
  return `${fileName}`;
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

const createReportRow = (testCase: TestCaseLike, result: TestResultLike): TestSummaryRow => {
  const scenarioType = inferScenarioType(testCase);
  const status = result.status === 'passed' ? 'Passed' : result.status === 'skipped' ? 'Skipped' : 'Failed';
  const { whyPassed, whyFailed } = inferWhy(result);

  return {
    title: inferDescription(testCase),
    description: inferDescription(testCase),
    status,
    scenarioType,
    fileName: buildFileName(testCase.location.file),
    moduleName: createModuleName(testCase.location.file),
    location: createLocation(testCase),
    durationMs: result.duration ?? 0,
    expectedResult: inferExpectedResult(testCase),
    actualResult: inferActualResult(result),
    whyPassed,
    whyFailed,
  };
};

const groupByModule = (rows: TestSummaryRow[]): Map<string, TestSummaryRow[]> => {
  const moduleMap = new Map<string, TestSummaryRow[]>();
  for (const row of rows) {
    const moduleRows = moduleMap.get(row.moduleName) ?? [];
    moduleRows.push(row);
    moduleMap.set(row.moduleName, moduleRows);
  }
  return moduleMap;
};

const groupFiles = (rows: TestSummaryRow[]): Map<string, TestSummaryRow[]> => {
  const fileMap = new Map<string, TestSummaryRow[]>();
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
  const files = Array.from(fileMap.entries()).map(([fileName, tests]) => ({
    name: fileName,
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

const buildReportData = (rows: TestSummaryRow[], overallDurationMs?: number): ReportData => {
  const moduleMap = groupByModule(rows);
  const modules = Array.from(moduleMap.entries()).map(([module, moduleRows]) =>
    computeModuleSummary(module, moduleRows)
  );

  const passed = rows.filter((row) => row.status === 'Passed').length;
  const failed = rows.filter((row) => row.status === 'Failed').length;
  const skipped = rows.filter((row) => row.status === 'Skipped').length;
  const positive = rows.filter((row) => row.scenarioType === 'POSITIVE').length;
  const negative = rows.filter((row) => row.scenarioType === 'NEGATIVE').length;
  
  // Use overall duration from execution state if available, otherwise calculate from individual test durations
  const durationMs = overallDurationMs !== undefined ? overallDurationMs : rows.reduce((sum, row) => sum + (row.durationMs ?? 0), 0);

  const durationDisplay = (() : string => {
    const totalSeconds = Math.round(durationMs / 1000);
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

export default class EducatorApiHtmlReporter {
  private rows: TestSummaryRow[] = [];

  onBegin(): void {
    this.rows = [];
  }

  onTestEnd(testCase: TestCaseLike, result: TestResultLike): void {
    const row = createReportRow(testCase, result);
    this.rows.push(row);
  }

  onEnd(): void {
    // Read overall duration from execution state if available
    let overallDurationMs: number | undefined;
    try {
      const executionStatePath = path.join(process.cwd(), 'tests', 'api', 'reports', '.execution-state.json');
      if (fs.existsSync(executionStatePath)) {
        const executionState = JSON.parse(fs.readFileSync(executionStatePath, 'utf-8')) as Record<string, unknown>;
        if (typeof executionState.durationMs === 'number') {
          overallDurationMs = executionState.durationMs;
        }
      }
    } catch {
      // Fallback to calculated duration if reading execution state fails
    }

    const reportData = buildReportData(this.rows, overallDurationMs);
    const reportName = 'api-test-report.html';

    const reportPath = path.join(process.cwd(), 'tests', 'api', 'reports', 'html', reportName);
    ensureReportsDirectory(reportPath);
    fs.writeFileSync(reportPath, renderHtmlReport(reportData), 'utf8');
  }
}
