import { expect, Page } from '@playwright/test';
import { accountLocators } from '../locators/accountLocators';
import { commonLocators } from '../locators/commonLocators';
import { BasePage } from './base/BasePage';
import { logout } from '../auth/logout';
import { readJsonFixture } from '../utils/commonUtils';
import educatorUser from '../fixtures/educator.json' with { type: 'json' };

export class AccountPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async openAccountSettings(): Promise<void> {
    try {
      await this.clickAndWaitForUrl(accountLocators.accountLink, /account/i, 30000);
    } catch {
      await this.navigateTo('/account');
      await this.waitForLoadState('load');
    }
  }

  async closePasswordDialog(): Promise<void> {
    try {
      // Try clicking the X close button first
      const closeButton = this.page.locator('button[aria-label="Close"], button:has(svg.lucide-x)').first();
      if (await closeButton.isVisible().catch(() => false)) {
        await closeButton.click({ timeout: 5000 });
        return;
      }

      // Fallback: try Cancel button
      const cancelButton = this.page.locator('button:has-text("Cancel")').first();
      if (await cancelButton.isVisible().catch(() => false)) {
        await cancelButton.click({ timeout: 5000 });
        return;
      }

      // Fallback: press Escape key
      await this.page.keyboard.press('Escape').catch(() => {});
    } catch {
      // Silently continue
    }

    // Wait for dialog to close
    await this.page.waitForTimeout(300);
  }

  async closeRedeemDialog(): Promise<void> {
    try {
      // Try clicking the X close button in the top right
      const closeButton = this.page.locator('[role="dialog"] button[aria-label="Close"], [role="dialog"] button:has(svg.lucide-x)').first();
      if (await closeButton.isVisible().catch(() => false)) {
        await closeButton.click({ timeout: 5000 });
        await this.page.waitForTimeout(500);
        return;
      }

      // Fallback: press Escape key
      await this.page.keyboard.press('Escape').catch(() => {});
      await this.page.waitForTimeout(500);
    } catch {
      // Silently continue
    }

    // Additional wait to ensure dialog is closed
    await this.page.waitForTimeout(300);
  }

  async activateSubscription(): Promise<void> {
    await this.waitForUrl(/dashboard/i, 30000);
    await this.openAccountSettings();
    await this.waitForLoadState('load');
    // click add subscription
    await this.page.waitForTimeout(2000);
    
    const addSubButton = this.page.locator(accountLocators.addSubscriptionButton).first();
    const isSubscriptionActive = !(await addSubButton.isVisible({ timeout: 5000 }).catch(() => false));

    if (!isSubscriptionActive) {
      // Subscription not active, activate it
      await addSubButton.waitFor({ state: 'visible', timeout: 15000 });
      await this.click(accountLocators.addSubscriptionButton);

      const redeemCode = educatorUser.redeemCode;
      if (!redeemCode) {
        throw new Error('Missing redeemCode in educator fixture.');
      }

      const redeemInputs = this.page.locator(accountLocators.redeemCodeInput);
      await redeemInputs.first().waitFor({ state: 'visible', timeout: 15000 });

      const codeParts = redeemCode.match(/.{1,4}/g) || [redeemCode];
      const inputCount = await redeemInputs.count();

      if (inputCount > 1) {
        for (let i = 0; i < Math.min(codeParts.length, inputCount); i++) {
          await redeemInputs.nth(i).fill(codeParts[i]);
        }
      } else {
        await redeemInputs.first().fill(redeemCode);
      }

      // Click activate button
      await this.page.waitForTimeout(2000);
      await this.page
        .getByRole('dialog')
        .getByRole('button', { name: /Active License/i })
        .click();

      await this.page.waitForLoadState('networkidle');

      // MANDATORY: Validate success toast appears after activation -- License Activated successfully
      const toastMessage = this.page.locator('text=/License.*activated/i').first();
      await expect(toastMessage).toBeVisible({ timeout: 20000 });
    }

    await this.waitForLoadState('load');
  }

  async accountSettingsForAdmin(): Promise<void> {
    await this.waitForUrl(/dashboard/i, 30000);
    await this.openAccountSettings();
    await this.waitForLoadState('load');
    await this.click(accountLocators.changePasswordButton);
    await this.click(accountLocators.updatePasswordButton);

    await this.expectTextVisible('Old password is required');
    await this.expectTextVisible('New password is required');
    await this.expectTextVisible('Confirm password is required');

    await this.fill(accountLocators.oldPasswordInput, 'incorrectoldpassword');
    await this.fill(accountLocators.newPasswordInput, process.env.RESET_PASSWORD!);
    await this.fill(accountLocators.confirmPasswordInput, process.env.RESET_PASSWORD!);
    await this.click(accountLocators.updatePasswordButton);
    await this.expectTextVisible('Old password is incorrect');

    await this.page.reload();
    await this.waitForLoadState('load');
    await this.click(accountLocators.changePasswordButton);

    await this.fill(accountLocators.oldPasswordInput, process.env.PASSWORD!);
    await this.fill(accountLocators.newPasswordInput, process.env.PASSWORD!);
    await this.fill(accountLocators.confirmPasswordInput, process.env.PASSWORD!);
    await this.click(accountLocators.updatePasswordButton);
    await this.expectTextVisible('Old password and new password cannot be the same');

    await this.page.reload();
    await this.waitForLoadState('load');
    await this.click(accountLocators.changePasswordButton);

    await this.fill(accountLocators.oldPasswordInput, process.env.PASSWORD!);
    await this.fill(accountLocators.newPasswordInput, process.env.RESET_PASSWORD!);
    await this.fill(accountLocators.confirmPasswordInput, 'invalidconfirmpassword');
    await this.click(accountLocators.updatePasswordButton);
    await this.page.waitForTimeout(2000);
    await this.expectTextVisible('New password and confirm password do not match');

    await this.page.reload();
    await this.waitForLoadState('load');
    await this.click(accountLocators.changePasswordButton);

    await this.fill(accountLocators.oldPasswordInput, process.env.PASSWORD!);
    await this.fill(accountLocators.newPasswordInput, process.env.RESET_PASSWORD!);
    await this.fill(accountLocators.confirmPasswordInput, process.env.RESET_PASSWORD!);
    await this.click(accountLocators.updatePasswordButton);
    await this.expectTextVisible(accountLocators.passwordChangedMessage);
    await this.waitForLoadState('networkidle');

    await logout(this.page);

    await this.waitForVisible(commonLocators.emailInput, 15000);

// LOGIN AGAIN WITH RESET PASSWORD

const user = readJsonFixture<{ email: string; password: string }>('user.json');

await this.fill(commonLocators.emailInput, user.email);

await this.fill(
  commonLocators.passwordInput,
  process.env.RESET_PASSWORD!
);

await this.click(commonLocators.signInButton);

// WAIT FOR DASHBOARD

await this.waitForUrl(/(dashboard|classes)/i, 30000);

await this.waitForLoadState('networkidle');

// VALIDATE ACCOUNT LINK VISIBLE

await expect(
  this.page.locator(accountLocators.accountLink)
).toBeVisible({
  timeout: 15000
});

// OPEN ACCOUNT SETTINGS

await this.openAccountSettings();

await this.waitForLoadState('load');

// CHANGE PASSWORD BACK TO ORIGINAL

await this.click(accountLocators.changePasswordButton);

await this.fill(
  accountLocators.oldPasswordInput,
  process.env.RESET_PASSWORD!
);

await this.fill(
  accountLocators.newPasswordInput,
  process.env.PASSWORD!
);

await this.fill(
  accountLocators.confirmPasswordInput,
  process.env.PASSWORD!
);

await this.click(accountLocators.updatePasswordButton);

// VALIDATE PASSWORD UPDATED

await this.expectTextVisible(
  accountLocators.passwordChangedMessage
);

// LOGOUT

await logout(this.page);
  }

  async accountSettingsForEducator(): Promise<void> {
    await this.waitForUrl(/dashboard/i, 30000);
    await this.openAccountSettings();
    await this.waitForLoadState('load');
    await this.click(accountLocators.changePasswordButton);
    await this.click(accountLocators.updatePasswordButton);

    await this.expectTextVisible('Old password is required');
    await this.expectTextVisible('New password is required');
    await this.expectTextVisible('Confirm password is required');
    await this.fill(accountLocators.oldPasswordInput, 'incorrectoldpassword');
    await this.fill(accountLocators.newPasswordInput, process.env.RESET_PASSWORD!);
    await this.fill(accountLocators.confirmPasswordInput, process.env.RESET_PASSWORD!);
    await this.click(accountLocators.updatePasswordButton);
    await this.expectTextVisible('Old password is incorrect');
    await this.page.reload();

    await this.waitForLoadState('load');
    await this.click(accountLocators.changePasswordButton);
    await this.fill(accountLocators.oldPasswordInput, process.env.PASSWORD!);
    await this.fill(accountLocators.newPasswordInput, process.env.PASSWORD!);
    await this.fill(accountLocators.confirmPasswordInput, process.env.PASSWORD!);
    await this.click(accountLocators.updatePasswordButton);
    await this.expectTextVisible('Old password and new password cannot be the same');
    await this.page.reload();
    await this.waitForLoadState('load');
    await this.click(accountLocators.changePasswordButton);
    await this.fill(accountLocators.oldPasswordInput, process.env.PASSWORD!);
    await this.fill(accountLocators.newPasswordInput, process.env.RESET_PASSWORD!);
    await this.fill(accountLocators.confirmPasswordInput, 'invalidconfirmpassword');
    await this.click(accountLocators.updatePasswordButton);
    await this.page.waitForTimeout(2000);
    await this.expectTextVisible('New password and confirm password do not match');
    await this.page.reload();
    await this.waitForLoadState('load');
    await this.click(accountLocators.changePasswordButton);
    await this.fill(accountLocators.oldPasswordInput, process.env.EDUCATOR_PASSWORD!);
    await this.fill(accountLocators.newPasswordInput, process.env.RESET_PASSWORD!);
    await this.fill(accountLocators.confirmPasswordInput, process.env.RESET_PASSWORD!);
    await this.click(accountLocators.updatePasswordButton);
    await this.expectTextVisible(accountLocators.passwordChangedMessage);
    await logout(this.page);
    await this.waitForVisible(commonLocators.emailInput, 15000);

    const educator = readJsonFixture<{ name: string; email: string }>('educator.json');
    await this.fill(commonLocators.emailInput, educator.email);
    await this.fill(commonLocators.passwordInput, process.env.RESET_PASSWORD!);
    await this.click(commonLocators.signInButton);
    await this.waitForUrl(/(dashboard|classes)/i, 30000);
    await this.waitForLoadState('load');

    await this.openAccountSettings();
    await this.waitForLoadState('load');
    await this.click(accountLocators.changePasswordButton);
    await this.fill(accountLocators.oldPasswordInput, process.env.EDUCATOR_PASSWORD!);
    await this.fill(accountLocators.newPasswordInput, process.env.EDUCATOR_PASSWORD!);
    await this.fill(accountLocators.confirmPasswordInput, process.env.EDUCATOR_PASSWORD!);
    await this.click(accountLocators.updatePasswordButton);
    await this.expectTextVisible(accountLocators.passwordChangedMessage);
    await logout(this.page);
    await this.waitForVisible(commonLocators.emailInput, 15000);
    await this.fill(commonLocators.emailInput, educator.email);
    await this.fill(commonLocators.passwordInput, process.env.EDUCATOR_PASSWORD!);
    await this.click(commonLocators.signInButton);
    await this.waitForUrl(/(dashboard|classes)/i, 30000);
    await this.waitForLoadState('load');
  }

  // Redeem Code Tests - Negative Cases
  async redeemCodeNegativeEmpty(): Promise<void> {
    await this.openAccountSettings();
    await this.waitForLoadState('load');
    
    // Close any open dialogs first
    await this.closeRedeemDialog();
    await this.page.waitForTimeout(500);
    
    // Click on Add Subscription button
    const addSubButton = this.page.locator(accountLocators.addSubscriptionButton).first();
    if (await addSubButton.isVisible().catch(() => false)) {
      await this.click(accountLocators.addSubscriptionButton);
    } else {
      throw new Error('Add Subscription button not found');
    }
    
    // Wait for redeem code inputs
    const redeemInputs = this.page.locator(accountLocators.redeemCodeInput);
    await redeemInputs.first().waitFor({ state: 'visible', timeout: 15000 });
    
    // Try to submit without entering any code
    await this.page.waitForTimeout(500);
    await this.page
      .getByRole('dialog')
      .getByRole('button', { name: /Active License/i })
      .click();
    
    // Verify validation error
    await this.expectTextVisible(/required|please enter|invalid/i);
    
    // Close dialog
    await this.closeRedeemDialog();
  }

  async redeemCodeNegativeInvalid(): Promise<void> {
    await this.openAccountSettings();
    await this.waitForLoadState('load');
    
    // Close any open dialogs first
    await this.closeRedeemDialog();
    await this.page.waitForTimeout(500);
    
    // Click on Add Subscription button
    const addSubButton = this.page.locator(accountLocators.addSubscriptionButton).first();
    if (await addSubButton.isVisible().catch(() => false)) {
      await this.click(accountLocators.addSubscriptionButton);
    } else {
      throw new Error('Add Subscription button not found');
    }
    
    // Wait for redeem code inputs
    const redeemInputs = this.page.locator(accountLocators.redeemCodeInput);
    await redeemInputs.first().waitFor({ state: 'visible', timeout: 15000 });
    
    // Enter invalid redeem code
    const invalidCode = 'INVALID1234';
    const codeParts = invalidCode.match(/.{1,4}/g) || [invalidCode];
    const inputCount = await redeemInputs.count();
    
    if (inputCount > 1) {
      for (let i = 0; i < Math.min(codeParts.length, inputCount); i++) {
        await redeemInputs.nth(i).fill(codeParts[i]);
      }
    } else {
      await redeemInputs.first().fill(invalidCode);
    }
    
    // Try to submit
    await this.page.waitForTimeout(500);
    await this.page
      .getByRole('dialog')
      .getByRole('button', { name: /Active License/i })
      .click();
    
    // Verify error message for invalid code
    await this.expectTextVisible(/invalid|not found|not valid|expired/i);
    
    // Close dialog
    await this.closeRedeemDialog();
  }

  // Redeem Code Tests - Positive Case
  async redeemCodePositive(): Promise<void> {
    await this.openAccountSettings();
    await this.waitForLoadState('load');
    
    // Close any open dialogs first
    await this.closeRedeemDialog();
    await this.page.waitForTimeout(500);
    
    const redeemCode = educatorUser.redeemCode;
    if (!redeemCode) {
      throw new Error('Missing redeemCode in educator fixture.');
    }
    
    // Click on Add Subscription button
    const addSubButton = this.page.locator(accountLocators.addSubscriptionButton).first();
    if (await addSubButton.isVisible().catch(() => false)) {
      await this.click(accountLocators.addSubscriptionButton);
    } else {
      throw new Error('Add Subscription button not found');
    }
    
    // Wait for redeem code inputs
    const redeemInputs = this.page.locator(accountLocators.redeemCodeInput);
    await redeemInputs.first().waitFor({ state: 'visible', timeout: 15000 });
    
    // Fill in valid redeem code
    const codeParts = redeemCode.match(/.{1,4}/g) || [redeemCode];
    const inputCount = await redeemInputs.count();
    
    if (inputCount > 1) {
      for (let i = 0; i < Math.min(codeParts.length, inputCount); i++) {
        await redeemInputs.nth(i).fill(codeParts[i]);
      }
    } else {
      await redeemInputs.first().fill(redeemCode);
    }
    
    // Submit
    await this.page.waitForTimeout(500);
    await this.page
      .getByRole('dialog')
      .getByRole('button', { name: /Active License/i })
      .click();
    
    // Verify success message
    await this.waitForLoadState('networkidle');
    await this.expectTextVisible(/activated|successfully|applied|license.*active/i);
    
    // Close dialog
    await this.closeRedeemDialog();
  }
}
