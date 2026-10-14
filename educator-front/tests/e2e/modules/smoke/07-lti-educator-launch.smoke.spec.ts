import { test, expect, type Page, type Route } from '@playwright/test';
import { BASE_URL } from '../../common/setup/auth.setup';

const EXCHANGE_ENDPOINT = '**/api/lti/session/exchange**';
const LIVE_CLASSES_ENDPOINT = '**/api/lms/live-classes**';
const MAPPED_CLASSES_ENDPOINT = '**/api/lms/moodle/mapped-classes**';
const CLASSES_ENDPOINT = '**/api/classes/user**';

const SESSION_CODE = 'educator-session-code-abc';
const LMS_COURSE_ID = '4242';
const LMS_COURSE_NAME = 'Nursing Fundamentals (LMS)';
const NRPS_URL = 'https://lms.example.test/nrps/context/4242/memberships';

const EDUCATOR_USER = {
  id: 'edu-lti-001',
  email: 'lti.educator@example.test',
  full_name: 'LTI Educator',
  role: 'Educator',
  is_license_active: true,
};

const SUCCESSFUL_EXCHANGE = {
  accessToken: 'mock-educator-access-token',
  csrfToken: 'mock-csrf-token',
  user: EDUCATOR_USER,
  schoolId: 'school-lti-1',
  nrpsUrl: NRPS_URL,
  lmsCourseId: LMS_COURSE_ID,
  lmsCourseName: LMS_COURSE_NAME,
  provisioningStatus: 'provisioned',
  courseSource: 'moodle',
};

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

async function mockExchange(page: Page): Promise<{ calls: () => number }> {
  let calls = 0;
  await page.route(EXCHANGE_ENDPOINT, async (route: Route) => {
    calls += 1;
    await fulfillJson(route, SUCCESSFUL_EXCHANGE);
  });
  return { calls: () => calls };
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
  }, JSON.stringify(EDUCATOR_USER));
}

async function seedPendingLmsLaunch(page: Page): Promise<void> {
  await page.addInitScript(
    ([courseId, courseName, nrpsUrl]: string[]) => {
      sessionStorage.setItem('lms_launch_session', '1');
      sessionStorage.removeItem('lms_launch_sync_lock');
      localStorage.setItem('lti_course_id', courseId);
      localStorage.setItem('lti_course_name', courseName);
      localStorage.setItem('lti_school_id', 'school-lti-1');
      localStorage.setItem('nrpsUrl', nrpsUrl);
    },
    [LMS_COURSE_ID, LMS_COURSE_NAME, NRPS_URL]
  );
}

