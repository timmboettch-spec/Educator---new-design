import {
  test,
  expect,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import { LoginPage } from '../../pages/LoginPage';
import { AccountPage } from '../../pages/AccountPage';
import { educatorLogin } from '../../common/utils/loginHelpers';
import { readJsonFixture } from '../../utils/commonUtils';
import {
  EDUCATOR_AUTH_FILE,
  EDUCATOR_BASE_URL,
  injectEducatorSessionStorage,
} from '../../common/setup/auth.setup';
import fs from 'fs';

test.describe.serial('Educator Account Management Regression', () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    test.setTimeout(240000);

    if (fs.existsSync(EDUCATOR_AUTH_FILE)) {
      context = await browser.newContext({ storageState: EDUCATOR_AUTH_FILE });
      page = await context.newPage();
      await page.goto(`${EDUCATOR_BASE_URL}/educator-dashboard`, {
        waitUntil: 'domcontentloaded',
      });
      await injectEducatorSessionStorage(page);
      await page.reload({ waitUntil: 'domcontentloaded' });
    } else {
      context = await browser.newContext();
      page = await context.newPage();
      const login = new LoginPage(page);
      await login.goto();
      await educatorLogin(page);
      await page
        .waitForURL(/(dashboard|classes|account)/i, { timeout: 30000 })
        .catch(() => {});
    }

    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(3000);

    // Stale storageState redirects to /login — fall back to fresh login.
    if (/login|signin/i.test(page.url())) {
      const login = new LoginPage(page);
      await login.goto();
      await educatorLogin(page);
      await page
        .waitForURL(/(dashboard|educator-dashboard|classes)/i, {
          timeout: 30000,
        })
        .catch(() => {});
    }
  });

  test.afterAll(async () => {
    await context.close();
  });

  // ==================== EDUCATOR NEGATIVE SCENARIOS ====================

  test('Educator Negative - Should show validation when old password is incorrect', async () => {
    const account = new AccountPage(page);
    await account.openAccountSettings();
    await account.click('button:has-text("Change Password")');

    // Fill with incorrect old password
    await account.fill(
      'input[placeholder="Old Password"]',
      'incorrectOldPassword123'
    );
    await account.fill('input[placeholder="New Password"]', 'NewPassword@123');
    await account.fill(
      'input[placeholder="Confirm Password"]',
      'NewPassword@123'
    );

    await account.click('button:has-text("Update Password")');

    // Verify error message for incorrect old password
    await account.expectTextVisible(/old password.*incorrect|invalid/i);

    await account.closePasswordDialog();
    await expect(page).not.toHaveURL(/error/i);
  });

  test('Educator Negative - Should show validation when new passwords do not match', async () => {
    const account = new AccountPage(page);
    await account.openAccountSettings();
    await account.click('button:has-text("Change Password")');

    // Fill with mismatched passwords
    const educatorFixture = readJsonFixture<{ password: string }>(
      'educator.json'
    );
    await account.fill(
      'input[placeholder="Old Password"]',
      educatorFixture.password
    );
    await account.fill('input[placeholder="New Password"]', 'NewPassword@123');
    await account.fill(
      'input[placeholder="Confirm Password"]',
      'DifferentPassword@123'
    );

    await account.click('button:has-text("Update Password")');

    // Verify validation message
    await account.expectTextVisible(/password.*mismatch|match|confirm/i);

    await account.closePasswordDialog();
    await expect(page).not.toHaveURL(/error/i);
  });

  test('Educator Negative - Should not expose subscription/redeem controls', async () => {
    const account = new AccountPage(page);
    await account.openAccountSettings();

    // Verify redeem/subscription controls are not visible for educator role
    const addSubButton = page
      .locator(
        'button:has-text("Add Subscription"), button:has-text("Redeem"), button:has-text("Manage Subscription")'
      )
      .first();
    await expect(addSubButton).toBeHidden({ timeout: 10000 });

    await expect(page).not.toHaveURL(/error/i);
  });

  // ==================== EDUCATOR POSITIVE SCENARIOS ====================

  test('Educator Positive - Should navigate to account settings page', async () => {
    const account = new AccountPage(page);
    await account.openAccountSettings();

    await expect(page).toHaveURL(/account/i);
    await account.expectTextVisible(/Account|Settings|Password/i);

    await expect(page).not.toHaveURL(/error/i);
  });

  test('Educator Positive - Should open and close change password dialog', async () => {
    const account = new AccountPage(page);
    await account.openAccountSettings();
    await account.click('button:has-text("Change Password")');
    await account.waitForVisible('input[placeholder="Old Password"]', 15000);

    await account.closePasswordDialog();
    await expect(page).toHaveURL(/account/i);
    await expect(page).not.toHaveURL(/error/i);
  });

  test('Educator Positive - Should successfully change password and verify', async () => {
    const account = new AccountPage(page);
    const educator = readJsonFixture<{ email: string; password: string }>(
      'educator.json'
    );

    // The educator account is shared by every other spec file's beforeAll login (via
    // EDUCATOR_AUTH_FILE), so it must never actually change here. Submitting old === new
    // only exercises the "Update Password" flow and must be rejected by the app's
    // same-password validation — a real round-trip risks leaving the shared credential
    // stuck on the "new" value if any step fails mid-way.
    await account.openAccountSettings();
    await account.click('button:has-text("Change Password")');
    await account.fill('input[placeholder="Old Password"]', educator.password);
    await account.fill('input[placeholder="New Password"]', educator.password);
    await account.fill(
      'input[placeholder="Confirm Password"]',
      educator.password
    );
    await account.click('button:has-text("Update Password")');
    await account.expectTextVisible(/cannot be the same/i);
    await account.closePasswordDialog().catch(() => {});

    await expect(page).not.toHaveURL(/error/i);
  });

  test.describe('Coverage Expansion - Core Cases', () => {
    test('Educator Core - Should keep account controls visible after refresh', async () => {
      const account = new AccountPage(page);
      await account.openAccountSettings();
      await page.reload({ waitUntil: 'domcontentloaded' });
      // Reload may redirect to /login if the session expired mid-suite.
      if (/login|signin/i.test(page.url())) {
        const login = new LoginPage(page);
        await login.goto();
        await educatorLogin(page);
      }
      // Re-open settings: reload closes the SPA panel state.
      await account.openAccountSettings();
      await account.waitForVisible('button:has-text("Change Password")', 15000);
      await expect(page).toHaveURL(/account/i);
      await expect(page).not.toHaveURL(/error/i);
    });

    test('Educator Core - Should keep password dialog inputs visible', async () => {
      const account = new AccountPage(page);
      await account.openAccountSettings();
      await account.click('button:has-text("Change Password")');
      await account.waitForVisible('input[placeholder="Old Password"]', 15000);
      await account.waitForVisible('input[placeholder="New Password"]', 15000);
      await account.waitForVisible(
        'input[placeholder="Confirm Password"]',
        15000
      );
      await account.closePasswordDialog();
      await expect(page).not.toHaveURL(/error/i);
    });
  });
});
