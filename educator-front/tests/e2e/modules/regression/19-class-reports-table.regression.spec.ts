/**
 * Class Reports table (RE-38 listing): loads GET /api/simulation-reports/list with
 * server-side review filter and sort, loads the next page as the table scrolls, keeps
 * the filter and sort in the URL (reload and shared links restore it), and keeps a
 * selection across loaded pages.
 *
 * The school-grouped class table, the legacy class list, the legacy reports badge feed
 * and the list / bulk-review endpoints are mocked (page.route); the mocked list honours
 * reviewStatus / page like the BE.
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
  mockReportsList,
  openAsEducator,
  openMockSchool,
  type ReportsListQuery,
} from '../../common/utils/classesApiMocks';

// ── Fixtures ───────────────────────────────────────────────────────────────

const CLASS_ID = 'e2e-rt-cls';
const CLASS_NAME = 'E2E Reports Table';

const CLASSES = [
  {
    ...makeLegacyClass(CLASS_ID, CLASS_NAME),
    students: [
      {
        student_id: 'RT-1',
        user_id: 'rt-u1',
        student_name: 'Ava',
        email: null,
        score: null,
      },
    ],
  },
];

// 12 reports: the first 3 are reviewed, the rest unread.
const REPORTS = Array.from({ length: 12 }, (_, i) => ({
  reportId: `rt-${i + 1}`,
  studentCode: 'RT-1',
  mode: 'Assessment',
  simulationName: `RT Sim ${String(i + 1).padStart(2, '0')}`,
  score: 60 + i,
  performanceQuality: 'Meets Expectation',
  timeSpent: '00:10:00',
  completedAt: `2026-01-${String(i + 1).padStart(2, '0')}T09:00:00.000Z`,
  transcriptId: `rt-t-${i + 1}`,
  viewedAt: i < 3 ? '2026-02-01T09:00:00.000Z' : null,
  viewedBy: i < 3 ? 'educator' : null,
}));

const listFor = (q: ReportsListQuery) => {
  const matching = REPORTS.filter((r) =>
    q.reviewStatus === 'read'
      ? r.viewedAt !== null
      : q.reviewStatus === 'unread'
        ? r.viewedAt === null
        : true
  );
  const start = (q.page - 1) * q.pageSize;
  return {
    rows: matching.slice(start, start + q.pageSize),
    total: matching.length,
  };
};

// ── Helpers ────────────────────────────────────────────────────────────────

async function mockApis(page: Page) {
  await mockAttentionSummary(page, {
    totalClasses: 1,
    classesNeedingAttention: 0,
    unreadReports: 0,
    noStudents: 0,
    noAssignedSims: 0,
  });
  await mockLegacyClassList(page, CLASSES);
  await mockClassesTable(page, CLASSES, {
    reportsCount: { [CLASS_ID]: REPORTS.length },
  });
  await mockEducatorReports(page, () => []);
  const queries = await mockReportsList(page, listFor);
  const reviews = await mockBulkReview(page, ({ ids }) => ids);
  return { queries, reviews };
}

const reportsButton = (page: Page) =>
  page.getByRole('button', { name: new RegExp(`^Reports for ${CLASS_NAME}`) });

// Scoped: the class page has its own "All" status tab.
const reviewFilter = (page: Page, name: string) =>
  page
    .getByRole('group', { name: 'Review status' })
    .getByRole('button', { name, exact: true });

// Scrolling the last loaded row into view brings the table's load-more sentinel near.
const scrollToLoadMore = (page: Page, lastRowText: string) =>
  page.getByText(lastRowText).scrollIntoViewIfNeeded();

const urlParam = (page: Page, key: string) =>
  new URL(page.url()).searchParams.get(key);

test.describe('Class Reports table — UI', () => {
  test.use({
    storageState: fs.existsSync(EDUCATOR_AUTH_FILE)
      ? EDUCATOR_AUTH_FILE
      : undefined,
  });

  test('loads the first page from the listing API, newest first', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const { queries } = await mockApis(page);
    await openAsEducator(page, '/classes');
    await openMockSchool(page);
    await expect(page.getByText(CLASS_NAME)).toBeVisible({ timeout: 30_000 });

    await reportsButton(page).click();

    await expect(page.getByText('RT Sim 01')).toBeVisible();
    expect(queries.at(-1)).toEqual({
      classIds: [CLASS_ID],
      reviewStatus: null,
      sortBy: 'completedAt',
      sortDirection: 'DESC',
      page: 1,
      pageSize: 10,
    });
    expect(urlParam(page, 'reportsClass')).toBe(CLASS_ID);
  });

  test('filters and sorts on the server, keeps it in the URL, and loads more on scroll', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const { queries } = await mockApis(page);
    await openAsEducator(page, '/classes');
    await openMockSchool(page);
    await expect(page.getByText(CLASS_NAME)).toBeVisible({ timeout: 30_000 });
    await reportsButton(page).click();
    await expect(page.getByText('RT Sim 01')).toBeVisible();

    await reviewFilter(page, 'Unread').click();
    // Rows turn into skeletons as soon as the fetch starts, so wait for the request
    // itself before checking the filtered result.
    await expect
      .poll(() => queries.at(-1)?.reviewStatus, {
        message: 'the Unread filter sends reviewStatus=unread to the list API',
        timeout: 15_000,
      })
      .toBe('unread');
    await expect(page.getByText('RT Sim 01')).toHaveCount(0);

    await page.getByText('Score', { exact: true }).click();
    await expect.poll(() => queries.at(-1)?.sortBy).toBe('score');
    expect(queries.at(-1)?.sortDirection).toBe('ASC');

    // 9 unread reports fit on one page; switch to All for a second page.
    await reviewFilter(page, 'All').click();
    await expect(page.getByText('RT Sim 01')).toBeVisible();
    await scrollToLoadMore(page, 'RT Sim 10');
    await expect.poll(() => queries.at(-1)?.page).toBe(2);
    expect(queries.at(-1)).toMatchObject({
      sortBy: 'score',
      reviewStatus: null,
    });
    // The second page is appended below the first, with no pagination.
    await expect(page.getByText('RT Sim 11')).toBeVisible();
    await expect(page.getByText('RT Sim 01')).toBeVisible();
    await expect(page.getByText('All reports are shown.')).toBeVisible();
    expect(urlParam(page, 'reportPage')).toBeNull();
    expect(urlParam(page, 'reportSort')).toBe('score');
  });

  test('a shared URL (or reload) re-opens the table in the same state', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const { queries } = await mockApis(page);
    await openAsEducator(
      page,
      `/classes?reportsClass=${CLASS_ID}&reportStatus=read&reportSort=score&reportDir=desc`
    );

    await expect(page.getByText('RT Sim 03')).toBeVisible({ timeout: 30_000 });
    expect(queries.at(-1)).toMatchObject({
      classIds: [CLASS_ID],
      reviewStatus: 'read',
      sortBy: 'score',
      sortDirection: 'DESC',
      page: 1,
    });
    await expect(reviewFilter(page, 'Reviewed')).toHaveAttribute(
      'aria-pressed',
      'true'
    );

    await page.reload();
    await expect(page.getByText('RT Sim 03')).toBeVisible({ timeout: 30_000 });
    expect(queries.at(-1)?.reviewStatus).toBe('read');
  });

  test('keeps a selection across loaded pages and clears it when the filter changes', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const { reviews } = await mockApis(page);
    await openAsEducator(page, '/classes');
    await openMockSchool(page);
    await expect(page.getByText(CLASS_NAME)).toBeVisible({ timeout: 30_000 });
    await reportsButton(page).click();

    await page
      .getByRole('checkbox', { name: /Select report .*RT Sim 01/ })
      .check();
    await scrollToLoadMore(page, 'RT Sim 10');
    await page
      .getByRole('checkbox', { name: /Select report .*RT Sim 11/ })
      .check();
    await expect(page.getByText('2 selected')).toBeVisible();

    await page
      .getByRole('button', { name: 'Mark reviewed', exact: true })
      .click();
    await expect.poll(() => reviews.length).toBe(1);
    expect(reviews[0]).toEqual({
      type: 'report',
      ids: ['rt-1', 'rt-11'],
      reviewed: true,
    });

    await page
      .getByRole('checkbox', { name: /Select report .*RT Sim 12/ })
      .check();
    await expect(page.getByText('1 selected')).toBeVisible();
    await reviewFilter(page, 'Unread').click();
    await expect(page.getByText('0 selected')).toBeVisible();
  });
});
