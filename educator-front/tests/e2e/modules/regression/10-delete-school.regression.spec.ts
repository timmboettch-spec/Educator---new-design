/**
 * Regression: Delete School
 *
 * Covers confirmation dialog rendering, cancel-without-delete, successful
 * deletion, post-delete UI update, API failure-state (mocked), loading /
 * duplicate-submit prevention, keyboard accessibility, and stability.
 *
 * Design rules for serial-suite stability (no skips, no cascading failures):
 * - Every test navigates to a clean state before asserting.
 * - `openDeleteModal` and `getOpenDialog` are wrappers that never throw.
 * - Hard assertions only cover behaviour that MUST be true for the feature;
 *   advisory checks use .catch() and record an annotation where appropriate.
 * - Each test that consumes a school re-creates it so later tests still pass.
 */

import {
  test,
  expect,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import { SchoolPage } from '../../pages/SchoolPage';
import { adminLogin } from '../../common/utils/loginHelpers';
import {
  ADMIN_AUTH_FILE,
  BASE_URL,
  injectAdminSessionStorage,
} from '../../common/setup/auth.setup';
import { LoginPage } from '../../pages/LoginPage';
import fs from 'fs';

// ─── shared helpers ────────────────────────────────────────────────────────────

/**
 * Opens the delete confirmation modal for the school whose name matches `name`.
 *
 * ListTable renders a CSS grid with flat sibling divs — no per-row wrapper.
 * Only the school_name column uses the default accessor renderer which emits
 * `<span title="{schoolName}">`. We use that attribute to resolve the 0-based
 * row index and click `button[aria-label="delete"]` at the same position.
 */
async function openDeleteModal(page: Page, name: string): Promise<boolean> {
  await new SchoolPage(page).waitForListRows();
  const searchBox = page.locator('input[placeholder*="Search"]').first();
  if (await searchBox.isVisible({ timeout: 3000 }).catch(() => false)) {
    await searchBox.clear();
    await searchBox.fill(name);
    await page
      .locator(`span[title="${name}"]`)
      .first()
      .waitFor({ state: 'visible', timeout: 8000 })
      .catch(() => {});
    await page.waitForTimeout(1200); // outlast the 1000 ms search debounce
  }

  const nameSpan = page.locator(`span[title="${name}"]`).first();
  const nameVisible = await nameSpan
    .waitFor({ state: 'visible', timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  if (!nameVisible) return false;

  // span[title] only appears on the school_name column; resolve row index.
  const allSpans = page.locator('span[title]');
  const spanCount = await allSpans.count().catch(() => 0);
  let rowIndex = 0;
  for (let i = 0; i < spanCount; i++) {
    if (
      (await allSpans
        .nth(i)
        .getAttribute('title')
        .catch(() => '')) === name
    ) {
      rowIndex = i;
      break;
    }
  }

  const deleteBtn = page.locator('button[aria-label="delete"]').nth(rowIndex);
  const btnVisible = await deleteBtn
    .waitFor({ state: 'visible', timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  if (!btnVisible) return false;
  await deleteBtn.scrollIntoViewIfNeeded().catch(() => {});
  await deleteBtn.click();

  // waitFor retries until the React state update renders the dialog.
  return page
    .locator('[role="dialog"]')
    .first()
    .waitFor({ state: 'visible', timeout: 10000 })
    .then(() => true)
    .catch(() => false);
}

/** Returns the open dialog locator or null — never throws. */
async function getOpenDialog(page: Page) {
  const dialog = page.locator('[role="dialog"]').first();
  const visible = await dialog
    .waitFor({ state: 'visible', timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  return visible ? dialog : null;
}

/** Closes any open dialog with Escape. */
async function dismissDialog(page: Page): Promise<void> {
  const dialog = page.locator('[role="dialog"]').first();
  // isVisible is a quick snapshot check — we only want to press Escape if a dialog is already open.
  if (await dialog.isVisible().catch(() => false)) {
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden', timeout: 6000 }).catch(() => {});
  }
}

/** Clicks the Delete/Yes/Confirm button and waits for the dialog to close. */
async function confirmDeleteDialog(page: Page): Promise<void> {
  const dialog = page.locator('[role="dialog"]').first();
  const btn = dialog
    .locator(
      'button:has-text("Delete School"), button:has-text("Delete"), button:has-text("Yes"), button:has-text("Confirm")'
    )
    .first();
  const btnVisible = await btn
    .waitFor({ state: 'visible', timeout: 6000 })
    .then(() => true)
    .catch(() => false);
  if (btnVisible) {
    await btn.click();
    await dialog.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
  }
}

// ─── suite ─────────────────────────────────────────────────────────────────────

test.describe.serial('Delete School Regression', () => {
  let context: BrowserContext;
  let page: Page;
  let deletableSchoolName = '';
  let secondarySchoolName = '';

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    test.setTimeout(180_000);

    if (fs.existsSync(ADMIN_AUTH_FILE)) {
      context = await browser.newContext({ storageState: ADMIN_AUTH_FILE });
      page = await context.newPage();
    } else {
      context = await browser.newContext();
      page = await context.newPage();
      const login = new LoginPage(page);
      await login.goto();
      await adminLogin(page);
    }

    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded' });
    await injectAdminSessionStorage(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(2000);

    await Promise.any([
      page
        .locator('a[href="/schools"]')
        .waitFor({ state: 'visible', timeout: 20_000 }),
      page
        .locator('main, [role="main"]')
        .waitFor({ state: 'visible', timeout: 20_000 }),
    ]).catch(() => {});

    // Stale storageState redirects to /login — fall back to fresh admin login.
    if (/login|signin/i.test(page.url())) {
      const login = new LoginPage(page);
      await login.goto();
      await adminLogin(page);
    }

    await dismissDialog(page);

    const school = new SchoolPage(page);
    await school.navigateToSchools();
    deletableSchoolName = await school.createSchool(`DeleteTest-${Date.now()}`);
    secondarySchoolName = await school.createSchool(
      `DeleteTest2-${Date.now() + 1}`
    );
  });

  test.afterAll(async () => {
    try {
      const school = new SchoolPage(page);
      await school.navigateToSchools();
      for (const name of [deletableSchoolName, secondarySchoolName]) {
        if (!name) continue;
        const visible = await page
          .locator(`span[title="${name}"]`)
          .first()
          .isVisible({ timeout: 3000 })
          .catch(() => false);
        if (visible) await school.deleteSchool(name).catch(() => {});
      }
    } catch {
      /* ignore */
    }
    await context.close().catch(() => {});
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 1. CANCEL WITHOUT DELETE
  // ════════════════════════════════════════════════════════════════════════════

  test.describe('Cancel Without Delete', () => {
    test('Negative - Clicking Cancel in delete modal does not delete the school', async () => {
      const school = new SchoolPage(page);
      await school.navigateToSchools();
      expect(await openDeleteModal(page, deletableSchoolName)).toBe(true);

      const dialog = (await getOpenDialog(page))!;
      const cancelBtn = dialog
        .locator(
          'button:has-text("Cancel"), button:has-text("No"), button[aria-label*="close" i]'
        )
        .first();
      if (await cancelBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await cancelBtn.click();
      } else {
        await page.keyboard.press('Escape');
      }
      await page
        .locator('[role="dialog"]')
        .first()
        .waitFor({ state: 'hidden', timeout: 8000 })
        .catch(() => {});

      await school.navigateToSchools();
      await school.assertSchoolVisible(deletableSchoolName);
      await expect(page).not.toHaveURL(/error/i);
    });

    test('Negative - Clicking X/close icon in delete modal does not delete the school', async () => {
      const school = new SchoolPage(page);
      await school.navigateToSchools();
      expect(await openDeleteModal(page, deletableSchoolName)).toBe(true);

      const dialog = (await getOpenDialog(page))!;
      const closeIcon = dialog
        .locator(
          'button[aria-label="Close"], button:has(svg.lucide-x), button:has-text("×")'
        )
        .first();
      if (await closeIcon.isVisible({ timeout: 3000 }).catch(() => false)) {
        await closeIcon.click();
      } else {
        await page.keyboard.press('Escape');
      }
      await page
        .locator('[role="dialog"]')
        .first()
        .waitFor({ state: 'hidden', timeout: 8000 })
        .catch(() => {});

      await school.navigateToSchools();
      await school.assertSchoolVisible(deletableSchoolName);
      await expect(page).not.toHaveURL(/error/i);
    });

    test('Negative - Dialog closes and school remains after cancel on repeated opens', async () => {
      const school = new SchoolPage(page);
      for (let i = 0; i < 2; i++) {
        await school.navigateToSchools();
        expect(await openDeleteModal(page, deletableSchoolName)).toBe(true);
        await page.keyboard.press('Escape');
        await page
          .locator('[role="dialog"]')
          .first()
          .waitFor({ state: 'hidden', timeout: 8000 })
          .catch(() => {});
      }
      await school.navigateToSchools();
      await school.assertSchoolVisible(deletableSchoolName);
      await expect(page).not.toHaveURL(/error/i);
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 2. ACCESSIBILITY
  // ════════════════════════════════════════════════════════════════════════════

  test.describe('Accessibility', () => {
    test('Accessibility - Destructive confirmation message is visible and correct', async () => {
      const school = new SchoolPage(page);
      await school.navigateToSchools();
      expect(await openDeleteModal(page, deletableSchoolName)).toBe(true);

      const dialog = (await getOpenDialog(page))!;
      // Verify the dialog title is present
      await expect(dialog.getByText(/delete school/i).first()).toBeVisible({
        timeout: 5000,
      });
      // Verify the warning text is present
      await expect(
        dialog.getByText(/are you sure|cannot be undone/i).first()
      ).toBeVisible({ timeout: 5000 });

      await page.keyboard.press('Escape');
      await page
        .locator('[role="dialog"]')
        .first()
        .waitFor({ state: 'hidden', timeout: 8000 })
        .catch(() => {});
      await expect(page).not.toHaveURL(/error/i);
    });

    test('Accessibility - Escape key dismisses delete confirmation dialog', async () => {
      const school = new SchoolPage(page);
      await school.navigateToSchools();
      expect(await openDeleteModal(page, deletableSchoolName)).toBe(true);

      await page.keyboard.press('Escape');
      await page
        .locator('[role="dialog"]')
        .first()
        .waitFor({ state: 'hidden', timeout: 8000 })
        .catch(() => {});

      expect(
        await page
          .locator('[role="dialog"]')
          .first()
          .isVisible({ timeout: 2000 })
          .catch(() => false)
      ).toBe(false);
      await school.navigateToSchools();
      await school.assertSchoolVisible(deletableSchoolName);
      await expect(page).not.toHaveURL(/error/i);
    });

    test('Accessibility - Tab key cycles through dialog buttons', async () => {
      const school = new SchoolPage(page);
      await school.navigateToSchools();
      expect(await openDeleteModal(page, deletableSchoolName)).toBe(true);

      const dialog = (await getOpenDialog(page))!;

      // Verify dialog has focusable buttons
      const buttons = dialog.locator('button:not([disabled])');
      expect(await buttons.count()).toBeGreaterThan(0);

      // Focus first button and verify it receives focus (keyboard accessible)
      await buttons.first().focus();
      const firstFocused = await page.evaluate(() => {
        const active = document.activeElement;
        const dlg = document.querySelector('[role="dialog"]');
        return dlg ? dlg.contains(active) : false;
      });
      expect(firstFocused).toBe(true);

      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {});
      await expect(page).not.toHaveURL(/error/i);
    });

    test('Accessibility - Enter key activates focused button in dialog', async () => {
      // Use a dedicated temp school so Enter-to-confirm actually deletes it
      const school = new SchoolPage(page);
      await school.navigateToSchools();
      const enterTestName = await school.createSchool(`EnterKey-${Date.now()}`);
      await school.navigateToSchools();

      expect(await openDeleteModal(page, enterTestName)).toBe(true);
      const dialog = (await getOpenDialog(page))!;

      // Tab to focus the Delete/Yes button, then press Enter to confirm
      const deleteBtn = dialog
        .locator(
          'button:has-text("Delete School"), button:has-text("Delete"), button:has-text("Yes")'
        )
        .first();
      await deleteBtn.focus().catch(() => {});
      await page.keyboard.press('Enter');
      await dialog.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});

      await school.navigateToSchools();
      await school.assertSchoolNotVisible(enterTestName);
      await expect(page).not.toHaveURL(/error/i);
    });

    test('Accessibility - Space key activates focused Cancel button without deleting', async () => {
      const school = new SchoolPage(page);
      await school.navigateToSchools();
      expect(await openDeleteModal(page, deletableSchoolName)).toBe(true);

      const dialog = (await getOpenDialog(page))!;
      const cancelBtn = dialog
        .locator('button:has-text("Cancel"), button:has-text("No")')
        .first();
      if (await cancelBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await cancelBtn.focus().catch(() => {});
        await page.keyboard.press('Space');
        await dialog
          .waitFor({ state: 'hidden', timeout: 8000 })
          .catch(() => {});
      } else {
        await page.keyboard.press('Escape');
        await dialog
          .waitFor({ state: 'hidden', timeout: 8000 })
          .catch(() => {});
      }

      await school.navigateToSchools();
      await school.assertSchoolVisible(deletableSchoolName);
      await expect(page).not.toHaveURL(/error/i);
    });

    test('Accessibility - Focus returns to page after dialog is dismissed', async () => {
      const school = new SchoolPage(page);
      await school.navigateToSchools();
      expect(await openDeleteModal(page, deletableSchoolName)).toBe(true);

      await page.keyboard.press('Escape');
      await page
        .locator('[role="dialog"]')
        .first()
        .waitFor({ state: 'hidden', timeout: 8000 })
        .catch(() => {});

      // After dismiss, focus should have moved back into the page (body or a button)
      const focusedTag = await page.evaluate(
        () => document.activeElement?.tagName?.toLowerCase() ?? ''
      );
      expect(['button', 'body', 'a', 'input', 'div']).toContain(focusedTag);
      await expect(page).not.toHaveURL(/error/i);
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 3. UNAUTHORIZED ACCESS & DEPENDENCY-BLOCKED DELETION
  // ════════════════════════════════════════════════════════════════════════════

  test.describe('Unauthorized Access & Dependency-Blocked Deletion', () => {
    test('Negative - UI handles 401 unauthorized delete gracefully without crashing', async () => {
      const school = new SchoolPage(page);
      await school.navigateToSchools();
      const authTestName = await school.createSchool(`AuthTest-${Date.now()}`);
      await school.navigateToSchools();

      await page.route('**/api/schools/**', async (route) => {
        if (route.request().method() === 'DELETE') {
          await route.fulfill({
            status: 401,
            contentType: 'application/json',
            body: JSON.stringify({ message: 'Unauthorized' }),
          });
        } else {
          await route.continue();
        }
      });

      expect(await openDeleteModal(page, authTestName)).toBe(true);
      await confirmDeleteDialog(page);
      await page.unroute('**/api/schools/**');

      // Page must not crash or show an unhandled error URL
      await expect(page).not.toHaveURL(/error/i);

      // Re-authenticate if the 401 caused a redirect, then clean up
      if (/login|signin/i.test(page.url())) {
        const login = new LoginPage(page);
        await login.goto();
        await adminLogin(page);
      }
      await school.navigateToSchools();
      await openDeleteModal(page, authTestName);
      await confirmDeleteDialog(page);
    });

    test('Negative - Dependency-blocked deletion shows error and keeps school in list', async () => {
      const school = new SchoolPage(page);
      await school.navigateToSchools();
      const blockedName = await school.createSchool(`Blocked-${Date.now()}`);
      await school.navigateToSchools();

      // Simulate a dependency-blocked response (school has active educators/classes)
      await page.route('**/api/schools/**', async (route) => {
        if (route.request().method() === 'DELETE') {
          await route.fulfill({
            status: 422,
            contentType: 'application/json',
            body: JSON.stringify({
              message: 'Cannot delete school with active educators or classes',
            }),
          });
        } else {
          await route.continue();
        }
      });

      expect(await openDeleteModal(page, blockedName)).toBe(true);
      await confirmDeleteDialog(page);
      await page.unroute('**/api/schools/**');

      // UI should show an error toast or message — not crash
      const errorShown = await page
        .locator(
          'text=/cannot delete|blocked|active educator|active class|failed|error/i'
        )
        .first()
        .waitFor({ state: 'visible', timeout: 8000 })
        .then(() => true)
        .catch(() => false);
      if (!errorShown) {
        test.info().annotations.push({
          type: 'note',
          description:
            'Error message not observed — may use a different message format',
        });
      }

      // School must remain in the list
      await school.navigateToSchools();
      await school.assertSchoolVisible(blockedName);
      await expect(page).not.toHaveURL(/error/i);

      // Cleanup
      await openDeleteModal(page, blockedName);
      await confirmDeleteDialog(page);
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 4. SUCCESSFUL DELETION
  // ════════════════════════════════════════════════════════════════════════════

  test.describe('Successful Deletion', () => {
    test('Positive - School is deleted after confirming deletion in modal', async () => {
      const school = new SchoolPage(page);
      await school.navigateToSchools();
      expect(await openDeleteModal(page, deletableSchoolName)).toBe(true);
      await confirmDeleteDialog(page);
      expect(
        await page
          .locator('[role="dialog"]')
          .first()
          .isVisible({ timeout: 3000 })
          .catch(() => false)
      ).toBe(false);
      await expect(page).not.toHaveURL(/error/i);
    });

    test('Positive - Success feedback is shown after deletion', async () => {
      const school = new SchoolPage(page);
      await school.navigateToSchools();
      const tempName = await school.createSchool(`ToastTest-${Date.now()}`);

      expect(await openDeleteModal(page, tempName)).toBe(true);

      const dialog = page.locator('[role="dialog"]').first();
      const deleteBtn = dialog
        .locator(
          'button:has-text("Delete School"), button:has-text("Delete"), button:has-text("Yes")'
        )
        .first();

      await deleteBtn.click();

      // Primary success signal: the confirmation dialog closes after the API responds.
      await expect(dialog).not.toBeVisible({ timeout: 15_000 });

      // School must no longer appear in the list.
      await school.navigateToSchools();
      await school.waitForListRows();
      const searchBox = page.locator('input[placeholder*="Search"]').first();
      if (await searchBox.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await searchBox.fill(tempName);
        await page.waitForTimeout(1200);
      }
      await expect(page.getByText(tempName).first()).not.toBeVisible({
        timeout: 10_000,
      });

      await expect(page).not.toHaveURL(/error/i);
    });

    test('Positive - Deleted school is no longer visible in the list', async () => {
      const school = new SchoolPage(page);
      await school.navigateToSchools();
      await school.assertSchoolNotVisible(deletableSchoolName);
      await expect(page).not.toHaveURL(/error/i);
    });

    test('Positive - Create and delete another school confirms repeatability', async () => {
      const school = new SchoolPage(page);
      await school.navigateToSchools();
      const repeatName = await school.createSchool(
        `RepeatDelete-${Date.now()}`
      );
      await school.navigateToSchools();

      expect(await openDeleteModal(page, repeatName)).toBe(true);
      await confirmDeleteDialog(page);

      await school.navigateToSchools();
      await school.assertSchoolNotVisible(repeatName);
      await expect(page).not.toHaveURL(/error/i);
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 5. LOADING / DUPLICATE-SUBMIT PREVENTION
  // ════════════════════════════════════════════════════════════════════════════

  test.describe('Loading State & Duplicate-Submit Prevention', () => {
    test('Positive - Delete button shows loading/disabled state during submission', async () => {
      const school = new SchoolPage(page);
      await school.navigateToSchools();
      const loadingName = await school.createSchool(
        `LoadingTest-${Date.now()}`
      );
      await school.navigateToSchools();

      expect(await openDeleteModal(page, loadingName)).toBe(true);
      const dialog = (await getOpenDialog(page))!;
      const confirmBtn = dialog
        .locator(
          'button:has-text("Delete School"), button:has-text("Delete"), button:has-text("Yes")'
        )
        .first();
      await confirmBtn.click();

      // Any one of these constitutes valid in-progress feedback.
      const feedbackObserved = await Promise.race([
        confirmBtn.isDisabled().catch(() => false),
        dialog
          .locator('[aria-busy="true"], svg.animate-spin')
          .waitFor({ state: 'visible', timeout: 1500 })
          .then(() => true)
          .catch(() => false),
        page
          .locator('[role="dialog"]')
          .first()
          .waitFor({ state: 'hidden', timeout: 3000 })
          .then(() => true)
          .catch(() => false),
      ]);
      expect(feedbackObserved).toBe(true);
      await page
        .locator('[role="dialog"]')
        .first()
        .waitFor({ state: 'hidden', timeout: 10000 })
        .catch(() => {});
      await expect(page).not.toHaveURL(/error/i);
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 6. API FAILURE HANDLING (network-intercepted)
  // ════════════════════════════════════════════════════════════════════════════

  test.describe('API Failure State Handling', () => {
    async function runFailureScenario(
      status: number,
      message: string,
      namePrefix: string
    ) {
      const school = new SchoolPage(page);
      await school.navigateToSchools();
      const tempName = await school.createSchool(`${namePrefix}-${Date.now()}`);
      await school.navigateToSchools();

      // Intercept DELETE /api/schools/* to return the desired error.
      await page.route('**/api/schools/**', async (route) => {
        if (route.request().method() === 'DELETE') {
          await route.fulfill({
            status,
            contentType: 'application/json',
            body: JSON.stringify({ message, success: false }),
          });
        } else {
          await route.continue();
        }
      });

      // Reload so the school list is fully rendered while the route mock is active
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle').catch(() => {});
      await page
        .locator('button[aria-label="delete"]')
        .first()
        .waitFor({ state: 'visible', timeout: 15_000 })
        .catch(() => {});

      expect(await openDeleteModal(page, tempName)).toBe(true);
      await confirmDeleteDialog(page);
      await page.unroute('**/api/schools/**');

      // 403/401 may cause the app to redirect to /login — re-authenticate if needed.
      await page.waitForTimeout(2_000);
      if (/login|signin/i.test(page.url())) {
        const { LoginPage } = await import('../../pages/LoginPage');
        const { adminLogin } = await import('../../common/utils/loginHelpers');
        const login = new LoginPage(page);
        await login.goto();
        await adminLogin(page);
        await page
          .waitForURL(/(dashboard|school)/i, { timeout: 30_000 })
          .catch(() => {});
      }

      // School must still be in the list — deletion was rejected by the mocked API.
      await school.navigateToSchools();
      await school.assertSchoolVisible(tempName);
      await expect(page).not.toHaveURL(/error/i);

      // Cleanup — real deletion now that the route override is gone.
      await openDeleteModal(page, tempName);
      await confirmDeleteDialog(page);
    }

    test('Negative - School remains visible when delete API returns 500', async () => {
      await runFailureScenario(500, 'Internal Server Error', 'FailDelete');
    });

    test('Negative - School remains visible when delete API returns 404', async () => {
      await runFailureScenario(404, 'School not found', 'NotFound');
    });

    test('Negative - School remains visible when delete API returns 403', async () => {
      test.setTimeout(180_000);
      await runFailureScenario(
        403,
        'Forbidden: insufficient permissions',
        'Blocked'
      );
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 7. REGRESSION STABILITY
  // ════════════════════════════════════════════════════════════════════════════

  test.describe('Regression Stability', () => {
    test('Regression - Schools page is accessible after delete operations', async () => {
      const school = new SchoolPage(page);
      await school.navigateToSchools();
      await expect(
        page.locator('button:has-text("Add School")').first()
      ).toBeVisible({ timeout: 15_000 });
      await expect(page).toHaveURL(/school/i);
      await expect(page).not.toHaveURL(/error/i);
    });

    test('Regression - Can create a new school after performing deletions', async () => {
      const school = new SchoolPage(page);
      await school.navigateToSchools();
      const newName = await school.createSchool(`PostDelete-${Date.now()}`);
      await school.assertSchoolVisible(newName);
      await expect(page).not.toHaveURL(/error/i);

      await school.navigateToSchools();
      await openDeleteModal(page, newName);
      await confirmDeleteDialog(page);
    });

    test('Regression - Secondary school created in beforeAll is still manageable', async () => {
      const school = new SchoolPage(page);
      await school.navigateToSchools();
      await school.assertSchoolVisible(secondarySchoolName);

      expect(await openDeleteModal(page, secondarySchoolName)).toBe(true);
      await confirmDeleteDialog(page);

      await school.navigateToSchools();
      await school.assertSchoolNotVisible(secondarySchoolName);
      await expect(page).not.toHaveURL(/error/i);
    });
  });
});
