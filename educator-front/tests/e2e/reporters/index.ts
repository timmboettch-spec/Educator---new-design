import type { FullConfig } from '@playwright/test';
import { Reporter, Suite, TestCase, TestResult } from '@playwright/test/reporter';
import { generateHtmlReportFromPlaywrightResults } from './report-generator';

interface TestRecord {
  status: string;
  error?: { message?: string; stack?: string };
  duration?: number;
  title: string;
  suiteTitle?: string;
}

interface TestFileResults {
  testFilePath: string;
  testResults: TestRecord[];
}

class PlaywrightHtmlReporter implements Reporter {
  private fileResults: Map<string, TestRecord[]> = new Map();

  private resolveSuiteTitle(test: TestCase): string {
    const titles: string[] = [];
    let current: Suite | undefined = test.parent;

    while (current) {
      if (current.title && current.title !== '(root)') {
        titles.unshift(current.title);
      }
      current = current.parent;
    }

    return titles.join(' > ');
  }

  onBegin(_config: FullConfig, _suite: Suite) {
    // Reporter initialization
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const filePath = test.location.file;
    const suiteTitle = this.resolveSuiteTitle(test);
    
    const testRecord: TestRecord = {
      title: test.title,
      status: result.status,
      error: result.status === 'failed' ? { message: result.error?.message || 'Unknown error', stack: result.error?.stack } : undefined,
      duration: result.duration,
      suiteTitle,
    };

    if (!this.fileResults.has(filePath)) {
      this.fileResults.set(filePath, []);
    }
    
    this.fileResults.get(filePath)!.push(testRecord);
  }

  onEnd() {
    if (this.fileResults.size === 0) {
      // eslint-disable-next-line no-console
      console.log('\n No tests were run.');
      return;
    }

    try {
      const testResultsData: TestFileResults[] = Array.from(this.fileResults.entries()).map(([filePath, testResults]) => ({
        testFilePath: filePath,
        testResults,
      }));

      const isRegression = testResultsData.some(({ testFilePath }) => testFilePath.includes('regression'));
      const outputFileName = isRegression ? 'ui-regression-test-report.html' : 'ui-smoke-test-report.html';

      generateHtmlReportFromPlaywrightResults(testResultsData, outputFileName);

      const reportPath = `${process.cwd()}/tests/e2e/reports/${outputFileName}`;
      const reportUrl = `file:///${reportPath.replace(/\\/g, '/')}`;

      // eslint-disable-next-line no-console
      console.log('\n' + '='.repeat(70));
      // eslint-disable-next-line no-console
      console.log('='.repeat(70));
      // eslint-disable-next-line no-console
      console.log(`\n Report Location:\n   ${reportUrl}\n`);
      // eslint-disable-next-line no-console
      console.log('='.repeat(70) + '\n');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(' Failed to generate HTML report:', error);
    }
  }
}

export default PlaywrightHtmlReporter;
