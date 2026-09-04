import { test } from '@playwright/test';
import { LoginPage } from '../../pages/LoginPage';
import { EducatorPage } from '../../pages/EducatorPage';
import { adminLogin } from '../../common/utils/loginHelpers';

test.describe('Educator Creation Smoke', () => {
  test('Educator Creation', async ({ page }) => {
    const login = new LoginPage(page);
    const educator = new EducatorPage(page);

    await login.goto();
    await adminLogin(page);
    await educator.createEducatorPositive();
  });
});
