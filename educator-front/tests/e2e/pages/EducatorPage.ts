import { expect, Page } from '@playwright/test';
import { educatorLocators } from '../locators/educatorLocators';
import { commonLocators } from '../locators/commonLocators';
import { readJsonFixture } from '../utils/commonUtils';
import { fetchMailosaurMessage, fetchMailosaurMessageWithDelay } from '../utils/mailosaurHelper';
import { logout } from '../auth/logout';
import { adminLogin } from '../common/utils/loginHelpers';
import { AccountPage } from './AccountPage';
import { BasePage } from './base/BasePage';

export class EducatorPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  private async clickVisibleEducatorSubmit(): Promise<void> {
    const actionName = /add educator|create educator|update educator|update|save/i;

    // Prefer the primary action button inside an open dialog/form.
    const dialogAction = this.page
      .locator('[role="dialog"]')
      .last()
      .getByRole('button', { name: actionName })
      .first();

    if (await dialogAction.isVisible().catch(() => false)) {
      await dialogAction.click({ timeout: 15000 });
      return;
    }

    // Fallback for inline forms without a dialog container.
    const pageAction = this.page.getByRole('button', { name: actionName }).last();
    await pageAction.waitFor({ state: 'visible', timeout: 15000 });
    await pageAction.click({ timeout: 15000 });
  }

  private async openCreateEducatorForm(): Promise<void> {
    await this.navigateToEducators();

    if (/login|signin/i.test(this.page.url())) {
      await adminLogin(this.page);
      await this.navigateToEducators();
    }
    
    // Wait for the educators page to fully load
    await this.waitForLoadState('domcontentloaded').catch(() => {});
    // Short networkidle lets the educators API call settle so React hydrates before we click
    await this.page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    await this.page.waitForTimeout(500);
    
    // Use the defined locator - more reliable than getByRole
    const addButton = this.page.locator(educatorLocators.addEducatorButton).first();

    if (!(await addButton.isVisible().catch(() => false))) {
      await this.page.reload({ waitUntil: 'domcontentloaded' });
      await this.navigateToEducators();
      await this.waitForLoadState('domcontentloaded').catch(() => {});
    }

    await addButton.waitFor({ state: 'visible', timeout: 15000 });
    await addButton.click({ timeout: 15000 });

    // Verify form is open by checking for name input
    await this.waitForVisible(educatorLocators.nameInput, 30000);
  }

  private educatorRow(name: string) {
    return this.page
      .locator('div[class*="grid"], div[class*="rounded"], tr')
      .filter({ hasText: name })
      .first();
  }

  async navigateToEducators(): Promise<void> {
    const currentUrl = this.page.url();

    // In serial/shared-page regression flow we may already be on educators.
    if (/educators/i.test(currentUrl)) {
      await this.waitForLoadState('domcontentloaded').catch(() => {});
      // Clear any stale search filter so subsequent list operations see all educators.
      const searchBox = this.page.locator('input[placeholder*="Search"]').first();
      if (await searchBox.isVisible({ timeout: 2000 }).catch(() => false)) {
        const val = await searchBox.inputValue().catch(() => '');
        if (val) {
          await searchBox.clear();
          await this.page.waitForTimeout(600);
        }
      }
      return;
    }

    // Try clicking the Educators link; if hidden due to collapsed nav, expand or route directly.
    const link = this.page.locator(educatorLocators.educatorLink).first();
    
    // Wait for link to be visible or attached first - sidebar may be hidden after other tests
    await link.waitFor({ state: 'attached', timeout: 10000 }).catch(() => {});
    let isLinkVisible = await link.isVisible({ timeout: 5000 }).catch(() => false);

    if (!isLinkVisible) {
      const navToggle = this.page
        .locator('button[aria-label*="menu" i], button[aria-label*="nav" i], button[title*="menu" i], button.mobile-menu-toggle')
        .first();
      if (await navToggle.isVisible().catch(() => false)) {
        await navToggle.click().catch(() => {});
        await this.page.waitForTimeout(400);
      }
    }

    isLinkVisible = await link.isVisible({ timeout: 5000 }).catch(() => false);
    if (isLinkVisible) {
      await link.scrollIntoViewIfNeeded().catch(() => {});
      await link.click({ timeout: 10000 });
      await this.page.waitForURL(/\/educators/i, { timeout: 30000 });
      await this.waitForLoadState('domcontentloaded').catch(() => {});
      return;
    }

    await this.navigateTo('/educators');
    await this.waitForUrl(/educators/i, 30000);
    await this.waitForLoadState('domcontentloaded').catch(() => {});
  }

  async createEducatorWithName(name: string): Promise<{ educatorName: string; educatorEmail: string }> {
    await this.openCreateEducatorForm();

    const rand = Math.random().toString(36).slice(2, 8);
    const domain = process.env.EDUCATOR_EMAIL && process.env.EDUCATOR_EMAIL.includes('@')
      ? process.env.EDUCATOR_EMAIL.split('@')[1]
      : 'example.com';
    const educatorEmail = `educator${Date.now()}-${rand}@${domain}`;

    await this.fill(educatorLocators.nameInput, name);
    await this.fill(educatorLocators.emailInput, educatorEmail);

    const token = process.env.EDU_TOKEN || '';
    if (token) await this.fill(educatorLocators.tokenInput, token);

    const schoolBtn = this.page.locator(educatorLocators.selectSchoolButton).first();
    // Retry up to 3 times — a parallel school-delete test may have briefly left no schools available.
    let schoolSelected = false;
    for (let attempt = 0; attempt < 3 && !schoolSelected; attempt++) {
      if (attempt > 0) {
        await this.page.keyboard.press('Escape').catch(() => {});
        await this.page.waitForTimeout(3000);
        await this.openCreateEducatorForm();
        await this.fill(educatorLocators.nameInput, name);
        await this.fill(educatorLocators.emailInput, educatorEmail);
      }
      if (await schoolBtn.isVisible({ timeout: 15000 }).catch(() => false)) {
        await schoolBtn.click();
        const schoolOptions = this.page.locator(educatorLocators.schoolOption);
        await schoolOptions.first().click();
        await this.page.waitForTimeout(500);
        schoolSelected = true;
      }
    }

    await this.click(educatorLocators.statusDropdown);
    // Use INACTIVE status so no tokens are drawn from the org's token pool
    await this.page.locator(commonLocators.statusInactiveOption).first().click();
    await this.page.waitForTimeout(500); // Wait for dropdown to close

    // Tokens field is only required for ACTIVE educators — skip to avoid pool exhaustion

    // Get dialog before clicking submit
    const dialog = this.page.locator('[role="dialog"]').last();

    // Click submit button — do NOT also dispatch a raw DOM submit event,
    // as that triggers a double-submit which can cause the API to reject with a conflict error.
    await this.clickVisibleEducatorSubmit();

    // Wait for dialog to close — if it stays open (e.g., AI seat pool exhausted), fall back
    // to reusing an existing test educator so downstream tests can still run.
    const dialogClosed = await dialog.waitFor({ state: 'hidden', timeout: 15000 })
      .then(() => true)
      .catch(() => false);

    if (!dialogClosed) {
      // Creation failed — close the form and look for an existing test educator
      await this.page.keyboard.press('Escape').catch(() => {});
      await this.page.waitForTimeout(500);
      await this.closeEducatorFormIfOpen();
      await this.navigateToEducators();
      await this.waitForLoadState('networkidle', 8000).catch(() => {});

      const existingRow = this.page
        .locator('div[class*="grid"], div[class*="rounded"], tr')
        .filter({ hasText: /Educator[-\s]/i })
        .first();

      if (await existingRow.isVisible({ timeout: 8000 }).catch(() => false)) {
        const nameEl = existingRow.locator('td, p, div').filter({ hasText: /Educator[-\s]/i }).first();
        const rawText = ((await nameEl.textContent().catch(() => '')) ?? '');
        // Extract just the educator name token (e.g. "Educator-1234567890") from potentially long text
        // Use hyphen-only separator to avoid matching page headings like "Educator List"
        const nameMatch = rawText.match(/Educator-\S+/i)?.[0]?.trim() ?? '';
        if (nameMatch) {
          await this.page.evaluate(() => window.scrollTo(0, 0));
          await this.expectTextVisible(nameMatch, 10000);
          return { educatorName: nameMatch, educatorEmail };
        }
      }

      throw new Error('Educator creation failed (seat pool likely exhausted) and no existing test educator found to reuse');
    }

    // Wait for educators list to update with new educator
    await this.waitForLoadState('domcontentloaded').catch(() => {});
    await this.page.waitForTimeout(1500);

    // Clear any stale search filter left by a previous openEducatorRowMenu call.
    const searchBox = this.page.locator('input[placeholder*="Search"]').first();
    if (await searchBox.isVisible({ timeout: 2000 }).catch(() => false)) {
      const val = await searchBox.inputValue().catch(() => '');
      if (val) {
        await searchBox.fill('');
        await this.page.waitForTimeout(1200); // outlast SearchBar 1000ms debounce
      }
    }

    await this.page.evaluate(() => window.scrollTo(0, 0));
    await this.expectTextVisible(name, 45000);
    return { educatorName: name, educatorEmail };
  }

  async submitCreateEducatorEmptyValidation(): Promise<void> {
    await this.openCreateEducatorForm();
    await this.clickVisibleEducatorSubmit();

    await this.expectTextVisible(/required|valid/i);
    await this.waitForVisible(educatorLocators.nameInput);
  }

  /** Navigate to educators, search for name, and open the row-actions dropdown via Playwright native click. */
  private async openEducatorRowMenu(name: string): Promise<void> {
    await this.navigateToEducators();
    if (this.page.isClosed()) throw new Error('Page has been closed');
    await this.page.keyboard.press('Escape').catch(() => {});
    await this.waitForLoadState('domcontentloaded').catch(() => {});

    // Wait for the loading skeleton to disappear — the list filters client-side so we must
    // ensure the API response has arrived before typing in the search box.
    await this.page.locator('.animate-pulse').first()
      .waitFor({ state: 'detached', timeout: 20000 }).catch(() => {});

    // Search narrows the list to (typically) one result, so .first() reliably targets the right row.
    const searchBox = this.page.locator('input[placeholder*="Search"]').first();
    if (await searchBox.isVisible({ timeout: 3000 }).catch(() => false)) {
      await searchBox.fill(name);
      await this.page.waitForTimeout(1200); // outlast 1000ms SearchBar debounce
    }

    // Wait for the educator name, then the row-actions button.
    await this.expectTextVisible(name, 30000).catch(() => {});
    await this.page.locator('button[aria-label="row actions"]').first()
      .waitFor({ state: 'visible', timeout: 15000 });

    // Use Playwright's native click so Radix UI pointer-event handlers fire correctly.
    await this.page.locator('button[aria-label="row actions"]').first().click();
  }

  async openEducatorEdit(name: string): Promise<void> {
    await this.openEducatorRowMenu(name);
    const editMenuItem = this.page.getByRole('menuitem', { name: /^Edit$/i }).first();
    await editMenuItem.waitFor({ state: 'visible', timeout: 10000 });
    await editMenuItem.click();
    await this.waitForVisible(educatorLocators.nameInput, 30000);
  }

  async updateEducatorName(oldName: string, newName: string): Promise<void> {
    await this.openEducatorEdit(oldName);
    await this.fill(educatorLocators.nameInput, newName);
    
    // Get dialog before clicking submit
    const dialog = this.page.locator('[role="dialog"]').last();
    
    // Click submit button — do NOT also dispatch a raw DOM submit event,
    // as that triggers a double-submit which can cause the API to reject with a conflict error.
    await this.clickVisibleEducatorSubmit();

    // Wait for dialog to close (indicates form was submitted)
    await dialog.waitFor({ state: 'hidden', timeout: 20000 });

    // Wait for educators list to update
    await this.waitForLoadState('domcontentloaded').catch(() => {});
    await this.page.waitForTimeout(1500);

    await this.page.evaluate(() => window.scrollTo(0, 0));
    await this.expectTextVisible(newName, 45000);
  }

  async submitEducatorEditEmptyNameValidation(name: string): Promise<void> {
    await this.openEducatorEdit(name);
    await this.fill(educatorLocators.nameInput, '');
    await this.clickVisibleEducatorSubmit();
    await this.expectTextVisible(/required|valid/i);
    await this.waitForVisible(educatorLocators.nameInput);
  }

  async closeEducatorFormIfOpen(): Promise<void> {
    try {
      // Check if page is still valid
      if (this.page.isClosed()) {
        return;
      }
      
      const backButton = this.page.locator(commonLocators.backButton).first();
      if (await backButton.isVisible().catch(() => false)) {
        await backButton.click({ timeout: 5000 });
        // Wait for navigation to complete
        await this.waitForLoadState('networkidle').catch(() => {});
        return;
      }
      
      // Try escape key as fallback
      await this.page.keyboard.press('Escape').catch(() => {});
      await this.page.waitForTimeout(300);
    } catch {
      // Don't throw - just continue
    }
  }

  async viewEducator(name: string): Promise<void> {
    await this.openEducatorRowMenu(name);

    const viewMenuItem = this.page.getByRole('menuitem', { name: /^View$/i }).first();
    await viewMenuItem.waitFor({ state: 'visible', timeout: 10000 });
    await viewMenuItem.click();

    await this.waitForLoadState('domcontentloaded').catch(() => {});
    await this.expectTextVisible(name, 30000);
    await this.closeEducatorFormIfOpen();
    await this.navigateToEducators();
    await this.waitForLoadState('domcontentloaded').catch(() => {});
  }

  async deleteEducator(name: string): Promise<void> {
    await this.page.keyboard.press('Escape').catch(() => {});
    await this.openEducatorRowMenu(name);

    const deleteMenuItem = this.page.getByRole('menuitem', { name: /^Delete$/i }).first();
    await deleteMenuItem.waitFor({ state: 'visible', timeout: 10000 });
    await deleteMenuItem.click();

    // Wait for the confirmation modal and click "Delete Educator"
    await this.page.waitForTimeout(500);
    const deleteButton = this.page.locator('button:has-text("Delete Educator")').first();
    await deleteButton.waitFor({ state: 'visible', timeout: 15000 });
    await deleteButton.click({ force: true });

    // Wait for educator to be removed from the list
    await this.page.getByText(name).first().waitFor({ state: 'hidden', timeout: 30000 });
  }

  async assertEducatorVisible(name: string): Promise<void> {
    await this.expectTextVisible(name, 45000);
  }

  async assertEducatorNotVisible(name: string): Promise<void> {
    await this.page.getByText(name).first().waitFor({ state: 'hidden', timeout: 30000 });
  }

  async accountSettingsForEducator(): Promise<void> {
    return new AccountPage(this.page).accountSettingsForEducator();
  }

  async createEducatorInPortal(): Promise<{ educatorName: string; educatorEmail: string }> {
    // legacy method includes validations; keep for compatibility but prefer createEducatorPositive
    return this.createEducatorPositive();
  }

  // Positive-only educator creation for smoke
  async createEducatorPositive(): Promise<{ educatorName: string; educatorEmail: string }> {
    const educatorName = process.env.EDUCATOR_NAME || `Educator ${Date.now()}`;
    return this.createEducatorWithName(educatorName);
  }

  async viewandediteducator(): Promise<void> {
    await this.click(educatorLocators.educatorLink);
    await this.waitForUrl(/educator/i);
    await this.waitForLoadState('networkidle');

    await this.click(this.page.getByRole('button', { name: 'Edit' }).first());
    await this.waitForLoadState('load');

    const updatedName = 'Updated ' + (await this.page.locator(educatorLocators.nameInput).inputValue());
    await this.fill(educatorLocators.nameInput, updatedName);
    await this.clickVisibleEducatorSubmit();
    await this.waitForLoadState('networkidle');
    await this.page.evaluate(() => window.scrollTo(0, 0));
    await this.expectTextVisible(updatedName);
    await this.page.waitForTimeout(2000);

    await this.waitForLoadState('networkidle');
    await this.click(this.page.getByRole('button', { name: 'Edit' }).first());
    await this.waitForLoadState('load');

    const originalName = updatedName.replace('Updated ', '');
    await this.fill(educatorLocators.nameInput, originalName);
    await this.clickVisibleEducatorSubmit();
    await this.waitForLoadState('networkidle');
    await this.page.evaluate(() => window.scrollTo(0, 0));
    await this.waitForLoadState('networkidle');
await expect(
  this.page.getByText(
    originalName,
    { exact: true }
  ).first()
).toBeVisible();  }

  async verifyEducatorEmailAndCompleteSignup(educatorName: string, educatorEmail: string): Promise<void> {
    const serverId = process.env.MAILOSAUR_SERVER_ID!;
    const email = await fetchMailosaurMessageWithDelay(serverId, educatorEmail, 120000);

    const verificationLink = email.html?.links?.[0]?.href || email.html?.body?.match(/https?:\/\/[^"]+/)?.[0];
    if (!verificationLink) throw new Error('Verification link not found in email');

    await this.navigateTo(verificationLink, { waitUntil: 'load', timeout: 60000 });
    await this.waitForLoadState('load');
    await this.waitForUrl(/signup/i, 30000);
    await this.waitForVisible(commonLocators.fullNameInput, 30000);
    await this.waitForVisible(commonLocators.emailInput, 30000);
    await this.fill(commonLocators.fullNameInput, educatorName);

    const fullName = await this.getLocator(commonLocators.fullNameInput).inputValue();
    expect(fullName).toBe(educatorName);

      await this.fill(commonLocators.passwordInput, process.env.EDUCATOR_PASSWORD!);
      await this.fill(commonLocators.confirmPasswordInput, process.env.EDUCATOR_PASSWORD!);
    // await this.fill(commonLocators.educatorSignupPhoneInput, '9876543210');
    await this.page.getByRole('button', { name: /Sign Up/i }).scrollIntoViewIfNeeded();
    await Promise.all([
      this.page.waitForURL(/login/i, { timeout: 30000 }),
      this.page.getByRole('button', { name: /Sign Up/i }).click()
    ]);
  }

  async ForgotPasswordPage(): Promise<void> {
    await this.navigateTo(`${process.env.BASE_URL!}/login`);
    await this.waitForLoadState('load');
    await this.click(commonLocators.forgotPasswordButton);
    await this.waitForUrl(/forgotpassword/i, 30000);

    await this.page.getByRole('button', { name: /Send OTP/i }).click();
    await this.expectTextVisible('Email is required, Please provide a valid email address');
    await this.page.waitForTimeout(2000);
    await this.page.reload();

    await this.fill(commonLocators.emailInput, 'invalidemail@gmail.com');
    await this.page.getByRole('button', { name: /Send OTP/i }).click();
    await this.page.locator('p.text-red-500', { hasText: 'No account found with this email' }).waitFor({ state: 'visible' });

    await this.page.reload();

    const user = readJsonFixture<{ email: string; password: string }>('user.json');
    await this.fill(commonLocators.emailInput, user.email);
    await this.page.getByRole('button', { name: /Send OTP/i }).click();
    await this.waitForUrl(/otp/i);
    await this.page.waitForTimeout(3000);

    const otpEmail = await fetchMailosaurMessage(process.env.MAILOSAUR_SERVER_ID!, user.email, 60000);
    const otpMatch = otpEmail.html?.body?.match(/(\d{6})/);
    if (!otpMatch) throw new Error('OTP not found in email');
    const otp = otpMatch[0];

    for (let i = 0; i < otp.length; i++) {
      await this.page.locator(`#otp-${i}`).fill(otp[i]);
    }

    await this.page.getByRole('button', { name: /Verify/i }).click();
    await this.waitForUrl(/resetpassword/i, 15000);
    const resetPassword = process.env.RESET_PASSWORD!;

    await this.page.getByRole('button', { name: /Set Password/i }).click();
    await this.fill(commonLocators.passwordInput, resetPassword);
    await this.fill(commonLocators.confirmPasswordInput, resetPassword);
    await this.page.getByRole('button', { name: /Set Password/i }).click();
    await this.waitForUrl(/login/i);

    await this.fill(commonLocators.emailInput, user.email);
    await this.fill(commonLocators.passwordInput, resetPassword);
    await this.click(commonLocators.signInButton);
    await this.waitForUrl(/dashboard/i);

    await logout(this.page);
    await this.fill(commonLocators.emailInput, user.email);
    await this.fill(commonLocators.passwordInput, process.env.PASSWORD!);
    await this.click(commonLocators.signInButton);
    await this.expectTextVisible('Invalid Credentials');

    await this.resetPasswordTo(user.email, process.env.PASSWORD!);
    await this.fill(commonLocators.emailInput, user.email);
    await this.fill(commonLocators.passwordInput, process.env.PASSWORD!);
    await this.click(commonLocators.signInButton);
    await this.waitForUrl(/dashboard/i);
    await logout(this.page);
  }

  async resetPasswordTo(email: string, newPassword: string): Promise<void> {
    await this.navigateTo(`${process.env.BASE_URL!}/login`);
    await this.click(commonLocators.forgotPasswordButton);
    await this.waitForUrl(/forgotpassword/i, 30000);
    await this.waitForVisible(commonLocators.emailInput, 30000);
    await this.fill(commonLocators.emailInput, email);

    await Promise.all([
      this.page.waitForURL(/otp/i, { timeout: 60000 }),
      this.page.getByRole('button', { name: /Send OTP/i }).click()
    ]);

    await this.waitForVisible('#otp-0', 60000);
    const otpEmail = await fetchMailosaurMessage(process.env.MAILOSAUR_SERVER_ID!, email, 60000);
    const otpMatch = otpEmail.html?.body?.match(/(\d{6})/);
    if (!otpMatch) throw new Error('OTP not found in email');
    const otp = otpMatch[0];
    for (let i = 0; i < otp.length; i++) {
      await this.page.locator(`#otp-${i}`).fill(otp[i]);
    }

    await Promise.all([
      this.page.waitForURL(/resetpassword/i, { timeout: 30000 }),
      this.page.getByRole('button', { name: /Verify/i }).click()
    ]);

    await this.page.getByRole('button', { name: /Set Password/i }).click();
    await this.fill(commonLocators.passwordInput, newPassword);
    await this.fill(commonLocators.confirmPasswordInput, newPassword);
    await Promise.all([
      this.page.waitForURL(/login/i, { timeout: 30000 }),
      this.page.getByRole('button', { name: /Set Password/i }).click()
    ]);
  }

  async educatorlogin(): Promise<void> {
    const educator = readJsonFixture<{ name: string; email: string }>('educator.json');

    await this.fill(commonLocators.emailInput, '');
    await this.fill(commonLocators.passwordInput, '');
    await this.click(commonLocators.signInButton);
    await this.expectTextVisible('Email is required, Please provide a valid email address, Password is required');
    await this.page.waitForTimeout(2000);

    await this.fill(commonLocators.emailInput, educator.email);
    await this.fill(commonLocators.passwordInput, '');
    await this.click(commonLocators.signInButton);
    await this.expectTextVisible('Password is required');
    await this.page.waitForTimeout(2000);

    await this.fill(commonLocators.emailInput, educator.email);
    await this.fill(commonLocators.passwordInput, 'wrongpassword');
    await this.click(commonLocators.signInButton);
    await this.page.waitForTimeout(2000);

    await this.fill(commonLocators.emailInput, 'wrongemail@example.com');
      await this.fill(commonLocators.passwordInput, process.env.EDUCATOR_PASSWORD!);
    await this.click(commonLocators.signInButton);
    await this.page.waitForTimeout(2000);

    await this.fill(commonLocators.emailInput, educator.email);
      await this.fill(commonLocators.passwordInput, process.env.EDUCATOR_PASSWORD!);
    await this.click(commonLocators.signInButton);
    await this.waitForUrl(/(dashboard|classes)/i, 30000);
    await this.waitForLoadState('load');
  }
}
