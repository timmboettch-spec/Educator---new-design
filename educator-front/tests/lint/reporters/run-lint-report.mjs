import { spawnSync } from 'node:child_process';
import process from 'node:process';

function runNpmScript(scriptName, failOnError = false) {
  const result = spawnSync('npm', ['run', scriptName], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.error) {
    process.stderr.write(`${String(result.error)}\n`);
    process.exit(1);
  }

  if (failOnError && result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  return result.status ?? 0;
}

const lintStatus = runNpmScript('lint');
if (lintStatus !== 0) {
  process.stderr.write('ESLint issues found. Generating report...\n');
}
runNpmScript('lint:json');

const nodeCmd = process.platform === 'win32' ? 'node.exe' : 'node';
const reportResult = spawnSync(nodeCmd, ['tests/lint/reporters/generate-eslint-report.mjs'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (reportResult.error) {
  process.stderr.write(`${String(reportResult.error)}\n`);
  process.exit(1);
}

process.exit(reportResult.status ?? 0);
