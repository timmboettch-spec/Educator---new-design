/**
 * Regression: Simulations Completed chart (RE-31) — UI E2E
 *
 * Covers the ticket's E2E flow: a completion trend generated for a class and a timeframe,
 * then exported as an image, a document and a spreadsheet, each matching the selection on
 * screen. Also checks the empty state and the by-school breakdown.
 *
 * Only the chart's endpoints are mocked (page.route); auth and everything else hit the
 * real environment.
 */

import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import { EDUCATOR_AUTH_FILE } from '../../common/setup/auth.setup';
import {
  mockClassOptions,
  mockSchoolGroups,
  mockSimulationsCompletedGraph,
  mockStudentOptions,
  openAsEducator,
} from '../../common/utils/classesApiMocks';

// ── Fixtures ───────────────────────────────────────────────────────────────

const now = new Date();
const THIS_MONTH = { year: now.getFullYear(), month: now.getMonth() + 1 };

const SCHOOL_GROUPS = [
  { schoolId: 'e2e-school-1', schoolName: 'E2E Cedar Hollow', classCount: 2 },
];

const CLASS_OPTIONS = [
  { classId: 'e2e-trend-1', className: 'E2E Trend Biology' },
  { classId: 'e2e-trend-2', className: 'E2E Trend Chemistry' },
];

const STUDENT_OPTIONS = [
  { id: 'e2e-stu-1', studentId: 'STU-E2E1', name: 'E2E Student One' },
];

// Biology has 12 completions this month (all at Cedar Hollow). Unfiltered requests have no
// months but 30 at Cedar Hollow, which is what the unfiltered Breakdown view charts.
// Breakdown drill-down: Cedar Hollow → its classes → Biology's students.
const graphFor = (params: URLSearchParams) =>
  params.get('forClass') === 'e2e-trend-1'
    ? {
        byMonth: [{ ...THIS_MONTH, count: 12 }],
        byStudent: [
          { studentId: 'e2e-stu-1', studentCode: 'STU-E2E1', count: 12 },
        ],
      }
    : params.get('forSchool') === 'e2e-school-1'
      ? {
          byMonth: [{ ...THIS_MONTH, count: 30 }],
          byClass: [
            {
              classId: 'e2e-trend-1',
              className: 'E2E Trend Biology',
              count: 12,
            },
            {
              classId: 'e2e-trend-2',
              className: 'E2E Trend Chemistry',
              count: 18,
            },
          ],
        }
      : params.getAll('classIds').includes('e2e-trend-1')
        ? {
            byMonth: [{ ...THIS_MONTH, count: 12 }],
            bySchool: [{ schoolId: 'e2e-school-1', count: 12 }],
          }
        : { byMonth: [], bySchool: [{ schoolId: 'e2e-school-1', count: 30 }] };

// ── Helpers ────────────────────────────────────────────────────────────────

async function openDashboard(page: Page) {
  const requests = await mockSimulationsCompletedGraph(page, graphFor);
  await mockSchoolGroups(page, SCHOOL_GROUPS);
  await mockClassOptions(page, CLASS_OPTIONS);
  await mockStudentOptions(page, STUDENT_OPTIONS);
  await openAsEducator(page, '/educator-dashboard');
  await expect(
    page.getByRole('button', {
      name: 'Graphical Overview of Simulations Completed',
    })
  ).toHaveAttribute('aria-expanded', 'true', { timeout: 30_000 });
  return requests;
}

// Scoped to the chart: page-wide, /^Classes/ also matches the dashboard's
// "Classes Closing (14 Days)" tile. The options listbox is portalled, so stays page-level.
async function chooseClass(page: Page, className: string) {
  await overview(page)
    .getByRole('button', { name: /^Classes/ })
    .click();
  await page.getByRole('option', { name: new RegExp(className) }).click();
  await page.keyboard.press('Escape');
}

async function chooseTimeframe(page: Page, from: string, to: string) {
  await overview(page)
    .getByRole('button', { name: new RegExp(from) })
    .click();
  await page.getByRole('option', { name: to }).click();
}

const overview = (page: Page) =>
  page.locator('section', {
    has: page.getByRole('heading', {
      name: 'Simulations Completed',
      exact: true,
    }),
  });

// ─────────────────────────────────────────────────────────────────────────────

