import { test, expect } from '@playwright/test';
import { LoginPage } from '../../pages/LoginPage';
import { educatorLogin } from '../../common/utils/loginHelpers';

test.describe('Educator Login Smoke', () => {
  test('Educator Login', async ({ page }) => {
    const login = new LoginPage(page);

    await login.goto();
    await educatorLogin(page);

    await expect(page).toHaveURL(/(dashboard|classes)/i);
    await page.waitForTimeout(2000);
  });
});
