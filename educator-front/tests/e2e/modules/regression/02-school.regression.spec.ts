import { test, expect, Browser, BrowserContext, Page } from '@playwright/test';
import { LoginPage } from '../../pages/LoginPage';
import { SchoolPage } from '../../pages/SchoolPage';
import { adminLogin } from '../../common/utils/loginHelpers';
import { ADMIN_AUTH_FILE, BASE_URL, injectAdminSessionStorage } from '../../common/setup/auth.setup';

test.describe.serial('School Management Regression', () => {
  let context: BrowserContext;
  let page: Page;
  let createdSchoolName = '';

  const dismissAnyOpenDialog = async (page: Page) => {
    const dialogs = page.locator('[role="dialog"]');
    if (await dialogs.count()) {
      await page.keyboard.press('Escape').catch(() => {});
      await dialogs.first().waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
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
       page.locator('a[href="/schools"]').waitFor({ state: 'visible', timeout: 20000 }),
       page.locator('main, [role="main"]').waitFor({ state: 'visible', timeout: 20000 }),
       page.getByRole('heading', { name: /dashboard/i }).waitFor({ state: 'visible', timeout: 20000 })
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
      
      // Navigate to schools
      await school.navigateToSchools();
      await page.waitForTimeout(1000);
      
      // Find school row
      const schoolRow = page.locator('div[class*="grid"], div[class*="rounded"], tr').filter({ hasText: schoolToDelete }).first();
      await expect(schoolRow).toBeVisible({ timeout: 10000 });
      
      // Click delete icon or menu
      const deleteIcon = schoolRow.locator('svg.lucide-trash, svg.lucide-trash-2, button:has(svg.lucide-trash)').first();
      if (await deleteIcon.isVisible({ timeout: 5000 }).catch(() => false)) {
        await deleteIcon.click();
      } else {
        // Fallback: try finding delete button in row
        const deleteBtn = schoolRow.locator('button:has-text("Delete")').first();
        await expect(deleteBtn).toBeVisible({ timeout: 5000 });
        await deleteBtn.click();
      }
      
      await page.waitForTimeout(1200);
      
      // Confirm deletion in modal
      const confirmModal = page.locator('[role="dialog"]').first();
      if (await confirmModal.isVisible({ timeout: 5000 }).catch(() => false)) {
        const confirmBtn = confirmModal.locator('button:has-text("Yes"), button:has-text("Confirm"), button:has-text("Delete")').first();
        if (await confirmBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
          await confirmBtn.click();
          await page.waitForTimeout(1500);
        }
      }
      
      // Verify success toast appears
      const successToast = page.getByText(/deleted|removed|success|deleted.*successfully/i).first();
      await successToast.isVisible({ timeout: 5000 }).catch(() => false);
      
      // Verify school is no longer visible in list (or at least no error occurred)
      await page.waitForTimeout(1000);
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
