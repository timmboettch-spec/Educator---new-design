import { type ModuleSummary, type ReportData, type TestSummaryRow } from './report-types';
import { REALITYWORKS_LOGO_SRC } from './logo-asset';

const escapeHtml = (value: string): string => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const formatDuration = (milliseconds: number): string => {
  if (milliseconds < 1000) return `${milliseconds} ms`;
  const totalSeconds = Math.round(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
};

const formatGeneratedAt = (generatedAt: string): string => {
  const date = new Date(generatedAt);
  if (Number.isNaN(date.getTime())) return generatedAt;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
};

const renderTestRow = (test: TestSummaryRow): string => {
  const escapedTitle = escapeHtml(test.title);
  const escapedWhy = escapeHtml(test.status === 'Passed' ? test.whyPassed : test.whyFailed);
  const whyLabel = test.status === 'Passed' ? 'WHY IT PASSED' : test.status === 'Failed' ? 'WHY IT FAILED' : 'NOTE';
  const badgeText = test.status === 'Passed' ? 'PASS' : test.status === 'Failed' ? 'FAIL' : 'SKIP';
  const badgeClass = test.status === 'Passed' ? 'badge-pass' : test.status === 'Failed' ? 'badge-fail' : 'badge-skip';
  const rowClass = test.status === 'Passed' ? 'row-pass' : test.status === 'Failed' ? 'row-fail' : 'row-skip';

  return `
      <li class="test-row ${rowClass}" data-status="${test.status.toLowerCase()}" data-title="${escapeHtml(test.title)}" data-file="${escapeHtml(test.fileName)}" data-module="${escapeHtml(test.moduleName)}">
        <div class="test-item">
          <div class="test-main">
            <span class="test-badge ${badgeClass}">${badgeText}</span>
            <span class="test-title">${escapedTitle}</span>
          </div>
          <span class="test-duration">${formatDuration(test.durationMs)}</span>
        </div>
        <div class="test-meta">
          <div class="test-meta-row"><span class="meta-label">TEST:</span><span class="meta-value">${escapedTitle}</span></div>
          <div class="test-meta-row"><span class="meta-label">${whyLabel}:</span><span class="meta-value">${escapedWhy}</span></div>
        </div>
      </li>`;
};

const formatModuleName = (name: string): string => name.replace(/\s+module$/i, '');

const renderModuleSection = (moduleSummary: ModuleSummary): string => {
  const displayName = formatModuleName(moduleSummary.name);
  const borderClass = moduleSummary.failed > 0 ? 'mod-fail' : 'mod-pass';
  const fileSections = moduleSummary.files
    .map((file) => {
      const rows = file.tests.map(renderTestRow).join('');
      return `
        <div class="file-group">
          <div class="file-title">
            <svg class="file-icon" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 2a1 1 0 011-1h6l3 3v10a1 1 0 01-1 1H4a1 1 0 01-1-1V2z" stroke="#64748b" stroke-width="1.2"/><path d="M9 1v3h3" stroke="#64748b" stroke-width="1.2"/></svg>
            <span>${escapeHtml(file.name)}</span>
            <span class="file-count">(${file.count} tests)</span>
          </div>
          <ul class="test-list">
            ${rows}
          </ul>
        </div>`;
    })
    .join('');

  return `
      <section class="module-section ${borderClass}" data-module="${escapeHtml(moduleSummary.name)}">
        <button class="module-head" type="button">
          <span class="caret">&#9660;</span>
          <span class="module-name">${escapeHtml(displayName)}</span>
          <div class="module-chips">
            <span class="chip chip-passed">${moduleSummary.passed} passed</span>
            <span class="chip chip-total">${moduleSummary.tests.length} total</span>
          </div>
        </button>
        <div class="module-body">
          ${fileSections}
        </div>
      </section>`;
};

export const renderHtmlReport = (reportData: ReportData): string => {
  const moduleSections = reportData.modules.map(renderModuleSection).join('');

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(reportData.title)}</title>
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
        --shadow: 0 1px 3px rgba(15,23,42,.08),0 1px 2px rgba(15,23,42,.04);
        --shadow-lg: 0 10px 25px -5px rgba(15,23,42,.1),0 8px 10px -6px rgba(15,23,42,.06);
      }
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:'Segoe UI',-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;background:var(--bg);color:var(--text);line-height:2;padding:24px}
      .container{max-width:1200px;margin:0 auto}
      header{background:linear-gradient(135deg,var(--primary) 0%,var(--primary-light) 100%);color:#fff;padding:36px 32px;border-radius:12px;box-shadow:var(--shadow-lg);margin-bottom:24px;display:flex;align-items:flex-start;justify-content:space-between;gap:24px;flex-wrap:wrap;position:relative}
      header h1{font-size:26px;font-weight:700;margin-bottom:6px}
      header .subtitle{font-size:14px;opacity:.9}
      header .meta{display:flex;flex-wrap:wrap;gap:24px;margin-top:18px;padding-top:18px;border-top:1px solid rgba(255,255,255,.2)}
      header .meta div{font-size:13px}
      header .meta strong{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.05em;opacity:.8;margin-bottom:2px}
      .logo-block{display:flex;flex-direction:row;align-items:center;justify-content:center;gap:12px;background:#fff;border:2px solid #fff;border-radius:8px;padding:1px 16px;flex-shrink:0}
      .logo-block img{height:40px;width:auto;display:block;object-fit:contain}
      .logo-block .logo-text{font-size:14px;font-weight:600;display:flex;gap:4px}
      .logo-block .logo-text .brand-name{color:#000}
      .logo-block .logo-text .brand-ai{color:var(--primary-light)}
      /* Stats */
      .stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:14px;margin-bottom:24px}
      .stat-card{background:var(--card);padding:18px;border-radius:10px;box-shadow:var(--shadow);border-left:4px solid var(--primary)}
      .stat-card .label{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);font-weight:600}
      .stat-card .value{font-size:28px;font-weight:700;color:var(--primary);margin-top:2px}
      .stat-card.accent-blue{border-left-color:#2563eb} .stat-card.accent-blue .value{color:#2563eb}
      .stat-card.accent-green{border-left-color:var(--success)} .stat-card.accent-green .value{color:var(--success)}
      .stat-card.accent-red{border-left-color:var(--danger)} .stat-card.accent-red .value{color:var(--danger)}
      .stat-card.accent-orange{border-left-color:var(--warning)} .stat-card.accent-orange .value{color:var(--warning)}
      /* Controls */
      .controls{display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-bottom:18px;background:var(--card);padding:12px 16px;border-radius:10px;box-shadow:var(--shadow)}
      .search-wrapper{flex:1;min-width:220px;display:flex;align-items:center;gap:8px;border:1px solid var(--border);border-radius:6px;padding:8px 12px;background:#fff}
      .search-wrapper:focus-within{border-color:var(--primary-light);box-shadow:0 0 0 3px rgba(249,115,22,.15)}
      .search-icon{color:var(--muted);flex-shrink:0;width:16px;height:16px}
      .search-wrapper input{border:none;outline:none;width:100%;font-size:14px;background:transparent;color:var(--text)}
      .filter-btns{display:flex;gap:6px;flex-wrap:wrap}
      .filter-btn{border:1px solid var(--border);border-radius:999px;padding:7px 16px;background:#fff;color:var(--text);font-weight:600;cursor:pointer;font-size:13px;transition:all .15s ease}
      .filter-btn:hover:not(.active){background:#f1f5f9}
      .filter-btn.active{background:var(--primary);color:#fff;border-color:var(--primary)}
      /* Module section */
      .module-section{background:var(--card);border-radius:8px;margin-bottom:14px;overflow:hidden;box-shadow:var(--shadow);border-left:4px solid var(--success)}
      .module-section.mod-fail{border-left-color:var(--danger)}
      .module-section.mod-pass{border-left-color:var(--success)}
      .module-head{width:100%;display:flex;align-items:center;gap:10px;padding:14px 18px;background:#fff;border:none;cursor:pointer;text-align:left}
      .module-head:hover{background:#fafafa}
      .caret{font-size:12px;color:var(--muted);transition:transform .18s ease;flex-shrink:0}
      .module-section.collapsed .caret{transform:rotate(-90deg)}
      .module-section.collapsed .module-body{display:none}
      .module-name{flex:1;font-size:15px;font-weight:700;color:var(--primary);text-transform:capitalize}
      .module-chips{display:flex;gap:6px;flex-shrink:0}
      .chip{font-size:11px;font-weight:700;padding:3px 10px;border-radius:99px}
      .chip-passed{background:#dcfce7;color:#15803d}
      .chip-total{background:#ffedd5;color:#c2410c}
      /* Module body / file group */
      .module-body{padding:0 20px 18px}
      .file-group{margin-top:14px}
      .file-title{display:flex;align-items:center;gap:6px;padding:6px 0 8px;border-bottom:1px solid var(--border);font-size:13px;font-weight:700;color:var(--text)}
      .file-icon{width:14px;height:14px;flex-shrink:0}
      .file-count{color:var(--muted);font-weight:500;font-size:12px}
      .test-list{list-style:none;padding:0;margin:0}
      /* Test row */
      .test-row{border-left:3px solid var(--success);background:#fff;margin-top:8px;padding:12px 14px;border-radius:0 6px 6px 0;border-top:1px solid var(--border);border-right:1px solid var(--border);border-bottom:1px solid var(--border)}
      .test-row.row-fail{border-left-color:var(--danger)}
      .test-row.row-skip{border-left-color:var(--warning)}
      .test-item{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:8px}
      .test-main{display:flex;align-items:flex-start;gap:10px;flex:1;min-width:0}
      .test-badge{display:inline-block;padding:3px 10px;font-size:11px;font-weight:800;border-radius:4px;letter-spacing:.06em;flex-shrink:0;line-height:1.6}
      .badge-pass{background:#16a34a;color:#fff}
      .badge-fail{background:#dc2626;color:#fff}
      .badge-skip{background:#d97706;color:#fff}
      .test-title{font-size:14px;font-weight:500;color:var(--text);line-height:1.5;padding-top:2px}
      .test-duration{font-size:12px;color:var(--muted);white-space:nowrap;flex-shrink:0;padding-top:4px}
      /* Test meta */
      .test-meta{display:flex;flex-direction:column;gap:4px;padding-left:4px}
      .test-meta-row{display:flex;align-items:baseline;gap:6px;font-size:13px;line-height:1.5}
      .meta-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--primary);white-space:nowrap;flex-shrink:0}
      .meta-value{color:#334155;line-height:1.6}
      .hidden{display:none!important}
      footer{text-align:center;padding:20px;color:var(--muted);font-size:12px;margin-top:24px}
      footer strong{color:var(--primary)}
      @media(max-width:980px){header{flex-direction:column;align-items:stretch}.stats-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.controls{display:grid}}
      @media(max-width:720px){.stats-grid{grid-template-columns:1fr}.container{padding:0 12px}}
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
            <div><strong>DURATION</strong><span>${escapeHtml(reportData.durationDisplay || 'N/A')}</span></div>
            <div><strong>GENERATED</strong><span>${escapeHtml(formatGeneratedAt(reportData.generatedAt))}</span></div>
          </div>
        </div>
        <div class="logo-block">
          <img src="${REALITYWORKS_LOGO_SRC}" />
          <div class="logo-text">
            <span class="brand-name">RealityWorks</span>
            <span class="brand-ai">AI</span>
          </div>
        </div>
      </header>
      <section class="stats-grid">
        <div class="stat-card accent-blue"><span class="label">TEST SUITES</span><p class="value">${reportData.modules.length}</p></div>
        <div class="stat-card accent-blue"><span class="label">TOTAL TESTS</span><p class="value">${reportData.totalTests}</p></div>
        <div class="stat-card accent-green"><span class="label">PASSED</span><p class="value">${reportData.passed}</p></div>
        <div class="stat-card accent-red"><span class="label">FAILED</span><p class="value">${reportData.failed}</p></div>
        <div class="stat-card accent-orange"><span class="label">SKIPPED</span><p class="value">${reportData.skipped}</p></div>
        <div class="stat-card accent-green"><span class="label">SUCCESS RATE</span><p class="value">${reportData.totalTests > 0 ? Math.round((reportData.passed / reportData.totalTests) * 100) : 0}%</p></div>
      </section>
      <div class="controls">
        <div class="search-wrapper">
          <svg class="search-icon" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="6.5" cy="6.5" r="4.5" stroke="#64748b" stroke-width="1.4"/><path d="M10 10l3 3" stroke="#64748b" stroke-width="1.4" stroke-linecap="round"/></svg>
          <input id="searchInput" type="search" placeholder="Search tests by name, module, or description…" />
        </div>
        <div class="filter-btns">
          <button class="filter-btn active" data-filter="all" type="button">All</button>
          <button class="filter-btn" data-filter="passed" type="button">Passed</button>
          <button class="filter-btn" data-filter="failed" type="button">Failed</button>
          <button class="filter-btn" data-filter="skipped" type="button">Skipped</button>
        </div>
      </div>
      <main id="modules">${moduleSections}</main>
      <footer>Generated by <strong>Educator API Reporter</strong></footer>
    </div>
    <script>
      const searchInput = document.getElementById('searchInput');
      const filterBtns = Array.from(document.querySelectorAll('.filter-btn'));
      const testRows = Array.from(document.querySelectorAll('.test-row'));
      const moduleSections = Array.from(document.querySelectorAll('.module-section'));

      const normalize = (value) => value.toString().trim().toLowerCase();

      const updateModuleVisibility = () => {
        moduleSections.forEach((section) => {
          const visibleRows = section.querySelectorAll('.test-row:not(.hidden)');
          section.classList.toggle('hidden', visibleRows.length === 0);
        });
      };

      const applyFilter = (filter) => {
        const query = normalize(searchInput.value || '');
        testRows.forEach((row) => {
          const title = normalize(row.dataset.title || '');
          const file = normalize(row.dataset.file || '');
          const module = normalize(row.dataset.module || '');
          const metaValues = Array.from(row.querySelectorAll('.meta-value')).map((el) => normalize(el.textContent || ''));
          const matchesSearch = !query || [title, file, module, ...metaValues].some((text) => text.includes(query));
          const status = row.dataset.status?.toLowerCase();
          let matchesFilter = true;
          if (filter === 'passed') matchesFilter = status === 'passed';
          if (filter === 'failed') matchesFilter = status === 'failed';
          if (filter === 'skipped') matchesFilter = status === 'skipped';
          row.classList.toggle('hidden', !(matchesSearch && matchesFilter));
        });
        updateModuleVisibility();
      };

      filterBtns.forEach((button) => {
        button.addEventListener('click', () => {
          filterBtns.forEach((btn) => btn.classList.remove('active'));
          button.classList.add('active');
          applyFilter(button.dataset.filter || 'all');
        });
      });

      searchInput.addEventListener('input', () => {
        const activeFilter = document.querySelector('.filter-btn.active');
        applyFilter(activeFilter?.dataset.filter || 'all');
      });

      document.querySelectorAll('.module-head').forEach((button) => {
        button.addEventListener('click', () => {
          button.closest('.module-section').classList.toggle('collapsed');
        });
      });
    </script>
  </body>
</html>`;
};