/**
 * Regression: Educator dashboard layout — UI E2E
 *
 * Covers the dashboard ticket's E2E flow: an educator signs in and the dashboard
 * opens on the new layout of collapsible cards (each remembering its own state),
 * including an educator teaching across several schools, and a card whose data is
 * unavailable. Also checks the cards stack at a phone width.
 *
 * Only the responses under test are changed (page.route); auth and everything else
 * hit the real environment.
 */

import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import { EDUCATOR_AUTH_FILE } from '../../common/setup/auth.setup';
import { openAsEducator } from '../../common/utils/classesApiMocks';

const DASHBOARD = '/educator-dashboard';

const EXTRA_SCHOOL = { id: 'e2e-school-extra', schoolName: 'E2E Maple Ridge' };

const cardToggle = (page: Page, name: string | RegExp) =>
  page.getByRole('button', { name });

async function openDashboard(page: Page) {
  await openAsEducator(page, DASHBOARD);
  await expect(cardToggle(page, /notification center/i)).toBeVisible({
    timeout: 30_000,
  });
}

/** Adds a second school to the signed-in educator's profile from /api/auth/me. */
async function mockSecondSchool(page: Page) {
  await page.route('**/api/auth/me**', async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as {
      data?: {
        activeRole?: { educator?: { schools?: unknown[] } };
        user?: { userRoles?: { educator?: { schools?: unknown[] } }[] };
      };
    };
    const profiles = [
      body.data?.activeRole?.educator,
      ...(body.data?.user?.userRoles ?? []).map((role) => role.educator),
    ];
    for (const profile of profiles) {
      if (!profile) continue;
      const schools = Array.isArray(profile.schools) ? profile.schools : [];
      profile.schools =
        schools.length > 0
          ? [...schools, EXTRA_SCHOOL]
          : [
              { id: 'e2e-school-main', schoolName: 'E2E Cedar Hollow' },
              EXTRA_SCHOOL,
            ];
    }
    await route.fulfill({ response, json: body });
  });
}

test.describe('Educator dashboard layout — UI', () => {
  test.use({
    storageState: fs.existsSync(EDUCATOR_AUTH_FILE)
      ? EDUCATOR_AUTH_FILE
      : undefined,
  });

  test('opens on the collapsible cards in order, and each keeps its own state', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await openDashboard(page);

    const headings = [
      /notification center/i,
      /alerts & activity overview/i,
      /my products & usage/i,
      /graphical overview of simulations completed/i,
    ];
    const tops: number[] = [];
    for (const name of headings) {
      const toggle = cardToggle(page, name);
      await expect(toggle).toBeVisible();
      await expect(toggle).toHaveAttribute('aria-expanded', /true|false/);
      tops.push((await toggle.boundingBox())?.y ?? 0);
    }
    expect([...tops].sort((a, b) => a - b)).toEqual(tops);

    // The old summary is gone.
    await expect(page.getByText('My Active Classes')).toHaveCount(0);

    // Collapse Alerts and open My Products, then reload: both are remembered.
    const alerts = cardToggle(page, /alerts & activity overview/i);
    const products = cardToggle(page, /my products & usage/i);
    if ((await alerts.getAttribute('aria-expanded')) === 'true') {
      await alerts.click();
    }
    if ((await products.getAttribute('aria-expanded')) === 'false') {
      await products.click();
    }
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(alerts).toHaveAttribute('aria-expanded', 'false', {
      timeout: 30_000,
    });
    await expect(products).toHaveAttribute('aria-expanded', 'true');

    // Toggles are reachable by keyboard.
    await alerts.focus();
    await page.keyboard.press('Enter');
    await expect(alerts).toHaveAttribute('aria-expanded', 'true');
  });

  test('shows a multi-school view for an educator at several schools', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await mockSecondSchool(page);
    await openDashboard(page);

    const schools = cardToggle(page, /your schools \(\d+\)/i);
    await expect(schools).toBeVisible({ timeout: 30_000 });
    if ((await schools.getAttribute('aria-expanded')) === 'false') {
      await schools.click();
    }
    await expect(page.getByText(EXTRA_SCHOOL.schoolName)).toBeVisible();
    await expect(
      page.getByText(/active class(es)? · \d+ active students?/).first()
    ).toBeVisible();
  });

  test('a card whose data is unavailable says so, and the rest still load', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.route(/\/api\/notifications(\?.*)?$/, (route) =>
      route.request().method() === 'GET'
        ? route.fulfill({
            status: 500,
            json: { message: 'Internal server error' },
          })
        : route.continue()
    );
    await openDashboard(page);

    const center = cardToggle(page, /notification center/i);
    if ((await center.getAttribute('aria-expanded')) === 'false') {
      await center.click();
    }
    await expect(
      page.getByText("We couldn't load your notifications.")
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();

    await expect(cardToggle(page, /alerts & activity overview/i)).toBeVisible();
    await expect(
      cardToggle(page, /graphical overview of simulations completed/i)
    ).toBeVisible();
  });

  test('stacks the cards at a phone width without horizontal scrolling', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await openDashboard(page);

    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
