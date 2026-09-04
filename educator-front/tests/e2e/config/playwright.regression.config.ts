import { defineConfig } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: '.env.local' });

// CI sets BASE_URL to the deployed frontend URL.
// Local dev: falls back to VITE_API_URL from .env.local.
const resolvedBaseUrl = (process.env.BASE_URL ?? process.env.VITE_API_URL ?? '').trim();

if (!resolvedBaseUrl) {
  throw new Error('No base URL found. Set BASE_URL env var (CI) or VITE_API_URL in .env.local (local dev).');
}

export const BASE_URL = resolvedBaseUrl;

export default defineConfig({
  testDir: path.resolve(__dirname, '..'),
  testMatch: 'modules/regression/**/*.regression.spec.ts',
  timeout: 120000,

  globalSetup: path.resolve(__dirname, '../common/setup/global.setup.ts'),

  fullyParallel: false,
  workers: 4,

  use: {
    headless: true,
    screenshot: 'on',
    video: 'retain-on-failure',
    trace: 'on-first-retry'
  },

  outputDir: path.resolve(__dirname, '../test-results'),

  reporter: [
    ['list'],
    [path.resolve(__dirname, '../reporters/friendly-html-reporter.cjs'), {
      outputFolder: path.resolve(__dirname, '../results/reports/html'),
      pageTitle: 'UI Regression Test Report',
      projectName: 'Educator App — Frontend E2E',
    }]
  ]
});