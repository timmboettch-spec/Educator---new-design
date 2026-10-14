/**
 * Regression: Classes needing attention surfaced on the list (RE-33) — UI E2E
 *
 * Covers the ticket's E2E flow: the attention summary appears only when something is
 * outstanding, counts each class once, and holds its counts steady under an applied filter.
 *
 * Only the class endpoints this feature reads are mocked (page.route); auth and
 * everything else hit the real environment, as in 13-dashboard-data-states.
 */

import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import { EDUCATOR_AUTH_FILE } from '../../common/setup/auth.setup';
import {
  makeLegacyClass,
  mockAttentionSummary,
  mockClassesTable,
  mockLegacyClassList,
  openAsEducator,
  openMockSchool,
} from '../../common/utils/classesApiMocks';

// ── Fixtures ───────────────────────────────────────────────────────────────

const CLASSES = [
  makeLegacyClass('e2e-cls-1', 'E2E Attention Biology'),
  makeLegacyClass('e2e-cls-2', 'E2E Attention Chemistry'),
  makeLegacyClass('e2e-cls-3', 'E2E Attention Physics'),
  makeLegacyClass('e2e-cls-4', 'E2E Healthy Anatomy'),
];

// Buckets overlap (cls-2 is in both unreadReports and noStudents), so the bucket sum is 4
// but only 3 distinct classes need attention.
const BUCKETS: Record<string, string[]> = {
  unreadReports: ['e2e-cls-1', 'e2e-cls-2'],
  noStudents: ['e2e-cls-2'],
  noAssignedSims: ['e2e-cls-3'],
};

const OUTSTANDING_SUMMARY = {
  totalClasses: 4,
  classesNeedingAttention: 3,
  unreadReports: 2,
  noStudents: 1,
  noAssignedSims: 1,
};

const CLEAR_SUMMARY = {
  totalClasses: 4,
  classesNeedingAttention: 0,
  unreadReports: 0,
  noStudents: 0,
  noAssignedSims: 0,
};

// ── Helpers ────────────────────────────────────────────────────────────────

async function mockClassesApis(page: Page, summary: object) {
  await mockAttentionSummary(page, summary);
  await mockLegacyClassList(page, CLASSES);
  await mockClassesTable(page, CLASSES, { buckets: BUCKETS });
}

async function openClasses(page: Page, search = '') {
  await openAsEducator(page, `/classes${search}`);
  // The page has two "Add Class" buttons (header and below the list).
  await expect(
    page.getByRole('button', { name: /add class/i }).first()
  ).toBeVisible({ timeout: 30_000 });
  await openMockSchool(page);
}

const headline = (page: Page) =>
  page.getByText(/classes? with items needing attention/i);

// ─────────────────────────────────────────────────────────────────────────────

test.describe('Classes needing attention — UI', () => {
  test.use({
    storageState: fs.existsSync(EDUCATOR_AUTH_FILE)
      ? EDUCATOR_AUTH_FILE
      : undefined,
  });

  test('summary is hidden when nothing is outstanding', async ({ page }) => {
    test.setTimeout(90_000);
    await mockClassesApis(page, CLEAR_SUMMARY);
    await openClasses(page);

    await expect(page.getByText('E2E Healthy Anatomy')).toBeVisible();
    await expect(page.getByText('Classes Needing Attention')).toHaveCount(0);
    await expect(headline(page)).toHaveCount(0);
  });

  test('summary counts each class once when buckets overlap', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await mockClassesApis(page, OUTSTANDING_SUMMARY);
    await openClasses(page);

    await expect(page.getByText('Classes Needing Attention')).toBeVisible();
    await expect(headline(page)).toHaveText(
      '3 classes with items needing attention'
    );
    await expect(
      page.getByRole('button', { name: 'View Classes with Unread Reports (2)' })
    ).toBeVisible();
  });

  test('drill-down filters in place with a chip and counts stay steady', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await mockClassesApis(page, OUTSTANDING_SUMMARY);
    await openClasses(page);
    await expect(headline(page)).toHaveText(
      '3 classes with items needing attention'
    );

    await page
      .getByRole('button', { name: 'View Classes with Unread Reports (2)' })
      .click();

    const chip = page.getByRole('status').filter({ hasText: 'Showing:' });
    await expect(chip).toContainText('Classes with unread reports (2)');
    await expect(page).toHaveURL(/[?&]measure=unreadReports/);
    await expect(page.getByText('E2E Attention Biology')).toBeVisible();
    await expect(page.getByText('E2E Attention Chemistry')).toBeVisible();
    await expect(page.getByText('E2E Attention Physics')).toHaveCount(0);
    await expect(page.getByText('E2E Healthy Anatomy')).toHaveCount(0);

    // Counts are unaffected by the applied filter.
    await expect(headline(page)).toHaveText(
      '3 classes with items needing attention'
    );
    await expect(
      page.getByRole('button', { name: 'View Classes with No Students (1)' })
    ).toBeVisible();

    await chip.getByRole('button', { name: 'Clear filter' }).click();
    await expect(chip).toHaveCount(0);
    await expect(page).not.toHaveURL(/measure=/);
    await expect(page.getByText('E2E Healthy Anatomy')).toBeVisible();
    await expect(headline(page)).toHaveText(
      '3 classes with items needing attention'
    );
  });

  test('drill-downs and the chip work from the keyboard alone', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await mockClassesApis(page, OUTSTANDING_SUMMARY);
    await openClasses(page);

    // Enter on a focused drill-down filters the list, like a click.
    const unread = page.getByRole('button', {
      name: 'View Classes with Unread Reports (2)',
    });
    await unread.focus();
    await expect(unread).toBeFocused();
    await page.keyboard.press('Enter');

    const chip = page.getByRole('status').filter({ hasText: 'Showing:' });
    await expect(chip).toContainText('Classes with unread reports (2)');
    await expect(unread).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('E2E Healthy Anatomy')).toHaveCount(0);

    // Space on the chip's clear button removes the filter.
    const clear = chip.getByRole('button', { name: 'Clear filter' });
    await clear.focus();
    await page.keyboard.press('Space');
    await expect(chip).toHaveCount(0);
    await expect(page.getByText('E2E Healthy Anatomy')).toBeVisible();

    // A second drill-down, reached with Tab from the first.
    await unread.focus();
    await page.keyboard.press('Tab');
    const noStudents = page.getByRole('button', {
      name: 'View Classes with No Students (1)',
    });
    await expect(noStudents).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('status').filter({ hasText: 'Showing:' })
    ).toContainText('Classes with no students');
  });

  test('opening a filtered URL applies the chip on load', async ({ page }) => {
    test.setTimeout(90_000);
    await mockClassesApis(page, OUTSTANDING_SUMMARY);
    await openClasses(page, '?measure=noAssignedSims');

    await expect(
      page.getByRole('status').filter({ hasText: 'Showing:' })
    ).toContainText('Classes with no assigned simulations (1)');
    await expect(page.getByText('E2E Attention Physics')).toBeVisible();
    await expect(page.getByText('E2E Attention Biology')).toHaveCount(0);
  });
});
