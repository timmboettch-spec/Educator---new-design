import { test } from '@playwright/test';
import { LoginPage } from '../../pages/LoginPage';
import { ClassPage } from '../../pages/ClassPage';
import { educatorLogin } from '../../common/utils/loginHelpers';

test.describe('Class Creation Smoke', () => {
  test('Class Creation', async ({ page }) => {
    test.setTimeout(180000);
    const login = new LoginPage(page);
    const classPage = new ClassPage(page);

    await login.goto();
    await educatorLogin(page);
    const className = await classPage.createClassPositive();
    await classPage.deleteClassByName(className);
  });
});
