import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { ReportData, ScenarioType, TestSummaryRow } from './report-types';
import { renderHtmlReport } from './report-template';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const normalizeText = (value: string): string => value.trim().toLowerCase();

const formatCapitalized = (value: string): string =>
  value.replace(
    /(^|\s)([a-z])/g,
    (_, prefix: string, letter: string): string =>
      `${prefix}${letter.toUpperCase()}`
  );

interface ParsedError {
  errorShort: string;
  whyFailed: string;
  recommendedCheck?: string;
}

const parsePlaywrightError = (
  errorMessage: string | undefined
): ParsedError => {
  if (!errorMessage) {
    return {
      errorShort: 'Test failed',
      whyFailed: 'The test did not complete successfully.',
    };
  }

  // Remove stack traces and file paths
  const withoutStackTrace = errorMessage.split(/\n\s+at\s/)[0].trim();

  // Extract the first line as the short error
  const lines = withoutStackTrace.split('\n');
  let errorShort = lines[0].trim();

  // Clean up common Playwright error patterns
  if (errorShort.includes('Error:')) {
    errorShort = errorShort.replace(/^.*?Error:\s*/, '');
  }

  // Generate human-readable failure explanation based on error type
  let whyFailed = '';
  let recommendedCheck: string | undefined;

  if (errorMessage.includes('timeout') || errorMessage.includes('Timeout')) {
    errorShort = 'Test timeout exceeded.';
    whyFailed =
      'The test exceeded the maximum allowed execution time. This typically occurs when elements are not appearing, loading is delayed, or actions are not completing within the expected timeframe.';
    recommendedCheck =
      'Check network connectivity, verify that all prerequisite steps are completed, and ensure elements become available within the timeout period.';
  } else if (
    errorMessage.includes('locator') ||
    errorMessage.includes('selector')
  ) {
    const elementMatch = errorMessage.match(
      /locator\('([^']+)'\)|selector\s+'([^']+)'/i
    );
    const element = elementMatch
      ? elementMatch[1] || elementMatch[2]
      : 'UI element';
    errorShort = 'Element not found.';
    whyFailed = `The expected UI element could not be located. This may indicate a UI structure change, incorrect locator, or the element not being rendered on the page.`;
    recommendedCheck = `Verify that the ${element} element is present and visible on the page, and check for any recent UI changes.`;
  } else if (
    errorMessage.includes('assertion') ||
    errorMessage.includes('Expected')
  ) {
    errorShort = 'Assertion failed.';
    whyFailed =
      'A validation check did not produce the expected result. This means the actual state does not match what the test expected.';
    recommendedCheck =
      'Review the test assertion and verify that the application is behaving as designed.';
  } else if (errorMessage.includes('Click') || errorMessage.includes('click')) {
    errorShort = 'Click action failed.';
    whyFailed =
      'The attempt to click on an element did not succeed. The element may be disabled, hidden, or not in an interactive state.';
    recommendedCheck =
      'Verify that the target element is visible, enabled, and ready for interaction before the click action.';
  } else if (
    errorMessage.includes('Fill') ||
    errorMessage.includes('fill') ||
    errorMessage.includes('type')
  ) {
    errorShort = 'Text input failed.';
    whyFailed =
      'The attempt to enter text into a field did not succeed. The input field may be disabled, readonly, or not properly focused.';
    recommendedCheck =
      'Ensure the input field is enabled, focused, and ready to accept text before attempting to fill it.';
  } else if (
    errorMessage.includes('Navigation') ||
    errorMessage.includes('navigate')
  ) {
    errorShort = 'Navigation failed.';
    whyFailed =
      'The browser was unable to navigate to the specified URL or the page did not load within the timeout.';
    recommendedCheck =
      'Check that the target URL is correct, the server is accessible, and the network connection is stable.';
  } else if (
    errorMessage.includes('Expect') ||
    errorMessage.includes('expect')
  ) {
    errorShort = 'Expectation failed.';
    whyFailed =
      'The test expectation did not match the actual result. The application did not behave as expected.';
    recommendedCheck =
      'Review the expectation and verify the application logic and state management.';
  } else {
    // Default handling for unknown errors
    whyFailed =
      'The test encountered an unexpected error during execution. Review the error details above for more information.';
  }

  return {
    errorShort:
      errorShort.length > 100
        ? errorShort.substring(0, 100) + '...'
        : errorShort,
    whyFailed,
    recommendedCheck,
  };
};

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

  if (
    negativePatterns.some((pattern) => normalizeText(title).includes(pattern))
  ) {
    return 'NEGATIVE';
  }

  return 'POSITIVE';
};

const extractSuiteTitleFromFileName = (filePath: string): string => {
  const fileName = path.basename(filePath);
  // Remove number prefix (e.g., "01-")
  let title = fileName.replace(/^\d+-/, '');
  // Remove Playwright spec suffixes
  title = title.replace(/\.(smoke|regression)\.spec\.ts$/, '');
  title = title.replace(/\.spec\.ts$/, '');
  // Replace hyphens with spaces
  title = title.replace(/-/g, ' ');
  // Capitalize each word
  title = formatCapitalized(title);
  return title;
};

