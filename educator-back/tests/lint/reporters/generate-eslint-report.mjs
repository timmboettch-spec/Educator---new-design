// @ts-check
/** @typedef {import('eslint').ESLint.LintResult} LintResult */
/** @typedef {{ status: string, title: string, fullName: string, ancestorTitles: string[], failureMessages: string[] }} LintAssertion */
/** @typedef {{ name: string, testFilePath: string, assertionResults: LintAssertion[] }} LintSuite */
/** @typedef {{ files: Map<string, LintAssertion[]>, hasFail: boolean }} ModuleEntry */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ESLint } from 'eslint';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');
const REPORTS_DIR = path.join(ROOT, 'tests', 'lint', 'reports');
const INPUT = path.join(REPORTS_DIR, 'eslint-results.json');
const OUTPUT = path.join(REPORTS_DIR, 'index.html');

if (!fs.existsSync(REPORTS_DIR)) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

/**
 * @returns {Promise<{results: LintResult[], durationMs: number | null}>}
 */
async function loadEslintResults() {
  const startedAt = Date.now();
  try {
    const eslint = new ESLint();
    const liveResults = await eslint.lintFiles(['.']);
    fs.writeFileSync(INPUT, JSON.stringify(liveResults), 'utf-8');
    return { results: liveResults, durationMs: Date.now() - startedAt };
  } catch {
    if (fs.existsSync(INPUT)) {
      const cachedResults = /** @type {LintResult[]} */ (/** @type {unknown} */ (JSON.parse(fs.readFileSync(INPUT, 'utf-8'))));
      return { results: cachedResults, durationMs: null };
    }
    process.exit(1);
  }
}

const { results: eslintResults, durationMs } = await loadEslintResults();

/**
 * @param {string} str
 * @returns {string}
 */
