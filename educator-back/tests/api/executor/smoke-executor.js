/* eslint-disable */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

// ── paths ─────────────────────────────────────────────────────────────────────
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const SMOKE_RESULTS_FILE = path.join(PROJECT_ROOT, 'tests/api/reports/.smoke-results.json');
const SMOKE_STATE_FILE = path.join(PROJECT_ROOT, 'tests/api/executor/.smoke-state.json');
const SMOKE_REPORT_DIR = path.join(PROJECT_ROOT, 'tests/api/reports/html');
const SMOKE_REPORT_PATH = path.join(SMOKE_REPORT_DIR, 'api-smoke-report.html');

// ── smoke modules ──────────────────────────────────────────────────────────────
const SMOKE_MODULES = [
  { id: 1, name: 'auth',       displayName: 'Auth',       path: 'tests/api/modules/smoke/auth.smoke.spec.ts' },
  { id: 2, name: 'school',     displayName: 'School',     path: 'tests/api/modules/smoke/school.smoke.spec.ts' },
  { id: 3, name: 'educator',   displayName: 'Educator',   path: 'tests/api/modules/smoke/educator.smoke.spec.ts' },
  { id: 4, name: 'dashboard',  displayName: 'Dashboard',  path: 'tests/api/modules/smoke/dashboard.smoke.spec.ts' },
  { id: 5, name: 'class',      displayName: 'Class',      path: 'tests/api/modules/smoke/class.smoke.spec.ts' },
  { id: 6, name: 'student',    displayName: 'Student',    path: 'tests/api/modules/smoke/student.smoke.spec.ts' },
  { id: 7, name: 'simulation', displayName: 'Simulation', path: 'tests/api/modules/smoke/simulation.smoke.spec.ts' },
];

// ── state helpers ──────────────────────────────────────────────────────────────
function initState() {
  const state = { startTime: new Date().toISOString(), completedModules: [], isInterrupted: false };
  fs.writeFileSync(SMOKE_STATE_FILE, JSON.stringify(state, null, 2));
  return state;
}

function markModuleComplete(name) {
  let state = {};
  try { state = JSON.parse(fs.readFileSync(SMOKE_STATE_FILE, 'utf-8')); } catch {}
  state.completedModules = [...(state.completedModules || []), name];
  fs.writeFileSync(SMOKE_STATE_FILE, JSON.stringify(state, null, 2));
}

function markComplete() {
  let state = {};
  try { state = JSON.parse(fs.readFileSync(SMOKE_STATE_FILE, 'utf-8')); } catch {}
  state.endTime = new Date().toISOString();
  state.isInterrupted = false;
  fs.writeFileSync(SMOKE_STATE_FILE, JSON.stringify(state, null, 2));
}

function markInterrupted() {
  let state = {};
  try { state = JSON.parse(fs.readFileSync(SMOKE_STATE_FILE, 'utf-8')); } catch {}
  state.isInterrupted = true;
  state.interruptedAt = new Date().toISOString();
  fs.writeFileSync(SMOKE_STATE_FILE, JSON.stringify(state, null, 2));
}

// ── merge results ──────────────────────────────────────────────────────────────
function mergeResults(tempFile) {
  if (!fs.existsSync(tempFile)) return;
  try {
    const newRes = JSON.parse(fs.readFileSync(tempFile, 'utf-8'));
    let all = { testResults: [] };
    if (fs.existsSync(SMOKE_RESULTS_FILE)) {
      all = JSON.parse(fs.readFileSync(SMOKE_RESULTS_FILE, 'utf-8'));
    }
    all.testResults = [...(all.testResults || []), ...(newRes.testResults || [])];
    fs.writeFileSync(SMOKE_RESULTS_FILE, JSON.stringify(all, null, 2));
  } catch (e) {
    console.error('Failed to merge smoke results:', e.message);
  }
}

// ── execute a module ───────────────────────────────────────────────────────────
let currentChild = null;

