/**
 * RE-38 — Reviewing many reports at once (class Reports modal).
 *
 * Only the class-page endpoints are mocked (page.route): the school-grouped class table,
 * the legacy class list, the educator's reports and PATCH bulk-review. The mocked "BE"
 * keeps each report's isNew in step with the bulk-review requests, so a reload proves the
 * state persists.
 */
import fs from 'fs';
import { test, expect, type Page } from '@playwright/test';
import { EDUCATOR_AUTH_FILE } from '../../common/setup/auth.setup';
import {
  makeLegacyClass,
  mockAttentionSummary,
  mockBulkReview,
  mockClassesTable,
  mockEducatorReports,
  mockLegacyClassList,
  openAsEducator,
  openMockSchool,
} from '../../common/utils/classesApiMocks';

// ── Fixtures ───────────────────────────────────────────────────────────────

const CLASS_ID = 'e2e-review-cls';
const CLASS_NAME = 'E2E Review Biology';

const CLASSES = [
  {
    ...makeLegacyClass(CLASS_ID, CLASS_NAME),
    students: [
      {
        student_id: 'STU-R1',
        user_id: 'e2e-u1',
        student_name: 'Ava',
        email: null,
        score: null,
      },
      {
        student_id: 'STU-R2',
        user_id: 'e2e-u2',
        student_name: 'Ben',
        email: null,
        score: null,
      },
    ],
  },
];

const SIMS = ['Cardiac Care', 'Wound Care', 'Triage'];

const makeReports = () =>
  SIMS.map((title, i) => ({
    id: `e2e-rep-${i + 1}`,
    userId: i === 1 ? 'e2e-u2' : 'e2e-u1',
    scenarioId: `e2e-sc-${i + 1}`,
    scenarioTitle: title,
    scenarioStartTime: '2026-07-09T10:00:00',
    scenarioEndTime: '2026-07-09T10:05:00',
    totalTimeSeconds: 60,
    score: 80,
    performanceLabel: 'Meets Expectation',
    mode: 'assessment',
    isNew: true,
  }));

// ── Helpers ────────────────────────────────────────────────────────────────

async function mockApis(page: Page) {
  const reports = makeReports();
  await mockAttentionSummary(page, {
    totalClasses: 1,
    classesNeedingAttention: 1,
    unreadReports: 1,
    noStudents: 0,
    noAssignedSims: 0,
  });
  await mockLegacyClassList(page, CLASSES);
  await mockClassesTable(page, CLASSES, {
    reportsCount: { [CLASS_ID]: SIMS.length },
  });
  await mockEducatorReports(page, () => reports);
  const requests = await mockBulkReview(page, ({ ids, reviewed }) => {
    for (const r of reports) if (ids.includes(r.id)) r.isNew = !reviewed;
    return ids;
  });
  return requests;
}

/**
 * Picks an item from the class row's actions menu. The menu closes on any
 * scroll, including the one from scrolling its button into view and page
 * shifts while the list settles, so it's reopened until the item is clicked.
 */
async function chooseClassAction(page: Page, item: string) {
  const menuButton = page
    .getByRole('button', { name: 'Class actions' })
    .first();
  await expect(async () => {
    if ((await menuButton.getAttribute('aria-expanded')) !== 'true') {
      await menuButton.click();
    }
    await page.getByRole('button', { name: item }).click({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
}

async function openReportsModal(page: Page) {
  await openAsEducator(page, '/classes');
  await openMockSchool(page);
  await expect(page.getByText(CLASS_NAME)).toBeVisible({ timeout: 30_000 });
  await chooseClassAction(page, 'View Reports / Transcripts');
  await expect(
    page.getByRole('checkbox', { name: 'Select all reports' })
  ).toBeVisible();
}

const row = (page: Page, sim: string) =>
  page
    .getByRole('row')
    .filter({ has: page.getByRole('button', { name: sim }) });

const expectNew = async (page: Page, sim: string, isNew: boolean) =>
  expect(row(page, sim).getByText('New', { exact: true })).toHaveCount(
    isNew ? 1 : 0
  );

// Clean slate: the app also remembers viewed reports locally.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.removeItem('rwai_viewed_report_ids')
  );
});

// ─────────────────────────────────────────────────────────────────────────────

test.describe('Bulk report review — UI', () => {
  test.use({
    storageState: fs.existsSync(EDUCATOR_AUTH_FILE)
      ? EDUCATOR_AUTH_FILE
      : undefined,
  });

  test('select-all shows a partial state and counts the selection', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await mockApis(page);
    await openReportsModal(page);

    const selectAll = page.getByRole('checkbox', {
      name: 'Select all reports',
    });
    await page
      .getByRole('checkbox', { name: /Select report Ava.*Cardiac Care/ })
      .check();
    await expect(page.getByText('1 selected')).toBeVisible();
    expect(
      await selectAll.evaluate((el) => (el as HTMLInputElement).indeterminate)
    ).toBe(true);

    await selectAll.check();
    await expect(page.getByText('3 selected')).toBeVisible();
  });

  test('marks several reports reviewed in one action, persists, then reverses', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const requests = await mockApis(page);
    await openReportsModal(page);
    for (const sim of SIMS) await expectNew(page, sim, true);

    await page
      .getByRole('checkbox', { name: /Select report Ava.*Cardiac Care/ })
      .check();
    await page
      .getByRole('checkbox', { name: /Select report Ben.*Wound Care/ })
      .check();
    await page
      .getByRole('button', { name: 'Mark reviewed', exact: true })
      .click();

    await expectNew(page, 'Cardiac Care', false);
    await expectNew(page, 'Wound Care', false);
    await expectNew(page, 'Triage', true);
    expect(requests).toEqual([
      { type: 'report', ids: ['e2e-rep-1', 'e2e-rep-2'], reviewed: true },
    ]);

    // Persisted: a fresh load (reports re-fetched from the mocked BE) keeps the state.
    await page.reload();
    await openReportsModal(page);
    await expectNew(page, 'Cardiac Care', false);
    await expectNew(page, 'Wound Care', false);
    await expectNew(page, 'Triage', true);

    await page
      .getByRole('button', { name: 'Mark all unreviewed', exact: true })
      .click();
    for (const sim of SIMS) await expectNew(page, sim, true);
    expect(requests.at(-1)).toEqual({
      type: 'report',
      ids: ['e2e-rep-1', 'e2e-rep-2', 'e2e-rep-3'],
      reviewed: false,
    });
  });

  test('the class menu marks all of the class reports reviewed', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const requests = await mockApis(page);
    await openAsEducator(page, '/classes');
    await openMockSchool(page);
    await expect(page.getByText(CLASS_NAME)).toBeVisible({ timeout: 30_000 });

    await chooseClassAction(page, 'Mark All Reports Reviewed');

    await expect.poll(() => requests.length).toBe(1);
    expect(requests[0]).toEqual({
      type: 'class',
      ids: [CLASS_ID],
      reviewed: true,
    });
  });
});
