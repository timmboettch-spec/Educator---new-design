import { test, expect, Browser, BrowserContext, Page } from '@playwright/test';
import { EducatorPage } from '../../pages/EducatorPage';
import { adminLogin } from '../../common/utils/loginHelpers';
import { ADMIN_AUTH_FILE, BASE_URL, injectAdminSessionStorage } from '../../common/setup/auth.setup';
import { LoginPage } from '../../pages/LoginPage';
import fs from 'fs';

test.describe.serial('Educator Smoke', () => {
  let context: BrowserContext;
  let page: Page;
  let createdName = '';

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
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
    await page.waitForTimeout(1500);
  });

  test.afterAll(async () => {
    try {
      if (createdName) {
        const educator = new EducatorPage(page);
        await educator.navigateToEducators();
        await educator.deleteEducator(createdName).catch(() => {});
      }
    } catch { /* non-fatal */ }
    await context.close();
  });

  test('Positive - Add Educator button is visible on educators page', async () => {
    const educator = new EducatorPage(page);
    await educator.navigateToEducators();
    await expect(
      page.locator('button:has-text("Add Educator"), button:has-text("Create Educator")').first()
    ).toBeVisible({ timeout: 15_000 });
    await expect(page).not.toHaveURL(/error/i);
    const sc = await page.screenshot({ fullPage: true }).catch(() => null);
    if (sc) await test.info().attach('final-state', { body: sc, contentType: 'image/png' });
  });

  test('Positive - Create Educator form opens with all key fields visible', async () => {
    await page.locator('button:has-text("Add Educator"), button:has-text("Create Educator")').first().click();
    await expect(page.locator('input[name="full_name"]').first()).toBeVisible({ timeout: 12_000 });
    await expect(page.locator('input[name="email"], input[type="email"]').first()).toBeVisible();
    const sc = await page.screenshot({ fullPage: true }).catch(() => null);
    if (sc) await test.info().attach('final-state', { body: sc, contentType: 'image/png' });
    await page.keyboard.press('Escape');
    await page.locator('input[name="full_name"]').first()
      .waitFor({ state: 'hidden', timeout: 6_000 }).catch(() => {});
    await expect(page).not.toHaveURL(/error/i);
  });

  test('Positive - Educator is created successfully and appears in the list', async () => {
    const educator = new EducatorPage(page);
    await educator.navigateToEducators();
    createdName = `Smoke-${Date.now()}`;
    const { educatorName } = await educator.createEducatorWithName(createdName);
    createdName = educatorName;
    await educator.assertEducatorVisible(createdName);
    const sc = await page.screenshot({ fullPage: true }).catch(() => null);
    if (sc) await test.info().attach('final-state', { body: sc, contentType: 'image/png' });
    await expect(page).not.toHaveURL(/error/i);
  });
});
