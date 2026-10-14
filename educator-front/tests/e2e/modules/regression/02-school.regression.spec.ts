import {
  test,
  expect,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import { LoginPage } from '../../pages/LoginPage';
import { SchoolPage } from '../../pages/SchoolPage';
import { adminLogin } from '../../common/utils/loginHelpers';
import {
  ADMIN_AUTH_FILE,
  BASE_URL,
  injectAdminSessionStorage,
} from '../../common/setup/auth.setup';

test.describe.serial('School Management Regression', () => {
  let context: BrowserContext;
  let page: Page;
  let createdSchoolName = '';

  const dismissAnyOpenDialog = async (page: Page) => {
    const dialogs = page.locator('[role="dialog"]');
    if (await dialogs.count()) {
      await page.keyboard.press('Escape').catch(() => {});
      await dialogs
        .first()
        .waitFor({ state: 'hidden', timeout: 5000 })
        .catch(() => {});
    }
  };

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    context = await browser.newContext({ storageState: ADMIN_AUTH_FILE });
    page = await context.newPage();

    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded' });
    await injectAdminSessionStorage(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(2000);

    // Wait for app shell/dashboard UI to be interactive.
    await Promise.any([
      page
        .locator('a[href="/schools"]')
        .waitFor({ state: 'visible', timeout: 20000 }),
      page
        .locator('main, [role="main"]')
        .waitFor({ state: 'visible', timeout: 20000 }),
      page
        .getByRole('heading', { name: /dashboard/i })
        .waitFor({ state: 'visible', timeout: 20000 }),
    ]);

    await dismissAnyOpenDialog(page);
  });

  test.afterAll(async () => {
    await context.close();
  });

  test('Negative - Should show validation when school name is empty', async () => {
    const school = new SchoolPage(page);
    await school.navigateToSchools();
    await school.submitCreateSchoolEmptyName();
    await school.closeSchoolFormIfOpen();
  });

  test('Positive - Should create a school successfully', async () => {
    const school = new SchoolPage(page);
    await school.navigateToSchools();

    createdSchoolName = await school.createSchool(`School-${Date.now()}`);
    await school.assertSchoolVisible(createdSchoolName);

    await expect(page).not.toHaveURL(/error/i);
  });

  test('Positive - Should view a created school successfully', async () => {
    const school = new SchoolPage(page);
    await school.navigateToSchools();
    await school.viewSchool(createdSchoolName);
    await school.assertSchoolVisible(createdSchoolName);

    await expect(page).not.toHaveURL(/error/i);
  });

  test('Negative - Should show validation when updating school with empty name', async () => {
    const school = new SchoolPage(page);
    await school.navigateToSchools();
    await school.openSchoolEdit(createdSchoolName);
    await school.submitSchoolEditEmptyName();
    await school.closeSchoolFormIfOpen();

    await expect(page).not.toHaveURL(/error/i);
  });

  test('Positive - Should update school successfully with valid name', async () => {
    const school = new SchoolPage(page);
    await school.navigateToSchools();
    const updatedName = `${createdSchoolName}-Updated`;
    await school.updateSchoolName(createdSchoolName, updatedName);
    await school.assertSchoolVisible(updatedName);
    createdSchoolName = updatedName;

    await expect(page).not.toHaveURL(/error/i);
  });

  test('Positive - Should keep updated school visible after reopening school page', async () => {
    const school = new SchoolPage(page);
    await school.navigateToSchools();
    await school.assertSchoolVisible(createdSchoolName);
    await expect(page).toHaveURL(/school/i);
    await expect(page).not.toHaveURL(/error/i);
  });

  test('Positive - Should open schools page reliably from authenticated session', async () => {
    const school = new SchoolPage(page);
    await school.navigateToSchools();

    // Concurrent admin logins in parallel workers can invalidate this session.
    // Re-authenticate and retry once if the reload redirected us to login.
    if (/login|signin/i.test(page.url())) {
      const login = new LoginPage(page);
      await login.goto();
      await adminLogin(page);
      await page.waitForLoadState('networkidle').catch(() => {});
      await school.navigateToSchools();
    }

    await expect(page).toHaveURL(/school/i);
    await expect(page).not.toHaveURL(/error/i);
  });

  // ==================== DELETE OPERATIONS ====================

  test.describe('Positive - Delete School Operations', () => {
    test('Positive - Should delete school successfully after update', async () => {
      const school = new SchoolPage(page);

      // Use the already-updated school name from earlier tests (serial execution)
      // createdSchoolName has been updated by "Positive - Should update school successfully with valid name" test
      const schoolToDelete = createdSchoolName;

      if (!schoolToDelete) {
        // Skip if no school was created/updated in earlier tests
        await expect(page).not.toHaveURL(/error/i);
        return;
      }

      await school.navigateToSchools();
      // ListTable rows have no wrapper element, so a row-scoped locator would
      // match the whole grid and click the first school's trash icon. deleteSchool
      // resolves this school's own delete button and waits until it is gone.
      await school.deleteSchool(schoolToDelete);
      await expect(page).not.toHaveURL(/error/i);
    });
    // validate that the school is no longer visible in the list after deletion
    test('Positive - Should verify deleted school is no longer visible', async () => {
      const school = new SchoolPage(page);
      await school.navigateToSchools();
      await school.assertSchoolNotVisible(createdSchoolName);
      await expect(page).not.toHaveURL(/error/i);
    });
    // again create a school to ensure that the create functionality still works after deletion
    test('Positive - Should create a new school after deletion', async () => {
      const school = new SchoolPage(page);
      await school.navigateToSchools();
      createdSchoolName = await school.createSchool(`School-${Date.now()}`);
      await school.assertSchoolVisible(createdSchoolName);
      await expect(page).not.toHaveURL(/error/i);
    });
  });
});
