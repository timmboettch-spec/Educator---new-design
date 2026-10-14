import { type Page } from '@playwright/test';
import { loginLocators } from '../locators/loginLocators';
import { commonLocators } from '../locators/commonLocators';
import educatorUser from '../fixtures/educator.json' with { type: 'json' };

async function waitForOverlayToDisappear(
  page: Page,
  timeout = 15000
): Promise<void> {
  const overlay = page.locator('div.fixed.inset-0.z-50');
  const backdrop = page.locator('[role="dialog"]');

  // Guard: if the page/context is already closed, skip overlay checks silently
  if (page.isClosed()) return;

  // Wait for all overlays to disappear
  const overlayCount = await overlay.count().catch(() => -1);
  if (overlayCount > 0) {
    await overlay
      .first()
      .waitFor({ state: 'hidden', timeout })
      .catch(() => {});
  }

  const backdropCount = await backdrop.count().catch(() => -1);
  if (backdropCount > 0) {
    await backdrop
      .first()
      .waitFor({ state: 'hidden', timeout })
      .catch(() => {});
  }

  // Additional wait for DOM to settle
  if (!page.isClosed()) {
    await page.waitForTimeout(500);
  }
}

export async function performLogin(
  page: Page,
  email: string,
  password: string,
  role?: 'Administrator' | 'Educator'
): Promise<void> {
  await page.locator(commonLocators.emailInput).fill(email);
  await page.locator(commonLocators.passwordInput).fill(password);
  await waitForOverlayToDisappear(page);

  const loggedInUrl = /(dashboard|classes|educator-dashboard)/i;
  await page.getByRole('button', { name: /sign in/i }).click();

  // This account can be linked to both an Administrator and Educator role, in which
  // case a role-selection dialog appears instead of navigating directly — only pick
  // a role when the caller tells us which one it expects, otherwise leave the dialog
  // for the caller to handle (e.g. educatorLogin's own dual-role fallback).
  // Waits for whichever comes first, so a slow sign-in can't skip the dialog.
  if (role) {
    const roleDialogBtn = page.getByRole('button', { name: role });
    const first = await Promise.race([
      roleDialogBtn
        .waitFor({ state: 'visible', timeout: 35000 })
        .then(() => 'dialog' as const),
      page
        .waitForURL(loggedInUrl, { timeout: 35000 })
        .then(() => 'app' as const),
    ]).catch(() => null);
    if (first === 'dialog') {
      await roleDialogBtn.click();
    }
  }

  // Only a logged-in URL counts: login isn't done until the app is reached.
  try {
    await page.waitForURL(loggedInUrl, { timeout: 35000 });
  } catch {
    throw new Error('Failed to navigate after login');
  }
}

export async function performLoginWithRedeem(
  page: Page,
  email: string,
  password: string
): Promise<void> {
  await page.locator(commonLocators.emailInput).fill(email);
  await page.locator(commonLocators.passwordInput).fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();

  const urlResult = await Promise.race([
    page.waitForURL(/dashboard/i, { timeout: 30000 }).then(() => 'dashboard'),
    page.waitForURL(/redeem/i, { timeout: 30000 }).then(() => 'redeem'),
  ]);

  if (urlResult === 'dashboard') {
    return;
  }

  await page.waitForTimeout(5000);

  const redeemCode = educatorUser.redeemCode?.replace(/\s+/g, '');
  const redeemParts = redeemCode?.includes('-')
    ? redeemCode.split('-')
    : redeemCode?.match(/.{1,4}/g) || [];

  const [part0, part1, part2, part3] = redeemParts;
  if (
    !part0 ||
    !part1 ||
    !part2 ||
    !part3 ||
    redeemParts.some((part) => !part)
  ) {
    throw new Error(
      'Redeem code is missing or invalid. Please set a valid redeemCode in educator fixture.'
    );
  }

  await page.locator(loginLocators.redeemInput0).fill(part0);
  await page.locator(loginLocators.redeemInput1).fill(part1);
  await page.locator(loginLocators.redeemInput2).fill(part2);
  await page.locator(loginLocators.redeemInput3).fill(part3);

  await page.waitForTimeout(2000);
  await page.getByRole('button', { name: 'Active License' }).click();
  await page.waitForURL(/dashboard/i, { timeout: 30000 });
  await page.waitForTimeout(5000);
}
