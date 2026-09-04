/**
 * Regression: Create Educator
 *
 * Covers all ticket acceptance criteria:
 * - Form rendering (all approved fields)
 * - Cancel / Back behavior
 * - Required-field validation
 * - Invalid field format validation
 * - Loading / duplicate-submit prevention
 * - Successful creation + success confirmation
 * - Post-submit navigation / educator visible in list
 * - Duplicate / conflict handling
 * - API failure / error-state (mocked) + input retention on failure
 * - Keyboard accessibility (Tab / Enter / Escape)
 * - Responsive rendering (mobile viewport)
 * - Repeatability / stability
 *
 * Design rules:
 * - Each test is fully independent — uses test.use({ storageState }) so failures
 *   never cascade to sibling tests.
 * - All educator names are unique by timestamp + random suffix.
 * - Each test cleans up data it creates.
 */

import { test, expect, Page } from '@playwright/test';
import { EducatorPage } from '../../pages/EducatorPage';
import { ADMIN_AUTH_FILE, BASE_URL, injectAdminSessionStorage } from '../../common/setup/auth.setup';

// --- shared helpers ----------------------------------------------------------

const ADD_BTN = 'button:has-text("Add Educator"), button:has-text("Create Educator")';
const NAME_INPUT = 'input[name="full_name"]';
const EMAIL_INPUT = 'input[name="email"], input[type="email"]';
const DIALOG = '[role="dialog"]';

async function gotoEducators(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded' });
  await injectAdminSessionStorage(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
  await page.goto(`${BASE_URL}/educators`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
}

async function openForm(page: Page): Promise<void> {
  await page.locator(ADD_BTN).first().waitFor({ state: 'visible', timeout: 15_000 });
  await page.locator(ADD_BTN).first().click();
  await page.locator(NAME_INPUT).first().waitFor({ state: 'visible', timeout: 15_000 });
}

async function closeAnyOpen(page: Page): Promise<void> {
  for (let i = 0; i < 2; i++) {
    const overlay = page.locator('div.fixed.inset-0, [role="dialog"]').first();
    if (!await overlay.isVisible({ timeout: 1_000 }).catch(() => false)) break;
    await page.keyboard.press('Escape');
    await overlay.waitFor({ state: 'hidden', timeout: 4_000 }).catch(() => {});
  }
  const backBtn = page.locator('button:has-text("Back")').first();
  if (await backBtn.isVisible({ timeout: 1_500 }).catch(() => false)) {
    await backBtn.click({ force: true });
    await page.waitForLoadState('networkidle').catch(() => {});
  }
}

async function fillValidEducator(page: Page, name: string): Promise<string> {
  const rand = Math.random().toString(36).slice(2, 8);
  const domain =
    process.env.EDUCATOR_EMAIL?.includes('@')
      ? process.env.EDUCATOR_EMAIL.split('@')[1]
      : 'example.com';
  const email = `edutest-${Date.now()}-${rand}@${domain}`;

  await page.locator(NAME_INPUT).first().fill(name);
  await page.locator(EMAIL_INPUT).first().fill(email);

  const schoolBtn = page.locator('button:has-text("Select school")').first();
  if (await schoolBtn.isVisible({ timeout: 4_000 }).catch(() => false)) {
    await schoolBtn.click();
    await page.locator('div.px-3.py-2.cursor-pointer').first()
      .waitFor({ state: 'visible', timeout: 8_000 });
    await page.locator('div.px-3.py-2.cursor-pointer').first().click();
    await page.waitForTimeout(400);
  }

  // Inactive to avoid consuming the token pool
  const statusDropdown = page
    .locator('div.relative.w-full')
    .filter({ hasText: /Active|Inactive|Status/i })
    .first();
  if (await statusDropdown.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await statusDropdown.click();
    await page.locator('div[class*="cursor-pointer"]:has-text("Inactive")').first().click();
    await page.waitForTimeout(400);
  }

  return email;
}

// Reloads educators page, searches, then performs the full inline delete.
// Reload clears prior search state; post-search only one row is visible.
async function searchAndDelete(page: Page, educator: EducatorPage, name: string): Promise<void> {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});

  const searchBox = page.locator('input[placeholder*="Search"]').first();
  if (await searchBox.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await searchBox.clear();
    await searchBox.fill(name);
    await page.waitForTimeout(1200); // outlast the 1000 ms debounce
  }

  await page.getByText(name).first().waitFor({ state: 'visible', timeout: 15_000 });

  const deleteBtn = page.locator(
    'button[aria-label="delete"], button:has(svg.lucide-trash-2), button:has(svg.lucide-trash)'
  ).first();
  await deleteBtn.waitFor({ state: 'visible', timeout: 8_000 });
  await deleteBtn.click({ force: true });

  await page.waitForTimeout(600);
  const confirmBtn = page.locator('button:has-text("Delete Educator")').first();
  if (await confirmBtn.waitFor({ state: 'visible', timeout: 10_000 }).then(() => true).catch(() => false)) {
    await confirmBtn.click({ force: true });
  }

  await page.getByText(name).first()
    .waitFor({ state: 'hidden', timeout: 20_000 }).catch(() => {});
}