const normalizeSuiteTitle = (
  rawSuiteTitle: string | undefined,
  filePath: string
): string => {
  if (!rawSuiteTitle || rawSuiteTitle.trim().length === 0) {
    return extractSuiteTitleFromFileName(filePath);
  }

  const parts = rawSuiteTitle
    .split(' > ')
    .map((part) => part.trim())
    .filter(Boolean);
  const meaningful = parts.find(
    (part) => !/\.spec\.ts/i.test(part) && !/[\\/]/.test(part)
  );
  return meaningful || extractSuiteTitleFromFileName(filePath);
};

const buildFileName = (filePath: string): string => path.basename(filePath);

const createReportRow = (
  title: string,
  filePath: string,
  status: 'Passed' | 'Failed' | 'Skipped',
  duration: number,
  errorMessage?: string
): TestSummaryRow => {
  const scenarioType = inferScenarioType(title);
  const whyPassed =
    'All validation checks passed, including assertions and expected behavior.';
  const fileName = buildFileName(filePath);
  const suiteTitle = extractSuiteTitleFromFileName(filePath);

  // Parse error for failed tests
  const parsedError =
    status === 'Failed' ? parsePlaywrightError(errorMessage) : undefined;

  return {
    title,
    description: title,
    status,
    scenarioType,
    fileName,
    specFile: fileName,
    suiteTitle,
    location: fileName,
    durationMs: duration,
    expectedResult:
      'The test should execute successfully with all assertions passing.',
    actualResult:
      status === 'Failed'
        ? parsedError?.whyFailed || 'Test failed.'
        : 'The test executed successfully and all assertions passed.',
    whyPassed,
    whyFailed:
      parsedError?.whyFailed ||
      'Assertion failed or test did not complete as expected.',
    errorShort: parsedError?.errorShort,
    recommendedCheck: parsedError?.recommendedCheck,
  };
};

const groupBySpecFile = (
  rows: TestSummaryRow[]
): Map<string, TestSummaryRow[]> => {
  const suiteMap = new Map<string, Array<TestSummaryRow>>();
  for (const row of rows) {
    const key = row.specFile;
    const suiteRows = suiteMap.get(key) ?? [];
    suiteRows.push(row);
    suiteMap.set(key, suiteRows);
  }
  return suiteMap;
};

const computeSuiteSummary = (
  specFile: string,
  suiteTitle: string,
  rows: TestSummaryRow[]
): {
  specFile: string;
  suiteTitle: string;
  tests: TestSummaryRow[];
  passed: number;
  failed: number;
  skipped: number;
  positive: number;
  negative: number;
} => {
  const passed = rows.filter((row) => row.status === 'Passed').length;
  const failed = rows.filter((row) => row.status === 'Failed').length;
  const skipped = rows.filter((row) => row.status === 'Skipped').length;
  const positive = rows.filter((row) => row.scenarioType === 'POSITIVE').length;
  const negative = rows.filter((row) => row.scenarioType === 'NEGATIVE').length;

  return {
    specFile,
    suiteTitle,
    tests: rows,
    passed,
    failed,
    skipped,
    positive,
    negative,
  };
};

const buildReportData = (rows: TestSummaryRow[]): ReportData => {
  const suiteMap = groupBySpecFile(rows);
  const suites = Array.from(suiteMap.entries())
    .map(([specFile, suiteRows]) => {
      const suiteTitle =
        suiteRows[0]?.suiteTitle || extractSuiteTitleFromFileName(specFile);
      return computeSuiteSummary(specFile, suiteTitle, suiteRows);
    })
    .sort((a, b) =>
      (a.specFile + a.suiteTitle).localeCompare(b.specFile + b.suiteTitle)
    );

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
    title: 'Educator E2E Test Report',
    generatedAt: new Date().toISOString(),
    totalTests: rows.length,
    passed,
    failed,
    skipped,
    positive,
    negative,
    durationMs,
    durationDisplay,
    suites,
  };
};

const ensureReportsDirectory = (reportPath: string): void => {
  const directory = path.dirname(reportPath);
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
};

export const generateHtmlReportFromPlaywrightResults = (
  testResults: Array<{
    testFilePath: string;
    testResults: Array<{
      status: string;
      error?: { message?: string };
      duration?: number;
      title: string;
      suiteTitle?: string;
    }>;
  }>,
  outputFileName = 'ui-smoke-test-report.html'
): void => {
  const rows: TestSummaryRow[] = [];

  for (const testResult of testResults) {
    const filePath = testResult.testFilePath;

    for (const test of testResult.testResults) {
      const status =
        test.status === 'passed'
          ? 'Passed'
          : test.status === 'skipped'
            ? 'Skipped'
            : 'Failed';
      const errorMessage = test.error ? test.error.message : undefined;
      const duration = test.duration || 0;
      const fileName = buildFileName(filePath);
      const suiteTitle = normalizeSuiteTitle(test.suiteTitle, filePath);

      const row = createReportRow(
        test.title,
        filePath,
        status,
        duration,
        errorMessage
      );
      row.specFile = fileName;
      row.fileName = fileName;
      row.location = fileName;
      row.suiteTitle = suiteTitle;
      rows.push(row);
    }
  }

  const reportData = buildReportData(rows);
  const htmlContent = renderHtmlReport(reportData);
  const reportPath = path.resolve(__dirname, `../reports/${outputFileName}`);

  ensureReportsDirectory(reportPath);
  fs.writeFileSync(reportPath, htmlContent, 'utf-8');
};