function executeModule(mod) {
  return new Promise((resolve) => {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`[Smoke] MODULE ${mod.id}/${SMOKE_MODULES.length}: ${mod.displayName}`);
    console.log(`${'='.repeat(70)}`);

    const tempFile = path.join(PROJECT_ROOT, `tests/api/reports/.smoke-results-${mod.id}.json`);

    const args = [
      'jest',
      '--config', 'tests/api/jest.smoke.config.ts',
      '--runInBand',
      '--forceExit',
      mod.path,
      '--json', `--outputFile=${tempFile}`,
    ];

    const child = spawn('npx', args, {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
      shell: true,
      env: { ...process.env },
    });

    currentChild = child;

    const killTimer = setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL');
    }, 120000);

    child.on('close', (code) => {
      clearTimeout(killTimer);
      currentChild = null;
      mergeResults(tempFile);
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
      markModuleComplete(mod.name);
      const passed = code === 0 || code === null;
      console.log(`\n[Smoke] ${mod.displayName}: ${passed ? 'PASSED' : 'SOME FAILURES'}`);
      resolve({ mod, passed, exitCode: code ?? 1 });
    });

    child.on('error', (err) => {
      clearTimeout(killTimer);
      currentChild = null;
      console.error(`[Smoke] Module error: ${err.message}`);
      resolve({ mod, passed: false, exitCode: 1 });
    });
  });
}

