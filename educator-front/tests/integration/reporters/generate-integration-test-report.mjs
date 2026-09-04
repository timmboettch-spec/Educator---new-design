import { spawnSync } from 'child_process';
import process from 'process';

const run = (command, args) => {
  const result = spawnSync(command, args, { stdio: 'inherit' });

  if (result.error) {
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

const npmExecPath = process.env.npm_execpath;
if (!npmExecPath) {
  process.exit(1);
}

run(process.execPath, [
  npmExecPath,
  'run',
  'test:integration',
  '--',
  '--reporter=json',
  '--outputFile',
  'tests/integration/reports/test-results.json',
]);

run(process.execPath, [
  'tests/unit/reporters/generate-unit-test-report.mjs',
  '--input',
  'tests/integration/reports/test-results.json',
  '--output-dir',
  'tests/integration/reports',
  '--title',
  'Frontend Integration Test Report',
  '--subtitle',
  'User-friendly summary of every integration test - what it validates and whether it passed or failed.',
]);