test.describe('Smoke — Educator LTI launch (mocked)', () => {
  test.setTimeout(120_000);

  test('TC-01: a successful exchange stores LMS context, cleans the URL and lands on the dashboard', async ({
    page,
  }) => {
    await stubAllApis(page);
    const exchange = await mockExchange(page);

    const exchangeRequest = page.waitForRequest(EXCHANGE_ENDPOINT, {
      timeout: 60_000,
    });

    await page.goto(
      `${BASE_URL}/login?lti_launch=success&code=${SESSION_CODE}`,
      {
        waitUntil: 'domcontentloaded',
      }
    );

    await exchangeRequest;
    await expect
      .poll(() => exchange.calls(), {
        message: 'TC-01 FAIL: the educator session exchange was not called.',
        timeout: 20_000,
      })
      .toBeGreaterThan(0);

    await page.waitForURL(/\/educator-dashboard/, { timeout: 60_000 });

    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('lti_course_id')), {
        message:
          'TC-01 FAIL: the LMS course id was not stored after the launch.',
        timeout: 20_000,
      })
      .toBe(LMS_COURSE_ID);

    const storedNrps = await page.evaluate(() =>
      localStorage.getItem('nrpsUrl')
    );
    expect(storedNrps, 'TC-01 FAIL: the NRPS URL was not stored.').toBe(
      NRPS_URL
    );

    expect(page.url()).not.toContain(SESSION_CODE);
    expect(page.url()).not.toContain('lti_launch=');
  });

  test('TC-02: lti_launch=error shows the mapped message and never exchanges', async ({
    page,
  }) => {
    await stubAllApis(page);
    const exchange = await mockExchange(page);

    const cases = [
      {
        reason: 'educator_not_registered',
        message:
          'Access denied: Your educator account has not been set up yet.',
      },
      {
        reason: 'school_not_configured',
        message: 'LTI is not configured for this LMS site.',
      },
    ];

    for (const { reason, message } of cases) {
      await page.goto(`${BASE_URL}/login?lti_launch=error&reason=${reason}`, {
        waitUntil: 'domcontentloaded',
      });

      await expect(
        page.getByText(message, { exact: false }).first(),
        `TC-02 FAIL: no mapped error message shown for reason "${reason}".`
      ).toBeVisible({ timeout: 20_000 });

      expect(page.url()).not.toContain('lti_launch=');
    }

    expect(
      exchange.calls(),
      'TC-02 FAIL: an exchange was attempted even though the launch errored.'
    ).toBe(0);
  });

  test('TC-03: lti_launch=success without a code shows the missing-code message', async ({
    page,
  }) => {
    await stubAllApis(page);
    const exchange = await mockExchange(page);

    await page.goto(`${BASE_URL}/login?lti_launch=success`, {
      waitUntil: 'domcontentloaded',
    });

    await expect(
      page
        .getByText('LTI login failed — missing session code', { exact: false })
        .first(),
      'TC-03 FAIL: no missing-session-code message was shown.'
    ).toBeVisible({ timeout: 20_000 });

    expect(
      exchange.calls(),
      'TC-03 FAIL: an exchange was attempted without a session code.'
    ).toBe(0);
  });

  test('TC-04: a pending LMS launch triggers the class sync exactly once', async ({
    page,
  }) => {
    await stubAllApis(page);

    let liveClassesCalls = 0;
    await page.route(LIVE_CLASSES_ENDPOINT, async (route: Route) => {
      liveClassesCalls += 1;
      await fulfillJson(route, { data: { classes: [] } });
    });
    await page.route(MAPPED_CLASSES_ENDPOINT, async (route: Route) => {
      await fulfillJson(route, { data: { classes: [], total: 0 } });
    });
    await page.route(CLASSES_ENDPOINT, async (route: Route) => {
      await fulfillJson(route, { data: { classes: [] } });
    });

    await seedEducatorSession(page);
    await seedPendingLmsLaunch(page);

    await page.goto(`${BASE_URL}/educator-dashboard`, {
      waitUntil: 'domcontentloaded',
    });

    await expect
      .poll(() => liveClassesCalls, {
        message:
          'TC-04 FAIL: the LMS class sync did not run for a pending launch session.',
        timeout: 45_000,
      })
      .toBeGreaterThan(0);

    await page.waitForTimeout(3_000);
    expect(
      liveClassesCalls,
      'TC-04 FAIL: the LMS class sync ran more than once for a single launch.'
    ).toBe(1);
  });

  test('TC-05: a failed session exchange releases the loader and shows the error', async ({
    page,
  }) => {
    await stubAllApis(page);

    let exchangeCalls = 0;
    await page.route(EXCHANGE_ENDPOINT, async (route: Route) => {
      exchangeCalls += 1;
      await fulfillJson(
        route,
        { message: 'Invalid or expired session code' },
        400
      );
    });

    await page.goto(
      `${BASE_URL}/login?lti_launch=success&code=${SESSION_CODE}`,
      {
        waitUntil: 'domcontentloaded',
      }
    );

    await expect
      .poll(() => exchangeCalls, {
        message: 'TC-05 FAIL: the session exchange was not attempted.',
        timeout: 30_000,
      })
      .toBeGreaterThan(0);

    await expect(
      page
        .getByText('LTI login failed — session expired', { exact: false })
        .first(),
      'TC-05 FAIL: no session-expired message was shown after the exchange failed.'
    ).toBeVisible({ timeout: 20_000 });

    await expect(
      page.locator('input[type="email"], input[name="email"]').first(),
      'TC-05 FAIL: the sign-in form stayed hidden behind the loader.'
    ).toBeVisible({ timeout: 20_000 });
  });
});