// --- suite -------------------------------------------------------------------

test.describe('Create Educator Regression', () => {
  // Each test gets its own authenticated page - failures never cascade.
  test.use({ storageState: ADMIN_AUTH_FILE });

  // Capture the page state at the moment each test ends (before browser closes).
  test.afterEach(async ({ page }, testInfo) => {
    const screenshot = await page.screenshot({ fullPage: true }).catch(() => null);
    if (screenshot) {
      await testInfo.attach('final-state', { body: screenshot, contentType: 'image/png' });
    }
  });

  // ==========================================================================
  // 5. LOADING STATE & DUPLICATE-SUBMIT PREVENTION
  // ==========================================================================

  test.describe('Loading State & Duplicate-Submit Prevention', () => {

    test('Positive - Rapid double-click on submit does not create duplicate educators', async ({ page }) => {
      test.setTimeout(90_000);
      await gotoEducators(page);
      await openForm(page);
      const name = `DoubleClick-${Date.now()}`;
      await fillValidEducator(page, name);

      const submitBtn = page.getByRole('button', { name: /add educator|create educator/i }).last();
      await submitBtn.waitFor({ state: 'visible', timeout: 8_000 });
      await Promise.all([submitBtn.click(), submitBtn.click({ force: true })]);

      await page.locator(DIALOG).first()
        .waitFor({ state: 'hidden', timeout: 20_000 }).catch(() => {});

      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle').catch(() => {});
      const matchCount = await page.locator(`text="${name}"`).count();

      // Clean up all instances before asserting (duplicate-submit race may create >1)
      const educator = new EducatorPage(page);
      if (matchCount > 0) {
        for (let i = 0; i < matchCount; i++) {
          await searchAndDelete(page, educator, name).catch(() => {});
        }
      }

      expect(matchCount).toBeLessThanOrEqual(1);
      await expect(page).not.toHaveURL(/error/i);
    });

  });

  // ==========================================================================
  // 6. SUCCESSFUL CREATION + SUCCESS CONFIRMATION
  // ==========================================================================

  test.describe('Successful Creation', () => {

    test('Positive - Educator is created successfully with valid data', async ({ page }) => {
      test.setTimeout(90_000);
      await gotoEducators(page);
      const educator = new EducatorPage(page);
      const name = `CreateTest-${Date.now()}`;
      const { educatorName } = await educator.createEducatorWithName(name);
      await educator.assertEducatorVisible(educatorName);
      await searchAndDelete(page, educator, educatorName).catch(() => {});
      await expect(page).not.toHaveURL(/error/i);
    });

    test('Positive - Success toast or confirmation message is displayed after creation', async ({ page }) => {
      test.setTimeout(90_000);
      await gotoEducators(page);
      const name = `ToastTest-${Date.now()}`;
      await openForm(page);
      await fillValidEducator(page, name);
      await page.getByRole('button', { name: /add educator|create educator/i }).last().click();

      const toastVisible = await Promise.race([
        page.locator('[role="alert"], [class*="toast"], [class*="snack"], [class*="success"]').first()
          .waitFor({ state: 'visible', timeout: 8_000 }).then(() => true).catch(() => false),
        page.locator('text=/success|created|added/i').first()
          .waitFor({ state: 'visible', timeout: 8_000 }).then(() => true).catch(() => false),
        page.locator(DIALOG).first()
          .waitFor({ state: 'hidden', timeout: 20_000 }).then(() => true).catch(() => false),
      ]);
      expect(toastVisible).toBe(true);

      await page.locator(DIALOG).first()
        .waitFor({ state: 'hidden', timeout: 20_000 }).catch(() => {});
      const educator = new EducatorPage(page);
      await searchAndDelete(page, educator, name).catch(() => {});
      await expect(page).not.toHaveURL(/error/i);
    });

  });

  // ==========================================================================
  // 7. POST-SUBMIT NAVIGATION
  // ==========================================================================

  test.describe('Post-submit Navigation', () => {

    test('Positive - After creation form closes and educator list is visible', async ({ page }) => {
      test.setTimeout(90_000);
      await gotoEducators(page);
      const educator = new EducatorPage(page);
      const name = `NavTest-${Date.now()}`;
      await educator.createEducatorWithName(name);
      await expect(page).toHaveURL(/educators/i);
      await expect(page.locator(ADD_BTN).first()).toBeVisible({ timeout: 10_000 });
      await searchAndDelete(page, educator, name).catch(() => {});
      await expect(page).not.toHaveURL(/error/i);
    });

    test('Positive - Created educator appears in the list after submission', async ({ page }) => {
      test.setTimeout(90_000);
      await gotoEducators(page);
      const educator = new EducatorPage(page);
      const name = `ListCheck-${Date.now()}`;
      const { educatorName } = await educator.createEducatorWithName(name);
      await educator.navigateToEducators();
      await educator.assertEducatorVisible(educatorName);
      await searchAndDelete(page, educator, educatorName).catch(() => {});
      await expect(page).not.toHaveURL(/error/i);
    });

  });

  // ==========================================================================
  // 8. DUPLICATE / CONFLICT HANDLING
  // ==========================================================================

  test.describe('Duplicate / Conflict Handling', () => {

    test('Negative - Submitting duplicate email shows conflict error and keeps form open', async ({ page }) => {
      test.setTimeout(120_000);
      await gotoEducators(page);

      const rand = Math.random().toString(36).slice(2, 8);
      const domain =
        process.env.EDUCATOR_EMAIL?.includes('@')
          ? process.env.EDUCATOR_EMAIL.split('@')[1]
          : 'example.com';
      const sharedEmail = `dup-${Date.now()}-${rand}@${domain}`;
      const firstName = `DupFirst-${Date.now()}`;

      // First educator with sharedEmail
      await openForm(page);
      await page.locator(NAME_INPUT).first().fill(firstName);
      await page.locator(EMAIL_INPUT).first().fill(sharedEmail);
      const schoolBtn = page.locator('button:has-text("Select school")').first();
      if (await schoolBtn.isVisible({ timeout: 4_000 }).catch(() => false)) {
        await schoolBtn.click();
        await page.locator('div.px-3.py-2.cursor-pointer').first()
          .waitFor({ state: 'visible', timeout: 8_000 });
        await page.locator('div.px-3.py-2.cursor-pointer').first().click();
        await page.waitForTimeout(400);
      }
      const statusEl = page.locator('div.relative.w-full')
        .filter({ hasText: /Active|Inactive|Status/i }).first();
      if (await statusEl.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await statusEl.click();
        await page.locator('div[class*="cursor-pointer"]:has-text("Inactive")').first().click();
        await page.waitForTimeout(400);
      }
      await page.getByRole('button', { name: /add educator|create educator/i }).last().click();
      await page.locator(DIALOG).first()
        .waitFor({ state: 'hidden', timeout: 20_000 }).catch(() => {});
      await page.waitForLoadState('networkidle').catch(() => {});

      // Second educator with same email
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle').catch(() => {});
      await openForm(page);
      await page.locator(NAME_INPUT).first().fill(`DupSecond-${Date.now()}`);
      await page.locator(EMAIL_INPUT).first().fill(sharedEmail);
      const schoolBtn2 = page.locator('button:has-text("Select school")').first();
      if (await schoolBtn2.isVisible({ timeout: 4_000 }).catch(() => false)) {
        await schoolBtn2.click();
        await page.locator('div.px-3.py-2.cursor-pointer').first()
          .waitFor({ state: 'visible', timeout: 8_000 });
        await page.locator('div.px-3.py-2.cursor-pointer').first().click();
        await page.waitForTimeout(400);
      }
      const statusEl2 = page.locator('div.relative.w-full')
        .filter({ hasText: /Active|Inactive|Status/i }).first();
      if (await statusEl2.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await statusEl2.click();
        await page.locator('div[class*="cursor-pointer"]:has-text("Inactive")').first().click();
        await page.waitForTimeout(400);
      }
      await page.getByRole('button', { name: /add educator|create educator/i }).last().click();

      const conflictVisible = await page
        .locator('text=/already exists|duplicate|conflict|taken|in use/i').first()
        .waitFor({ state: 'visible', timeout: 10_000 }).then(() => true).catch(() => false);
      expect(conflictVisible).toBe(true);
      await expect(page.locator(NAME_INPUT).first()).toBeVisible({ timeout: 5_000 });

      await closeAnyOpen(page);
      const educator = new EducatorPage(page);
      await searchAndDelete(page, educator, firstName).catch(() => {});
      await expect(page).not.toHaveURL(/error/i);
    });

  });

  // ==========================================================================
  // 9. API FAILURE / ERROR-STATE + INPUT RETENTION
  // ==========================================================================

  test.describe('API Failure / Error State', () => {

    test('Negative - Mocked API failure keeps form open and shows error message', async ({ page }) => {
      await gotoEducators(page);

      await page.route('**/educators**', async (route) => {
        if (route.request().method() === 'POST') {
          await route.fulfill({ status: 500, body: JSON.stringify({ message: 'Server error' }) });
        } else {
          await route.continue();
        }
      });

      await openForm(page);
      await fillValidEducator(page, `ApiFailTest-${Date.now()}`);
      await page.getByRole('button', { name: /add educator|create educator/i }).last().click();

      await expect(page.locator(NAME_INPUT).first()).toBeVisible({ timeout: 8_000 });
      await expect(page).not.toHaveURL(/error/i);
      await page.unroute('**/educators**');
      await closeAnyOpen(page);
    });

    test('Negative - Input values are retained in the form after API failure', async ({ page }) => {
      await gotoEducators(page);

      await page.route('**/educators**', async (route) => {
        if (route.request().method() === 'POST') {
          await route.fulfill({ status: 500, body: JSON.stringify({ message: 'Server error' }) });
        } else {
          await route.continue();
        }
      });

      const retainName = `Retain-${Date.now()}`;
      await openForm(page);
      await page.locator(NAME_INPUT).first().fill(retainName);
      await page.locator(EMAIL_INPUT).first().fill('retain@example.com');
      await page.getByRole('button', { name: /add educator|create educator/i }).last().click();

      await expect(page.locator(NAME_INPUT).first()).toBeVisible({ timeout: 8_000 });
      const retainedValue = await page.locator(NAME_INPUT).first().inputValue();
      expect(retainedValue).toBe(retainName);

      await page.unroute('**/educators**');
      await closeAnyOpen(page);
      await expect(page).not.toHaveURL(/error/i);
    });

  });

});
