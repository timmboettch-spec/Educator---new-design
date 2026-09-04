/* eslint-disable */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const reportPath = path.join(__dirname, '../reports/html/api-test-report.html');

if (!fs.existsSync(reportPath)) {
  process.exit(1);
}
const isWindows = process.platform === 'win32';

try {
  if (isWindows) {
    execSync(`start "" "${reportPath}"`, { stdio: 'ignore' });
  } else if (process.platform === 'darwin') {
    execSync(`open "${reportPath}"`, { stdio: 'ignore' });
  } else {
    execSync(`xdg-open "${reportPath}"`, { stdio: 'ignore' });
  }
} catch {
  console.warn(`Report ready at: ${reportPath}\n`);
}
