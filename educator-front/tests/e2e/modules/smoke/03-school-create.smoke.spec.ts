import { test } from '@playwright/test';
import { LoginPage } from '../../pages/LoginPage';
import { SchoolPage } from '../../pages/SchoolPage';
import { adminLogin } from '../../common/utils/loginHelpers';

test.describe('School Creation Smoke', () => {
  test('School Creation', async ({ page }) => {
    const login = new LoginPage(page);
    const school = new SchoolPage(page);

    await login.goto();
    await adminLogin(page);
    await school.createSchoolPositive();
  });
});
