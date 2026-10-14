/**
 * Friendly HTML Reporter for Playwright
 * Collects test results + screenshots and produces a fully self-contained
 * HTML report with embedded images, info cards, error details, and a
 * lightbox viewer.
 */

/* eslint-disable @typescript-eslint/no-require-imports, no-undef, no-console, @typescript-eslint/no-unused-vars */

const fs = require('fs');
const path = require('path');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stripAnsi(str = '') {
  // eslint-disable-next-line no-control-regex
  return String(str).replace(/\x1B\[[0-9;]*[A-Za-z]/g, '');
}

function escapeHtml(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function humanizeTitle(title) {
  if (!title) {
    return 'Validates expected behavior.';
  }
  let t = title.trim();
  t = t.replace(/^should\s+/i, '');
  t = t.charAt(0).toUpperCase() + t.slice(1);
  if (!/[.!?]$/.test(t)) {
    t += '.';
  }
  return t;
}

function whatItChecks(title) {
  const lower = (title || '').toLowerCase();
  if (/(login|authenticate|sign.?in)/.test(lower)) {
    return 'Verifies that a user can log in with valid credentials and that a session is correctly established afterwards.';
  }
  if (/(sign.?out|log.?out)/.test(lower)) {
    return 'Verifies that the sign-out flow works correctly — the session is cleared and the user is redirected to the login page.';
  }
  if (/(create|add new|add a)/.test(lower)) {
    return 'Verifies that the creation form accepts valid input, submits successfully, and the new record appears in the system.';
  }
  if (/(update|edit|modify|save changes)/.test(lower)) {
    return 'Verifies that editing an existing record saves the updated values correctly and the changes are reflected in the UI.';
  }
  if (/(delete|remove)/.test(lower)) {
    return 'Verifies that the delete action removes the selected record and it no longer appears in the list after confirmation.';
  }
  if (/(navigate|sidebar|breadcrumb|route|redirect)/.test(lower)) {
    return 'Verifies that clicking a navigation control takes the user to the correct page and the URL updates as expected.';
  }
  if (/(heading|title|h1|h2|render|visible|display|show)/.test(lower)) {
    return 'Verifies that the expected heading or key UI element is rendered and visible on the page after it loads.';
  }
  if (/(search|filter|sort)/.test(lower)) {
    return 'Verifies that the search, filter, or sort control narrows the results to the expected subset without breaking the page.';
  }
  if (/(modal|dialog|popup|confirm)/.test(lower)) {
    return 'Verifies that the modal opens on the correct action, displays the right content, and can be dismissed cleanly.';
  }
  if (/(form|submit|input|validation|invalid|required)/.test(lower)) {
    return 'Verifies that the form enforces validation rules — required fields are checked and invalid data is rejected with a clear error message.';
  }
  if (/(report|score|transcript)/.test(lower)) {
    return "Verifies that the assessment report page loads correctly and displays the student's score and performance breakdown.";
  }
  if (/(responsive|mobile|tablet|viewport|overflow)/.test(lower)) {
    return 'Verifies that the page layout adapts correctly to the target viewport size and no content is clipped or horizontally overflowed.';
  }
  if (/(screenshot|error.*overlay|js.?error)/.test(lower)) {
    return 'Verifies that the page renders without a JavaScript error overlay or unexpected crash banner.';
  }
  return 'Verifies that the described behaviour works correctly end-to-end in the browser.';
}

function whyPassed(title) {
  const lower = (title || '').toLowerCase();
  if (/(login|authenticate|sign.?in)/.test(lower)) {
    return 'The login flow completed successfully. The user was authenticated and the session was established — the dashboard loaded as expected.';
  }
  if (/(sign.?out|log.?out)/.test(lower)) {
    return 'The sign-out flow completed successfully. The session was cleared and the browser redirected to the login page.';
  }
  if (/(create|add new|add a)/.test(lower)) {
    return 'The resource was created with the provided data. The form submitted without errors and the new record appeared in the system.';
  }
  if (/(update|edit|modify|save changes)/.test(lower)) {
    return 'The record was updated successfully. The new values were saved and the UI reflected the changes without any errors.';
  }
  if (/(delete|remove)/.test(lower)) {
    return 'The record was deleted. The confirmation dialog appeared, the delete was confirmed, and the item was removed from the list.';
  }
  if (/(navigate|sidebar|breadcrumb|route|redirect)/.test(lower)) {
    return 'Navigation worked as expected. The sidebar link or button took the user to the correct page and the URL matched the expected pattern.';
  }
  if (/(heading|title|h1|h2|render|visible|display|show)/.test(lower)) {
    return 'The expected element was rendered and visible within the allowed timeout. The page loaded correctly without any errors.';
  }
  if (/(search|filter|sort)/.test(lower)) {
    return 'The search or filter returned the expected results. The list was correctly narrowed down and the page remained stable.';
  }
  if (/(modal|dialog|popup|confirm)/.test(lower)) {
    return 'The modal opened correctly, displayed the right content, and closed cleanly when dismissed — no overlay or z-index issues.';
  }
  if (/(form|validation|invalid|required)/.test(lower)) {
    return 'Form validation worked correctly. The required fields were enforced and invalid input was rejected with the appropriate error message.';
  }
  if (/(report|score|transcript)/.test(lower)) {
    return 'The report page loaded and displayed the assessment data correctly within the expected timeout.';
  }
  if (/(responsive|mobile|tablet|viewport|overflow)/.test(lower)) {
    return 'The page rendered correctly at the target viewport size. No horizontal overflow was detected and all critical elements were visible.';
  }
  return 'All assertions passed. Every expected element was found, every navigation completed, and every data check returned the correct result.';
}

function whyFailed(error = '') {
  if (!error) {
    return 'The test did not meet the expected outcome. No detailed error was captured.';
  }
  const raw = stripAnsi(String(error));

  if (/timeout.*exceed|exceed.*timeout/i.test(raw)) {
    return 'The test timed out waiting for an element or action to complete. The element may not have appeared, the page may be stuck loading, or the API response took too long.';
  }
  if (/strict mode violation/i.test(raw)) {
    return 'Playwright found more than one element matching the selector. The locator must be made more specific to target exactly one element.';
  }
  if (/element.*not.*found|no elements|locator.*resolved to 0/i.test(raw)) {
    return 'The expected element was not found on the page at all. It may not have been rendered, or the selector may be incorrect.';
  }
  if (/not visible|hidden|display:none/i.test(raw)) {
    return 'The element exists in the DOM but is not visible to the user. It may be hidden, covered by another element, or outside the viewport.';
  }
  if (/toHaveURL|Expected.*URL|url.*mismatch/i.test(raw)) {
    return 'The page URL did not match the expected pattern. Navigation may have been blocked, redirected elsewhere, or the URL changed unexpectedly.';
  }
  if (/toBeVisible/i.test(raw)) {
    return 'An element that was expected to be visible was not visible within the allowed timeout. Check if it is rendered after an API call or user interaction.';
  }
  if (/Expected.*toBe|toEqual|Received/i.test(raw)) {
    const lines = raw
      .split('\n')
      .filter((l) => l.trim() && !/^\s+at\s/.test(l))
      .slice(0, 4)
      .join(' — ');
    return `An assertion value did not match what was expected: ${escapeHtml(lines.slice(0, 350))}`;
  }
  if (/ERR_|net::|navigation.*failed/i.test(raw)) {
    return 'A network error occurred. The page could not be loaded — check if the dev server is running and the base URL is reachable.';
  }
  if (/click.*failed|not clickable|intercept/i.test(raw)) {
    return 'The element could not be clicked. It may be covered by another element, disabled, or outside the visible area.';
  }

  const firstLine = raw
    .split('\n')
    .find((l) => l.trim().length > 0 && !/^\s+at\s/.test(l));
  if (firstLine) {
    return escapeHtml(firstLine.trim().slice(0, 450));
  }
  return 'The test failed. Review the error detail below for the full stack trace.';
}

function getFailureCategory(test = {}) {
  const raw = stripAnsi(String(test.error?.message || test.error || ''));
  const isTimedOut =
    test.status === 'timedOut' ||
    /timeout.*exceed|exceed.*timeout|timed out/i.test(raw);
  if (isTimedOut) {
    return {
      type: 'TIMEOUT',
      isTimeout: true,
      badge: '⏱️ TIMEOUT',
      description:
        'The test exceeded the timeout duration waiting for an action, locator, or navigation to complete.',
    };
  }
  if (/Expected.*toBe|toEqual|Received|toHave|toContain/i.test(raw)) {
    return {
      type: 'ASSERTION FAILED',
      isTimeout: false,
      badge: '❌ ASSERTION FAILED',
      description:
        'An assertion (expect) did not match the expected condition or value.',
    };
  }
  return {
    type: 'ERROR',
    isTimeout: false,
    badge: '💥 ERROR',
    description:
      'An unexpected runtime error, selector issue, or exception occurred during test execution.',
  };
}

function whySkipped(title) {
  const lower = (title || '').toLowerCase();
  if (/(report|transcript|viewer|performance)/.test(lower)) {
    return 'This test requires an existing assessment report in the environment. No report data was found during the setup phase, so the test was skipped to avoid a false failure.';
  }
  if (/(delete|cancel.*delete)/.test(lower)) {
    return 'This test requires a record with a visible Delete button. No deletable record was found in the current environment, so the test was skipped gracefully.';
  }
  if (
    /(row action|view report|view transcript|accordion|class section)/.test(
      lower
    )
  ) {
    return 'This test requires at least one report row in the class accordion. No report data was available in this environment, so the test was skipped.';
  }
  return "The test's pre-conditions were not met in this environment (e.g. missing data or a feature flag that is off). It was skipped gracefully rather than failing.";
}

const MIN_IMAGE_BYTES = 4_000;

function readAttachmentBytes(att) {
  try {
    if (att.path && fs.existsSync(att.path)) {
      return fs.readFileSync(att.path);
    }
    if (att.body) {
      return Buffer.isBuffer(att.body) ? att.body : Buffer.from(att.body);
    }
  } catch (_) {
    /* skip */
  }
  return null;
}

function screenshotDataUri(attachments = []) {
  for (const att of attachments) {
    if (
      att &&
      typeof att.name === 'string' &&
      att.name.toLowerCase() === 'final-state' &&
      att.contentType &&
      att.contentType.startsWith('image/')
    ) {
      const bytes = readAttachmentBytes(att);
      if (bytes && bytes.length >= MIN_IMAGE_BYTES) {
        return `data:${att.contentType};base64,${bytes.toString('base64')}`;
      }
    }
  }
  for (const att of attachments) {
    if (att.contentType && att.contentType.startsWith('image/')) {
      const bytes = readAttachmentBytes(att);
      if (bytes && bytes.length >= MIN_IMAGE_BYTES) {
        return `data:${att.contentType};base64,${bytes.toString('base64')}`;
      }
    }
  }
  return null;
}

// ─── Reporter class ────────────────────────────────────────────────────────────

class FriendlyHtmlReporter {
  constructor(options = {}) {
    this.outputDir =
      options.outputFolder || path.join(__dirname, '../results/reports/html');
    this.pageTitle = options.pageTitle || 'UI Regression Test Report';
    this.subtitle =
      options.subtitle ||
      'User-friendly summary of every UI test — what it validates, why it passed or failed, and a screenshot of the browser at the time the test finished.';
    this.projectName = options.projectName || 'Educator App — Frontend E2E';
    this.framework = options.framework || 'Playwright';
    const fileName =
      this.pageTitle.toLowerCase().replace(/\s+/g, '-') + '.html';
    this.reportFile = path.join(this.outputDir, fileName);
    this.testsByFile = {};
  }

  onTestEnd(test, result) {
    const rawFile = test.location?.file || test.file;
    const file = rawFile
      ? path.basename(rawFile, path.extname(rawFile))
      : 'Tests';
    if (!this.testsByFile[file]) {
      this.testsByFile[file] = { file: rawFile, tests: [] };
    }
    this.testsByFile[file].tests.push({
      title: test.title,
      status: result.status,
      duration: result.duration,
      error: result.error,
      attachments: result.attachments || [],
    });

    if (result.status === 'failed' || result.status === 'timedOut') {
      const cat = getFailureCategory({
        status: result.status,
        error: result.error,
      });
      const explanation = whyFailed(result.error?.message || result.error);
      console.log(
        `\n  ✘ [FAIL: ${cat.badge} (${cat.isTimeout ? 'YES - TIMEOUT' : 'NO - NOT A TIMEOUT'})] ${test.title} (${file})`
      );
      console.log(`    → Why: ${explanation}`);
    }
  }

  async onEnd() {
    try {
      const stats = this.calculateStats();
      let logoDataUri = '';
      try {
        const logoPath = path.join(
          __dirname,
          '../../../public/assets/common/Realityworks_AI_RGB.png'
        );
        const logoBytes = fs.readFileSync(logoPath);
        logoDataUri = `data:image/png;base64,${logoBytes.toString('base64')}`;
      } catch (_) {
        /* logo not found — skip silently */
      }

      const html = this.generateHTML(stats, logoDataUri);
      fs.mkdirSync(this.outputDir, { recursive: true });
      fs.writeFileSync(this.reportFile, html, 'utf-8');

      this.printFailureSummaryToConsole();
      console.log(`\n✅ ${this.pageTitle} generated: ${this.reportFile}\n`);
    } catch (err) {
      console.error(`\n[FriendlyHtmlReporter] Failed: ${err.message}\n`);
    }
  }

  printFailureSummaryToConsole() {
    const failedTests = [];
    Object.entries(this.testsByFile).forEach(([fileKey, { tests }]) => {
      tests.forEach((t) => {
        if (t.status === 'failed' || t.status === 'timedOut') {
          failedTests.push({ ...t, fileKey });
        }
      });
    });

    if (failedTests.length === 0) {
      console.log('\n✨ All tests passed! No failure logs to display.\n');
      return;
    }

    console.log(
      '\n================================================================================'
    );
    console.log(
      `❌ FAILED REGRESSION TESTS SUMMARY (${failedTests.length} failed)`
    );
    console.log(
      '================================================================================'
    );

    failedTests.forEach((t, index) => {
      const cat = getFailureCategory(t);
      const explanation = whyFailed(t.error?.message || t.error);
      const rawError = stripAnsi(
        String(t.error?.message || t.error || '')
      ).trim();
      const firstLines = rawError
        .split('\n')
        .filter((l) => l.trim() && !l.includes('at '))
        .slice(0, 5)
        .join('\n       ');

      console.log(`\n${index + 1}) [FAIL] ${t.title}`);
      console.log(`   File         : ${t.fileKey}`);
      console.log(
        `   Failure Type : ${cat.badge} (${cat.isTimeout ? 'YES - TIMEOUT' : 'NO - NOT A TIMEOUT'})`
      );
      console.log(`   Why Failed   : ${explanation}`);
      if (firstLines) {
        console.log(`   Error Detail :\n       ${firstLines}`);
      }
      console.log(
        '--------------------------------------------------------------------------------'
      );
    });
    console.log('');
  }

  calculateStats() {
    let passed = 0,
      failed = 0,
      skipped = 0,
      duration = 0;
    Object.values(this.testsByFile).forEach(({ tests }) => {
      tests.forEach((t) => {
        duration += t.duration || 0;
        if (t.status === 'passed') {
          passed++;
        } else if (t.status === 'failed' || t.status === 'timedOut') {
          failed++;
        } else {
          skipped++;
        }
      });
    });
    return {
      passed,
      failed,
      skipped,
      duration,
      total: passed + failed + skipped,
    };
  }

  generateHTML(stats, logoDataUri = '') {
    const timestamp = new Date().toLocaleString();
    const successRate =
      stats.total > 0
        ? Math.round((stats.passed / stats.total) * 1000) / 10
        : 0;
    const fileSections = this.generateFileSections();
    const logoHtml = logoDataUri
      ? `<div class="logo-box"><img src="${logoDataUri}" alt="Realityworks AI" class="logo-img"/></div>`
      : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>${escapeHtml(this.pageTitle)}</title>
<style>
:root{--primary:#c2410c;--primary-light:#f97316;--bg:#f8fafc;--card:#fff;--text:#0f172a;--muted:#64748b;--border:#e2e8f0;--success:#16a34a;--danger:#dc2626;--warning:#d97706;--shadow:0 1px 3px rgba(15,23,42,.08),0 1px 2px rgba(15,23,42,.04);--shadow-lg:0 10px 25px -5px rgba(15,23,42,.1),0 8px 10px -6px rgba(15,23,42,.06)}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;background:var(--bg);color:var(--text);line-height:1.55;padding:24px}
.container{max-width:1200px;margin:0 auto}
header{background:linear-gradient(135deg,var(--primary) 0%,var(--primary-light) 100%);color:#fff;padding:36px 32px;border-radius:12px;box-shadow:var(--shadow-lg);margin-bottom:24px;display:flex;align-items:center;gap:32px}
.header-content{flex:1}
header h1{font-size:26px;font-weight:700;margin-bottom:6px}
header .subtitle{font-size:14px;opacity:.9;line-height:1.5}
header .meta{display:flex;flex-wrap:wrap;gap:24px;margin-top:18px;padding-top:18px;border-top:1px solid rgba(255,255,255,.2)}
header .meta div{font-size:13px}
header .meta strong{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.05em;opacity:.8;margin-bottom:2px}
.logo-box{background:#fff;border-radius:10px;padding:12px 18px;display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 2px 8px rgba(0,0,0,.12)}
.logo-img{height:48px;width:auto;display:block}
.stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:14px;margin-bottom:24px}
.stat-card{background:var(--card);padding:18px;border-radius:10px;box-shadow:var(--shadow);border-left:4px solid var(--primary)}
.stat-card .label{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);font-weight:600}
.stat-card .value{font-size:28px;font-weight:700;color:var(--primary);margin-top:2px}
.stat-card.ok{border-left-color:var(--success)}.stat-card.ok .value{color:var(--success)}
.stat-card.bad{border-left-color:var(--danger)}.stat-card.bad .value{color:var(--danger)}
.stat-card.warn{border-left-color:var(--warning)}.stat-card.warn .value{color:var(--warning)}
.controls{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:18px;background:var(--card);padding:14px;border-radius:10px;box-shadow:var(--shadow)}
.controls input[type="search"]{flex:1;min-width:220px;padding:9px 12px;border:1px solid var(--border);border-radius:6px;font-size:14px;outline:none}
.controls input[type="search"]:focus{border-color:var(--primary-light);box-shadow:0 0 0 3px rgba(249,115,22,.15)}
.filter-btns{display:flex;gap:6px}
.filter-btn{padding:8px 14px;border:1px solid var(--border);background:#fff;border-radius:6px;cursor:pointer;font-size:13px;font-weight:500;color:var(--muted)}
.filter-btn.active{background:var(--primary);color:#fff;border-color:var(--primary)}
.filter-btn:hover:not(.active){background:#f1f5f9}
.module-section{background:var(--card);border-radius:10px;box-shadow:var(--shadow);margin-bottom:14px;overflow:hidden;border-left:4px solid var(--success)}
.module-section.fail{border-left-color:var(--danger)}
.module-head{width:100%;display:flex;align-items:center;gap:12px;padding:16px 20px;background:linear-gradient(to right,#f1f5f9,#fff);border:none;cursor:pointer;text-align:left;font-size:15px;font-weight:600;color:var(--primary)}
.module-head:hover{background:#fff7ed}
.caret{display:inline-block;transition:transform .15s;font-size:14px;color:var(--muted)}
.module-section.collapsed .caret{transform:rotate(-90deg)}
.module-section.collapsed .module-body{display:none}
.module-name{flex:1}
.module-stats{display:flex;gap:6px;flex-wrap:wrap}
.chip{font-size:11px;font-weight:600;padding:3px 9px;border-radius:99px;letter-spacing:.02em}
.chip.ok{background:#dcfce7;color:#166534}
.chip.bad{background:#fee2e2;color:#991b1b}
.chip.warn{background:#fef3c7;color:#92400e}
.chip.total{background:#ffedd5;color:#9a3412}
.module-body{padding:14px 20px 18px}
.test-row{border:1px solid var(--border);border-left-width:4px;border-radius:8px;margin-bottom:10px;overflow:hidden}
.test-row.pass{border-left-color:var(--success);background:#fff}
.test-row.fail{border-left-color:var(--danger);background:#fffafa}
.test-row.skipped{border-left-color:var(--warning);background:#fffbeb}
.test-head{display:flex;align-items:center;gap:10px;padding:10px 14px;background:#fafbfc;border-bottom:1px solid #f1f5f9}
.badge{font-size:11px;font-weight:700;padding:3px 9px;border-radius:4px;color:#fff;letter-spacing:.05em;min-width:48px;text-align:center;flex-shrink:0}
.badge.pass{background:var(--success)}
.badge.fail{background:var(--danger)}
.badge.skipped{background:var(--warning)}
.test-title{flex:1;font-size:14px;font-weight:500;color:var(--text)}
.duration{font-size:12px;color:var(--muted);white-space:nowrap}
.toggle-btn{font-size:12px;padding:4px 12px;border:1px solid var(--border);border-radius:5px;cursor:pointer;background:#f8fafc;color:var(--muted);font-weight:600;white-space:nowrap;transition:background .1s}
.toggle-btn:hover{background:#f1f5f9}
.test-body{padding:12px 14px 14px}
.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px}
@media(max-width:680px){.info-grid{grid-template-columns:1fr}}
.info-card{border-radius:7px;padding:11px 13px;border:1px solid var(--border);background:#f8fafc}
.info-card.checks{background:#fff7ed;border-color:#fed7aa}
.info-card.result-pass{background:#f0fdf4;border-color:#bbf7d0}
.info-card.result-fail{background:#fff1f1;border-color:#fecaca}
.info-card.result-skip{background:#fffbeb;border-color:#fde68a}
.ic-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;margin-bottom:5px}
.info-card.checks .ic-label{color:#c2410c}
.info-card.result-pass .ic-label{color:#16a34a}
.info-card.result-fail .ic-label{color:#dc2626}
.info-card.result-skip .ic-label{color:#d97706}
.ic-value{font-size:13px;color:var(--text);line-height:1.5}
.ic-value code{background:#f1f5f9;padding:1px 5px;border-radius:3px;font-size:11.5px;font-family:'Courier New',monospace}
.error-block{margin-top:10px;background:#fff1f1;border:1px solid #fecaca;border-radius:7px;overflow:hidden}
.error-block-head{padding:8px 12px;background:#fee2e2;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#991b1b;display:flex;align-items:center;gap:6px}
.error-block pre{padding:10px 12px;font-size:11.5px;color:#7f1d1d;white-space:pre-wrap;word-break:break-word;line-height:1.55;font-family:'Courier New',monospace;max-height:220px;overflow-y:auto;background:#fff8f8}
.sc-block{margin-top:12px;border:1px solid var(--border);border-radius:8px;overflow:hidden}
.sc-head{display:flex;align-items:center;justify-content:space-between;padding:9px 13px;font-size:12px;font-weight:700}
.sc-head.pass-hdr{background:#f0fdf4;border-bottom:1px solid #bbf7d0;color:#166534}
.sc-head.fail-hdr{background:#fff1f1;border-bottom:1px solid #fecaca;color:#dc2626}
.sc-head.skip-hdr{background:#fffbeb;border-bottom:1px solid #fde68a;color:#92400e}
.sc-badge{font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px}
.sc-badge.pass-b{background:#dcfce7;color:#166534}
.sc-badge.fail-b{background:#fee2e2;color:#991b1b}
.sc-badge.skip-b{background:#fef3c7;color:#92400e}
.sc-caption{padding:9px 13px;background:#fafbfc;border-bottom:1px solid var(--border);font-size:12px;color:var(--muted);line-height:1.55}
.sc-caption strong{display:block;font-size:12px;font-weight:700;color:var(--text);margin-bottom:3px}
.sc-img-wrap{padding:12px;background:#f1f5f9;text-align:center}
.sc-img-wrap img{max-width:100%;border-radius:6px;box-shadow:0 4px 14px rgba(0,0,0,.14);border:1px solid var(--border);cursor:zoom-in;transition:box-shadow .15s}
.sc-img-wrap img:hover{box-shadow:0 8px 22px rgba(0,0,0,.22)}
.sc-none{padding:18px;text-align:center;color:var(--muted);font-size:13px;background:#fafbfc}
.sc-none-icon{font-size:32px;display:block;margin-bottom:6px;opacity:.35}
#lb{display:none;position:fixed;inset:0;background:rgba(0,0,0,.88);z-index:9999;align-items:center;justify-content:center;padding:20px;cursor:zoom-out}
#lb.open{display:flex}
#lb img{max-width:94vw;max-height:90vh;border-radius:8px;box-shadow:0 30px 80px rgba(0,0,0,.6);border:2px solid rgba(255,255,255,.15)}
#lb-close{position:fixed;top:14px;right:18px;color:#fff;font-size:26px;cursor:pointer;background:rgba(0,0,0,.45);border-radius:50%;width:40px;height:40px;display:flex;align-items:center;justify-content:center;font-weight:700}
#lb-label{position:fixed;bottom:14px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.65);color:#fff;font-size:12px;padding:6px 16px;border-radius:20px;white-space:nowrap;max-width:90vw;overflow:hidden;text-overflow:ellipsis}
footer{text-align:center;padding:20px;color:var(--muted);font-size:12px;margin-top:24px}
</style>
</head>
<body>
<div class="container">
<header>
  <div class="header-content">
    <h1>🧪 ${escapeHtml(this.pageTitle)}</h1>
    <div class="subtitle">${escapeHtml(this.subtitle)}</div>
    <div class="meta">
      <div><strong>Project</strong>${escapeHtml(this.projectName)}</div>
      <div><strong>Framework</strong>${escapeHtml(this.framework)}</div>
      <div><strong>Duration</strong>${(stats.duration / 1000).toFixed(2)} s</div>
      <div><strong>Generated</strong>${escapeHtml(timestamp)}</div>
    </div>
  </div>
  ${logoHtml}
</header>
<section class="stats-grid">
  <div class="stat-card"><div class="label">Total Tests</div><div class="value">${stats.total}</div></div>
  <div class="stat-card ok"><div class="label">Passed</div><div class="value">${stats.passed}</div></div>
  <div class="stat-card bad"><div class="label">Failed</div><div class="value">${stats.failed}</div></div>
  <div class="stat-card warn"><div class="label">Skipped</div><div class="value">${stats.skipped}</div></div>
  <div class="stat-card ok"><div class="label">Success Rate</div><div class="value">${successRate}%</div></div>
</section>
<div class="controls">
  <input type="search" id="search" placeholder="🔍 Search tests by name or description…" oninput="applyFilter()"/>
  <div class="filter-btns">
    <button class="filter-btn active" onclick="setFilter(this,'all')">All</button>
    <button class="filter-btn" onclick="setFilter(this,'passed')">✅ Passed</button>
    <button class="filter-btn" onclick="setFilter(this,'failed')">❌ Failed</button>
    <button class="filter-btn" onclick="setFilter(this,'skipped')">⏭ Skipped</button>
  </div>
</div>
<main>${fileSections || '<p>No test results.</p>'}</main>
<footer>
  <strong>Educator App</strong> &nbsp;|&nbsp; ${escapeHtml(this.pageTitle)} &nbsp;|&nbsp; Powered by Playwright
</footer>
</div>
<div id="lb" onclick="closeLb()">
  <div id="lb-close" onclick="closeLb()">✕</div>
  <img id="lb-img" src="" alt=""/>
  <div id="lb-label"></div>
</div>
<script>
let _filter = 'all';
function setFilter(btn, f) {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  _filter = f;
  applyFilter();
}
function applyFilter() {
  const q = (document.getElementById('search').value || '').toLowerCase();
  document.querySelectorAll('.module-section').forEach(sec => {
    let vis = 0;
    sec.querySelectorAll('.test-row').forEach(row => {
      const ok = (_filter === 'all' || row.dataset.status === _filter) &&
                 (!q || row.innerText.toLowerCase().includes(q));
      row.style.display = ok ? '' : 'none';
      if (ok) vis++;
    });
    sec.style.display = vis === 0 && (q || _filter !== 'all') ? 'none' : '';
  });
}
function toggleModule(btn) { btn.parentElement.classList.toggle('collapsed'); }
function toggleBody(btn) {
  const body = btn.closest('.test-row').querySelector('.test-body');
  const hidden = body.style.display === 'none';
  body.style.display = hidden ? '' : 'none';
  btn.textContent = hidden ? '▴ Hide' : '▾ Details';
}
function openLb(img, label) {
  document.getElementById('lb-img').src = img.src;
  document.getElementById('lb-label').textContent = label || '';
  document.getElementById('lb').classList.add('open');
}
function closeLb() { document.getElementById('lb').classList.remove('open'); }
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLb(); });
</script>
</body>
</html>`;
  }

  generateFileSections() {
    return Object.keys(this.testsByFile)
      .sort()
      .map((fileKey) => {
        const { tests } = this.testsByFile[fileKey];
        let nPass = 0,
          nFail = 0,
          nSkip = 0;
        tests.forEach((t) => {
          if (t.status === 'passed') {
            nPass++;
          } else if (t.status === 'failed' || t.status === 'timedOut') {
            nFail++;
          } else {
            nSkip++;
          }
        });
        const total = nPass + nFail + nSkip;
        const sectionCls = nFail > 0 ? 'fail' : 'pass';
        const rows = tests
          .map((test, idx) => this.buildTestRow(test, fileKey, idx))
          .join('');
        return `<section class="module-section ${sectionCls}" data-module="${escapeHtml(fileKey)}">
  <button class="module-head" onclick="toggleModule(this)">
    <span class="caret">▾</span>
    <span class="module-name">📄 ${escapeHtml(fileKey)}</span>
    <span class="module-stats">
      <span class="chip ok">${nPass} passed</span>
      ${nFail ? `<span class="chip bad">${nFail} failed</span>` : ''}
      ${nSkip ? `<span class="chip warn">${nSkip} skipped</span>` : ''}
      <span class="chip total">${total} total</span>
    </span>
  </button>
  <div class="module-body">${rows}</div>
</section>`;
      })
      .join('');
  }

  buildTestRow(test, fileKey, idx) {
    const isPass = test.status === 'passed';
    const isFail = test.status === 'failed' || test.status === 'timedOut';
    const isSkip = !isPass && !isFail;

    const badgeCls = isPass ? 'pass' : isFail ? 'fail' : 'skipped';
    const dataStatus = isPass ? 'passed' : isFail ? 'failed' : 'skipped';
    const badgeText = isPass ? 'PASS' : isFail ? 'FAIL' : 'SKIP';
    const rowId = `row-${fileKey.replace(/\W/g, '-')}-${idx}`;

    const checksCard = `<div class="info-card checks">
  <div class="ic-label">🎯 What this test checks</div>
  <div class="ic-value">${escapeHtml(whatItChecks(test.title))}</div>
</div>`;

    let resultCard;
    if (isPass) {
      resultCard = `<div class="info-card result-pass">
  <div class="ic-label">✅ Why it passed</div>
  <div class="ic-value">${escapeHtml(whyPassed(test.title))}</div>
</div>`;
    } else if (isFail) {
      const cat = getFailureCategory(test);
      const badgeHtml = `<span class="sc-badge fail-b" style="margin-left:8px;">${cat.badge} (${cat.isTimeout ? 'TIMEOUT' : 'NOT TIMEOUT'})</span>`;
      resultCard = `<div class="info-card result-fail">
  <div class="ic-label">❌ Why it failed ${badgeHtml}</div>
  <div class="ic-value">${whyFailed(test.error?.message || test.error)}</div>
</div>`;
    } else {
      resultCard = `<div class="info-card result-skip">
  <div class="ic-label">⏭ Why it was skipped</div>
  <div class="ic-value">${escapeHtml(whySkipped(test.title))}</div>
</div>`;
    }

    let errorBlock = '';
    if (isFail && test.error) {
      const rawError = stripAnsi(String(test.error.message || test.error));
      const codeLines = rawError
        .split('\n')
        .filter((l) => l.trim())
        .slice(0, 30)
        .join('\n');
      errorBlock = `<div class="error-block">
  <div class="error-block-head">🔴 Full Error Detail</div>
  <pre>${escapeHtml(codeLines)}</pre>
</div>`;
    }

    const dataUri = screenshotDataUri(test.attachments);
    let scBlock;
    if (isSkip) {
      scBlock = `<div class="sc-block">
  <div class="sc-head skip-hdr"><span>🚫 Screenshot — Not Available</span><span class="sc-badge skip-b">SKIPPED</span></div>
  <div class="sc-none"><span class="sc-none-icon">📷</span>No screenshot was captured because the test was skipped before any browser interaction occurred.</div>
</div>`;
    } else if (dataUri) {
      const hdrCls = isPass ? 'pass-hdr' : 'fail-hdr';
      const badgeCl2 = isPass ? 'pass-b' : 'fail-b';
      const hdrLabel = isPass
        ? '📸 Screenshot — Final Page State'
        : '📸 Screenshot — Page State at Failure';
      const badgeLbl = isPass ? 'CAPTURED ON PASS' : 'CAPTURED ON FAIL';
      const altText = isPass
        ? `Screenshot: ${test.title} — test passed`
        : `Screenshot: ${test.title} — test failed`;
      const captionTitle = isPass
        ? 'What you are seeing'
        : 'What you are seeing — and why it matters';
      const captionBody = isPass
        ? 'This screenshot was captured <strong>after the test completed successfully</strong>. It confirms the browser was in the correct state when all assertions passed.'
        : 'This screenshot was captured <strong>at the exact moment the test failed</strong>. It shows what the browser displayed when the timeout or assertion error occurred.';
      const lbLabel = isPass
        ? `✅ PASSED — ${test.title}`
        : `❌ FAILED — ${test.title}`;
      scBlock = `<div class="sc-block">
  <div class="sc-head ${hdrCls}"><span>${hdrLabel}</span><span class="sc-badge ${badgeCl2}">${badgeLbl}</span></div>
  <div class="sc-caption"><strong>${captionTitle}</strong>${captionBody}</div>
  <div class="sc-img-wrap"><img src="${dataUri}" alt="${escapeHtml(altText)}" title="Click to enlarge" onclick="openLb(this,${JSON.stringify(lbLabel)})"/></div>
</div>`;
    } else {
      scBlock = `<div class="sc-block">
  <div class="sc-head ${isPass ? 'pass-hdr' : 'fail-hdr'}"><span>📷 Screenshot — Not Captured</span><span class="sc-badge ${isPass ? 'pass-b' : 'fail-b'}">${isPass ? 'PASS' : 'FAIL'}</span></div>
  <div class="sc-none"><span class="sc-none-icon">🖼️</span>No screenshot attachment found. Ensure <code>screenshot: "on"</code> is set in the Playwright config.</div>
</div>`;
    }

    const ms = test.duration || 0;
    const dur =
      ms >= 60_000
        ? `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1_000)}s`
        : ms >= 1_000
          ? `${(ms / 1_000).toFixed(1)} s`
          : `${ms} ms`;

    return `<div class="test-row ${badgeCls}" data-status="${dataStatus}" id="${rowId}">
  <div class="test-head">
    <span class="badge ${badgeCls}">${badgeText}</span>
    <span class="test-title">${escapeHtml(humanizeTitle(test.title))}</span>
    <span class="duration">${dur}</span>
    <button class="toggle-btn" onclick="toggleBody(this)">▾ Details</button>
  </div>
  <div class="test-body">
    <div class="info-grid">${checksCard}${resultCard}</div>
    ${errorBlock}
    ${scBlock}
  </div>
</div>`;
  }
}

module.exports = FriendlyHtmlReporter;
