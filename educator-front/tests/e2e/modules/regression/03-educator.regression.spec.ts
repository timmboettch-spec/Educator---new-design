import { test, expect, Browser, BrowserContext, Page } from '@playwright/test';
import { EducatorPage } from '../../pages/EducatorPage';
import { ADMIN_AUTH_FILE, BASE_URL, injectAdminSessionStorage } from '../../common/setup/auth.setup';

test.describe.serial('Educator Management Regression', () => {
  let context: BrowserContext;
  let page: Page;
  let createdEducatorName = '';

  const dismissAnyOpenDialog = async (page: Page) => {
    const dialogs = page.locator('[role="dialog"]');
    if (await dialogs.count()) {
      await page.keyboard.press('Escape').catch(() => {});
      await dialogs.first().waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    }
  };

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    // Fresh isolated session — storageState from globalSetup has exhausted educator
    // seat quotas from accumulated test data; a fresh login avoids that stale state.
    context = await browser.newContext({ storageState: ADMIN_AUTH_FILE });
    page = await context.newPage();

    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded' });
    await injectAdminSessionStorage(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(2000);
    await Promise.any([
      page.locator('a[href="/educators"]').waitFor({ state: 'visible', timeout: 20000 }),
      page.locator('main, [role="main"]').waitFor({ state: 'visible', timeout: 20000 }),
      page.getByRole('heading', { name: /dashboard/i }).waitFor({ state: 'visible', timeout: 20000 })
    ]);

    await dismissAnyOpenDialog(page);

    // Delete accumulated test educators via the proper UI flow to free the AI seat pool.
    try {
      const educatorPage = new EducatorPage(page);
      await educatorPage.navigateToEducators();
      await page.waitForLoadState('networkidle').catch(() => {});

      // Try up to 50 deletions — more than 20 may have accumulated across failed runs
      for (let i = 0; i < 50; i++) {
        // Find any educator row whose name starts with 'Educator'
        const row = page.locator('div[class*="grid"], div[class*="rounded"], tr')
          .filter({ hasText: /^Educator[-\s]/i }).first();

        if (!await row.isVisible({ timeout: 3000 }).catch(() => false)) break;

        const nameEl = row.locator('td, p, div').filter({ hasText: /^Educator[-\s]/i }).first();
        const name = (await nameEl.textContent().catch(() => ''))?.match(/Educator[-\s]\S+/)?.[0] ?? '';
        if (!name) break;

        try {
          await educatorPage.deleteEducator(name);
          await page.waitForTimeout(500);
        } catch {
          // Continue past individual delete failures — other educators may still be deletable
          await page.waitForTimeout(500);
        }
      }

      // Navigate back to dashboard after cleanup
      await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle').catch(() => {});
    } catch {
      // Non-fatal: proceed even if cleanup fails
    }
  });

  test.afterAll(async () => {
    await context.close();
  });

  test('Positive - Should create an educator successfully', async () => {
    const educator = new EducatorPage(page);
    createdEducatorName = `Educator-${Date.now()}`;
    const result = await educator.createEducatorWithName(createdEducatorName);
    createdEducatorName = result.educatorName;
    await educator.assertEducatorVisible(createdEducatorName);
    await expect(page).not.toHaveURL(/error/i);
  });

  test('Positive - Should view created educator details', async () => {
    const educator = new EducatorPage(page);
    await educator.viewEducator(createdEducatorName);
    await educator.assertEducatorVisible(createdEducatorName);
    await expect(page).not.toHaveURL(/error/i);
  });

  test('Positive - Should update educator successfully', async () => {
    const educator = new EducatorPage(page);
    const updatedName = `${createdEducatorName}-Updated`;
    await educator.updateEducatorName(createdEducatorName, updatedName);
    await educator.assertEducatorVisible(updatedName);
    createdEducatorName = updatedName;
    await expect(page).not.toHaveURL(/error/i);
  });

  test('Positive - Should delete educator successfully', async () => {
    const educator = new EducatorPage(page);
    await educator.deleteEducator(createdEducatorName);
    await educator.assertEducatorNotVisible(createdEducatorName);
    await expect(page).not.toHaveURL(/error/i);
  });

  test('Positive - Should navigate to educators page from active session', async () => {
    const educator = new EducatorPage(page);
    await educator.navigateToEducators();
    await expect(page).toHaveURL(/educators/i);
    await expect(page).not.toHaveURL(/error/i);
  });

  test('Negative - Should keep update form open when educator name is cleared', async () => {
    const educator = new EducatorPage(page);
    const tempName = `Educator-Temp-${Date.now()}`;
    const { educatorName: actualTempName } = await educator.createEducatorWithName(tempName);
    await educator.submitEducatorEditEmptyNameValidation(actualTempName);
    await educator.closeEducatorFormIfOpen();
    await educator.deleteEducator(actualTempName);
    await expect(page).not.toHaveURL(/error/i);
  });
});
