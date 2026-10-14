import { test, expect, type Page, type Route } from '@playwright/test';
import { BASE_URL } from '../../common/setup/auth.setup';
import {
  MOCK_SCHOOL,
  mockClassesTable,
  mockReportsList,
  openMockSchool,
} from '../../common/utils/classesApiMocks';

const CLASSES_ENDPOINT = '**/api/classes/user**';
const EDUCATOR_REPORTS_ENDPOINT = '**/api/simulation-reports/educator/**';
const CLASS_SIMS_ENDPOINT = '**/api/class-simulations/class/**';
const GRADE_SYNC_ENDPOINT =
  '**/api/simulation-reports/class/*/lms-grade-sync**';

const EDUCATOR_ID = 'edu-grade-sync-1';
const CLASS_ID = 'cls-grade-sync-1';
const CLASS_NAME = 'LMS Grade Sync Class';
const STUDENT_ID = 'stu-1';
const SIM_ID = 'sim-graded-1';
const SIM_TITLE = 'Graded Assessment Simulation';

const EDUCATOR_USER = {
  id: EDUCATOR_ID,
  email: 'grade.sync@example.test',
  full_name: 'Grade Sync Educator',
  role: 'Educator',
  is_license_active: true,
};

const MOCK_CLASS = {
  id: CLASS_ID,
  class_name: CLASS_NAME,
  school_id: MOCK_SCHOOL.schoolId,
  status: 'ACTIVE',
  start_date: '01-01-2026',
  end_date: '12-31-2030',
  students: [
    {
      id: STUDENT_ID,
      user_id: STUDENT_ID,
      student_id: STUDENT_ID,
      student_name: 'Alpha Student',
    },
    {
      id: 'stu-2',
      user_id: 'stu-2',
      student_id: 'stu-2',
      student_name: 'Beta Student',
    },
  ],
  sims: [],
  needsAttention: false,
  unreadReportCount: 0,
};

const MOCK_REPORT = {
  id: 'rep-1',
  key: 'rep-1',
  userId: STUDENT_ID,
  student_id: STUDENT_ID,
  studentName: 'Alpha Student',
  studentClass: CLASS_NAME,
  scenarioId: SIM_ID,
  scenario_id: SIM_ID,
  scenarioTitle: SIM_TITLE,
  transcriptId: 'tr-1',
  mode: 'Assessment',
  score: 88,
  performanceLabel: 'Meets Expectation',
  summary: 'Mocked assessment report.',
  summaryEntries: [],
  scenarioStartTime: '2026-09-01T10:00:00.000Z',
  scenarioEndTime: '2026-09-01T10:30:00.000Z',
  completed_at: '2026-09-01T10:30:00.000Z',
  totalTimeSeconds: 1800,
  isNew: false,
};

// The class Reports table's row, from GET /api/simulation-reports/list.
const MOCK_REPORT_ROW = {
  reportId: 'rep-1',
  studentCode: STUDENT_ID,
  mode: 'Assessment',
  simulationName: SIM_TITLE,
  score: 88,
  performanceQuality: 'Meets Expectation',
  timeSpent: '00:30:00',
  completedAt: '2026-09-01T10:30:00.000Z',
  transcriptId: 'tr-1',
  viewedAt: null,
  viewedBy: null,
};

// The class's assigned sim; the Reports table resolves a row's simulation id by title.
const MOCK_CLASS_SIM = {
  id: 'cs-1',
  class_id: CLASS_ID,
  simulation_id: SIM_ID,
  simulation_title: SIM_TITLE,
};

interface GradeSyncRow {
  simulationId: string;
  studentId: string;
  status: 'sent' | 'failed';
  failureReason?: string;
}

async function fulfillJson(
  route: Route,
  body: unknown,
  status = 200
): Promise<void> {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function stubAllApis(page: Page): Promise<void> {
  const info = test.info();
  const unmocked = new Set<string>();
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route: Route) => {
      const { pathname } = new URL(route.request().url());
      if (!unmocked.has(pathname)) {
        unmocked.add(pathname);
        info.annotations.push({ type: 'unmocked-api', description: pathname });
      }
      await fulfillJson(route, { status: 200, message: 'ok', data: {} });
    }
  );

  await page.route('**/api/educators/**', async (route: Route) => {
    await fulfillJson(route, { data: EDUCATOR_USER });
  });
}