// ── report generator ───────────────────────────────────────────────────────────
function generateReport(isInterrupted = false) {
  if (!fs.existsSync(SMOKE_RESULTS_FILE)) {
    console.log('[Smoke] No results to report.');
    return;
  }

  console.log('\n[Smoke] Generating HTML report...\n');

  let state = {};
  try { state = JSON.parse(fs.readFileSync(SMOKE_STATE_FILE, 'utf-8')); } catch {}
  const completedModules = state.completedModules || [];
  const allModuleNames = SMOKE_MODULES.map(m => m.name);
  const notExecuted = allModuleNames.filter(n => !completedModules.includes(n));

  const jestResults = JSON.parse(fs.readFileSync(SMOKE_RESULTS_FILE, 'utf-8'));
  const testResults = jestResults.testResults || [];

  const rows = [];
  const negativePatterns = ['invalid', 'missing', 'unauthorized', 'expired', 'duplicate', 'not found', 'error', 'failed', 'empty', 'forbidden', 'reject'];

  for (const file of testResults) {
    const normalizedPath = file.name.replace(/\\/g, '/');
    const fileName = path.basename(normalizedPath);
    const moduleName = normalizedPath.includes('/smoke/')
      ? normalizedPath.split('/smoke/')[1].split('.')[0]
      : 'smoke';

    for (const test of file.assertionResults || []) {
      const status = test.status === 'passed' ? 'Passed' : test.status === 'failed' ? 'Failed' : 'Skipped';
      const scenarioType = negativePatterns.some(p => test.title.toLowerCase().includes(p)) ? 'NEGATIVE' : 'POSITIVE';
      let failureMessage = '';
      if (test.status === 'failed' && test.failureMessages?.length > 0) {
        failureMessage = test.failureMessages[0];
      }
      rows.push({
        title: test.title,
        status,
        scenarioType,
        fileName,
        moduleName: moduleName.charAt(0).toUpperCase() + moduleName.slice(1),
        durationMs: test.duration || 0,
        failureMessage,
      });
    }
  }

  const passed = rows.filter(r => r.status === 'Passed').length;
  const failed = rows.filter(r => r.status === 'Failed').length;
  const skipped = rows.filter(r => r.status === 'Skipped').length;
  const totalDuration = rows.reduce((s, r) => s + r.durationMs, 0);
  const totalSeconds = Math.round(totalDuration / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const durationDisplay = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
  const successRate = rows.length > 0 ? Math.round((passed / rows.length) * 100) : 0;

  // Build module → file → tests structure (mirrors generate-report.js)
  const moduleMap = new Map();
  rows.forEach(r => {
    if (!moduleMap.has(r.moduleName)) moduleMap.set(r.moduleName, new Map());
    const fileMap = moduleMap.get(r.moduleName);
    if (!fileMap.has(r.fileName)) fileMap.set(r.fileName, []);
    fileMap.get(r.fileName).push(r);
  });

  const escapeHtml = (text) => {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return String(text).replace(/[&<>"']/g, m => map[m]);
  };

  function removeAnsiCodes(str) {
    return str.replace(/\x1b\[[0-9;]*m/g, '');
  }

  function parseFailureMessage(failureMessage) {
    if (!failureMessage) return 'Assertion failed or response did not match expected values.';
    const expectedMatch = failureMessage.match(/Expected:\s*"([^"]+)"/);
    const receivedMatch = failureMessage.match(/Received:\s*"([^"]+)"/);
    if (expectedMatch && receivedMatch) {
      const expected = escapeHtml(removeAnsiCodes(expectedMatch[1]).trim());
      const received = escapeHtml(removeAnsiCodes(receivedMatch[1]).trim());
      return `<span style="color:#16a34a;font-weight:500;">Expected: <strong>"${expected}"</strong></span> | <span style="color:#dc2626;font-weight:500;">Received: <strong>"${received}"</strong></span>`;
    }
    const errorLines = failureMessage.split('\n').filter(l => l.trim() && !l.includes(' at '));
    return errorLines.length > 0 ? escapeHtml(errorLines.slice(0, 2).join(' | ')) : 'Assertion failed or response did not match expected values.';
  }

  const moduleRows = Array.from(moduleMap.entries()).map(([modName, fileMap]) => {
    const modTests = Array.from(fileMap.values()).flat();
    const modPassed = modTests.filter(t => t.status === 'Passed').length;
    const modFailed = modTests.filter(t => t.status === 'Failed').length;
    const borderClass = modFailed > 0 ? 'mod-fail' : 'mod-pass';

    const fileRows = Array.from(fileMap.entries()).map(([fileName, tests]) => {
      const testCards = tests.map(t => {
        const badgeClass = t.status === 'Passed' ? 'badge-pass' : t.status === 'Failed' ? 'badge-fail' : 'badge-skip';
        const badgeText = t.status === 'Passed' ? 'PASS' : t.status === 'Failed' ? 'FAIL' : 'SKIP';
        const reasonLabel = t.status === 'Passed' ? 'WHY IT PASSED' : t.status === 'Failed' ? 'WHY IT FAILED' : 'NOTE';
        let reasonText;
        if (t.status === 'Passed') {
          reasonText = 'All assertions passed — API responded as expected.';
        } else if (t.status === 'Failed') {
          reasonText = parseFailureMessage(t.failureMessage);
        } else {
          reasonText = 'This test was skipped and did not execute.';
        }
        const reasonHtml = reasonText.includes('<span style') ? reasonText : escapeHtml(reasonText);
        return `<div class="test-card" data-status="${t.status.toLowerCase()}" data-title="${escapeHtml(t.title.toLowerCase())}">
          <div class="test-head">
            <span class="test-badge ${badgeClass}">${badgeText}</span>
            <span class="test-title">${escapeHtml(t.title)}</span>
          </div>
          <div class="test-body">
            <div class="test-section">
              <span class="test-label">TYPE:</span>
              <span class="test-value">${t.scenarioType}</span>
            </div>
            <div class="test-section">
              <span class="test-label">${reasonLabel}:</span>
              <span class="test-value">${reasonHtml}</span>
            </div>
          </div>
        </div>`;
      }).join('');

      return `<div class="file-group">
        <div class="file-title">${escapeHtml(fileName)} (${tests.length} tests)</div>
        <div class="test-list">${testCards}</div>
      </div>`;
    }).join('');

    return `<section class="module-section ${borderClass}" data-module="${escapeHtml(modName).toLowerCase()}">
      <button class="module-head" type="button">
        <span class="module-name">${escapeHtml(modName)} Module</span>
        <div class="module-chips">
          <span class="chip chip-passed">${modPassed} passed</span>
          <span class="chip chip-total">${modTests.length} total</span>
        </div>
      </button>
      <div class="module-body">${fileRows}</div>
    </section>`;
  }).join('');

  // Embed logo as base64 (works offline)
  let logoDataUri = '';
  try {
    const logoPath = path.join(PROJECT_ROOT, 'tests/api/reporters/logo.svg');
    if (fs.existsSync(logoPath)) {
      const svgContent = fs.readFileSync(logoPath, 'utf-8');
      logoDataUri = `data:image/svg+xml;base64,${Buffer.from(svgContent).toString('base64')}`;
    }
  } catch (e) {
    console.warn('[Smoke] Could not embed logo:', e.message);
  }

  const interruptionBanner = isInterrupted ? `
    <div class="interruption-banner">
      <div class="interruption-icon">⚠️</div>
      <div class="interruption-content">
        <h3>Execution Interrupted</h3>
        <p>Smoke tests were stopped before completion (Ctrl+C detected). Results below are partial.</p>
        <div class="modules-info">
          <div><strong>Completed Modules (${completedModules.length}):</strong> ${completedModules.length > 0 ? completedModules.join(', ') : 'None'}</div>
          ${notExecuted.length > 0 ? `<div style="margin-top:6px;"><strong>⏭️ Not Executed (${notExecuted.length}):</strong> ${notExecuted.join(', ')}</div>` : ''}
        </div>
      </div>
    </div>` : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Backend API Smoke Test Report</title>
  <style>
    :root {
      --primary: #c2410c;
      --primary-light: #f97316;
      --bg: #f8fafc;
      --card: #fff;
      --text: #0f172a;
      --muted: #64748b;
      --border: #e2e8f0;
      --success: #16a34a;
      --danger: #dc2626;
      --warning: #d97706;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); padding: 24px; line-height: 1.55; }
    .container { max-width: 1200px; margin: 0 auto; }
    header {
      background: linear-gradient(135deg, var(--primary), var(--primary-light));
      color: #fff;
      padding: 36px 32px;
      border-radius: 12px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 24px;
      gap: 24px;
      flex-wrap: wrap;
    }
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
    .stat-card.total { border-left-color: #2563eb; }
    .stat-card.total .value { color: #2563eb; }
    .stat-card.passed { border-left-color: var(--success); }
    .stat-card.passed .value { color: var(--success); }
    .stat-card.failed { border-left-color: var(--danger); }
    .stat-card.failed .value { color: var(--danger); }
    .stat-card.skipped { border-left-color: var(--warning); }
    .stat-card.skipped .value { color: var(--warning); }
    .stat-card.success { border-left-color: var(--success); }
    .stat-card.success .value { color: var(--success); }
    .module-section { background: var(--card); border-radius: 8px; margin-bottom: 14px; border-left: 4px solid var(--success); overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
    .module-section.mod-fail { border-left-color: var(--danger); }
    .module-head { width: 100%; padding: 14px 18px; background: #fff; border: none; cursor: pointer; display: flex; gap: 10px; align-items: center; text-align: left; position: relative; transition: background 0.2s; }
    .module-head:hover { background: #fafafa; }
    .module-head::before { content: '▼'; font-size: 12px; color: var(--muted); transition: transform 0.3s; margin-right: 6px; }
    .module-section.collapsed .module-head::before { transform: rotate(-90deg); }
    .module-name { flex: 1; font-size: 15px; font-weight: 700; color: var(--primary); text-transform: capitalize; }
    .module-chips { display: flex; gap: 6px; flex-shrink: 0; }
    .chip { font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 99px; }
    .chip-passed { background: #dcfce7; color: #15803d; }
    .chip-total { background: #ffedd5; color: #c2410c; }
    .module-body { padding: 0 20px 18px; max-height: none; overflow: visible; transition: max-height 0.3s ease, padding 0.3s ease; }
    .module-section.collapsed .module-body { max-height: 0; padding: 0 20px; overflow: hidden; }
    .file-group { margin-top: 14px; }
    .file-title { font-size: 13px; font-weight: 700; padding: 6px 0 8px; border-bottom: 1px solid var(--border); }
    .test-list { list-style: none; padding: 0; margin: 0; }
    .test-card { background: var(--card); padding: 14px 16px; border-radius: 6px; margin-bottom: 12px; border: 1px solid var(--border); border-left: 4px solid var(--success); box-shadow: 0 1px 3px rgba(0,0,0,.08); }
    .test-card[data-status="failed"] { border-left-color: var(--danger); }
    .test-card[data-status="skipped"] { border-left-color: var(--warning); }
    .test-head { display: flex; gap: 12px; align-items: center; margin-bottom: 8px; }
    .test-badge { display: inline-block; padding: 3px 10px; font-size: 11px; font-weight: 800; border-radius: 4px; flex-shrink: 0; line-height: 1.6; }
    .badge-pass { background: var(--success); color: #fff; }
    .badge-fail { background: var(--danger); color: #fff; }
    .badge-skip { background: var(--warning); color: #fff; }
    .test-body { padding-left: 4px; }
    .test-title { font-size: 14px; font-weight: 500; }
    .test-section { font-size: 13px; margin-bottom: 4px; }
    .test-label { font-weight: 700; margin-right: 6px; color: var(--muted); }
    .search-filter { display: flex; gap: 16px; align-items: center; margin-bottom: 24px; flex-wrap: wrap; }
    .search-box { flex: 1; min-width: 300px; display: flex; align-items: center; background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 10px 14px; }
    .search-box input { flex: 1; border: none; outline: none; font-size: 14px; font-family: inherit; }
    .search-box svg { width: 18px; height: 18px; color: var(--muted); }
    .filter-buttons { display: flex; gap: 8px; }
    .filter-btn { padding: 8px 16px; border: 1px solid var(--border); background: var(--card); border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600; transition: all 0.2s; color: var(--text); }
    .filter-btn.active { background: var(--primary); color: #fff; border-color: var(--primary); }
    .filter-btn:hover { background: #f5f5f5; }
    .filter-btn.active:hover { background: var(--primary); }
    .interruption-banner { background: #fef2f2; border: 2px solid var(--danger); border-radius: 8px; padding: 16px 20px; margin-bottom: 24px; display: flex; align-items: flex-start; gap: 12px; }
    .interruption-banner.hidden { display: none; }
    .interruption-icon { flex-shrink: 0; font-size: 20px; }
    .interruption-content { flex: 1; }
    .interruption-content h3 { color: var(--danger); font-size: 16px; font-weight: 700; margin-bottom: 4px; }
    .interruption-content p { color: var(--text); font-size: 14px; line-height: 1.5; }
    .interruption-content .modules-info { margin-top: 8px; font-size: 13px; color: var(--muted); }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div>
        <h1>Backend API Smoke Test Report</h1>
        <p class="subtitle">User-friendly summary of every API test — what it validates and why it passed / failed.</p>
        <div class="meta">
          <div><strong>PROJECT</strong><span>Educator-App-Backend</span></div>
          <div><strong>FRAMEWORK</strong><span>Jest + Supertest</span></div>
          <div><strong>DURATION</strong><span>${durationDisplay}</span></div>
          <div><strong>GENERATED</strong><span>${new Date().toLocaleString()}</span></div>
        </div>
      </div>
      ${logoDataUri ? `<div class="logo">
        <img src="${logoDataUri}" style="max-height:40px;max-width:40px;object-fit:contain;" />
        <div class="logo-text">
          <span class="brand-name">RealityWorks</span>
          <span class="brand-ai">AI</span>
        </div>
      </div>` : ''}
    </header>
    ${interruptionBanner}
    <section class="stats-grid">
      <div class="stat-card total"><span class="label">TOTAL TESTS</span><p class="value">${rows.length}</p></div>
      <div class="stat-card passed"><span class="label">PASSED</span><p class="value">${passed}</p></div>
      <div class="stat-card failed"><span class="label">FAILED</span><p class="value">${failed}</p></div>
      <div class="stat-card skipped"><span class="label">SKIPPED</span><p class="value">${skipped}</p></div>
      <div class="stat-card success"><span class="label">SUCCESS RATE</span><p class="value">${successRate}%</p></div>
    </section>
    <div class="search-filter">
      <div class="search-box">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.35-4.35"></path></svg>
        <input type="text" id="searchInput" placeholder="Search tests by name, module, or description..." />
      </div>
      <div class="filter-buttons">
        <button class="filter-btn active" data-filter="all">All</button>
        <button class="filter-btn" data-filter="passed">Passed</button>
        <button class="filter-btn" data-filter="failed">Failed</button>
        <button class="filter-btn" data-filter="skipped">Skipped</button>
      </div>
    </div>
    <div>${moduleRows}</div>
  </div>
  <script>
    const searchInput = document.getElementById('searchInput');
    const filterButtons = document.querySelectorAll('.filter-btn');
    let currentFilter = 'all';

    document.querySelectorAll('.module-head').forEach(button => {
      button.addEventListener('click', function() {
        this.closest('.module-section').classList.toggle('collapsed');
      });
    });

    function filterTests() {
      const searchTerm = searchInput.value.toLowerCase();
      const testCards = document.querySelectorAll('.test-card');

      testCards.forEach(card => {
        const cardText = card.textContent.toLowerCase();
        const status = card.getAttribute('data-status');
        const matchesSearch = cardText.includes(searchTerm);
        const matchesFilter = currentFilter === 'all' || status === currentFilter;
        card.style.display = (matchesSearch && matchesFilter) ? '' : 'none';
      });

      document.querySelectorAll('.file-group').forEach(fileGroup => {
        const visibleTests = fileGroup.querySelectorAll('.test-card:not([style*="display: none"])');
        fileGroup.style.display = visibleTests.length > 0 ? '' : 'none';
      });

      document.querySelectorAll('.module-section').forEach(moduleSection => {
        const visibleTests = moduleSection.querySelectorAll('.test-card:not([style*="display: none"])');
        moduleSection.style.display = visibleTests.length > 0 ? '' : 'none';
      });
    }

    searchInput.addEventListener('input', filterTests);

    filterButtons.forEach(button => {
      button.addEventListener('click', function() {
        filterButtons.forEach(btn => btn.classList.remove('active'));
        this.classList.add('active');
        currentFilter = this.getAttribute('data-filter');
        filterTests();
      });
    });
  </script>
</body>
</html>`;

  if (!fs.existsSync(SMOKE_REPORT_DIR)) fs.mkdirSync(SMOKE_REPORT_DIR, { recursive: true });
  fs.writeFileSync(SMOKE_REPORT_PATH, html, 'utf-8');
  console.log(`\n[Smoke] HTML Report: ${SMOKE_REPORT_PATH}`);
}

// ── main ───────────────────────────────────────────────────────────────────────
async function main() {
  if (!process.env.BASE_BACKEND_URL) {
    console.error('\n[Smoke] ERROR: BASE_BACKEND_URL is not set in .env');
    process.exit(1);
  }

  console.log('\n' + '='.repeat(70));
  console.log('POST-DEPLOYMENT SMOKE TEST SUITE');
  console.log('='.repeat(70));
  console.log(`Target: ${process.env.BASE_BACKEND_URL}\n`);

  initState();
  if (fs.existsSync(SMOKE_RESULTS_FILE)) fs.unlinkSync(SMOKE_RESULTS_FILE);

  const results = [];
  let aborted = false;

  process.on('SIGINT', () => {
    console.log('\n[Smoke] Interrupted — generating partial report...');
    markInterrupted();
    aborted = true;
    if (currentChild) currentChild.kill('SIGTERM');
    generateReport(true);
    process.exit(130);
  });

  for (const mod of SMOKE_MODULES) {
    if (aborted) break;
    const result = await executeModule(mod);
    results.push(result);
  }

  markComplete();
  generateReport(false);

  console.log(`\n[Smoke] To view the report run: npm run show-report:smoke`);
  console.log(`[Smoke] Report path: ${SMOKE_REPORT_PATH}`);

  const anyFailed = results.some(r => r.exitCode !== 0);
  process.exit(anyFailed ? 1 : 0);
}

main().catch(err => {
  console.error('[Smoke] Fatal:', err);
  process.exit(1);
});
