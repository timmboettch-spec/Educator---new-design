/**
 * Friendly HTML Reporter for Jest
 * --------------------------------
 * Produces a single-page, user-friendly HTML report describing each test
 * in plain English — what it validates, and (on failure) why it failed.
 */

const fs = require('fs');
const path = require('path');

/* ------------------------ helpers ------------------------ */

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

function moduleFromPath(testPath) {
  const norm = testPath.replace(/\\/g, '/');
  const m = norm.match(/\/tests\/(?:api|unit|integration)\/modules\/([^/]+)\//);
  if (m) return m[1];
  const s = norm.match(/\/src\/modules\/([^/]+)\//);
  return s ? s[1] : 'other';
}

function fileBase(testPath) {
  return path.basename(testPath);
}

function humanizeTitle(title) {
  if (!title) return 'Validates expected behavior.';
  let t = title.trim();
  t = t.replace(/^should\s+/i, '');
  t = t.charAt(0).toUpperCase() + t.slice(1);
  if (!/[.!?]$/.test(t)) t += '.';
  return t;
}

/* Plain-English descriptions for every HTTP status code used in tests */
const STATUS_DESCRIPTIONS = {
  200: '200 OK — The request succeeded and the API returned the expected data.',
  201: '201 Created — A new resource was successfully created and returned.',
  204: '204 No Content — The request succeeded but the API returned no body (e.g. delete).',
  400: '400 Bad Request — The request payload was invalid, malformed, or missing required fields. The API correctly rejected it.',
  401: '401 Unauthorized — No valid authentication token was provided. The API correctly blocked unauthenticated access.',
  403: '403 Forbidden — A valid token was provided but the user does not have permission to perform this action.',
  404: '404 Not Found — The requested resource does not exist. The API correctly returned not-found.',
  405: '405 Method Not Allowed — The HTTP method (GET/POST/etc.) is not supported on this endpoint.',
  408: '408 Request Timeout — The request took too long. The API correctly returned a timeout error.',
  409: '409 Conflict — A duplicate or conflicting resource already exists. The API correctly rejected the request.',
  415: '415 Unsupported Media Type — The request Content-Type header was wrong or missing.',
  422: '422 Unprocessable Entity — The payload structure was understood but the data failed business-level validation.',
  429: '429 Too Many Requests — The client sent too many requests in a short period. Rate limiting kicked in as expected.',
  500: '500 Internal Server Error — A server-side or dependency failure occurred. The API correctly propagated the error.',
  502: '502 Bad Gateway — An upstream service returned an invalid response. The API correctly surfaced this.',
  503: '503 Service Unavailable — A required downstream service is temporarily unavailable. The API handled the outage gracefully.',
  504: '504 Gateway Timeout — An upstream service timed out. The API correctly returned a gateway timeout.',
};

function statusDescription(code) {
  return (
    STATUS_DESCRIPTIONS[Number(code)] || `HTTP ${code} — response matched the expected status code.`
  );
}

function whyPassed(title) {
  const lower = (title || '').toLowerCase();

  // If a status code is mentioned in the title, give a detailed status-specific explanation
  const statusMatch = lower.match(/\b([1-5]\d{2})\b/);
  if (statusMatch) {
    return `The API returned the expected status code. ${statusDescription(statusMatch[1])}`;
  }
  if (/(unauthor|forbidden|token|jwt|auth)/.test(lower))
    return 'Authentication & authorization rules were enforced correctly. The API rejected the request as expected.';
  if (/(create|post|add)/.test(lower))
    return 'The resource was created successfully. The API returned 201 Created with the correct response structure.';
  if (/(update|put|patch|edit)/.test(lower))
    return 'The resource was updated successfully. The API returned 200 OK with the updated data.';
  if (/(delete|remove)/.test(lower))
    return 'The resource was deleted successfully. The API responded with the expected status and empty/confirmation body.';
  if (/(get|list|fetch|read|retrieve)/.test(lower))
    return 'The API returned 200 OK with the expected data in the correct shape and structure.';
  if (/(validation|invalid|missing|required|payload|schema)/.test(lower))
    return 'Input validation worked correctly. The API returned 400 Bad Request because a required field was missing or invalid.';
  if (/(timeout|unavailable|failure|down|outage|gateway)/.test(lower))
    return 'Resilience test passed. The API handled the simulated service failure and returned the expected error response.';
  if (/(conflict|duplicate|already exists)/.test(lower))
    return 'Duplicate detection worked. The API returned 409 Conflict because the resource already exists.';
  if (/(rate.?limit|too many)/.test(lower))
    return 'Rate limiting worked. The API returned 429 Too Many Requests and blocked the excess traffic as expected.';
  if (/(contract|schema|shape|structure)/.test(lower))
    return 'Contract test passed. The response payload matched the expected API schema exactly.';
  return 'The API behaved as expected and all assertions passed.';
}

function whyFailed(failureMessages = []) {
  if (!failureMessages.length) return 'The test did not meet the expected outcome.';
  const raw = stripAnsi(failureMessages.join('\n'));

  // Most common: Expected: X / Received: Y — check for status code mismatch first
  const expectMatch = raw.match(
    /Expected:\s*([\s\S]*?)\nReceived:\s*([\s\S]*?)(?:\n\n|\n\s+at\s|$)/,
  );
  if (expectMatch) {
    const expected = expectMatch[1].trim().split('\n')[0].slice(0, 200).trim();
    const received = expectMatch[2].trim().split('\n')[0].slice(0, 200).trim();

    // Both sides are status codes — give a rich explanation
    if (/^\d{3}$/.test(expected) && /^\d{3}$/.test(received)) {
      const expDesc = statusDescription(expected);
      const recDesc = statusDescription(received);
      return (
        `The test expected <strong>${expected}</strong> but the API returned <strong>${received}</strong>.<br>` +
        `<span style="color:#16a34a">Expected: ${escapeHtml(expDesc)}</span><br>` +
        `<span style="color:#dc2626">Received: ${escapeHtml(recDesc)}</span><br>` +
        `<em>Fix: Check the controller logic, guard, or middleware that is returning ${received} instead of ${expected}.</em>`
      );
    }

    // Generic Expected/Received
    return (
      `The assertion failed.<br>` +
      `<span style="color:#16a34a">Expected: <code>${escapeHtml(expected)}</code></span><br>` +
      `<span style="color:#dc2626">Received: <code>${escapeHtml(received)}</code></span>`
    );
  }

  // Pattern: expected 200 … received 401 (Supertest style)
  const statusMatch = raw.match(/expected (\d{3})[^\d].*?(?:got|received|to equal)\s*(\d{3})/i);
  if (statusMatch) {
    const expDesc = statusDescription(statusMatch[1]);
    const recDesc = statusDescription(statusMatch[2]);
    return (
      `The API returned status <strong>${statusMatch[2]}</strong> instead of <strong>${statusMatch[1]}</strong>.<br>` +
      `<span style="color:#16a34a">Expected: ${escapeHtml(expDesc)}</span><br>` +
      `<span style="color:#dc2626">Received: ${escapeHtml(recDesc)}</span><br>` +
      `<em>Fix: Check the controller logic, guard, or middleware that is returning ${statusMatch[2]} instead of ${statusMatch[1]}.</em>`
    );
  }

  if (/timeout/i.test(raw))
    return 'The test exceeded its allowed time. The API did not respond before the timeout limit. Check for slow queries, infinite loops, or missing awaits.';

  if (/ECONNREFUSED/i.test(raw))
    return 'Connection refused — a required service (Redis, database, or the NestJS app itself) was not running when the test executed.';
  if (/ENOTFOUND/i.test(raw))
    return 'DNS/host not found — the test tried to reach a host that does not exist. Check the base URL configuration.';
  if (/ETIMEDOUT/i.test(raw))
    return 'Network timeout — the connection to a required service timed out. The service may be overloaded or unreachable.';

  const firstLine = raw.split('\n').find((l) => l.trim().length > 0 && !/^\s*at\s/.test(l));
  if (firstLine) return escapeHtml(firstLine.trim().slice(0, 400));
  return 'The test did not meet the expected outcome.';
}

/* ------------------------ reporter ------------------------ */

class FriendlyHtmlReporter {
  constructor(globalConfig, options = {}) {
    this._globalConfig = globalConfig;
    this._options = options;
    const rawOut = options.outputPath || '<rootDir>/tests/api/reports/html/api-test-report.html';
    this._outputPath = rawOut.replace(/<rootDir>/g, globalConfig.rootDir);
    this._pageTitle = options.pageTitle || 'Backend API Test Report';
    this._subtitle =
      options.subtitle ||
      'User-friendly summary of every API test — what it validates and why it passed / failed.';
    this._showTargetUrl = options.showTargetUrl || false;
  }

  onRunComplete(_contexts, results) {
    try {
      const modules = {};
      let totalDurationMs = 0;

      for (const fileResult of results.testResults || []) {
        const modKey = moduleFromPath(fileResult.testFilePath);
        const file = fileBase(fileResult.testFilePath);
        modules[modKey] = modules[modKey] || { files: {} };
        modules[modKey].files[file] = modules[modKey].files[file] || [];

        for (const tc of fileResult.testResults || []) {
          modules[modKey].files[file].push({
            title: tc.title,
            fullName: tc.fullName,
            ancestorTitles: tc.ancestorTitles,
            status: tc.status,
            duration: tc.duration || 0,
            failureMessages: tc.failureMessages || [],
          });
          totalDurationMs += tc.duration || 0;
        }
      }

      const html = this._renderHtml({
        summary: {
          suites: results.numTotalTestSuites || 0,
          passedSuites: results.numPassedTestSuites || 0,
          failedSuites: results.numFailedTestSuites || 0,
          tests: results.numTotalTests || 0,
          passed: results.numPassedTests || 0,
          failed: results.numFailedTests || 0,
          pending: (results.numPendingTests || 0) + (results.numTodoTests || 0),
          durationMs: totalDurationMs,
          startTime: results.startTime,
        },
        modules,
      });

      fs.mkdirSync(path.dirname(this._outputPath), { recursive: true });
      fs.writeFileSync(this._outputPath, html, 'utf-8');
      // eslint-disable-next-line no-console
      console.log(`\n${this._pageTitle}: ${this._outputPath}\n`);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(
        `\n[FriendlyHtmlReporter] Failed to generate report: ${err.message}\n`,
        err.stack,
      );
    }
  }

  _renderHtml({ summary, modules }) {
    const moduleKeys = Object.keys(modules).sort();
    const logoPath = path.resolve(__dirname, '../../../../frontend/public/Realityworks_AI_RGB.png');
    let logoDataUri = '';
    try {
      const logoBytes = fs.readFileSync(logoPath);
      logoDataUri = 'data:image/png;base64,' + logoBytes.toString('base64');
    } catch (_) {
      /* logo not found — skip */
    }
    const successRate = summary.tests
      ? Math.round((summary.passed / summary.tests) * 1000) / 10
      : 0;

    const moduleSections = moduleKeys
      .map((modKey) => {
        const fileEntries = Object.entries(modules[modKey].files);
        let modPassed = 0,
          modFailed = 0,
          modSkipped = 0;
        fileEntries.forEach(([, tests]) => {
          tests.forEach((t) => {
            if (t.status === 'passed') modPassed++;
            else if (t.status === 'failed') modFailed++;
            else modSkipped++;
          });
        });
        const modTotal = modPassed + modFailed + modSkipped;
        const modStatus = modFailed > 0 ? 'fail' : 'pass';

        const fileBlocks = fileEntries
          .map(([file, tests]) => {
            const rows = tests
              .map((t) => {
                try {
                  const isPass = t.status === 'passed';
                  const isFail = t.status === 'failed';
                  const badgeCls = isPass ? 'pass' : isFail ? 'fail' : 'skip';
                  const badgeText = isPass ? 'PASS' : isFail ? 'FAIL' : t.status.toUpperCase();
                  const explanation = isFail
                    ? whyFailed(t.failureMessages)
                    : isPass
                      ? whyPassed(t.title)
                      : 'Test was skipped or pending.';
                  const explLabel = isFail ? 'Why it failed' : isPass ? 'Why it passed' : 'Note';

                  return `
                  <div class="test-row ${badgeCls}" data-status="${badgeCls}">
                    <div class="test-head">
                      <span class="badge ${badgeCls}">${badgeText}</span>
                      <span class="test-title">${escapeHtml(humanizeTitle(t.title))}</span>
                      <span class="duration">${t.duration || 0} ms</span>
                    </div>
                    <div class="test-body">
                      <div class="kvp"><span class="k">Test:</span><span class="v">${escapeHtml(t.fullName)}</span></div>
                      <div class="kvp"><span class="k">${explLabel}:</span><span class="v explanation">${explanation}</span></div>
                    </div>
                  </div>`;
                } catch (e) {
                  return `<div class="test-row fail" data-status="fail"><div class="test-head"><span class="badge fail">ERROR</span><span class="test-title">${escapeHtml(t.title || 'unknown')}</span></div><div class="test-body"><div class="kvp"><span class="k">Reporter error:</span><span class="v">${escapeHtml(String(e.message))}</span></div></div></div>`;
                }
              })
              .join('');

            return `
            <div class="file-block">
              <div class="file-head">📄 ${escapeHtml(file)} <span class="file-count">(${tests.length} tests)</span></div>
              ${rows}
            </div>`;
          })
          .join('');

        return `
        <section class="module-section ${modStatus}" data-module="${escapeHtml(modKey)}">
          <button class="module-head" onclick="toggleModule(this)">
            <span class="caret">▾</span>
            <span class="module-name">${escapeHtml(modKey.charAt(0).toUpperCase() + modKey.slice(1))}</span>
            <span class="module-stats">
              <span class="chip ok">${modPassed} passed</span>
              ${modFailed ? `<span class="chip bad">${modFailed} failed</span>` : ''}
              ${modSkipped ? `<span class="chip warn">${modSkipped} skipped</span>` : ''}
              <span class="chip total">${modTotal} total</span>
            </span>
          </button>
          <div class="module-body">
            ${fileBlocks}
          </div>
        </section>`;
      })
      .join('');

    const generatedAt = new Date().toLocaleString();
    const durationSec = (summary.durationMs / 1000).toFixed(2);

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>${escapeHtml(this._pageTitle)}</title>
<style>
  :root{
    --primary:#c2410c; --primary-light:#f97316;
    --bg:#f8fafc; --card:#fff; --text:#0f172a; --muted:#64748b;
    --border:#e2e8f0; --success:#16a34a; --danger:#dc2626; --warning:#d97706;
    --shadow:0 1px 3px rgba(15,23,42,.08),0 1px 2px rgba(15,23,42,.04);
    --shadow-lg:0 10px 25px -5px rgba(15,23,42,.1),0 8px 10px -6px rgba(15,23,42,.06);
  }
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;background:var(--bg);color:var(--text);line-height:1.55;padding:24px}
  .container{max-width:1200px;margin:0 auto}
  header{background:linear-gradient(135deg,var(--primary) 0%,var(--primary-light) 100%);color:#fff;padding:36px 32px;border-radius:12px;box-shadow:var(--shadow-lg);margin-bottom:24px}
  header h1{font-size:26px;font-weight:700;margin-bottom:6px}
  header .subtitle{font-size:14px;opacity:.9}
  header .meta{display:flex;flex-wrap:wrap;gap:24px;margin-top:18px;padding-top:18px;border-top:1px solid rgba(255,255,255,.2)}
  header .meta div{font-size:13px}
  header .meta strong{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.05em;opacity:.8;margin-bottom:2px}

  .stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:14px;margin-bottom:24px}
  .stat-card{background:var(--card);padding:18px;border-radius:10px;box-shadow:var(--shadow);border-left:4px solid var(--primary)}
  .stat-card .label{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);font-weight:600}
  .stat-card .value{font-size:28px;font-weight:700;color:var(--primary);margin-top:2px}
  .stat-card.ok{border-left-color:var(--success)} .stat-card.ok .value{color:var(--success)}
  .stat-card.bad{border-left-color:var(--danger)} .stat-card.bad .value{color:var(--danger)}
  .stat-card.warn{border-left-color:var(--warning)} .stat-card.warn .value{color:var(--warning)}

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
  .module-name{flex:1;text-transform:capitalize}
  .module-stats{display:flex;gap:6px;flex-wrap:wrap}
  .chip{font-size:11px;font-weight:600;padding:3px 9px;border-radius:99px;letter-spacing:.02em}
  .chip.ok{background:#dcfce7;color:#166534}
  .chip.bad{background:#fee2e2;color:#991b1b}
  .chip.warn{background:#fef3c7;color:#92400e}
  .chip.total{background:#ffedd5;color:#9a3412}

  .module-body{padding:14px 20px 18px}
  .file-block{margin-top:10px}
  .file-head{font-size:13px;font-weight:600;color:var(--muted);padding:8px 0;border-bottom:1px dashed var(--border);margin-bottom:8px}
  .file-count{color:var(--muted);font-weight:400;font-size:12px}

  .test-row{border:1px solid var(--border);border-left-width:4px;border-radius:6px;margin-bottom:8px;background:#fff;overflow:hidden}
  .test-row.pass{border-left-color:var(--success)}
  .test-row.fail{border-left-color:var(--danger);background:#fffafa}
  .test-row.skip{border-left-color:var(--warning)}
  .test-head{display:flex;align-items:center;gap:12px;padding:10px 14px;background:#fafbfc}
  .badge{font-size:11px;font-weight:700;padding:3px 9px;border-radius:4px;color:#fff;letter-spacing:.05em;min-width:48px;text-align:center}
  .badge.pass{background:var(--success)}
  .badge.fail{background:var(--danger)}
  .badge.skip{background:var(--warning)}
  .test-title{flex:1;font-size:14px;font-weight:500;color:var(--text)}
  .duration{font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums}
  .test-body{padding:10px 14px 12px;font-size:13px;background:#fff}
  .kvp{display:flex;gap:10px;margin-top:4px}
  .kvp .k{color:var(--muted);font-weight:600;min-width:90px;font-size:12px;text-transform:uppercase;letter-spacing:.04em}
  .kvp .v{flex:1;color:var(--text);word-break:break-word}
  .kvp .v.explanation{color:#334155}
  .kvp code{background:#f1f5f9;padding:1px 6px;border-radius:3px;font-family:Consolas,Menlo,monospace;font-size:12px;color:#0f172a}

  .empty-state{text-align:center;padding:40px;color:var(--muted)}

  footer{text-align:center;padding:20px;color:var(--muted);font-size:12px;margin-top:24px}
  footer strong{color:var(--primary)}

  @media print{
    body{background:#fff;padding:0}
    .controls{display:none}
    .module-section.collapsed .module-body{display:block}
    .caret{display:none}
  }
</style>
</head>
<body>
<div class="container">

  <header style="display:flex;align-items:center;justify-content:space-between;gap:24px">
    <div>
      <h1>${escapeHtml(this._pageTitle)}</h1>
      <div class="subtitle">${escapeHtml(this._subtitle)}</div>
      <div class="meta">
        <div><strong>Project</strong>HS Online AI App — Backend</div>
        <div><strong>Framework</strong>${this._showTargetUrl ? 'Jest + axios (live server)' : 'Jest + Supertest (NestJS)'}</div>
        ${this._showTargetUrl && process.env.BASE_BACKEND_URL ? `<div><strong>Target URL</strong>${escapeHtml(process.env.BASE_BACKEND_URL)}</div>` : ''}
        <div><strong>Duration</strong>${durationSec} s</div>
        <div><strong>Generated</strong>${escapeHtml(generatedAt)}</div>
      </div>
    </div>
    ${logoDataUri ? `<img src="${logoDataUri}" alt="Realityworks AI" style="height:auto;max-height:64px;width:min(36vw,340px);max-width:100%;object-fit:contain;object-position:right center;flex-shrink:1;background:#fff;padding:8px 12px;border-radius:10px"/>` : ''}
  </header>

  <section class="stats-grid">
    <div class="stat-card"><div class="label">Test Suites</div><div class="value">${summary.suites}</div></div>
    <div class="stat-card"><div class="label">Total Tests</div><div class="value">${summary.tests}</div></div>
    <div class="stat-card ok"><div class="label">Passed</div><div class="value">${summary.passed}</div></div>
    <div class="stat-card bad"><div class="label">Failed</div><div class="value">${summary.failed}</div></div>
    <div class="stat-card warn"><div class="label">Skipped</div><div class="value">${summary.pending}</div></div>
    <div class="stat-card ok"><div class="label">Success Rate</div><div class="value">${successRate}%</div></div>
  </section>

  <div class="controls">
    <input type="search" id="search" placeholder="🔍  Search tests by name, module, or description…" oninput="applyFilter()"/>
    <div class="filter-btns">
      <button class="filter-btn active" data-filter="all" onclick="setFilter(this,'all')">All</button>
      <button class="filter-btn" data-filter="pass" onclick="setFilter(this,'pass')">Passed</button>
      <button class="filter-btn" data-filter="fail" onclick="setFilter(this,'fail')">Failed</button>
      <button class="filter-btn" data-filter="skip" onclick="setFilter(this,'skip')">Skipped</button>
    </div>
  </div>

  <main id="modules">
    ${moduleSections || '<div class="empty-state">No test results found.</div>'}
  </main>

  <footer>
    <strong>HS Online AI App</strong> &nbsp;|&nbsp; API Test Report
  </footer>
</div>

<script>
  let currentFilter = 'all';

  function toggleModule(btn){
    btn.parentElement.classList.toggle('collapsed');
  }

  function setFilter(btn, f){
    document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = f;
    applyFilter();
  }

  function applyFilter(){
    const q = (document.getElementById('search').value || '').toLowerCase();
    document.querySelectorAll('.module-section').forEach(section=>{
      let visibleCount = 0;
      section.querySelectorAll('.test-row').forEach(row=>{
        const matchesStatus = currentFilter==='all' || row.dataset.status===currentFilter;
        const matchesQuery = !q || row.innerText.toLowerCase().includes(q);
        const show = matchesStatus && matchesQuery;
        row.style.display = show ? '' : 'none';
        if(show) visibleCount++;
      });
      section.style.display = visibleCount===0 && (q || currentFilter!=='all') ? 'none' : '';
    });
  }
</script>
</body>
</html>`;
  }
}

module.exports = FriendlyHtmlReporter;