async function seedEducatorSession(page: Page): Promise<void> {
  await page.addInitScript((serializedUser: string) => {
    document.cookie =
      'auth_token=mock-educator-access-token; path=/; SameSite=Lax';
    document.cookie = 'csrfToken=mock-csrf-token; path=/; SameSite=Lax';
    document.cookie = `auth_user=${encodeURIComponent(serializedUser)}; path=/; SameSite=Lax`;
    document.cookie = 'auth_session_active=1; path=/; SameSite=Lax';
    localStorage.setItem('accessToken', 'mock-educator-access-token');
    localStorage.setItem('csrfToken', 'mock-csrf-token');
    sessionStorage.setItem('session_active', '1');
    localStorage.setItem('app_language', 'en');
  }, JSON.stringify(EDUCATOR_USER));
}

async function mockClassAndReports(page: Page): Promise<void> {
  await page.route(CLASSES_ENDPOINT, async (route: Route) => {
    await fulfillJson(route, { data: { classes: [MOCK_CLASS] } });
  });
  await page.route(EDUCATOR_REPORTS_ENDPOINT, async (route: Route) => {
    await fulfillJson(route, { data: [MOCK_REPORT] });
  });
  await page.route(CLASS_SIMS_ENDPOINT, async (route: Route) => {
    await fulfillJson(route, { data: [MOCK_CLASS_SIM] });
  });
  await mockClassesTable(page, [MOCK_CLASS], {
    reportsCount: { [CLASS_ID]: 1 },
  });
  await mockReportsList(page, () => ({ rows: [MOCK_REPORT_ROW], total: 1 }));
}

async function openReportsSubTable(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/classes`, { waitUntil: 'domcontentloaded' });
  await openMockSchool(page);

  await expect(
    page.getByText(CLASS_NAME, { exact: false }).first(),
    'Setup FAIL: the mocked class row never rendered on /classes.'
  ).toBeVisible({ timeout: 45_000 });

  await page
    .getByRole('button', { name: new RegExp(`^Reports for ${CLASS_NAME}`) })
    .click();
}

test.describe('Regression — LMS grade sync badges (mocked)', () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test.setTimeout(180_000);

  test.beforeEach(async ({ page }) => {
    await stubAllApis(page);
    await seedEducatorSession(page);
    await mockClassAndReports(page);
  });

  test('TC-01: a synced assessment shows the "Synced to LMS" badge', async ({
    page,
  }) => {
    const synced: GradeSyncRow[] = [
      { simulationId: SIM_ID, studentId: STUDENT_ID, status: 'sent' },
    ];
    await page.route(GRADE_SYNC_ENDPOINT, async (route: Route) => {
      await fulfillJson(route, { data: synced });
    });

    await openReportsSubTable(page);

    await expect(
      page.getByText('Synced to LMS', { exact: true }),
      'TC-01 FAIL: the synced badge was not shown for a sent assessment grade.'
    ).toBeVisible({ timeout: 45_000 });

    await expect(
      page.getByText('LMS sync failed', { exact: false }),
      'TC-01 FAIL: a failure badge was shown for a successfully synced grade.'
    ).toHaveCount(0);
  });

  test('TC-02: a failed sync shows the reason and can be resynced', async ({
    page,
  }) => {
    let resynced = false;
    let resyncPosts = 0;

    await page.route(GRADE_SYNC_ENDPOINT, async (route: Route) => {
      if (route.request().method() === 'POST') {
        resyncPosts += 1;
        resynced = true;
        await fulfillJson(route, { data: { status: 'sent' } });
        return;
      }
      const rows: GradeSyncRow[] = resynced
        ? [{ simulationId: SIM_ID, studentId: STUDENT_ID, status: 'sent' }]
        : [
            {
              simulationId: SIM_ID,
              studentId: STUDENT_ID,
              status: 'failed',
              failureReason: 'lms_unreachable',
            },
          ];
      await fulfillJson(route, { data: rows });
    });

    await openReportsSubTable(page);

    await expect(
      page.getByText('LMS sync failed', { exact: false }),
      'TC-02 FAIL: the failure badge was not shown for a failed grade sync.'
    ).toBeVisible({ timeout: 45_000 });

    await expect(
      page.getByLabel(/LMS sync failed: The LMS couldn't be reached/i),
      'TC-02 FAIL: the failure reason was not exposed on the badge.'
    ).toBeVisible({ timeout: 15_000 });

    const resyncButton = page.getByRole('button', { name: /resync to lms/i });
    await expect(resyncButton).toBeVisible({ timeout: 15_000 });
    await resyncButton.click();

    await expect
      .poll(() => resyncPosts, {
        message:
          'TC-02 FAIL: clicking resync did not POST to the grade-sync endpoint.',
        timeout: 30_000,
      })
      .toBeGreaterThan(0);

    await expect(
      page.getByText('Synced to LMS', { exact: true }),
      'TC-02 FAIL: the badge did not change to synced after a successful resync.'
    ).toBeVisible({ timeout: 30_000 });
  });
});
