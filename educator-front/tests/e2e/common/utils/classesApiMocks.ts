import fs from 'fs';
import { expect, type Page, type Route } from '@playwright/test';
import { EDUCATOR_BASE_URL, EDUCATOR_SESSION_FILE } from '../setup/auth.setup';
import { educatorLogin } from './loginHelpers';

/** The one school the mocked classes are grouped under on the Classes page. */
export const MOCK_SCHOOL = {
  schoolId: 'e2e-school',
  schoolName: 'E2E Mock School',
};

/**
 * A class in the legacy GET /api/classes/user list the Classes page renders. It belongs
 * to MOCK_SCHOOL: a deep link opens the school named by the class's legacy `school_id`.
 */
export const makeLegacyClass = (id: string, name: string) => ({
  id,
  class_name: name,
  school_id: MOCK_SCHOOL.schoolId,
  status: 'ACTIVE',
  start_date: '2026-01-01',
  end_date: '2027-12-31',
  students: [],
  sims: [],
});

const pathOf = (url: URL) => url.pathname;

const fulfillJson = (route: Route, body: unknown) =>
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });

const envelope = (data: unknown) => ({
  message: 'ok',
  data,
  meta: null,
  error: null,
});

export async function mockAttentionSummary(page: Page, summary: object) {
  await page.route(
    (url) => pathOf(url).endsWith('/api/classes/user/attention-summary'),
    (route) => fulfillJson(route, envelope(summary))
  );
}

export async function mockActivityOverview(page: Page, overview: object) {
  await page.route(
    (url) => pathOf(url).endsWith('/api/classes/user/activity-overview'),
    (route) => fulfillJson(route, envelope(overview))
  );
}

export async function mockLegacyClassList(page: Page, classes: object[]) {
  await page.route(
    (url) => pathOf(url).endsWith('/api/classes/user'),
    (route) =>
      fulfillJson(route, {
        status: 'success',
        message: 'ok',
        data: { classes, simulations: 0 },
      })
  );
}

/** Answers the legacy GET /api/simulation-reports/educator/:id list from `getReports()`. */
export async function mockEducatorReports(
  page: Page,
  getReports: () => object[]
) {
  await page.route(
    (url) => /\/api\/simulation-reports\/educator\/[^/]+$/.test(pathOf(url)),
    (route) => fulfillJson(route, envelope(getReports()))
  );
}

export interface ReportsListQuery {
  classIds: string[];
  reviewStatus: string | null;
  sortBy: string | null;
  sortDirection: string | null;
  page: number;
  pageSize: number;
}

/**
 * Answers GET /api/simulation-reports/list from `respond(query)` (rows + total), wrapping
 * them in the paginated envelope. Returns every query seen, in order.
 */
export async function mockReportsList(
  page: Page,
  respond: (query: ReportsListQuery) => { rows: object[]; total: number }
) {
  const queries: ReportsListQuery[] = [];
  await page.route(
    (url) => pathOf(url).endsWith('/api/simulation-reports/list'),
    (route) => {
      const params = new URL(route.request().url()).searchParams;
      const query: ReportsListQuery = {
        classIds: params.getAll('classIds'),
        reviewStatus: params.get('reviewStatus'),
        sortBy: params.get('sortBy'),
        sortDirection: params.get('sortDirection'),
        page: Number(params.get('page') ?? 1),
        pageSize: Number(params.get('pageSize') ?? 10),
      };
      queries.push(query);
      const { rows, total } = respond(query);
      const totalPages = Math.ceil(total / query.pageSize);
      return fulfillJson(route, {
        message: 'Reports fetched successfully',
        data: rows,
        meta: {
          total,
          page: query.page,
          pageSize: query.pageSize,
          totalPages,
          hasNextPage: query.page < totalPages,
          hasPrevPage: query.page > 1,
        },
      });
    }
  );
  return queries;
}

export interface BulkReviewBody {
  type: string;
  ids: string[];
  reviewed: boolean;
}

/**
 * Answers PATCH /api/simulation-reports/bulk-review, recording each body. `respond` returns
 * the ids it updated, so a test can keep its own "BE" report state in step.
 */
