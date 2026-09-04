import { test, expect, Browser, BrowserContext, Page } from '@playwright/test';
import { ClassPage } from '../../pages/ClassPage';
import { LoginPage } from '../../pages/LoginPage';
import { educatorLogin } from '../../common/utils/loginHelpers';
import { EDUCATOR_AUTH_FILE, EDUCATOR_BASE_URL, injectEducatorSessionStorage } from '../../common/setup/auth.setup';
import fs from 'fs';

test.describe.serial('Class Management Regression', () => {
  let context: BrowserContext;
  let page: Page;

  const resetToClassesPage = async (page: Page) => {
    // Dismiss any open drawer/modal from previous test.
    await page.keyboard.press('Escape').catch(() => {});
    const backButton = page.locator('button:has-text("Back")').first();
    if (await backButton.isVisible().catch(() => false)) {
      await backButton.click().catch(() => {});
    }

    // Keep all cases on the same classes URL/session.
    if (!/classes/i.test(page.url())) {
      await page.goto(`${process.env.BASE_URL!}/classes`, { waitUntil: 'domcontentloaded' });
    }

    // Wait for button to be attached first, then visible
    await page.waitForTimeout(500);
    await page.locator('button:has-text("Add Class")').first().waitFor({ state: 'attached', timeout: 10000 }).catch(() => {});
    await page.locator('button:has-text("Add Class")').first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {
      // If not visible, try scrolling into view instead of failing
      return page.locator('button:has-text("Add Class")').first().scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
    });
  };

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    test.setTimeout(240000);

    if (fs.existsSync(EDUCATOR_AUTH_FILE)) {
      context = await browser.newContext({ storageState: EDUCATOR_AUTH_FILE });
      page = await context.newPage();
      await page.goto(`${EDUCATOR_BASE_URL}/classes`, { waitUntil: 'domcontentloaded' });
      await injectEducatorSessionStorage(page);
      await page.reload({ waitUntil: 'domcontentloaded' });
    } else {
      context = await browser.newContext();
      page = await context.newPage();
      const login = new LoginPage(page);
      await login.goto();
      await educatorLogin(page);
      await page.waitForURL(/(dashboard|classes)/i, { timeout: 30000 }).catch(() => {});
    }

    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(2000);

    // Stale storageState redirects to /login — fall back to fresh login.
    if (/login|signin/i.test(page.url())) {
      const login = new LoginPage(page);
      await login.goto();
      await educatorLogin(page);
      await page.waitForURL(/(dashboard|classes)/i, { timeout: 30000 }).catch(() => {});
    }

    // Wait for Add Class button to confirm the classes page is fully loaded
    await page.locator('button:has-text("Add Class")').first().waitFor({ state: 'visible', timeout: 30000 }).catch(() => {});
  });

  test.afterEach(async () => {
    await resetToClassesPage(page);
  });

  test.afterAll(async () => {
    await context.close();
  });
  
  // ==================== CLASS POSITIVE SCENARIOS ====================
  test.describe('Class - Positive Cases', () => {
    test('Positive - Should create a class successfully', async () => {
      test.setTimeout(180000);
      const classPage = new ClassPage(page);
      await classPage.createClassPositive();
      await expect(page).not.toHaveURL(/error/i);
    });
  });

});
