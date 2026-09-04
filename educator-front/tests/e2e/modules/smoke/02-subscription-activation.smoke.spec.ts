import { test } from '@playwright/test';
import { LoginPage } from '../../pages/LoginPage';
import { AccountPage } from '../../pages/AccountPage';
import { adminLogin } from '../../common/utils/loginHelpers';

test.describe('Subscription Activation Smoke', () => {
  test('Activate Subscription', async ({ page }) => {
    const login = new LoginPage(page);
    const account = new AccountPage(page);

    await login.goto();
    await adminLogin(page);

    await account.activateSubscription();
  });
});