function toTitleCase(str) {
  return str.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * @param {string} filePath
 * @returns {string}
 */
function moduleNameFromPath(filePath) {
  const base = path.basename(filePath);
  const name = base.replace(/\.[^.]+$/, '');
  return toTitleCase(name);
}

/**
 * @param {string} filePath
 * @returns {string}
 */
function fileLabel(filePath) {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const normalizedRoot = ROOT.replace(/\\/g, '/');
  if (normalizedPath.startsWith(`${normalizedRoot}/`)) {
    return normalizedPath.slice(normalizedRoot.length + 1);
  }
  return normalizedPath;
}

/**
 * @param {unknown} str
 * @returns {string}
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {string} status
 * @returns {string}
 */
function statusBadge(status) {
  if (status === 'passed') return '<span class="test-badge badge-pass">OK</span>';
  if (status === 'failed') return '<span class="test-badge badge-fail">ERROR</span>';
  return '<span class="test-badge badge-skip">WARNING</span>';
}

/**
 * @param {number | null | undefined} ms
 * @returns {string}
 */
function formatDuration(ms) {
  if (!ms && ms !== 0) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** @type {LintSuite[]} */
const suites = eslintResults.map(fileResult => {
  const fileMessages = fileResult.messages ?? [];
  /** @type {LintAssertion[]} */
  const assertionResults = fileMessages.length > 0
    ? fileMessages.map(msg => ({
      status: msg.severity === 2 ? 'failed' : 'skipped',
      title: `${msg.ruleId ?? 'unknown-rule'} (L${msg.line ?? 0}:C${msg.column ?? 0})`,
      fullName: msg.message,
      ancestorTitles: [fileLabel(fileResult.filePath)],
      failureMessages: [msg.message],
    }))
    : [{
      status: 'passed',
      title: 'No lint issues',
      fullName: 'No lint issues',
      ancestorTitles: [fileLabel(fileResult.filePath)],
      failureMessages: [],
    }];

  return {
    name: fileResult.filePath,
    testFilePath: fileResult.filePath,
    assertionResults,
  };
});

const numSuites = suites.length;
const durationLabel = durationMs !== null ? formatDuration(durationMs) : '—';

const totalIssues = eslintResults.reduce((sum, fileResult) => sum + (fileResult.errorCount ?? 0) + (fileResult.warningCount ?? 0), 0);
const noIssues = eslintResults.filter(fileResult => (fileResult.errorCount ?? 0) + (fileResult.warningCount ?? 0) === 0).length;
const errors = eslintResults.reduce((sum, fileResult) => sum + (fileResult.errorCount ?? 0) + (fileResult.fatalErrorCount ?? 0), 0);
const warnings = eslintResults.reduce((sum, fileResult) => sum + (fileResult.warningCount ?? 0), 0);
const passRate = numSuites > 0 ? (noIssues / numSuites) * 100 : 0;
const passRateLabel = Number.isInteger(passRate) ? String(passRate) : passRate.toFixed(1);
const generated = new Date().toLocaleString();

/** @type {Map<string, ModuleEntry>} */
const moduleMap = new Map();

suites.forEach(suite => {
  const filePath = suite.name || suite.testFilePath || '';
  const modName = moduleNameFromPath(filePath);
  const label = fileLabel(filePath);
  if (!moduleMap.has(modName)) moduleMap.set(modName, { files: new Map(), hasFail: false });
  const mod = /** @type {ModuleEntry} */ (moduleMap.get(modName));
  if (!mod.files.has(label)) mod.files.set(label, []);
  const fileTests = /** @type {LintAssertion[]} */ (mod.files.get(label));
  (suite.assertionResults ?? []).forEach(t => {
    fileTests.push(t);
    if (t.status === 'failed') mod.hasFail = true;
  });
});

/**
 * @returns {string}
 */
function buildModuleSections() {
  let html = '';
  for (const [modName, mod] of moduleMap) {
    const allTests = [...mod.files.values()].flat();
    const modNoIssues = allTests.filter(t => t.status === 'passed').length;
    const modErrors = allTests.filter(t => t.status === 'failed').length;
    const modTotal = allTests.length;
    const failClass = mod.hasFail ? ' mod-fail' : '';

    html += `
    <section class="module-section${failClass}">
      <button class="module-head">
        <span class="module-name">${escapeHtml(modName)}</span>
        <div class="module-chips">
          <span class="chip chip-passed">${modNoIssues} ok</span>
          ${modErrors > 0 ? `<span class="chip chip-failed" style="background:#fee2e2;color:#dc2626;">${modErrors} errors</span>` : ''}
          <span class="chip chip-total">${modTotal} total</span>
        </div>
      </button>
      <div class="module-body">`;

    for (const [label, tests] of mod.files) {
      const issueCount = tests.filter(t => t.status !== 'passed').length;
      html += `
        <div class="file-group">
          <div class="file-title">${escapeHtml(label)} (${issueCount} issues)</div>
          <div class="test-list">`;
      tests.forEach(t => {
        const status = t.status === 'passed' ? 'passed' : t.status === 'failed' ? 'failed' : 'skipped';
        const ancestors = (t.ancestorTitles ?? []).join(' › ');
        const desc = ancestors ? escapeHtml(ancestors) : '—';
        const errorMsg = (t.failureMessages ?? []).map(m => escapeHtml(m.split('\n')[0])).join(' ');
        html += `
            <div class="test-card" data-status="${status}">
              <div class="test-item">
                ${statusBadge(status)}
                <span class="test-title">${escapeHtml(t.title ?? t.fullName ?? '')}</span>
              </div>
              <div style="margin-top:8px;font-size:13px;color:var(--muted)">${desc}</div>
              ${errorMsg ? `<div style="margin-top:6px;font-size:12px;color:var(--danger);background:#fff5f5;border-radius:4px;padding:6px 10px;font-family:monospace">${errorMsg}</div>` : ''}
            </div>`;
      });
      html += `
          </div>
        </div>`;
    }

    html += `
      </div>
    </section>`;
  }
  return html;
}

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Backend Lint Report</title>
  <style>
    :root { --primary: #c2410c; --primary-light: #f97316; --bg: #f8fafc; --card: #fff; --text: #0f172a; --muted: #64748b; --border: #e2e8f0; --success: #16a34a; --danger: #dc2626; --warning: #d97706; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); padding: 24px; line-height: 1.55; }
    .container { max-width: 1200px; margin: 0 auto; }
    header { background: linear-gradient(135deg, var(--primary), var(--primary-light)); color: #fff; padding: 36px 32px; border-radius: 12px; display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; gap: 24px; flex-wrap: wrap; }
    header h1 { font-size: 26px; font-weight: 700; margin-bottom: 6px; }
    header .subtitle { font-size: 14px; opacity: .9; }
    header .meta { display: flex; flex-wrap: wrap; gap: 24px; margin-top: 18px; padding-top: 18px; border-top: 1px solid rgba(255,255,255,.2); }
    header .meta div { font-size: 13px; }
    header .meta strong { display: block; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; opacity: .8; margin-bottom: 2px; }
    header .logo { display: flex; flex-direction: row; align-items: center; justify-content: center; gap: 12px; background: #fff; border: 2px solid #fff; border-radius: 8px; padding: 1px 16px; }
    header .logo img { max-height: 40px; max-width: 40px; object-fit: contain; }
    header .logo-text { font-size: 14px; font-weight: 600; display: flex; gap: 4px; }
    header .logo-text .brand-name { color: #000; }
    header .logo-text .brand-ai { color: var(--primary-light); }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 14px; margin-bottom: 24px; }
    .stat-card { background: var(--card); padding: 18px; border-radius: 10px; box-shadow: 0 1px 3px rgba(0,0,0,.08); border-left: 4px solid var(--primary); }
    .stat-card .label { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); font-weight: 600; }
    .stat-card .value { font-size: 28px; font-weight: 700; color: var(--primary); margin-top: 8px; }
    .stat-card.suites, .stat-card.total { border-left-color: #2563eb; }
    .stat-card.suites .value, .stat-card.total .value { color: #2563eb; }
    .stat-card.passed { border-left-color: var(--success); }
    .stat-card.passed .value { color: var(--success); }
    .stat-card.failed { border-left-color: var(--danger); }
    .stat-card.failed .value { color: var(--danger); }
    .stat-card.skipped { border-left-color: #d97706; }
    .stat-card.skipped .value { color: #d97706; }
    .stat-card.success { border-left-color: var(--success); }
    .stat-card.success .value { color: var(--success); }
    .module-section { background: var(--card); border-radius: 8px; margin-bottom: 14px; border-left: 4px solid var(--success); overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
    .module-section.mod-fail { border-left-color: var(--danger); }
    .module-head { width: 100%; padding: 14px 18px; background: #fff; border: none; cursor: pointer; display: flex; gap: 10px; align-items: center; text-align: left; transition: background 0.2s; }
    .module-head:hover { background: #fafafa; }
    .module-head::before { content: '▼'; font-size: 12px; color: var(--muted); transition: transform 0.3s; margin-right: 6px; }
    .module-section.collapsed .module-head::before { transform: rotate(-90deg); }
    .module-name { flex: 1; font-size: 15px; font-weight: 700; color: var(--primary); text-transform: capitalize; }
    .module-chips { display: flex; gap: 6px; flex-shrink: 0; }
    .chip { font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 99px; }
    .chip-passed { background: #dcfce7; color: #15803d; }
    .chip-total { background: #ffedd5; color: #c2410c; }
    .module-body { padding: 0 20px 18px; }
    .module-section.collapsed .module-body { display: none; }
    .file-group { margin-top: 14px; }
    .file-title { font-size: 13px; font-weight: 700; padding: 6px 0 8px; border-bottom: 1px solid var(--border); }
    .test-list { list-style: none; padding: 0; margin: 0; }
    .test-card { background: var(--card); padding: 14px 16px; border-radius: 6px; margin-bottom: 12px; border: 1px solid var(--border); border-left: 4px solid var(--success); margin-top: 10px; }
    .test-card[data-status="failed"] { border-left-color: var(--danger); }
    .test-card[data-status="skipped"] { border-left-color: var(--warning); }
    .test-item { display: flex; gap: 12px; align-items: flex-start; }
    .test-badge { display: inline-block; padding: 3px 10px; font-size: 11px; font-weight: 800; border-radius: 4px; flex-shrink: 0; line-height: 1.6; }
    .badge-pass { background: var(--success); color: #fff; }
    .badge-fail { background: var(--danger); color: #fff; }
    .badge-skip { background: var(--warning); color: #fff; }
    .test-title { font-size: 14px; font-weight: 500; }
    .search-filter { display: flex; gap: 16px; align-items: center; margin-bottom: 24px; flex-wrap: wrap; }
    .search-box { flex: 1; min-width: 300px; display: flex; align-items: center; background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 10px 14px; }
    .search-box input { flex: 1; border: none; outline: none; font-size: 14px; font-family: inherit; }
    .filter-buttons { display: flex; gap: 8px; }
    .filter-btn { padding: 8px 16px; border: 1px solid var(--border); background: var(--card); border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600; transition: all 0.2s; color: var(--text); }
    .filter-btn.active { background: var(--primary); color: #fff; border-color: var(--primary); }
    .filter-btn:hover { background: #f5f5f5; }
    .filter-btn.active:hover { background: var(--primary); }
    @media(max-width:980px) { header { flex-direction: column; } .stats-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media(max-width:720px) { .stats-grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div>
        <h1>Backend Lint Report</h1>
        <p class="subtitle">User-friendly summary of every linting check — which files have issues and rule violations.</p>
        <div class="meta">
          <div><strong>PROJECT</strong><span>Educator-App-Backend</span></div>
          <div><strong>LINTER</strong><span>ESLint</span></div>
          <div><strong>DURATION</strong><span>${escapeHtml(durationLabel)}</span></div>
          <div><strong>GENERATED</strong><span>${escapeHtml(generated)}</span></div>
        </div>
      </div>
      <div class="logo">
        <img src="https://dev.educator.realityworksai.com/assets/RealityworksAI_logo.svg" alt="RealityWorks AI Logo">
        <div class="logo-text">
          <span class="brand-name">RealityWorks</span>
          <span class="brand-ai">AI</span>
        </div>
      </div>
    </header>
    <section class="stats-grid">
      <div class="stat-card suites"><span class="label">Files Analyzed</span><p class="value">${numSuites}</p></div>
      <div class="stat-card total"><span class="label">Total Issues</span><p class="value">${totalIssues}</p></div>
      <div class="stat-card passed"><span class="label">No Issues</span><p class="value">${noIssues}</p></div>
      <div class="stat-card failed"><span class="label">Errors</span><p class="value">${errors}</p></div>
      <div class="stat-card skipped"><span class="label">Warnings</span><p class="value">${warnings}</p></div>
      <div class="stat-card success"><span class="label">Pass Rate</span><p class="value">${passRateLabel}%</p></div>
    </section>
    <div class="search-filter">
      <div class="search-box">
        <input id="searchInput" type="search" placeholder="Search files or issues..." />
      </div>
      <div class="filter-buttons">
        <button class="filter-btn active" data-filter="all">All</button>
        <button class="filter-btn" data-filter="passed">No Issues</button>
        <button class="filter-btn" data-filter="failed">Errors</button>
        <button class="filter-btn" data-filter="skipped">Warnings</button>
      </div>
    </div>
    ${buildModuleSections()}
  </div>
  <script>
    const searchInput = document.getElementById('searchInput');
    const filterButtons = document.querySelectorAll('.filter-btn');
    let currentFilter = 'all';
    document.querySelectorAll('.module-head').forEach(b => {
      b.addEventListener('click', function() { this.closest('.module-section').classList.toggle('collapsed'); });
    });
    function filterTests() {
      const s = searchInput.value.toLowerCase();
      document.querySelectorAll('.test-card').forEach(c => {
        const t = c.textContent.toLowerCase(), st = c.getAttribute('data-status');
        c.style.display = (t.includes(s) && (currentFilter === 'all' || st === currentFilter)) ? '' : 'none';
      });
      document.querySelectorAll('.file-group').forEach(f => {
        f.style.display = f.querySelectorAll('.test-card:not([style*="display: none"])').length ? '' : 'none';
      });
      document.querySelectorAll('.module-section').forEach(m => {
        m.style.display = m.querySelectorAll('.test-card:not([style*="display: none"])').length ? '' : 'none';
      });
    }
    searchInput.addEventListener('input', filterTests);
    filterButtons.forEach(b => {
      b.addEventListener('click', function() {
        filterButtons.forEach(x => x.classList.remove('active'));
        this.classList.add('active');
        currentFilter = this.getAttribute('data-filter');
        filterTests();
      });
    });
  </script>
</body>
</html>`;

fs.writeFileSync(OUTPUT, html, 'utf-8');