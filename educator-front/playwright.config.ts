import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'modules/smoke/**/*.smoke.spec.ts',
  // Increase global test timeout to accommodate slower CI or environments
  timeout: 120000,

  // Preview/dev SWA + backend scale to zero when idle — the first request
  // against a just-deployed environment can take ~30s (see preview-notify's
  // Teams card footer). expect()'s own default timeout (5000ms) is separate
  // from the test timeout above and was tripping the very first assertion
  // (post-login redirect) before that cold start finished, even though the
  // login itself succeeded.
  expect: {
    timeout: 30000,
  },

  fullyParallel: false,
  workers: 1,

  use: {
    headless: true,
    screenshot: 'on',
    video: 'on',
    trace: 'on-first-retry',
  },

  outputDir: './tests/e2e/test-results',

  reporter: [
    ['list'],
    [
      './tests/e2e/reporters/friendly-html-reporter.cjs',
      {
        outputFolder: './tests/e2e/results/reports/html',
        pageTitle: 'UI Smoke Test Report',
        projectName: 'Educator App — Frontend E2E',
      },
    ],
  ],
});
