#!/usr/bin/env node
/* eslint-disable */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateHtmlReportFromJestResults } from '../reporters/report-generator';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Jest outputs results to stdout when using --json flag
// We need to read the coverage summary or test results file
const jestResultsPath = path.join(__dirname, '.jest-results.json');

if (fs.existsSync(jestResultsPath)) {
  try {
    const jestResults = JSON.parse(fs.readFileSync(jestResultsPath, 'utf-8'));
    generateHtmlReportFromJestResults(jestResults.testResults || []);
    fs.unlinkSync(jestResultsPath);
  } catch (error) {
    console.error('Error generating HTML report:', error);
  }
}