test.describe('Simulations Completed chart — UI', () => {
  test.use({
    storageState: fs.existsSync(EDUCATOR_AUTH_FILE)
      ? EDUCATOR_AUTH_FILE
      : undefined,
  });

  test('shows the empty state when nothing was completed', async ({ page }) => {
    test.setTimeout(90_000);
    await openDashboard(page);

    await expect(
      overview(page).getByText('No simulations completed in this period yet.')
    ).toBeVisible();
    await expect(
      overview(page).getByText('All Classes · 0 total')
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Export chart as CSV' })
    ).toBeDisabled();
  });

  test('class + timeframe drive the chart, and every export matches the selection', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const requests = await openDashboard(page);

    await chooseClass(page, 'E2E Trend Biology');
    await chooseTimeframe(page, 'Last 12 Months', 'Last 6 Months');

    await expect(overview(page).getByText('1 class · 12 total')).toBeVisible();
    await expect
      .poll(() => {
        const last = requests.at(-1);
        return last
          ? { classIds: last.getAll('classIds'), months: last.get('months') }
          : null;
      })
      .toEqual({ classIds: ['e2e-trend-1'], months: '6' });

    const expectedSlug =
      /by-month_all-schools-classes-e2e-trend-biology-all-student-codes_last-6-months/;

    for (const format of ['PNG', 'PDF'] as const) {
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('button', { name: `Export chart as ${format}` }).click(),
      ]);
      expect(download.suggestedFilename()).toMatch(expectedSlug);
      expect(download.suggestedFilename()).toMatch(
        new RegExp(`\\.${format.toLowerCase()}$`)
      );
    }

    const [csvDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export chart as CSV' }).click(),
    ]);
    expect(csvDownload.suggestedFilename()).toMatch(expectedSlug);
    const csv = fs.readFileSync(await csvDownload.path(), 'utf-8');
    expect(csv).toContain(
      'Selection,All schools · Classes: E2E Trend Biology · All student codes'
    );
    expect(csv).toContain('Timeframe,Last 6 Months');
    expect(csv).toContain('Month,Simulations Completed');
    expect(csv).toContain('Total,12');
    // Metadata (4) + blank + header + 6 months + total.
    expect(csv.trim().split(/\r?\n/).length).toBe(4 + 1 + 1 + 6 + 1);
  });

  test('breakdown hides the filters, charts every school and exports a school table', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openDashboard(page);
    await chooseClass(page, 'E2E Trend Biology');
    await page.getByRole('button', { name: 'Breakdown' }).click();

    await expect(
      page.getByRole('button', { name: 'Breakdown' })
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(
      overview(page).getByText('All Schools', { exact: true })
    ).toBeVisible();
    await expect(overview(page).getByText('· by school')).toBeVisible();
    await expect(
      overview(page).getByRole('button', { name: /^Classes/ })
    ).toHaveCount(0);

    const [csvDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export chart as CSV' }).click(),
    ]);
    expect(csvDownload.suggestedFilename()).toMatch(/by-school/);
    const csv = fs.readFileSync(await csvDownload.path(), 'utf-8');
    expect(csv).toContain('View,Simulations Completed by School');
    expect(csv).toContain('School,Simulations Completed');
    expect(csv).toContain('Selection,All schools');
    expect(csv).toContain('E2E Cedar Hollow,30');
  });

  test("breakdown drills from a school to its classes to a class's students", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const requests = await openDashboard(page);
    await page.getByRole('button', { name: 'Breakdown' }).click();
    const crumbs = overview(page).getByRole('navigation', {
      name: 'Breakdown level',
    });
    await expect(crumbs.getByText('· by school')).toBeVisible();

    // The chart's text summary has a button per drillable bar (keyboard path).
    const school = overview(page).getByRole('button', {
      name: 'E2E Cedar Hollow: 30 — show details',
    });
    await school.focus();
    await page.keyboard.press('Enter');
    await expect(crumbs.getByText('· by class')).toBeVisible();
    await expect(crumbs.getByText('E2E Cedar Hollow')).toBeVisible();
    // The breadcrumb updates before the request reaches the route handler.
    await expect
      .poll(() => requests.at(-1)?.get('forSchool'))
      .toBe('e2e-school-1');

    const biology = overview(page).getByRole('button', {
      name: 'E2E Trend Biology: 12 — show details',
    });
    await biology.focus();
    await page.keyboard.press('Enter');
    await expect(crumbs.getByText('· by student')).toBeVisible();
    await expect
      .poll(() => requests.at(-1)?.get('forClass'))
      .toBe('e2e-trend-1');
    expect(requests.at(-1)?.get('forSchool')).toBeNull();

    await crumbs.getByRole('button', { name: 'All Schools' }).click();
    await expect(crumbs.getByText('· by school')).toBeVisible();
  });

  test('the section collapses and reopens with the selection kept', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await openDashboard(page);
    await chooseClass(page, 'E2E Trend Biology');
    await expect(overview(page).getByText('1 class · 12 total')).toBeVisible();

    const toggle = page.getByRole('button', {
      name: 'Graphical Overview of Simulations Completed',
    });
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(
      page.getByRole('heading', { name: 'Simulations Completed', exact: true })
    ).toHaveCount(0);

    await toggle.click();
    await expect(overview(page).getByText('1 class · 12 total')).toBeVisible();
  });
});
