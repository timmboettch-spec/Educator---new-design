import { Page } from '@playwright/test';
import { waitForDetach } from '../utils/waitHelper';

export async function logout(page: Page): Promise<void> {
  await waitForDetach(page.locator('div.bg-black/40.z-50'), 10000);

  const logoutButton = page.locator('button:has(img[alt="Logout"])');
  await logoutButton.waitFor({ state: 'visible', timeout: 15000 });
  await logoutButton.click();

  await page.getByRole('button', {
    name: 'Yes, Sign Out'
  }).click();

  await page.locator('input[name="email"]').waitFor({ state: 'visible', timeout: 30000 });
}
