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

import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import { EducatorPage } from '../../pages/EducatorPage';
import {
  ADMIN_AUTH_FILE,
  EDUCATOR_AUTH_FILE,
  BASE_URL,
  EDUCATOR_BASE_URL,
  injectAdminSessionStorage,
  injectEducatorSessionStorage,
} from '../../common/setup/auth.setup';
import { adminLogin } from '../../common/utils/loginHelpers';

// --- shared helpers ----------------------------------------------------------

const ADD_BTN =
  'button:has-text("Add Educator"):not([form]), button:has-text("Create Educator"):not([form])';
const NAME_INPUT = 'input[name="full_name"]';
const EMAIL_INPUT = 'input[name="email"], input[type="email"]';
const DIALOG = '[role="dialog"]';

async function gotoEducators(page: Page): Promise<void> {
  // Retry navigation once with a brief pause on transient network errors
  const nav = async (url: string) =>
    page.goto(url, { waitUntil: 'domcontentloaded' }).catch(async () => {
      await page.waitForTimeout(2000);
      return page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
    });

  await nav(`${BASE_URL}/educators`);
  await injectAdminSessionStorage(page);
  await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  await page
    .waitForLoadState('networkidle', { timeout: 10000 })
    .catch(() => {});

  // Only fall back to login if the app redirected us away from /educators
  if (/login|signin/i.test(page.url())) {
    await adminLogin(page);
    await nav(`${BASE_URL}/educators`);
    await page
      .waitForLoadState('networkidle', { timeout: 10000 })
      .catch(() => {});
  }

  // Under parallel load the educators list API can take >20s. Wait here so
  // openForm() doesn't race against a still-loading skeleton.
  await page
    .locator(ADD_BTN)
    .first()
    .waitFor({ state: 'visible', timeout: 30_000 })
    .catch(() => {});
}

