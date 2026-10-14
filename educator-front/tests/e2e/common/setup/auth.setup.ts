import { chromium, type Page } from '@playwright/test';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: '.env.local' });

const BASE_URL = (
  process.env.BASE_URL ??
  process.env.VITE_API_URL ??
  ''
).trim();

/** App base URL — re-exported so admin specs can use it for initial navigation. */
export { BASE_URL };

/** Playwright storageState file (cookies + localStorage). */
export const ADMIN_AUTH_FILE = path.resolve(
  __dirname,
  '../../results/.auth/admin.json'
);

/** sessionStorage snapshot — captured separately because storageState omits it. */
export const ADMIN_SESSION_FILE = path.resolve(
  __dirname,
  '../../results/.auth/admin-session.json'
);

/** Educator storageState file (cookies + localStorage). */
export const EDUCATOR_AUTH_FILE = path.resolve(
  __dirname,
  '../../results/.auth/educator.json'
);

/** Educator session snapshot — captured separately because storageState omits it. */
export const EDUCATOR_SESSION_FILE = path.resolve(
  __dirname,
  '../../results/.auth/educator-session.json'
);

/** Educator base URL (same server as admin). */
export const EDUCATOR_BASE_URL = BASE_URL;

/**
 * Injects saved sessionStorage back into the page after navigating to the app domain.
 * Must be called AFTER page.goto so the domain context exists.
 */
export async function injectAdminSessionStorage(page: Page): Promise<void> {
  if (!fs.existsSync(ADMIN_SESSION_FILE)) return;
  try {
    const data: Record<string, string> = JSON.parse(
      fs.readFileSync(ADMIN_SESSION_FILE, 'utf-8')
    );
    if (Object.keys(data).length === 0) return;
    await page.evaluate((entries: Record<string, string>) => {
      for (const [k, v] of Object.entries(entries))
        sessionStorage.setItem(k, v);
    }, data);
  } catch {
    // Silently skip if injection fails — cookies/localStorage may be sufficient
  }
}

export async function setupAdminAuth(): Promise<void> {
  if (!BASE_URL) {
    throw new Error(
      'No base URL found. Set BASE_URL (CI) or VITE_API_URL in .env.local.'
    );
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    const emailInput = page
      .locator('input[name="email"], input[type="email"]')
      .first();
    const loaded = await emailInput
      .waitFor({ state: 'visible', timeout: 30000 })
      .then(() => true)
      .catch(() => false);
    if (!loaded) {
      // Preview/dev SWA can scale-to-zero between the health check and here — reload and retry once.
      await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
      await emailInput.waitFor({ state: 'visible', timeout: 30000 });
    }

    const email = process.env.ADMIN_EMAIL ?? 'test@curionn.com';
    const password = process.env.ADMIN_PASSWORD ?? 'Test@123';
    const altPassword = 'Test@1234'; // spec-04 may have left the password in this state

    // This account can be linked to both an Administrator and Educator role, in which
    // case a role-selection dialog appears instead of navigating directly.
    const pickAdminRoleIfPrompted = async (): Promise<void> => {
      const roleDialogBtn = page.getByRole('button', { name: 'Administrator' });
      const roleDialogSeen = await roleDialogBtn
        .waitFor({ state: 'visible', timeout: 5000 })
        .then(() => true)
        .catch(() => false);
      if (roleDialogSeen) await roleDialogBtn.click();
    };

    await page
      .locator('input[name="email"], input[type="email"]')
      .first()
      .fill(email);
    await page
      .locator('input[name="password"], input[type="password"]')
      .first()
      .fill(password);
    await page.getByRole('button', { name: /sign in/i }).click();
    await pickAdminRoleIfPrompted();

    await page
      .waitForURL(/(dashboard|admin-dashboard|schools|educators)/i, {
        timeout: 50000,
      })
      .catch(() => {});

    // If still on login, the password may have been left changed — try the alternate
    if (/login|signin/i.test(page.url())) {
      await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
      await page
        .locator('input[name="email"], input[type="email"]')
        .first()
        .fill(email);
      await page
        .locator('input[name="password"], input[type="password"]')
        .first()
        .waitFor({ state: 'visible', timeout: 10000 });
      await page
        .locator('input[name="password"], input[type="password"]')
        .first()
        .fill(altPassword);
      await page.getByRole('button', { name: /sign in/i }).click();
      await pickAdminRoleIfPrompted();
      await page
        .waitForURL(/(dashboard|admin-dashboard|schools|educators)/i, {
          timeout: 50000,
        })
        .catch(() => {});
    }

    // Third attempt: brief pause then retry fixture password (transient network issue)
    if (/login|signin/i.test(page.url())) {
      await page.waitForTimeout(5000).catch(() => {});
      await page
        .goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' })
        .catch(() => {});
      await page
        .locator('input[name="email"], input[type="email"]')
        .first()
        .fill(email)
        .catch(() => {});
      await page
        .locator('input[name="password"], input[type="password"]')
        .first()
        .fill(password)
        .catch(() => {});
      await page
        .getByRole('button', { name: /sign in/i })
        .click()
        .catch(() => {});
      await pickAdminRoleIfPrompted();
      await page
        .waitForURL(/(dashboard|admin-dashboard|schools|educators)/i, {
          timeout: 50000,
        })
        .catch(() => {});
    }

    if (/login|signin/i.test(page.url())) {
      throw new Error(
        `Admin auth setup failed — still on login page: ${page.url()}`
      );
    }

    // Snapshot sessionStorage before it disappears with the context
    const sessionData = await page.evaluate((): Record<string, string> => {
      const out: Record<string, string> = {};
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k) out[k] = sessionStorage.getItem(k) ?? '';
      }
      return out;
    });

    fs.mkdirSync(path.dirname(ADMIN_AUTH_FILE), { recursive: true });
    await context.storageState({ path: ADMIN_AUTH_FILE });
    fs.writeFileSync(ADMIN_SESSION_FILE, JSON.stringify(sessionData, null, 2));
  } finally {
    await browser.close();
  }
}

