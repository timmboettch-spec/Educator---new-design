/**
 * Regression: dashboard activity measures (RE-30) — UI E2E
 *
 * Covers the ticket's E2E flow: each measure opened from the educator dashboard lands on
 * the class list already filtered to that set, and the counts agree. A measure with nothing
 * outstanding is still shown, as 0.
 *
 * Only the class endpoints this feature reads are mocked (page.route); auth and
 * everything else hit the real environment.
 */

import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import { EDUCATOR_AUTH_FILE } from '../../common/setup/auth.setup';
import {
  makeLegacyClass,
  mockActivityOverview,
  mockAttentionSummary,
  mockClassesByMeasure,
  mockLegacyClassList,
  openAsEducator,
} from '../../common/utils/classesApiMocks';

// ── Fixtures ───────────────────────────────────────────────────────────────

const CLASSES = [
  makeLegacyClass('e2e-act-1', 'E2E Activity Biology'),
  makeLegacyClass('e2e-act-2', 'E2E Activity Chemistry'),
  makeLegacyClass('e2e-act-3', 'E2E Activity Physics'),
];

const BUCKETS: Record<string, string[]> = {
  active: ['e2e-act-1', 'e2e-act-2', 'e2e-act-3'],
  unreadReports: ['e2e-act-1', 'e2e-act-2'],
  closingSoon: ['e2e-act-3'],
  nearAvatarLimit: [],
};

// Class-count tiles equal their bucket sizes; nearAvatarLimit is 0, and its tile still shows.
const OVERVIEW = {
  activeClasses: 3,
  classesWithUnreadReports: 2,
  totalUnreadReports: 5,
  classesClosingSoon: 1,
  studentsInActiveClasses: 42,
  classesWithStudentsNearAvatarLimit: 0,
};

interface MeasureCase {
  tile: string;
  value: number;
  measure: string;
  chip: string;
  // True when the tile counts classes, so its number must equal the chip's count.
  countsClasses: boolean;
}

const CASES: MeasureCase[] = [
  {
    tile: 'Active Classes',
    value: 3,
    measure: 'active',
    chip: 'Active classes',
    countsClasses: true,
  },
  {
    tile: 'Students in Active Classes',
    value: 42,
    measure: 'active',
    chip: 'Active classes',
    countsClasses: false,
  },
  {
    tile: 'Classes with Unread Reports',
    value: 2,
    measure: 'unreadReports',
    chip: 'Classes with unread reports',
    countsClasses: true,
  },
  {
    tile: 'Total Unread Reports',
    value: 5,
    measure: 'unreadReports',
    chip: 'Classes with unread reports',
    countsClasses: false,
  },
  {
    tile: 'Classes Closing (14 Days)',
    value: 1,
    measure: 'closingSoon',
    chip: 'Classes closing within 14 days',
    countsClasses: true,
  },
  // A tile at 0 still opens its (empty) filtered list.
  {
    tile: 'Classes w/ Students Near Avatar Limit',
    value: 0,
    measure: 'nearAvatarLimit',
    chip: 'Classes with students near the avatar limit',
    countsClasses: true,
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────

async function mockApis(page: Page) {
  await mockActivityOverview(page, OVERVIEW);
  await mockAttentionSummary(page, {
    totalClasses: 3,
    classesNeedingAttention: 0,
    unreadReports: 0,
    noStudents: 0,
    noAssignedSims: 0,
  });
  await mockLegacyClassList(page, CLASSES);
  await mockClassesByMeasure(page, BUCKETS);
}

async function openDashboard(page: Page) {
  await openAsEducator(page, '/educator-dashboard');
  await expect(
    page.getByRole('heading', { name: 'Activity Overview', exact: true })
  ).toBeVisible({
    timeout: 30_000,
  });
}

// exact: "Active Classes — view classes" is a substring of "Students in Active Classes — …".
const tile = (page: Page, label: string) =>
  page.getByRole('button', { name: `${label} — view classes`, exact: true });

// ─────────────────────────────────────────────────────────────────────────────

test.describe('Dashboard activity measures — UI', () => {
  test.use({
    storageState: fs.existsSync(EDUCATOR_AUTH_FILE)
      ? EDUCATOR_AUTH_FILE
      : undefined,
  });

  test('a measure with nothing outstanding still shows, as 0', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await mockApis(page);
    await openDashboard(page);

    await expect(tile(page, 'Active Classes')).toBeVisible();
    await expect(
      tile(page, 'Classes w/ Students Near Avatar Limit')
    ).toContainText('0');
  });

  for (const c of CASES) {
    test(`${c.tile} opens the class list filtered to ${c.measure}`, async ({
      page,
    }) => {
      test.setTimeout(90_000);
      await mockApis(page);
      await openDashboard(page);

      const button = tile(page, c.tile);
      await expect(button).toContainText(String(c.value));
      await button.click();

      await expect(page).toHaveURL(new RegExp(`[?&]measure=${c.measure}\\b`));
      const chip = page.getByRole('status').filter({ hasText: 'Showing:' });
      const bucketSize = BUCKETS[c.measure]?.length ?? 0;
      await expect(chip).toContainText(`${c.chip} (${bucketSize})`);
      if (c.countsClasses) {
        expect(bucketSize).toBe(c.value);
      }
    });
  }
});