export async function mockBulkReview(
  page: Page,
  respond: (body: BulkReviewBody) => string[]
) {
  const requests: BulkReviewBody[] = [];
  await page.route(
    (url) => pathOf(url).endsWith('/api/simulation-reports/bulk-review'),
    (route) => {
      const body = route.request().postDataJSON() as BulkReviewBody;
      requests.push(body);
      return fulfillJson(
        route,
        envelope({ updatedIds: respond(body), notAccessibleIds: [] })
      );
    }
  );
  return requests;
}

/** Answers GET /api/classes?measure=… with the class IDs in that measure's bucket (one page). */
export async function mockClassesByMeasure(
  page: Page,
  buckets: Record<string, string[]>
) {
  await page.route(
    (url) => pathOf(url).endsWith('/api/classes'),
    (route) => {
      const measure = new URL(route.request().url()).searchParams.get(
        'measure'
      );
      const ids = (measure && buckets[measure]) || [];
      return fulfillJson(route, {
        message: 'ok',
        data: ids.map((classId) => ({ classId })),
        meta: {
          total: ids.length,
          page: 1,
          pageSize: 50,
          totalPages: 1,
          hasNextPage: false,
          hasPrevPage: false,
        },
        error: null,
      });
    }
  );
}

const pageMeta = (total: number) => ({
  total,
  page: 1,
  pageSize: 50,
  totalPages: 1,
  hasNextPage: false,
  hasPrevPage: false,
});

/** Answers GET /api/classes?lite=true (class dropdown) with `{ classId, className }` items. */
export async function mockClassOptions(
  page: Page,
  classes: { classId: string; className: string }[]
) {
  await page.route(
    (url) =>
      pathOf(url).endsWith('/api/classes') &&
      url.searchParams.get('lite') === 'true',
    (route) =>
      fulfillJson(route, {
        message: 'ok',
        data: classes,
        meta: pageMeta(classes.length),
        error: null,
      })
  );
}

/** Answers GET /api/classes/schools (school filter + breakdown names). */
export async function mockSchoolGroups(
  page: Page,
  groups: { schoolId: string | null; schoolName: string; classCount: number }[]
) {
  await page.route(
    (url) => pathOf(url).endsWith('/api/classes/schools'),
    (route) =>
      fulfillJson(route, {
        message: 'ok',
        data: groups,
        meta: pageMeta(groups.length),
        error: null,
      })
  );
}

interface MockTableClass {
  id: string;
  class_name: string;
  status: string;
  start_date: string;
  end_date: string;
  students?: unknown[];
  sims?: unknown[];
}

interface MockClassesTableOptions {
  /** Class id → its Reports badge count (default 0). */
  reportsCount?: Record<string, number>;
  /** Attention measure → the class ids in its bucket; `?measure=` narrows to that bucket. */
  buckets?: Record<string, string[]>;
}

/**
 * Mocks the Classes page's school-grouped table: GET /api/classes/schools answers
 * MOCK_SCHOOL and GET /api/classes answers `classes` as its rows. The rows carry only
 * counts; the page still reads students/sims from the legacy list (mockLegacyClassList).
 */
export async function mockClassesTable(
  page: Page,
  classes: MockTableClass[],
  { reportsCount = {}, buckets = {} }: MockClassesTableOptions = {}
) {
  // Rows matching the request's attention measure, if any (like the BE).
  const rowsFor = (url: URL) => {
    const measure = url.searchParams.get('measure');
    return measure
      ? rows.filter((r) => (buckets[measure] ?? []).includes(r.classId))
      : rows;
  };
  const rows = classes.map((c) => ({
    classId: c.id,
    className: c.class_name,
    startDate: c.start_date,
    endDate: c.end_date,
    studentsCount: c.students?.length ?? 0,
    simsCount: c.sims?.length ?? 0,
    reportsCount: reportsCount[c.id] ?? 0,
    status: c.status,
  }));
  await page.route(
    (url) => pathOf(url).endsWith('/api/classes/schools'),
    (route) => {
      const classCount = rowsFor(new URL(route.request().url())).length;
      const groups = classCount ? [{ ...MOCK_SCHOOL, classCount }] : [];
      return fulfillJson(route, {
        message: 'ok',
        data: groups,
        meta: pageMeta(groups.length),
        error: null,
      });
    }
  );
  await page.route(
    (url) => pathOf(url).endsWith('/api/classes'),
    (route) => {
      const data = rowsFor(new URL(route.request().url()));
      return fulfillJson(route, {
        message: 'ok',
        data,
        meta: pageMeta(data.length),
        error: null,
      });
    }
  );
}

