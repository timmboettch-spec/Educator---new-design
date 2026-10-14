import { test, expect, type Page, type Route } from '@playwright/test';
import { BASE_URL } from '../../common/setup/auth.setup';

const EXCHANGE_ENDPOINT = '**/api/lti/deep-linking/exchange**';
const SIMULATIONS_ENDPOINT = '**/api/lti/deep-linking/simulations**';
const SUBMIT_ENDPOINT = '**/api/lti/deep-linking/submit**';

const CODE = 'deep-link-mock-code';
const COURSE_TITLE = 'Nursing Fundamentals 101';

const SIM_ALPHA = {
  id: 'sim-alpha',
  title: 'Alpha Deep Link Simulation',
  maxScore: 100,
  estimatedDuration: '12 min',
  difficulty: 'Medium',
  learnerLevel: 'High School Health Science',
  purpose: 'Practise a patient check-in.',
};
const SIM_BETA = {
  id: 'sim-beta',
  title: 'Beta Deep Link Simulation',
  maxScore: 50,
};

interface DeepLinkingSelection {
  simulationId: string;
  title: string;
  scoreMaximum: number;
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

async function mockContext(page: Page, acceptMultiple: boolean): Promise<void> {
  await page.route(EXCHANGE_ENDPOINT, async (route: Route) => {
    await fulfillJson(route, {
      schoolId: 'school-dl-1',
      courseTitle: COURSE_TITLE,
      deepLinkingSettings: {
        deep_link_return_url: 'https://lms.example.test/lti/deep-link/return',
        accept_types: ['ltiResourceLink'],
        accept_multiple: acceptMultiple,
      },
    });
  });
}

async function mockSimulations(
  page: Page,
  simulations: Array<{
    id: string;
    title: string;
    maxScore?: number;
    estimatedDuration?: string | null;
    difficulty?: string | null;
    learnerLevel?: string | null;
    purpose?: string | null;
  }>,
  status: 'ready' | 'course_not_linked' | 'no_simulations_assigned' = 'ready'
): Promise<void> {
  await page.route(SIMULATIONS_ENDPOINT, async (route: Route) => {
    await fulfillJson(route, { simulations, status });
  });
}

async function openPicker(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/lti/deep-linking?code=${CODE}`, {
    waitUntil: 'domcontentloaded',
  });
}

test.describe('Regression — LTI Deep Linking picker (mocked)', () => {
  test.setTimeout(120_000);

  test('TC-01: selecting a simulation submits the expected Deep Linking payload', async ({
    page,
  }) => {
    await mockContext(page, true);
    await mockSimulations(page, [SIM_ALPHA, SIM_BETA]);

    let submittedBody: {
      code?: string;
      selections?: DeepLinkingSelection[];
    } | null = null;
    await page.route(SUBMIT_ENDPOINT, async (route: Route) => {
      submittedBody = route.request().postDataJSON() as {
        code?: string;
        selections?: DeepLinkingSelection[];
      };

      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<html><body>submitted</body></html>',
      });
    });

    await openPicker(page);

    await expect(
      page.getByRole('heading', { name: new RegExp(COURSE_TITLE, 'i') }),
      'TC-01 FAIL: the picker did not render the course heading.'
    ).toBeVisible({ timeout: 30_000 });

    await page.getByText(SIM_ALPHA.title, { exact: false }).first().click();

    const submitButton = page.getByRole('button', { name: /add to course/i });
    await expect(submitButton).toBeEnabled({ timeout: 15_000 });
    await submitButton.click();

    await expect
      .poll(() => (submittedBody ? 'sent' : 'pending'), {
        message: 'TC-01 FAIL: the Deep Linking submit request was never made.',
        timeout: 30_000,
      })
      .toBe('sent');

    const body = submittedBody as unknown as {
      code?: string;
      selections?: DeepLinkingSelection[];
    };
    expect(body.code, 'TC-01 FAIL: the session code was not submitted.').toBe(
      CODE
    );
    expect(
      body.selections,
      'TC-01 FAIL: exactly one selection should have been submitted.'
    ).toHaveLength(1);
    expect(body.selections?.[0]).toEqual({
      simulationId: SIM_ALPHA.id,
      title: SIM_ALPHA.title,
      scoreMaximum: SIM_ALPHA.maxScore,
    });
  });

  test('TC-02: empty states explain course_not_linked and no_simulations_assigned', async ({
    page,
  }) => {
    await mockContext(page, true);
    await mockSimulations(page, [], 'course_not_linked');

    await openPicker(page);
    await expect(
      page.getByText('Course not linked yet', { exact: false }),
      'TC-02 FAIL: the course_not_linked empty state was not shown.'
    ).toBeVisible({ timeout: 30_000 });

    await page.unroute(SIMULATIONS_ENDPOINT);
    await mockSimulations(page, [], 'no_simulations_assigned');

    await openPicker(page);
    await expect(
      page.getByText('No simulations assigned yet', { exact: false }),
      'TC-02 FAIL: the no_simulations_assigned empty state was not shown.'
    ).toBeVisible({ timeout: 30_000 });

    await expect(
      page.getByRole('button', { name: /add to course/i }),
      'TC-02 FAIL: submit should be disabled when there is nothing to select.'
    ).toBeDisabled();
  });

  test('TC-03: accept_multiple switches the picker between radio and checkbox', async ({
    page,
  }) => {
    await mockContext(page, false);
    await mockSimulations(page, [SIM_ALPHA, SIM_BETA]);

    await openPicker(page);
    await expect(
      page.locator('input[type="radio"]'),
      'TC-03 FAIL: single-select mode should render radio inputs.'
    ).toHaveCount(2, { timeout: 30_000 });
    await expect(page.locator('input[type="checkbox"]')).toHaveCount(0);

    await page.getByText(SIM_ALPHA.title, { exact: false }).first().click();
    await page.getByText(SIM_BETA.title, { exact: false }).first().click();
    await expect(
      page.getByRole('button', { name: /add to course \(1\)/i }),
      'TC-03 FAIL: radio mode should keep the selection count at one.'
    ).toBeVisible({ timeout: 15_000 });

    await page.unroute(EXCHANGE_ENDPOINT);
    await mockContext(page, true);

    await openPicker(page);
    await expect(
      page.locator('input[type="checkbox"]'),
      'TC-03 FAIL: multi-select mode should render checkbox inputs.'
    ).toHaveCount(2, { timeout: 30_000 });
    await expect(page.locator('input[type="radio"]')).toHaveCount(0);

    await page.getByText(SIM_ALPHA.title, { exact: false }).first().click();
    await page.getByText(SIM_BETA.title, { exact: false }).first().click();
    await expect(
      page.getByRole('button', { name: /add to course \(2\)/i }),
      'TC-03 FAIL: checkbox mode should accumulate multiple selections.'
    ).toBeVisible({ timeout: 15_000 });
  });

  test('TC-04: each row shows its metadata and hides fields with no value', async ({
    page,
  }) => {
    await mockContext(page, true);
    await mockSimulations(page, [
      SIM_ALPHA,
      { ...SIM_BETA, difficulty: 'Hard', purpose: '' },
    ]);

    await openPicker(page);
    const alphaRow = page.locator('label', { hasText: SIM_ALPHA.title });
    const betaRow = page.locator('label', { hasText: SIM_BETA.title });

    await expect(
      alphaRow,
      'TC-04 FAIL: the fully populated row is missing a metadata field.'
    ).toContainText(
      [
        'Duration:12 min',
        'Difficulty:Medium',
        'Intended audience:High School Health Science',
        'Simulation context:Practise a patient check-in.',
      ].join(''),
      { timeout: 30_000 }
    );
    await expect(betaRow).toContainText('Difficulty:Hard');
    await expect(
      betaRow.locator('dt'),
      'TC-04 FAIL: empty metadata fields should be hidden, not rendered as empty labels.'
    ).toHaveCount(1);
  });

  test('TC-05: the search box narrows the list by title and keeps selections', async ({
    page,
  }) => {
    await mockContext(page, true);
    await mockSimulations(page, [SIM_ALPHA, SIM_BETA]);

    await openPicker(page);
    await page.getByText(SIM_ALPHA.title, { exact: false }).first().click();

    const search = page.getByRole('searchbox', { name: /search simulations/i });
    await search.fill('beta');
    await expect(
      page.locator('label', { hasText: SIM_ALPHA.title }),
      'TC-05 FAIL: a non-matching title should be filtered out.'
    ).toHaveCount(0, { timeout: 15_000 });
    await expect(
      page.locator('label', { hasText: SIM_BETA.title })
    ).toHaveCount(1);

    await page.getByText(SIM_BETA.title, { exact: false }).first().click();
    await expect(
      page.getByRole('button', { name: /add to course \(2\)/i }),
      'TC-05 FAIL: selections hidden by the search should still count.'
    ).toBeVisible();

    await search.fill('no such simulation');
    await expect(
      page.getByText('No simulations match your search.')
    ).toBeVisible();
  });
});