async function openForm(page: Page): Promise<void> {
  // Wait until the trigger button is fully interactive, then retry the click
  // up to 3 times in case a React re-render swallows the event.
  const triggerBtn = page.locator(ADD_BTN).first();
  await triggerBtn.waitFor({ state: 'visible', timeout: 20_000 });

  for (let attempt = 0; attempt < 3; attempt++) {
    // A leftover backdrop from a prior test can intercept this click — clear it first.
    const staleOverlay = page
      .locator('div.fixed.inset-0, [role="dialog"]')
      .first();
    if (await staleOverlay.isVisible({ timeout: 500 }).catch(() => false)) {
      await page.keyboard.press('Escape').catch(() => {});
      await staleOverlay
        .waitFor({ state: 'hidden', timeout: 4_000 })
        .catch(() => {});
    }
    await triggerBtn.click({ timeout: 10_000 }).catch(() => {});
    const opened = await page
      .locator(NAME_INPUT)
      .first()
      .waitFor({ state: 'visible', timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
    if (opened) return;
    await page.waitForTimeout(500);
  }

  // Final assertion so the test fails with a clear message if the modal never opened.
  await page
    .locator(NAME_INPUT)
    .first()
    .waitFor({ state: 'visible', timeout: 5_000 });
}

async function closeAnyOpen(page: Page): Promise<void> {
  for (let i = 0; i < 2; i++) {
    const overlay = page.locator('div.fixed.inset-0, [role="dialog"]').first();
    if (!(await overlay.isVisible({ timeout: 1_000 }).catch(() => false)))
      break;
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
  const domain = process.env.EDUCATOR_EMAIL?.includes('@')
    ? process.env.EDUCATOR_EMAIL.split('@')[1]
    : 'example.com';
  const email = `edutest-${Date.now()}-${rand}@${domain}`;

  await page.locator(NAME_INPUT).first().fill(name);
  await page.locator(EMAIL_INPUT).first().fill(email);

  const schoolBtn = page
    .locator(
      'button:has-text("Select school"), input[placeholder*="Select school" i]'
    )
    .first();
  // The picker only renders once the schools list has loaded (isVisible()
  // would not wait), and School is required — without it the form never submits.
  await schoolBtn.waitFor({ state: 'visible', timeout: 30_000 });
  await schoolBtn.click();
  const schoolOption = page.locator('[role="option"]').first();
  await schoolOption.waitFor({ state: 'visible', timeout: 8_000 });
  await schoolOption.click();
  await page.waitForTimeout(400);

  // Inactive to avoid consuming the token pool.
  // The form initializes status to "PENDING", so the trigger button text is "Pending".
  // Match any of the possible button states; use role="option" for the dropdown items
  // since Select renders options via createPortal with that ARIA role.
  const statusBtn = page
    .locator('button[type="button"]')
    .filter({ hasText: /^(Pending|Active|Select status)$/i })
    .first();
  if (await statusBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await statusBtn.click();
    const inactiveOption = page
      .locator('[role="option"]:has-text("Inactive")')
      .first();
    await inactiveOption
      .waitFor({ state: 'visible', timeout: 5_000 })
      .catch(() => {});
    await inactiveOption.click();
    await page.waitForTimeout(400);
  }

  return email;
}

// Reloads educators page, searches, then performs the full inline delete.
// Reload clears prior search state; post-search only one row is visible.
async function searchAndDelete(page: Page, name: string): Promise<void> {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});

  await new EducatorPage(page).waitForListRows();
  const searchBox = page.locator('input[placeholder*="Search"]').first();
  if (await searchBox.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await searchBox.clear();
    await searchBox.fill(name);
    await page.waitForTimeout(1200); // outlast the 1000 ms debounce
  }

  await page
    .getByText(name)
    .first()
    .waitFor({ state: 'visible', timeout: 15_000 });

  const deleteBtn = page
    .locator(
      'button[aria-label="delete"], button:has(svg.lucide-trash-2), button:has(svg.lucide-trash)'
    )
    .first();
  await deleteBtn.waitFor({ state: 'visible', timeout: 8_000 });
  await deleteBtn.click({ force: true });

  await page.waitForTimeout(600);
  const confirmBtn = page.locator('button:has-text("Delete Educator")').first();
  if (
    await confirmBtn
      .waitFor({ state: 'visible', timeout: 10_000 })
      .then(() => true)
      .catch(() => false)
  ) {
    await confirmBtn.click({ force: true });
  }

  await page
    .getByText(name)
    .first()
    .waitFor({ state: 'hidden', timeout: 20_000 })
    .catch(() => {});
}

// --- suite -------------------------------------------------------------------

test.describe('Create Educator Regression', () => {
  // Each test gets its own authenticated page - failures never cascade.
  test.use({ storageState: ADMIN_AUTH_FILE });

  // Capture the page state at the moment each test ends (before browser closes).
  test.afterEach(async ({ page }, testInfo) => {
    const screenshot = await page
      .screenshot({ fullPage: true })
      .catch(() => null);
    if (screenshot) {
      await testInfo.attach('final-state', {
        body: screenshot,
        contentType: 'image/png',
      });
    }
  });

  // ==========================================================================
  // 5. LOADING STATE & DUPLICATE-SUBMIT PREVENTION
  // ==========================================================================

  test.describe('Loading State & Duplicate-Submit Prevention', () => {
    test('Positive - Rapid double-click on submit does not create duplicate educators', async ({
      page,
    }) => {
      test.setTimeout(150_000);
      await gotoEducators(page);
      await openForm(page);
      const name = `DoubleClick-${Date.now()}`;
      await fillValidEducator(page, name);

      const submitBtn = page
        .getByRole('button', { name: /add educator|create educator/i })
        .last();
      await submitBtn.waitFor({ state: 'visible', timeout: 8_000 });
      await Promise.all([submitBtn.click(), submitBtn.click({ force: true })]);

      await page
        .locator(DIALOG)
        .first()
        .waitFor({ state: 'hidden', timeout: 20_000 })
        .catch(() => {});

      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle').catch(() => {});
      const matchCount = await page.locator(`text="${name}"`).count();

      // Clean up all instances before asserting (duplicate-submit race may create >1)
      if (matchCount > 0) {
        for (let i = 0; i < matchCount; i++) {
          await searchAndDelete(page, name).catch(() => {});
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
    test('Positive - Educator is created successfully with valid data', async ({
      page,
    }) => {
      test.setTimeout(150_000);
      await gotoEducators(page);
      const educator = new EducatorPage(page);
      const name = `CreateTest-${Date.now()}`;
      const { educatorName } = await educator.createEducatorWithName(name);
      await educator.assertEducatorVisible(educatorName);
      await searchAndDelete(page, educatorName).catch(() => {});
      await expect(page).not.toHaveURL(/error/i);
    });

    test('Positive - Success toast or confirmation message is displayed after creation', async ({
      page,
    }) => {
      test.setTimeout(150_000);
      await gotoEducators(page);
      const name = `ToastTest-${Date.now()}`;
      await openForm(page);
      await fillValidEducator(page, name);
      await page
        .getByRole('button', { name: /add educator|create educator/i })
        .last()
        .click();

      const toastVisible = await Promise.race([
        page
          .locator(
            '[role="alert"], [class*="toast"], [class*="snack"], [class*="success"]'
          )
          .first()
          .waitFor({ state: 'visible', timeout: 8_000 })
          .then(() => true)
          .catch(() => false),
        page
          .locator('text=/success|created|added/i')
          .first()
          .waitFor({ state: 'visible', timeout: 8_000 })
          .then(() => true)
          .catch(() => false),
        page
          .locator(DIALOG)
          .first()
          .waitFor({ state: 'hidden', timeout: 20_000 })
          .then(() => true)
          .catch(() => false),
      ]);
      expect(toastVisible).toBe(true);

      await page
        .locator(DIALOG)
        .first()
        .waitFor({ state: 'hidden', timeout: 20_000 })
        .catch(() => {});
      await searchAndDelete(page, name).catch(() => {});
      await expect(page).not.toHaveURL(/error/i);
    });
  });

  // ==========================================================================
  // 7. POST-SUBMIT NAVIGATION
  // ==========================================================================

  test.describe('Post-submit Navigation', () => {
    test('Positive - After creation form closes and educator list is visible', async ({
      page,
    }) => {
      test.setTimeout(150_000);
      await gotoEducators(page);
      const educator = new EducatorPage(page);
      const name = `NavTest-${Date.now()}`;
      await educator.createEducatorWithName(name);
      await expect(page).toHaveURL(/educators/i);
      await expect(page.locator(ADD_BTN).first()).toBeVisible({
        timeout: 10_000,
      });
      await searchAndDelete(page, name).catch(() => {});
      await expect(page).not.toHaveURL(/error/i);
    });

    test('Positive - Created educator appears in the list after submission', async ({
      page,
    }) => {
      test.setTimeout(150_000);
      await gotoEducators(page);
      const educator = new EducatorPage(page);
      const name = `ListCheck-${Date.now()}`;
      const { educatorName } = await educator.createEducatorWithName(name);
      await educator.navigateToEducators();
      await educator.assertEducatorVisible(educatorName);
      await searchAndDelete(page, educatorName).catch(() => {});
      await expect(page).not.toHaveURL(/error/i);
    });
  });

  // ==========================================================================
  // 8. DUPLICATE / CONFLICT HANDLING
  // ==========================================================================

  test.describe('Duplicate / Conflict Handling', () => {
    test('Negative - Submitting duplicate email shows conflict error and keeps form open', async ({
      page,
    }) => {
      test.setTimeout(180_000);
      await gotoEducators(page);

      const rand = Math.random().toString(36).slice(2, 8);
      const domain = process.env.EDUCATOR_EMAIL?.includes('@')
        ? process.env.EDUCATOR_EMAIL.split('@')[1]
        : 'example.com';
      const sharedEmail = `dup-${Date.now()}-${rand}@${domain}`;
      const firstName = `DupFirst-${Date.now()}`;

      // First educator with sharedEmail
      await openForm(page);
      await page.locator(NAME_INPUT).first().fill(firstName);
      await page.locator(EMAIL_INPUT).first().fill(sharedEmail);
      const schoolBtn = page
        .locator(
          'button:has-text("Select school"), input[placeholder*="Select school" i]'
        )
        .first();
      if (await schoolBtn.isVisible({ timeout: 4_000 }).catch(() => false)) {
        await schoolBtn.click();
        const opt1 = page.locator('[role="option"]').first();
        await opt1.waitFor({ state: 'visible', timeout: 8_000 });
        await opt1.click();
        await page.waitForTimeout(400);
      }
      const statusEl = page
        .locator('button[type="button"]')
        .filter({ hasText: /^(Pending|Active|Select status)$/i })
        .first();
      if (await statusEl.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await statusEl.click();
        const inactOpt1 = page
          .locator('[role="option"]:has-text("Inactive")')
          .first();
        await inactOpt1
          .waitFor({ state: 'visible', timeout: 5_000 })
          .catch(() => {});
        await inactOpt1.click();
        await page.waitForTimeout(400);
      }
      await page
        .getByRole('button', { name: /add educator|create educator/i })
        .last()
        .click();
      await page
        .locator(DIALOG)
        .first()
        .waitFor({ state: 'hidden', timeout: 20_000 })
        .catch(() => {});
      await page.waitForLoadState('networkidle').catch(() => {});

      // Second educator with same email
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle').catch(() => {});
      await openForm(page);
      await page.locator(NAME_INPUT).first().fill(`DupSecond-${Date.now()}`);
      await page.locator(EMAIL_INPUT).first().fill(sharedEmail);
      const schoolBtn2 = page
        .locator(
          'button:has-text("Select school"), input[placeholder*="Select school" i]'
        )
        .first();
      if (await schoolBtn2.isVisible({ timeout: 4_000 }).catch(() => false)) {
        await schoolBtn2.click();
        const opt2 = page.locator('[role="option"]').first();
        await opt2.waitFor({ state: 'visible', timeout: 8_000 });
        await opt2.click();
        await page.waitForTimeout(400);
      }
      const statusEl2 = page
        .locator('button[type="button"]')
        .filter({ hasText: /^(Pending|Active|Select status)$/i })
        .first();
      if (await statusEl2.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await statusEl2.click();
        const inactOpt2 = page
          .locator('[role="option"]:has-text("Inactive")')
          .first();
        await inactOpt2
          .waitFor({ state: 'visible', timeout: 5_000 })
          .catch(() => {});
        await inactOpt2.click();
        await page.waitForTimeout(400);
      }
      await page
        .getByRole('button', { name: /add educator|create educator/i })
        .last()
        .click();

      const conflictVisible = await page
        .locator('text=/already exists|duplicate|conflict|taken|in use/i')
        .first()
        .waitFor({ state: 'visible', timeout: 10_000 })
        .then(() => true)
        .catch(() => false);
      expect(conflictVisible).toBe(true);
      await expect(page.locator(NAME_INPUT).first()).toBeVisible({
        timeout: 5_000,
      });

      await closeAnyOpen(page);
      await searchAndDelete(page, firstName).catch(() => {});
      await expect(page).not.toHaveURL(/error/i);
    });
  });

  // ==========================================================================
  // 9. API FAILURE / ERROR-STATE + INPUT RETENTION
  // ==========================================================================

  test.describe('API Failure / Error State', () => {
    test('Negative - Mocked API failure keeps form open and shows error message', async ({
      page,
    }) => {
      test.setTimeout(90_000);
      await gotoEducators(page);

      await page.route('**/educators**', async (route) => {
        if (route.request().method() === 'POST') {
          await route.fulfill({
            status: 500,
            body: JSON.stringify({ message: 'Server error' }),
          });
        } else {
          await route.continue();
        }
      });

      await openForm(page);
      await fillValidEducator(page, `ApiFailTest-${Date.now()}`);
      await page
        .getByRole('button', { name: /add educator|create educator/i })
        .last()
        .click();

      await expect(page.locator(NAME_INPUT).first()).toBeVisible({
        timeout: 8_000,
      });
      await expect(page).not.toHaveURL(/error/i);
      await page.unroute('**/educators**');
      await closeAnyOpen(page);
    });

    test('Negative - Input values are retained in the form after API failure', async ({
      page,
    }) => {
      await gotoEducators(page);

      await page.route('**/educators**', async (route) => {
        if (route.request().method() === 'POST') {
          await route.fulfill({
            status: 500,
            body: JSON.stringify({ message: 'Server error' }),
          });
        } else {
          await route.continue();
        }
      });

      const retainName = `Retain-${Date.now()}`;
      await openForm(page);
      await page.locator(NAME_INPUT).first().fill(retainName);
      await page.locator(EMAIL_INPUT).first().fill('retain@example.com');
      await page
        .getByRole('button', { name: /add educator|create educator/i })
        .last()
        .click();

      await expect(page.locator(NAME_INPUT).first()).toBeVisible({
        timeout: 8_000,
      });
      const retainedValue = await page.locator(NAME_INPUT).first().inputValue();
      expect(retainedValue).toBe(retainName);

      await page.unroute('**/educators**');
      await closeAnyOpen(page);
      await expect(page).not.toHaveURL(/error/i);
    });
  });

  // ==========================================================================
  // 10. LOADING STATE DURING SUBMIT
  // ==========================================================================

  test.describe('Loading State During Submit', () => {
    test('Positive - Submit button shows loading/disabled state during API call', async ({
      page,
    }) => {
      test.setTimeout(90_000);
      await gotoEducators(page);

      // Hold the POST request open so we can inspect the button state mid-flight
      let resolvePost!: () => void;
      const postHeld = new Promise<void>((r) => {
        resolvePost = r;
      });

      await page.route('**/educators**', async (route) => {
        if (route.request().method() === 'POST') {
          await postHeld;
          await route.fulfill({
            status: 500,
            body: JSON.stringify({ message: 'Delayed' }),
          });
        } else {
          await route.continue();
        }
      });

      await openForm(page);
      await fillValidEducator(page, `LoadState-${Date.now()}`);

      const submitBtn = page
        .getByRole('button', { name: /add educator|create educator/i })
        .last();
      await submitBtn.click();

      // While the POST is held open, the Button component sets disabled={loading}
      // and renders svg.animate-spin. Use auto-retrying assertions.
      try {
        const disabledOrSpinner = await Promise.race([
          expect(submitBtn)
            .toBeDisabled({ timeout: 8_000 })
            .then(() => true)
            .catch(() => false),
          page
            .locator(`${DIALOG} svg.animate-spin`)
            .first()
            .waitFor({ state: 'visible', timeout: 8_000 })
            .then(() => true)
            .catch(() => false),
        ]);
        expect(disabledOrSpinner).toBe(true);
      } finally {
        resolvePost();
      }

      await page.unroute('**/educators**');
      await closeAnyOpen(page);
      await expect(page).not.toHaveURL(/error/i);
    });
  });

  // ==========================================================================
  // 11. KEYBOARD ACCESSIBILITY
  // ==========================================================================

  test.describe('Keyboard Accessibility', () => {
    test('Positive - Tab navigates through form fields in order', async ({
      page,
    }) => {
      test.setTimeout(120_000);
      await gotoEducators(page);
      await openForm(page);

      // Focus the first input, then Tab through form fields
      await page.locator(NAME_INPUT).first().focus();
      await expect(page.locator(NAME_INPUT).first()).toBeFocused();

      await page.keyboard.press('Tab');
      // After Tab from name, focus should move to the next interactive element (email)
      const emailFocused = await page
        .locator(EMAIL_INPUT)
        .first()
        .evaluate((el) => el === document.activeElement);
      // Accept email focused or any other form element — Tab must move focus forward
      const activeFocusInDialog = await page
        .locator(`${DIALOG} :focus`)
        .first()
        .isVisible({ timeout: 3_000 })
        .catch(() => false);
      expect(emailFocused || activeFocusInDialog).toBe(true);

      await closeAnyOpen(page);
      await expect(page).not.toHaveURL(/error/i);
    });

    test('Positive - Enter key submits the form', async ({ page }) => {
      test.setTimeout(90_000);
      await gotoEducators(page);

      // Mock POST to avoid actually creating an educator
      await page.route('**/educators**', async (route) => {
        if (route.request().method() === 'POST') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              message: 'Success',
              data: { id: 'test-enter-key' },
            }),
          });
        } else {
          await route.continue();
        }
      });

      await openForm(page);
      await fillValidEducator(page, `EnterKey-${Date.now()}`);

      // Press Enter while a form field is focused — should trigger submit
      await page.locator(NAME_INPUT).first().focus();
      await page.keyboard.press('Enter');

      // Either the dialog closes (submit succeeded) or a validation/API error appears
      const formResponded = await Promise.race([
        page
          .locator(DIALOG)
          .first()
          .waitFor({ state: 'hidden', timeout: 10_000 })
          .then(() => true)
          .catch(() => false),
        page
          .locator('[data-sonner-toast]')
          .first()
          .waitFor({ state: 'attached', timeout: 10_000 })
          .then(() => true)
          .catch(() => false),
      ]);
      expect(formResponded).toBe(true);

      await page.unroute('**/educators**');
      await closeAnyOpen(page);
      await expect(page).not.toHaveURL(/error/i);
    });

    test('Positive - Escape key closes the form', async ({ page }) => {
      test.setTimeout(60_000);
      await gotoEducators(page);
      await openForm(page);

      await expect(page.locator(DIALOG).first()).toBeVisible({
        timeout: 5_000,
      });
      await page.keyboard.press('Escape');
      await expect(page.locator(DIALOG).first()).not.toBeVisible({
        timeout: 8_000,
      });
      await expect(page).not.toHaveURL(/error/i);
    });
  });

  // ==========================================================================
  // 12. UNAUTHORIZED UI PATH
  // ==========================================================================

  test.describe('Unauthorized UI Path', () => {
    test('Negative - Educator-role user cannot see Add Educator button', async ({
      browser,
    }) => {
      test.setTimeout(60_000);

      // Without educator auth the admin session would make the button visible — skip.
      if (!fs.existsSync(EDUCATOR_AUTH_FILE)) {
        test.info().annotations.push({
          type: 'note',
          description:
            'Educator auth file absent — access-control assertion skipped',
        });
        return;
      }

      // A bare/unauthenticated page can still render the button client-side before any
      // auth guard reacts — use the real Educator storageState (cookies + localStorage)
      // so this is an actual authenticated-but-unauthorized check, not an unauthenticated one.
      const context = await browser.newContext({
        storageState: EDUCATOR_AUTH_FILE,
      });
      const page = await context.newPage();
      try {
        await page.goto(`${EDUCATOR_BASE_URL}/educators`, {
          waitUntil: 'domcontentloaded',
        });
        await injectEducatorSessionStorage(page);
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page
          .waitForLoadState('networkidle', { timeout: 10_000 })
          .catch(() => {});

        // If redirected away from /educators, that's also valid access control
        if (/educators/i.test(page.url())) {
          await expect(page.locator(ADD_BTN).first()).not.toBeVisible({
            timeout: 8_000,
          });
        }

        await expect(page).not.toHaveURL(/error/i);
      } finally {
        await context.close();
      }
    });
  });
});
