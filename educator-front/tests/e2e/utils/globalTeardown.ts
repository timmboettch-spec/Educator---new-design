import { sendReport } from './report/sendReport';

async function globalTeardown() {
  process.stdout.write('\n[REPORT] Playwright execution complete. Sending email report...\n');

  try {
    await sendReport();

    process.stdout.write('[REPORT] Email report process completed.\n');
  } catch (error) {
    process.stderr.write(`[REPORT] Failed to send email report: ${error}\n`);
  }
}

export default globalTeardown;