export async function injectEducatorSessionStorage(page: Page): Promise<void> {
  if (!fs.existsSync(EDUCATOR_SESSION_FILE)) return;
  try {
    const data: Record<string, string> = JSON.parse(
      fs.readFileSync(EDUCATOR_SESSION_FILE, 'utf-8')
    );
    if (Object.keys(data).length === 0) return;
    await page.evaluate((entries: Record<string, string>) => {
      for (const [k, v] of Object.entries(entries))
        sessionStorage.setItem(k, v);
    }, data);
  } catch {
    // Silently skip if injection fails
  }
}

export async function setupEducatorAuth(): Promise<void> {
  if (!BASE_URL) return;

  const EDUCATOR_EMAIL = process.env.EDUCATOR_EMAIL ?? 'test@curionn.com';
  const FIXTURE_PASSWORD = process.env.EDUCATOR_PASSWORD ?? 'Test@123';
  const ALT_PASSWORD = 'Test@1234';

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Helper: attempt login with a given password and handle the dual-role popup
  const attemptLogin = async (password: string): Promise<boolean> => {
    await page
      .goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' })
      .catch(() => {});
    await page
      .locator('input[name="email"], input[type="email"]')
      .first()
      .waitFor({ state: 'visible', timeout: 30000 })
      .catch(() => {});
    await page
      .locator('input[name="email"], input[type="email"]')
      .first()
      .fill(EDUCATOR_EMAIL)
      .catch(() => {});
    await page
      .locator('input[name="password"], input[type="password"]')
      .first()
      .fill(password)
      .catch(() => {});
    await page
      .getByRole('button', { name: /sign in/i })
      .click()
      .catch(() => {});

    // Wait for the dual-role dialog or the dashboard, whichever comes first
    // (`isVisible` doesn't wait, so it missed a dialog that appeared late).
    const educatorBtn = page.getByRole('button', { name: 'Educator' });
    const first = await Promise.race([
      educatorBtn
        .waitFor({ state: 'visible', timeout: 25000 })
        .then(() => 'dialog' as const),
      page
        .waitForURL(/educator-dashboard/i, { timeout: 25000 })
        .then(() => 'app' as const),
    ]).catch(() => null);
    if (first === 'dialog') {
      await educatorBtn.click().catch(() => {});
    }

    await page
      .waitForURL(/educator-dashboard/i, { timeout: 25000 })
      .catch(() => {});
    return /educator-dashboard/i.test(page.url());
  };

  try {
    let success = await attemptLogin(FIXTURE_PASSWORD);
    if (!success) {
      success = await attemptLogin(ALT_PASSWORD);
    }

    if (!success) {
      throw new Error(`Educator auth setup failed — still on: ${page.url()}`);
    }

    const sessionData = await page.evaluate((): Record<string, string> => {
      const out: Record<string, string> = {};
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k) out[k] = sessionStorage.getItem(k) ?? '';
      }
      return out;
    });

    fs.mkdirSync(path.dirname(EDUCATOR_AUTH_FILE), { recursive: true });
    await context.storageState({ path: EDUCATOR_AUTH_FILE });
    fs.writeFileSync(
      EDUCATOR_SESSION_FILE,
      JSON.stringify(sessionData, null, 2)
    );
  } finally {
    await browser.close();
  }
}
