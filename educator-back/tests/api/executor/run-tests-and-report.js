/* eslint-disable */
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const projectRoot = path.resolve(__dirname, '../../..');
const executorScript = path.join(projectRoot, 'tests/api/executor/module-executor.js');
const executionStateFile = path.join(projectRoot, 'tests/api/reports/.execution-state.json');
const reportScript = path.join(projectRoot, 'tests/api/executor/generate-report.js');

let childProcess = null;
let isInterruptionHandled = false;
function handleInterruption() {
  if (isInterruptionHandled) return;
  isInterruptionHandled = true;

  if (childProcess) {
    try {
      childProcess.kill('SIGINT');
    } catch (_e) {
      // Process already terminated
    }
  }

  setTimeout(() => {
    if (!fs.existsSync(path.join(projectRoot, 'tests/api/reports/html/api-test-report.html'))) {
      spawnSync('node', [reportScript], {
        cwd: projectRoot,
        stdio: 'inherit',
        shell: true,
        env: {
          ...process.env,
          IS_INTERRUPTED: 'true',
          EXECUTION_STATE_FILE: executionStateFile,
        }
      });
    }
    process.exit(130);
  }, 500);
}
process.on('SIGINT', handleInterruption);
process.on('SIGTERM', handleInterruption);
const result = spawnSync('node', [executorScript], {
  cwd: projectRoot,
  stdio: 'inherit',
  shell: true
});
process.exit(result.status);
