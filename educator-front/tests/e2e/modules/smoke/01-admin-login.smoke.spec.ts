import { test, expect } from '@playwright/test';
import { LoginPage } from '../../pages/LoginPage';
import { adminLogin } from '../../common/utils/loginHelpers';

test.describe('Admin Login Smoke', () => {
  test('Admin Login', async ({ page }) => {
    const login = new LoginPage(page);

    await login.goto();
    await adminLogin(page);

    await expect(page).toHaveURL(/dashboard/i);
  });
});
