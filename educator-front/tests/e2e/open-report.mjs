/* global process */
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

const type = process.argv[2] === 'regression' ? 'regression' : 'smoke';
const fileName =
  type === 'regression'
    ? 'ui-regression-test-report.html'
    : 'ui-smoke-test-report.html';
const reportPath = path.join(
  ROOT,
  'tests',
  'e2e',
  'results',
  'reports',
  'html',
  fileName
);

const platform = process.platform;
let command;
let args;

if (platform === 'win32') {
  command = 'cmd';
  args = ['/c', `start ${reportPath}`];
} else if (platform === 'darwin') {
  command = 'open';
  args = [reportPath];
} else {
  command = 'xdg-open';
  args = [reportPath];
}

spawn(command, args);
