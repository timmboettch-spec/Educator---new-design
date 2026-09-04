/* eslint-disable */
const fs = require('fs');
const path = require('path');

// Use absolute paths from project root
const projectRoot = path.resolve(__dirname, '../../..');
const resultsPath = path.join(projectRoot, 'tests/api/reports/.test-results.json');
const metadataPath = path.join(projectRoot, 'tests/api/test-metadata.json');
const reportDir = path.join(projectRoot, 'tests/api/reports/html');
const reportPath = path.join(reportDir, 'api-test-report.html');
const executionStateFile = process.env.EXECUTION_STATE_FILE || 
                           path.join(__dirname, '.execution-state.json');

// Expected API modules in execution order
const EXPECTED_MODULES = [
  'loginUser',
  'school',
  'educator',
  'dashboard',
  'createUser',
  'class',
  'student',
  'simulation'
];

let testMetadata = {};
if (fs.existsSync(metadataPath)) {
  try {
    testMetadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
  } catch (e) {
    console.warn('Could not load test metadata, using fallback generation');
  }
}

function generateFallbackMetadata(testTitle, moduleName, fileName) {
  let method = 'REQUEST';
  const methodMatch = testTitle.match(/\b(GET|POST|PUT|DELETE|PATCH|HEAD)\b/i);
  if (methodMatch) {
    method = methodMatch[1].toUpperCase();
  }

  let endpoint = '/endpoint';
  const endpointMatch = testTitle.match(/['"]\/[a-zA-Z0-9\-/:_]+['"]/) || 
                       testTitle.match(/\/[a-zA-Z0-9\-/:_]+/);
  if (endpointMatch) {
    endpoint = endpointMatch[0].replace(/['"]/g, '');
  }

  let statusCode = 200;
  const statusMatch = testTitle.match(/\b(20[0-9]|30[0-9]|40[0-9]|50[0-9])\b/);
  if (statusMatch) {
    statusCode = parseInt(statusMatch[1]);
  }

  const negativeKeywords = ['fail', 'invalid', 'missing', 'unauthorized', 'error', 'empty', 'forbidden', 'not found'];
  let category = 'Positive Tests';
  if (negativeKeywords.some(kw => testTitle.toLowerCase().includes(kw))) {
    category = 'Negative Tests';
  }

  let description = testTitle.replace(/@\w+/g, '').replace(/^should\s+/, '').trim();
  description = description.charAt(0).toUpperCase() + description.slice(1);

  // For negative tests, infer the expected status code if not found in title
  if (category === 'Negative Tests' && statusCode === 200) {
    if (testTitle.match(/unauthorized|token|auth/i)) {
      statusCode = 401;
    } else if (testTitle.match(/forbidden|permission/i)) {
      statusCode = 403;
    } else if (testTitle.match(/not found|doesn't exist|non-existent|invalid.*id/i)) {
      statusCode = 404;
    } else if (testTitle.match(/duplicate|already exists|conflict/i)) {
      statusCode = 409;
    } else if (testTitle.match(/invalid|missing|validation|empty|malformed/i)) {
      statusCode = 400;
    }
  }

  let successReason = '';
  if (category === 'Positive Tests') {
    if (statusCode === 201) {
      successReason = `The API successfully processed the request and returned status code ${statusCode}.`;
    } else if (statusCode === 200) {
      successReason = `The API successfully returned status code ${statusCode} with the expected data.`;
    } else if (statusCode >= 300 && statusCode < 400) {
      successReason = `The API correctly returned redirect status code ${statusCode}.`;
    }
  } else {
    // Negative test - use status code specific message
    const statusCodeMessages = {
      400: { code: '400 Bad Request', reason: 'for invalid or missing data.' },
      401: { code: '401 Unauthorized', reason: 'for missing or invalid authentication.' },
      403: { code: '403 Forbidden', reason: 'for insufficient permissions.' },
      404: { code: '404 Not Found', reason: 'for non-existent resource.' },
      409: { code: '409 Conflict', reason: 'due to duplicate or conflicting data.' },
      422: { code: '422 Unprocessable Entity', reason: 'for validation failure.' },
    };
    const statusInfo = statusCodeMessages[statusCode];
    if (statusInfo) {
      successReason = `The API correctly returned ${statusInfo.code} ${statusInfo.reason}`;
    } else {
      successReason = `The API correctly returned status code ${statusCode} for the error condition.`;
    }
  }

  if (!successReason) {
    successReason = 'The API processed the request and returned the expected status code.';
  }

  const failureReason = `The API did not return the expected status code ${statusCode} or the response validation failed.`;

  return {
    moduleName: moduleName.replace(/Module$/, '').trim() + ' API',
    category,
    method,
    endpoint,
    statusCode,
    description,
    successReason,
    failureReason
  };
}

// ============================================
// GET METADATA FOR TEST
// ============================================
function getTestMetadata(test, moduleName, fileName) {
  if (testMetadata[test.title]) {
    return testMetadata[test.title];
  }
  return generateFallbackMetadata(test.title, moduleName, fileName);
}

// Check execution state for interruption
let executionState = null;
let isInterrupted = false;
let completedModules = [];
let notExecutedModules = [];

if (fs.existsSync(executionStateFile)) {
  try {
    executionState = JSON.parse(fs.readFileSync(executionStateFile, 'utf-8'));
    isInterrupted = executionState.isInterrupted || false;
    completedModules = executionState.completedModules || [];
    notExecutedModules = EXPECTED_MODULES.filter(mod => !completedModules.includes(mod));
  } catch (e) {
    console.warn('Could not load execution state');
  }
}

if (!fs.existsSync(resultsPath)) {
  process.exit(0);
}

try {
  const jestResults = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));
  const testResults = jestResults.testResults || [];

  const rows = [];
  const negativePatterns = [
    'invalid', 'missing', 'unauthorized', 'expired', 'duplicate',
    'not found', 'error', 'failed', 'empty', 'forbidden'
  ];

  for (const testFile of testResults) {
    const filePath = testFile.name;
    // Handle both forward slashes (Unix) and backslashes (Windows)
    const normalizedPath = filePath.replace(/\\/g, '/');
    const moduleName = normalizedPath.includes('/modules/')
      ? normalizedPath.split('/modules/')[1].split('/')[0]
      : 'General';

    for (const test of testFile.assertionResults || []) {
      const status = test.status === 'passed' ? 'Passed'
        : test.status === 'failed' ? 'Failed'
          : 'Skipped';

      const scenarioType = negativePatterns.some(p => test.title.toLowerCase().includes(p))
        ? 'NEGATIVE'
        : 'POSITIVE';

      // Get metadata for this test
      const metadata = getTestMetadata(test, moduleName, path.basename(filePath));

      // Extract failure message if test failed
      let failureMessage = '';
      let expectedValue = '';
      let receivedValue = '';
      
      if (test.status === 'failed' && test.failureMessages && test.failureMessages.length > 0) {
        failureMessage = test.failureMessages[0];
        
        // Extract expected and received values with better regex patterns
        const expectedMatch = failureMessage.match(/Expected:\s*(?:\[32m)?(?:"([^"]*)"|'([^']*)'|(\S+))/);
        const receivedMatch = failureMessage.match(/Received:\s*(?:\[31m)?(?:"([^"]*)"|'([^']*)'|(\S+))/);
        
        if (expectedMatch) {
          expectedValue = expectedMatch[1] || expectedMatch[2] || expectedMatch[3] || '';
        }
        if (receivedMatch) {
          receivedValue = receivedMatch[1] || receivedMatch[2] || receivedMatch[3] || '';
        }
      }

      rows.push({
        title: test.title,
        status,
        scenarioType,
        fileName: path.basename(filePath),
        moduleName: moduleName.charAt(0).toUpperCase() + moduleName.slice(1),
        durationMs: test.duration || 0,
        metadata,
        failureMessage: failureMessage
      });
    }
  }

  const passed = rows.filter(r => r.status === 'Passed').length;
  const failed = rows.filter(r => r.status === 'Failed').length;
  const skipped = rows.filter(r => r.status === 'Skipped').length;
  const totalDuration = rows.reduce((sum, r) => sum + (r.durationMs || 0), 0);

  const totalSeconds = Math.round(totalDuration / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const durationDisplay = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

  const moduleMap = new Map();
  rows.forEach(row => {
    if (!moduleMap.has(row.moduleName)) {
      moduleMap.set(row.moduleName, []);
    }
    moduleMap.get(row.moduleName).push(row);
  });

  const modules = Array.from(moduleMap.entries()).map(([name, tests]) => {
    const fileMap = new Map();
    tests.forEach(test => {
      if (!fileMap.has(test.fileName)) {
        fileMap.set(test.fileName, []);
      }
      fileMap.get(test.fileName).push(test);
    });

    return {
      name: name + ' Module',
      tests,
      files: Array.from(fileMap.entries()).map(([fileName, fileTests]) => ({
        name: fileName,
        count: fileTests.length,
        tests: fileTests
      })),
      passed: tests.filter(t => t.status === 'Passed').length,
      failed: tests.filter(t => t.status === 'Failed').length,
      skipped: tests.filter(t => t.status === 'Skipped').length,
    };
  });

  const escapeHtml = (text) => {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
  };

  // ============================================
  // PARSE JEST FAILURE MESSAGE
  // ============================================
  function removeAnsiCodes(str) {
    // Remove ANSI color codes like [32m, [39m, [31m, etc.
    return str.replace(/\x1b\[[0-9;]*m/g, '');
  }

  function parseFailureMessage(failureMessage, statusCode) {
    if (!failureMessage) {
      return `The API did not return the expected status code ${statusCode} or the response validation failed.`;
    }

    // Extract Expected and Received values from Jest error
    const expectedMatch = failureMessage.match(/Expected:\s*"([^"]+)"/);
    const receivedMatch = failureMessage.match(/Received:\s*"([^"]+)"/);

    if (expectedMatch && receivedMatch) {
      // Remove ANSI color codes
      let expected = removeAnsiCodes(expectedMatch[1]).trim();
      let received = removeAnsiCodes(receivedMatch[1]).trim();
      
      // Return HTML with color styling (not escaped here)
      return `<span style="color: #16a34a; font-weight: 500;">Expected: <strong>"${escapeHtml(expected)}"</strong></span> | <span style="color: #dc2626; font-weight: 500;">Received: <strong>"${escapeHtml(received)}"</strong></span>`;
    }

    // If it's an object/array comparison error
    const objectMatch = failureMessage.match(/Expected:\s*([\s\S]*?)\n\s*Received:\s*([\s\S]*?)(?:\n|$)/);
    if (objectMatch) {
      let expected = removeAnsiCodes(objectMatch[1]).trim().substring(0, 100);
      let received = removeAnsiCodes(objectMatch[2]).trim().substring(0, 100);
      return `<span style="color: #16a34a; font-weight: 500;">Expected: ${escapeHtml(expected)}</span> | <span style="color: #dc2626; font-weight: 500;">Received: ${escapeHtml(received)}</span>`;
    }

    // If simple text error
    if (failureMessage.includes('Expected:')) {
      const lines = failureMessage.split('\n');
      const expectedLine = lines.find(l => l.includes('Expected:'));
      const receivedLine = lines.find(l => l.includes('Received:'));
      if (expectedLine && receivedLine) {
        let expected = removeAnsiCodes(expectedLine).trim();
        let received = removeAnsiCodes(receivedLine).trim();
        return `<span style="color: #16a34a; font-weight: 500;">${escapeHtml(expected)}</span> | <span style="color: #dc2626; font-weight: 500;">${escapeHtml(received)}</span>`;
      }
    }

    // Default: show first meaningful error line
    const errorLines = failureMessage.split('\n').filter(l => l.trim() && !l.includes('at '));
    if (errorLines.length > 0) {
      return escapeHtml(errorLines.slice(0, 2).join(' | '));
    }

    return `The API did not return the expected status code ${statusCode} or the response validation failed.`;
  }

  const moduleRows = modules.map(mod => {
    const fileRows = mod.files.map(file => {
      const testRows = file.tests.map(test => {
        const badgeClass = test.status === 'Passed' ? 'badge-pass'
          : test.status === 'Failed' ? 'badge-fail'
            : 'badge-skip';
        const badgeText = test.status === 'Passed' ? 'PASS'
          : test.status === 'Failed' ? 'FAIL'
            : 'SKIP';

        const meta = test.metadata;
        const testLine = `${meta.method} ${meta.endpoint} ${meta.description}`;
        const testSection = `${meta.moduleName} — ${meta.category}`;
        const reasonLabel = test.status === 'Passed' ? 'WHY IT PASSED' : 'WHY IT FAILED';
        
        // Format reason text based on status
        let reasonText = '';
        if (test.status === 'Passed') {
          reasonText = meta.successReason;
        } else if (test.status === 'Failed') {
          if (test.failureMessage) {
            // Parse the actual Jest error message for Expected/Received values
            reasonText = parseFailureMessage(test.failureMessage, meta.statusCode);
          } else {
            reasonText = meta.failureReason;
          }
        } else {
          // Skipped
          reasonText = 'This test was skipped and did not execute.';
        }
        
        const searchableContent = `${testLine} ${testSection} ${test.title}`.toLowerCase();
        // Don't escape HTML for reasonText if it contains color styling
        const reasonTextHTML = reasonText.includes('<span style') ? reasonText : escapeHtml(reasonText);
        
        return `<div class="test-card" data-status="${test.status.toLowerCase()}" data-title="${escapeHtml(searchableContent)}">
          <div class="test-head">
            <span class="test-badge ${badgeClass}">${badgeText}</span>
            <span class="test-title">${escapeHtml(testLine)}</span>
          </div>
          <div class="test-body">
            <div class="test-section">
              <span class="test-label">TEST:</span>
              <span class="test-value">${escapeHtml(testSection)}</span>
            </div>
            <div class="test-section">
              <span class="test-label">${reasonLabel}:</span>
              <span class="test-value">${reasonTextHTML}</span>
            </div>
          </div>
        </div>`;
      }).join('');

      return `<div class="file-group">
        <div class="file-title">${escapeHtml(file.name)} (${file.count} tests)</div>
        <div class="test-list">${testRows}</div>
      </div>`;
    }).join('');

    const borderClass = mod.failed > 0 ? 'mod-fail' : 'mod-pass';
    return `<section class="module-section ${borderClass}" data-module="${escapeHtml(mod.name).toLowerCase()}">
      <button class="module-head" type="button">
        <span class="module-name">${escapeHtml(mod.name)}</span>
        <div class="module-chips">
          <span class="chip chip-passed">${mod.passed} passed</span>
          <span class="chip chip-total">${mod.tests.length} total</span>
        </div>
      </button>
      <div class="module-body">${fileRows}</div>
    </section>`;
  }).join('');

  const successRate = rows.length > 0 ? Math.round((passed / rows.length) * 100) : 0;

  // Generate logo data URI for embedded SVG (works offline and on download)
  let logoDataUri = './assets/logo-asset.svg'; // Fallback
  try {
    const logoPath = path.join(projectRoot, 'tests/api/reporters/logo.svg');
    if (fs.existsSync(logoPath)) {
      const svgContent = fs.readFileSync(logoPath, 'utf-8');
      logoDataUri = `data:image/svg+xml;base64,${Buffer.from(svgContent).toString('base64')}`;
    }
  } catch (error) {
    console.warn(`Warning: Could not read logo file for embedding: ${error.message}`);
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Backend API Test Report</title>
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
    .stat-card.suites { border-left-color: #2563eb; }
    .stat-card.suites .value { color: #2563eb; }
    .stat-card.total { border-left-color: #2563eb; }
    .stat-card.total .value { color: #2563eb; }
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
    .test-row { border-left: 3px solid var(--success); background: #fff; margin-top: 8px; padding: 12px 14px; border-radius: 0 6px 6px 0; border: 1px solid var(--border); border-left: 3px solid var(--success); }
    .test-row[data-status="failed"] { border-left-color: var(--danger); }
    .test-row[data-status="skipped"] { border-left-color: var(--warning); }
    .test-card { background: var(--card); padding: 14px 16px; border-radius: 6px; margin-bottom: 12px; border: 1px solid var(--border); border-left: 4px solid var(--success); box-shadow: 0 1px 3px rgba(0,0,0,.08); }
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
        <h1>Backend API Test Report</h1>
        <p class="subtitle">User-friendly summary of every API test — what it validates and why it passed / failed.</p>
        <div class="meta">
          <div><strong>PROJECT</strong><span>Educator-App-Backend</span></div>
          <div><strong>FRAMEWORK</strong><span>Jest + Supertest (NestJS)</span></div>
          <div><strong>DURATION</strong><span>${durationDisplay}</span></div>
          <div><strong>GENERATED</strong><span>${new Date().toLocaleString()}</span></div>
        </div>
      </div>
      <div class="logo">
        <img src="${logoDataUri}" style="max-height: 40px; max-width: 40px; object-fit: contain;" />
        <div class="logo-text">
          <span class="brand-name">RealityWorks</span>
          <span class="brand-ai">AI</span>
        </div>
      </div>
    </header>
    ${isInterrupted ? `
    <div class="interruption-banner">
      <div class="interruption-icon"></div>
      <div class="interruption-content">
        <h3>Execution Interrupted</h3>
        <p>Test execution was stopped before completion (Ctrl+C detected). The report below shows results from completed modules only.</p>
        <div class="modules-info">
          <div><strong>Completed Modules (${completedModules.length}):</strong> ${completedModules.length > 0 ? completedModules.join(', ') : 'None'}</div>
          ${notExecutedModules.length > 0 ? `<div style="margin-top: 6px;"><strong>⏭️  Not Executed (${notExecutedModules.length}):</strong> ${notExecutedModules.join(', ')}</div>` : ''}
        </div>
      </div>
    </div>
    ` : ''}
    <section class="stats-grid">
      <div class="stat-card suites"><span class="label">TEST SUITES</span><p class="value">${modules.length}</p></div>
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

    // Dropdown toggle functionality
    document.querySelectorAll('.module-head').forEach(button => {
      button.addEventListener('click', function() {
        const moduleSection = this.closest('.module-section');
        moduleSection.classList.toggle('collapsed');
      });
    });

    // Search and filter functionality
    function filterTests() {
      const searchTerm = searchInput.value.toLowerCase();
      const testCards = document.querySelectorAll('.test-card');
      let hasVisibleTests = false;

      testCards.forEach(card => {
        // Get all text content from the card for search
        const cardText = card.textContent.toLowerCase();
        const status = card.getAttribute('data-status');
        
        // Check if matches search term
        const matchesSearch = cardText.includes(searchTerm);
        
        // Check if matches filter
        const matchesFilter = currentFilter === 'all' || status === currentFilter;
        
        // Show or hide the card
        if (matchesSearch && matchesFilter) {
          card.style.display = '';
          hasVisibleTests = true;
        } else {
          card.style.display = 'none';
        }
      });

      // Hide file groups with no visible tests
      document.querySelectorAll('.file-group').forEach(fileGroup => {
        const visibleTests = fileGroup.querySelectorAll('.test-card:not([style*="display: none"])');
        fileGroup.style.display = visibleTests.length > 0 ? '' : 'none';
      });

      // Hide modules with no visible tests
      document.querySelectorAll('.module-section').forEach(moduleSection => {
        const visibleTests = moduleSection.querySelectorAll('.test-card:not([style*="display: none"])');
        moduleSection.style.display = visibleTests.length > 0 ? '' : 'none';
      });
    }

    // Event listeners
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

  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  // Ensure assets directory exists and copy logo
  const assetsDir = path.join(reportDir, 'assets');
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
  }

  // Copy RealityWorks logo from reporters to generated report assets
  const sourceLogo = 'https://dev.educator.realityworksai.com/assets/RealityworksAI_logo.svg';
  const destLogo = path.join(assetsDir, 'logo-asset.svg');
  
  if (fs.existsSync(sourceLogo)) {
    fs.copyFileSync(sourceLogo, destLogo);
  }

  fs.writeFileSync(reportPath, html, 'utf-8');
} catch (error) {
  console.error('Error generating report:', error.message);
}
