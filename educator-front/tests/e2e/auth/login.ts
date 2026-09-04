import { Page } from '@playwright/test';
import { loginLocators } from '../locators/loginLocators';
import { commonLocators } from '../locators/commonLocators';
import educatorUser from '../fixtures/educator.json' with { type: 'json' };

async function waitForOverlayToDisappear(page: Page, timeout = 15000): Promise<void> {
  const overlay = page.locator('div.fixed.inset-0.z-50');
  const backdrop = page.locator('[role="dialog"]');
  
  // Guard: if the page/context is already closed, skip overlay checks silently
  if (page.isClosed()) return;

  // Wait for all overlays to disappear
  const overlayCount = await overlay.count().catch(() => -1);
  if (overlayCount > 0) {
    await overlay.first().waitFor({ state: 'hidden', timeout }).catch(() => {});
  }
  
  const backdropCount = await backdrop.count().catch(() => -1);
  if (backdropCount > 0) {
    await backdrop.first().waitFor({ state: 'hidden', timeout }).catch(() => {});
  }
  
  // Additional wait for DOM to settle
  if (!page.isClosed()) {
    await page.waitForTimeout(500);
  }
}

export async function performLogin(page: Page, email: string, password: string): Promise<void> {
  await page.locator(commonLocators.emailInput).fill(email);
  await page.locator(commonLocators.passwordInput).fill(password);
  await waitForOverlayToDisappear(page);
  
  // Click sign-in and wait for navigation
  const signInButton = page.getByRole('button', { name: /sign in/i });
  
  // Click and wait for navigation - these happen concurrently
  const navigationPromise = page.waitForNavigation().catch(() => {});
  await signInButton.click();
  
  // Wait for either navigation or a URL change — no short-circuit fallback that
  // would return before the login actually completes.
  try {
    await Promise.race([
      navigationPromise,
      page.waitForURL(/(dashboard|classes|educator-dashboard)/i, { timeout: 35000 }),
    ]);
  } catch {
    throw new Error('Failed to navigate after login');
  }
}

export async function performLoginWithRedeem(page: Page, email: string, password: string): Promise<void> {
  await page.locator(commonLocators.emailInput).fill(email);
  await page.locator(commonLocators.passwordInput).fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();

  const urlResult = await Promise.race([
    page.waitForURL(/dashboard/i, { timeout: 30000 }).then(() => 'dashboard'),
    page.waitForURL(/redeem/i, { timeout: 30000 }).then(() => 'redeem')
  ]);

  if (urlResult === 'dashboard') {
    return;
  }

  await page.waitForTimeout(5000);

  const redeemCode = educatorUser.redeemCode?.replace(/\s+/g, '');
  const redeemParts = redeemCode?.includes('-') ? redeemCode.split('-') : redeemCode?.match(/.{1,4}/g) || [];

  if (!redeemParts || redeemParts.length < 4 || redeemParts.some(part => !part)) {
    throw new Error('Redeem code is missing or invalid. Please set a valid redeemCode in educator fixture.');
  }

  await page.locator(loginLocators.redeemInput0).fill(redeemParts[0]);
  await page.locator(loginLocators.redeemInput1).fill(redeemParts[1]);
  await page.locator(loginLocators.redeemInput2).fill(redeemParts[2]);
  await page.locator(loginLocators.redeemInput3).fill(redeemParts[3]);

  await page.waitForTimeout(2000);
  await page.getByRole('button', { name: 'Active License' }).click();
  await page.waitForURL(/dashboard/i, { timeout: 30000 });
  await page.waitForTimeout(5000);
}
