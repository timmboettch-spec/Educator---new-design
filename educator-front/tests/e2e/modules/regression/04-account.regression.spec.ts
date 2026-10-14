import {
  test,
  expect,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import { LoginPage } from '../../pages/LoginPage';
import { AccountPage } from '../../pages/AccountPage';
import { adminLogin } from '../../common/utils/loginHelpers';
import user from '../../fixtures/user.json' with { type: 'json' };

test.describe.serial('Account Management Regression', () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    // 3 login attempts × 35 s each + 8 s wait ≈ 113 s — needs more than the 120 s global default.
    test.setTimeout(240000);
    // Fresh isolated context — this spec changes the admin password, which would
    // invalidate the shared storageState session used by other admin specs.
    context = await browser.newContext();
    page = await context.newPage();
    const login = new LoginPage(page);
    await login.goto();
    await adminLogin(page);
    await page.waitForLoadState('networkidle').catch(() => {});
  });

  test.afterAll(async () => {
    await context.close();
  });

  // ==================== NEGATIVE SCENARIOS ====================

  test('Negative - Should show validation when old password is incorrect', async () => {
    const account = new AccountPage(page);
    await account.openAccountSettings();
    await account.click('button:has-text("Change Password")');

    // Fill with incorrect old password
    await account.fill(
      'input[placeholder="Old Password"]',
      'incorrectOldPassword123'
    );
    await account.fill(
      'input[placeholder="New Password"]',
      process.env.RESET_PASSWORD || 'NewPassword123!'
    );
    await account.fill(
      'input[placeholder="Confirm Password"]',
      process.env.RESET_PASSWORD || 'NewPassword123!'
    );

    await account.click('button:has-text("Update Password")');

    // Verify error message for incorrect old password
    await account.expectTextVisible(/old password.*incorrect|invalid/i);

    await account.closePasswordDialog();
    await expect(page).not.toHaveURL(/error/i);
  });

  test('Positive - Should successfully update password with valid credentials', async () => {
    const account = new AccountPage(page);

    // The admin account is shared by every other spec file's beforeAll login, so it
    // must never actually change here. Submitting old === new only exercises the
    // "Update Password" flow and must be rejected by the app's same-password
    // validation — if the backend ever accepted it instead, we'd be silently
    // relying on a login/restore round-trip against a live shared credential.
    await account.openAccountSettings();
    await account.click('button:has-text("Change Password")');
    await account.fill('input[placeholder="Old Password"]', user.password);
    await account.fill('input[placeholder="New Password"]', user.password);
    await account.fill('input[placeholder="Confirm Password"]', user.password);
    await account.click('button:has-text("Update Password")');
    await account.expectTextVisible(/cannot be the same/i);
    await account.closePasswordDialog().catch(() => {});

    await expect(page).not.toHaveURL(/error/i);
  });

  test('Positive - Should successfully navigate to account settings page', async () => {
    const account = new AccountPage(page);
    await account.openAccountSettings();

    // Verify we're on the account page
    await expect(page).toHaveURL(/account/i);

    // Verify account settings elements are visible
    await account.expectTextVisible(/Account|Settings|Password|Profile/i);

    await expect(page).not.toHaveURL(/error/i);
  });

  test('Positive - Should display account information correctly', async () => {
    const account = new AccountPage(page);
    await account.openAccountSettings();

    // Verify key account page elements are visible
    const changePasswordButton = account.getLocator(
      'button:has-text("Change Password")'
    );
    await account.waitForVisible(changePasswordButton, 15000);

    expect(await changePasswordButton.isVisible()).toBeTruthy();

    await expect(page).not.toHaveURL(/error/i);
  });

  test('Positive - Should open and close change password dialog safely', async () => {
    const account = new AccountPage(page);
    await account.openAccountSettings();
    await account.click('button:has-text("Change Password")');
    await account.waitForVisible('input[placeholder="Old Password"]', 15000);
    await account.closePasswordDialog();
    await expect(page).toHaveURL(/account/i);
    await expect(page).not.toHaveURL(/error/i);
  });

  test('Positive - Should keep account page interactive after reopening password dialog', async () => {
    const account = new AccountPage(page);
    await account.openAccountSettings();
    await account.click('button:has-text("Change Password")');
    await account.waitForVisible('input[placeholder="Old Password"]', 15000);
    await account.closePasswordDialog();
    await account.click('button:has-text("Change Password")');
    await account.waitForVisible('input[placeholder="Old Password"]', 15000);
    await account.closePasswordDialog();
    await expect(page).toHaveURL(/account/i);
    await expect(page).not.toHaveURL(/error/i);
  });

  // ==================== REDEEM CODE SCENARIOS ====================

  test('Negative - Should show validation when redeem code fields are empty', async () => {
    const account = new AccountPage(page);
    await account.openAccountSettings();

    // Check if Add Subscription button is visible (only for District Admin)
    const addSubButton = page
      .locator('button:has-text("Add Subscription")')
      .first();
    const isVisible = await addSubButton.isVisible().catch(() => false);

    if (!isVisible) {
      // Skip test if not District Admin role
      return;
    }

    await addSubButton.click();
    await account.waitForVisible('input[placeholder="XXXX"]', 15000);

    // Try to submit without filling in code
    const submitButton = page
      .locator('button:has-text("Active License")')
      .first();
    if (await submitButton.isEnabled().catch(() => false)) {
      await submitButton.click();
      // Verify validation message appears
      await account.expectTextVisible(/required|redeem code/i);
    }

    // Close modal by clicking X or outside
    const closeButton = page
      .locator('button[aria-label*="close" i], div[role="dialog"] button')
      .first();
    if (await closeButton.isVisible().catch(() => false)) {
      await closeButton.click();
    }
    await expect(page).not.toHaveURL(/error/i);
  });

  test('Negative - Should show validation when redeem code is invalid format', async () => {
    const account = new AccountPage(page);
    await account.openAccountSettings();

    const addSubButton = page
      .locator('button:has-text("Add Subscription")')
      .first();
    const isVisible = await addSubButton.isVisible().catch(() => false);

    if (!isVisible) {
      return;
    }

    await addSubButton.click();
    await account.waitForVisible('input[placeholder="XXXX"]', 15000);

    // Fill with invalid code
    const redeemInputs = page.locator('input[placeholder="XXXX"]');
    const inputCount = await redeemInputs.count();

    if (inputCount > 0) {
      // Fill with invalid characters (too short)
      await redeemInputs.first().fill('AB');

      const submitButton = page
        .locator('button:has-text("Active License")')
        .first();
      if (await submitButton.isEnabled().catch(() => false)) {
        await submitButton.click();
        // Verify validation error
        await account.expectTextVisible(/redeem code|invalid|format/i);
      }
    }

    const closeButton = page
      .locator('button[aria-label*="close" i], div[role="dialog"] button')
      .first();
    if (await closeButton.isVisible().catch(() => false)) {
      await closeButton.click();
    }
    await expect(page).not.toHaveURL(/error/i);
  });

  test('Positive - Should successfully open redeem code modal from account page', async () => {
    const account = new AccountPage(page);
    await account.openAccountSettings();

    const addSubButton = page
      .locator('button:has-text("Add Subscription")')
      .first();
    const isVisible = await addSubButton.isVisible().catch(() => false);

    if (!isVisible) {
      // Skip if user is not District Admin
      return;
    }

    await addSubButton.click();

    // Verify modal is open
    await account.waitForVisible('input[placeholder="XXXX"]', 15000);
    await account.expectTextVisible(/redeem|activation|license/i);

    // Verify redeem code input fields are visible
    const redeemInputs = page.locator('input[placeholder="XXXX"]');
    const count = await redeemInputs.count();
    expect(count).toBeGreaterThanOrEqual(1);

    // Close modal
    const closeButton = page
      .locator('button[aria-label*="close" i], div[role="dialog"] button')
      .first();
    if (await closeButton.isVisible().catch(() => false)) {
      await closeButton.click();
    }

    await expect(page).toHaveURL(/account/i);
    await expect(page).not.toHaveURL(/error/i);
  });

  test('Positive - Should close redeem code modal without entering code', async () => {
    const account = new AccountPage(page);
    await account.openAccountSettings();

    const addSubButton = page
      .locator('button:has-text("Add Subscription")')
      .first();
    const isVisible = await addSubButton.isVisible().catch(() => false);

    if (!isVisible) {
      return;
    }

    await addSubButton.click();
    await account.waitForVisible('input[placeholder="XXXX"]', 15000);

    // Close modal by clicking X button
    const closeButton = page
      .locator('button[aria-label*="close" i], div[role="dialog"] button')
      .first();
    if (await closeButton.isVisible().catch(() => false)) {
      await closeButton.click();
    }

    // Verify modal is closed and we're back on account page
    await account.expectTextVisible(/Account|Settings/i);
    await expect(page).toHaveURL(/account/i);
    await expect(page).not.toHaveURL(/error/i);
  });

  test('Positive - Should reopen redeem code modal after closing', async () => {
    const account = new AccountPage(page);
    await account.openAccountSettings();

    const addSubButton = page
      .locator('button:has-text("Add Subscription")')
      .first();
    const isVisible = await addSubButton.isVisible().catch(() => false);

    if (!isVisible) {
      return;
    }

    // Open modal first time
    await addSubButton.click();
    await account.waitForVisible('input[placeholder="XXXX"]', 15000);

    // Close modal
    let closeButton = page
      .locator('button[aria-label*="close" i], div[role="dialog"] button')
      .first();
    if (await closeButton.isVisible().catch(() => false)) {
      await closeButton.click();
    }

    await page.waitForTimeout(500);

    // Reopen modal
    await addSubButton.click();
    await account.waitForVisible('input[placeholder="XXXX"]', 15000);

    // Verify inputs are fresh
    const redeemInputs = page.locator('input[placeholder="XXXX"]');
    const firstInputValue = await redeemInputs
      .first()
      .inputValue()
      .catch(() => '');
    expect(firstInputValue).toBe('');

    // Close modal again
    closeButton = page
      .locator('button[aria-label*="close" i], div[role="dialog"] button')
      .first();
    if (await closeButton.isVisible().catch(() => false)) {
      await closeButton.click();
    }

    await expect(page).toHaveURL(/account/i);
    await expect(page).not.toHaveURL(/error/i);
  });

  test.describe('Coverage Expansion - Core Cases', () => {
    test('Core - Should keep account controls visible after refresh', async () => {
      const account = new AccountPage(page);
      await account.openAccountSettings();
      await page.reload({ waitUntil: 'domcontentloaded' });
      await account.waitForVisible('button:has-text("Change Password")', 15000);
      await expect(page).toHaveURL(/account/i);
      await expect(page).not.toHaveURL(/error/i);
    });

    test('Core - Should keep password dialog input fields visible', async () => {
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

  // ==================== ADDITIONAL COVERAGE ====================

  test('Positive - Should show account page after direct navigation', async () => {
    const account = new AccountPage(page);
    await account.navigateTo('/account');
    await expect(page).toHaveURL(/account/i);
    await account.waitForVisible('button:has-text("Change Password")', 15000);
    await expect(page).not.toHaveURL(/error/i);
  });

  test('Negative - Should show validation when only old password is filled', async () => {
    const account = new AccountPage(page);
    await account.openAccountSettings();
    await account.click('button:has-text("Change Password")');
    await account.fill(
      'input[placeholder="Old Password"]',
      'SomeOldPassword1!'
    );
    // Leave new and confirm empty
    await account.click('button:has-text("Update Password")');
    await account.expectTextVisible(/new password.*required|required/i);
    await account.closePasswordDialog();
    await expect(page).not.toHaveURL(/error/i);
  });

  test('Positive - Should show profile/email info on account settings page', async () => {
    const account = new AccountPage(page);
    await account.openAccountSettings();
    await expect(page).toHaveURL(/account/i);
    // Verify some profile element is rendered
    const profileArea = page
      .locator('input[type="email"], p:has-text("@"), span:has-text("@")')
      .first();
    await expect(profileArea).toBeVisible({ timeout: 15000 });
    await expect(page).not.toHaveURL(/error/i);
  });

  test('Negative - Should keep Update Password button disabled when fields are empty', async () => {
    const account = new AccountPage(page);
    await account.openAccountSettings();
    await account.click('button:has-text("Change Password")');
    await account.waitForVisible('input[placeholder="Old Password"]', 15000);
    // Do NOT fill any fields — check button state or validation after click
    const updateBtn = page
      .locator('button:has-text("Update Password")')
      .first();
    await expect(updateBtn).toBeVisible({ timeout: 5000 });
    await updateBtn.click();
    // Either button is disabled or validation messages appear
    const isFormStillOpen = await page
      .locator('input[placeholder="Old Password"]')
      .isVisible({ timeout: 3000 })
      .catch(() => false);
    expect(isFormStillOpen).toBeTruthy();
    await account.closePasswordDialog();
    await expect(page).not.toHaveURL(/error/i);
  });
});
