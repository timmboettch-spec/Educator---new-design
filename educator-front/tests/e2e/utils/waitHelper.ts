import { type Locator } from '@playwright/test';

export async function waitForDetach(
  locator: Locator,
  timeout = 10000
): Promise<void> {
  await locator.waitFor({ state: 'detached', timeout }).catch(() => {});
}

export async function waitForVisible(
  locator: Locator,
  timeout = 30000
): Promise<void> {
  await locator.waitFor({ state: 'visible', timeout });
}
