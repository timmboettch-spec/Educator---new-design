# Educator E2E HTML Reporter

A custom Playwright reporter that generates professional HTML test reports matching the RealityWorks brand format.

## Features

- 📊 **Professional HTML Reports** - Beautiful, responsive test report UI
- 🔍 **Search & Filter** - Real-time search across all tests by name, file, or module
- 📈 **Statistics Dashboard** - Overview with test counts and success rates
- ⏱️ **Duration Tracking** - Individual test durations and total execution time
- 🏷️ **Status Badges** - Clear visual indicators (PASS, FAIL, SKIP)
- 📁 **Hierarchical Organization** - Tests grouped by module and file
- 🐛 **Error Messages** - Detailed failure reasons displayed
- 💾 **Self-Contained** - Single HTML file with no external dependencies
- 🎨 **RealityWorks Branding** - Professional logo and color scheme

## Usage

Tests are automatically reported. Simply run:

```bash
npx playwright test
```

The report is generated to: `tests/e2e/results/reports/html/ui-smoke-test-report.html`

## Report Structure

### Header Section
- Project name and framework info
- Total execution duration
- Generation timestamp
- RealityWorks AI logo

### Statistics Dashboard
- Test Suites count
- Total Tests
- Passed tests (green)
- Failed tests (red)
- Skipped tests (orange)
- Success rate percentage

### Search & Filter
- Real-time search box
- Filter buttons: All, Passed, Failed, Skipped
- Live results update

### Test Results
- Organized by module
- Sub-organized by file
- Each test shows:
  - Status badge (PASS/FAIL/SKIP)
  - Test title
  - Duration
  - Why it passed/failed explanation

## Configuration

The reporter is configured in `playwright.config.ts`:

```typescript
reporter: [
  ['list'],
  ['./tests/e2e/reporters/friendly-html-reporter.cjs', {
    outputFolder: './tests/e2e/results/reports/html',
    pageTitle: 'UI Smoke Test Report',
    projectName: 'Educator App — Frontend E2E',
  }]
]
```

## Report Features in Detail

### Search Functionality
- Searches across test name, file name, and module
- Case-insensitive
- Real-time filtering
- Combines with status filters

### Filter Options
- **All** - Shows all tests
- **Passed** - Shows only passing tests
- **Failed** - Shows only failed tests
- **Skipped** - Shows only skipped tests

### Module Organization
Modules are automatically extracted from file paths:
- `tests/e2e/modules/auth/` → Auth Module
- `tests/e2e/modules/class/` → Class Module
- `tests/e2e/modules/dashboard/` → Dashboard Module

### Collapsible Sections
- Click module headers to collapse/expand
- Useful for navigating large test suites
- State persists within page session

## Files

- `friendly-html-reporter.cjs` - Playwright Reporter implementation (active)
- `index.ts` - Legacy Playwright Reporter implementation, no longer wired into any config
- `report-generator.ts` - Transforms Playwright data to report format (used by `index.ts`)
- `report-template.ts` - HTML template with CSS and JavaScript (used by `index.ts`)
- `report-types.ts` - TypeScript type definitions (used by `index.ts`)
- `logo-asset.ts` - RealityWorks logo (used by `index.ts`)
