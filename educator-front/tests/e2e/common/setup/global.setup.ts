import { chromium } from '@playwright/test';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { setupAdminAuth, setupEducatorAuth } from './auth.setup';
import { EDUCATOR_LOCKOUT_FLAG } from '../utils/loginHelpers';

dotenv.config({ path: '.env.local' });

const BASE_URL = (process.env.BASE_URL ?? process.env.VITE_API_URL ?? '').trim();

// Normalises the educator account password to the fixture value (Test@123) before
// any worker starts.  spec-08 may have left it as Test@1234 on a previous run.
async function normalizeEducatorPassword(): Promise<void> {
  const EDUCATOR_EMAIL = process.env.EDUCATOR_EMAIL ?? 'satheeshkumart.ait+2@gmail.com';
  const FIXTURE_PASSWORD = process.env.EDUCATOR_PASSWORD ?? 'Test@123';
  const ALT_PASSWORD = 'Test@1234';

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Clicks "Educator" in the dual-role popup if it appears after sign-in.
  const handleDualRolePopup = async (): Promise<void> => {
    const btn = page.getByRole('button', { name: 'Educator' });
    if (await btn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await btn.click();
      await page.waitForURL(/(dashboard|educator-dashboard|classes)/i, { timeout: 20000 }).catch(() => {});
    }
  };

  try {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.locator('input[type="email"], input[placeholder*="email" i]').first()
      .waitFor({ state: 'visible', timeout: 30000 });

    // Try fixture password first — if it works we're done
    await page.locator('input[type="email"], input[placeholder*="email" i]').first().fill(EDUCATOR_EMAIL);
    await page.locator('input[type="password"]').first().fill(FIXTURE_PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL(/(dashboard|educator-dashboard|classes)/i, { timeout: 20000 }).catch(() => {});
    await handleDualRolePopup();

    if (/(dashboard|educator-dashboard|classes)/i.test(page.url())) {
      // Fixture password works — clear any stale lockout flag
      if (fs.existsSync(EDUCATOR_LOCKOUT_FLAG)) fs.unlinkSync(EDUCATOR_LOCKOUT_FLAG);
      return; // already on fixture password — nothing to do
    }

    // Fixture password didn't work — try alt password and restore if successful
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.locator('input[type="email"], input[placeholder*="email" i]').first().fill(EDUCATOR_EMAIL);
    await page.locator('input[type="password"]').first().fill(ALT_PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL(/(dashboard|educator-dashboard|classes)/i, { timeout: 20000 }).catch(() => {});
    await handleDualRolePopup();

    if (!/(dashboard|educator-dashboard|classes)/i.test(page.url())) {
      // Neither password works — write flag so workers skip login and stop extending the lockout
      fs.mkdirSync(path.dirname(EDUCATOR_LOCKOUT_FLAG), { recursive: true });
      fs.writeFileSync(EDUCATOR_LOCKOUT_FLAG, new Date().toISOString());
      return;
    }

    // Logged in with alt password — clear stale flag and restore fixture password
    if (fs.existsSync(EDUCATOR_LOCKOUT_FLAG)) fs.unlinkSync(EDUCATOR_LOCKOUT_FLAG);
    await page.goto(`${BASE_URL}/account`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => {});

    const changeBtn = page.getByRole('button', { name: /change password/i });
    if (!await changeBtn.isVisible({ timeout: 10000 }).catch(() => false)) return;
    await changeBtn.click();

    await page.locator('input[placeholder="Old Password"]').fill(ALT_PASSWORD);
    await page.locator('input[placeholder="New Password"]').fill(FIXTURE_PASSWORD);
    await page.locator('input[placeholder="Confirm Password"]').fill(FIXTURE_PASSWORD);
    await page.getByRole('button', { name: /update password/i }).click();
    await page.waitForTimeout(3000);
  } catch {
    // Best-effort — do not fail global setup if password normalisation fails
  } finally {
    await browser.close();
  }
}

/**
 * Global setup entry point for the regression suite.
 * Runs once before all workers start — normalises shared account passwords,
 * then authenticates admin and saves the session state used by admin specs.
 */
export default async function globalSetup(): Promise<void> {
  await normalizeEducatorPassword();
  await setupAdminAuth();
  await setupEducatorAuth().catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.warn('[globalSetup] Educator auth setup skipped:', (err as Error).message);
  });
}
