import type { Page } from '@playwright/test';
import { performLogin } from '../../auth/login';
import adminUser from '../../fixtures/user.json' with { type: 'json' };
import educatorUser from '../../fixtures/educator.json' with { type: 'json' };
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Flag file written by global setup when the educator account is locked. */
export const EDUCATOR_LOCKOUT_FLAG = path.resolve(__dirname, '../../results/.auth/educator-locked.flag');

export const adminLogin = async (page: Page) => {
  const getOrigin = () => page.url().match(/^https?:\/\/[^/]+/)?.[0] ?? '';
  const gotoLogin = async () => {
    const o = getOrigin();
    if (o) await page.goto(`${o}/login`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  };
  // Fast login helper used for fallback attempts — 20 s is enough to detect a failed login.
  const tryLogin = async (password: string, fast = false): Promise<boolean> => {
    try {
      await gotoLogin();
      if (fast) {
        await page.locator('input[type="email"], input[placeholder*="email" i]').first().fill(adminUser.email).catch(() => {});
        await page.locator('input[type="password"]').first().fill(password).catch(() => {});
        await page.getByRole('button', { name: /sign in/i }).click().catch(() => {});
        await page.waitForURL(/(dashboard|classes|educator-dashboard)/i, { timeout: 20000 });
      } else {
        await performLogin(page, adminUser.email, password);
      }
      return true;
    } catch {
      return false;
    }
  };

  // Attempt 1: fixture password (full timeout)
  try { await performLogin(page, adminUser.email, adminUser.password); return; } catch { /* fall through */ }

  // Attempt 2: spec-04 may have changed the password to Test@1234 without restoring (fast)
  if (await tryLogin('Test@1234', true)) return;

  // Attempt 3: transient issue — brief pause then retry fixture password (fast)
  await page.waitForTimeout(5000).catch(() => {});
  if (await tryLogin(adminUser.password, true)) return;

  // Final attempt: retry Test@1234 with full timeout in case the server was slow
  await gotoLogin();
  await performLogin(page, adminUser.email, 'Test@1234');
};

export const educatorLogin = async (page: Page) => {
  const getOrigin = () => page.url().match(/^https?:\/\/[^/]+/)?.[0] ?? '';
  const gotoLogin = async () => {
    const o = getOrigin();
    if (o) await page.goto(`${o}/login`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  };

  // When the educator email also has an Admin role, a dual-role popup appears after
  // sign-in. Click "Educator" to proceed, then wait for the dashboard URL.
  const handleDualRolePopup = async (timeout = 6000): Promise<void> => {
    const btn = page.getByRole('button', { name: 'Educator' });
    try {
      await btn.waitFor({ state: 'visible', timeout });
      await btn.click();
      await page.waitForURL(/(dashboard|classes|educator-dashboard)/i, { timeout: 30000 });
    } catch {
      // No dual-role popup appeared within timeout — continue normally.
    }
  };

  const tryLogin = async (password: string, fast = false): Promise<boolean> => {
    try {
      await gotoLogin();
      if (fast) {
        await page.locator('input[type="email"], input[placeholder*="email" i]').first().fill(educatorUser.email).catch(() => {});
        await page.locator('input[type="password"]').first().fill(password).catch(() => {});
        await page.getByRole('button', { name: /sign in/i }).click().catch(() => {});
        // Wait for URL first; if it times out a dual-role popup may be blocking.
        const navigated = await page.waitForURL(/(dashboard|classes|educator-dashboard)/i, { timeout: 15000 }).then(() => true).catch(() => false);
        if (!navigated) {
          await handleDualRolePopup(5000);
          await page.waitForURL(/(dashboard|classes|educator-dashboard)/i, { timeout: 10000 });
        }
      } else {
        try {
          await performLogin(page, educatorUser.email, password);
        } catch {
          // performLogin throws when navigation times out (e.g. dual-role popup blocks it)
          await handleDualRolePopup(5000);
          if (!/(dashboard|classes|educator-dashboard)/i.test(page.url())) {
            throw new Error('Login failed');
          }
        }
      }
      return true;
    } catch {
      return false;
    }
  };

  // Attempt 1: fixture password first — global setup normalises the password to the
  // fixture value before any worker starts, so this should succeed on the first try.
  if (await tryLogin(educatorUser.password)) return;

  // Attempt 2: spec-08 may have changed the password to Test@1234 without restoring (fast)
  if (await tryLogin('Test@1234', true)) return;

  // Attempt 3: transient issue — brief pause then retry fixture password (fast)
  await page.waitForTimeout(5000).catch(() => {});
  if (await tryLogin(educatorUser.password, true)) return;

  // Final attempt: retry Test@1234 with full timeout in case the server was slow
  await gotoLogin();
  try {
    await performLogin(page, educatorUser.email, 'Test@1234');
  } catch {
    await handleDualRolePopup(5000);
    if (!/(dashboard|classes|educator-dashboard)/i.test(page.url())) {
      throw new Error('Failed to navigate after login');
    }
  }
};
