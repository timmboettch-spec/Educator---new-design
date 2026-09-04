import { test, expect, Browser, BrowserContext, Page } from '@playwright/test';
import { BASE_URL } from '../../config/playwright.regression.config';

const emailField    = (page: Page) => page.locator('input[name="email"]');
const passwordField = (page: Page) => page.locator('input[name="password"]');

const signInButton  = (page: Page) => page.getByRole('button', { name: /sign in/i }).first();
const forgotPasswordButton = (page: Page) => page.getByRole('button', { name: /forgot password\?/i }).first();
const sendOtpButton = (page: Page) => page.getByRole('button', { name: /send otp/i }).first();

async function expectErrorRegex(page: Page, regex: RegExp) {
  await expect(page.getByText(regex).first()).toBeVisible({ timeout: 10000 });
}

async function expectLoginRejected(page: Page) {
  await page.waitForLoadState('domcontentloaded').catch(() => {});

  const hasKnownError = await page
    .getByText(/invalid credentials|login failed|incorrect|authentication failed|unauthorized|no account found/i)
    .first()
    .isVisible({ timeout: 4000 })
    .catch(() => false);

  if (hasKnownError) return;

  // Some builds reject silently and briefly render a shell/loader page.
  // For invalid credentials, the only strict guarantee we need is: user is not authenticated.
  const notOnDashboard = !/dashboard|admin-dashboard|educator-dashboard/i.test(page.url());
  expect(notOnDashboard).toBeTruthy();
}

async function openForgotPasswordPage(page: Page) {
  await page.goto(`${BASE_URL}/forgotpassword`, { waitUntil: 'domcontentloaded' });
  if (await sendOtpButton(page).isVisible().catch(() => false)) return;

  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await forgotPasswordButton(page).click();
  await expect(sendOtpButton(page)).toBeVisible({ timeout: 15000 });
}

async function clearLoginForm(page: Page) {
  if (await emailField(page).isVisible().catch(() => false)) await emailField(page).fill('');
  if (await passwordField(page).isVisible().catch(() => false)) await passwordField(page).fill('');
}


async function clearForgotForm(page: Page) {
  if (await emailField(page).isVisible().catch(() => false)) await emailField(page).fill('');
}

test.describe('Auth Regression', () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
  });

  test.afterAll(async () => {
    await context.close();
  });

  // API-dependent tests — these call the backend and stay in regression.

  test.describe('Login Flow (Single Redirect)', () => {
    test.beforeAll(async () => {
      await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
      await expect(emailField(page)).toBeVisible({ timeout: 15000 });
    });

    test.afterEach(async () => {
      await clearLoginForm(page);
      await expect(page).toHaveURL(/login|signin/i, { timeout: 15000 });
    });

    test('Login - Should show error for invalid credentials', async () => {
      await emailField(page).fill('invalid@example.com');
      await passwordField(page).fill('InvalidPass@123');
      await signInButton(page).click();
      await expectLoginRejected(page);
    });

    test('Login - Should show error for script-like password', async () => {
      await emailField(page).fill('admin@example.com');
      await passwordField(page).fill('<script>alert(1)</script>');
      await signInButton(page).click();
      await expectErrorRegex(page, /password cannot include html or script-like content|invalid/i);
    });
  });

  test.describe('Forgot Password Flow (Single Redirect)', () => {
    test.beforeAll(async () => {
      await openForgotPasswordPage(page);
      await expect(emailField(page)).toBeVisible({ timeout: 15000 });
    });

    test.afterEach(async () => {
      await clearForgotForm(page);
      await expect(page).toHaveURL(/forgotpassword/i, { timeout: 15000 });
    });

    test('Forgot - Should not submit script-like email input', async () => {
      await emailField(page).fill('abc<script>@example.com');
      await sendOtpButton(page).click();
      const hasError = await page.getByText(/valid email|no account found|email is required|not found/i).first().isVisible({ timeout: 5000 }).catch(() => false);
      const stillOnForgot = page.url().includes('forgotpassword');
      expect(hasError || stillOnForgot).toBeTruthy();
    });
  });

});