/** Expands MOCK_SCHOOL's accordion; its class rows only render once it's open. */
export async function openMockSchool(page: Page) {
  const schoolBar = page.getByRole('button', {
    name: new RegExp(`^School: ${MOCK_SCHOOL.schoolName}`),
  });
  await schoolBar.waitFor({ state: 'visible', timeout: 30_000 });
  // The first school opens on its own once the list loads, and clicking it
  // then would collapse it, so click only if it stays closed.
  const isOpen = await expect(schoolBar)
    .toHaveAttribute('aria-expanded', 'true', { timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  if (!isOpen) await schoolBar.click();
  await expect(schoolBar).toHaveAttribute('aria-expanded', 'true');
}

/** Answers GET /api/students?lite=true (student dropdown) with `{ id, studentId, name }` items. */
export async function mockStudentOptions(
  page: Page,
  students: { id: string; studentId: string; name: string | null }[]
) {
  await page.route(
    (url) =>
      pathOf(url).endsWith('/api/students') &&
      url.searchParams.get('lite') === 'true',
    (route) =>
      fulfillJson(route, {
        message: 'ok',
        data: students,
        meta: pageMeta(students.length),
        error: null,
      })
  );
}

/**
 * Answers the simulations-completed graph from `respond(searchParams)` and records each
 * request's params, so a spec can assert the chart asked for the on-screen selection.
 */
export async function mockSimulationsCompletedGraph(
  page: Page,
  respond: (params: URLSearchParams) => {
    byMonth: { year: number; month: number; count: number }[];
    bySchool?: { schoolId: string | null; count: number }[];
    byClass?: { classId: string; className: string; count: number }[];
    byStudent?: {
      studentId: string;
      studentCode: string | null;
      count: number;
    }[];
  }
): Promise<URLSearchParams[]> {
  const requests: URLSearchParams[] = [];
  await page.route(
    (url) =>
      pathOf(url).endsWith('/api/classes/user/simulations-completed-graph'),
    (route) => {
      const params = new URL(route.request().url()).searchParams;
      requests.push(params);
      return fulfillJson(route, envelope({ bySchool: [], ...respond(params) }));
    }
  );
  return requests;
}

/** Opens an app path as the saved educator session, falling back to a fresh login. */
const LOGIN_URL = /login|signin/i;

/**
 * Opens `path` as the saved educator. Session tokens are injected before any app script
 * runs; if the app still redirects to login (stale session), signs in and reopens `path`.
 */
export async function openAsEducator(page: Page, path: string) {
  const url = `${EDUCATOR_BASE_URL}${path}`;

  if (fs.existsSync(EDUCATOR_SESSION_FILE)) {
    const session = JSON.parse(
      fs.readFileSync(EDUCATOR_SESSION_FILE, 'utf-8')
    ) as Record<string, string>;
    // Only fills missing keys, so a fresh login in this tab isn't overwritten on later navigations.
    await page.addInitScript((entries: Record<string, string>) => {
      for (const [k, v] of Object.entries(entries)) {
        if (sessionStorage.getItem(k) === null)
          sessionStorage.setItem(k, String(v));
      }
    }, session);
  }

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  // The SPA redirects to login only after its auth check runs, not at domcontentloaded.
  // Race that redirect against the authenticated app shell so a valid session resolves
  // as soon as the app renders instead of waiting out a timeout.
  const outcome = await Promise.race([
    page
      .waitForURL(LOGIN_URL, { timeout: 30_000 })
      .then(() => 'login' as const),
    page
      .locator('main[aria-label="Page content"]')
      .waitFor({ state: 'visible', timeout: 30_000 })
      .then(() => 'app' as const),
  ]).catch(() => 'app' as const);

  if (outcome === 'login') {
    await educatorLogin(page);
    await page.waitForURL(/(dashboard|classes)/i, { timeout: 30_000 });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
  }
}
